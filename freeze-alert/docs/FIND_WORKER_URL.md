# 🔍 Quick Debug Script - Get Your Worker URL

Run these commands to find your actual worker URL:

```bash
# Option 1: Deploy and see the URL in output
npx wrangler deploy

# Output will show something like:
# Total Upload: XX.XX KiB / gzip: XX.XX KiB
# Uploaded freeze-alert (X.XX sec)
# Deployed freeze-alert triggers (X.XX sec)
#   https://freeze-alert.YOUR-SUBDOMAIN.workers.dev      <-- THIS IS YOUR URL
# Current Version ID: xxxxx

# Option 2: Check previous deployment
npx wrangler deployments list | head -20

# Option 3: Test health endpoint manually
# Try these URLs in your browser until one works:
#   https://freeze-alert.YOUR-SUBDOMAIN.workers.dev/health

# Common subdomain formats:
# - https://freeze-alert.actscapital123.workers.dev
# - https://freeze-alert.actscapital.workers.dev
# - https://freeze-alert.your-account-name.workers.dev
```

## Once you have the URL:

1. Update `diagnose-stripe.js` line 9:
   ```javascript
   const WORKER_URL = 'https://freeze-alert.YOUR_ACTUAL_SUBDOMAIN.workers.dev';
   ```

2. Run the diagnostic:
   ```bash
   node diagnose-stripe.js
   ```

3. If worker is reachable, configure Stripe webhook:
   - Go to: https://dashboard.stripe.com/webhooks
   - Add endpoint: `YOUR_WORKER_URL/webhook/stripe`
   - Select events: `checkout.session.completed`
   - Copy signing secret
   - Run: `npx wrangler secret put STRIPE_WEBHOOK_SECRET`

## Quick Test

Try visiting these URLs in your browser (replace YOUR_SUBDOMAIN):

1. Health check:
   ```
   https://freeze-alert.YOUR_SUBDOMAIN.workers.dev/health
   ```
   Should return: `{"success":true,"data":{"status":"ok"}}`

2. Stripe webhook (won't work in browser, but should respond):
   ```
   https://freeze-alert.YOUR_SUBDOMAIN.workers.dev/webhook/stripe
   ```
   Should return: `Missing stripe-signature header` or similar

