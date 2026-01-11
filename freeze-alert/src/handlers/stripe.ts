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
  console.log('=== CHECKOUT COMPLETED HANDLER START ===');
  console.log('Session ID:', session.id);
  console.log('Raw metadata:', JSON.stringify(session.metadata, null, 2));

  const { phone, zip_code: zipCode, timezone } = session.metadata;
  console.log('Extracted values:', { phone, zipCode, timezone });

  if (!phone || !zipCode || !timezone) {
    console.error('❌ Missing metadata in checkout session:', session.id);
    console.error('   phone:', phone);
    console.error('   zipCode:', zipCode);
    console.error('   timezone:', timezone);
    return;
  }
  console.log('✓ Metadata validated');

  if (!session.customer || !session.subscription) {
    console.error('❌ Missing customer or subscription:', {
      customer: session.customer,
      subscription: session.subscription
    });
    return;
  }
  console.log('✓ Customer and subscription present');

  // Fetch subscription details from Stripe to get current_period_end
  console.log('Fetching subscription from Stripe...');
  const subscriptionResponse = await fetch(
    `https://api.stripe.com/v1/subscriptions/${session.subscription}`,
    {
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      },
    }
  );

  if (!subscriptionResponse.ok) {
    console.error('❌ Failed to fetch subscription from Stripe');
    console.error('   Status:', subscriptionResponse.status);
    console.error('   Subscription ID:', session.subscription);
    const errorBody = await subscriptionResponse.text().catch(() => '');
    console.error('   Error:', errorBody);
    return;
  }
  console.log('✓ Subscription fetched from Stripe');

  const subscription = await subscriptionResponse.json() as StripeSubscription;
  console.log('   Current period end:', subscription.current_period_end);

  // Handle case where current_period_end might be null (e.g., trial subscriptions)
  // Default to 1 year from now if not available
  const currentPeriodEnd = subscription.current_period_end ?? Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
  console.log('   Using period end:', currentPeriodEnd);

  // Create subscription record in D1
  console.log('Creating subscription in D1...');
  try {
    await createSubscription(
      phone,
      zipCode,
      timezone,
      session.customer,
      session.subscription,
      currentPeriodEnd,
      env
    );
    console.log('✓ Subscription created in D1');
  } catch (err) {
    console.error('❌ Failed to create subscription in D1');
    if (err instanceof DBError) {
      console.error('   DBError:', err.message);
      console.error('   Stack:', err.stack);
      return;
    }
    console.error('   Unexpected error:', err);
    throw err;
  }

  // Send activation confirmation SMS
  console.log('Sending activation confirmation SMS...');
  console.log('   To:', phone);
  console.log('   Zip:', zipCode);
  try {
    await sendActivationConfirmation(phone, zipCode, env);
    console.log('✓ Activation SMS sent successfully');
  } catch (err) {
    console.error('❌ Failed to send activation confirmation SMS');
    if (err instanceof SMSError) {
      console.error('   SMSError:', err.message);
      console.error('   Status code:', err.statusCode);
      console.error('   Twilio error code:', err.twilioErrorCode);
    } else {
      console.error('   Unexpected error:', err);
    }
    // Subscription is active, SMS failure is acceptable for Phase 1
  }

  console.log('=== CHECKOUT COMPLETED HANDLER END ===');
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

