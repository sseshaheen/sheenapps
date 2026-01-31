-- Migration: Admin Panel - Incidents and Alerts
-- Implements incident management and alerting system
-- Part of Phase 1: Operational Reliability

BEGIN;

-- ============================================================================
-- PART 1: Incidents Table
-- ============================================================================
-- Core incident tracking with severity levels, status workflow, and deduplication

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Deduplication key: prevents duplicate incidents for same issue
  -- Format: "api_high_error_rate_2026-01-08" or similar
  incident_key TEXT,

  -- Basic info
  title TEXT NOT NULL,
  severity INT NOT NULL CHECK (severity BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'investigating'
    CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),

  -- Affected systems (checkboxes in UI)
  affected_systems TEXT[] DEFAULT '{}',

  -- Status page message (seed for future status page)
  status_page_message TEXT,

  -- Initial description
  description TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ownership
  created_by UUID REFERENCES auth.users(id),
  resolved_by UUID REFERENCES auth.users(id),

  -- Auto-calculated duration (only for resolved incidents)
  -- For open incidents, compute live duration at query time: EXTRACT(EPOCH FROM (NOW() - created_at)) / 60
  duration_minutes INT GENERATED ALWAYS AS (
    CASE WHEN resolved_at IS NULL THEN NULL
         ELSE EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60
    END
  ) STORED
);

-- Unique index for incident_key (allows NULL for manually created incidents)
CREATE UNIQUE INDEX IF NOT EXISTS idx_incident_key_unique
  ON incidents(incident_key)
  WHERE incident_key IS NOT NULL;

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_incidents_status
  ON incidents(status, created_at DESC);

-- Index for severity queries
CREATE INDEX IF NOT EXISTS idx_incidents_severity
  ON incidents(severity, created_at DESC);

-- ============================================================================
-- PART 2: Incident Timeline (APPEND-ONLY)
-- ============================================================================
-- Audit-grade timeline - no UPDATE or DELETE allowed

CREATE TABLE IF NOT EXISTS incident_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,

  -- Entry content
  message TEXT NOT NULL,
  entry_type TEXT DEFAULT 'manual'
    CHECK (entry_type IN ('manual', 'status_change', 'alert_trigger', 'system', 'correction')),

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index for timeline queries
CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident
  ON incident_timeline(incident_id, created_at ASC);

-- APPEND-ONLY enforcement: deny UPDATE and DELETE
CREATE OR REPLACE FUNCTION deny_timeline_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'incident_timeline is append-only. To correct an entry, add a new entry with type=correction.';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prevent_timeline_update'
    AND tgrelid = 'incident_timeline'::regclass
  ) THEN
    CREATE TRIGGER prevent_timeline_update
      BEFORE UPDATE ON incident_timeline
      FOR EACH ROW EXECUTE FUNCTION deny_timeline_mutation();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prevent_timeline_delete'
    AND tgrelid = 'incident_timeline'::regclass
  ) THEN
    CREATE TRIGGER prevent_timeline_delete
      BEFORE DELETE ON incident_timeline
      FOR EACH ROW EXECUTE FUNCTION deny_timeline_mutation();
  END IF;
END $$;

-- ============================================================================
-- PART 3: Incident Post-Mortems
-- ============================================================================
-- Required for SEV1-2 incidents

CREATE TABLE IF NOT EXISTS incident_postmortems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE UNIQUE,

  -- Post-mortem content
  what_happened TEXT,
  impact TEXT,
  root_cause TEXT,
  lessons_learned TEXT,

  -- Action items: [{title, owner, due_date, status}]
  action_items JSONB DEFAULT '[]',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 4: Alert Rules
-- ============================================================================
-- Configurable alert rules with thresholds and notification channels

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule definition
  name TEXT NOT NULL,
  description TEXT,
  metric_name TEXT NOT NULL,       -- 'api_error_rate', 'build_success_rate', etc.
  dimensions JSONB DEFAULT '{}',   -- Filter dimensions, e.g., {route: '/api/build'}

  -- Threshold configuration
  condition TEXT NOT NULL CHECK (condition IN ('gt', 'lt', 'gte', 'lte', 'eq')),
  threshold NUMERIC NOT NULL,
  duration_minutes INT DEFAULT 5,  -- Must breach for X minutes

  -- Alert metadata
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  channels JSONB NOT NULL,         -- [{type: 'slack', webhook: '...'}, {type: 'email', to: [...]}]

  -- State
  enabled BOOLEAN DEFAULT true,
  last_evaluated_at TIMESTAMPTZ,
  last_fired_at TIMESTAMPTZ,

  -- Ownership
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for enabled rules (evaluator query)
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled
  ON alert_rules(enabled, metric_name)
  WHERE enabled = true;

-- ============================================================================
-- PART 5: Alerts Fired (History)
-- ============================================================================
-- Tracks alert firing history with fingerprinting for per-dimension uniqueness

