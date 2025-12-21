# Freeze Alert

SMS alerts when temperatures drop low enough to drip faucets. No app, no account, just texts.

## Problem

Homeowners forget to drip faucets before freezing nights. Burst pipes cost $5,000+ to repair. Weather apps require checking manually. Existing solutions are overbuilt.

## Solution

Text-based freeze alerts. $12/year per zip code, auto-renewing annually. Send alert at 8pm if overnight low ≤ 28°F.

---

# Phased Implementation

## Phase 0: Validation (Before Writing Code)

**Goal:** Confirm people will pay for this before building anything.

**Duration:** 1-2 weeks

### Actions

1. **Smoke test landing page**

   - Single page: headline, value prop, email capture
   - "Get notified when we launch" + zip code field
   - Deploy to Cloudflare Pages (free)
   - Track: How many emails collected?

2. **Direct outreach**

   - Post in 5-10 local Facebook groups / Nextdoor in freeze-prone areas
   - Message: "Would you pay $1/month to get a text before freezing nights reminding you to drip faucets?"
   - Track: Response rate, sentiment

3. **Manual MVP (optional, high-signal)**
   - Collect 10-20 phone numbers from interested people
   - Manually send them freeze alerts for 2-4 weeks using your personal phone
   - Ask: Would they pay $12/year for this?

### Success Criteria (Move to Phase 1)

- [ ] 50+ email signups OR
- [ ] 10+ people say "yes I'd pay" OR
- [ ] 5+ people complete manual MVP and confirm value

### Exit Criteria (Kill the project)

- [ ] <10 signups after 2 weeks of promotion
- [ ] Consistent feedback: "I just use my weather app"

---

## Phase 1: SMS-Only MVP

**Goal:** Working product with paying customers. Maximum simplicity.

**Duration:** 1-2 weeks to build, run through first winter

**Trigger:** Phase 0 success criteria met

### What's Included

- SMS signup only (no web form)
- Direct SMS sending (no queues)
- Single weather source (NWS)
- Basic error logging (console + email on failure)

### What's NOT Included

- Web signup form
- Message queues / DLQ
- Weather caching
- Fancy monitoring

### User Flow

```
User texts "78701" to (512) 555-1234
    ↓
System validates zip → looks up timezone
    ↓
System replies: "Freeze Alert for 78701 costs $12/year.
                 Pay here to activate: https://checkout.stripe.com/xxx
                 Link expires in 24h."
    ↓
User clicks link → Stripe Checkout → pays $12
    ↓
Stripe webhook → creates subscription in D1
    ↓
System texts: "✓ Freeze Alert active for 78701!
              You'll get texts at 8pm when temps drop below 28°F.
              $12/year, auto-renews. Reply STOP to cancel."
```

### Tech Stack (Phase 1)

| Component      | Choice             | Rationale                            |
| -------------- | ------------------ | ------------------------------------ |
| Runtime        | Cloudflare Workers | Free tier, cron triggers             |
| Database       | Cloudflare D1      | Free tier, SQLite                    |
| SMS            | Twilio             | Reliable, handles STOP automatically |
| Payments       | Stripe             | Subscriptions, webhooks              |
| Weather        | NWS API (NOAA)     | Free, no API key                     |
| Zip → Timezone | Static JSON        | Bundled in Worker (~150KB)           |

### Data Model (Phase 1)

```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  phone TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(phone, zip_code)
);

CREATE INDEX idx_subs_tz_status ON subscriptions(timezone) WHERE status = 'active';
CREATE INDEX idx_subs_phone ON subscriptions(phone);
```

### API Routes (Phase 1)

```
POST /webhook/twilio    # Incoming SMS → create checkout session
POST /webhook/stripe    # Payment events → activate/cancel subscription
GET  /health            # Health check (returns 200)
```

### Cron (Phase 1)

```
0 * * * *   # Every hour: check for 8pm timezones, send alerts directly
```

### Alert Logic (Phase 1 - Simple)

