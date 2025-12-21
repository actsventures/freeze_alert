import type { Env } from '../types';

/**
 * Payment error
 */
export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

/**
 * Stripe checkout session response
 */
interface StripeCheckoutSession {
  id: string;
  url: string;
}

/**
 * Create a Stripe Checkout Session for a new subscription
 *
 * @param phone - Customer phone number (for metadata)
 * @param zipCode - Zip code for alerts (for metadata)
 * @param timezone - Timezone for the zip code (for metadata)
 * @param env - Worker environment
 * @returns Checkout session URL
 *
 * @throws {PaymentError} If session creation fails
 */
export async function createCheckoutSession(
  phone: string,
  zipCode: string,
  timezone: string,
  env: Env
): Promise<string> {
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'mode': 'subscription',
      'line_items[0][price]': env.STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      // Store phone, zip, and timezone in metadata for webhook processing
      'metadata[phone]': phone,
      'metadata[zip_code]': zipCode,
      'metadata[timezone]': timezone,
      // Subscription metadata (propagates to the subscription object)
      'subscription_data[metadata][phone]': phone,
      'subscription_data[metadata][zip_code]': zipCode,
      'subscription_data[metadata][timezone]': timezone,
      // No success/cancel URLs since this is SMS-based
      // User will receive confirmation via SMS
      'success_url': 'https://freeze-alert.com/success',
      'cancel_url': 'https://freeze-alert.com/cancelled',
      // Session expires in 24 hours
      'expires_at': String(Math.floor(Date.now() / 1000) + 86400),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const stripeError = errorData as { error?: { message?: string } };

    throw new PaymentError(
      stripeError.error?.message ?? `Stripe API error: ${response.status}`,
      response.status
    );
  }

  const session = await response.json() as StripeCheckoutSession;

  if (!session.url) {
    throw new PaymentError('Stripe session created but no URL returned');
  }

  return session.url;
}

/**
 * Verify Stripe webhook signature
 *
 * @param payload - Raw webhook body
 * @param signature - Stripe-Signature header
 * @param secret - Webhook signing secret
 * @returns Verified event object
 *
 * @throws {PaymentError} If signature verification fails
 */
export async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<unknown> {
  // Parse the signature header
  // Stripe format: "t=1234567890,v1=abcdef..." (may have spaces after commas)
  const elements = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {} as Record<string, string>);

  const timestamp = elements['t'];
  const expectedSig = elements['v1'];

  if (!timestamp || !expectedSig) {
    throw new PaymentError('Invalid Stripe signature format');
  }

  // Check timestamp is within tolerance (5 minutes)
  const timestampAge = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (timestampAge > 300) {
    throw new PaymentError('Stripe signature timestamp too old');
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  );

  const computedSig = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toLowerCase();

  // Normalize expected signature to lowercase for case-insensitive comparison
  const normalizedExpectedSig = expectedSig.toLowerCase();

  // Constant-time comparison
  // Include length difference in mismatch to prevent timing attacks
  let mismatch = computedSig.length ^ normalizedExpectedSig.length;

  // Compare characters up to the minimum length
  const minLength = Math.min(computedSig.length, normalizedExpectedSig.length);
  for (let i = 0; i < minLength; i++) {
    mismatch |= computedSig.charCodeAt(i) ^ normalizedExpectedSig.charCodeAt(i);
  }

  if (mismatch !== 0) {
    throw new PaymentError('Stripe signature verification failed');
  }

  return JSON.parse(payload);
}

