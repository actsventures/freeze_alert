# 🧪 End-to-End Test Guide

This guide walks you through testing the complete Freeze Alert flow from signup to confirmation.

## Prerequisites Checklist

Before starting, verify:

- [ ] Worker is deployed: `https://freeze-alert.actscapital.workers.dev`
- [ ] Stripe webhook is configured (see `FIX_WEBHOOK.md`)
- [ ] All secrets are set via `wrangler secret put`
- [ ] You have access to your Twilio phone number
- [ ] You have a test phone number to send SMS from

---

## Step 1: Pre-Flight Checks (2 minutes)

### 1.1 Check Worker Health

```bash
curl https://freeze-alert.actscapital.workers.dev/health
```

**Expected:** `{"success":true,"data":{"status":"ok"}}`

### 1.2 Run Diagnostic Script

```bash
node diagnose-stripe.js
```

This checks:
- ✅ Worker is online
- ✅ Webhook endpoint is reachable
- ⚠️ Stripe webhook configuration (manual check needed)

### 1.3 Verify Stripe Webhook Configuration

1. Go to: https://dashboard.stripe.com/webhooks
2. Check if you have an endpoint pointing to:
   ```
   https://freeze-alert.actscapital.workers.dev/webhook/stripe
   ```
3. Verify these events are selected:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.deleted`
   - ✅ `invoice.payment_failed`

**If webhook is missing:** Follow `FIX_WEBHOOK.md` first!

---

## Step 2: Set Up Monitoring (1 minute)

Open a terminal and start watching logs:

```bash
npx wrangler tail --format pretty
```

**Keep this terminal open** - you'll see all requests and responses in real-time.

---

## Step 3: Test SMS Signup Flow (5 minutes)

### 3.1 Send Test SMS

From your phone, text your Twilio number with a zip code:

```
78701
```

**What should happen:**
1. ✅ Worker receives webhook from Twilio
2. ✅ Validates zip code
3. ✅ Creates Stripe checkout session
4. ✅ Sends payment link SMS back to you

### 3.2 Check Logs

In your `wrangler tail` terminal, you should see:

```
POST /webhook/twilio
Processing incoming SMS from: +1234567890
Extracted zip code: 78701
Timezone: America/Chicago
Creating Stripe checkout session...
Payment link sent successfully
```

### 3.3 Verify Payment Link SMS

Check your phone - you should receive:

```
Freeze Alert for 78701 costs $12/year.
Pay here to activate: https://checkout.stripe.com/...
Link expires in 24h.
```

**If you don't receive SMS:**
- Check Twilio logs: https://console.twilio.com/us1/monitor/logs/sms
- Check `wrangler tail` for errors
- Verify `TWILIO_PHONE_NUMBER` secret is correct

---

## Step 4: Complete Payment (2 minutes)

### 4.1 Click Payment Link

Open the Stripe checkout link from your SMS.

### 4.2 Use Test Card

In Stripe test mode, use:

```
Card: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/25)
CVC: Any 3 digits (e.g., 123)
ZIP: Any 5 digits (e.g., 12345)
```

### 4.3 Complete Payment

Click "Subscribe" and wait for confirmation page.

**What should happen:**
1. ✅ Stripe processes payment
2. ✅ Stripe sends webhook to your Worker
3. ✅ Worker creates subscription in database
4. ✅ Worker sends confirmation SMS

---

## Step 5: Verify Webhook Processing (2 minutes)

### 5.1 Check Logs

In `wrangler tail`, you should see:

```
POST /webhook/stripe
Processing Stripe event: checkout.session.completed
=== CHECKOUT COMPLETED HANDLER START ===
Session ID: cs_test_...
✓ Metadata validated
✓ Customer and subscription present
✓ Subscription fetched from Stripe
✓ Subscription created in D1
✓ Activation SMS sent successfully
=== CHECKOUT COMPLETED HANDLER END ===
```

**If you see errors:**
- Check the error message in logs
- Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
- Check Stripe webhook events: https://dashboard.stripe.com/webhooks

### 5.2 Check Stripe Dashboard

1. Go to: https://dashboard.stripe.com/webhooks
2. Click on your webhook endpoint
3. Check "Recent events" tab
4. Find `checkout.session.completed` event
5. Verify response is `200 OK`

**If response is not 200:**
- Click on the event to see error details
- Check `wrangler tail` logs for the exact error
- Common issues:
  - `401`: Wrong webhook secret
  - `500`: Check Worker logs for error details

---

## Step 6: Verify Confirmation SMS (1 minute)

Check your phone - you should receive:

```
✓ Freeze Alert active for 78701!
You'll get texts at 8pm when temps drop below 28°F.
$12/year, auto-renews. Reply STOP to cancel.
```

**If you don't receive confirmation SMS:**
- Check `wrangler tail` - did webhook complete successfully?
- Check Twilio logs: https://console.twilio.com/us1/monitor/logs/sms
- Verify subscription was created (see Step 7)

---

## Step 7: Verify Database Record (1 minute)

### 7.1 Check Database

```bash
npx wrangler d1 execute freeze-alert-db --remote --command "SELECT phone, zip_code, status, timezone, datetime(created_at, 'unixepoch') as created FROM subscriptions ORDER BY created_at DESC LIMIT 5"
```

**Expected output:**
```
phone          | zip_code | status    | timezone          | created
+1234567890    | 78701    | active    | America/Chicago    | 2024-01-15 14:30:00
```

**If no record exists:**
- Webhook didn't complete successfully
- Check `wrangler tail` logs for errors
- Verify webhook secret matches Stripe dashboard

### 7.2 Verify Subscription Details

```bash
npx wrangler d1 execute freeze-alert-db --remote --command "SELECT * FROM subscriptions WHERE phone = '+1234567890'"
```

Replace `+1234567890` with your test phone number.

---

## Step 8: Test Duplicate Signup (Optional)

### 8.1 Try Signing Up Again

Text the same zip code again:

```
78701
```

**Expected response:**
```
You're already subscribed to freeze alerts for 78701. You'll receive alerts at 8pm when temps drop below 28°F.
```

This confirms duplicate prevention is working.

---

## Step 9: Test Different Zip Code (Optional)

### 9.1 Try Another Zip

Text a different zip code:

```
90210
```

**Expected:**
- New payment link sent
- Can complete separate subscription
- Both subscriptions active in database

---

## Troubleshooting

### Issue: No Payment Link SMS

**Check:**
1. `wrangler tail` - any errors?
2. Twilio logs: https://console.twilio.com/us1/monitor/logs/sms
3. Verify `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` secrets

**Common causes:**
- Invalid zip code (not in supported list)
- Twilio credentials incorrect
- Worker not deployed

### Issue: Payment Completes But No Confirmation SMS

**Check:**
1. Stripe webhook configured? (Step 1.3)
2. `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard?
3. `wrangler tail` - did webhook arrive?
4. Database - was subscription created?

