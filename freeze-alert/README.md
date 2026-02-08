# Freeze Alert 🥶

SMS alerts when temperatures drop low enough to drip faucets. No app, no account, just texts.

## Quick Start

```bash
# Install dependencies
npm install

# Run tests (no credentials needed!)
npm test

# Type check
npm run typecheck

# Local development (requires credentials in .dev.vars)
npm run dev

# Deploy to production (requires Cloudflare account + credentials)
npm run deploy
```

## Project Status

**Phase:** 1 (SMS-Only MVP)
**Test Coverage:** 23/23 passing ✅
**Deployment:** Ready for production

## What's Implemented

### ✅ Core Features
- SMS signup flow via Twilio
- Stripe payment processing ($12/year subscriptions)
- NWS weather API integration
- Timezone-aware 8pm local time alerts
- Freeze threshold: 28°F or below
- Database: Cloudflare D1 (SQLite)
- Hourly cron job for alert scheduling

### ✅ Security
- Twilio webhook signature verification (HMAC-SHA1)
- Stripe webhook signature verification (HMAC-SHA256)
- Input validation (phone numbers, zip codes)
- Secrets management via environment variables
- Pre-commit hooks to prevent credential leaks

### ✅ Testing
- **23 unit tests** covering:
  - Phone validation & normalization
  - Zip code extraction from natural language SMS
  - Timezone lookups and hour matching
  - Weather API mocking (no real API calls needed!)
  - Error handling for all edge cases

## Testing Without Credentials

You can run comprehensive tests **without any credentials**:

```bash
npm test
```

All tests use mocks for external services (Twilio, Stripe, NWS). This means:
- ✅ Tests run instantly (no network calls)
- ✅ Tests never fail due to API downtime
- ✅ No need to set up accounts before testing
- ✅ 100% reproducible results

See `src/__tests__/` for examples of mocking external APIs.

## Getting Credentials

When you're ready to deploy, see **[CREDENTIALS_SETUP.md](./CREDENTIALS_SETUP.md)** for a step-by-step guide to:

1. Creating a Twilio account (~10 min, $2/month)
2. Setting up Stripe (~15 min, free + transaction fees)
3. Configuring Cloudflare Workers (~10 min, free tier)
4. Setting environment variables
5. Testing the full deployment

**Estimated setup time:** 30-40 minutes
**Monthly cost:** ~$4-5 for 100 users

## How It Works

### User Flow

```
1. User texts "78701" to your Twilio number
   ↓
2. System validates zip code and creates Stripe checkout link
   ↓
3. User receives SMS: "Freeze Alert for 78701 costs $12/year. Pay here: [link]"
   ↓
4. User pays via Stripe
   ↓
5. Stripe webhook activates subscription in database
   ↓
6. User receives SMS: "✓ Freeze Alert active for 78701!"
   ↓
7. Every hour, system checks if it's 8pm in any timezone
   ↓
8. If 8pm AND overnight low ≤ 28°F, send alert:
   "🥶 FREEZE ALERT: Low of 25°F tonight in 78701. Drip your faucets!"
```

### Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ HTTP Handler │  │ Cron Handler │  │ D1 Database     │  │
│  │              │  │              │  │                 │  │
│  │ • /health    │  │ • Runs hourly│  │ • subscriptions │  │
│  │ • /webhook/  │  │ • Finds 8pm  │  │   phone, zip,   │  │
│  │   twilio     │  │   timezones  │  │   timezone,     │  │
│  │ • /webhook/  │  │ • Fetches    │  │   status        │  │
│  │   stripe     │  │   weather    │  │                 │  │
│  │              │  │ • Sends SMS  │  │                 │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│         │                 │                    │           │
└─────────┼─────────────────┼────────────────────┼───────────┘
          │                 │                    │
          ├─────────────────┴────────────────────┘
          │
   ┌──────┴──────────────────────────────────────────┐
   │                                                  │
   ▼                                                  ▼
