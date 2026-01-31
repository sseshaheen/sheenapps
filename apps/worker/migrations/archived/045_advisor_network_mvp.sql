-- =====================================================
-- Migration 045: Advisor Network MVP (Expert-Reviewed)
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 25, 2025
-- Purpose: Platform-fixed pricing model with advisor payouts
-- Status: Building on existing payment infrastructure patterns
-- Based on: Expert recommendations for data integrity and refund handling
--
-- Key Features:
-- - Platform-fixed SKUs: $9/$19/$35 (15/30/60 min) with 70% advisor share
-- - USD-only for MVP (multi-currency in Phase 2)
-- - Monthly batch advisor payouts with clean refund handling
-- - Leverages existing Stripe infrastructure
-- - Admin/staff approval workflow
-- - Expert-recommended surgical improvements for data integrity
-- =====================================================

-- Consultation status enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultation_status') THEN
    CREATE TYPE consultation_status AS ENUM (
      'scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'
    );
    RAISE NOTICE '✅ Created consultation_status enum';
  ELSE
    RAISE NOTICE 'ℹ️ consultation_status enum already exists, skipping';
  END IF;
END $$;

-- =====================================================
-- Core Advisor Tables
-- =====================================================

-- Advisors table  
CREATE TABLE IF NOT EXISTS advisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id),
  display_name text NOT NULL,
  bio text,
  avatar_url text,
  skills text[] DEFAULT '{}',
  specialties text[] DEFAULT '{}', -- 'frontend', 'fullstack', 'ecommerce'
  languages text[] DEFAULT '{}',  -- Communication languages
  rating numeric DEFAULT 0,
  review_count int DEFAULT 0,
  approval_status text CHECK (approval_status IN ('pending','approved','rejected')) DEFAULT 'pending',
  stripe_connect_account_id text, -- For monthly payouts
  cal_com_event_type_url text,
  is_accepting_bookings boolean DEFAULT true,
  country_code text, -- For Stripe Connect requirements
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Advisor consultations table
CREATE TABLE IF NOT EXISTS advisor_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES advisors(id),
  client_id uuid NOT NULL REFERENCES auth.users(id),
  project_id uuid REFERENCES projects(id),
  cal_booking_id text UNIQUE, -- For Cal.com integration
  start_time timestamptz NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes IN (15,30,60)),
  status consultation_status DEFAULT 'scheduled',
  video_url text,
  notes text,
  
  -- Platform-fixed pricing (confirmed by user)
  price_cents int NOT NULL,           -- $900/$1900/$3500 based on duration
  platform_fee_cents int NOT NULL,   -- 30% of price_cents  
  advisor_earnings_cents int NOT NULL, -- 70% of price_cents
  currency text DEFAULT 'USD',       -- USD-only for MVP
  
  -- Expert recommendations: locale & timezone for UX
  locale text,                        -- For email/time display (e.g., 'ar-eg', 'en-us')
  client_timezone text,               -- For scheduling display (e.g., 'America/New_York')
  
  -- Expert recommendation: pricing snapshot for consistency (simplified for MVP)
  pricing_snapshot jsonb DEFAULT '{"sku":"30min","currency":"USD","rate_cents":1900}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  
  -- Expert recommendation: mathematical integrity constraint
  CONSTRAINT chk_consultation_split CHECK (price_cents = platform_fee_cents + advisor_earnings_cents)
);

-- Advisor consultation charges (extends existing payment pattern)
CREATE TABLE IF NOT EXISTS advisor_consultation_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES advisor_consultations(id),
  stripe_payment_intent_id text UNIQUE,
  total_amount_cents int NOT NULL,     -- Full consultation fee
  platform_fee_cents int NOT NULL,    -- SheenApps keeps 30%
  advisor_earnings_cents int NOT NULL, -- Advisor gets 70%
  currency text NOT NULL DEFAULT 'USD',
  status text CHECK (status IN ('pending','succeeded','failed','refunded')) DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  
  -- Expert recommendation: mathematical integrity constraint
  CONSTRAINT chk_charge_split CHECK (total_amount_cents = platform_fee_cents + advisor_earnings_cents)
);

-- Expert recommendation: Advisor adjustments table for clean refund/chargeback handling
CREATE TABLE IF NOT EXISTS advisor_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES advisors(id),
  consultation_id uuid REFERENCES advisor_consultations(id),
  amount_cents int NOT NULL,          -- Negative for refunds/chargebacks, positive for bonuses
  reason text NOT NULL CHECK (reason IN ('refund','chargeback','manual')),
  created_by uuid REFERENCES auth.users(id),
  notes text,                         -- Admin notes for manual adjustments
  created_at timestamptz DEFAULT now()
);

