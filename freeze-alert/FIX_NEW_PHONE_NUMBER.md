# 🔧 Fix: New Phone Number Not Working

## Problem
- ✅ Secret updated: `TWILIO_PHONE_NUMBER` = `+19313139888`
- ❌ New number not receiving/processing SMS
- ✅ Old number still works

## Root Cause
**Twilio webhook not configured for the new phone number**

Each Twilio phone number needs its webhook URL configured separately. Updating the secret doesn't automatically configure the webhook.

---

## Fix: Configure Twilio Webhook for New Number

### Step 1: Go to Twilio Phone Numbers

1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
2. Find your new number: **+19313139888**
3. Click on the number to open its configuration

### Step 2: Configure Webhook URL

1. Scroll down to **"Messaging"** section
2. Under **"A MESSAGE COMES IN"**, select **"Webhook"**
3. Enter this URL:
   ```
   https://freeze-alert.actscapital.workers.dev/webhook/twilio
   ```
4. Select **"HTTP POST"** method
5. Click **"Save"**

### Step 3: Verify Configuration

The webhook should now be set to:
```
https://freeze-alert.actscapital.workers.dev/webhook/twilio
```

---

## Alternative: Configure via Twilio API

If you prefer using the API:

```bash
# Replace YOUR_ACCOUNT_SID, YOUR_AUTH_TOKEN, and YOUR_PHONE_SID
curl -X POST \
  "https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/IncomingPhoneNumbers/YOUR_PHONE_SID.json" \
  -u "YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN" \
  --data-urlencode "SmsUrl=https://freeze-alert.actscapital.workers.dev/webhook/twilio" \
  --data-urlencode "SmsMethod=POST"
```

To find your Phone SID:
1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
2. Click on your number
3. Look for "Phone Number SID" (starts with `PN...`)

---

## Step 4: Test the New Number

1. **Text your new number:** `+19313139888` with message `78701`
2. **Watch logs:**
   ```bash
   npx wrangler tail --format pretty
   ```
3. **You should see:**
   ```
   POST /webhook/twilio
   Processing incoming SMS from: +1XXXXXXXXXX
   ```

---

## Verify Both Numbers Work

### Old Number
- Should still work (webhook already configured)
- Test: Text old number with `78701`

### New Number
- Should now work (webhook just configured)
- Test: Text new number with `78701`

---

## Troubleshooting

### Issue: Still not receiving webhooks

1. **Check Twilio logs:**
   - Go to: https://console.twilio.com/us1/monitor/logs/sms
   - Look for messages to your new number
   - Check if webhook was called

2. **Verify webhook URL:**
   - Go to phone number settings
   - Confirm URL is exactly: `https://freeze-alert.actscapital.workers.dev/webhook/twilio`
   - No trailing slash, no typos

3. **Check Worker logs:**
   ```bash
   npx wrangler tail --format pretty
   ```
   - Look for `POST /webhook/twilio` requests
   - Check for any errors

4. **Verify number is active:**
   - Twilio dashboard → Phone Numbers
   - Confirm new number shows as "Active"
   - Check it's not in "Pending" or "Suspended" status

### Issue: Webhook returns 401

This means signature verification is failing. Check:
- `TWILIO_AUTH_TOKEN` secret matches your Twilio account
- Webhook URL is correct
- Request is coming from Twilio (check logs for signature header)

---

## Quick Checklist

- [ ] Secret updated: `TWILIO_PHONE_NUMBER` = `+19313139888`
- [ ] Twilio webhook configured for new number
- [ ] Webhook URL: `https://freeze-alert.actscapital.workers.dev/webhook/twilio`
- [ ] Method: `HTTP POST`
- [ ] Tested: Text new number with `78701`
- [ ] Logs show: `POST /webhook/twilio`

---

**Most likely fix:** Configure the webhook URL in Twilio dashboard for the new phone number! 🎯


