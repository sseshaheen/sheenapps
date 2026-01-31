-- ========================================
-- Migration 030 Fix: Based on Actual Schema Reference
-- ========================================
-- 
-- ISSUE: Migration 030 tries to create organizations table with subscription_tier
-- REALITY: Organizations table already exists without subscription_tier column
-- SOLUTION: Add missing columns to existing table structure
-- 
-- Reference: 000_reference_schema_20250805.sql shows existing organizations table
-- Execute: psql -d your_db -f fix-migration-030-schema-based.sql
-- ========================================

BEGIN;

-- ====================================
-- CURRENT SCHEMA ANALYSIS
-- ====================================

-- The reference schema shows organizations table already exists with:
-- - id uuid DEFAULT gen_random_uuid() NOT NULL
-- - name character varying(255) NOT NULL  
-- - slug character varying(255)
-- - owner_id uuid NOT NULL
-- - settings jsonb DEFAULT '{}'::jsonb
-- - created_at timestamp with time zone DEFAULT now()
-- - updated_at timestamp with time zone DEFAULT now()

-- Migration 030 wants to add:
-- - subscription_tier TEXT DEFAULT 'free' 
-- - subscription_status TEXT DEFAULT 'active'
-- - Remove owner_id constraint (conflicts with existing schema)

DO $$
BEGIN
    RAISE NOTICE 'Analyzing existing organizations table structure...';
END$$;

-- ====================================
-- STEP 1: ADD MISSING COLUMNS TO EXISTING ORGANIZATIONS TABLE
-- ====================================

-- Add subscription_tier column (this is what's causing the error)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'organizations'
        AND column_name = 'subscription_tier'
    ) THEN
        ALTER TABLE public.organizations 
        ADD COLUMN subscription_tier TEXT DEFAULT 'free';
        
        -- Add constraint after column exists
        ALTER TABLE public.organizations 
        ADD CONSTRAINT check_subscription_tier 
        CHECK (subscription_tier IN ('free', 'starter', 'growth', 'scale'));
        
        RAISE NOTICE '✅ Added subscription_tier column to existing organizations table';
    ELSE
        RAISE NOTICE '✅ subscription_tier column already exists';
    END IF;
END$$;

-- Add subscription_status column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'organizations'
        AND column_name = 'subscription_status'
    ) THEN
        ALTER TABLE public.organizations 
        ADD COLUMN subscription_status TEXT DEFAULT 'active';
        
        -- Add constraint after column exists
        ALTER TABLE public.organizations 
        ADD CONSTRAINT check_subscription_status 
        CHECK (subscription_status IN ('active', 'inactive', 'suspended', 'canceled'));
        
        RAISE NOTICE '✅ Added subscription_status column to existing organizations table';
    ELSE
        RAISE NOTICE '✅ subscription_status column already exists';
    END IF;
END$$;

-- Add missing indexes for new columns
CREATE INDEX IF NOT EXISTS idx_organizations_subscription_tier ON public.organizations(subscription_tier);

-- Note: Other indexes already exist per reference schema:
-- - idx_organizations_owner_id 
-- - idx_organizations_slug

-- ====================================
-- STEP 2: ORGANIZATION_MEMBERS TABLE
-- ====================================

-- Check if organization_members exists and what columns it has
DO $$
DECLARE
    table_exists boolean;
    has_org_id boolean;
    has_organization_id boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'organization_members'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✅ organization_members table already exists';
        
        -- Check which column name is used for org reference
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'organization_members'
            AND column_name = 'org_id'
        ) INTO has_org_id;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'organization_members'
            AND column_name = 'organization_id'
        ) INTO has_organization_id;
        
        IF has_org_id THEN
            RAISE NOTICE '✅ organization_members uses org_id column';
        ELSIF has_organization_id THEN
            RAISE NOTICE '✅ organization_members uses organization_id column';
        ELSE
            RAISE NOTICE '⚠️  organization_members exists but column structure unclear';
        END IF;
    ELSE
        -- Create organization_members table compatible with existing schema
        -- Use organization_id to match existing schema pattern
        CREATE TABLE public.organization_members (
            organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
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
            
            PRIMARY KEY (organization_id, user_id)
        );
        
        -- Add indexes
        CREATE INDEX idx_organization_members_user_id ON public.organization_members(user_id);
        CREATE INDEX idx_organization_members_role ON public.organization_members(role);
        CREATE INDEX idx_organization_members_status ON public.organization_members(status);
        
        -- Add trigger for updated_at
        CREATE TRIGGER handle_organization_members_updated_at 
            BEFORE UPDATE ON public.organization_members
            FOR EACH ROW 
            EXECUTE FUNCTION public.handle_updated_at();
            
        RAISE NOTICE '✅ Created organization_members table';
    END IF;
