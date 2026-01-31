-- Migration: 099_customer_health_scores.sql
-- Phase 2.1: Customer Health Score System
--
-- Creates user_health_scores table for transparent, heuristic-based health scoring.
-- Formula: 100-point scale with explainable breakdown
--
-- Signals:
--   - Usage Recency (0-30 pts): Last active timing
--   - Activation (0-20 pts): First successful build completed
--   - Build Health (0-20 pts): Build success rate last 30d
--   - Billing Risk (0-20 pts): Payment failures last 90d
--   - Support Load (0-10 pts): Open support tickets
--   - Recent Success (+5 bonus): Successful build in last 7d
--
-- Status categories:
--   - healthy (80-100): Green - Nurture, upsell opportunities
--   - monitor (60-79): Yellow - Check in proactively
--   - at_risk (40-59): Orange - Immediate outreach
--   - critical (0-39): Red - Escalate, save attempt
--   - onboarding: Blue - Account < 14 days old

BEGIN;

-- Main health scores table with full breakdown for explainability
CREATE TABLE IF NOT EXISTS user_health_scores (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Overall score and status
  score INT NOT NULL CHECK (score >= 0 AND score <= 105), -- 100 base + 5 bonus max
  status TEXT NOT NULL CHECK (status IN ('healthy', 'monitor', 'at_risk', 'critical', 'onboarding')),

  -- Breakdown (for explainability)
  usage_recency_score INT DEFAULT 0 CHECK (usage_recency_score >= 0 AND usage_recency_score <= 30),
  activation_score INT DEFAULT 0 CHECK (activation_score >= 0 AND activation_score <= 20),
  build_health_score INT DEFAULT 0 CHECK (build_health_score >= 0 AND build_health_score <= 20),
  billing_risk_score INT DEFAULT 0 CHECK (billing_risk_score >= 0 AND billing_risk_score <= 20),
  support_load_score INT DEFAULT 0 CHECK (support_load_score >= 0 AND support_load_score <= 10),
  recent_success_bonus INT DEFAULT 0 CHECK (recent_success_bonus >= 0 AND recent_success_bonus <= 5),

  -- Reasons (human-readable explanations)
  score_reasons TEXT[] DEFAULT '{}',

  -- Trend tracking
  score_7d_ago INT,
  score_30d_ago INT,
  trend TEXT CHECK (trend IN ('up', 'down', 'stable')),

  -- Metadata
  account_created_at TIMESTAMPTZ,
  account_age_days INT,

  -- Timing
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_health_scores ENABLE ROW LEVEL SECURITY;

-- Admin-only access (health scores are internal metrics)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'health_scores_admin_only' AND polrelid = 'user_health_scores'::regclass) THEN
    CREATE POLICY health_scores_admin_only ON user_health_scores
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_health_scores_status ON user_health_scores(status);
CREATE INDEX IF NOT EXISTS idx_health_scores_score ON user_health_scores(score);
CREATE INDEX IF NOT EXISTS idx_health_scores_calculated ON user_health_scores(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_scores_trend ON user_health_scores(trend) WHERE trend = 'down';

-- Composite index for at-risk filtering
CREATE INDEX IF NOT EXISTS idx_health_scores_at_risk ON user_health_scores(status, score)
  WHERE status IN ('at_risk', 'critical');

-- Historical snapshots for trend analysis
CREATE TABLE IF NOT EXISTS user_health_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score INT NOT NULL,
  status TEXT NOT NULL,
  breakdown JSONB NOT NULL, -- Full score breakdown at that point
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on history
ALTER TABLE user_health_score_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'health_history_admin_only' AND polrelid = 'user_health_score_history'::regclass) THEN
    CREATE POLICY health_history_admin_only ON user_health_score_history
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- Index for history lookups
CREATE INDEX IF NOT EXISTS idx_health_history_user_date ON user_health_score_history(user_id, calculated_at DESC);

-- Partition history by month for efficient querying and cleanup (optional cleanup via cron)
CREATE INDEX IF NOT EXISTS idx_health_history_date ON user_health_score_history(calculated_at DESC);

-- Admin notes and tags tables (for Customer 360 support)
CREATE TABLE IF NOT EXISTS user_admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_admin_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_notes_admin_only' AND polrelid = 'user_admin_notes'::regclass) THEN
    CREATE POLICY admin_notes_admin_only ON user_admin_notes
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_notes_user ON user_admin_notes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_admin_tags (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  added_by UUID NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, tag)
);

ALTER TABLE user_admin_tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_tags_admin_only' AND polrelid = 'user_admin_tags'::regclass) THEN
    CREATE POLICY admin_tags_admin_only ON user_admin_tags
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_tags_user ON user_admin_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_tags_tag ON user_admin_tags(tag);

-- Contact log for manual outreach tracking
CREATE TABLE IF NOT EXISTS user_contact_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('email', 'call', 'meeting', 'chat', 'other')),
  summary TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_contact_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'contact_log_admin_only' AND polrelid = 'user_contact_log'::regclass) THEN
    CREATE POLICY contact_log_admin_only ON user_contact_log
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contact_log_user ON user_contact_log(user_id, created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_health_score_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_health_score_updated_at' AND tgrelid = 'user_health_scores'::regclass) THEN
    CREATE TRIGGER trigger_health_score_updated_at
      BEFORE UPDATE ON user_health_scores
      FOR EACH ROW
      EXECUTE FUNCTION update_health_score_updated_at();
  END IF;
END $$;

-- Add comment
COMMENT ON TABLE user_health_scores IS 'Customer health scores with transparent heuristic-based calculation. Formula: Usage Recency (30) + Activation (20) + Build Health (20) + Billing Risk (20) + Support Load (10) + Recent Success Bonus (5)';

COMMIT;
