import { handleTwilioWebhook } from './handlers/twilio';
import { handleStripeWebhook } from './handlers/stripe';
import type { Env, JSONResponse } from './types';
import { FREEZE_THRESHOLD_F, ALERT_HOUR } from './types';
import { findTimezonesAtHour } from './lib/timezones';
import { getActiveSubscriptionsForTimezones } from './lib/db';
import { fetchNWSForecast, WeatherError } from './services/weather';
import { sendFreezeAlert } from './services/sms';

/**
 * Create a JSON response with proper headers
 */
function jsonResponse(data: JSONResponse, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create an error response
 */
function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ success: false, error: message }, status);
}

/**
 * Route incoming HTTP requests
 */
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  // Health check endpoint
  if (pathname === '/health' && method === 'GET') {
    return jsonResponse({ success: true, data: { status: 'ok' } });
  }

  // Twilio webhook - incoming SMS
  if (pathname === '/webhook/twilio' && method === 'POST') {
    return handleTwilioWebhook(request, env);
  }

  // Stripe webhook - payment events
  if (pathname === '/webhook/stripe' && method === 'POST') {
    return handleStripeWebhook(request, env);
  }

  // 404 for unknown routes
  return errorResponse('Not found', 404);
}

/**
 * Group subscriptions by zip code to minimize weather API calls
 */
function groupByZip(
  subscriptions: Array<{ phone: string; zip_code: string }>
): Map<string, string[]> {
  const zipToPhones = new Map<string, string[]>();

  for (const sub of subscriptions) {
    const phones = zipToPhones.get(sub.zip_code) ?? [];
    phones.push(sub.phone);
    zipToPhones.set(sub.zip_code, phones);
  }

  return zipToPhones;
}

/**
 * Cron handler - runs every hour to send freeze alerts
 * Checks for timezones where it's currently 8pm and sends alerts if needed
 */
async function handleScheduled(
  _controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  try {
    // Step 1: Find timezones where it's currently 8pm
    const now = new Date();
    const targetTimezones = findTimezonesAtHour(now, ALERT_HOUR);

    if (targetTimezones.length === 0) {
      console.log('No timezones at 8pm right now');
      return;
    }

    console.log(`Found ${targetTimezones.length} timezone(s) at 8pm:`, targetTimezones);

    // Step 2: Get active subscriptions in those timezones
    const subscriptions = await getActiveSubscriptionsForTimezones(targetTimezones, env);

    if (subscriptions.length === 0) {
      console.log('No active subscriptions in target timezones');
      return;
    }

    console.log(`Found ${subscriptions.length} active subscription(s)`);

    // Step 3: Group by zip code to minimize weather API calls
    const zipToPhones = groupByZip(subscriptions);
    const uniqueZips = Array.from(zipToPhones.keys());

    console.log(`Processing ${uniqueZips.length} unique zip code(s)`);

    // Step 4 & 5: Fetch weather and send alerts in parallel batches
    // Process in batches to avoid overwhelming the Worker CPU
    const batchSize = 10;
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < uniqueZips.length; i += batchSize) {
      const batch = uniqueZips.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (zipCode) => {
          try {
            // Fetch weather forecast
            const forecast = await fetchNWSForecast(zipCode);

            // Check if we need to send alerts
            if (forecast.overnightLow <= FREEZE_THRESHOLD_F) {
              const phones = zipToPhones.get(zipCode) ?? [];
              console.log(
                `Freeze alert needed for ${zipCode}: ${forecast.overnightLow}°F (${phones.length} subscriber(s))`
              );

              // Send alerts to all phones for this zip
              const smsResults = await Promise.allSettled(
                phones.map((phone) =>
                  sendFreezeAlert(phone, zipCode, forecast.overnightLow, env)
                )
              );

              const smsSent = smsResults.filter((r) => r.status === 'fulfilled').length;
              const smsFailed = smsResults.filter((r) => r.status === 'rejected').length;

              sentCount += smsSent;
              failedCount += smsFailed;

              if (smsFailed > 0) {
                console.warn(`Failed to send ${smsFailed} alert(s) for ${zipCode}`);
              }
            } else {
              console.log(
                `No alert needed for ${zipCode}: ${forecast.overnightLow}°F (above ${FREEZE_THRESHOLD_F}°F)`
              );
            }
          } catch (err) {
            if (err instanceof WeatherError) {
              console.error(`Weather fetch failed for ${zipCode}:`, err.message);
              failedCount += zipToPhones.get(zipCode)?.length ?? 0;
            } else {
              console.error(`Unexpected error processing ${zipCode}:`, err);
              failedCount += zipToPhones.get(zipCode)?.length ?? 0;
            }
          }
        })
      );
    }

    console.log(`Cron completed: ${sentCount} alert(s) sent, ${failedCount} failure(s)`);
  } catch (err) {
    console.error('Unexpected error in cron handler:', err);
    // Don't throw - cron failures are logged but don't crash the worker
  }
}

/**
 * Cloudflare Worker exports
 */
export default {
  fetch: handleRequest,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;

