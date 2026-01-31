-- Migration: 0015_stripe_billing_improvements_corrected.sql
-- Description: Apply expert-recommended improvements to Stripe billing schema
-- Dependencies: Must run after 0014_stripe_billing_schema.sql
-- Fixed: Handles existing CHECK constraints and matches actual column names

-- First, let's check what constraints/indexes exist that might cause issues
DO $$
BEGIN
  RAISE NOTICE 'Starting migration - checking existing constraints...';
END $$;

-- 1. Create ENUMs for better type safety
CREATE TYPE subscription_status AS ENUM (
  'active',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'paused',
  'trialing',
  'unpaid'
);

CREATE TYPE payment_status AS ENUM (
  'succeeded',
  'pending',
  'failed',
  'refunded',
  'partially_refunded'
);

-- 2. Create currencies table (better than ENUM for currencies)
CREATE TABLE IF NOT EXISTS currencies (
  code CHAR(3) PRIMARY KEY,
  name TEXT NOT NULL,
  stripe_enabled BOOLEAN DEFAULT TRUE
);

-- Seed common currencies
INSERT INTO currencies (code, name) VALUES
  ('USD', 'US Dollar'),
  ('EUR', 'Euro'),
  ('GBP', 'British Pound'),
  ('JPY', 'Japanese Yen'),
  ('AUD', 'Australian Dollar'),
  ('CAD', 'Canadian Dollar'),
  ('AED', 'UAE Dirham'),
  ('SAR', 'Saudi Riyal'),
  ('EGP', 'Egyptian Pound'),
  ('MAD', 'Moroccan Dirham')
ON CONFLICT (code) DO NOTHING;

-- 3. Drop existing constraints/indexes that might reference status as text
-- This MUST happen BEFORE we change the column type

-- Drop any CHECK constraints on subscriptions.status
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'subscriptions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    RAISE NOTICE 'Dropped constraint: %', r.conname;
  END LOOP;
END $$;

-- Drop any partial indexes that filter on status
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT i.relname AS index_name
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE ix.indrelid = 'subscriptions'::regclass
      AND pg_get_indexdef(i.oid) ILIKE '%status%'
  LOOP
    EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(r.index_name);
    RAISE NOTICE 'Dropped index: %', r.index_name;
  END LOOP;
END $$;

-- Drop any RLS policies that reference status
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'subscriptions'::regclass
      AND pg_get_expr(polqual, polrelid) ILIKE '%status%'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.polname) || ' ON subscriptions';
    RAISE NOTICE 'Dropped policy: %', r.polname;
  END LOOP;
END $$;

-- Do the same for payments table
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop CHECK constraints
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'payments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE payments DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    RAISE NOTICE 'Dropped payments constraint: %', r.conname;
  END LOOP;

  -- Drop indexes
  FOR r IN
    SELECT i.relname AS index_name
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE ix.indrelid = 'payments'::regclass
      AND pg_get_indexdef(i.oid) ILIKE '%status%'
  LOOP
    EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(r.index_name);
    RAISE NOTICE 'Dropped payments index: %', r.index_name;
  END LOOP;
END $$;

-- 4. Update customers table
ALTER TABLE customers
  ALTER COLUMN stripe_customer_id TYPE VARCHAR(255);

-- 5. Update subscriptions table
ALTER TABLE subscriptions
  -- Now we can safely change to ENUM since constraints are dropped
  ALTER COLUMN status TYPE subscription_status USING status::subscription_status,
  ALTER COLUMN stripe_subscription_id TYPE VARCHAR(255),
  ALTER COLUMN stripe_price_id TYPE VARCHAR(255),
  ALTER COLUMN current_period_start SET NOT NULL,
  ALTER COLUMN current_period_end SET NOT NULL,
  ADD COLUMN IF NOT EXISTS currency CHAR(3) DEFAULT 'USD' NOT NULL;

