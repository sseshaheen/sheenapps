-- Migration: 109_inhouse_payments.sql
-- Description: Payment tracking tables for Easy Mode projects (BYO Stripe keys)
-- Date: 2026-01-24

-- =============================================================================
-- Payment Customers Table
-- =============================================================================
-- Maps project's Stripe customers to local records

CREATE TABLE IF NOT EXISTS public.inhouse_payment_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255) NOT NULL,
    email TEXT,
    name TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint on project + customer combination
    CONSTRAINT inhouse_payment_customers_project_customer_unique
        UNIQUE (project_id, stripe_customer_id)
);

-- Indexes for customer lookups
CREATE INDEX IF NOT EXISTS idx_inhouse_payment_customers_project
    ON public.inhouse_payment_customers(project_id);

CREATE INDEX IF NOT EXISTS idx_inhouse_payment_customers_email
    ON public.inhouse_payment_customers(project_id, email);

-- =============================================================================
-- Payment Events Table
-- =============================================================================
-- Stores Stripe webhook events for tracking and replay

CREATE TABLE IF NOT EXISTS public.inhouse_payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    stripe_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    customer_id VARCHAR(255),
    subscription_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint prevents duplicate event processing
    CONSTRAINT inhouse_payment_events_project_event_unique
        UNIQUE (project_id, stripe_event_id)
);

-- Indexes for event queries
CREATE INDEX IF NOT EXISTS idx_inhouse_payment_events_project
    ON public.inhouse_payment_events(project_id);

CREATE INDEX IF NOT EXISTS idx_inhouse_payment_events_type
    ON public.inhouse_payment_events(project_id, event_type);

CREATE INDEX IF NOT EXISTS idx_inhouse_payment_events_status
    ON public.inhouse_payment_events(project_id, status);

CREATE INDEX IF NOT EXISTS idx_inhouse_payment_events_customer
    ON public.inhouse_payment_events(project_id, customer_id)
    WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inhouse_payment_events_subscription
    ON public.inhouse_payment_events(project_id, subscription_id)
    WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inhouse_payment_events_created
    ON public.inhouse_payment_events(project_id, created_at DESC);

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE public.inhouse_payment_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_payment_events ENABLE ROW LEVEL SECURITY;

-- Customers: Project owner can read/write
CREATE POLICY inhouse_payment_customers_select ON public.inhouse_payment_customers
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY inhouse_payment_customers_insert ON public.inhouse_payment_customers
    FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY inhouse_payment_customers_update ON public.inhouse_payment_customers
    FOR UPDATE
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY inhouse_payment_customers_delete ON public.inhouse_payment_customers
    FOR DELETE
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE owner_id = auth.uid()
        )
    );

-- Events: Project owner can read, service role can write
CREATE POLICY inhouse_payment_events_select ON public.inhouse_payment_events
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE owner_id = auth.uid()
        )
    );

-- Service role bypass for webhook processing
CREATE POLICY inhouse_payment_events_service_insert ON public.inhouse_payment_events
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY inhouse_payment_events_service_update ON public.inhouse_payment_events
    FOR UPDATE
    USING (true);

-- =============================================================================
-- Cleanup function for old events (90 days retention)
-- =============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_payment_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.inhouse_payment_events
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND status = 'processed';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE public.inhouse_payment_customers IS 'Stripe customers for Easy Mode projects (BYO keys)';
COMMENT ON TABLE public.inhouse_payment_events IS 'Stripe webhook events for Easy Mode projects';
COMMENT ON COLUMN public.inhouse_payment_events.status IS 'Event processing status: pending, processed, or failed';
COMMENT ON FUNCTION cleanup_old_payment_events() IS 'Removes processed payment events older than 90 days';
