/**
 * Cloudflare Worker environment bindings
 */
export interface Env {
  // D1 Database binding
  DB: D1Database;

  // Twilio credentials
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;

  // Stripe credentials
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID: string;
  STRIPE_PROMO_CODE?: string;  // Optional: Auto-apply promo code (e.g., promo_1ShiZKKFH1n1oVyf)

  // Alert notifications
  ALERT_EMAIL: string;
}

/**
 * Subscription status values
 */
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
} as const;

export type SubscriptionStatus = typeof SUBSCRIPTION_STATUS[keyof typeof SUBSCRIPTION_STATUS];

/**
 * Database subscription row
 */
export interface Subscription {
  id: string;
  phone: string;
  zip_code: string;
  timezone: string;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: number | null;
  created_at: number;
}

/**
 * Twilio incoming SMS webhook payload (form-urlencoded)
 */
export interface TwilioIncomingSMS {
  From: string;        // Phone number in E.164 format (+1234567890)
  To: string;          // Your Twilio number
  Body: string;        // SMS message content
  MessageSid: string;  // Unique message identifier
}

/**
 * NWS API forecast response (simplified)
 */
export interface NWSForecast {
  overnightLow: number;  // Temperature in Fahrenheit
}

/**
 * HTTP response helpers
 */
export interface JSONResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Alert threshold in Fahrenheit
 */
export const FREEZE_THRESHOLD_F = 28 as const;

/**
 * Alert send time (24-hour format)
 */
export const ALERT_HOUR = 20 as const; // 8pm local time