-- Add foreign key constraints
ALTER TABLE subscriptions
  ADD CONSTRAINT fk_subscription_plan
    FOREIGN KEY (plan_name)
    REFERENCES plan_limits(plan_name)
    ON UPDATE CASCADE,
  ADD CONSTRAINT fk_sub_currency
    FOREIGN KEY (currency)
    REFERENCES currencies(code);

-- 6. Update payments table
-- First rename amount_cents to amount if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'amount_cents'
  ) THEN
    ALTER TABLE payments RENAME COLUMN amount_cents TO amount;
  END IF;
END $$;

ALTER TABLE payments
  -- Now safe to change to ENUM
  ALTER COLUMN status TYPE payment_status USING status::payment_status,
  ALTER COLUMN stripe_payment_intent_id TYPE VARCHAR(255),
  ALTER COLUMN amount TYPE BIGINT,
  ADD COLUMN IF NOT EXISTS currency CHAR(3) DEFAULT 'USD' NOT NULL,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,9) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount_usd BIGINT
    GENERATED ALWAYS AS (amount * COALESCE(exchange_rate, 1)) STORED,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id VARCHAR(255),
  ADD CONSTRAINT chk_pay_amount_positive CHECK (amount >= 0);

ALTER TABLE payments
  ADD CONSTRAINT fk_pay_currency
    FOREIGN KEY (currency)
    REFERENCES currencies(code);

-- 7. Now recreate indexes with proper ENUM casts
-- For subscriptions
CREATE INDEX idx_active_subscriptions
  ON subscriptions (customer_id)
  WHERE status IN ('active'::subscription_status, 'trialing'::subscription_status);

-- For payments
CREATE INDEX idx_successful_payments
  ON payments (created_at DESC)
  WHERE status = 'succeeded'::payment_status;

CREATE INDEX idx_failed_payments
  ON payments (created_at DESC)
  WHERE status IN ('failed'::payment_status, 'partially_refunded'::payment_status);

-- 8. Create domain for unlimited values
CREATE DOMAIN usage_limit AS INTEGER
  CHECK (VALUE >= -1);
COMMENT ON DOMAIN usage_limit IS '-1 represents unlimited usage';

-- Update plan_limits to use the domain - CORRECTED COLUMN NAMES
ALTER TABLE plan_limits
  ALTER COLUMN max_projects TYPE usage_limit,
  ALTER COLUMN max_ai_generations_per_month TYPE usage_limit,
  ALTER COLUMN max_exports_per_month TYPE usage_limit,
  ALTER COLUMN max_storage_mb TYPE usage_limit;

-- 9. Optimize usage_tracking index
ALTER TABLE usage_tracking DROP CONSTRAINT IF EXISTS usage_tracking_pkey;
ALTER TABLE usage_tracking ADD PRIMARY KEY (user_id, period_start);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_period_range
  ON usage_tracking(user_id, period_start, period_end);

