-- =============================================================================
-- Migration 123: Inhouse Security Hardening
-- Fixes identified in code review:
-- 1. Add TO authenticated to notification RLS policies
-- 2. Add project_id to edge function logs for faster queries
-- 3. Add code_snapshot size constraint (2MB limit)
-- 4. Add JSONB type constraints to notifications
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fix Notification RLS Policies (add explicit TO authenticated)
-- -----------------------------------------------------------------------------

-- Drop and recreate notifications policy with TO authenticated
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notifications_project_isolation') THEN
    DROP POLICY inhouse_notifications_project_isolation ON inhouse_notifications;
  END IF;
END $$;

CREATE POLICY inhouse_notifications_project_isolation ON inhouse_notifications
  FOR ALL
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM project_collaborators WHERE user_id = auth.uid()
    )
  );

-- Drop and recreate templates policy with TO authenticated
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notification_templates_project_isolation') THEN
    DROP POLICY inhouse_notification_templates_project_isolation ON inhouse_notification_templates;
  END IF;
END $$;

CREATE POLICY inhouse_notification_templates_project_isolation ON inhouse_notification_templates
  FOR ALL
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM project_collaborators WHERE user_id = auth.uid()
    )
  );

-- Drop and recreate preferences policy with TO authenticated
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notification_preferences_project_isolation') THEN
    DROP POLICY inhouse_notification_preferences_project_isolation ON inhouse_notification_preferences;
  END IF;
END $$;

CREATE POLICY inhouse_notification_preferences_project_isolation ON inhouse_notification_preferences
  FOR ALL
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM project_collaborators WHERE user_id = auth.uid()
    )
  );

-- Drop and recreate usage policy with TO authenticated
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notification_usage_project_isolation') THEN
    DROP POLICY inhouse_notification_usage_project_isolation ON inhouse_notification_usage;
  END IF;
END $$;

CREATE POLICY inhouse_notification_usage_project_isolation ON inhouse_notification_usage
  FOR ALL
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM project_collaborators WHERE user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 2. Add project_id to edge function logs for faster queries
-- -----------------------------------------------------------------------------

-- Add project_id column if it doesn't exist
ALTER TABLE inhouse_edge_function_logs
  ADD COLUMN IF NOT EXISTS project_id UUID;

-- Backfill project_id from the function's project
UPDATE inhouse_edge_function_logs l
SET project_id = f.project_id
FROM inhouse_edge_functions f
WHERE l.function_id = f.id
  AND l.project_id IS NULL;

-- Create index for project-based queries
CREATE INDEX IF NOT EXISTS idx_inhouse_edge_function_logs_project_created
  ON inhouse_edge_function_logs(project_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Add code_snapshot size constraint (~2MB limit)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_edge_function_versions_code_size'
  ) THEN
    ALTER TABLE inhouse_edge_function_versions
      ADD CONSTRAINT inhouse_edge_function_versions_code_size
      CHECK (octet_length(code_snapshot) <= 2097152); -- 2MB in bytes
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Add JSONB type constraints to notifications
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  -- Recipients must be an array
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_notifications_recipients_array'
  ) THEN
    ALTER TABLE inhouse_notifications
      ADD CONSTRAINT inhouse_notifications_recipients_array
      CHECK (jsonb_typeof(recipients) = 'array');
  END IF;

  -- Channels must be an array
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_notifications_channels_array'
  ) THEN
    ALTER TABLE inhouse_notifications
      ADD CONSTRAINT inhouse_notifications_channels_array
      CHECK (jsonb_typeof(channels) = 'array');
  END IF;

  -- Deliveries must be an array
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_notifications_deliveries_array'
  ) THEN
    ALTER TABLE inhouse_notifications
      ADD CONSTRAINT inhouse_notifications_deliveries_array
      CHECK (jsonb_typeof(deliveries) = 'array');
  END IF;

  -- Status must be a valid value
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_notifications_status_valid'
  ) THEN
    ALTER TABLE inhouse_notifications
      ADD CONSTRAINT inhouse_notifications_status_valid
      CHECK (status IN ('pending', 'scheduled', 'sending', 'sent', 'delivered', 'failed', 'canceled', 'partial'));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Service role policies for notifications (full access)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- Service role full access for notifications
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notifications_service_access'
    ) THEN
      CREATE POLICY inhouse_notifications_service_access ON inhouse_notifications
        FOR ALL
        TO service_role
        USING (true);
    END IF;

    -- Service role full access for templates
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notification_templates_service_access'
    ) THEN
      CREATE POLICY inhouse_notification_templates_service_access ON inhouse_notification_templates
        FOR ALL
        TO service_role
        USING (true);
    END IF;

    -- Service role full access for preferences
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notification_preferences_service_access'
    ) THEN
      CREATE POLICY inhouse_notification_preferences_service_access ON inhouse_notification_preferences
        FOR ALL
        TO service_role
        USING (true);
    END IF;

    -- Service role full access for usage
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy WHERE polname = 'inhouse_notification_usage_service_access'
    ) THEN
      CREATE POLICY inhouse_notification_usage_service_access ON inhouse_notification_usage
        FOR ALL
        TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON COLUMN inhouse_edge_function_logs.project_id IS 'Denormalized project_id for faster queries and simpler RLS';
