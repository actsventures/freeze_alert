import type { Env } from '../types';
import { verifyStripeSignature, PaymentError } from '../services/payments';
import { createSubscription, getSubscriptionByStripeId, updateSubscriptionStatus, DBError } from '../lib/db';
import { sendActivationConfirmation, SMSError } from '../services/sms';

/**
 * Stripe webhook event types we care about
 */
const RELEVANT_EVENTS = [
  'checkout.session.completed',    // User completed payment
  'customer.subscription.deleted', // Subscription cancelled
  'invoice.payment_failed',        // Payment failed (for renewals)
] as const;

type RelevantEvent = typeof RELEVANT_EVENTS[number];

/**
 * Stripe checkout session object (from webhook)
 */
interface StripeCheckoutSession {
  id: string;
  customer: string | null;
  subscription: string | null;
  metadata: {
    phone?: string;
    zip_code?: string;
    timezone?: string;
  };
}

/**
 * Stripe subscription object (from webhook)
 */
interface StripeSubscription {
  id: string;
  customer: string;
  current_period_end: number;
  status: string;
  metadata: {
    phone?: string;
    zip_code?: string;
    timezone?: string;
  };
}

/**
 * Stripe invoice object (from webhook)
 */
interface StripeInvoice {
  subscription: string | null;
  customer: string;
}

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutCompleted(
  session: StripeCheckoutSession,
  env: Env
): Promise<void> {
  const { phone, zip_code: zipCode, timezone } = session.metadata;

  if (!phone || !zipCode || !timezone) {
    console.error('Missing metadata in checkout session:', session.id);
    return;
  }

  if (!session.customer || !session.subscription) {
    console.error('Missing customer or subscription in checkout session:', session.id);
    return;
  }

  // Fetch subscription details from Stripe to get current_period_end
  const subscriptionResponse = await fetch(
    `https://api.stripe.com/v1/subscriptions/${session.subscription}`,
    {
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      },
    }
  );

  if (!subscriptionResponse.ok) {
    console.error('Failed to fetch subscription from Stripe:', session.subscription);
    return;
  }

  const subscription = await subscriptionResponse.json() as StripeSubscription;

  // Create subscription record in D1
  try {
    await createSubscription(
      phone,
      zipCode,
      timezone,
      session.customer,
      session.subscription,
      subscription.current_period_end,
      env
    );
  } catch (err) {
    if (err instanceof DBError) {
      console.error('Failed to create subscription in D1:', err);
      // Don't throw - subscription was created in Stripe, we'll retry manually if needed
      return;
    }
    throw err;
  }

  // Send activation confirmation SMS
  try {
    await sendActivationConfirmation(phone, zipCode, env);
  } catch (err) {
    if (err instanceof SMSError) {
      console.error('Failed to send activation confirmation SMS:', err);
      // Subscription is active, SMS failure is acceptable for Phase 1
    }
  }
}

/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionDeleted(
  subscription: StripeSubscription,
  env: Env
): Promise<void> {
  // Find subscription by stripe_subscription_id
  const dbSubscription = await getSubscriptionByStripeId(subscription.id, env);

  if (!dbSubscription) {
    console.warn('Subscription not found in D1:', subscription.id);
    return;
  }

  // Mark as cancelled in D1
  try {
    await updateSubscriptionStatus(dbSubscription.id, 'cancelled', env);
  } catch (err) {
    if (err instanceof DBError) {
      console.error('Failed to update subscription status:', err);
      throw err;
    }
    throw err;
  }
}

/**
 * Handle invoice.payment_failed event
 * Phase 1: Just log it for manual follow-up
 */
async function handlePaymentFailed(
  invoice: StripeInvoice,
  _env: Env
): Promise<void> {
  console.warn('Payment failed for subscription:', invoice.subscription);
  // Phase 1: Accept ~1% failure rate, log for manual follow-up
  // Phase 2+: Could send SMS notification or mark subscription for retry
}

/**
 * Handle Stripe webhook events
 *
 * Events we handle:
 * - checkout.session.completed: Create/activate subscription in D1
 * - customer.subscription.deleted: Mark subscription as cancelled
 * - invoice.payment_failed: Handle failed renewal payments
 */
export async function handleStripeWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  // Get the raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  // Verify webhook signature
  let event: { type: string; data: { object: unknown } };
  try {
    event = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET) as {
      type: string;
      data: { object: unknown };
    };
  } catch (err) {
    if (err instanceof PaymentError) {
      console.error('Stripe signature verification failed:', err);
      return new Response('Invalid signature', { status: 401 });
    }
    throw err;
  }

  const eventType = event.type as RelevantEvent;

  // Ignore events we don't care about
  if (!RELEVANT_EVENTS.includes(eventType)) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('Processing Stripe event:', eventType);

  // Handle event
  try {
    switch (eventType) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as StripeCheckoutSession, env);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as StripeSubscription, env);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as StripeInvoice, env);
        break;
    }
  } catch (err) {
    console.error(`Error processing Stripe event ${eventType}:`, err);
    // Return 500 to trigger Stripe retry
    return new Response(JSON.stringify({ error: 'Processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

