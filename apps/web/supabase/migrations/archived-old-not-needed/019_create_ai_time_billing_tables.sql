-- Migration: Create AI Time Billing System Tables
-- Date: 2025-07-27
-- Description: Implements comprehensive AI time billing with seconds precision, welcome bonuses, daily gifts, and subscription management

BEGIN;

-- =====================================================
-- 1. USER AI TIME BALANCE TABLE
-- =====================================================

CREATE TABLE user_ai_time_balance (
  user_id UUID PRIMARY KEY,

  -- One-time bonuses (stored as seconds for precision)
  welcome_bonus_seconds INTEGER DEFAULT 3000 CHECK (welcome_bonus_seconds >= 0), -- 50 mins = 3000 seconds
  welcome_bonus_granted_at TIMESTAMP DEFAULT NOW(),

  -- Daily allocation (stored as seconds for precision)
  daily_gift_used_today INTEGER DEFAULT 0 CHECK (daily_gift_used_today >= 0 AND daily_gift_used_today <= 900), -- 15 mins = 900 seconds

  -- Paid balance (stored as seconds for precision)
  paid_seconds_remaining INTEGER DEFAULT 0 CHECK (paid_seconds_remaining >= 0),
  subscription_tier TEXT DEFAULT 'free',
  subscription_seconds_remaining INTEGER DEFAULT 0 CHECK (subscription_seconds_remaining >= 0),
  subscription_seconds_rollover INTEGER DEFAULT 0 CHECK (subscription_seconds_rollover >= 0),
  subscription_rollover_cap_seconds INTEGER DEFAULT 0,
  subscription_reset_at TIMESTAMP,

  -- Usage tracking (stored as seconds)
  total_seconds_used_today INTEGER DEFAULT 0 CHECK (total_seconds_used_today >= 0),
  total_seconds_used_lifetime INTEGER DEFAULT 0 CHECK (total_seconds_used_lifetime >= 0),
  last_used_at TIMESTAMP,

  -- Auto top-up settings
  auto_topup_enabled BOOLEAN DEFAULT false,
  auto_topup_threshold_seconds INTEGER DEFAULT 600, -- Trigger when below 10 mins
  auto_topup_package TEXT DEFAULT 'mini',           -- Default to mini package
  auto_topup_consent_at TIMESTAMP,                  -- PCI/PSD2 compliance tracking

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add indexes for performance
CREATE INDEX idx_user_balance_used_today ON user_ai_time_balance(daily_gift_used_today) WHERE daily_gift_used_today > 0;
CREATE INDEX idx_user_balance_subscription ON user_ai_time_balance(subscription_reset_at);

-- Add comments for documentation
COMMENT ON TABLE user_ai_time_balance IS 'Tracks AI time balances including welcome bonuses, daily gifts, and subscription minutes';
COMMENT ON COLUMN user_ai_time_balance.welcome_bonus_seconds IS 'One-time 50-minute welcome bonus (3000 seconds)';
COMMENT ON COLUMN user_ai_time_balance.daily_gift_used_today IS 'Seconds of daily gift used today (resets at midnight UTC)';
COMMENT ON COLUMN user_ai_time_balance.paid_seconds_remaining IS 'Seconds purchased through packages or subscriptions';
COMMENT ON COLUMN user_ai_time_balance.auto_topup_consent_at IS 'Timestamp when user consented to auto top-up for PCI/PSD2 compliance';

-- =====================================================
-- 2. AI TIME CONSUMPTION RECORDS TABLE
-- =====================================================

CREATE TABLE user_ai_time_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  build_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  session_id TEXT,

  -- Idempotency key to prevent duplicate billing
  idempotency_key TEXT UNIQUE NOT NULL, -- ${buildId}_${operation_type}

  -- Time tracking (all in seconds for precision)
  operation_type TEXT NOT NULL CHECK (operation_type IN ('main_build', 'metadata_generation', 'update')),
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  billable_seconds INTEGER NOT NULL CHECK (billable_seconds >= duration_seconds), -- Rounded up to nearest 10

  -- Consumption breakdown (in seconds)
  welcome_bonus_used_seconds INTEGER DEFAULT 0 CHECK (welcome_bonus_used_seconds >= 0),
  daily_gift_used_seconds INTEGER DEFAULT 0 CHECK (daily_gift_used_seconds >= 0),
  paid_seconds_used INTEGER DEFAULT 0 CHECK (paid_seconds_used >= 0),

  -- Balance snapshot (for reconciliation - stored in seconds)
  balance_before_seconds JSONB NOT NULL, -- {welcome: 3000, daily: 900, paid: 6000}
  balance_after_seconds JSONB NOT NULL,  -- {welcome: 2700, daily: 900, paid: 6000}

  -- Cost tracking
  effective_rate_per_minute DECIMAL(10,4),
  total_cost_usd DECIMAL(10,2),

  -- Metadata (reduced for hot table performance)
  success BOOLEAN DEFAULT true,
  error_type TEXT, -- Brief error category instead of full message
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add indexes for performance
CREATE INDEX idx_consumption_user_date ON user_ai_time_consumption(user_id, created_at);
CREATE INDEX idx_consumption_project ON user_ai_time_consumption(project_id);
CREATE INDEX idx_consumption_build ON user_ai_time_consumption(build_id);
CREATE INDEX idx_consumption_idempotency ON user_ai_time_consumption(idempotency_key);

-- Add comments for documentation
COMMENT ON TABLE user_ai_time_consumption IS 'Records all AI time consumption with billing breakdown and reconciliation data';
COMMENT ON COLUMN user_ai_time_consumption.idempotency_key IS 'Prevents duplicate billing for same operation';
COMMENT ON COLUMN user_ai_time_consumption.billable_seconds IS 'Actual seconds billed (rounded up to nearest 10-second increment)';
COMMENT ON COLUMN user_ai_time_consumption.balance_before_seconds IS 'Balance snapshot before consumption for audit trail';

-- =====================================================
-- 3. AI TIME PURCHASES TABLE
-- =====================================================

CREATE TABLE user_ai_time_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Purchase details
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('package', 'subscription', 'bonus')),
  package_name TEXT,
  minutes_purchased DECIMAL(10,2) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',

  -- Payment info
  payment_method TEXT,
  payment_id TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),

  -- Tax compliance
  tax_rate DECIMAL(5,4), -- VAT/GST rate applied
  tax_amount DECIMAL(10,2), -- Tax amount in currency
  tax_jurisdiction TEXT, -- Country/region code

  -- Metadata
  purchased_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  retention_until TIMESTAMP DEFAULT (NOW() + INTERVAL '7 years'), -- Compliance retention
  notes TEXT,

  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add indexes for performance