END$$;

-- ====================================
-- STEP 3: PROJECTS TABLE ORG_ID COLUMN
-- ====================================

-- Add org_id column to projects table (but respect existing owner_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'projects'
        AND column_name = 'org_id'
    ) THEN
        ALTER TABLE public.projects ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
        RAISE NOTICE '✅ Added org_id column to projects table';
        
        -- Add index for org queries
        CREATE INDEX idx_projects_org_id ON public.projects(org_id);
    ELSE
        RAISE NOTICE '✅ org_id column already exists in projects table';
    END IF;
END $$;

-- ====================================
-- STEP 4: HELPER FUNCTIONS (COMPATIBLE WITH EXISTING SCHEMA)
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
        AND organization_id = p_org_id  -- Use organization_id to match existing schema
        AND status = 'active'
    );
END;
$$;

-- Function to check if user can access a project (respects existing owner_id)
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
    
    -- Personal project access (existing behavior)
    IF project_record.owner_id = p_user_id THEN
        RETURN TRUE;
    END IF;
    
    -- Organization project access (new functionality)
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
        -- Personal projects (existing behavior)
        p.owner_id = p_user_id
        OR 
        -- Organization projects where user is a member (new functionality)
        (p.org_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = p.org_id  -- Use organization_id
            AND om.user_id = p_user_id
            AND om.status = 'active'
        ))
    ORDER BY p.updated_at DESC;
END;
$$;

-- ====================================
-- STEP 5: VERIFICATION
-- ====================================

-- Verify the fix worked
DO $$
DECLARE
    org_count integer;
    has_subscription_tier boolean;
    has_subscription_status boolean;
    members_table_exists boolean;
    projects_has_org_id boolean;
BEGIN
    -- Check organizations table
    SELECT COUNT(*) INTO org_count FROM public.organizations;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'organizations'
        AND column_name = 'subscription_tier'
    ) INTO has_subscription_tier;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'organizations'
        AND column_name = 'subscription_status'
    ) INTO has_subscription_status;
    
    -- Check organization_members table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'organization_members'
    ) INTO members_table_exists;
    
    -- Check projects org_id column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'projects'
        AND column_name = 'org_id'
    ) INTO projects_has_org_id;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 030 SCHEMA-BASED FIX RESULTS:';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Organizations table: % records', org_count;
    RAISE NOTICE 'Has subscription_tier: %', has_subscription_tier;
    RAISE NOTICE 'Has subscription_status: %', has_subscription_status;
    RAISE NOTICE 'Organization_members table exists: %', members_table_exists;
    RAISE NOTICE 'Projects has org_id column: %', projects_has_org_id;
    
    IF has_subscription_tier AND has_subscription_status AND members_table_exists AND projects_has_org_id THEN
        RAISE NOTICE '✅ Migration 030 fix completed successfully!';
    ELSE
        RAISE NOTICE '⚠️  Some components may need manual verification';
    END IF;
    RAISE NOTICE '========================================';
END$$;

-- ====================================
-- AUDIT LOG
-- ====================================

INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'migration_030_schema_based_fix',
    jsonb_build_object(
        'issue', 'subscription_tier_column_missing_in_existing_organizations_table',
        'solution', 'add_missing_columns_to_existing_schema',
        'columns_added', array['subscription_tier', 'subscription_status', 'org_id'],
        'tables_handled', array['organizations', 'organization_members', 'projects'],
        'functions_created', array['user_has_org_access', 'user_can_access_project', 'get_user_accessible_projects'],
        'schema_compatibility', 'maintained_existing_owner_id_behavior',
        'timestamp', now()
    ),
    '030_schema_fix'
);

COMMIT;

-- ====================================
-- POST-FIX NOTES
-- ====================================

-- This fix addresses the subscription_tier error by:
-- ✅ 1. Adding missing columns to the EXISTING organizations table
-- ✅ 2. Respecting the current schema structure (keeping owner_id)
-- ✅ 3. Using organization_id in members table to match existing patterns
-- ✅ 4. Making projects support both personal (owner_id) AND org (org_id) ownership
-- ✅ 5. Creating helper functions compatible with existing schema
-- 
-- The original migration 030 should now work properly since the 
-- subscription_tier column will exist when referenced.
-- 
-- You can continue with your normal migration process.