CREATE TABLE IF NOT EXISTS alerts_fired (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,

  -- Fingerprint = hash(rule_id + dimensions) for per-dimension uniqueness
  -- Allows same rule to fire for /api/build AND /api/auth independently
  fingerprint TEXT NOT NULL,

  -- The specific dimensions that triggered the alert
  firing_dimensions JSONB DEFAULT '{}',

  -- Alert state
  status TEXT NOT NULL DEFAULT 'firing'
    CHECK (status IN ('firing', 'acknowledged', 'resolved')),

  -- Timestamps
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  -- Ownership
  acknowledged_by UUID REFERENCES auth.users(id),

  -- Context
  metric_value NUMERIC,           -- Value that triggered the alert
  incident_id UUID REFERENCES incidents(id),  -- Optional link to incident

  -- Notification tracking
  notifications_sent JSONB DEFAULT '[]'  -- [{channel, sent_at, status}]
);

-- Per-dimension uniqueness: one active alert per rule+fingerprint combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_alert_unique
  ON alerts_fired(rule_id, fingerprint)
  WHERE status = 'firing';

-- Index for history queries
CREATE INDEX IF NOT EXISTS idx_alerts_fired_history
  ON alerts_fired(fired_at DESC);

-- Index for rule-specific history
CREATE INDEX IF NOT EXISTS idx_alerts_fired_rule
  ON alerts_fired(rule_id, fired_at DESC);

-- ============================================================================
-- PART 6: Helper Functions
-- ============================================================================

-- Function to add timeline entry (ensures proper audit trail)
CREATE OR REPLACE FUNCTION add_incident_timeline_entry(
  p_incident_id UUID,
  p_message TEXT,
  p_entry_type TEXT DEFAULT 'manual',
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_entry_id UUID;
BEGIN
  INSERT INTO incident_timeline (incident_id, message, entry_type, created_by)
  VALUES (p_incident_id, p_message, p_entry_type, p_created_by)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate MTTR by severity
CREATE OR REPLACE FUNCTION get_mttr_by_severity(p_severity INT, p_days INT DEFAULT 30)
RETURNS TABLE(
  severity INT,
  incident_count INT,
  avg_duration_minutes NUMERIC,
  min_duration_minutes NUMERIC,
  max_duration_minutes NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.severity,
    COUNT(*)::INT,
    AVG(i.duration_minutes)::NUMERIC,
    MIN(i.duration_minutes)::NUMERIC,
    MAX(i.duration_minutes)::NUMERIC
  FROM incidents i
  WHERE i.status = 'resolved'
    AND i.severity = p_severity
    AND i.created_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY i.severity;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if post-mortem is required for incident
CREATE OR REPLACE FUNCTION is_postmortem_required(p_incident_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_severity INT;
BEGIN
  SELECT severity INTO v_severity
  FROM incidents
  WHERE id = p_incident_id;

  -- SEV1-2 require post-mortems
  RETURN v_severity <= 2;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PART 7: Triggers for updated_at
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_incidents_updated_at'
    AND tgrelid = 'incidents'::regclass
  ) THEN
    CREATE TRIGGER trg_incidents_updated_at
      BEFORE UPDATE ON incidents
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_postmortems_updated_at'
    AND tgrelid = 'incident_postmortems'::regclass
  ) THEN
    CREATE TRIGGER trg_postmortems_updated_at
      BEFORE UPDATE ON incident_postmortems
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_alert_rules_updated_at'
    AND tgrelid = 'alert_rules'::regclass
  ) THEN
    CREATE TRIGGER trg_alert_rules_updated_at
      BEFORE UPDATE ON alert_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================================
-- PART 8: Auto-log status changes on incidents
-- ============================================================================

CREATE OR REPLACE FUNCTION log_incident_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO incident_timeline (incident_id, message, entry_type, created_by)
    VALUES (
      NEW.id,
      'Status changed from ' || OLD.status || ' to ' || NEW.status,
      'status_change',
      NEW.resolved_by  -- Use resolved_by if resolving, otherwise NULL
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_incident_status_change'
    AND tgrelid = 'incidents'::regclass
  ) THEN
    CREATE TRIGGER trg_incident_status_change
      AFTER UPDATE OF status ON incidents
      FOR EACH ROW EXECUTE FUNCTION log_incident_status_change();
  END IF;
END $$;

-- ============================================================================
-- PART 9: RLS Configuration
-- ============================================================================
-- Admin-only tables

ALTER TABLE incidents DISABLE ROW LEVEL SECURITY;
ALTER TABLE incident_timeline DISABLE ROW LEVEL SECURITY;
ALTER TABLE incident_postmortems DISABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE alerts_fired DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 10: Statistics Update
-- ============================================================================

ANALYZE incidents;
ANALYZE incident_timeline;
ANALYZE incident_postmortems;
ANALYZE alert_rules;
ANALYZE alerts_fired;

COMMIT;

-- ============================================================================
-- Verification Queries (run manually after migration)
-- ============================================================================
-- SELECT COUNT(*) FROM incidents;
-- SELECT COUNT(*) FROM incident_timeline;
-- SELECT COUNT(*) FROM alert_rules;
-- SELECT COUNT(*) FROM alerts_fired;
--
-- Test append-only enforcement:
-- INSERT INTO incidents (title, severity, created_by)
--   VALUES ('Test Incident', 3, NULL) RETURNING id;
-- INSERT INTO incident_timeline (incident_id, message)
--   VALUES ('<incident-id>', 'Test entry');
-- UPDATE incident_timeline SET message = 'Modified' WHERE incident_id = '<incident-id>';
-- Should fail with: incident_timeline is append-only
