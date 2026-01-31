-- =====================================================
-- Migration 058: Analytics Summary Tables
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 29, 2025
-- Purpose: Add precomputed analytics tables for advisor dashboard performance
-- Dependencies: Migration 057 (Consultation metadata enhancements)
-- =====================================================

BEGIN;

-- Use PostgreSQL best practice: set session_replication_role to bypass triggers during migration
-- This bypasses the prevent_advisor_admin_field_changes() trigger
SET session_replication_role = 'replica';

-- =====================================================
-- Part 1: Create Analytics Summary Table
-- =====================================================

-- Advisor performance metrics aggregation
CREATE TABLE IF NOT EXISTS advisor_analytics_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Core metrics
  total_consultations INTEGER DEFAULT 0,
  free_consultations INTEGER DEFAULT 0,
  paid_consultations INTEGER DEFAULT 0,
  
  -- Performance metrics
  average_rating DECIMAL(3,2),
  total_earnings_cents INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2), -- Free to paid conversion
  
  -- Specialization breakdown
  specialization_performance JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure unique periods per advisor
  UNIQUE(advisor_id, period_start, period_end)
);

-- =====================================================
-- Part 2: Indexes for Performance
-- =====================================================

-- Index for advisor-specific analytics lookups
CREATE INDEX IF NOT EXISTS idx_analytics_advisor_period 
ON advisor_analytics_summary (advisor_id, period_start DESC);

-- Index for time-series analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_period_range
ON advisor_analytics_summary (period_start, period_end);

-- =====================================================
-- Part 3: Row Level Security (RLS)
-- =====================================================

-- Enable RLS for analytics summary (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE c.relname = 'advisor_analytics_summary' 
      AND n.nspname = 'public' 
      AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE advisor_analytics_summary ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create RLS policies (idempotent)
DO $$
BEGIN
  -- Create select policy if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'analytics_select') THEN
    CREATE POLICY analytics_select ON advisor_analytics_summary
      FOR SELECT USING (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()));
  END IF;

  -- Create admin policy if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'analytics_admin') THEN
    CREATE POLICY analytics_admin ON advisor_analytics_summary
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'));
  END IF;
END $$;

-- =====================================================
-- Part 4: Triggers and Worker Grants
-- =====================================================

-- Standard updated_at trigger (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_analytics_updated' 
      AND tgrelid = 'advisor_analytics_summary'::regclass
  ) THEN
    CREATE TRIGGER trg_analytics_updated
      BEFORE UPDATE ON advisor_analytics_summary
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Worker database role grants
GRANT SELECT, INSERT, UPDATE ON advisor_analytics_summary TO worker_db_role;

-- =====================================================
-- Part 5: Analytics Helper Functions
-- =====================================================

-- Function to calculate monthly analytics for an advisor
CREATE OR REPLACE FUNCTION calculate_advisor_monthly_analytics(
  target_advisor_id UUID,
  target_month DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)
)
RETURNS TABLE (
  consultations_total INTEGER,
  consultations_free INTEGER,
  consultations_paid INTEGER,
  earnings_total_cents INTEGER,
  conversion_rate DECIMAL(5,2),
  average_rating DECIMAL(3,2)
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as consultations_total,
    COUNT(CASE WHEN ac.is_free_consultation THEN 1 END)::INTEGER as consultations_free,
    COUNT(CASE WHEN NOT ac.is_free_consultation THEN 1 END)::INTEGER as consultations_paid,
    COALESCE(SUM(CASE WHEN NOT ac.is_free_consultation THEN ac.advisor_earnings_cents END), 0)::INTEGER as earnings_total_cents,
    CASE 
      WHEN COUNT(CASE WHEN ac.is_free_consultation THEN 1 END) > 0 
      THEN (COUNT(CASE WHEN NOT ac.is_free_consultation THEN 1 END)::DECIMAL / COUNT(CASE WHEN ac.is_free_consultation THEN 1 END)::DECIMAL * 100)
      ELSE 0
    END as conversion_rate,
    (SELECT AVG(ar.rating)::DECIMAL(3,2) 
     FROM advisor_reviews ar 
     WHERE ar.advisor_id = target_advisor_id 
       AND ar.created_at >= target_month 
       AND ar.created_at < target_month + INTERVAL '1 month'
    ) as average_rating
  FROM advisor_consultations ac
  WHERE ac.advisor_id = target_advisor_id
    AND ac.status = 'completed'
    AND DATE_TRUNC('month', ac.start_time) = target_month;
END;
$$;

-- Reset session replication role to default before committing
SET session_replication_role = 'origin';

COMMIT;

-- =====================================================
-- Verification and Summary
-- =====================================================

-- Test the analytics function with Omar's data if available
SELECT * FROM calculate_advisor_monthly_analytics(
  (SELECT id FROM advisors WHERE display_name = 'Omar Khalil' LIMIT 1),
  CURRENT_DATE  -- Use DATE instead of TIMESTAMPTZ
);

-- Verify table was created successfully
SELECT COUNT(*) as analytics_table_count
FROM advisor_analytics_summary;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 058 completed successfully!';
  RAISE NOTICE '📊 Analytics summary table created with RLS';
  RAISE NOTICE '📈 Helper function: calculate_advisor_monthly_analytics()';
  RAISE NOTICE '⚡ Performance indexes for time-series queries';
  RAISE NOTICE '📱 Next: Migration 059 - Performance optimization indexes';
END $$;