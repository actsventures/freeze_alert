# Phase 1 Deployment Guide

Complete step-by-step guide to deploy the Freeze Alert SMS system to production.

## Prerequisites

- ✅ Cloudflare account (free tier is fine)
- ✅ Twilio account with phone number
- ✅ Stripe account (test mode for initial testing)
- ✅ Node.js 18+ installed
- ✅ All code tested locally (23/23 tests passing)

---

## Step 1: Authenticate with Cloudflare

```bash
cd freeze-alert
npx wrangler login
```

This will open your browser to authenticate. Follow the prompts.

---

## Step 2: Create Cloudflare D1 Database

```bash
npx wrangler d1 create freeze-alert-db
```

**IMPORTANT:** Copy the `database_id` from the output. It looks like:

```
database_id = "abc123-def456-ghi789"
```

Update `wrangler.toml` line 9 with this ID:

```toml
database_id = "YOUR_ACTUAL_DATABASE_ID_HERE"
```

---

## Step 3: Run Database Migration

```bash
npx wrangler d1 execute freeze-alert-db --remote --file=./schema.sql
```

Verify it worked:

```bash
npx wrangler d1 execute freeze-alert-db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

You should see `subscriptions` in the output.

---

## Step 4: Create Stripe Product and Price

1. Go to: https://dashboard.stripe.com/test/products
2. Click **"+ Add product"**
3. Fill in:
   - **Name:** `Freeze Alert Annual`
   - **Description:** `SMS alerts for freezing temperatures`
   - **Pricing model:** `Recurring`
   - **Price:** `$12.00`
   - **Billing period:** `Yearly`
4. Click **"Save product"**
5. **Copy the Price ID** (starts with `price_`)

---

## Step 5: Set Cloudflare Worker Secrets

Run each command and paste the value when prompted:

```bash
# Twilio credentials (from your Twilio console)
npx wrangler secret put TWILIO_ACCOUNT_SID
# Paste: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

npx wrangler secret put TWILIO_AUTH_TOKEN
# Paste: your_auth_token_here

npx wrangler secret put TWILIO_PHONE_NUMBER
# Paste: +15125551234 (your Twilio number in E.164 format)

# Stripe credentials (from Stripe dashboard)
npx wrangler secret put STRIPE_SECRET_KEY
# Paste: sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx (from https://dashboard.stripe.com/test/apikeys)

npx wrangler secret put STRIPE_WEBHOOK_SECRET
# Paste: whsec_placeholder (we'll update this after creating webhook in Step 7)

npx wrangler secret put STRIPE_PRICE_ID
# Paste: price_xxxxxxxxxxxxxxxxxxxxxxxxxxxx (from Step 4)

# Alert email
npx wrangler secret put ALERT_EMAIL
# Paste: your-email@example.com
```

---

## Step 6: Deploy Worker

```bash
npm run deploy
```

**Save the output URL!** You'll see:

```
Published freeze-alert
  https://freeze-alert.YOUR-SUBDOMAIN.workers.dev
```

---

## Step 7: Configure Twilio Webhook

1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
2. Click on your Twilio phone number
3. Scroll to **"Messaging Configuration"**
4. Under **"A MESSAGE COMES IN"**:
   - **Webhook URL:** `https://freeze-alert.YOUR-SUBDOMAIN.workers.dev/webhook/twilio`
   - **HTTP Method:** `POST`
5. Click **"Save configuration"**

---

## Step 8: Create Stripe Webhook

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click **"+ Add endpoint"**
3. **Endpoint URL:** `https://freeze-alert.YOUR-SUBDOMAIN.workers.dev/webhook/stripe`
4. **Events to listen for:**
   - Select: `checkout.session.completed`
   - Select: `customer.subscription.deleted`
   - Select: `customer.subscription.updated`
5. Click **"Add endpoint"**
6. **Copy the Signing secret** (starts with `whsec_`)
7. Update the secret in Cloudflare:
   ```bash
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   # Paste: whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx (from step 6)
   ```

---

## Step 9: End-to-End Test

### Test SMS Signup Flow

1. Send an SMS to your Twilio number with a zip code:

   ```
   78701
   ```

2. **Expected response:** You should receive:

   ```
   Freeze Alert for 78701 costs $12/year.
   Pay here to activate: https://checkout.stripe.com/xxx
   Link expires in 24h.
   ```

3. Click the payment link and complete checkout with Stripe test card:

   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits

4. **Expected:** After payment, you should receive:
   ```
   ✓ Freeze Alert active for 78701!
   You'll get texts at 8pm when temps drop below 28°F.
   $12/year, auto-renews. Reply STOP to cancel.
   ```

### Test Alert System

Wait until 8pm in a timezone where you have a subscription, or manually trigger:

```bash
# Check logs
npx wrangler tail
```

The cron runs every hour and checks for timezones where it's 8pm.

---

## Troubleshooting

### "Invalid signature" error from Twilio

- Verify webhook URL matches exactly (no trailing slash)
- Check Twilio logs: https://console.twilio.com/us1/monitor/logs/sms

### Worker returns 500 error

Check logs:

```bash
npx wrangler tail
```

Common issues:

- Missing secrets (run `wrangler secret put` again)
- Database not migrated (run Step 3 again)
- Invalid Stripe Price ID (verify in Stripe dashboard)

### No SMS response

1. Check Twilio webhook is configured (Step 7)
2. Check Worker logs: `npx wrangler tail`
3. Verify Twilio credentials are correct

### Stripe webhook not working

1. Verify webhook URL is accessible (try opening in browser - should return 405 Method Not Allowed)
2. Check Stripe webhook logs: https://dashboard.stripe.com/test/webhooks
3. Verify signing secret matches

---

## Verification Checklist

- [ ] D1 database created and migrated
- [ ] All 7 secrets set in Cloudflare
- [ ] Worker deployed successfully
- [ ] Twilio webhook configured
- [ ] Stripe webhook created and secret updated
- [ ] Test SMS received payment link
- [ ] Test payment completed successfully
- [ ] Activation confirmation SMS received
- [ ] Subscription appears in database

---

## Next Steps After Deployment

1. **Monitor first freeze alert:** Wait for a night when temps drop below 28°F and verify alerts are sent
2. **Set up alerts:** Consider setting up Cloudflare alerts for Worker errors
3. **Track metrics:** Monitor Twilio usage and Stripe subscriptions
4. **Update SPEC.md:** Mark Phase 1 deployment as complete

---

## Rollback Plan

If something goes wrong:

1. **Disable Twilio webhook:** Set webhook URL back to default in Twilio console
2. **Disable Stripe webhook:** Delete or disable in Stripe dashboard
3. **Worker still running:** The cron will continue but won't receive new signups

To fully rollback:

```bash
# Delete worker (optional - you can also just disable)
npx wrangler delete freeze-alert
```
