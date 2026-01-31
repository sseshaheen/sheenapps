-- Migration: Fix deployment lane origin constraint to allow 'fallback'
-- Created: 2025-08-21
-- Purpose: Update check constraints to allow 'fallback' as valid deployment_lane_detection_origin value

-- First, inspect current constraint for reference
-- SELECT check_clause 
-- FROM information_schema.check_constraints 
-- WHERE constraint_name = 'chk_project_versions_deployment_lane_origin';

DO $$ 
BEGIN 
    -- Update project_versions table constraint
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_project_versions_deployment_lane_origin') THEN
        ALTER TABLE public.project_versions
        DROP CONSTRAINT chk_project_versions_deployment_lane_origin;
    END IF;
    
    ALTER TABLE public.project_versions
    ADD CONSTRAINT chk_project_versions_deployment_lane_origin 
    CHECK (deployment_lane_detection_origin IN ('detection', 'manual', 'fallback'));

    -- Update projects table constraint (mirror change)
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_deployment_lane_origin') THEN
        ALTER TABLE public.projects
        DROP CONSTRAINT chk_projects_deployment_lane_origin;
    END IF;
    
    ALTER TABLE public.projects
    ADD CONSTRAINT chk_projects_deployment_lane_origin 
    CHECK (deployment_lane_detection_origin IN ('detection', 'manual', 'fallback'));

    -- Log the change
    RAISE NOTICE 'Updated deployment lane origin constraints to allow: detection, manual, fallback';
END $$;

-- Update comments to reflect new valid values
COMMENT ON COLUMN public.projects.deployment_lane_detection_origin IS 'How the lane was selected: manual override, automatic detection, or fallback deployment';
COMMENT ON COLUMN public.project_versions.deployment_lane_detection_origin IS 'How the lane was selected: manual override, automatic detection, or fallback deployment';