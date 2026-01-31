-- Migration: Feedback Triage & Close the Loop
-- Date: 2026-01-22
-- Purpose: Add triage workflow columns and close-the-loop tracking for Phase 5
--
-- New columns on feedback_submissions:
--   - status: Workflow state (unprocessed → acknowledged → in_progress → resolved → closed)
--   - disposition: Categorization (actionable, duplicate, not_actionable, etc.)
--   - priority: Urgency level (low, medium, high, critical)
--   - assigned_to: Admin user responsible
--   - labels: Array of tags for categorization
--   - resolution_note: What action was taken
--   - linked_item_id: Link to roadmap/issue tracker
--   - notified_at: When user was notified of resolution
--   - updated_at: Track last modification
--
-- New table:
--   - feedback_notifications: Track close-the-loop notifications sent

-- ============================================================================
-- 1. Add Triage Columns to feedback_submissions
-- ============================================================================

ALTER TABLE feedback_submissions
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unprocessed' NOT NULL,
  ADD COLUMN IF NOT EXISTS disposition TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium' NOT NULL,
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS linked_item_id TEXT,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;

-- Check constraints for new columns
ALTER TABLE feedback_submissions
  ADD CONSTRAINT feedback_status_check
  CHECK (status IN ('unprocessed', 'acknowledged', 'in_progress', 'resolved', 'closed'));

ALTER TABLE feedback_submissions
  ADD CONSTRAINT feedback_disposition_check
  CHECK (disposition IS NULL OR disposition IN (
    'actionable',
    'duplicate',
    'not_actionable',
    'out_of_scope',
    'wont_fix',
    'needs_info',
    'already_exists'
  ));

ALTER TABLE feedback_submissions
  ADD CONSTRAINT feedback_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE feedback_submissions
  ADD CONSTRAINT feedback_resolution_note_len_check
  CHECK (resolution_note IS NULL OR length(resolution_note) <= 2000);

-- Indexes for triage queries
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_submissions(status);
CREATE INDEX IF NOT EXISTS idx_feedback_priority ON feedback_submissions(priority) WHERE priority IN ('high', 'critical');
CREATE INDEX IF NOT EXISTS idx_feedback_assigned_to ON feedback_submissions(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_disposition ON feedback_submissions(disposition) WHERE disposition IS NOT NULL;

-- Composite index for triage dashboard (unprocessed items sorted by time)
CREATE INDEX IF NOT EXISTS idx_feedback_triage_queue
  ON feedback_submissions(status, priority, created_at DESC)
  WHERE status IN ('unprocessed', 'acknowledged', 'in_progress');

-- GIN index for label array searches
CREATE INDEX IF NOT EXISTS idx_feedback_labels ON feedback_submissions USING GIN(labels);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_feedback_submissions_updated_at()
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
    WHERE tgname = 'trigger_feedback_submissions_updated_at'
    AND tgrelid = 'feedback_submissions'::regclass
  ) THEN
    CREATE TRIGGER trigger_feedback_submissions_updated_at
      BEFORE UPDATE ON feedback_submissions
      FOR EACH ROW EXECUTE FUNCTION update_feedback_submissions_updated_at();
  END IF;
END $$;

-- ============================================================================
-- 2. Feedback Notifications Table (Close the Loop Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link to original feedback
  feedback_id UUID NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,

  -- Recipient (may be user_id or email for anonymous)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,

  -- Notification content
  notification_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Delivery status
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID  -- Admin who triggered the notification
);

-- Check constraints
ALTER TABLE feedback_notifications
  ADD CONSTRAINT notification_type_check
  CHECK (notification_type IN (
    'acknowledged',
    'in_progress',
    'feature_shipped',
    'bug_fixed',
    'resolved',
    'needs_info'
  ));

ALTER TABLE feedback_notifications
  ADD CONSTRAINT notification_channel_check
  CHECK (channel IN ('email', 'in_app', 'push'));

ALTER TABLE feedback_notifications
  ADD CONSTRAINT notification_status_check
  CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'skipped'));

-- Ensure notifications have a recipient (either user_id or email)
ALTER TABLE feedback_notifications
  ADD CONSTRAINT notification_recipient_check
  CHECK (user_id IS NOT NULL OR email IS NOT NULL);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_feedback_id ON feedback_notifications(feedback_id);
