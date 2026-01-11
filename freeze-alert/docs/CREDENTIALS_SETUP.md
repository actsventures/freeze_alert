# Getting Your Credentials for Deployment

This guide walks you through getting all the credentials you need to deploy Freeze Alert.

## Summary of What You Need

| Service | What You Need | Cost |
|---------|--------------|------|
| **Twilio** | Account SID, Auth Token, Phone Number | ~$2/month |
| **Stripe** | Secret Key, Webhook Secret, Price ID | Free (2.9% + 30¢ per transaction) |
| **Cloudflare** | Account (for D1 Database & Workers) | Free tier sufficient |

---

## Part 1: Twilio Setup (SMS)

**Time:** ~10 minutes
**Cost:** $2.00/month for phone number + $0.0079 per SMS

### Steps:

1. **Sign up for Twilio**
   - Go to: https://www.twilio.com/try-twilio
   - Click "Sign up"
   - Verify your email and phone number

2. **Get your Account Credentials**
   - After signup, you'll see your Dashboard
   - Copy your **Account SID** (starts with `AC...`)
   - Click "Show" next to **Auth Token** and copy it
   - **Save these!** You'll need them later

3. **Buy a Phone Number**
   - Click "Get a Twilio phone number" button
   - Click "Choose this number" (or search for a specific area code)
   - Click "Buy" (~$2/month)
   - Copy your new **Phone Number** (format: +15125551234)

4. **Optional: Upgrade Account**
   - Trial accounts can only send SMS to verified numbers
   - To send to any number, click "Upgrade" and add payment info
   - **Recommended:** Start with trial, upgrade when ready to go live

### What to Save:
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_32_character_auth_token_here
TWILIO_PHONE_NUMBER=+15125551234
```

---

## Part 2: Stripe Setup (Payments)

**Time:** ~15 minutes
**Cost:** Free (2.9% + 30¢ per transaction)

### Steps:

1. **Sign up for Stripe**
   - Go to: https://dashboard.stripe.com/register
   - Enter your email and create a password
   - Verify your email

2. **Get your Secret Key**
   - Go to: https://dashboard.stripe.com/apikeys
   - You'll see two keys: **Publishable** and **Secret**
   - Copy the **Secret key** (starts with `sk_test_...`)
   - ⚠️ **NEVER commit this to Git!**

3. **Create a Subscription Product**
   - Go to: https://dashboard.stripe.com/products/create
   - Click "Add product"
   - Fill in:
     - **Name:** "Freeze Alert Annual Subscription"
     - **Description:** "Annual freeze alert subscription for one zip code"
     - **Pricing model:** "Standard pricing"
     - **Price:** $12.00
     - **Billing period:** "Yearly"
   - Click "Save product"
   - Copy the **Price ID** (starts with `price_...`)

4. **Set up Webhook Endpoint** (Do this after deploying to Cloudflare)
   - Go to: https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"
   - Enter: `https://your-worker-name.workers.dev/webhook/stripe`
   - Select events to listen to:
     - `checkout.session.completed`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - Click "Add endpoint"
   - Copy the **Webhook signing secret** (starts with `whsec_...`)

### What to Save:
```bash
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx  # After webhook setup
```

---

## Part 3: Cloudflare Setup (Hosting & Database)

**Time:** ~10 minutes
**Cost:** Free tier (generous limits)

### Steps:

1. **Sign up for Cloudflare**
   - Go to: https://dash.cloudflare.com/sign-up
   - Create account with email
   - Verify email

2. **Install Wrangler CLI** (if not already installed)
   ```bash
   npm install -g wrangler
   ```

3. **Login to Wrangler**
   ```bash
   wrangler login
   ```
   - This will open a browser window
   - Click "Allow" to authorize

4. **Create D1 Database**
   ```bash
   cd freeze-alert
   wrangler d1 create freeze-alert-db
   ```
   - Copy the output database ID
   - Update `wrangler.toml`:
     ```toml
     [[d1_databases]]
     binding = "DB"
     database_name = "freeze-alert-db"
     database_id = "your-database-id-here"  # Replace this!
     ```

5. **Run Database Migration**
   ```bash
   wrangler d1 execute freeze-alert-db --remote --file=./schema.sql
   ```

