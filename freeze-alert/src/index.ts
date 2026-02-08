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
 * Landing page HTML - serves as opt-in consent page for Twilio verification
 */
function getLandingPageHTML(twilioNumber: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Freeze Alert - Protect Your Pipes</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
      line-height: 1.6;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .hero {
      text-align: center;
      margin-bottom: 40px;
    }
    .hero h1 {
      font-size: 2.5rem;
      margin-bottom: 10px;
    }
    .hero .emoji {
      font-size: 4rem;
      margin-bottom: 20px;
    }
    .hero p {
      font-size: 1.2rem;
      color: #a0aec0;
    }
    .card {
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 30px;
      margin-bottom: 24px;
      backdrop-filter: blur(10px);
    }
    .card h2 {
      font-size: 1.3rem;
      margin-bottom: 16px;
      color: #63b3ed;
    }
    .price {
      text-align: center;
      padding: 20px;
      background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
      border-radius: 12px;
      margin: 20px 0;
    }
    .price .amount {
      font-size: 3rem;
      font-weight: bold;
      color: #48bb78;
    }
    .price .period {
      color: #a0aec0;
    }
    .steps {
      list-style: none;
      counter-reset: steps;
    }
    .steps li {
      counter-increment: steps;
      padding: 12px 0;
      padding-left: 50px;
      position: relative;
    }
    .steps li::before {
      content: counter(steps);
      position: absolute;
      left: 0;
      top: 12px;
      width: 32px;
      height: 32px;
      background: #4299e1;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
    .phone-number {
      font-size: 1.5rem;
      font-weight: bold;
      color: #48bb78;
      background: rgba(72, 187, 120, 0.1);
      padding: 16px;
      border-radius: 8px;
      text-align: center;
      margin: 16px 0;
      letter-spacing: 1px;
    }
    .consent-box {
      background: rgba(66, 153, 225, 0.1);
      border: 1px solid rgba(66, 153, 225, 0.3);
      border-radius: 8px;
      padding: 20px;
      margin-top: 20px;
    }
    .consent-box h3 {
      color: #63b3ed;
      margin-bottom: 12px;
      font-size: 1rem;
    }
    .consent-box p, .consent-box ul {
      font-size: 0.9rem;
      color: #cbd5e0;
    }
    .consent-box ul {
      margin: 12px 0;
      padding-left: 20px;
    }
    .consent-box li {
      margin: 8px 0;
    }
    footer {
      text-align: center;
      padding: 40px 20px;
      color: #718096;
      font-size: 0.85rem;
    }
    footer a {
      color: #63b3ed;
      text-decoration: none;
    }
    footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="hero">
      <div class="emoji">🥶</div>
      <h1>Freeze Alert</h1>
      <p>SMS alerts when temperatures drop below freezing</p>
    </div>

    <div class="card">
      <h2>Protect Your Pipes</h2>
      <p>Get a text message at 8pm whenever overnight temperatures in your area are forecast to drop below 28°F. Never forget to drip your faucets again.</p>
      <div class="price">
        <div class="amount">$12</div>
        <div class="period">per year</div>
      </div>
    </div>

    <div class="card">
      <h2>How to Subscribe</h2>
      <ol class="steps">
        <li>Text your <strong>5-digit zip code</strong> to our number below</li>
        <li>Receive a secure payment link via SMS</li>
        <li>Complete payment ($12/year)</li>
        <li>Get freeze alerts all winter long!</li>
      </ol>
      <div class="phone-number">${twilioNumber}</div>
    </div>

    <div class="card">
      <h2>What You Get</h2>
      <ul class="steps">
        <li>Nightly alerts at 8pm local time when freezing temps are forecast</li>
        <li>Accurate forecasts from the National Weather Service</li>
        <li>Coverage for any US zip code</li>
        <li>Cancel anytime by replying STOP</li>
      </ul>
    </div>

    <div class="consent-box">
      <h3>📱 SMS Terms & Consent</h3>
      <p>By texting your zip code to our number, you consent to receive:</p>
      <ul>
        <li>One payment link SMS to complete your subscription</li>
        <li>One confirmation SMS when your subscription is activated</li>
        <li>Freeze alert SMS messages when temperatures drop below 28°F (frequency varies by weather)</li>
      </ul>
      <p style="margin-top: 12px;">
        <strong>Message frequency:</strong> Typically 0-5 messages per month during winter, varies by location.<br>
        <strong>Message and data rates may apply.</strong><br>
        <strong>To opt-out:</strong> Reply STOP at any time to cancel alerts.<br>
        <strong>For help:</strong> Reply HELP or contact support@actscapital.com
      </p>
    </div>
  </div>

  <footer>
    <p>&copy; ${new Date().getFullYear()} Freeze Alert by Acts Capital</p>
    <p style="margin-top: 8px;">
      <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
    </p>
  </footer>
</body>
</html>`;
}

/**
 * Create an error response
 */
function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ success: false, error: message }, status);
}

/**
 * Privacy Policy HTML
 */
function getPrivacyPolicyHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Freeze Alert</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e2e8f0;
      line-height: 1.8;
      padding: 40px 20px;
    }
    .container { max-width: 700px; margin: 0 auto; }
    h1 { color: #63b3ed; margin-bottom: 24px; }
    h2 { color: #63b3ed; margin: 32px 0 16px; font-size: 1.3rem; }
    p, li { margin-bottom: 12px; color: #cbd5e0; }
    ul { padding-left: 24px; }
    a { color: #63b3ed; }
    .back { margin-bottom: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <p class="back"><a href="/">← Back to Home</a></p>
    <h1>Privacy Policy</h1>
    <p><strong>Last updated:</strong> January 2026</p>

    <h2>Information We Collect</h2>
    <p>When you subscribe to Freeze Alert, we collect:</p>
    <ul>
      <li><strong>Phone number:</strong> To send you freeze alerts via SMS</li>
      <li><strong>Zip code:</strong> To determine your location for weather forecasts</li>
      <li><strong>Payment information:</strong> Processed securely by Stripe; we do not store card details</li>
    </ul>

    <h2>How We Use Your Information</h2>
    <ul>
      <li>Send freeze alert SMS messages when temperatures drop below 28°F</li>
      <li>Send subscription confirmation and payment-related messages</li>
      <li>Process your annual subscription payment</li>
    </ul>

    <h2>Data Sharing</h2>
    <p>We do not sell your personal information. We share data only with:</p>
    <ul>
      <li><strong>Twilio:</strong> To deliver SMS messages</li>
      <li><strong>Stripe:</strong> To process payments</li>
      <li><strong>National Weather Service:</strong> We send your zip code to retrieve forecasts (no personal info)</li>
    </ul>

    <h2>Data Retention</h2>
    <p>We retain your information while your subscription is active. If you cancel (reply STOP), we mark your subscription as inactive but may retain records for legal/accounting purposes.</p>

    <h2>Your Rights</h2>
    <p>You can cancel your subscription at any time by replying STOP to any message. For data deletion requests, contact support@actscapital.com.</p>

    <h2>Contact</h2>
    <p>Questions? Email us at support@actscapital.com</p>
  </div>
</body>
</html>`;
}

/**
 * Terms of Service HTML
 */
function getTermsHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service - Freeze Alert</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e2e8f0;
      line-height: 1.8;
      padding: 40px 20px;
    }
    .container { max-width: 700px; margin: 0 auto; }
    h1 { color: #63b3ed; margin-bottom: 24px; }
    h2 { color: #63b3ed; margin: 32px 0 16px; font-size: 1.3rem; }
    p, li { margin-bottom: 12px; color: #cbd5e0; }
    ul { padding-left: 24px; }
    a { color: #63b3ed; }
    .back { margin-bottom: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <p class="back"><a href="/">← Back to Home</a></p>
    <h1>Terms of Service</h1>
    <p><strong>Last updated:</strong> January 2026</p>

    <h2>Service Description</h2>
    <p>Freeze Alert provides SMS notifications when overnight temperatures are forecast to drop below 28°F in your specified zip code. Alerts are sent at approximately 8pm local time.</p>

    <h2>Subscription & Billing</h2>
    <ul>
      <li>Subscriptions cost $12 per year and automatically renew</li>
      <li>Payment is processed securely via Stripe</li>
      <li>You may cancel at any time by replying STOP to any message</li>
      <li>Refunds are not provided for partial subscription periods</li>
    </ul>

    <h2>SMS Terms</h2>
    <ul>
      <li>By subscribing, you consent to receive automated SMS messages</li>
      <li>Message frequency varies based on weather conditions (typically 0-5 per month in winter)</li>
      <li>Message and data rates may apply based on your carrier plan</li>
      <li>Reply STOP to cancel, HELP for assistance</li>
    </ul>

    <h2>Disclaimer</h2>
    <p>Freeze Alert is provided "as-is" for informational purposes. We rely on National Weather Service data and cannot guarantee forecast accuracy. We are not liable for any damages resulting from frozen pipes or other weather-related incidents. Always use your own judgment regarding cold weather precautions.</p>

    <h2>Limitation of Liability</h2>
    <p>Our total liability is limited to the amount you paid for the service ($12/year). We are not responsible for missed alerts due to carrier issues, phone problems, or service outages.</p>

    <h2>Changes to Terms</h2>
    <p>We may update these terms. Continued use after changes constitutes acceptance.</p>

    <h2>Contact</h2>
    <p>Questions? Email us at support@actscapital.com</p>
  </div>
</body>
</html>`;
}

/**
 * Route incoming HTTP requests
 */
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  // Landing page
  if (pathname === '/' && method === 'GET') {
    return new Response(getLandingPageHTML(env.TWILIO_PHONE_NUMBER), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Privacy Policy
  if (pathname === '/privacy' && method === 'GET') {
    return new Response(getPrivacyPolicyHTML(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Terms of Service
  if (pathname === '/terms' && method === 'GET') {
    return new Response(getTermsHTML(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

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

