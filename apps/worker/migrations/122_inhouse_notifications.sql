-- =============================================================================
-- Migration 122: Inhouse Notifications
-- Multi-channel notification delivery for Easy Mode projects
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Notifications table
-- Stores sent notifications with delivery status
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inhouse_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  recipients JSONB NOT NULL,        -- JSON array of user IDs
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channels JSONB NOT NULL,          -- JSON array of channels
  deliveries JSONB NOT NULL,        -- JSON array of delivery statuses
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ,
  metadata JSONB,
  idempotency_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_inhouse_notifications_project
  ON inhouse_notifications(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_notifications_type
  ON inhouse_notifications(project_id, type);
CREATE INDEX IF NOT EXISTS idx_inhouse_notifications_status
  ON inhouse_notifications(project_id, status);
CREATE INDEX IF NOT EXISTS idx_inhouse_notifications_created
  ON inhouse_notifications(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inhouse_notifications_scheduled
  ON inhouse_notifications(project_id, scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inhouse_notifications_idempotency
  ON inhouse_notifications(project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Notification templates table
-- Reusable notification templates with channel-specific configs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inhouse_notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  channels JSONB NOT NULL,          -- JSON array of enabled channels
  default_title TEXT NOT NULL,
  default_body TEXT NOT NULL,
  variables JSONB NOT NULL,         -- JSON array of variable names
  channel_templates JSONB,          -- JSON object with channel-specific templates
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, type)
);

CREATE INDEX IF NOT EXISTS idx_inhouse_notification_templates_project
  ON inhouse_notification_templates(project_id);

-- -----------------------------------------------------------------------------
-- User notification preferences table
-- Per-user channel and type preferences
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inhouse_notification_preferences (
  user_id TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  channels JSONB NOT NULL,          -- JSON object: { email: true, push: true, ... }
  types JSONB NOT NULL,             -- JSON object: { marketing: { enabled: false }, ... }
  quiet_hours JSONB,                -- JSON object: { enabled, start, end, timezone }
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_inhouse_notification_preferences_project
  ON inhouse_notification_preferences(project_id);

-- -----------------------------------------------------------------------------
-- Notification usage tracking
-- For quota management and analytics
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inhouse_notification_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  delivery_count INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inhouse_notification_usage_project
  ON inhouse_notification_usage(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_notification_usage_created
  ON inhouse_notification_usage(project_id, created_at);

-- =============================================================================
-- Row Level Security Policies
-- =============================================================================

ALTER TABLE inhouse_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_notification_usage ENABLE ROW LEVEL SECURITY;

-- Policy: notifications_project_isolation
-- Ensure notifications are only accessible within their project
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notifications_project_isolation') THEN
    CREATE POLICY inhouse_notifications_project_isolation ON inhouse_notifications
      FOR ALL USING (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
          UNION
          SELECT project_id FROM project_collaborators WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Policy: templates_project_isolation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notification_templates_project_isolation') THEN
    CREATE POLICY inhouse_notification_templates_project_isolation ON inhouse_notification_templates
      FOR ALL USING (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
          UNION
          SELECT project_id FROM project_collaborators WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Policy: preferences_project_isolation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notification_preferences_project_isolation') THEN
    CREATE POLICY inhouse_notification_preferences_project_isolation ON inhouse_notification_preferences
      FOR ALL USING (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
          UNION
          SELECT project_id FROM project_collaborators WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Policy: usage_project_isolation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notification_usage_project_isolation') THEN
    CREATE POLICY inhouse_notification_usage_project_isolation ON inhouse_notification_usage
      FOR ALL USING (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
          UNION
          SELECT project_id FROM project_collaborators WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
