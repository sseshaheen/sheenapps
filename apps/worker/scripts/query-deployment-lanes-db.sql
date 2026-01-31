-- Cloudflare Deployment Lane Database Queries
-- Use these queries to analyze deployment lane selection in your database

-- =============================================================================
-- 1. VIEW ALL DEPLOYMENT LANES FOR PROJECTS
-- =============================================================================

-- Show current deployment lane for all projects
SELECT 
    id as project_id,
    name as project_name,
    deployment_lane,
    deployment_lane_detected_at,
    deployment_lane_detection_origin,
    deployment_lane_reasons,
    deployment_lane_switched,
    deployment_lane_switch_reason,
    framework,
    build_status,
    preview_url
FROM public.projects 
WHERE deployment_lane IS NOT NULL
ORDER BY deployment_lane_detected_at DESC;

-- =============================================================================
-- 2. VIEW ALL DEPLOYMENT LANES FOR PROJECT VERSIONS
-- =============================================================================

-- Show deployment lane for all project versions
SELECT 
    version_id,
    project_id,
    deployment_lane,
    deployment_lane_detected_at,
    deployment_lane_detection_origin,
    deployment_lane_reasons,
    deployment_lane_switched,
    deployment_lane_switch_reason,
    final_deployment_url,
    status,
    framework
FROM public.project_versions 
WHERE deployment_lane IS NOT NULL
ORDER BY deployment_lane_detected_at DESC;

-- =============================================================================
-- 3. DEPLOYMENT LANE ANALYTICS (Use the built-in view)
-- =============================================================================

-- Get comprehensive deployment lane analytics
SELECT * FROM public.deployment_lane_analytics
ORDER BY 
    CASE WHEN deployment_lane = 'TOTAL' THEN 1 ELSE 0 END,
    total_deployments DESC;

-- =============================================================================
-- 4. DEPLOYMENT LANE DISTRIBUTION BY TIME PERIOD
-- =============================================================================

-- Deployment lanes by day (last 30 days)
SELECT 
    DATE(deployment_lane_detected_at) as deployment_date,
    deployment_lane,
    COUNT(*) as deployments_count
FROM public.project_versions 
WHERE deployment_lane IS NOT NULL 
  AND deployment_lane_detected_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(deployment_lane_detected_at), deployment_lane
ORDER BY deployment_date DESC, deployment_lane;

-- =============================================================================
-- 5. TARGET SWITCHING ANALYSIS
-- =============================================================================

-- Show all deployments that switched targets
SELECT 
    version_id,
    project_id,
    deployment_lane,
    deployment_lane_switch_reason,
    deployment_lane_detected_at,
    deployment_lane_reasons
FROM public.project_versions 
WHERE deployment_lane_switched = true
ORDER BY deployment_lane_detected_at DESC;

-- Switch rate by deployment lane
SELECT 
    deployment_lane,
    COUNT(*) as total_deployments,
    COUNT(*) FILTER (WHERE deployment_lane_switched = true) as switched_deployments,
    ROUND(
        (COUNT(*) FILTER (WHERE deployment_lane_switched = true) * 100.0 / COUNT(*)),
        2
    ) as switch_rate_percentage
FROM public.project_versions 
WHERE deployment_lane IS NOT NULL
GROUP BY deployment_lane;

-- =============================================================================
-- 6. DETECTION REASONS ANALYSIS
-- =============================================================================

-- Most common detection reasons
SELECT 
    unnest(deployment_lane_reasons) as reason,
    COUNT(*) as frequency,
    deployment_lane
FROM public.project_versions 
WHERE deployment_lane_reasons IS NOT NULL
GROUP BY unnest(deployment_lane_reasons), deployment_lane
ORDER BY frequency DESC;

-- =============================================================================
-- 7. MANUAL OVERRIDE ANALYSIS
-- =============================================================================

-- Show all manual overrides
SELECT 
    version_id,
    project_id,
    deployment_lane,
    deployment_lane_reasons,
    deployment_lane_detected_at
FROM public.project_versions 
WHERE deployment_lane_detection_origin = 'manual'
ORDER BY deployment_lane_detected_at DESC;

-- Manual override rate by deployment lane
SELECT 
    deployment_lane,
    COUNT(*) as total_deployments,
    COUNT(*) FILTER (WHERE deployment_lane_detection_origin = 'manual') as manual_overrides,
    ROUND(
        (COUNT(*) FILTER (WHERE deployment_lane_detection_origin = 'manual') * 100.0 / COUNT(*)),
        2
    ) as manual_override_percentage
FROM public.project_versions 
WHERE deployment_lane IS NOT NULL
GROUP BY deployment_lane;

