-- 131_business_events_rls_and_currency.sql
-- Purpose: Add RLS policies for business tables and support per-currency rollups

-- =============================================================================
-- business_kpi_daily primary key (include currency_code)
-- =============================================================================

-- Only alter if the constraint doesn't already include currency_code
DO $$
BEGIN
  -- Check if primary key exists and has 3 columns (project_id, date, currency_code)
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'business_kpi_daily'
      AND c.contype = 'p'
      AND c.conname = 'business_kpi_daily_pkey'
  ) THEN
    -- Check column count in primary key
    IF (
      SELECT COUNT(*) FROM pg_attribute a
      JOIN pg_constraint c ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'business_kpi_daily' AND c.contype = 'p'
    ) < 3 THEN
      -- Drop old 2-column PK and add 3-column PK
      ALTER TABLE business_kpi_daily DROP CONSTRAINT business_kpi_daily_pkey;
      ALTER TABLE business_kpi_daily ADD CONSTRAINT business_kpi_daily_pkey PRIMARY KEY (project_id, date, currency_code);
    END IF;
  ELSE
    -- No PK exists, create it
    ALTER TABLE business_kpi_daily ADD CONSTRAINT business_kpi_daily_pkey PRIMARY KEY (project_id, date, currency_code);
  END IF;
END $$;

-- =============================================================================
-- RLS Policies (idempotent)
-- =============================================================================

ALTER TABLE public.business_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_kpi_daily ENABLE ROW LEVEL SECURITY;

-- Project owner can read their business events
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'business_events_owner_select') THEN
    CREATE POLICY business_events_owner_select ON public.business_events
      FOR SELECT
      USING (
        project_id IN (
          SELECT id FROM public.projects WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Service role can insert events (ingestion)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'business_events_service_insert') THEN
    CREATE POLICY business_events_service_insert ON public.business_events
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Project owner can read their daily KPIs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'business_kpi_daily_owner_select') THEN
    CREATE POLICY business_kpi_daily_owner_select ON public.business_kpi_daily
      FOR SELECT
      USING (
        project_id IN (
          SELECT id FROM public.projects WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Service role can insert/update rollups
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'business_kpi_daily_service_insert') THEN
    CREATE POLICY business_kpi_daily_service_insert ON public.business_kpi_daily
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'business_kpi_daily_service_update') THEN
    CREATE POLICY business_kpi_daily_service_update ON public.business_kpi_daily
      FOR UPDATE
      USING (true);
  END IF;
END $$;