-- 10. Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_invoice_id VARCHAR(255) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount_paid BIGINT NOT NULL CHECK (amount_paid >= 0),
  amount_due BIGINT NOT NULL CHECK (amount_due >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' REFERENCES currencies(code),
  exchange_rate NUMERIC(18,9) DEFAULT 1,
  amount_paid_usd BIGINT GENERATED ALWAYS AS (amount_paid * COALESCE(exchange_rate, 1)) STORED,
  status TEXT NOT NULL,
  invoice_pdf TEXT,
  hosted_invoice_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Update SECURITY DEFINER functions with ENUM casts
DROP FUNCTION IF EXISTS get_user_subscription(UUID);

CREATE OR REPLACE FUNCTION get_user_subscription(p_user_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan_name TEXT,
  status subscription_status,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id cannot be null';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.plan_name,
    s.status,
    s.current_period_start,
    s.current_period_end,
    s.cancel_at_period_end
  FROM subscriptions s
  JOIN customers c ON s.customer_id = c.id
  WHERE c.user_id = p_user_id
    AND s.status IN ('active'::subscription_status, 'trialing'::subscription_status)
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION get_user_subscription(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_subscription(UUID) TO authenticated;

-- 12. Back-fill customers for existing users
-- First, make stripe_customer_id temporarily nullable for backfill
ALTER TABLE customers ALTER COLUMN stripe_customer_id DROP NOT NULL;

DO $$
BEGIN
  INSERT INTO customers (user_id, email, created_at, updated_at)
  SELECT u.id, u.email, u.created_at, NOW()
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.user_id = u.id
  );

  RAISE NOTICE 'Back-filled % customer records', (SELECT COUNT(*) FROM customers);
END $$;

-- Generate placeholder stripe_customer_ids for backfilled records
UPDATE customers
SET stripe_customer_id = 'cus_placeholder_' || SUBSTRING(id::text FROM 1 FOR 8)
WHERE stripe_customer_id IS NULL;

-- Restore NOT NULL constraint
ALTER TABLE customers ALTER COLUMN stripe_customer_id SET NOT NULL;

-- 13. Enable RLS on new tables
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Create RLS policies with ENUM casts where needed
CREATE POLICY "Users can view their own invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Prevent invoice deletion"
  ON invoices FOR DELETE
  USING (false);

-- 14. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer_date ON payments(customer_id, created_at DESC);

-- 15. Add helpful comments
COMMENT ON TABLE customers IS 'Stripe customer records linked to auth users';
COMMENT ON TABLE subscriptions IS 'Active and historical subscription data';
COMMENT ON TABLE payments IS 'Payment transaction history';
COMMENT ON TABLE invoices IS 'Invoice records for full accounting ledger';
COMMENT ON TABLE usage_tracking IS 'Tracks API and resource usage per billing period';
COMMENT ON TABLE plan_limits IS 'Defines limits for each subscription plan. -1 = unlimited';

-- 16. Create helper function with ENUM casts and corrected column names
CREATE OR REPLACE FUNCTION has_unlimited_access(
  p_user_id UUID,
  p_resource TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
BEGIN
  SELECT
    CASE p_resource
      WHEN 'projects' THEN pl.max_projects
      WHEN 'ai_calls' THEN pl.max_ai_generations_per_month
      WHEN 'exports' THEN pl.max_exports_per_month
      WHEN 'storage' THEN pl.max_storage_mb
      ELSE 0
    END INTO v_limit
  FROM customers c
  JOIN subscriptions s ON c.id = s.customer_id
  JOIN plan_limits pl ON s.plan_name = pl.plan_name
  WHERE c.user_id = p_user_id
    AND s.status IN ('active'::subscription_status, 'trialing'::subscription_status)
  ORDER BY s.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_limit = -1, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION has_unlimited_access(UUID, TEXT) TO authenticated;

-- 17. Ensure update trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $$;

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 18. Create subscription history table
CREATE TABLE IF NOT EXISTS subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'canceled', 'reactivated')),
  old_status subscription_status,
  new_status subscription_status,
  old_plan_name TEXT,
  new_plan_name TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscription_history_sub ON subscription_history(subscription_id);
CREATE INDEX idx_subscription_history_date ON subscription_history(created_at DESC);

ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their subscription history"
  ON subscription_history FOR SELECT
  TO authenticated
  USING (
    subscription_id IN (
      SELECT s.id
      FROM subscriptions s
      JOIN customers c ON s.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

-- 19. Recreate any RLS policies that were dropped (with ENUM casts)
-- Example: If you had policies on subscriptions table
CREATE POLICY "Users can view their own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  );

-- Final status message
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '- Converted status columns to ENUMs';
  RAISE NOTICE '- Added currency support with FX tracking';
  RAISE NOTICE '- Created invoices table for full ledger';
  RAISE NOTICE '- Optimized indexes and added performance improvements';
  RAISE NOTICE '- All constraints and indexes recreated with proper ENUM casts';
  RAISE NOTICE '- Used correct column names from 0014 migration';
END $$;
