-- Migration: User Feedback Collection System
-- Date: 2026-01-21
-- Purpose: Implement subtle, non-intrusive feedback collection per FEEDBACK-COLLECTION-PLAN.md
--
-- Tables:
--   1. feedback_submissions - Explicit feedback (NPS, CSAT, binary, emoji, text, feature requests, bug reports)
--   2. feedback_eligibility - Server-side frequency caps (source of truth for cross-device enforcement)
--   3. feedback_implicit_signals - Passive behavioral signals (rage clicks, scroll depth, errors)
--
-- Key Design Decisions:
--   - Server-side eligibility is source of truth (client can cache briefly)
--   - Cooldowns key off 'shown' timestamp, not 'responded' (prevents hammering dismissers)
--   - PII scrubbing happens at API layer before insert (see piiScrubber middleware)
--   - Retention: explicit feedback 2 years, implicit signals 90 days, eligibility 1 year

-- ============================================================================
-- 1. Feedback Submissions Table (explicit feedback, retained 2 years)
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Feedback content
  type TEXT NOT NULL,
  value JSONB NOT NULL,                    -- number | string | boolean depending on type
  text_comment TEXT,                       -- Optional follow-up text (PII-scrubbed server-side)

  -- Identity (see User Identity Strategy in plan)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id TEXT NOT NULL,              -- Cookie/localStorage fallback
  session_id TEXT NOT NULL,

  -- Context
  page_url TEXT NOT NULL,
  feature_id TEXT,                         -- Stable ID, NOT route path
  trigger_point TEXT NOT NULL,             -- What triggered this prompt

  -- Prompt metadata (for analysis)
  prompt_id TEXT NOT NULL,                 -- Exact variant shown (e.g., "nps_v2")
  placement TEXT NOT NULL,                 -- inline | toast | modal | tab | banner
  goal TEXT NOT NULL,                      -- onboarding | helpfulness | satisfaction | nps | bug | feature

  -- Environment
  user_agent TEXT,
  viewport_width INT,
  viewport_height INT,
  locale TEXT,
  device_type TEXT,                        -- desktop | mobile | tablet
  build_version TEXT,                      -- Correlate feedback spikes to deployments

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Check constraints for data validation
ALTER TABLE feedback_submissions
  ADD CONSTRAINT feedback_type_check
  CHECK (type IN ('nps', 'csat', 'binary', 'emoji', 'text', 'feature_request', 'bug_report'));

ALTER TABLE feedback_submissions
  ADD CONSTRAINT feedback_placement_check
  CHECK (placement IN ('inline', 'toast', 'modal', 'tab', 'banner'));

ALTER TABLE feedback_submissions
  ADD CONSTRAINT feedback_goal_check
  CHECK (goal IN ('onboarding', 'helpfulness', 'satisfaction', 'nps', 'bug', 'feature'));

ALTER TABLE feedback_submissions
  ADD CONSTRAINT feedback_device_type_check
  CHECK (device_type IS NULL OR device_type IN ('desktop', 'mobile', 'tablet'));

-- Prevent absurdly long URLs/text
ALTER TABLE feedback_submissions
  ADD CONSTRAINT feedback_page_url_len_check
  CHECK (length(page_url) <= 2048);