-- Advisor reviews
CREATE TABLE IF NOT EXISTS advisor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES advisors(id),
  client_id uuid NOT NULL REFERENCES auth.users(id),
  consultation_id uuid REFERENCES advisor_consultations(id),
  rating int CHECK (rating BETWEEN 1 AND 5) NOT NULL,
  review_text text,
  expertise_rating int CHECK (expertise_rating BETWEEN 1 AND 5),
  communication_rating int CHECK (communication_rating BETWEEN 1 AND 5),
  helpfulness_rating int CHECK (helpfulness_rating BETWEEN 1 AND 5),
  created_at timestamptz DEFAULT now()
);

-- Monthly advisor payouts (expert recommendation)
CREATE TABLE IF NOT EXISTS advisor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES advisors(id),
  payout_month date NOT NULL,         -- e.g., 2025-09-01 for September
  total_earnings_cents int NOT NULL,  -- Sum of advisor_earnings_cents for the month
  stripe_transfer_id text,            -- Stripe Connect transfer ID
  currency text NOT NULL DEFAULT 'USD',
  status text CHECK (status IN ('pending','processing','paid','failed','on_hold')) DEFAULT 'pending',
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Expert recommendation: Cal.com webhook deduplication (following existing Stripe pattern)
CREATE TABLE IF NOT EXISTS advisor_processed_calcom_events (
  id text PRIMARY KEY,                -- Cal.com event ID
  event_type text NOT NULL,           -- BOOKING_CREATED, BOOKING_CANCELLED, etc.
  received_at timestamptz DEFAULT now()
);

-- =====================================================
-- Essential indexes for performance
-- =====================================================

-- Advisor consultation indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_advisor_consultations_advisor_time') THEN
    CREATE INDEX idx_advisor_consultations_advisor_time ON advisor_consultations (advisor_id, start_time);
    RAISE NOTICE '✅ Created index idx_advisor_consultations_advisor_time';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_advisor_consultations_client_time') THEN
    CREATE INDEX idx_advisor_consultations_client_time ON advisor_consultations (client_id, start_time);
    RAISE NOTICE '✅ Created index idx_advisor_consultations_client_time';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_advisor_consultations_cal') THEN
    CREATE UNIQUE INDEX idx_advisor_consultations_cal ON advisor_consultations (cal_booking_id);
    RAISE NOTICE '✅ Created unique index idx_advisor_consultations_cal';
  END IF;
END $$;

-- Advisor consultation charge indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_advisor_charges_pi') THEN
    CREATE UNIQUE INDEX idx_advisor_charges_pi ON advisor_consultation_charges (stripe_payment_intent_id);
    RAISE NOTICE '✅ Created unique index idx_advisor_charges_pi';
  END IF;
END $$;

-- Payout indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payouts_advisor_month') THEN
    CREATE INDEX idx_payouts_advisor_month ON advisor_payouts (advisor_id, payout_month);
    RAISE NOTICE '✅ Created index idx_payouts_advisor_month';
  END IF;
END $$;

-- Advisor indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_advisors_approval') THEN
    CREATE INDEX idx_advisors_approval ON advisors (approval_status, created_at);
    RAISE NOTICE '✅ Created index idx_advisors_approval';
  END IF;
END $$;

-- Advisor adjustment indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_advisor_adjustments_advisor') THEN
    CREATE INDEX idx_advisor_adjustments_advisor ON advisor_adjustments (advisor_id, created_at);
    RAISE NOTICE '✅ Created index idx_advisor_adjustments_advisor';
  END IF;
END $$;

-- Advisor Cal.com event indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_advisor_processed_calcom_received') THEN
    CREATE INDEX idx_advisor_processed_calcom_received ON advisor_processed_calcom_events (received_at);
    RAISE NOTICE '✅ Created index idx_advisor_processed_calcom_received';
  END IF;
END $$;

-- =====================================================
-- Security functions (following Migration 044 patterns)
-- =====================================================

-- Advisor lock function for concurrency control
CREATE OR REPLACE FUNCTION advisor_lock_user(p_user_id uuid)
RETURNS void 
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext('advisor:user')
  );
$$;

-- =====================================================
-- Grant permissions to worker role
-- =====================================================