**Common causes:**
- Webhook not configured in Stripe
- Wrong webhook secret
- Webhook endpoint returning error

### Issue: Webhook Returns 401

**Fix:**
1. Go to Stripe dashboard → Webhooks
2. Click "Reveal" on signing secret
3. Copy secret (starts with `whsec_`)
4. Run: `npx wrangler secret put STRIPE_WEBHOOK_SECRET`
5. Paste secret
6. Test payment again

### Issue: Webhook Returns 500

**Check:**
1. `wrangler tail` - what's the error?
2. Common issues:
   - Database connection failed
   - Missing metadata in checkout session
   - SMS sending failed (non-fatal, but logged)

---

## Success Criteria ✅

Your end-to-end test is successful if:

- [x] Health check returns `200 OK`
- [x] SMS signup sends payment link
- [x] Payment completes successfully
- [x] Webhook processes `checkout.session.completed`
- [x] Confirmation SMS received
- [x] Subscription record in database
- [x] Stripe dashboard shows `200 OK` for webhook

---

## Next Steps

Once E2E test passes:

1. **Test freeze alerts:** Wait for 8pm in a test timezone, or manually trigger cron
2. **Monitor production:** Set up alerts for webhook failures
3. **Scale testing:** Test with multiple zip codes and users
4. **Documentation:** Update README with any learnings

---

## Quick Reference

**Worker URL:** `https://freeze-alert.actscapital.workers.dev`
**Webhook URL:** `https://freeze-alert.actscapital.workers.dev/webhook/stripe`
**Stripe Dashboard:** https://dashboard.stripe.com/webhooks
**Twilio Logs:** https://console.twilio.com/us1/monitor/logs/sms
**Watch Logs:** `npx wrangler tail --format pretty`
**Check DB:** `npx wrangler d1 execute freeze-alert-db --remote --command "SELECT * FROM subscriptions"`

---

**Ready to test?** Start with Step 1! 🚀

