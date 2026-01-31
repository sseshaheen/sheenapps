-- =============================================================================
-- In-House Mode Infrastructure Fixes
-- Addresses expert review feedback on 20260112_inhouse_mode_infrastructure.sql
-- =============================================================================

-- =============================================================================
-- P0 FIX 1: Remove redundant quota columns from projects table
-- Keep only inhouse_quotas table as single source of truth
-- =============================================================================

-- 1) Drop the old UNIQUE constraint (this automatically drops its backing index)
ALTER TABLE public.inhouse_api_keys
DROP CONSTRAINT IF EXISTS inhouse_api_keys_prefix_unique;

-- 2) (Optional) If some environment created a *manual* index with this name, clean it up
--    Safe to keep, but MUST come after dropping the constraint.
DROP INDEX IF EXISTS public.inhouse_api_keys_prefix_unique;

-- 3) Add new constraints
ALTER TABLE public.inhouse_api_keys
ADD CONSTRAINT inhouse_api_keys_project_prefix_unique
UNIQUE (project_id, key_prefix);

ALTER TABLE public.inhouse_api_keys
ADD CONSTRAINT inhouse_api_keys_hash_unique
UNIQUE (key_hash);


-- Remove ALL overloads to avoid ambiguity
DROP FUNCTION IF EXISTS public.generate_inhouse_subdomain(text);
DROP FUNCTION IF EXISTS public.generate_inhouse_subdomain(text, uuid);
DROP FUNCTION IF EXISTS public.generate_inhouse_subdomain(varchar);
DROP FUNCTION IF EXISTS public.generate_inhouse_subdomain(varchar, uuid);



ALTER TABLE public.projects
DROP COLUMN IF EXISTS inhouse_quota_db_bytes,
DROP COLUMN IF EXISTS inhouse_quota_storage_bytes,
DROP COLUMN IF EXISTS inhouse_quota_requests_today,
DROP COLUMN IF EXISTS inhouse_quota_reset_at;

COMMENT ON TABLE public.inhouse_quotas IS
'Single source of truth for Easy Mode project quotas. Do NOT add quota columns to projects table.';

-- =============================================================================
-- P0 FIX 2: Add FK constraints to inhouse_request_log
-- (Remove "partitioned" claim - it's not partitioned, just a regular table with retention)
-- =============================================================================

ALTER TABLE public.inhouse_request_log
ADD CONSTRAINT fk_reqlog_project
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.inhouse_request_log
ADD CONSTRAINT fk_reqlog_key
  FOREIGN KEY (api_key_id) REFERENCES public.inhouse_api_keys(id) ON DELETE SET NULL;

COMMENT ON TABLE public.inhouse_request_log IS
'Request log for Easy Mode API Gateway - used for rate limiting and analytics. NOT partitioned; use retention job to clean old entries.';

-- =============================================================================
-- P0 FIX 3: Fix RLS policies - add proper WITH CHECK for writes
-- =============================================================================

-- Drop existing incomplete policies
DROP POLICY IF EXISTS "Users can manage their project schemas" ON public.inhouse_project_schemas;
DROP POLICY IF EXISTS "Users can manage their project tables" ON public.inhouse_tables;
DROP POLICY IF EXISTS "Users can manage their table columns" ON public.inhouse_columns;
DROP POLICY IF EXISTS "Users can manage their API keys" ON public.inhouse_api_keys;

-- =============================================================================
-- inhouse_project_schemas: Proper CRUD policies
-- =============================================================================

CREATE POLICY "inhouse_schemas_insert"
ON public.inhouse_project_schemas
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "inhouse_schemas_update"
ON public.inhouse_project_schemas
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "inhouse_schemas_delete"
ON public.inhouse_project_schemas
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
);

-- =============================================================================
-- inhouse_tables: Proper CRUD policies
-- =============================================================================

CREATE POLICY "inhouse_tables_insert"
ON public.inhouse_tables
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "inhouse_tables_update"
ON public.inhouse_tables
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "inhouse_tables_delete"
ON public.inhouse_tables
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
);

-- =============================================================================
-- inhouse_columns: Proper CRUD policies (via table ownership)
-- =============================================================================

DROP POLICY IF EXISTS "Users can manage their table columns" ON public.inhouse_columns;

CREATE POLICY "inhouse_columns_insert"
ON public.inhouse_columns
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inhouse_tables t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = table_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "inhouse_columns_update"
ON public.inhouse_columns
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.inhouse_tables t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = table_id AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inhouse_tables t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = table_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "inhouse_columns_delete"
ON public.inhouse_columns
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.inhouse_tables t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = table_id AND p.owner_id = auth.uid()
  )
);

-- =============================================================================
-- inhouse_deployments: Read-only for users (system creates deployments)
-- =============================================================================

-- Users can view their deployments (already have SELECT policy)
-- No INSERT/UPDATE/DELETE for users - deployments are created by system

-- =============================================================================
-- inhouse_api_keys: Proper CRUD policies
-- =============================================================================

CREATE POLICY "inhouse_api_keys_insert"
ON public.inhouse_api_keys
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "inhouse_api_keys_update"
ON public.inhouse_api_keys
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "inhouse_api_keys_delete"
ON public.inhouse_api_keys
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND p.owner_id = auth.uid()
  )
);

-- =============================================================================
-- inhouse_quotas: Read-only for users (system manages quotas)
-- =============================================================================

-- Users can view their quotas (already have SELECT policy)
-- No INSERT/UPDATE/DELETE for users - quotas are managed by system

