# Security Guidelines

## Secrets Management

This project uses environment variables for all sensitive credentials. **Never commit secrets to Git.**

### Required Secrets

All secrets are configured via Cloudflare Workers environment variables or `.dev.vars` for local development:

- `TWILIO_ACCOUNT_SID` - Twilio account identifier
- `TWILIO_AUTH_TOKEN` - Twilio API authentication token
- `TWILIO_PHONE_NUMBER` - Twilio phone number (E.164 format)
- `STRIPE_SECRET_KEY` - Stripe API secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `STRIPE_PRICE_ID` - Stripe subscription price ID
- `ALERT_EMAIL` - Email for failure notifications

### Local Development

1. Copy `.dev.vars.example` to `.dev.vars`
2. Fill in your actual credentials
3. `.dev.vars` is already in `.gitignore` and will not be committed

### Production Deployment

Secrets are set via Wrangler CLI:
```bash
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
# ... repeat for each secret
```

### If Secrets Are Accidentally Committed

If you accidentally commit secrets:

1. **Immediately rotate all exposed credentials** in Twilio and Stripe dashboards
2. Remove the secrets from Git history using `git filter-branch` or BFG Repo-Cleaner
3. Force push to remote (coordinate with team first)
4. Review Git history to ensure secrets are removed

### Security Best Practices

- Never hardcode secrets in source code
- Never commit `.dev.vars` or any file containing secrets
- Rotate secrets regularly
- Use different credentials for development and production
- Review `.gitignore` before committing changes

