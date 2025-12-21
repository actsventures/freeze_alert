import type { Env, TwilioIncomingSMS } from '../types';
import { validatePhone, extractZipFromMessage, ValidationError } from '../lib/validation';
import { getTimezoneForZip, TimezoneError } from '../lib/timezones';
import { subscriptionExists } from '../lib/db';
import { createCheckoutSession, PaymentError } from '../services/payments';
import { sendPaymentLink, sendSMS, SMSError } from '../services/sms';

/**
 * Twilio signature verification error
 */
export class TwilioSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwilioSignatureError';
  }
}

/**
 * Verify Twilio webhook signature using HMAC-SHA1
 *
 * Twilio signs webhooks by:
 * 1. Taking the full request URL
 * 2. Sorting POST parameters alphabetically
 * 3. Appending each param name+value to the URL
 * 4. Computing HMAC-SHA1 with auth token as key
 * 5. Base64 encoding the result
 *
 * @param signature - X-Twilio-Signature header value
 * @param url - Full request URL (including scheme, host, path)
 * @param params - POST body parameters as key-value pairs
 * @param authToken - Twilio Auth Token
 * @throws {TwilioSignatureError} If signature verification fails
 */
async function verifyTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>,
  authToken: string
): Promise<void> {
  // Build the string to sign: URL + sorted params
  const sortedKeys = Object.keys(params).sort();
  let dataToSign = url;
  for (const key of sortedKeys) {
    dataToSign += key + params[key];
  }

  // Compute HMAC-SHA1
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(dataToSign)
  );

  // Base64 encode the signature
  const computedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signatureBuffer))
  );

  // Constant-time comparison to prevent timing attacks
  const expectedBytes = encoder.encode(signature);
  const computedBytes = encoder.encode(computedSignature);

  let mismatch = expectedBytes.length ^ computedBytes.length;
  const minLength = Math.min(expectedBytes.length, computedBytes.length);
  for (let i = 0; i < minLength; i++) {
    mismatch |= expectedBytes[i] ^ computedBytes[i];
  }

  if (mismatch !== 0) {
    throw new TwilioSignatureError('Twilio signature verification failed');
  }
}

/**
 * Handle incoming SMS from Twilio webhook
 *
 * Flow:
 * 1. Parse incoming SMS (phone number + message body)
 * 2. Extract zip code from message body
 * 3. Validate zip code format
 * 4. Look up timezone for zip code
 * 5. Check if subscription already exists
 * 6. Create Stripe checkout session
 * 7. Reply with payment link
 */
export async function handleTwilioWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // Get the signature header - required for all requests
    const signature = request.headers.get('X-Twilio-Signature');

    if (!signature) {
      console.warn('Missing X-Twilio-Signature header');
      return new Response('Missing signature', { status: 401 });
    }

    // Clone request to read body twice (once for signature, once for parsing)
    const bodyText = await request.text();

    // Parse form-urlencoded body
    const formData = new URLSearchParams(bodyText);

    // Convert to params object for signature verification
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = value;
    }

    // Get the full request URL for signature verification
    const requestUrl = request.url;

    // Verify Twilio signature using HMAC-SHA1
    try {
      await verifyTwilioSignature(signature, requestUrl, params, env.TWILIO_AUTH_TOKEN);
    } catch (err) {
      if (err instanceof TwilioSignatureError) {
        console.warn('Twilio signature verification failed');
        return new Response('Invalid signature', { status: 401 });
      }
      throw err;
    }

    const incomingSMS: TwilioIncomingSMS = {
      From: params['From'] ?? '',
      To: params['To'] ?? '',
      Body: params['Body'] ?? '',
      MessageSid: params['MessageSid'] ?? '',
    };

    // Validate required fields
    if (!incomingSMS.From || !incomingSMS.Body) {
      return new Response('Bad request: missing From or Body', { status: 400 });
    }

    // Step 1: Validate and normalize phone number
    let phone: string;
    try {
      phone = validatePhone(incomingSMS.From);
    } catch (err) {
      if (err instanceof ValidationError) {
        await sendSMS(
          incomingSMS.From,
          'Invalid phone number. Please text from a valid US number.',
          env
        ).catch(() => {}); // Ignore SMS send errors in error handling
        return new Response('', { status: 200 });
      }
      throw err;
    }

    // Step 2: Extract zip code from message body
    let zipCode: string;
    try {
      zipCode = extractZipFromMessage(incomingSMS.Body);
    } catch (err) {
      if (err instanceof ValidationError) {
        await sendSMS(
          phone,
          'Could not find a zip code. Reply with your 5-digit zip code (e.g., 78701).',
          env
        ).catch(() => {});
        return new Response('', { status: 200 });
      }
      throw err;
    }

    // Step 3: Look up timezone for zip code
    let timezone: string;
    try {
      timezone = getTimezoneForZip(zipCode);
    } catch (err) {
      if (err instanceof TimezoneError) {
        await sendSMS(
          phone,
          `Zip code ${zipCode} is not supported. Please use a valid US zip code.`,
          env
        ).catch(() => {});
        return new Response('', { status: 200 });
      }
      throw err;
    }

    // Step 4: Check if subscription already exists
    const exists = await subscriptionExists(phone, zipCode, env);
    if (exists) {
      await sendSMS(
        phone,
        `You're already subscribed to freeze alerts for ${zipCode}. You'll receive alerts at 8pm when temps drop below 28°F.`,
        env
      ).catch(() => {});
      return new Response('', { status: 200 });
    }

    // Step 5: Create Stripe checkout session
    let checkoutUrl: string;
    try {
      checkoutUrl = await createCheckoutSession(phone, zipCode, timezone, env);
    } catch (err) {
      if (err instanceof PaymentError) {
        console.error('Stripe checkout session creation failed:', err);
        await sendSMS(
          phone,
          'Sorry, we couldn\'t create a payment link right now. Please try again in a few minutes.',
          env
        ).catch(() => {});
        return new Response('', { status: 200 });
      }
      throw err;
    }

    // Step 6: Send payment link via SMS
    try {
      await sendPaymentLink(phone, zipCode, checkoutUrl, env);
    } catch (err) {
      if (err instanceof SMSError) {
        console.error('Failed to send payment link SMS:', err);
        // Don't return error to Twilio - payment link was created successfully
        // User can retry by texting again
        // Return success since checkout URL was created (SMS failure is non-fatal)
        return new Response('', { status: 200 });
      }
      // Re-throw non-SMS errors for outer catch handler
      throw err;
    }

    // Twilio expects TwiML response or empty 200
    // Empty response = don't send any reply (we'll reply via API)
    return new Response('', { status: 200 });
  } catch (err) {
    console.error('Unexpected error in Twilio webhook handler:', err);
    // Return 200 to Twilio to avoid retries for unexpected errors
    // Log error for manual investigation
    return new Response('', { status: 200 });
  }
}

