-- Migration: Add comprehensive metrics tracking system
-- Date: 2025-07-25
-- Purpose: Track detailed metrics for builds, Claude sessions, deployments, and errors

-- 1. Core build metrics table (one row per build)
CREATE TABLE IF NOT EXISTS project_build_metrics (
  -- Identifiers
  id SERIAL PRIMARY KEY,
  build_id VARCHAR(64) UNIQUE NOT NULL,
  version_id CHAR(26) NOT NULL,
  project_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,

  -- Build context
  is_initial_build BOOLEAN DEFAULT true,
  is_update BOOLEAN DEFAULT false,
  is_retry BOOLEAN DEFAULT false,
  attempt_number INT DEFAULT 1,
  parent_build_id VARCHAR(64),                -- For retries/updates

  -- Overall status and timing
  status VARCHAR(20) NOT NULL,                 -- started, claude_completed, deployed, failed
  failure_stage VARCHAR(50),                   -- claude, install, build, deploy, metadata
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  total_duration_ms INT,

  -- Framework and environment
  framework VARCHAR(50),
  detected_framework VARCHAR(50),              -- What we detected vs what was requested
  node_version VARCHAR(20),
  package_manager VARCHAR(20),                 -- npm, pnpm, yarn

  -- Created timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Claude session metrics (detailed AI interaction data)
CREATE TABLE IF NOT EXISTS project_ai_session_metrics (
  -- Identifiers
  id SERIAL PRIMARY KEY,
  build_id VARCHAR(64) NOT NULL,
  session_id VARCHAR(100),

  -- Session info
  prompt_type VARCHAR(50) NOT NULL,            -- build, metadata, version_classification, recommendations
  original_prompt_length INT,
  enhanced_prompt_length INT,

  -- Timing
  session_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  session_end_time TIMESTAMP WITH TIME ZONE,
  session_duration_ms INT,
  time_to_first_output_ms INT,

  -- Token usage and cost
  input_tokens INT,
  output_tokens INT,
  cache_creation_tokens INT,
  cache_read_tokens INT,
  total_cost_usd DECIMAL(10, 6),

  -- Activity metrics
  files_created INT DEFAULT 0,
  files_modified INT DEFAULT 0,
  files_read INT DEFAULT 0,
  files_deleted INT DEFAULT 0,

  -- Tool usage
  tool_calls_total INT DEFAULT 0,
  tool_calls_by_type JSONB,                   -- {"Write": 5, "Edit": 10, "Bash": 3}
  bash_commands_run INT DEFAULT 0,

  -- Error handling
  errors_encountered INT DEFAULT 0,
  errors_fixed INT DEFAULT 0,
  error_types JSONB,                           -- {"typescript": 3, "dependency": 1}

  -- Session outcomes
  success BOOLEAN NOT NULL,
  timeout_occurred BOOLEAN DEFAULT false,
  session_timeout_ms INT,                      -- What the timeout was set to
  error_message TEXT,

  -- Additional context
  metadata JSONB,                              -- Flexible field for additional metrics

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Deployment metrics (build and deployment specifics)
CREATE TABLE IF NOT EXISTS project_deployment_metrics (
  -- Identifiers
  id SERIAL PRIMARY KEY,
  build_id VARCHAR(64) UNIQUE NOT NULL,
  deployment_id VARCHAR(100),

  -- Install phase
  install_started_at TIMESTAMP WITH TIME ZONE,
  install_completed_at TIMESTAMP WITH TIME ZONE,
  install_duration_ms INT,
  install_strategy VARCHAR(50),                -- npm, npm-legacy, npm-force, pnpm, yarn
  install_cache_hit BOOLEAN DEFAULT false,
  dependencies_count INT,
  dev_dependencies_count INT,

  -- Build phase
  build_started_at TIMESTAMP WITH TIME ZONE,
  build_completed_at TIMESTAMP WITH TIME ZONE,
  build_duration_ms INT,
  build_cache_hit BOOLEAN DEFAULT false,
  build_command VARCHAR(255),
  build_output_size_bytes BIGINT,

  -- Deploy phase
  deploy_started_at TIMESTAMP WITH TIME ZONE,
  deploy_completed_at TIMESTAMP WITH TIME ZONE,
  deploy_duration_ms INT,
  deployment_size_bytes BIGINT,
  files_uploaded INT,

  -- Results
  preview_url TEXT,
  success BOOLEAN NOT NULL,
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Error metrics (detailed error tracking)
CREATE TABLE IF NOT EXISTS project_error_metrics (
  -- Identifiers
  id SERIAL PRIMARY KEY,
  build_id VARCHAR(64) NOT NULL,
  error_id VARCHAR(100) NOT NULL,              -- Unique error identifier

  -- Error details
  error_type VARCHAR(50) NOT NULL,             -- typescript, dependency, build, syntax, file_not_found
  error_source VARCHAR(50) NOT NULL,           -- claude, install, build, deploy
  error_message TEXT NOT NULL,
  error_file VARCHAR(255),
  error_line INT,

  -- Recovery attempts
  recovery_attempted BOOLEAN DEFAULT false,
  recovery_strategy VARCHAR(100),              -- auto_fix, retry, claude_fix, skip
  recovery_success BOOLEAN,
  recovery_duration_ms INT,

  -- Timestamps
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Aggregated project metrics (for quick analytics)
CREATE TABLE IF NOT EXISTS project_metrics_summary (
  -- Identifiers
  project_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,                          -- For daily aggregation

  -- Build stats
  total_builds INT DEFAULT 0,
  successful_builds INT DEFAULT 0,
  failed_builds INT DEFAULT 0,
  success_rate DECIMAL(5, 2),                  -- Percentage

  -- Timing averages (in seconds for readability)
  avg_total_duration_sec DECIMAL(10, 2),
  avg_claude_duration_sec DECIMAL(10, 2),
  avg_install_duration_sec DECIMAL(10, 2),
  avg_build_duration_sec DECIMAL(10, 2),
  avg_deploy_duration_sec DECIMAL(10, 2),

  -- Cost metrics
  total_cost_usd DECIMAL(10, 4),
  avg_cost_per_build_usd DECIMAL(10, 4),
  total_tokens_used BIGINT,

  -- Error metrics
  total_errors_encountered INT DEFAULT 0,
  total_errors_fixed INT DEFAULT 0,
  error_fix_rate DECIMAL(5, 2),               -- Percentage
  most_common_error_type VARCHAR(50),

  -- Cache performance
  build_cache_hit_rate DECIMAL(5, 2),         -- Percentage
  install_skip_rate DECIMAL(5, 2),            -- Percentage

  -- Resource usage
  total_files_created INT DEFAULT 0,
  total_files_modified INT DEFAULT 0,
  avg_output_size_mb DECIMAL(10, 2),

  -- Unique constraint for daily aggregation
  CONSTRAINT unique_project_date UNIQUE (project_id, user_id, date)
);

-- Indexes for performance
CREATE INDEX idx_build_metrics_project ON project_build_metrics(project_id, user_id);
CREATE INDEX idx_build_metrics_status ON project_build_metrics(status);
CREATE INDEX idx_build_metrics_created ON project_build_metrics(created_at DESC);

CREATE INDEX idx_claude_metrics_build ON project_ai_session_metrics(build_id);
CREATE INDEX idx_claude_metrics_session ON project_ai_session_metrics(session_id);
CREATE INDEX idx_claude_metrics_cost ON project_ai_session_metrics(total_cost_usd DESC);

CREATE INDEX idx_project_deployment_metrics_build ON project_deployment_metrics(build_id);
CREATE INDEX idx_project_deployment_metrics_success ON project_deployment_metrics(success);

CREATE INDEX idx_project_error_metrics_build ON project_error_metrics(build_id);
CREATE INDEX idx_project_error_metrics_type ON project_error_metrics(error_type);
CREATE INDEX idx_project_error_metrics_unresolved ON project_error_metrics(recovery_success) WHERE recovery_success = false;

CREATE INDEX idx_project_summary_lookup ON project_metrics_summary(project_id, user_id, date DESC);

-- Comments for documentation
COMMENT ON TABLE project_build_metrics IS 'Core metrics for each build attempt including timing and status';
COMMENT ON TABLE project_ai_session_metrics IS 'Detailed metrics for Claude AI sessions including token usage and tool calls';
COMMENT ON TABLE project_deployment_metrics IS 'Metrics specific to the install, build, and deployment phases';
COMMENT ON TABLE project_error_metrics IS 'Detailed error tracking and recovery attempts';
COMMENT ON TABLE project_metrics_summary IS 'Daily aggregated metrics per project for quick analytics';

-- Function to update project summary metrics (can be called after each build)
CREATE OR REPLACE FUNCTION update_project_metrics_summary(p_build_id VARCHAR(64))
RETURNS VOID AS $$
DECLARE
  v_project_id VARCHAR(255);
  v_user_id VARCHAR(255);
  v_date DATE;
BEGIN
  -- Get project info
  SELECT project_id, user_id, DATE(started_at)
  INTO v_project_id, v_user_id, v_date
  FROM project_build_metrics
  WHERE build_id = p_build_id;

  -- Update or insert summary
  INSERT INTO project_metrics_summary (
    project_id, user_id, date,
    total_builds, successful_builds, failed_builds
  )
  VALUES (
    v_project_id, v_user_id, v_date,
    1,
    CASE WHEN (SELECT status FROM project_build_metrics WHERE build_id = p_build_id) = 'deployed' THEN 1 ELSE 0 END,
    CASE WHEN (SELECT status FROM project_build_metrics WHERE build_id = p_build_id) = 'failed' THEN 1 ELSE 0 END
  )
  ON CONFLICT (project_id, user_id, date)
  DO UPDATE SET
    total_builds = project_metrics_summary.total_builds + 1,
    successful_builds = project_metrics_summary.successful_builds +
      CASE WHEN (SELECT status FROM project_build_metrics WHERE build_id = p_build_id) = 'deployed' THEN 1 ELSE 0 END,
    failed_builds = project_metrics_summary.failed_builds +
      CASE WHEN (SELECT status FROM project_build_metrics WHERE build_id = p_build_id) = 'failed' THEN 1 ELSE 0 END;

  -- Update calculated fields (this would be more complex in production)
  UPDATE project_metrics_summary
  SET success_rate = (successful_builds::DECIMAL / NULLIF(total_builds, 0)) * 100
  WHERE project_id = v_project_id AND user_id = v_user_id AND date = v_date;

END;
$$ LANGUAGE plpgsql;
