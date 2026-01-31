-- ========================================
-- Migration 030: Multi-Tenant Schema
-- ========================================
-- 
-- PHASE 2.1: Multi-Tenant Schema Setup
-- Expert-validated future-proof architecture
-- 
-- This migration adds organization support to prevent painful rewrites:
-- 1. Create organizations table
-- 2. Create organization_members table  
-- 3. Add org_id to projects table
-- 4. Create indexes for performance
-- 5. Set up constraints for data integrity
-- 
-- Reference: SERVER_ONLY_SUPABASE_ARCHITECTURE_PLAN.md Phase 2.1
-- ========================================

BEGIN;

-- ====================================
-- 1. ORGANIZATIONS TABLE
-- ====================================

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    description TEXT,
    
    -- Settings
    settings JSONB DEFAULT '{}' NOT NULL,
    
    -- Subscription info
    subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'starter', 'growth', 'scale')),
    subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'inactive', 'suspended', 'canceled')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_subscription_tier ON public.organizations(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON public.organizations(created_at);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- 2. ORGANIZATION MEMBERS TABLE
-- ====================================

CREATE TABLE IF NOT EXISTS public.organization_members (
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- References auth.users but no FK due to auth schema
    
    -- Role-based access control
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    
    -- Member settings
    settings JSONB DEFAULT '{}' NOT NULL,
    
    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    PRIMARY KEY (org_id, user_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_role ON public.organization_members(role);
CREATE INDEX IF NOT EXISTS idx_organization_members_status ON public.organization_members(status);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_organization_members_updated_at ON public.organization_members;
CREATE TRIGGER update_organization_members_updated_at
    BEFORE UPDATE ON public.organization_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- 3. MODIFY PROJECTS TABLE FOR MULTI-TENANCY
-- ====================================

-- Add org_id column to projects table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'projects'
        AND column_name = 'org_id'
    ) THEN
        ALTER TABLE public.projects ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add check constraint: project must have either owner_id OR org_id (not both, not neither)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS check_project_ownership;
ALTER TABLE public.projects ADD CONSTRAINT check_project_ownership 
    CHECK (
        (owner_id IS NOT NULL AND org_id IS NULL) OR 
        (owner_id IS NULL AND org_id IS NOT NULL)
    );

-- Add indexes for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON public.projects(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_or_org ON public.projects(COALESCE(owner_id, org_id));

-- ====================================
-- 4. HELPER FUNCTIONS
-- ====================================

-- Function to check if user has access to an organization
CREATE OR REPLACE FUNCTION user_has_org_access(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = p_user_id
        AND org_id = p_org_id
        AND status = 'active'
    );
END;
$$;

-- Function to check if user can access a project
CREATE OR REPLACE FUNCTION user_can_access_project(p_user_id UUID, p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    project_record RECORD;
BEGIN
    SELECT owner_id, org_id INTO project_record
    FROM public.projects
    WHERE id = p_project_id;
    
    -- Project doesn't exist
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Personal project access
    IF project_record.owner_id = p_user_id THEN
        RETURN TRUE;
    END IF;
    
    -- Organization project access
    IF project_record.org_id IS NOT NULL THEN
        RETURN user_has_org_access(p_user_id, project_record.org_id);
    END IF;
    
    RETURN FALSE;
END;
$$;

-- Function to get user's accessible projects
CREATE OR REPLACE FUNCTION get_user_accessible_projects(p_user_id UUID)
RETURNS TABLE(
    id UUID,
    name TEXT,
    description TEXT,
    owner_id UUID,
    org_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.description,
        p.owner_id,
        p.org_id,
        p.created_at,
        p.updated_at
    FROM public.projects p
    WHERE 
        -- Personal projects
        p.owner_id = p_user_id
        OR 
        -- Organization projects where user is a member
        (p.org_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = p.org_id
            AND om.user_id = p_user_id
            AND om.status = 'active'
        ))
    ORDER BY p.updated_at DESC;
END;
$$;

-- ====================================
-- 5. SEED DATA (Optional)
-- ====================================

-- Create a default "Personal" organization for existing users with projects
-- This helps with migration of existing data

INSERT INTO public.organizations (id, name, slug, description)
SELECT 
    gen_random_uuid(),
    'Personal Workspace',
    'personal-' || substr(id::text, 1, 8),
    'Your personal workspace for individual projects'
FROM auth.users u
WHERE EXISTS (
    SELECT 1 FROM public.projects p 
    WHERE p.owner_id = u.id
)
ON CONFLICT (slug) DO NOTHING;

-- ====================================
-- 6. AUDIT LOG
-- ====================================

-- Log this migration
INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'multi_tenant_schema_created',
    jsonb_build_object(
        'tables_created', array['organizations', 'organization_members'],
        'functions_created', array['user_has_org_access', 'user_can_access_project', 'get_user_accessible_projects'],
        'constraints_added', array['check_project_ownership'],
        'indexes_created', array['idx_organizations_slug', 'idx_projects_org_id'],
        'timestamp', now()
    ),
    '030'
);

COMMIT;

-- ====================================
-- POST-MIGRATION NOTES
-- ====================================

-- After running this migration:
-- 
-- ✅ 1. Organizations and membership tables created
-- ✅ 2. Projects table supports both personal and org ownership
-- ✅ 3. Helper functions for access control ready
-- ✅ 4. Indexes created for performance
-- ✅ 5. Data integrity constraints in place
-- 
-- Next steps:
-- - Update server-side repositories to use new access patterns
-- - Create organization management API routes
-- - Implement organization creation/invitation flows
-- - Test multi-tenant access control
-- 
-- Next migration: 031_separated_client_architecture.sql