ALTER TABLE feedback_submissions
  ADD CONSTRAINT feedback_text_comment_len_check
  CHECK (text_comment IS NULL OR length(text_comment) <= 10000);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback_submissions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_anonymous_id ON feedback_submissions(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback_submissions(type);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_feature_id ON feedback_submissions(feature_id) WHERE feature_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_goal ON feedback_submissions(goal);

-- Composite index for analytics queries
CREATE INDEX IF NOT EXISTS idx_feedback_type_goal_created
  ON feedback_submissions(type, goal, created_at DESC);

COMMENT ON TABLE feedback_submissions IS 'Explicit user feedback (NPS, CSAT, ratings, text). PII-scrubbed server-side. Retained 2 years.';

-- ============================================================================
-- 2. Feedback Eligibility Table (server-side frequency caps, retained 1 year)
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_eligibility (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identity: userId OR anonymousId (prefixed for clarity)
  identifier TEXT NOT NULL,                -- "user:{uuid}" or "anon:{uuid}" or "session:{uuid}"

  -- What was shown
  prompt_type TEXT NOT NULL,               -- nps | csat | micro_survey | feature_helpful | etc.
  feature_id TEXT,                         -- For feature-specific prompts

  -- Timestamps (cooldowns key off last_shown, not last_responded)
  last_shown TIMESTAMPTZ NOT NULL,
  last_responded TIMESTAMPTZ,              -- Only set if user submitted feedback

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enforce uniqueness per identifier + prompt + feature using a unique index
-- (UNIQUE constraint doesn't support expressions like COALESCE, but unique index does)
CREATE UNIQUE INDEX IF NOT EXISTS idx_eligibility_unique
  ON feedback_eligibility(identifier, prompt_type, COALESCE(feature_id, '__global__'));

-- Index for eligibility lookups (hot path)
CREATE INDEX IF NOT EXISTS idx_eligibility_lookup
  ON feedback_eligibility(identifier, prompt_type);

CREATE INDEX IF NOT EXISTS idx_eligibility_last_shown
  ON feedback_eligibility(last_shown DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_feedback_eligibility_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_feedback_eligibility_updated_at'
    AND tgrelid = 'feedback_eligibility'::regclass
  ) THEN
    CREATE TRIGGER trigger_feedback_eligibility_updated_at
      BEFORE UPDATE ON feedback_eligibility
      FOR EACH ROW EXECUTE FUNCTION update_feedback_eligibility_updated_at();
  END IF;
END $$;

COMMENT ON TABLE feedback_eligibility IS 'Server-side frequency caps. Source of truth for cross-device enforcement. Cooldowns key off last_shown.';

-- ============================================================================
-- 3. Feedback Implicit Signals Table (passive signals, retained 90 days)
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_implicit_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Signal type and value (DERIVED values only, never raw data)
  type TEXT NOT NULL,
  value JSONB NOT NULL,                    -- Derived scores/counts, not raw coordinates

  -- Context
  page_url TEXT NOT NULL,
  element_id TEXT,                         -- data-track attribute, NOT CSS selector
  session_id TEXT NOT NULL,

  -- Environment
  build_version TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Check constraints
ALTER TABLE feedback_implicit_signals
  ADD CONSTRAINT implicit_signal_type_check
  CHECK (type IN ('rage_click', 'dead_click', 'scroll_depth', 'time_on_page', 'error', 'drop_off', 'thrashing_score'));

-- Prevent raw data storage via length constraints
ALTER TABLE feedback_implicit_signals
  ADD CONSTRAINT implicit_signal_page_url_len_check
  CHECK (length(page_url) <= 512);  -- Path only, no query params with PII

ALTER TABLE feedback_implicit_signals
  ADD CONSTRAINT implicit_signal_element_id_len_check
  CHECK (element_id IS NULL OR length(element_id) <= 128);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_implicit_signals_type ON feedback_implicit_signals(type);
CREATE INDEX IF NOT EXISTS idx_implicit_signals_created ON feedback_implicit_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_implicit_signals_session ON feedback_implicit_signals(session_id);

-- Composite for common analytics query
CREATE INDEX IF NOT EXISTS idx_implicit_signals_type_created
  ON feedback_implicit_signals(type, created_at DESC);

COMMENT ON TABLE feedback_implicit_signals IS 'Passive behavioral signals (rage clicks, scroll depth). DERIVED values only. Retained 90 days.';

-- ============================================================================
-- 4. Helper Functions
-- ============================================================================

-- Check eligibility for a prompt (returns boolean + reason + cooldown_ends)
CREATE OR REPLACE FUNCTION check_feedback_eligibility(
  p_identifier TEXT,
  p_prompt_type TEXT,
  p_feature_id TEXT DEFAULT NULL,
  p_cooldown_days INT DEFAULT 90
)
RETURNS TABLE (
  eligible BOOLEAN,
  reason TEXT,
  cooldown_ends TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_shown TIMESTAMPTZ;
  v_cooldown_end TIMESTAMPTZ;
BEGIN
  -- Look up last shown timestamp
  SELECT fe.last_shown INTO v_last_shown
  FROM feedback_eligibility fe
  WHERE fe.identifier = p_identifier
    AND fe.prompt_type = p_prompt_type
    AND COALESCE(fe.feature_id, '__global__') = COALESCE(p_feature_id, '__global__');

  -- No record = eligible
  IF v_last_shown IS NULL THEN
    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Calculate cooldown end
  v_cooldown_end := v_last_shown + (p_cooldown_days || ' days')::INTERVAL;

  -- Check if cooldown has passed
  IF NOW() >= v_cooldown_end THEN
    RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TIMESTAMPTZ;
  ELSE
    RETURN QUERY SELECT FALSE, 'cooldown_active'::TEXT, v_cooldown_end;
  END IF;

  RETURN;
END;
$$;

COMMENT ON FUNCTION check_feedback_eligibility IS 'Check if user is eligible to see a prompt. Cooldowns key off last_shown.';

-- Record that a prompt was shown (upsert pattern)
CREATE OR REPLACE FUNCTION record_feedback_shown(
  p_identifier TEXT,
  p_prompt_type TEXT,
  p_feature_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO feedback_eligibility (identifier, prompt_type, feature_id, last_shown)
  VALUES (p_identifier, p_prompt_type, p_feature_id, NOW())
  ON CONFLICT (identifier, prompt_type, (COALESCE(feature_id, '__global__')))
  DO UPDATE SET last_shown = NOW();
END;
$$;

-- Record that user responded (update last_responded only)
CREATE OR REPLACE FUNCTION record_feedback_responded(
  p_identifier TEXT,
  p_prompt_type TEXT,
  p_feature_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE feedback_eligibility
  SET last_responded = NOW()
  WHERE identifier = p_identifier
    AND prompt_type = p_prompt_type
    AND COALESCE(feature_id, '__global__') = COALESCE(p_feature_id, '__global__');
END;
$$;

-- ============================================================================
-- 5. Cleanup Function (called by cron job)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_feedback_data()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete implicit signals older than 90 days
  DELETE FROM feedback_implicit_signals
  WHERE created_at < NOW() - INTERVAL '90 days';

  -- Delete eligibility records older than 1 year
  DELETE FROM feedback_eligibility
  WHERE last_shown < NOW() - INTERVAL '1 year';

  -- Note: feedback_submissions retained 2 years, handled separately
  -- (might want manual review before deletion)
END;
$$;

COMMENT ON FUNCTION cleanup_feedback_data IS 'Remove old feedback data per retention policy. Run via cron daily.';

-- ============================================================================
-- 6. RLS Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_implicit_signals ENABLE ROW LEVEL SECURITY;

-- Feedback submissions: anyone can insert (with ownership constraints), only service_role can read all
-- Security: prevent user_id spoofing - authenticated users can only claim their own ID
CREATE POLICY "Allow insert feedback (safe)" ON feedback_submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    -- Authenticated users must use their own user_id (or NULL for anonymous submission)
    (auth.role() = 'authenticated' AND (user_id = auth.uid() OR user_id IS NULL))
    OR
    -- Anon users cannot set user_id at all
    (auth.role() = 'anon' AND user_id IS NULL)
  );

CREATE POLICY "Service role read feedback" ON feedback_submissions
  FOR SELECT TO service_role
  USING (true);

CREATE POLICY "Service role all feedback" ON feedback_submissions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can read their own feedback (optional - for "my feedback" feature)
CREATE POLICY "Users read own feedback" ON feedback_submissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Eligibility: SERVICE ROLE ONLY
-- Security: eligibility is server-side source of truth - no direct client access
-- Clients must go through API (/api/feedback/eligibility) which uses service_role
-- This prevents manipulation of cooldowns and cross-device enforcement
CREATE POLICY "Service role all eligibility" ON feedback_eligibility
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Implicit signals: anyone can insert, only service_role can read
CREATE POLICY "Allow insert implicit signals" ON feedback_implicit_signals
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Service role read implicit signals" ON feedback_implicit_signals
  FOR SELECT TO service_role
  USING (true);

CREATE POLICY "Service role all implicit signals" ON feedback_implicit_signals
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 7. Idempotency Note
-- ============================================================================

-- Idempotency is enforced by the PRIMARY KEY on feedback_submissions.id
-- Client generates UUID, INSERT fails with unique violation if duplicate
-- No additional index needed (PRIMARY KEY already creates unique index)
