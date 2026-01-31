-- Migration: 100_feature_flags.sql
-- Feature Flags with Kill Switches and Targeted Releases
-- Created: 2026-01-09

BEGIN;

-- ============================================================================
-- Feature Flags Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,

  -- Status: simple on/off (no percentage rollouts)
  status TEXT NOT NULL DEFAULT 'off' CHECK (status IN ('on', 'off')),

  -- Targeting: enable for specific users or plans
  -- If both empty and status='on', flag is enabled for everyone
  -- If either has values, user must match at least one (OR logic)
  target_user_ids UUID[] DEFAULT '{}',
  target_plans TEXT[] DEFAULT '{}',

  -- Kill switch: critical flags that need instant toggle capability
  is_kill_switch BOOLEAN DEFAULT false,

  -- Metadata
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE feature_flags IS 'Feature flags for kill switches and targeted releases';
COMMENT ON COLUMN feature_flags.target_user_ids IS 'Specific user IDs to enable flag for';
COMMENT ON COLUMN feature_flags.target_plans IS 'Plan keys to enable flag for (e.g., pro, enterprise)';
COMMENT ON COLUMN feature_flags.is_kill_switch IS 'Critical flags that can be toggled instantly without confirmation';

-- ============================================================================
-- Feature Flag Audit Table (append-only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_flag_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id UUID REFERENCES feature_flags(id) ON DELETE CASCADE,
  flag_name TEXT NOT NULL, -- Denormalized for history after flag deletion

  -- What changed
  action TEXT NOT NULL, -- 'created', 'updated', 'toggled', 'deleted'
  old_value JSONB,
  new_value JSONB,

  -- Why (required for all changes)
  reason TEXT NOT NULL,

  -- Who
  changed_by UUID,
  changed_by_email TEXT, -- Denormalized for display
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE feature_flag_audit IS 'Audit log for all feature flag changes';

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags(name);
CREATE INDEX IF NOT EXISTS idx_feature_flags_status ON feature_flags(status);
CREATE INDEX IF NOT EXISTS idx_feature_flags_kill_switch ON feature_flags(is_kill_switch) WHERE is_kill_switch = true;
CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_flag_id ON feature_flag_audit(flag_id);
CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_changed_at ON feature_flag_audit(changed_at DESC);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY;

ALTER TABLE feature_flag_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag_audit FORCE ROW LEVEL SECURITY;

-- Admin-only access (bypassed by service role)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_feature_flags_all') THEN
    CREATE POLICY admin_feature_flags_all ON feature_flags FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_feature_flag_audit_all') THEN
    CREATE POLICY admin_feature_flag_audit_all ON feature_flag_audit FOR ALL USING (true);
  END IF;
END $$;

-- ============================================================================
-- Updated_at Trigger
-- ============================================================================

-- Reuse existing function if available, otherwise create
CREATE OR REPLACE FUNCTION update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_feature_flags_updated_at') THEN
    CREATE TRIGGER trg_feature_flags_updated_at
      BEFORE UPDATE ON feature_flags
      FOR EACH ROW EXECUTE FUNCTION update_feature_flags_updated_at();
  END IF;
END $$;

-- ============================================================================
-- Seed some example kill switches (optional, can be removed)
-- ============================================================================

-- Example kill switches for common scenarios
-- INSERT INTO feature_flags (name, description, status, is_kill_switch) VALUES
--   ('builds_enabled', 'Master switch for all build operations', 'on', true),
--   ('payments_enabled', 'Master switch for payment processing', 'on', true),
--   ('signups_enabled', 'Master switch for new user signups', 'on', true)
-- ON CONFLICT (name) DO NOTHING;

COMMIT;
