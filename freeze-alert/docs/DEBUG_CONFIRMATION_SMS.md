# Debugging: Missing Confirmation SMS

If you receive the payment link but no confirmation SMS after payment, follow these steps:

## Quick Diagnosis

Run this command to check Cloudflare logs in real-time:

```bash
wrangler tail --format pretty
```

Then complete a test payment and watch for:
1. Incoming webhook requests
2. Error messages
3. Console.log statements

---

## Common Issues & Solutions

### Issue 1: Stripe Webhook Not Configured or Not Firing

**Symptoms:**
- No logs appear in `wrangler tail` after payment
- Stripe Dashboard shows webhook not being sent

**Solution:**

1. **Verify webhook is created:**
   - Go to https://dashboard.stripe.com/webhooks
   - Check that you have an endpoint pointing to your worker URL
   - URL should be: `https://freeze-alert.YOUR_SUBDOMAIN.workers.dev/webhook/stripe`

2. **Check webhook event selection:**
   - Click on the webhook endpoint
   - Ensure `checkout.session.completed` is selected
   - Also select: `customer.subscription.deleted` and `invoice.payment_failed`

3. **Test webhook delivery:**
   - In Stripe Dashboard, go to your webhook
   - Click "Send test webhook"
   - Select `checkout.session.completed`
   - Check if it appears in `wrangler tail`

---

### Issue 2: Webhook Signature Verification Failing

**Symptoms:**
- `wrangler tail` shows: "Invalid signature" or "Stripe signature verification failed"

**Solution:**

1. **Verify webhook secret is correct:**
   ```bash
   # Get the signing secret from Stripe Dashboard > Webhooks > [your webhook] > Signing secret
   # It starts with: whsec_...

   # Update the secret:
   wrangler secret put STRIPE_WEBHOOK_SECRET
   # Paste the secret when prompted
   ```

2. **Check you're using the correct secret:**
   - Test mode webhooks start with `whsec_test_...`
   - Live mode webhooks start with `whsec_live_...`
   - Make sure you're using the secret that matches your STRIPE_SECRET_KEY mode

---

### Issue 3: Missing Metadata in Checkout Session

**Symptoms:**
- `wrangler tail` shows: "Missing metadata in checkout session"
- This means phone/zip/timezone aren't being passed to Stripe

**Diagnosis:**

Add debug logging to see what's in the session:

```typescript
// In src/handlers/stripe.ts, line 60, add:
console.log('Checkout session metadata:', JSON.stringify(session.metadata));
console.log('Session details:', JSON.stringify({
  id: session.id,
  customer: session.customer,
  subscription: session.subscription
}));
```

**Solution:**

If metadata is missing, the issue is in how the checkout session was created:

1. **Check the Twilio handler completed successfully:**
   - Look for "Created checkout session" in logs
   - Verify phone number was normalized correctly

2. **Inspect the checkout session in Stripe:**
   - Go to Stripe Dashboard > Payments > Checkout Sessions
   - Find your test session
   - Click to view details
   - Check "Metadata" section - should show phone, zip_code, timezone

---

### Issue 4: Database Write Failing

**Symptoms:**
- `wrangler tail` shows: "Failed to create subscription in D1"

**Diagnosis:**

Check if the subscription was created:

```bash
wrangler d1 execute freeze-alert-db --remote --command \
  "SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 5"
```

**Solution:**

1. **If table doesn't exist:**
   ```bash
   npm run db:migrate
   ```

2. **If unique constraint violation:**
   ```bash
   # Check for existing subscription
   wrangler d1 execute freeze-alert-db --remote --command \
     "SELECT * FROM subscriptions WHERE phone = '+1XXXXXXXXXX' AND zip_code = 'XXXXX'"

   # If found, delete it for testing:
   wrangler d1 execute freeze-alert-db --remote --command \
     "DELETE FROM subscriptions WHERE phone = '+1XXXXXXXXXX' AND zip_code = 'XXXXX'"
   ```

3. **If database_id is wrong:**
   - Check `wrangler.toml` line 9
   - Run: `wrangler d1 list`
   - Update `database_id` if needed

---

### Issue 5: SMS Send Failing

**Symptoms:**
- `wrangler tail` shows: "Failed to send activation confirmation SMS"
- Subscription was created but SMS not delivered

**Diagnosis:**

Check Twilio logs:
1. Go to https://console.twilio.com/us1/monitor/logs/sms
2. Look for messages sent to your test phone number
3. Check status: Delivered, Failed, Undelivered

**Solution:**

1. **If Twilio credentials are wrong:**
   ```bash
   wrangler secret put TWILIO_ACCOUNT_SID
   wrangler secret put TWILIO_AUTH_TOKEN
   wrangler secret put TWILIO_PHONE_NUMBER
   ```

2. **If phone number format is wrong:**
   - TWILIO_PHONE_NUMBER must be in E.164 format: `+1XXXXXXXXXX`
   - Get it from: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming

3. **Test SMS sending manually:**
   ```bash
   # Use Twilio's test credentials or send via console
   ```

