-- Freeze Alert Phase 1 Schema
-- SMS-only MVP for pipe freeze alerts

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  phone TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(phone, zip_code)
);

-- Index for finding active subscriptions by timezone (used in cron)
CREATE INDEX IF NOT EXISTS idx_subs_tz_status ON subscriptions(timezone) WHERE status = 'active';

-- Index for looking up subscriptions by phone (used in webhook handlers)
CREATE INDEX IF NOT EXISTS idx_subs_phone ON subscriptions(phone);

