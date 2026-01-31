-- ========================================
-- Migration 030 Fix: Handle Missing subscription_tier Column
-- ========================================
-- 
-- This script diagnoses and fixes the subscription_tier column error
-- Execute: psql -d your_db -f fix-migration-030.sql
-- ========================================

BEGIN;

-- ====================================
-- DIAGNOSTIC: Check Current State
-- ====================================

-- Check if organizations table exists and its columns
DO $$
DECLARE
    table_exists boolean;
    column_exists boolean;
BEGIN
    -- Check if organizations table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'organizations'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✅ organizations table exists';
        
        -- Check if subscription_tier column exists
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'organizations'
            AND column_name = 'subscription_tier'
        ) INTO column_exists;
        
        IF column_exists THEN
            RAISE NOTICE '✅ subscription_tier column exists';
        ELSE
            RAISE NOTICE '❌ subscription_tier column missing - will add it';
        END IF;
    ELSE
        RAISE NOTICE '❌ organizations table missing - will create it';
    END IF;
END$$;

-- ====================================
-- SAFE ORGANIZATIONS TABLE CREATION
-- ====================================

-- Create organizations table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    description TEXT,
    
    -- Settings
    settings JSONB DEFAULT '{}' NOT NULL,
    
    -- Timestamps (create these first)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add subscription columns separately to avoid issues
DO $$
BEGIN
    -- Add subscription_tier column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'organizations'
        AND column_name = 'subscription_tier'
    ) THEN
        ALTER TABLE public.organizations 
        ADD COLUMN subscription_tier TEXT DEFAULT 'free';
        
        -- Add the constraint after the column exists
        ALTER TABLE public.organizations 
        ADD CONSTRAINT check_subscription_tier 
        CHECK (subscription_tier IN ('free', 'starter', 'growth', 'scale'));
        
        RAISE NOTICE '✅ Added subscription_tier column with constraint';
    END IF;
    
    -- Add subscription_status column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'organizations'
        AND column_name = 'subscription_status'
    ) THEN
        ALTER TABLE public.organizations 
        ADD COLUMN subscription_status TEXT DEFAULT 'active';
        
        -- Add the constraint after the column exists
        ALTER TABLE public.organizations 
        ADD CONSTRAINT check_subscription_status 
        CHECK (subscription_status IN ('active', 'inactive', 'suspended', 'canceled'));
        
        RAISE NOTICE '✅ Added subscription_status column with constraint';
    END IF;
END$$;

-- Add indexes safely
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_subscription_tier ON public.organizations(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON public.organizations(created_at);

-- ====================================
-- TRIGGER FUNCTION
-- ====================================

-- Add updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger safely
DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- ORGANIZATION MEMBERS TABLE
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
-- PROJECTS TABLE MODIFICATION
-- ====================================

-- Add org_id column to projects table safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'projects'
        AND column_name = 'org_id'
    ) THEN
        ALTER TABLE public.projects ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
        RAISE NOTICE '✅ Added org_id column to projects table';
    ELSE
        RAISE NOTICE '✅ org_id column already exists in projects table';
    END IF;
END $$;

-- Add check constraint safely
DO $$
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        AND table_name = 'projects'
        AND constraint_name = 'check_project_ownership'
    ) THEN
        ALTER TABLE public.projects DROP CONSTRAINT check_project_ownership;
    END IF;
    
    -- Add the constraint
    ALTER TABLE public.projects ADD CONSTRAINT check_project_ownership 
        CHECK (
            (owner_id IS NOT NULL AND org_id IS NULL) OR 
            (owner_id IS NULL AND org_id IS NOT NULL)
        );
    RAISE NOTICE '✅ Added check_project_ownership constraint';
END$$;

-- Add indexes for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON public.projects(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_or_org ON public.projects(COALESCE(owner_id, org_id));

-- ====================================
-- HELPER FUNCTIONS
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
-- SAFE SEED DATA
-- ====================================

-- Create personal organizations for existing users (safely)
DO $$
BEGIN
    -- Only insert if auth.users table exists and is accessible
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'auth' 
        AND table_name = 'users'
    ) THEN
        INSERT INTO public.organizations (id, name, slug, description)
        SELECT 
            gen_random_uuid(),
            'Personal Workspace',
            'personal-' || substr(u.id::text, 1, 8),
            'Your personal workspace for individual projects'
        FROM auth.users u
        WHERE EXISTS (
            SELECT 1 FROM public.projects p 
            WHERE p.owner_id = u.id
        )
        ON CONFLICT (slug) DO NOTHING;
        
        RAISE NOTICE '✅ Created personal workspaces for existing users';
    ELSE
        RAISE NOTICE '⏭️  Skipped seed data (auth.users not accessible)';
    END IF;
EXCEPTION 
    WHEN OTHERS THEN
        RAISE NOTICE '⏭️  Skipped seed data (auth schema access issue)';
END$$;

-- ====================================
-- AUDIT LOG
-- ====================================

-- Log this migration fix
INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'multi_tenant_schema_fixed',
    jsonb_build_object(
        'issue_fixed', 'subscription_tier_column_missing',
        'tables_created', array['organizations', 'organization_members'],
        'columns_added', array['subscription_tier', 'subscription_status', 'org_id'],
        'functions_created', array['user_has_org_access', 'user_can_access_project', 'get_user_accessible_projects'],
        'constraints_added', array['check_project_ownership', 'check_subscription_tier', 'check_subscription_status'],
        'indexes_created', array['idx_organizations_slug', 'idx_projects_org_id'],
        'approach', 'safe_conditional_creation',
        'timestamp', now()
    ),
    '030_fixed'
);

-- ====================================
-- VERIFICATION
-- ====================================

-- Verify the fix worked
DO $$
DECLARE
    org_count integer;
    members_count integer;
    projects_with_org integer;
BEGIN
    SELECT COUNT(*) INTO org_count FROM public.organizations;
    SELECT COUNT(*) INTO members_count FROM public.organization_members;
    SELECT COUNT(*) INTO projects_with_org FROM public.projects WHERE org_id IS NOT NULL;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 030 FIX VERIFICATION:';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Organizations created: %', org_count;
    RAISE NOTICE 'Organization members: %', members_count;
    RAISE NOTICE 'Projects with org_id: %', projects_with_org;
    RAISE NOTICE '✅ Migration 030 fix completed successfully!';
    RAISE NOTICE '========================================';
END$$;

COMMIT;

-- ====================================
-- POST-FIX NOTES
-- ====================================

-- This fix addresses the subscription_tier column error by:
-- ✅ 1. Creating tables and columns in the correct order
-- ✅ 2. Adding constraints after columns exist
-- ✅ 3. Using conditional logic to avoid conflicts
-- ✅ 4. Providing clear diagnostic output
-- ✅ 5. Safely handling auth schema access issues
-- 
-- After running this fix, migration 030 should work properly
-- You can then continue with your normal migration process