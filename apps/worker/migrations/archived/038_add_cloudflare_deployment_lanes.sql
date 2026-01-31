-- Migration: Add Cloudflare deployment lane tracking to core tables
-- Created: 2025-08-20
-- Purpose: Track deployment lane selection and outcomes in projects and project_versions tables

-- Add deployment lane columns to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS deployment_lane VARCHAR(20),
ADD COLUMN IF NOT EXISTS deployment_lane_detected_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deployment_lane_detection_origin VARCHAR(10), -- 'manual' or 'detection'
ADD COLUMN IF NOT EXISTS deployment_lane_reasons TEXT[], -- Array of detection reasons
ADD COLUMN IF NOT EXISTS deployment_lane_switched BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deployment_lane_switch_reason TEXT;

-- Add deployment lane columns to project_versions table  
ALTER TABLE public.project_versions
ADD COLUMN IF NOT EXISTS deployment_lane VARCHAR(20),
ADD COLUMN IF NOT EXISTS deployment_lane_detected_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deployment_lane_detection_origin VARCHAR(10), -- 'manual' or 'detection'
ADD COLUMN IF NOT EXISTS deployment_lane_reasons TEXT[], -- Array of detection reasons
ADD COLUMN IF NOT EXISTS deployment_lane_switched BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deployment_lane_switch_reason TEXT,
ADD COLUMN IF NOT EXISTS final_deployment_url TEXT,
ADD COLUMN IF NOT EXISTS deployment_lane_manifest JSONB; -- Full detection manifest

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_projects_deployment_lane ON public.projects(deployment_lane);
CREATE INDEX IF NOT EXISTS idx_projects_deployment_lane_detected_at ON public.projects(deployment_lane_detected_at);
CREATE INDEX IF NOT EXISTS idx_project_versions_deployment_lane ON public.project_versions(deployment_lane);
CREATE INDEX IF NOT EXISTS idx_project_versions_deployment_lane_detected_at ON public.project_versions(deployment_lane_detected_at);