┌─────────┐  ┌──────────┐  ┌───────────┐  ┌─────────────┐
│ Twilio  │  │  Stripe  │  │ NWS API   │  │ Zip→Timezone│
│  SMS    │  │ Payments │  │ (Weather) │  │ JSON (71+)  │
└─────────┘  └──────────┘  └───────────┘  └─────────────┘
```

## Project Structure

```
freeze-alert/
├── src/
│   ├── __tests__/          # Unit tests (no credentials needed!)
│   │   ├── validation.test.ts
│   │   ├── timezones.test.ts
│   │   └── weather.test.ts
│   ├── handlers/
│   │   ├── twilio.ts       # SMS webhook handler
│   │   └── stripe.ts       # Payment webhook handler
│   ├── services/
│   │   ├── sms.ts          # Twilio API wrapper
│   │   ├── payments.ts     # Stripe API wrapper
│   │   └── weather.ts      # NWS API wrapper
│   ├── lib/
│   │   ├── validation.ts   # Phone & zip validation
│   │   ├── timezones.ts    # Timezone lookups
│   │   └── db.ts           # D1 database queries
│   ├── types.ts            # TypeScript types
│   └── index.ts            # Main worker entrypoint
├── data/
│   └── zip-timezones.json  # 71+ zip codes → timezones + coords
├── .github/
│   ├── pre-commit-check.sh # Prevent committing secrets
│   └── README.md
├── schema.sql              # D1 database schema
├── wrangler.toml           # Cloudflare Worker config
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .dev.vars.example       # Template for local dev credentials
├── .gitignore              # Prevents committing secrets
├── SECURITY.md             # Security best practices
├── CREDENTIALS_SETUP.md    # Step-by-step credential guide
└── README.md               # This file
```

## Development

### Prerequisites

- Node.js 18+
- npm or pnpm

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run tests (no credentials needed):**
   ```bash
   npm test
   npm run test:watch    # Watch mode
   npm run test:coverage # With coverage report
   ```

3. **Type check:**
   ```bash
   npm run typecheck
   ```

4. **Set up local credentials** (optional, for testing with real APIs):
   ```bash
   cp .dev.vars.example .dev.vars
   # Edit .dev.vars with your actual credentials
   ```

5. **Run local dev server:**
   ```bash
   npm run dev
   ```

6. **Deploy to production:**
   ```bash
   npm run deploy
   ```

### Database Commands

```bash
# Create database (production)
wrangler d1 create freeze-alert-db

# Run migration (production)
npm run db:migrate

# Run migration (local)
npm run db:migrate:local

# Query database (production)
wrangler d1 execute freeze-alert-db --remote --command "SELECT * FROM subscriptions"

# Query database (local)
wrangler d1 execute freeze-alert-db --local --command "SELECT * FROM subscriptions"
```

## Environment Variables

### Required Secrets (Production)

Set via `wrangler secret put <NAME>`:

- `TWILIO_ACCOUNT_SID` - Twilio account ID
- `TWILIO_AUTH_TOKEN` - Twilio API token
- `TWILIO_PHONE_NUMBER` - Your Twilio number (E.164 format)
- `STRIPE_SECRET_KEY` - Stripe API secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `STRIPE_PRICE_ID` - Stripe subscription price ID
- `ALERT_EMAIL` - Your email for failure notifications

### Local Development

Create `.dev.vars` (gitignored) with the same variables.

See [CREDENTIALS_SETUP.md](./CREDENTIALS_SETUP.md) for how to obtain each credential.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (returns 200) |
| `POST` | `/webhook/twilio` | Incoming SMS handler |
| `POST` | `/webhook/stripe` | Payment webhook handler |

## Cron Schedule

```
0 * * * *   # Every hour at minute 0
```

Checks for timezones where it's currently 8pm local time and sends freeze alerts if overnight low ≤ 28°F.

## Monitoring & Debugging

### View live logs
```bash
wrangler tail
```

### View cron execution history
Check Cloudflare Dashboard → Workers → freeze-alert → Logs

### View Twilio SMS logs
https://console.twilio.com/us1/monitor/logs/sms

### View Stripe webhook logs
https://dashboard.stripe.com/webhooks

### Check database contents
```bash
wrangler d1 execute freeze-alert-db --remote --command "
  SELECT phone, zip_code, status, created_at
  FROM subscriptions
  ORDER BY created_at DESC
  LIMIT 10
"
```

## Security

See [SECURITY.md](./SECURITY.md) for:
- Secrets management best practices
- Pre-commit hooks setup
- What to do if you accidentally commit secrets

## Costs & Economics

### Monthly Costs (100 users)
- Twilio phone number: $2.00/month
- SMS (20 alerts/year per user): ~$1.33/month
- Cloudflare Workers + D1: $0 (free tier)
- **Total:** ~$4/month

### Monthly Revenue (100 users)
- 100 × $12/year = $1,200/year = $100/month
- Stripe fees: ~$6.50/month (2.9% + $0.30)
- **Net:** ~$93.50/month
- **Margin:** ~93%

**Break-even:** 10 users

## Roadmap

### Phase 1: SMS-Only MVP ✅ (Current)
- [x] SMS signup
- [x] Stripe payments
- [x] NWS weather integration
- [x] Freeze alerts at 8pm
- [x] Basic error handling
- [x] 23 unit tests

### Phase 2: Web Signup + Caching
- [ ] Landing page with web form
- [ ] Weather caching (1 hour TTL)
- [ ] Rate limiting
- [ ] Daily summary emails
- [ ] Alert logging

### Phase 3: Queues + Scale
- [ ] Cloudflare Queues for SMS delivery
- [ ] Dead letter queue for failed messages
- [ ] Automatic retries
- [ ] Fallback weather source (Open-Meteo)

## Contributing

This is a personal project following the SPEC.md phased approach. See SPEC.md for the full implementation plan and decision log.

## License

See [LICENSE](../LICENSE)

## Support

For issues or questions:
- Check [CREDENTIALS_SETUP.md](./CREDENTIALS_SETUP.md) for credential help
- Check [SECURITY.md](./SECURITY.md) for security questions
- Review tests in `src/__tests__/` for usage examples
- Check Cloudflare/Twilio/Stripe logs for runtime issues

---

Built with ❄️ using Cloudflare Workers, D1, Twilio, and Stripe.
