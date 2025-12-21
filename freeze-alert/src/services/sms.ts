import type { Env } from '../types';

/**
 * SMS sending error
 */
export class SMSError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly twilioErrorCode?: string
  ) {
    super(message);
    this.name = 'SMSError';
  }
}

/**
 * Send an SMS via Twilio API
 *
 * @throws {SMSError} If the SMS fails to send
 */
export async function sendSMS(
  to: string,
  body: string,
  env: Env
): Promise<void> {
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;

  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  const response = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: to,
      From: env.TWILIO_PHONE_NUMBER,
      Body: body,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const twilioError = errorData as { code?: number; message?: string };

    throw new SMSError(
      twilioError.message ?? `Twilio API error: ${response.status}`,
      response.status,
      twilioError.code?.toString()
    );
  }
}

/**
 * Send freeze alert SMS
 */
export async function sendFreezeAlert(
  phone: string,
  zipCode: string,
  overnightLow: number,
  env: Env
): Promise<void> {
  const message = `🥶 FREEZE ALERT: Low of ${overnightLow}°F tonight in ${zipCode}. Drip your faucets!`;
  await sendSMS(phone, message, env);
}

/**
 * Send payment link SMS
 */
export async function sendPaymentLink(
  phone: string,
  zipCode: string,
  checkoutUrl: string,
  env: Env
): Promise<void> {
  const message = `Freeze Alert for ${zipCode} costs $12/year.\nPay here to activate: ${checkoutUrl}\nLink expires in 24h.`;
  await sendSMS(phone, message, env);
}

/**
 * Send activation confirmation SMS
 */
export async function sendActivationConfirmation(
  phone: string,
  zipCode: string,
  env: Env
): Promise<void> {
  const message = `✓ Freeze Alert active for ${zipCode}!\nYou'll get texts at 8pm when temps drop below 28°F.\n$12/year, auto-renews. Reply STOP to cancel.`;
  await sendSMS(phone, message, env);
}

