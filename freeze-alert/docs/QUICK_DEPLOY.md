# Quick Deployment Guide - Test SMS Flow

Get your Twilio SMS working in ~30 minutes.

## Prerequisites

- ✅ Twilio credentials (you have these!)
- ✅ Cloudflare account (free)
- ✅ Code tested locally (23/23 tests passing)

## Step 1: Create Cloudflare D1 Database (5 min)

```bash
cd freeze-alert

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create freeze-alert-db
```

**Copy the output!** You'll see something like:
```
database_id = "abc123-def456-ghi789"
```

**Update wrangler.toml** with your database ID:
```toml
[[d1_databases]]
binding = "DB"
database_name = "freeze-alert-db"
database_id = "abc123-def456-ghi789"  # YOUR ACTUAL ID HERE
```

**Run the migration:**
```bash
wrangler d1 execute freeze-alert-db --remote --file=./schema.sql
```

## Step 2: Set Secrets in Cloudflare (5 min)

```bash
# Set your Twilio credentials (use YOUR actual values from .dev.vars)
wrangler secret put TWILIO_ACCOUNT_SID
# Paste your Account SID (starts with AC...)

wrangler secret put TWILIO_AUTH_TOKEN
# Paste your Auth Token

wrangler secret put TWILIO_PHONE_NUMBER
# Paste your phone number in E.164 format (+1...)

# Set temporary Stripe values (so code doesn't error)
wrangler secret put STRIPE_SECRET_KEY
# Paste: sk_test_placeholder

wrangler secret put STRIPE_WEBHOOK_SECRET
# Paste: whsec_placeholder

wrangler secret put STRIPE_PRICE_ID
# Paste: price_placeholder

# Your email for error notifications
wrangler secret put ALERT_EMAIL
# Paste: your-email@example.com
```

## Step 3: Deploy! (2 min)

```bash
npm run deploy
```

**Save the output URL!** You'll see:
```
Published freeze-alert
  https://freeze-alert.YOUR-SUBDOMAIN.workers.dev
```

## Step 4: Configure Twilio Webhook (3 min)

1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
2. Click on your phone number
3. Scroll to "Messaging Configuration"
4. Under "A MESSAGE COMES IN":
   - Webhook URL: `https://freeze-alert.YOUR-SUBDOMAIN.workers.dev/webhook/twilio`
   - HTTP Method: `POST`
5. Click "Save configuration"

## Step 5: Test! (1 min)

Send an SMS to **your Twilio number** with:
```
78701
```

**What should happen:**
1. ✅ You get a response in ~2 seconds
2. ✅ Response says: "Freeze Alert for 78701 costs $12/year..."
3. ❌ Payment link will be invalid (no Stripe - expected)

**Check logs:**
```bash
wrangler tail
```

## Troubleshooting

### "Invalid signature" error

Twilio signature verification is failing. This means:
- Webhook URL doesn't match exactly
- Or there's a network issue

**Quick fix for testing:** Temporarily disable signature verification.

In `src/handlers/twilio.ts`, find line ~100 and add:
```typescript
// TEMPORARY: Skip signature check for initial testing
if (process.env.SKIP_TWILIO_SIG_CHECK !== 'true') {
  await verifyTwilioSignature(signature, requestUrl, params, env.TWILIO_AUTH_TOKEN);
}
```

Then set:
```bash
wrangler secret put SKIP_TWILIO_SIG_CHECK
# Enter: true
```

Deploy again: `npm run deploy`

**Remember to remove this before production!**

### No response received

Check Twilio logs:
- https://console.twilio.com/us1/monitor/logs/sms
- Look for your test message
- Check if webhook was called
- Check for error messages

Check Worker logs:
```bash
wrangler tail
```

### Response received but wrong content

The code is working! The "wrong" content is expected without Stripe credentials.

## What Works Without Stripe

- ✅ Receiving SMS
- ✅ Validating phone numbers
- ✅ Extracting zip codes
- ✅ Looking up timezones
- ✅ Checking for duplicate subscriptions
- ✅ Responding via SMS
- ❌ Creating payment links (needs Stripe)

## Next: Test the Alert System

Once SMS is working, test the freeze alert:

```bash
# Manually create a subscription (replace with YOUR phone number)
wrangler d1 execute freeze-alert-db --remote --command "
INSERT INTO subscriptions (phone, zip_code, timezone, status)
VALUES ('+1XXXXXXXXXX', '78701', 'America/Chicago', 'active')
"

# Check if it's 8pm in Chicago
# Or wait for the next hour
# The cron will check weather and send alerts!
```

---

**Total time:** ~30 minutes to get SMS working end-to-end!