-- =============================================================================
-- P1 FIX 4: Add Easy/Pro mode field validity constraints
-- =============================================================================

-- Easy mode projects MUST have subdomain and schema_name
-- Pro mode projects should NOT have inhouse-specific fields
ALTER TABLE public.projects
ADD CONSTRAINT projects_easy_mode_requires_fields
CHECK (
  infra_mode <> 'easy'
  OR (inhouse_subdomain IS NOT NULL AND inhouse_schema_name IS NOT NULL)
);

ALTER TABLE public.projects
ADD CONSTRAINT projects_pro_mode_no_inhouse_fields
CHECK (
  infra_mode <> 'pro'
  OR (inhouse_subdomain IS NULL AND inhouse_custom_domain IS NULL AND inhouse_schema_name IS NULL)
);

-- =============================================================================
-- P1 FIX 5: Fix subdomain generator to handle empty results
-- =============================================================================
CREATE OR REPLACE FUNCTION public.generate_inhouse_subdomain(project_name TEXT, project_id UUID)
RETURNS TEXT AS $$
DECLARE
  base_subdomain TEXT;
  final_subdomain TEXT;
  counter INT := 0;
BEGIN
  base_subdomain := LOWER(REGEXP_REPLACE(project_name, '[^a-z0-9]+', '-', 'gi'));
  base_subdomain := TRIM(BOTH '-' FROM base_subdomain);
  base_subdomain := LEFT(base_subdomain, 50);

  IF base_subdomain = '' OR base_subdomain IS NULL THEN
    base_subdomain := 'project-' || LEFT(REPLACE(project_id::TEXT, '-', ''), 8);
  END IF;

  final_subdomain := base_subdomain;

  WHILE EXISTS (
    SELECT 1 FROM public.projects
    WHERE inhouse_subdomain = final_subdomain
  ) LOOP
    counter := counter + 1;
    final_subdomain := base_subdomain || '-' || counter::TEXT;
  END LOOP;

  RETURN final_subdomain;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.generate_inhouse_subdomain IS
'Generate a unique subdomain for Easy Mode projects. Handles edge case of empty names (emojis, special chars only).';

-- =============================================================================
-- P1 FIX 6: Change API key prefix uniqueness to per-project
-- Also add unique constraint on key_hash
-- =============================================================================

-- Drop global unique constraint on prefix
DROP INDEX IF EXISTS inhouse_api_keys_prefix_unique;

-- Add per-project unique constraint
ALTER TABLE public.inhouse_api_keys
DROP CONSTRAINT IF EXISTS inhouse_api_keys_prefix_unique;

-- =============================================================================
-- DESIGN FIX: Add updated_at triggers for new tables
-- =============================================================================

-- Generic updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables with updated_at columns
DO $$
BEGIN
    -- inhouse_project_schemas
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_inhouse_schemas_updated_at') THEN
        CREATE TRIGGER trigger_inhouse_schemas_updated_at
        BEFORE UPDATE ON public.inhouse_project_schemas
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;

    -- inhouse_tables
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_inhouse_tables_updated_at') THEN
        CREATE TRIGGER trigger_inhouse_tables_updated_at
        BEFORE UPDATE ON public.inhouse_tables
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;

    -- inhouse_api_keys
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_inhouse_api_keys_updated_at') THEN
        CREATE TRIGGER trigger_inhouse_api_keys_updated_at
        BEFORE UPDATE ON public.inhouse_api_keys
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;

    -- inhouse_quotas
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_inhouse_quotas_updated_at') THEN
        CREATE TRIGGER trigger_inhouse_quotas_updated_at
        BEFORE UPDATE ON public.inhouse_quotas
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- =============================================================================
-- Update trigger for project infra_mode change (fix to use new subdomain function)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_project_infra_mode_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.infra_mode = 'easy'
     AND (TG_OP = 'INSERT' OR OLD.infra_mode IS DISTINCT FROM 'easy') THEN

    INSERT INTO public.inhouse_quotas (project_id, tier)
    VALUES (NEW.id, 'free')
    ON CONFLICT (project_id) DO NOTHING;

    IF NEW.inhouse_subdomain IS NULL THEN
      NEW.inhouse_subdomain := public.generate_inhouse_subdomain(NEW.name, NEW.id);
    END IF;

    IF NEW.inhouse_schema_name IS NULL THEN
      NEW.inhouse_schema_name := public.generate_inhouse_schema_name(NEW.id);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.infra_mode = 'pro' AND OLD.infra_mode = 'easy' THEN
    NEW.inhouse_subdomain := NULL;
    NEW.inhouse_custom_domain := NULL;
    NEW.inhouse_schema_name := NULL;
    NEW.inhouse_build_id := NULL;
    NEW.inhouse_deployed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================
--
-- This migration fixes issues identified in expert review:
--
-- P0 (Critical):
-- 1. Removed redundant quota columns from projects table
-- 2. Added FK constraints to inhouse_request_log
-- 3. Fixed RLS policies with proper WITH CHECK for INSERT/UPDATE
--
-- P1 (Important):
-- 4. Added Easy/Pro mode field validity constraints
-- 5. Fixed subdomain generator to handle empty names
-- 6. Changed API key prefix uniqueness to per-project
--
-- Design:
-- 7. Added updated_at triggers for consistency
-- 8. Updated infra_mode change trigger to handle pro→easy transition
--
-- =============================================================================
