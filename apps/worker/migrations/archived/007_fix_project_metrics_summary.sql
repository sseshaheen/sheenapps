-- Migration: Fix project metrics summary calculation
-- Date: 2025-07-25
-- Purpose: Create a proper function to aggregate all metrics for project summary

-- Drop the existing incomplete function
DROP FUNCTION IF EXISTS update_project_metrics_summary(VARCHAR);

-- Create comprehensive function to update project metrics summary
CREATE OR REPLACE FUNCTION update_project_metrics_summary(p_build_id VARCHAR(64))
RETURNS VOID AS $$
DECLARE
  v_project_id VARCHAR(255);
  v_user_id VARCHAR(255);
  v_date DATE;
BEGIN
  -- Get project info from the build
  SELECT project_id, user_id, DATE(started_at)
  INTO v_project_id, v_user_id, v_date
  FROM project_build_metrics
  WHERE build_id = p_build_id;

  IF v_project_id IS NULL THEN
    RAISE NOTICE 'Build % not found in project_build_metrics', p_build_id;
    RETURN;
  END IF;

  -- Insert or update the summary with all aggregated metrics
  INSERT INTO project_metrics_summary AS pms (
    project_id, user_id, date,
    total_builds, successful_builds, failed_builds, success_rate,
    avg_total_duration_sec, avg_claude_duration_sec, avg_install_duration_sec,
    avg_build_duration_sec, avg_deploy_duration_sec,
    total_cost_usd, avg_cost_per_build_usd, total_tokens_used,
    total_errors_encountered, total_errors_fixed, error_fix_rate,
    most_common_error_type, build_cache_hit_rate, install_skip_rate,
    total_files_created, total_files_modified, avg_output_size_mb
  )
  SELECT
    v_project_id,
    v_user_id,
    v_date,
    -- Build counts
    COUNT(DISTINCT pbm.build_id),
    COUNT(DISTINCT CASE WHEN pbm.status = 'deployed' THEN pbm.build_id END),
    COUNT(DISTINCT CASE WHEN pbm.status = 'failed' THEN pbm.build_id END),
    CASE
      WHEN COUNT(DISTINCT pbm.build_id) > 0
      THEN (COUNT(DISTINCT CASE WHEN pbm.status = 'deployed' THEN pbm.build_id END)::DECIMAL / COUNT(DISTINCT pbm.build_id)) * 100
      ELSE 0
    END,

    -- Duration averages (converted to seconds)
    COALESCE(AVG(pbm.total_duration_ms) / 1000, 0),
    COALESCE(AVG(csm.session_duration_ms) / 1000, 0),
    COALESCE(AVG(dm.install_duration_ms) / 1000, 0),
    COALESCE(AVG(dm.build_duration_ms) / 1000, 0),
    COALESCE(AVG(dm.deploy_duration_ms) / 1000, 0),

    -- Cost metrics
    COALESCE(SUM(csm.total_cost_usd), 0),
    CASE
      WHEN COUNT(DISTINCT pbm.build_id) > 0
      THEN COALESCE(SUM(csm.total_cost_usd), 0) / COUNT(DISTINCT pbm.build_id)
      ELSE 0
    END,
    COALESCE(SUM(csm.input_tokens) + SUM(csm.output_tokens), 0),

    -- Error metrics
    COALESCE(SUM(csm.errors_encountered), 0),
    COALESCE(SUM(csm.errors_fixed), 0),
    CASE
      WHEN SUM(csm.errors_encountered) > 0
      THEN (SUM(csm.errors_fixed)::DECIMAL / SUM(csm.errors_encountered)) * 100
      ELSE NULL
    END,
    -- Most common error type (from project_error_metrics table)
    (
      SELECT em.error_type
      FROM project_error_metrics em
      WHERE em.build_id IN (
        SELECT build_id FROM project_build_metrics
        WHERE project_id = v_project_id
          AND user_id = v_user_id
          AND DATE(started_at) = v_date
      )
      GROUP BY em.error_type
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ),

    -- Cache performance
    CASE
      WHEN COUNT(dm.build_id) > 0
      THEN (COUNT(CASE WHEN dm.build_cache_hit = true THEN 1 END)::DECIMAL / COUNT(dm.build_id)) * 100
      ELSE 0
    END,
    CASE
      WHEN COUNT(dm.build_id) > 0
      THEN (COUNT(CASE WHEN dm.install_duration_ms IS NULL OR dm.install_duration_ms = 0 THEN 1 END)::DECIMAL / COUNT(dm.build_id)) * 100
      ELSE 0
    END,

    -- File activity
    COALESCE(SUM(csm.files_created), 0),
    COALESCE(SUM(csm.files_modified), 0),
    COALESCE(AVG(dm.build_output_size_bytes) / 1048576, 0) -- Convert bytes to MB

  FROM project_build_metrics pbm
  LEFT JOIN project_ai_session_metrics csm
    ON pbm.build_id = csm.build_id
    AND csm.prompt_type = 'build'
  LEFT JOIN project_deployment_metrics dm
    ON pbm.build_id = dm.build_id
  WHERE pbm.project_id = v_project_id
    AND pbm.user_id = v_user_id
    AND DATE(pbm.started_at) = v_date
  GROUP BY pbm.project_id, pbm.user_id

  ON CONFLICT (project_id, user_id, date)
  DO UPDATE SET
    total_builds = EXCLUDED.total_builds,
    successful_builds = EXCLUDED.successful_builds,
    failed_builds = EXCLUDED.failed_builds,
    success_rate = EXCLUDED.success_rate,
    avg_total_duration_sec = EXCLUDED.avg_total_duration_sec,
    avg_claude_duration_sec = EXCLUDED.avg_claude_duration_sec,
    avg_install_duration_sec = EXCLUDED.avg_install_duration_sec,
    avg_build_duration_sec = EXCLUDED.avg_build_duration_sec,
    avg_deploy_duration_sec = EXCLUDED.avg_deploy_duration_sec,
    total_cost_usd = EXCLUDED.total_cost_usd,
    avg_cost_per_build_usd = EXCLUDED.avg_cost_per_build_usd,
    total_tokens_used = EXCLUDED.total_tokens_used,
    total_errors_encountered = EXCLUDED.total_errors_encountered,
    total_errors_fixed = EXCLUDED.total_errors_fixed,
    error_fix_rate = EXCLUDED.error_fix_rate,
    most_common_error_type = EXCLUDED.most_common_error_type,
    build_cache_hit_rate = EXCLUDED.build_cache_hit_rate,
    install_skip_rate = EXCLUDED.install_skip_rate,
    total_files_created = EXCLUDED.total_files_created,
    total_files_modified = EXCLUDED.total_files_modified,
    avg_output_size_mb = EXCLUDED.avg_output_size_mb;

END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION update_project_metrics_summary(VARCHAR) IS 'Aggregates all metrics from build, claude session, deployment, and error tables into daily project summary';
