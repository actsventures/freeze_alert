# Manual Testing Without Stripe

This guide shows you how to test the freeze alert system end-to-end without Stripe credentials.

## Setup: Create Test Subscription

Since we can't process payments without Stripe, we'll manually insert a test subscription into the database.

### Option 1: Using Wrangler CLI (Recommended)

```bash
# First, create the D1 database locally
wrangler d1 create freeze-alert-db

# Update wrangler.toml with the database ID from the output

# Run the schema migration locally
npm run db:migrate:local

# Insert a test subscription (replace with your phone number!)
wrangler d1 execute freeze-alert-db --local --command "
INSERT INTO subscriptions (
  phone,
  zip_code,
  timezone,
  status,
  created_at
) VALUES (
  '+18447903391',     -- Your Twilio number
  '78701',            -- Austin, TX (gets cold!)
  'America/Chicago',
  'active',
  strftime('%s', 'now')
)
"

# Verify it was created
wrangler d1 execute freeze-alert-db --local --command "
  SELECT phone, zip_code, timezone, status
  FROM subscriptions
"
```

### Option 2: Create SQL File

Create `test-subscription.sql`:
```sql
-- Replace +18447903391 with your own phone number
INSERT INTO subscriptions (
  phone,
  zip_code,
  timezone,
  status,
  created_at
) VALUES (
  '+18447903391',
  '78701',
  'America/Chicago',
  'active',
  strftime('%s', 'now')
);
```

Then run:
```bash
wrangler d1 execute freeze-alert-db --local --file=./test-subscription.sql
```

## Test 1: SMS Reception (Partial)

**What this tests:** Everything up to payment link creation

```bash
# Start local development server
npm run dev

# In another terminal, simulate Twilio webhook
curl -X POST http://localhost:8787/webhook/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Twilio-Signature: fake-signature-for-local-testing" \
  -d "From=%2B15125551234&Body=78701"
```

**Expected behavior:**
- ✅ Phone validation runs
- ✅ Zip code extracted
- ✅ Timezone looked up
- ❌ Fails at Stripe checkout creation (expected without Stripe)

**Note:** Signature verification will fail in local dev. You can temporarily comment out signature verification for local testing.

## Test 2: Weather Alerts (Full E2E!)

**What this tests:** The complete alert sending flow

### Step 1: Create subscription (see above)

### Step 2: Test weather fetching

```bash
# Start development server
npm run dev

# Check what the weather API returns for your zip
curl "https://api.weather.gov/points/30.2672,-97.7431" \
  -H "User-Agent: FreezeAlert/1.0 (test@example.com)"
```

### Step 3: Trigger cron manually

The cron handler runs automatically every hour, but you can test it manually:

**Option A: Wait for 8pm in your timezone**
- The cron runs every hour
- When it hits 8pm in your timezone, alerts will send

**Option B: Modify code temporarily to always send**

Edit `src/index.ts` line ~124:
```typescript
// Temporarily bypass the temperature check
if (forecast.overnightLow <= 28) {
  // Change to:
if (true) {  // Always send for testing
```

Then restart `npm run dev` and wait for the next hour mark.

**Option C: Create a test endpoint**

Add this to `src/index.ts` in the `handleRequest` function:

```typescript
// Test endpoint to manually trigger alert
if (pathname === '/test-alert' && method === 'GET') {
  const testZip = '78701';
  const testPhone = '+18447903391'; // Your number

  try {
    const forecast = await fetchNWSForecast(testZip);
    console.log(`Weather for ${testZip}: ${forecast.overnightLow}°F`);

    await sendFreezeAlert(testPhone, testZip, forecast.overnightLow, env);

    return jsonResponse({
      success: true,
      data: {
        zip: testZip,
        temp: forecast.overnightLow,
        message: 'Alert sent!'
      }
    });
  } catch (err) {
    return errorResponse(String(err), 500);
  }
}
```

Then:
```bash
curl http://localhost:8787/test-alert
```

**Expected behavior:**
- ✅ Fetches real weather from NWS
- ✅ Sends SMS to your phone with actual temperature
- ✅ Message format: "🥶 FREEZE ALERT: Low of XX°F tonight in 78701. Drip your faucets!"

## Test 3: End-to-End Simulation

This simulates the complete user journey:

```bash
# 1. User texts zip code (manually send SMS to your Twilio number)
# Send SMS: "78701" to your Twilio number

# 2. System would create payment link (fails without Stripe - expected)

# 3. Manually activate subscription (simulate payment)
wrangler d1 execute freeze-alert-db --local --command "
  INSERT INTO subscriptions (phone, zip_code, timezone, status)
  VALUES ('+15125551234', '78701', 'America/Chicago', 'active')
"

# 4. Wait for 8pm or use test endpoint above

# 5. Verify alert received on your phone
```

## What You'll Learn

Even without Stripe, you can verify:
- ✅ Twilio webhook handling works
- ✅ Phone & zip validation is correct
- ✅ Weather API integration is functional
- ✅ SMS sending works
- ✅ Database queries work
- ✅ Timezone logic is accurate
- ✅ Alert message formatting is correct

## When You Need Stripe

You only need Stripe credentials when you want to test:
- Payment link creation
- Actual payment processing
- Automatic subscription activation after payment
- Subscription cancellation webhooks

## Production Deployment Without Stripe

You **cannot** deploy to production without Stripe because:
- Users can't pay for subscriptions
- No subscriptions = no alerts sent
- The payment flow is essential to the business model

But for **testing the alert system**, Stripe is optional!

## Cleanup

After testing, remove test subscriptions:

```bash
wrangler d1 execute freeze-alert-db --local --command "
  DELETE FROM subscriptions WHERE phone = '+18447903391'
"
```

---

**Summary:** You can test ~80% of the functionality without Stripe! The weather alert system is completely independent of payments and can be fully tested with just Twilio credentials.
