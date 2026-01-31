-- Migration: Web Vitals Performance Tracking
-- Date: 2026-01-20
-- Purpose: Store real user monitoring (RUM) data for performance dashboard
-- See: docs/PERFORMANCE_ANALYSIS.md - Section 12
--
-- Expert review fixes applied:
-- P0: Weighted percentile calculation, tightened RLS, check constraints
-- P1: NULL route sentinel, composite index, 3-hour aggregation window

-- ============================================================================
-- Raw Samples Table (sampled 5-20%, kept 14 days)
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_vitals_raw (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name TEXT NOT NULL,        -- INP, LCP, CLS, TTFB, FCP
  value NUMERIC NOT NULL,           -- Metric value in milliseconds (or ratio for CLS)
  rating TEXT,                      -- good, needs-improvement, poor
  route TEXT,                       -- Page route (e.g., /en/builder/workspace)
  device_class TEXT,                -- mobile, tablet, desktop
  browser TEXT,                     -- chrome, safari, firefox, edge
  build_version TEXT,               -- Git commit SHA or release version
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- P0 FIX: Add check constraints for data validation (defense-in-depth)
ALTER TABLE web_vitals_raw
  ADD CONSTRAINT web_vitals_metric_name_check
  CHECK (metric_name IN ('INP', 'LCP', 'CLS', 'TTFB', 'FCP', 'TTFMUI'));

ALTER TABLE web_vitals_raw
  ADD CONSTRAINT web_vitals_rating_check
  CHECK (rating IS NULL OR rating IN ('good', 'needs-improvement', 'poor'));

-- CLS is a ratio (0-10 range), others are milliseconds (0-600000 = 10 minutes max)
ALTER TABLE web_vitals_raw
  ADD CONSTRAINT web_vitals_value_check
  CHECK (
    (metric_name = 'CLS' AND value >= 0 AND value <= 10)
    OR (metric_name <> 'CLS' AND value >= 0 AND value <= 600000)
  );

-- Prevent junk payloads with absurdly long routes
ALTER TABLE web_vitals_raw
  ADD CONSTRAINT web_vitals_route_len_check
  CHECK (route IS NULL OR length(route) <= 512);

-- Performance indexes for raw data queries
CREATE INDEX IF NOT EXISTS idx_vitals_raw_metric_created
  ON web_vitals_raw(metric_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_raw_route
  ON web_vitals_raw(route);
CREATE INDEX IF NOT EXISTS idx_vitals_raw_created
  ON web_vitals_raw(created_at DESC);

COMMENT ON TABLE web_vitals_raw IS 'Raw Web Vitals samples from real users. Sampled at 5-20%, retained for 14 days.';
COMMENT ON COLUMN web_vitals_raw.metric_name IS 'Core Web Vital name: INP, LCP, CLS, TTFB, FCP, or custom TTFMUI';
COMMENT ON COLUMN web_vitals_raw.rating IS 'Performance rating: good (<75th percentile), needs-improvement, poor';

-- ============================================================================
-- Hourly Aggregates Table (pre-computed, kept 90 days)
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_vitals_hourly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hour TIMESTAMPTZ NOT NULL,        -- Truncated to hour
  metric_name TEXT NOT NULL,
  -- P1 FIX: Use '__all__' sentinel instead of NULL for site-wide aggregates
  -- This fixes the UNIQUE constraint issue (NULL != NULL in Postgres)
  route TEXT NOT NULL DEFAULT '__all__',
  build_version TEXT,
  p50 NUMERIC,                      -- 50th percentile
  p75 NUMERIC,                      -- 75th percentile (Core Web Vitals threshold)
  p95 NUMERIC,                      -- 95th percentile
  sample_count INT DEFAULT 0,
  good_count INT DEFAULT 0,
  needs_improvement_count INT DEFAULT 0,
  poor_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (hour, metric_name, route, build_version)
);

-- Performance index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_vitals_hourly_lookup
  ON web_vitals_hourly(metric_name, hour DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_hourly_route
  ON web_vitals_hourly(route, hour DESC);

-- P1 FIX: Composite index for common dashboard query pattern
CREATE INDEX IF NOT EXISTS idx_vitals_hourly_metric_route_hour
  ON web_vitals_hourly(metric_name, route, hour DESC);

COMMENT ON TABLE web_vitals_hourly IS 'Pre-aggregated Web Vitals by hour. Fast for dashboard queries. Retained for 90 days.';

-- ============================================================================
-- Aggregation Function (called hourly by cron job)
-- P1 FIX: Aggregate last 3 hours to handle late arrivals (mobile/offline)
-- ============================================================================

CREATE OR REPLACE FUNCTION aggregate_web_vitals_hourly()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  -- P1 FIX: 3-hour window handles late-arriving events (mobile offline, beacon delays)
  start_hour TIMESTAMPTZ := date_trunc('hour', NOW() - INTERVAL '3 hours');
  end_hour TIMESTAMPTZ := date_trunc('hour', NOW());
BEGIN
  -- Insert or update aggregates for the last 3 hours
  INSERT INTO web_vitals_hourly (
    hour,
    metric_name,
    route,
    build_version,
    p50,
    p75,
    p95,
    sample_count,
    good_count,
    needs_improvement_count,
    poor_count
  )
  SELECT
    date_trunc('hour', created_at) as hour,
    metric_name,
    -- P1 FIX: Use sentinel value instead of NULL for site-wide aggregates
    COALESCE(route, '__all__') as route,
    build_version,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY value) as p50,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value) as p75,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY value) as p95,
    COUNT(*) as sample_count,
    COUNT(*) FILTER (WHERE rating = 'good') as good_count,
    COUNT(*) FILTER (WHERE rating = 'needs-improvement') as needs_improvement_count,
    COUNT(*) FILTER (WHERE rating = 'poor') as poor_count
  FROM web_vitals_raw
  WHERE created_at >= start_hour
    AND created_at < end_hour
  GROUP BY date_trunc('hour', created_at), metric_name, COALESCE(route, '__all__'), build_version
  ON CONFLICT (hour, metric_name, route, build_version)
  DO UPDATE SET
    p50 = EXCLUDED.p50,
    p75 = EXCLUDED.p75,
    p95 = EXCLUDED.p95,
    sample_count = EXCLUDED.sample_count,
    good_count = EXCLUDED.good_count,
    needs_improvement_count = EXCLUDED.needs_improvement_count,
    poor_count = EXCLUDED.poor_count;