---

## Part 4: Set Environment Variables

Now that you have all credentials, set them in Cloudflare:

```bash
# Navigate to your project
cd freeze-alert

# Set each secret (you'll be prompted to enter the value)
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
wrangler secret put TWILIO_PHONE_NUMBER
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_PRICE_ID
wrangler secret put ALERT_EMAIL  # Your email for failure notifications
```

**Tip:** Have all your credentials in a text file ready to copy-paste when prompted.

---

## Part 5: Local Development Setup

For local testing, create a `.dev.vars` file:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and fill in your actual credentials:

```bash
# .dev.vars (NEVER commit this!)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15125551234
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
ALERT_EMAIL=your-email@example.com
```

**⚠️ IMPORTANT:** `.dev.vars` is in `.gitignore` - never commit it to Git!

---

## Part 6: Configure Twilio Webhook

After deploying your Worker, configure Twilio to send SMS to your webhook:

1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
2. Click on your phone number
3. Scroll to "Messaging Configuration"
4. Under "A MESSAGE COMES IN":
   - Change "Webhook" URL to: `https://your-worker-name.workers.dev/webhook/twilio`
   - HTTP Method: `POST`
5. Click "Save configuration"

---

## Testing Checklist

Before going live, test everything:

- [ ] **Unit tests pass:** `npm test`
- [ ] **Type check passes:** `npm run typecheck`
- [ ] **Local dev works:** `npm run dev`
- [ ] **Database created:** Check Cloudflare Dashboard > D1
- [ ] **Secrets set:** Run `wrangler secret list` (won't show values, just names)
- [ ] **Deployed:** `npm run deploy`
- [ ] **Twilio webhook set:** Check Twilio console
- [ ] **Stripe webhook set:** Check Stripe dashboard
- [ ] **Test SMS flow:** Text your zip code to your Twilio number
- [ ] **Test payment:** Complete a test payment
- [ ] **Test subscription:** Verify subscription created in D1

---

## Cost Breakdown

### Monthly Costs (100 users):
- **Twilio phone number:** $2.00/month
- **SMS (20 alerts/user/year):** ~$16/year = $1.33/month
- **Cloudflare:** $0 (free tier)
- **Stripe fees:** $0 (charged per transaction)
- **Domain (optional):** ~$1/month

**Total:** ~$4-5/month for 100 users

### Revenue (100 users):
- 100 users × $12/year = $1,200/year = $100/month
- **Gross margin:** ~95%
- **Monthly profit:** ~$95/month

---

## Security Reminders

✅ **DO:**
- Keep `.dev.vars` in `.gitignore`
- Use `wrangler secret put` for production credentials
- Rotate credentials regularly
- Use different credentials for development and production

❌ **DON'T:**
- Commit credentials to Git
- Share credentials in Slack/email
- Use production credentials in development
- Hardcode secrets in source code

---

## Troubleshooting

### "Invalid signature" errors from Twilio/Stripe
- Double-check you copied the full secret (no spaces or line breaks)
- Verify webhook URL is exactly `https://your-worker.workers.dev/webhook/twilio` (no trailing slash)

### SMS not receiving
- Check Twilio phone number webhook is configured
- Check Twilio logs: https://console.twilio.com/us1/monitor/logs/sms
- Verify Worker is deployed: `wrangler tail` to see live logs

### Payment not working
- Use Stripe test card: `4242 4242 4242 4242` (any future date, any CVC)
- Check Stripe webhook is configured
- Verify STRIPE_PRICE_ID is correct
- Check Stripe logs: https://dashboard.stripe.com/logs

### Database errors
- Verify D1 database ID in `wrangler.toml` is correct
- Run migration: `wrangler d1 execute freeze-alert-db --remote --file=./schema.sql`
- Check D1 console: `wrangler d1 execute freeze-alert-db --remote --command "SELECT * FROM subscriptions"`

---

## Next Steps

Once you have all credentials:

1. ✅ Run tests: `npm test`
2. ✅ Deploy: `npm run deploy`
3. ✅ Configure webhooks (Twilio + Stripe)
4. ✅ Test end-to-end flow
5. ✅ Monitor first freeze alert

Good luck! 🚀