---

## Step-by-Step Debugging

Run through these checks in order:

### Step 1: Check Worker Logs

```bash
wrangler tail --format pretty
```

Complete a test payment. You should see:

```
✓ POST /webhook/stripe 200 OK
✓ Processing Stripe event: checkout.session.completed
✓ Checkout session metadata: {...}
✓ Created subscription in D1
✓ Sent activation confirmation SMS
```

**If you don't see webhook request at all** → Issue 1 (webhook not configured)
**If you see "Invalid signature"** → Issue 2 (wrong webhook secret)
**If you see "Missing metadata"** → Issue 3 (metadata not set)
**If you see "Failed to create subscription"** → Issue 4 (database error)
**If you see "Failed to send activation SMS"** → Issue 5 (SMS error)

---

### Step 2: Check Stripe Dashboard

1. Go to https://dashboard.stripe.com/webhooks
2. Click on your webhook endpoint
3. Scroll to "Recent events"
4. Find the `checkout.session.completed` event from your test
5. Check:
   - **Response code**: Should be `200`
   - **Response body**: Should be `{"received":true}`
   - **If response is 401**: Signature verification failing → Issue 2
   - **If response is 500**: Internal error → Check logs

---

### Step 3: Check Database

```bash
# Check if subscription was created
wrangler d1 execute freeze-alert-db --remote --command \
  "SELECT
    phone,
    zip_code,
    status,
    stripe_customer_id,
    datetime(created_at, 'unixepoch') as created
  FROM subscriptions
  ORDER BY created_at DESC
  LIMIT 5"
```

**If subscription exists** → SMS sending failed (Issue 5)
**If subscription doesn't exist** → Database write failed (Issue 4) or webhook not processed

---

### Step 4: Check Twilio Logs

1. Go to https://console.twilio.com/us1/monitor/logs/sms
2. Filter by your test phone number
3. Look for the confirmation message
4. Check delivery status

---

## Manual Testing

If you want to test just the confirmation SMS part:

### Test 1: Verify Twilio SMS Works

Create a test script `test-sms.ts`:

```typescript
// Test if SMS sending works at all
const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    To: '+1XXXXXXXXXX', // Your test phone
    From: TWILIO_PHONE_NUMBER,
    Body: '✓ Test message from Freeze Alert',
  }),
});

console.log('Response:', response.status, await response.json());
```

### Test 2: Manually Trigger Webhook Handler

Use Stripe CLI to forward webhooks:

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe login

# Forward webhooks to local dev server
npm run dev  # In one terminal

stripe listen --forward-to localhost:8787/webhook/stripe  # In another terminal

# Complete a test payment and watch logs
```

---

## Add Debug Logging

Temporarily add more logging to narrow down the issue:

```typescript
// In src/handlers/stripe.ts, at the start of handleCheckoutCompleted():
console.log('=== CHECKOUT COMPLETED HANDLER START ===');
console.log('Session ID:', session.id);
console.log('Metadata:', JSON.stringify(session.metadata));
console.log('Customer:', session.customer);
console.log('Subscription:', session.subscription);

// After fetching subscription from Stripe:
console.log('Fetched subscription:', JSON.stringify(subscription));

// After creating in D1:
console.log('✓ Subscription created in D1');

// Before sending SMS:
console.log('Attempting to send SMS to:', phone);

// After sending SMS:
console.log('✓ SMS sent successfully');
console.log('=== CHECKOUT COMPLETED HANDLER END ===');
```

Deploy with debug logging:
```bash
npm run deploy
```

---

## Expected Full Flow in Logs

When everything works correctly, you should see:

```
[Twilio webhook]
POST /webhook/twilio
From: +1XXXXXXXXXX
Body: 78701
Validated phone: +1XXXXXXXXXX
Extracted zip: 78701
Timezone: America/Chicago
Created Stripe checkout session
Sent payment link SMS

[Stripe webhook - after payment]
POST /webhook/stripe
Processing Stripe event: checkout.session.completed
Checkout session metadata: {"phone":"+1XXXXXXXXXX","zip_code":"78701","timezone":"America/Chicago"}
Fetched subscription from Stripe
Created subscription in D1
Sent activation confirmation SMS
```

---

## Quick Checklist

- [ ] `wrangler tail` is running
- [ ] Stripe webhook endpoint exists and points to `/webhook/stripe`
- [ ] Webhook secret (`STRIPE_WEBHOOK_SECRET`) is correct
- [ ] Webhook is listening for `checkout.session.completed`
- [ ] Database migration has been run
- [ ] Twilio credentials are correct
- [ ] Test payment completed successfully in Stripe
- [ ] Webhook shows 200 response in Stripe Dashboard

---

## Still Not Working?

If you've checked all of the above and still no confirmation SMS:

1. **Share the output from `wrangler tail`** after completing a payment
2. **Check Stripe webhook response** in Dashboard
3. **Check database contents** with the query above
4. **Check Twilio SMS logs** for delivery status

The issue will be in one of these logs!