CREATE INDEX idx_purchases_user ON user_ai_time_purchases(user_id, purchased_at);
-- CREATE INDEX idx_purchases_retention ON user_ai_time_purchases(retention_until) WHERE retention_until < NOW() + INTERVAL '1 year';
-- ERROR:  42P17: functions in index predicate must be marked IMMUTABLE
DROP INDEX IF EXISTS idx_purchases_retention;
CREATE INDEX idx_purchases_retention
  ON user_ai_time_purchases(retention_until);

-- Add comments for documentation
COMMENT ON TABLE user_ai_time_purchases IS 'Records all AI time purchases with tax compliance and 7-year retention';
COMMENT ON COLUMN user_ai_time_purchases.retention_until IS '7-year retention for tax compliance requirements';

-- =====================================================
-- 4. AI CONSUMPTION METADATA TABLE (Separate for Performance)
-- =====================================================

CREATE TABLE user_ai_consumption_metadata (
  consumption_id UUID PRIMARY KEY,

  -- Full details (kept separate from hot consumption table)
  prompt_preview TEXT, -- First 200 chars of user prompt
  full_error_message TEXT, -- Complete error details if needed
  ai_model_used TEXT, -- claude-3-opus, claude-3-sonnet, etc.
  features_used JSONB, -- {session_resume: true, metadata_gen: true}

  -- Performance metrics
  time_to_first_output_ms INTEGER,
  claude_processing_gaps INTEGER, -- Number of >30s gaps
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (consumption_id) REFERENCES user_ai_time_consumption(id) ON DELETE CASCADE
);

-- Add indexes for performance
CREATE INDEX idx_consumption_meta_model ON user_ai_consumption_metadata(ai_model_used);
CREATE INDEX idx_consumption_meta_date ON user_ai_consumption_metadata(created_at);

-- Add comments for documentation
COMMENT ON TABLE user_ai_consumption_metadata IS 'Extended metadata for consumption records, kept separate for performance';
COMMENT ON COLUMN user_ai_consumption_metadata.prompt_preview IS 'First 200 characters of user prompt for debugging';

-- =====================================================
-- UPDATE TRIGGERS FOR updated_at
-- =====================================================

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to user_ai_time_balance
CREATE TRIGGER update_user_ai_time_balance_updated_at
    BEFORE UPDATE ON user_ai_time_balance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