-- =============================================================================
-- 8. PROJECT-SPECIFIC DEPLOYMENT HISTORY
-- =============================================================================

-- Get deployment history for a specific project (replace with actual project ID)
SELECT * FROM get_project_deployment_history('your-project-uuid-here');

-- Alternative query without function (replace with actual project ID)
SELECT 
    version_id,
    deployment_lane,
    deployment_lane_detected_at,
    deployment_lane_detection_origin,
    deployment_lane_reasons,
    deployment_lane_switched,
    final_deployment_url
FROM public.project_versions 
WHERE project_id = 'your-project-uuid-here'
  AND deployment_lane IS NOT NULL
ORDER BY deployment_lane_detected_at DESC;

-- =============================================================================
-- 9. FRAMEWORK-SPECIFIC DEPLOYMENT PATTERNS
-- =============================================================================

-- Deployment lane distribution by framework
SELECT 
    framework,
    deployment_lane,
    COUNT(*) as count,
    ROUND(
        (COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY framework)),
        2
    ) as percentage_within_framework
FROM public.project_versions 
WHERE deployment_lane IS NOT NULL 
  AND framework IS NOT NULL
GROUP BY framework, deployment_lane
ORDER BY framework, count DESC;

-- =============================================================================
-- 10. DEPLOYMENT SUCCESS CORRELATION
-- =============================================================================

-- Deployment lane vs build success rate
SELECT 
    deployment_lane,
    COUNT(*) as total_deployments,
    COUNT(*) FILTER (WHERE status = 'deployed') as successful_deployments,
    COUNT(*) FILTER (WHERE final_deployment_url IS NOT NULL) as with_url,
    ROUND(
        (COUNT(*) FILTER (WHERE status = 'deployed') * 100.0 / COUNT(*)),
        2
    ) as success_rate_percentage
FROM public.project_versions 
WHERE deployment_lane IS NOT NULL
GROUP BY deployment_lane
ORDER BY success_rate_percentage DESC;

-- =============================================================================
-- 11. RECENT DEPLOYMENT ACTIVITY
-- =============================================================================

-- Show recent deployment lane activity (last 24 hours)
SELECT 
    version_id,
    deployment_lane,
    deployment_lane_detected_at,
    deployment_lane_reasons,
    deployment_lane_switched,
    final_deployment_url,
    EXTRACT(HOUR FROM deployment_lane_detected_at) as hour_of_day
FROM public.project_versions 
WHERE deployment_lane_detected_at >= NOW() - INTERVAL '24 hours'
ORDER BY deployment_lane_detected_at DESC;

-- =============================================================================
-- 12. DEPLOYMENT LANE MANIFEST ANALYSIS (JSONB data)
-- =============================================================================

-- Analyze Supabase integration patterns
SELECT 
    deployment_lane,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE deployment_lane_manifest->>'supabaseIntegration' IS NOT NULL) as with_supabase,
    COUNT(*) FILTER (WHERE (deployment_lane_manifest->'supabaseIntegration'->>'needsServiceRole')::boolean = true) as needs_service_role
FROM public.project_versions 
WHERE deployment_lane_manifest IS NOT NULL
GROUP BY deployment_lane;

-- Extract detection notes
SELECT 
    version_id,
    deployment_lane,
    deployment_lane_manifest->'notes' as detection_notes,
    deployment_lane_manifest->'supabaseIntegration' as supabase_info
FROM public.project_versions 
WHERE deployment_lane_manifest IS NOT NULL
  AND deployment_lane_manifest->'notes' IS NOT NULL
LIMIT 10;

-- =============================================================================
-- QUICK QUERIES FOR COMMON QUESTIONS
-- =============================================================================

-- How many deployments used each lane today?
SELECT deployment_lane, COUNT(*) 
FROM project_versions 
WHERE DATE(deployment_lane_detected_at) = CURRENT_DATE
GROUP BY deployment_lane;

-- What's the most common detection reason?
SELECT unnest(deployment_lane_reasons) as reason, COUNT(*) as count
FROM project_versions 
WHERE deployment_lane_reasons IS NOT NULL
GROUP BY reason 
ORDER BY count DESC 
LIMIT 5;

-- How many deployments switched lanes?
SELECT COUNT(*) as switched_deployments
FROM project_versions 
WHERE deployment_lane_switched = true;

-- What's the average switch rate?
SELECT 
    ROUND(
        (COUNT(*) FILTER (WHERE deployment_lane_switched = true) * 100.0 / COUNT(*)),
        2
    ) as overall_switch_rate_percentage
FROM project_versions 
WHERE deployment_lane IS NOT NULL;