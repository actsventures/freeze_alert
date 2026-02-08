# 📱 Updating Twilio Phone Number

## Quick Update (1 minute)

Your new phone number: **+1 9313139888**

### Step 1: Update Cloudflare Workers Secret

Run this command and paste the phone number in **E.164 format** (no spaces, no dashes):

```bash
npx wrangler secret put TWILIO_PHONE_NUMBER
```

When prompted, enter:
```
+19313139888
```

**Important:** Use E.164 format:
- ✅ Correct: `+19313139888`
- ❌ Wrong: `+1 9313139888` (has space)
- ❌ Wrong: `9313139888` (missing +1)
- ❌ Wrong: `+1-931-313-9888` (has dashes)

### Step 2: Verify Update

Check that the secret was updated:

```bash
# This will show if the secret exists (but not the value)
npx wrangler secret list
```

You should see `TWILIO_PHONE_NUMBER` in the list.

### Step 3: Test It

1. Text your new Twilio number: `78701`
2. You should receive a payment link SMS
3. Check logs: `npx wrangler tail --format pretty`

---

## Optional: Update Local Development

If you're doing local development, update `.dev.vars`:

```bash
# Edit .dev.vars (create it if it doesn't exist)
TWILIO_PHONE_NUMBER=+19313139888
```

---

## What Changed?

- **Code:** Nothing! The phone number is only used via `env.TWILIO_PHONE_NUMBER`
- **Twilio Webhook:** No change needed (webhook URL is independent of phone number)
- **Stripe:** No change needed
- **Database:** No change needed

---

## Troubleshooting

**If SMS doesn't work after update:**

1. Verify format: Must be `+19313139888` (E.164)
2. Check Twilio dashboard: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
   - Confirm the number is active
   - Check webhook is configured: `https://freeze-alert.actscapital.workers.dev/webhook/twilio`
3. Check logs: `npx wrangler tail --format pretty`
4. Verify secret: `npx wrangler secret list`

---

**That's it!** Just update the one secret and you're done. 🎉