```javascript
// Pseudocode for cron handler
async function scheduled(event, env) {
  const now = new Date();

  // Find timezones where it's currently 8pm
  const targetTimezones = findTimezonesAt8pm(now);

  // Get active subscriptions in those timezones
  const subs = await env.DB.prepare(
    `
    SELECT DISTINCT zip_code, phone
    FROM subscriptions
    WHERE timezone IN (${targetTimezones.map(() => "?").join(",")})
    AND status = 'active'
  `
  )
    .bind(...targetTimezones)
    .all();

  // Group by zip to minimize weather API calls
  const zipToPhones = groupByZip(subs.results);

  // Fetch weather and send alerts
  for (const [zip, phones] of Object.entries(zipToPhones)) {
    const forecast = await fetchNWSForecast(zip);

    if (forecast.overnightLow <= 28) {
      for (const phone of phones) {
        try {
          await sendTwilioSMS(
            phone,
            `🥶 FREEZE ALERT: Low of ${forecast.overnightLow}°F tonight in ${zip}. Drip your faucets!`
          );
        } catch (err) {
          // Phase 1: Just log it. Accept ~1% failure rate.
          console.error(`Failed to send to ${phone}:`, err);
        }
      }
    }
  }
}
```

### Environment Variables

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID
ALERT_EMAIL          # Your email for failure notifications
```

### Operational Tasks (Phase 1)

- **Daily:** Check Cloudflare dashboard for cron failures
- **Weekly:** Review Twilio logs for failed sends
- **On freeze night:** Manually verify you received your own alert

### Success Criteria (Move to Phase 2)

- [ ] 100+ paying subscribers
- [ ] Survived 5+ freeze events with <2% missed alerts
- [ ] Revenue covers costs ($150+ annual revenue)

### Risks Accepted in Phase 1

| Risk                      | Impact        | Mitigation                        |
| ------------------------- | ------------- | --------------------------------- |
| NWS API down              | Missed alerts | Monitor manually on freeze nights |
| Twilio failure (no retry) | ~1% miss rate | Acceptable for MVP                |
| Cron doesn't fire         | Missed alerts | Check dashboard daily             |
| No web signup             | Lower signups | SMS-only proves core value        |

---

## Phase 2: Web Signup + Caching + Monitoring

**Goal:** Reduce friction, improve reliability, add observability.

**Trigger:** Phase 1 success criteria met (100+ users)

### What's Added

1. **Landing page with web signup**
2. **Weather caching** (reduce NWS calls, add resilience)
3. **Basic monitoring** (email alerts on failures)
4. **Rate limiting** (prevent abuse)

### New: Landing Page

Single HTML page on Cloudflare Pages:

- Phone number input
- Zip code input
- "Subscribe - $12/year" button
- → Creates Stripe Checkout Session via API
- → Redirects to Stripe

```html
<!-- Minimal landing page structure -->
<form id="signup">
  <input type="tel" name="phone" placeholder="(555) 123-4567" required />
  <input
    type="text"
    name="zip"
    placeholder="78701"
    pattern="[0-9]{5}"
    required
  />
  <button type="submit">Get Freeze Alerts — $12/year</button>