CREATE INDEX IF NOT EXISTS idx_notification_user_id ON feedback_notifications(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_status ON feedback_notifications(status) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_notification_created_at ON feedback_notifications(created_at DESC);

-- Enable RLS
ALTER TABLE feedback_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Service role all notifications" ON feedback_notifications
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users read own notifications" ON feedback_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE feedback_notifications IS 'Tracks close-the-loop notifications sent to users when their feedback is addressed.';

-- ============================================================================
-- 3. Feedback Audit Log Table (Track Admin Actions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- What changed
  feedback_id UUID NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,

  -- Who changed it
  admin_id UUID NOT NULL,
  admin_email TEXT,

  -- Change details
  old_value JSONB,
  new_value JSONB,
  comment TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Check constraint for action
ALTER TABLE feedback_audit_log
  ADD CONSTRAINT audit_action_check
  CHECK (action IN (
    'status_change',
    'disposition_change',
    'priority_change',
    'assign',
    'unassign',
    'label_add',
    'label_remove',
    'resolution_added',
    'notification_sent',
    'bulk_action'
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_feedback_id ON feedback_audit_log(feedback_id);
CREATE INDEX IF NOT EXISTS idx_audit_admin_id ON feedback_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON feedback_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE feedback_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policy (admin only via service role)
CREATE POLICY "Service role all audit" ON feedback_audit_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE feedback_audit_log IS 'Audit trail of admin actions on feedback submissions.';

-- ============================================================================
-- 4. Helper Functions
-- ============================================================================

-- Get triage stats by status
CREATE OR REPLACE FUNCTION get_feedback_triage_stats()
RETURNS TABLE (
  status TEXT,
  count BIGINT,
  oldest_unprocessed TIMESTAMPTZ,
  critical_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fs.status,
    COUNT(*)::BIGINT,
    MIN(CASE WHEN fs.status = 'unprocessed' THEN fs.created_at END),
    COUNT(*) FILTER (WHERE fs.priority = 'critical')::BIGINT
  FROM feedback_submissions fs
  GROUP BY fs.status;
END;
$$;

-- Get detractor rate over time period
CREATE OR REPLACE FUNCTION get_nps_detractor_rate(
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  total_nps BIGINT,
  detractor_count BIGINT,
  passive_count BIGINT,
  promoter_count BIGINT,
  detractor_rate NUMERIC,
  nps_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_nps,
    COUNT(*) FILTER (WHERE (fs.value->>'score')::INT <= 6)::BIGINT AS detractor_count,
    COUNT(*) FILTER (WHERE (fs.value->>'score')::INT IN (7, 8))::BIGINT AS passive_count,
    COUNT(*) FILTER (WHERE (fs.value->>'score')::INT >= 9)::BIGINT AS promoter_count,
    ROUND(
      (COUNT(*) FILTER (WHERE (fs.value->>'score')::INT <= 6)::NUMERIC /
       NULLIF(COUNT(*), 0) * 100), 2
    ) AS detractor_rate,
    ROUND(
      ((COUNT(*) FILTER (WHERE (fs.value->>'score')::INT >= 9)::NUMERIC -
        COUNT(*) FILTER (WHERE (fs.value->>'score')::INT <= 6)::NUMERIC) /
       NULLIF(COUNT(*), 0) * 100), 2
    ) AS nps_score
  FROM feedback_submissions fs
  WHERE fs.type = 'nps'
    AND fs.created_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$;

-- Get frustration signal rate (rage clicks, dead clicks)
CREATE OR REPLACE FUNCTION get_frustration_signal_rate(
  p_days INT DEFAULT 7
)
RETURNS TABLE (
  signal_type TEXT,
  count BIGINT,
  unique_sessions BIGINT,
  daily_avg NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fis.type,
    COUNT(*)::BIGINT,
    COUNT(DISTINCT fis.session_id)::BIGINT,
    ROUND(COUNT(*)::NUMERIC / p_days, 2)
  FROM feedback_implicit_signals fis
  WHERE fis.type IN ('rage_click', 'dead_click', 'error')
    AND fis.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY fis.type;
END;
$$;

COMMENT ON FUNCTION get_feedback_triage_stats IS 'Get dashboard stats for feedback triage queue.';
COMMENT ON FUNCTION get_nps_detractor_rate IS 'Calculate NPS detractor rate over time period for alerting.';
COMMENT ON FUNCTION get_frustration_signal_rate IS 'Get frustration signal rates for alerting.';

-- ============================================================================
-- 5. Alerting Threshold Views
-- ============================================================================

-- View: Feedback requiring urgent attention
CREATE OR REPLACE VIEW feedback_urgent_queue AS
SELECT
  id,
  type,
  value,
  text_comment,
  user_id,
  page_url,
  feature_id,
  priority,
  status,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 AS hours_old
FROM feedback_submissions
WHERE status IN ('unprocessed', 'acknowledged')
  AND (
    priority = 'critical'
    OR (priority = 'high' AND created_at < NOW() - INTERVAL '4 hours')
    OR (priority = 'medium' AND created_at < NOW() - INTERVAL '24 hours')
    OR (type = 'bug_report')
  )
ORDER BY
  CASE priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  created_at ASC;

COMMENT ON VIEW feedback_urgent_queue IS 'Feedback items requiring urgent attention based on priority and age.';
