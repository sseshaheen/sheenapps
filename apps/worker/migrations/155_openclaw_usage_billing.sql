-- Migration 155: OpenClaw Usage & Billing Tables
--
-- Creates tables for:
-- 1. Usage tracking (messages + tokens) per project
-- 2. Billing periods and quotas
-- 3. Pricing configuration
-- 4. WhatsApp beta feature flag seed
--
-- Reference: /docs/SHEENAPPS_OPENCLAW_ANALYSIS.md Phase 3

BEGIN;

-- =============================================================================
-- Table: openclaw_usage
-- Purpose: Track message and token usage per project for billing
-- =============================================================================

CREATE TABLE IF NOT EXISTS openclaw_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,

  -- Message counts
  messages_received INTEGER NOT NULL DEFAULT 0,
  messages_sent INTEGER NOT NULL DEFAULT 0,

  -- Token counts (for LLM billing)
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,

  -- Channel breakdown (JSONB for flexibility)
  channel_usage JSONB DEFAULT '{}',
  -- Example: {"telegram": {"messages": 100, "tokens": 5000}, "webchat": {"messages": 50, "tokens": 2500}}

  -- Cost tracking (in cents)
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One record per project per billing period
  CONSTRAINT uq_openclaw_usage_project_period
    UNIQUE (project_id, billing_period_start)
);

-- Index for billing queries
CREATE INDEX IF NOT EXISTS idx_openclaw_usage_project
  ON openclaw_usage(project_id, billing_period_start DESC);

-- Index for reporting
CREATE INDEX IF NOT EXISTS idx_openclaw_usage_period
  ON openclaw_usage(billing_period_start, billing_period_end);

COMMENT ON TABLE openclaw_usage IS
  'Monthly usage tracking for OpenClaw billing. Aggregates messages and tokens per project.';

-- =============================================================================
-- Table: openclaw_quotas
-- Purpose: Define quotas per project (can be tier-based or custom)
-- =============================================================================

CREATE TABLE IF NOT EXISTS openclaw_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL UNIQUE,

  -- Monthly quotas
  messages_limit INTEGER NOT NULL DEFAULT 500,
  tokens_limit INTEGER NOT NULL DEFAULT 100000,

  -- Overage pricing (in cents)
  message_overage_cents INTEGER NOT NULL DEFAULT 2,  -- $0.02 per message
  token_overage_cents INTEGER NOT NULL DEFAULT 50,   -- $0.50 per 100K tokens (stored as per 100K)

  -- Enabled channels
  telegram_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  webchat_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,  -- Beta, disabled by default

  -- Custom settings
  custom_pricing JSONB DEFAULT NULL,  -- For enterprise/custom tiers

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE openclaw_quotas IS
  'Per-project quotas and pricing for OpenClaw. Default values can be overridden for enterprise.';

-- =============================================================================
-- Table: openclaw_pricing_tiers
-- Purpose: Define standard pricing tiers for OpenClaw add-on
-- =============================================================================

CREATE TABLE IF NOT EXISTS openclaw_pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,

  -- Monthly base price (in cents)
  base_price_cents INTEGER NOT NULL,

  -- Included quotas
  messages_included INTEGER NOT NULL,
  tokens_included INTEGER NOT NULL,

  -- Overage pricing (in cents)
  message_overage_cents INTEGER NOT NULL,
  token_overage_cents INTEGER NOT NULL,  -- Per 100K tokens

  -- Channel access
  telegram_included BOOLEAN NOT NULL DEFAULT TRUE,
  webchat_included BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_included BOOLEAN NOT NULL DEFAULT FALSE,

  -- Regional pricing multipliers (applied to base_price_cents)
  -- Stored separately in pricing tables, but this is the default

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default pricing tiers
INSERT INTO openclaw_pricing_tiers (
  tier_key, name, description,
  base_price_cents, messages_included, tokens_included,
  message_overage_cents, token_overage_cents,
  telegram_included, webchat_included, whatsapp_included,
  sort_order
) VALUES
  -- Starter tier: $19/mo base
  (
    'ai_assistant_starter',
    'AI Assistant Starter',
    'Perfect for small businesses. Telegram & WebChat support.',
    1900, 500, 100000,
    2, 50,
    TRUE, TRUE, FALSE,
    1
  ),
  -- Pro tier: $49/mo base
  (
    'ai_assistant_pro',
    'AI Assistant Pro',
    'For growing businesses. Higher limits + priority support.',
    4900, 2000, 500000,
    1, 40,
    TRUE, TRUE, FALSE,
    2
  ),
  -- Enterprise tier: $149/mo base (includes WhatsApp beta)
  (
    'ai_assistant_enterprise',
    'AI Assistant Enterprise',
    'Full access including WhatsApp beta. Custom limits available.',
    14900, 10000, 2000000,
    1, 30,
    TRUE, TRUE, TRUE,
    3
  )
ON CONFLICT (tier_key) DO NOTHING;

COMMENT ON TABLE openclaw_pricing_tiers IS
  'Standard pricing tiers for OpenClaw AI Assistant add-on. Regional multipliers applied separately.';

-- =============================================================================
-- Seed WhatsApp Beta Feature Flag
-- =============================================================================

-- Insert the WhatsApp beta feature flag (if not exists)
INSERT INTO feature_flags (
  name,
  description,
  status,
  target_user_ids,
  target_plans,
  is_kill_switch,
  created_by
)
SELECT
  'openclaw_whatsapp_beta',
  'Enable WhatsApp channel for OpenClaw AI Assistant (beta). High ban risk with Baileys.',
  'off',  -- Disabled by default
  '{}'::uuid[],   -- No specific users targeted initially (explicit cast)
  ARRAY['ai_assistant_enterprise']::text[],  -- Only enterprise tier (explicit cast)
  TRUE,   -- This is a kill switch for quick disable
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags WHERE name = 'openclaw_whatsapp_beta'
);

-- Also add a general OpenClaw kill switch
INSERT INTO feature_flags (
  name,
  description,
  status,
  target_user_ids,
  target_plans,
  is_kill_switch,
  created_by
)
SELECT
  'openclaw_enabled',
  'Master kill switch for OpenClaw AI Assistant. Disabling stops all AI responses.',
  'on',   -- Enabled by default
  '{}'::uuid[],   -- No specific users (explicit cast)
  '{}'::text[],   -- No specific plans (explicit cast)
  TRUE,   -- Kill switch for emergencies
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags WHERE name = 'openclaw_enabled'
);

-- =============================================================================
-- Add trigger for usage updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_openclaw_usage_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_openclaw_usage_updated'
  ) THEN
    CREATE TRIGGER tr_openclaw_usage_updated
      BEFORE UPDATE ON openclaw_usage
      FOR EACH ROW
      EXECUTE FUNCTION update_openclaw_usage_timestamp();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_openclaw_quotas_updated'
  ) THEN
    CREATE TRIGGER tr_openclaw_quotas_updated
      BEFORE UPDATE ON openclaw_quotas
      FOR EACH ROW
      EXECUTE FUNCTION update_openclaw_usage_timestamp();
  END IF;
END $$;

COMMIT;
