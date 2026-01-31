-- =============================================================================
-- EXPERT FIXES: Critical trigger and domain uniqueness fixes
-- Date: 2026-01-15
-- =============================================================================

-- =============================================================================
-- FIX 1: Trigger OLD on INSERT bug (will error without this fix)
-- =============================================================================
-- Problem: Referencing OLD.infra_mode on INSERT causes error because OLD doesn't exist
-- Fix: Use TG_OP to differentiate INSERT from UPDATE

CREATE OR REPLACE FUNCTION public.handle_project_infra_mode_change()
RETURNS TRIGGER AS $$
BEGIN
    -- If switching to easy mode or creating new easy mode project
    -- EXPERT FIX: Use TG_OP to avoid OLD reference on INSERT
    IF NEW.infra_mode = 'easy'
       AND (TG_OP = 'INSERT' OR OLD.infra_mode IS DISTINCT FROM 'easy') THEN
        
        INSERT INTO public.inhouse_quotas (project_id, tier)
        VALUES (NEW.id, 'free')
        ON CONFLICT (project_id) DO NOTHING;

        -- Generate subdomain if not set (pass project_id for fallback)
        IF NEW.inhouse_subdomain IS NULL THEN
            NEW.inhouse_subdomain := public.generate_inhouse_subdomain(NEW.name, NEW.id);
        END IF;

        -- Generate schema name if not set
        IF NEW.inhouse_schema_name IS NULL THEN
            NEW.inhouse_schema_name := public.generate_inhouse_schema_name(NEW.id);
        END IF;
    END IF;

    -- If switching from easy to pro mode (UPDATE only)
    -- EXPERT FIX: Guard with TG_OP to only run on UPDATE
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
-- FIX 2: Case-insensitive domain uniqueness (DNS correctness)
-- =============================================================================
-- Problem: DNS is case-insensitive, but current indexes allow Example.com and example.com
-- Fix: Replace simple unique indexes with case-insensitive (lower()) functional indexes

-- Drop existing case-sensitive indexes
DROP INDEX IF EXISTS idx_projects_inhouse_subdomain;
DROP INDEX IF EXISTS idx_projects_inhouse_custom_domain;

-- Create case-insensitive unique indexes
CREATE UNIQUE INDEX idx_projects_inhouse_subdomain
ON public.projects (lower(inhouse_subdomain))
WHERE inhouse_subdomain IS NOT NULL;

CREATE UNIQUE INDEX idx_projects_inhouse_custom_domain
ON public.projects (lower(inhouse_custom_domain))
WHERE inhouse_custom_domain IS NOT NULL;

COMMENT ON INDEX idx_projects_inhouse_subdomain IS
'Case-insensitive unique index for subdomains (DNS is case-insensitive)';

COMMENT ON INDEX idx_projects_inhouse_custom_domain IS
'Case-insensitive unique index for custom domains (DNS is case-insensitive)';

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================
--
-- These are critical fixes that prevent runtime errors and correctness bugs:
--
-- 1. Trigger fix: Without TG_OP check, any INSERT will error with:
--    "record OLD is not assigned yet"
--
-- 2. Domain uniqueness: Without case-insensitive indexes, users could register
--    both "Example.com" and "example.com", causing DNS conflicts
--
-- =============================================================================