-- Grant permissions (matching existing patterns)
DO $$
BEGIN
  -- Check if worker_db_role exists
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'worker_db_role') THEN
    GRANT SELECT, INSERT, UPDATE ON advisors TO worker_db_role;
    GRANT SELECT, INSERT, UPDATE ON advisor_consultations TO worker_db_role;  
    GRANT SELECT, INSERT, UPDATE ON advisor_consultation_charges TO worker_db_role;
    GRANT SELECT, INSERT, UPDATE ON advisor_reviews TO worker_db_role;
    GRANT SELECT, INSERT, UPDATE ON advisor_payouts TO worker_db_role;
    GRANT SELECT, INSERT, UPDATE ON advisor_adjustments TO worker_db_role;
    GRANT SELECT, INSERT, UPDATE ON advisor_processed_calcom_events TO worker_db_role;
    GRANT EXECUTE ON FUNCTION advisor_lock_user(uuid) TO worker_db_role;
    RAISE NOTICE '✅ Granted permissions to worker_db_role';
  ELSE
    RAISE NOTICE 'ℹ️ worker_db_role does not exist, skipping permission grants';
  END IF;
END $$;

-- =====================================================
-- Row Level Security Policies
-- =====================================================
-- Following existing patterns + expert privacy recommendations

-- Enable RLS on all tables
ALTER TABLE advisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_consultation_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_processed_calcom_events ENABLE ROW LEVEL SECURITY;

-- Advisors: SELECT own profile, UPDATE own profile fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisors' AND policyname = 'advisors_select_own') THEN
    CREATE POLICY advisors_select_own ON advisors
      FOR SELECT USING (user_id = auth.uid());
    RAISE NOTICE '✅ Created RLS policy: advisors_select_own';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisors' AND policyname = 'advisors_update_own') THEN
    CREATE POLICY advisors_update_own ON advisors
      FOR UPDATE USING (user_id = auth.uid());
    RAISE NOTICE '✅ Created RLS policy: advisors_update_own';
  END IF;
END $$;

-- Advisor consultations: Advisor sees own consultations, Client sees own bookings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_consultations' AND policyname = 'advisor_consultations_advisor_select') THEN
    CREATE POLICY advisor_consultations_advisor_select ON advisor_consultations
      FOR SELECT USING (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()));
    RAISE NOTICE '✅ Created RLS policy: advisor_consultations_advisor_select';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_consultations' AND policyname = 'advisor_consultations_client_select') THEN
    CREATE POLICY advisor_consultations_client_select ON advisor_consultations
      FOR SELECT USING (client_id = auth.uid());
    RAISE NOTICE '✅ Created RLS policy: advisor_consultations_client_select';
  END IF;
END $$;

-- Advisor reviews: Clients can insert reviews, both can read
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_reviews' AND policyname = 'advisor_reviews_client_insert') THEN
    CREATE POLICY advisor_reviews_client_insert ON advisor_reviews
      FOR INSERT WITH CHECK (client_id = auth.uid());
    RAISE NOTICE '✅ Created RLS policy: advisor_reviews_client_insert';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_reviews' AND policyname = 'advisor_reviews_read') THEN
    CREATE POLICY advisor_reviews_read ON advisor_reviews
      FOR SELECT USING (
        client_id = auth.uid() OR 
        advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid())
      );
    RAISE NOTICE '✅ Created RLS policy: advisor_reviews_read';
  END IF;
END $$;

-- Advisor payouts: Advisor sees own payouts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'advisor_payouts' AND policyname = 'advisor_payouts_select_own') THEN
    CREATE POLICY advisor_payouts_select_own ON advisor_payouts
      FOR SELECT USING (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()));
    RAISE NOTICE '✅ Created RLS policy: advisor_payouts_select_own';
  END IF;
END $$;

-- Financial tables: Admin only (advisor_consultation_charges, advisor_adjustments)
-- Note: Admin policies will be added when admin role system is implemented

DO $$
BEGIN
  RAISE NOTICE '🎯 Migration 045 completed successfully: Advisor Network MVP schema created';
  RAISE NOTICE '📊 Tables created: advisors, advisor_consultations, advisor_consultation_charges, advisor_adjustments, advisor_reviews, advisor_payouts, advisor_processed_calcom_events';
  RAISE NOTICE '🔒 RLS policies enabled with privacy protection for advisors';
  RAISE NOTICE '⚡ Performance indexes created for efficient queries';
  RAISE NOTICE '🔐 Security functions and permissions granted to worker_db_role';
END $$;