</form>
```

### New: Weather Caching

```sql
-- Add to schema
CREATE TABLE weather_cache (
  zip_code TEXT PRIMARY KEY,
  overnight_low INTEGER,
  fetched_at INTEGER,
  expires_at INTEGER
);
```

```javascript
async function getOvernightLow(zip, env) {
  // Check cache first (1 hour TTL)
  const cached = await env.DB.prepare(
    `SELECT overnight_low FROM weather_cache
     WHERE zip_code = ? AND expires_at > ?`
  )
    .bind(zip, Date.now() / 1000)
    .first();

  if (cached) return cached.overnight_low;

  // Fetch from NWS
  const forecast = await fetchNWSForecast(zip);

  // Cache for 1 hour
  await env.DB.prepare(
    `INSERT OR REPLACE INTO weather_cache (zip_code, overnight_low, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(
      zip,
      forecast.overnightLow,
      Date.now() / 1000,
      Date.now() / 1000 + 3600
    )
    .run();

  return forecast.overnightLow;
}
```

### New: Monitoring Table

```sql
CREATE TABLE alert_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  phone TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  temp INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'sent', 'failed'
  error_message TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### New: Daily Summary Email

```javascript
// Run at midnight UTC via separate cron
async function sendDailySummary(env) {
  const stats = await env.DB.prepare(
    `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM alert_log
    WHERE created_at > ?
  `
  )
    .bind(Date.now() / 1000 - 86400)
    .first();

  if (stats.failed > 0 || stats.total > 0) {
    await sendEmail(
      env.ALERT_EMAIL,
      `Freeze Alert Daily: ${stats.sent}/${stats.total} sent, ${stats.failed} failed`
    );
  }
}
```

### New: Rate Limiting

```sql
CREATE TABLE rate_limits (
  phone TEXT PRIMARY KEY,
  attempts INTEGER DEFAULT 1,
  window_start INTEGER DEFAULT (strftime('%s', 'now'))
);
```

```javascript
async function checkRateLimit(phone, env) {
  const limit = await env.DB.prepare(
    `SELECT attempts, window_start FROM rate_limits WHERE phone = ?`
  )
    .bind(phone)
    .first();

  const now = Date.now() / 1000;
  const windowSize = 86400; // 24 hours
  const maxAttempts = 5;

  if (!limit || now - limit.window_start > windowSize) {
    // New window
    await env.DB.prepare(
      `INSERT OR REPLACE INTO rate_limits (phone, attempts, window_start) VALUES (?, 1, ?)`
    )
      .bind(phone, now)
      .run();
    return true;
  }

  if (limit.attempts >= maxAttempts) {
    return false; // Rate limited
  }

  await env.DB.prepare(
    `UPDATE rate_limits SET attempts = attempts + 1 WHERE phone = ?`
  )
    .bind(phone)
    .run();
  return true;
}
```

### API Routes (Phase 2)

```
POST /webhook/twilio      # Incoming SMS
POST /webhook/stripe      # Payment events
POST /api/create-session  # Web signup → Stripe Checkout
GET  /health              # Health check
```

### Success Criteria (Move to Phase 3)

- [ ] 500+ paying subscribers
- [ ] Web signup accounts for 30%+ of new signups
- [ ] <1% alert failure rate
- [ ] Cache hit rate >80%

---

## Phase 3: Queues + Scale

**Goal:** Handle thousands of users reliably.

**Trigger:** Phase 2 success criteria met (500+ users) OR experiencing delivery failures

### What's Added

1. **Cloudflare Queues** for SMS delivery
2. **Dead Letter Queue** for failed messages
3. **Automatic retries** with exponential backoff
4. **Fallback weather source**

### New: Queue Architecture

```
┌─────────────┐
│ Hourly Cron │ Fetches weather, queues alerts (fast, always completes)
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Cloudflare Queue│ Buffers messages, handles retries
└──────┬──────────┘
       │
       ▼
┌──────────────────┐
│ Consumer Worker  │ Sends SMS via Twilio API
└──────┬───────────┘
       │
       ├─ Success ────────→ ✓ Done, log to alert_log
       │
       ├─ Transient Fail ─→ ↻ Retry (10s, 60s, 300s)
       │
       └─ Permanent Fail ─→ ✗ Dead Letter Queue
```

### Queue Configuration

```toml
# wrangler.toml
[[queues.producers]]
queue = "freeze-alerts"
binding = "ALERT_QUEUE"

[[queues.consumers]]
queue = "freeze-alerts"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "freeze-alerts-dlq"

[[queues.consumers]]
queue = "freeze-alerts-dlq"
max_batch_size = 1
```

### New: DLQ Table

```sql
CREATE TABLE failed_alerts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  phone TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  temp INTEGER NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  resolved_at INTEGER
);
```

### New: Fallback Weather Source

```javascript
async function getOvernightLow(zip, env) {
  // Try cache first
  const cached = await getCachedWeather(zip, env);
  if (cached) return cached;

  // Try NWS (primary)
  try {
    const nws = await fetchNWSForecast(zip);
    await cacheWeather(zip, nws.overnightLow, env);
    return nws.overnightLow;
  } catch (err) {
    console.error("NWS failed, trying Open-Meteo:", err);
  }

  // Try Open-Meteo (fallback)
  try {
    const om = await fetchOpenMeteoForecast(zip);
    await cacheWeather(zip, om.overnightLow, env);
    return om.overnightLow;
  } catch (err) {
    console.error("Open-Meteo failed:", err);
    throw new Error("All weather sources failed");
  }
}
```

### Retry Classification

| Failure Type               | Retry? | Example                   |
| -------------------------- | ------ | ------------------------- |
| Twilio 429 (rate limit)    | ✓ Yes  | Too many SMS at once      |
| Twilio 503 (service error) | ✓ Yes  | Twilio outage             |
| Network timeout            | ✓ Yes  | Transient connectivity    |
| Invalid phone (21211)      | ✗ No   | User entered wrong number |
| Twilio account suspended   | ✗ No   | Account issue             |

### Worker Exports (Phase 3)

```javascript
export default {
  // HTTP handlers
  async fetch(request, env, ctx) {
    /* ... */
  },

  // Cron handler
  async scheduled(event, env, ctx) {
    /* ... */
  },

  // Queue consumer
  async queue(batch, env) {
    for (const msg of batch.messages) {
      const { phone, zip, temp } = msg.body;

      try {
        await sendTwilioSMS(
          phone,
          `🥶 FREEZE ALERT: Low of ${temp}°F tonight in ${zip}. Drip your faucets!`
        );
        msg.ack();
        await logAlert(phone, zip, temp, "sent", null, env);
      } catch (err) {
        if (isPermanentFailure(err)) {
          msg.ack(); // Don't retry
          await logAlert(phone, zip, temp, "failed", err.message, env);
        } else {
          msg.retry(); // Transient, will retry
        }
      }
    }
  },
};
```

---

## Unit Economics (All Phases)

| Item                        | Cost       |
| --------------------------- | ---------- |
| SMS per alert               | $0.0079    |
| Alerts per user/year        | ~20        |
| SMS cost per user/year      | $0.16      |
| Stripe fee (on $12)         | $0.65      |
| Cloudflare (Phase 1-2)      | $0.00      |
| Cloudflare Queues (Phase 3) | $0.0002    |
| **Total cost per user/yr**  | **~$0.83** |
| **Gross margin**            | **~93%**   |

**Fixed costs:** ~$75-150/year (Twilio number + domain)

**Break-even:** ~10 users

---

## Privacy Principles (All Phases)

- Collect only phone + zip
- No email required (except Phase 0 smoke test)
- No tracking/analytics beyond operational logs
- No third-party data sharing
- Auto-renew disclosed at signup
- Easy cancellation via STOP command
- Operational logs deleted after 30 days

---

## Data Retention Policy

| Data Type           | Retention       | Rationale                  |
| ------------------- | --------------- | -------------------------- |
| Active subscription | Until cancelled | Required for service       |
| Cancelled sub       | 30 days         | Support queries            |
| Alert logs          | 30 days         | Debugging                  |
| Weather cache       | 1 hour          | Performance                |
| Rate limit records  | 24 hours        | Abuse prevention           |
| Failed alerts (DLQ) | Until resolved  | Manual intervention needed |

```sql
-- Cleanup cron (run daily)
DELETE FROM subscriptions WHERE status = 'cancelled'
  AND created_at < strftime('%s', 'now') - 2592000;
DELETE FROM alert_log WHERE created_at < strftime('%s', 'now') - 2592000;
DELETE FROM rate_limits WHERE window_start < strftime('%s', 'now') - 86400;
```

---

## Risk Matrix

| Risk                | Phase 1 Impact | Phase 2 Impact | Phase 3 Impact |
| ------------------- | -------------- | -------------- | -------------- |
| NWS API outage      | High           | Medium (cache) | Low (fallback) |
| Twilio outage       | High           | High           | Medium (retry) |
| Cron failure        | High           | Medium (alert) | Medium (alert) |
| D1 outage           | High           | High           | High           |
| Spam/abuse          | Medium         | Low (limits)   | Low (limits)   |
| Stripe webhook miss | Medium         | Medium         | Medium         |

---

## Decision Log

| Decision           | Chosen     | Alternatives          | Rationale                     |
| ------------------ | ---------- | --------------------- | ----------------------------- |
| Runtime            | CF Workers | Vercel Edge, Deno     | Best free tier, native cron   |
| Database           | CF D1      | Turso, PlanetScale    | Co-located, free, simple      |
| SMS Provider       | Twilio     | Telnyx, Bandwidth     | STOP handling, reliability    |
| Payments           | Stripe     | Lemon Squeezy         | Industry standard, webhooks   |
| Weather (primary)  | NWS        | OpenWeather, Tomorrow | Free, no key, US coverage     |
| Weather (fallback) | Open-Meteo | WeatherAPI            | Free, global, different infra |
| Queue (Phase 3)    | CF Queues  | None, SQS             | Native integration, cheap     |

---

## Current Phase: 0 (Validation)

**Next action:** Create smoke test landing page and post to 5 local Facebook groups.

**Tracking:**

- [ ] Landing page deployed
- [ ] Posted to Facebook groups: 0/5
- [ ] Email signups collected: 0
- [ ] "Would pay" responses: 0
