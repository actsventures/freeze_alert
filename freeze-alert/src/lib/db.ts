import type { Env, Subscription, SubscriptionStatus } from '../types';

/**
 * Database query error
 */
export class DBError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DBError';
  }
}

/**
 * Create a new subscription record
 */
export async function createSubscription(
  phone: string,
  zipCode: string,
  timezone: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  currentPeriodEnd: number,
  env: Env
): Promise<void> {
  const result = await env.DB.prepare(`
    INSERT INTO subscriptions (
      phone, zip_code, timezone, status,
      stripe_customer_id, stripe_subscription_id, current_period_end
    ) VALUES (?, ?, ?, 'active', ?, ?, ?)
  `)
    .bind(phone, zipCode, timezone, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd)
    .run();

  if (!result.success) {
    throw new DBError('Failed to create subscription');
  }
}

/**
 * Get a subscription by phone and zip code
 */
export async function getSubscription(
  phone: string,
  zipCode: string,
  env: Env
): Promise<Subscription | null> {
  const result = await env.DB.prepare(`
    SELECT * FROM subscriptions WHERE phone = ? AND zip_code = ?
  `)
    .bind(phone, zipCode)
    .first<Subscription>();

  return result;
}

/**
 * Get subscription by Stripe subscription ID
 */
export async function getSubscriptionByStripeId(
  stripeSubscriptionId: string,
  env: Env
): Promise<Subscription | null> {
  const result = await env.DB.prepare(`
    SELECT * FROM subscriptions WHERE stripe_subscription_id = ?
  `)
    .bind(stripeSubscriptionId)
    .first<Subscription>();

  return result;
}

/**
 * Update subscription status
 */
export async function updateSubscriptionStatus(
  id: string,
  status: SubscriptionStatus,
  env: Env
): Promise<void> {
  const result = await env.DB.prepare(`
    UPDATE subscriptions SET status = ? WHERE id = ?
  `)
    .bind(status, id)
    .run();

  if (!result.success) {
    throw new DBError('Failed to update subscription status');
  }
}

/**
 * Get all active subscriptions for timezones where it's currently 8pm
 */
export async function getActiveSubscriptionsForTimezones(
  timezones: string[],
  env: Env
): Promise<Array<{ phone: string; zip_code: string }>> {
  if (timezones.length === 0) return [];

  const placeholders = timezones.map(() => '?').join(',');
  const query = `
    SELECT DISTINCT phone, zip_code
    FROM subscriptions
    WHERE timezone IN (${placeholders})
    AND status = 'active'
  `;

  const result = await env.DB.prepare(query)
    .bind(...timezones)
    .all<{ phone: string; zip_code: string }>();

  return result.results;
}

/**
 * Check if a subscription already exists for phone + zip combo
 */
export async function subscriptionExists(
  phone: string,
  zipCode: string,
  env: Env
): Promise<boolean> {
  const result = await env.DB.prepare(`
    SELECT 1 FROM subscriptions WHERE phone = ? AND zip_code = ? AND status = 'active'
  `)
    .bind(phone, zipCode)
    .first();

  return result !== null;
}

