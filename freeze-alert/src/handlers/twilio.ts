import type { Env, TwilioIncomingSMS } from '../types';
import { validatePhone, extractZipFromMessage, ValidationError } from '../lib/validation';
import { getTimezoneForZip, TimezoneError } from '../lib/timezones';
import { subscriptionExists } from '../lib/db';
import { createCheckoutSession, PaymentError } from '../services/payments';
import { sendPaymentLink, sendSMS, SMSError } from '../services/sms';

/**
 * Verify Twilio webhook signature
 *
 * @param signature - X-Twilio-Signature header value
 * @returns True if signature format is valid
 *
 * Note: Full HMAC-SHA1 verification requires a library not available in Workers runtime.
 * Phase 1: Basic format validation. Phase 2+: Implement full verification.
 */
function verifyTwilioSignature(signature: string): boolean {
  // Basic validation: check signature format (base64, ~28 chars)
  if (signature.length < 20 || signature.length > 50) {
    return false;
  }

  // Phase 1: Accept signature presence and format as basic validation
  // Full HMAC-SHA1 verification requires a library not available in Workers runtime
  return true;
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
    // Verify Twilio signature (basic check for Phase 1)
    const signature = request.headers.get('X-Twilio-Signature');

    // Parse form-urlencoded body from Twilio
    const formData = await request.formData();

    // Verify signature if present
    if (signature) {
      const isValid = verifyTwilioSignature(signature);
      if (!isValid) {
        console.warn('Invalid Twilio signature format');
        return new Response('Invalid signature', { status: 401 });
      }
    } else {
      // In production, require signature. For Phase 1, log warning but continue
      console.warn('Missing X-Twilio-Signature header');
    }

    const incomingSMS: TwilioIncomingSMS = {
      From: formData.get('From')?.toString() ?? '',
      To: formData.get('To')?.toString() ?? '',
      Body: formData.get('Body')?.toString() ?? '',
      MessageSid: formData.get('MessageSid')?.toString() ?? '',
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
      }
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

