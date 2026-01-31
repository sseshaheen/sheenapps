-- Admin Matching Controls - Enhanced Preference and Override System
-- Production-ready admin controls for small advisor teams with manual intervention capabilities

BEGIN;

-- Create admin override status enum
DO $$ BEGIN
  CREATE TYPE admin_override_status AS ENUM ('active', 'completed', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create admin assignment type enum  
DO $$ BEGIN
  CREATE TYPE admin_assignment_type AS ENUM ('manual_assignment', 'preference_rule', 'temporary_override', 'emergency_assignment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enhanced admin assignment and override tracking
CREATE TABLE IF NOT EXISTS admin_advisor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  advisor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL, -- Admin who made the assignment
  assignment_type admin_assignment_type NOT NULL DEFAULT 'manual_assignment',
  status admin_override_status NOT NULL DEFAULT 'active',
  priority INTEGER DEFAULT 100, -- Higher number = higher priority
  reason TEXT, -- Why this assignment was made
  criteria JSONB, -- Matching criteria this applies to
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ, -- NULL = permanent, otherwise expires
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  
  -- Note: Unique constraint added as partial index below
);

-- Enhanced admin preference rules (replaces simple advisor_preferences)
CREATE TABLE IF NOT EXISTS admin_preference_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL, -- Human readable name like "John for React projects"
  advisor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('always_prefer', 'never_assign', 'framework_specialist', 'project_type_expert', 'emergency_only')),
  priority_boost INTEGER DEFAULT 50, -- How much to boost this advisor's score (0-100)
  conditions JSONB NOT NULL, -- When this rule applies: {"framework": "react", "complexity": "complex"}
  active BOOLEAN DEFAULT true,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ, -- NULL = permanent
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin notification preferences for matching events
CREATE TABLE IF NOT EXISTS admin_matching_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'no_advisors_available', 'match_failed', 'advisor_declined', 'emergency_assignment_needed'
  notification_method TEXT NOT NULL, -- 'email', 'sms', 'slack', 'in_app'
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Track admin interventions for analytics
CREATE TABLE IF NOT EXISTS admin_matching_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  intervention_type TEXT NOT NULL, -- 'manual_assignment', 'override_auto_match', 'emergency_assignment', 'advisor_swap'
  original_advisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- If overriding an existing match
  new_advisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  automated_match_score DECIMAL(5,2), -- What the automated system scored
  intervention_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance

-- Assignment lookups by project
CREATE INDEX IF NOT EXISTS idx_admin_assignments_project_active
  ON admin_advisor_assignments(project_id, status)
  WHERE status = 'active';

-- Assignment lookups by advisor  
CREATE INDEX IF NOT EXISTS idx_admin_assignments_advisor_active
  ON admin_advisor_assignments(advisor_id, status)
  WHERE status = 'active';

-- Preference rule lookups
CREATE INDEX IF NOT EXISTS idx_preference_rules_advisor_active
  ON admin_preference_rules(advisor_id, active)
  WHERE active = true;

-- Rule condition searches (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_preference_rules_conditions
  ON admin_preference_rules USING gin (conditions);

-- Intervention analytics
CREATE INDEX IF NOT EXISTS idx_interventions_timeline
  ON admin_matching_interventions(created_at DESC);

-- Critical partial unique index (replaces invalid table-level constraint)
DO $$
BEGIN
  -- Remove invalid constraint if it somehow got created
  BEGIN
    ALTER TABLE admin_advisor_assignments
      DROP CONSTRAINT IF EXISTS uniq_active_manual_assignment_per_project;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_manual_assignment_per_project_idx
  ON admin_advisor_assignments(project_id)
  WHERE status = 'active' AND assignment_type = 'manual_assignment';

-- Time validity guards (data integrity)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_assignment_valid_window') THEN
    ALTER TABLE admin_advisor_assignments
      ADD CONSTRAINT chk_assignment_valid_window
      CHECK (valid_until IS NULL OR valid_until > valid_from);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rule_valid_window') THEN
    ALTER TABLE admin_preference_rules
      ADD CONSTRAINT chk_rule_valid_window
      CHECK (valid_until IS NULL OR valid_until > valid_from);
  END IF;
END $$;

-- Performance indexes for "active" queries
CREATE INDEX IF NOT EXISTS idx_admin_assignments_project_active
  ON admin_advisor_assignments(project_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_admin_assignments_advisor_active
  ON admin_advisor_assignments(advisor_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_preference_rules_valid
  ON admin_preference_rules(valid_until)
  WHERE active = true;

-- Row Level Security

-- Enable RLS on all admin tables
ALTER TABLE admin_advisor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_preference_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_matching_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_matching_interventions ENABLE ROW LEVEL SECURITY;

-- Admin can see all assignments and rules
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    -- Admin full access
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_matching_controls_full_access_assignments') THEN
      CREATE POLICY admin_matching_controls_full_access_assignments ON admin_advisor_assignments
        FOR ALL TO app_admin USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_matching_controls_full_access_rules') THEN
      CREATE POLICY admin_matching_controls_full_access_rules ON admin_preference_rules
        FOR ALL TO app_admin USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_matching_controls_full_access_notifications') THEN
      CREATE POLICY admin_matching_controls_full_access_notifications ON admin_matching_notifications
        FOR ALL TO app_admin USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_matching_controls_full_access_interventions') THEN
      CREATE POLICY admin_matching_controls_full_access_interventions ON admin_matching_interventions
        FOR ALL TO app_admin USING (true);
    END IF;
  END IF;
END $$;

-- Advisors can see assignments that affect them
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'advisor_assignments_self_view') THEN
    CREATE POLICY advisor_assignments_self_view ON admin_advisor_assignments
      FOR SELECT TO authenticated
      USING (advisor_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Project owners can see assignments for their projects
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'project_owner_assignments_view') THEN
    CREATE POLICY project_owner_assignments_view ON admin_advisor_assignments
      FOR SELECT TO authenticated
      USING (project_id IN (
        SELECT id FROM projects 
        WHERE owner_id = current_setting('app.current_user_id', true)::UUID
      ));
  END IF;
END $$;

-- Triggers for automatic timestamp updates
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'admin_assignments_updated_at' 
                 AND tgrelid = 'admin_advisor_assignments'::regclass) THEN
    CREATE TRIGGER admin_assignments_updated_at
      BEFORE UPDATE ON admin_advisor_assignments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'admin_rules_updated_at' 
                 AND tgrelid = 'admin_preference_rules'::regclass) THEN
    CREATE TRIGGER admin_rules_updated_at
      BEFORE UPDATE ON admin_preference_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Functions for admin convenience