-- Add constraints for valid deployment lane values (with safe handling for existing constraints)
DO $$ 
BEGIN 
    -- Add deployment lane constraints
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_deployment_lane') THEN
        ALTER TABLE public.projects 
        ADD CONSTRAINT chk_projects_deployment_lane 
        CHECK (deployment_lane IN ('pages-static', 'pages-edge', 'workers-node'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_project_versions_deployment_lane') THEN
        ALTER TABLE public.project_versions
        ADD CONSTRAINT chk_project_versions_deployment_lane 
        CHECK (deployment_lane IN ('pages-static', 'pages-edge', 'workers-node'));
    END IF;

    -- Add detection origin constraints
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_deployment_lane_origin') THEN
        ALTER TABLE public.projects 
        ADD CONSTRAINT chk_projects_deployment_lane_origin 
        CHECK (deployment_lane_detection_origin IN ('manual', 'detection'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_project_versions_deployment_lane_origin') THEN
        ALTER TABLE public.project_versions
        ADD CONSTRAINT chk_project_versions_deployment_lane_origin 
        CHECK (deployment_lane_detection_origin IN ('manual', 'detection'));
    END IF;
END $$;

-- Comments for documentation
COMMENT ON COLUMN public.projects.deployment_lane IS 'Cloudflare deployment lane: pages-static, pages-edge, or workers-node';
COMMENT ON COLUMN public.projects.deployment_lane_detected_at IS 'When the deployment lane was last detected/selected';
COMMENT ON COLUMN public.projects.deployment_lane_detection_origin IS 'How the lane was selected: manual override or automatic detection';
COMMENT ON COLUMN public.projects.deployment_lane_reasons IS 'Array of reasons why this deployment lane was selected';
COMMENT ON COLUMN public.projects.deployment_lane_switched IS 'Whether the deployment target was switched during deployment';
COMMENT ON COLUMN public.projects.deployment_lane_switch_reason IS 'Reason for deployment target switch (e.g., build log analysis)';

COMMENT ON COLUMN public.project_versions.deployment_lane IS 'Cloudflare deployment lane used for this version';
COMMENT ON COLUMN public.project_versions.deployment_lane_detected_at IS 'When the deployment lane was detected for this version';
COMMENT ON COLUMN public.project_versions.deployment_lane_detection_origin IS 'How the lane was selected: manual override or automatic detection';
COMMENT ON COLUMN public.project_versions.deployment_lane_reasons IS 'Array of reasons why this deployment lane was selected';
COMMENT ON COLUMN public.project_versions.deployment_lane_switched IS 'Whether the deployment target was switched during deployment';
COMMENT ON COLUMN public.project_versions.deployment_lane_switch_reason IS 'Reason for deployment target switch';
COMMENT ON COLUMN public.project_versions.final_deployment_url IS 'Final deployment URL after successful deployment';
COMMENT ON COLUMN public.project_versions.deployment_lane_manifest IS 'Complete deployment detection manifest as JSON';

-- Create a view for easy deployment lane analytics
CREATE OR REPLACE VIEW public.deployment_lane_analytics AS
SELECT 
    deployment_lane,
    COUNT(*) as total_deployments,
    COUNT(*) FILTER (WHERE deployment_lane_switched = true) as switched_deployments,
    COUNT(*) FILTER (WHERE deployment_lane_detection_origin = 'manual') as manual_overrides,
    COUNT(*) FILTER (WHERE deployment_lane_detection_origin = 'detection') as auto_detected,
    ROUND(
        (COUNT(*) FILTER (WHERE deployment_lane_switched = true) * 100.0 / COUNT(*)),
        2
    ) as switch_rate_percentage,
    ROUND(
        (COUNT(*) FILTER (WHERE deployment_lane_detection_origin = 'manual') * 100.0 / COUNT(*)),
        2
    ) as manual_override_percentage,
    MIN(deployment_lane_detected_at) as first_deployment,
    MAX(deployment_lane_detected_at) as latest_deployment
FROM public.project_versions 
WHERE deployment_lane IS NOT NULL
GROUP BY deployment_lane
UNION ALL
SELECT 
    'TOTAL' as deployment_lane,
    COUNT(*) as total_deployments,
    COUNT(*) FILTER (WHERE deployment_lane_switched = true) as switched_deployments,
    COUNT(*) FILTER (WHERE deployment_lane_detection_origin = 'manual') as manual_overrides,
    COUNT(*) FILTER (WHERE deployment_lane_detection_origin = 'detection') as auto_detected,
    ROUND(
        (COUNT(*) FILTER (WHERE deployment_lane_switched = true) * 100.0 / COUNT(*)),
        2
    ) as switch_rate_percentage,
    ROUND(
        (COUNT(*) FILTER (WHERE deployment_lane_detection_origin = 'manual') * 100.0 / COUNT(*)),
        2
    ) as manual_override_percentage,
    MIN(deployment_lane_detected_at) as first_deployment,
    MAX(deployment_lane_detected_at) as latest_deployment
FROM public.project_versions 
WHERE deployment_lane IS NOT NULL;

-- Create a function to get deployment lane history for a project
CREATE OR REPLACE FUNCTION get_project_deployment_history(project_uuid UUID)
RETURNS TABLE (
    version_id TEXT,
    deployment_lane VARCHAR(20),
    detected_at TIMESTAMP WITH TIME ZONE,
    detection_origin VARCHAR(10),
    reasons TEXT[],
    switched BOOLEAN,
    switch_reason TEXT,
    deployment_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pv.version_id,
        pv.deployment_lane,
        pv.deployment_lane_detected_at,
        pv.deployment_lane_detection_origin,
        pv.deployment_lane_reasons,
        pv.deployment_lane_switched,
        pv.deployment_lane_switch_reason,
        pv.final_deployment_url
    FROM public.project_versions pv
    WHERE pv.project_id = project_uuid::TEXT
      AND pv.deployment_lane IS NOT NULL
    ORDER BY pv.deployment_lane_detected_at DESC;
END;
$$ LANGUAGE plpgsql;