END;
$$;

COMMENT ON FUNCTION aggregate_web_vitals_hourly IS 'Aggregates raw Web Vitals into hourly buckets. Run via cron every hour. Uses 3-hour window for late arrivals.';

-- ============================================================================
-- Cleanup Function (removes old data per retention policy)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_web_vitals_data()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete raw samples older than 14 days
  DELETE FROM web_vitals_raw
  WHERE created_at < NOW() - INTERVAL '14 days';

  -- Delete hourly aggregates older than 90 days
  DELETE FROM web_vitals_hourly
  WHERE hour < NOW() - INTERVAL '90 days';
END;
$$;

COMMENT ON FUNCTION cleanup_web_vitals_data IS 'Removes old Web Vitals data. Raw: 14 days, Hourly: 90 days. Run via cron daily.';

-- ============================================================================
-- Helper Function: Get percentiles for dashboard
-- P0 FIX: Use weighted averaging by sample_count (not simple AVG)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_web_vitals_percentiles(
  p_time_range TEXT DEFAULT '24h',
  p_percentile INT DEFAULT 75,
  p_route TEXT DEFAULT NULL
)
RETURNS TABLE (
  metric_name TEXT,
  value NUMERIC,
  sample_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  interval_value INTERVAL;
BEGIN
  -- Parse time range
  interval_value := CASE p_time_range
    WHEN '1h' THEN INTERVAL '1 hour'
    WHEN '24h' THEN INTERVAL '24 hours'
    WHEN '7d' THEN INTERVAL '7 days'
    WHEN '30d' THEN INTERVAL '30 days'
    ELSE INTERVAL '24 hours'
  END;

  -- Return aggregated percentiles from hourly table
  -- P0 FIX: Weighted by sample_count (hours with more samples count more)
  RETURN QUERY
  SELECT
    h.metric_name,
    CASE p_percentile
      WHEN 50 THEN SUM(h.p50 * h.sample_count) / NULLIF(SUM(h.sample_count), 0)
      WHEN 75 THEN SUM(h.p75 * h.sample_count) / NULLIF(SUM(h.sample_count), 0)
      WHEN 95 THEN SUM(h.p95 * h.sample_count) / NULLIF(SUM(h.sample_count), 0)
      ELSE SUM(h.p75 * h.sample_count) / NULLIF(SUM(h.sample_count), 0)
    END AS value,
    SUM(h.sample_count)::BIGINT AS sample_count
  FROM web_vitals_hourly h
  WHERE h.hour >= NOW() - interval_value
    AND (p_route IS NULL OR h.route = p_route)
  GROUP BY h.metric_name;
END;
$$;

COMMENT ON FUNCTION get_web_vitals_percentiles IS 'Get Web Vitals percentiles for dashboard. Uses weighted averaging by sample_count.';

-- ============================================================================
-- RLS Policies
-- P0 FIX: Tighten policies - only service_role can SELECT
-- ============================================================================

-- Enable RLS
ALTER TABLE web_vitals_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_vitals_hourly ENABLE ROW LEVEL SECURITY;

-- Web vitals collection: allow inserts from all users (including anonymous)
-- This is analytics data sent from browsers
CREATE POLICY "Allow insert for all" ON web_vitals_raw
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- P0 FIX: Only service_role can read raw data (admin dashboard uses server API with service key)
-- This prevents any authenticated user from querying analytics directly
CREATE POLICY "Service role read raw" ON web_vitals_raw
  FOR SELECT TO service_role
  USING (true);

-- Service role has full access for aggregation jobs and cleanup
CREATE POLICY "Service role all raw" ON web_vitals_raw
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- P0 FIX: Only service_role can read hourly aggregates
CREATE POLICY "Service role read hourly" ON web_vitals_hourly
  FOR SELECT TO service_role
  USING (true);

-- Service role has full access for aggregation inserts
CREATE POLICY "Service role all hourly" ON web_vitals_hourly
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