-- Function to manually assign advisor to project
CREATE OR REPLACE FUNCTION admin_assign_advisor_to_project(
  p_project_id UUID,
  p_advisor_id UUID,
  p_admin_id UUID,
  p_reason TEXT DEFAULT 'Manual assignment',
  p_assignment_type admin_assignment_type DEFAULT 'manual_assignment'
) RETURNS UUID AS $$
DECLARE
  assignment_id UUID;
BEGIN
  -- Cancel any existing manual assignments for this project
  UPDATE admin_advisor_assignments 
  SET status = 'cancelled', updated_at = now()
  WHERE project_id = p_project_id 
    AND assignment_type = 'manual_assignment'
    AND status = 'active';
  
  -- Create new assignment
  INSERT INTO admin_advisor_assignments (
    project_id, advisor_id, assigned_by, assignment_type, reason
  ) VALUES (
    p_project_id, p_advisor_id, p_admin_id, p_assignment_type, p_reason
  ) RETURNING id INTO assignment_id;
  
  -- Log the intervention
  INSERT INTO admin_matching_interventions (
    project_id, admin_id, intervention_type, new_advisor_id, reason
  ) VALUES (
    p_project_id, p_admin_id, 'manual_assignment', p_advisor_id, p_reason
  );
  
  RETURN assignment_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create preference rule
CREATE OR REPLACE FUNCTION admin_create_preference_rule(
  p_rule_name TEXT,
  p_advisor_id UUID,
  p_admin_id UUID,
  p_rule_type TEXT,
  p_conditions JSONB,
  p_priority_boost INTEGER DEFAULT 50,
  p_valid_until TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  rule_id UUID;
BEGIN
  INSERT INTO admin_preference_rules (
    rule_name, advisor_id, created_by, rule_type, priority_boost, 
    conditions, valid_until
  ) VALUES (
    p_rule_name, p_advisor_id, p_admin_id, p_rule_type, p_priority_boost,
    p_conditions, p_valid_until
  ) RETURNING id INTO rule_id;
  
  RETURN rule_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get active admin preferences for matching
CREATE OR REPLACE FUNCTION get_admin_preferences_for_project(
  p_project_id UUID,
  p_tech_stack JSONB DEFAULT NULL
) RETURNS TABLE (
  advisor_id UUID,
  rule_type TEXT,
  priority_boost INTEGER,
  rule_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    apr.advisor_id,
    apr.rule_type,
    apr.priority_boost,
    apr.rule_name
  FROM admin_preference_rules apr
  WHERE apr.active = true
    AND (apr.valid_until IS NULL OR apr.valid_until > now())
    AND (
      -- No conditions = applies to all
      apr.conditions = '{}'::jsonb
      OR
      -- Check if project tech stack matches conditions
      (p_tech_stack IS NOT NULL AND (
        (apr.conditions ? 'framework' AND p_tech_stack->>'framework' = apr.conditions->>'framework')
        OR
        (apr.conditions ? 'complexity' AND (
          SELECT p.project_complexity FROM projects p WHERE p.id = p_project_id
        ) = apr.conditions->>'complexity')
        OR
        (apr.conditions ? 'always' AND apr.conditions->>'always' = 'true')
      ))
    );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions - Admin tables are admin-write-only (read-only for non-admins where RLS permits)
GRANT SELECT ON admin_advisor_assignments TO authenticated;
GRANT SELECT ON admin_preference_rules TO authenticated;
GRANT SELECT ON admin_matching_notifications TO authenticated;
GRANT SELECT ON admin_matching_interventions TO authenticated;

-- Restrict admin functions to admin role only
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT EXECUTE ON FUNCTION admin_assign_advisor_to_project TO app_admin;
    GRANT EXECUTE ON FUNCTION admin_create_preference_rule TO app_admin;
    GRANT EXECUTE ON FUNCTION get_admin_preferences_for_project TO app_admin;
  END IF;
END $$;

COMMIT;