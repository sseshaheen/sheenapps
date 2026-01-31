-- Stripe Billing Schema Migration
-- Creates tables for Stripe payment processing and subscription management

-- Customers table (links users to Stripe customers)
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    stripe_customer_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions table (tracks user subscriptions)
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    stripe_price_id TEXT NOT NULL,
    plan_name TEXT NOT NULL CHECK (plan_name IN ('free', 'starter', 'growth', 'scale')),
    status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment history table (track individual payments)
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'pending', 'failed', 'canceled')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking table (for plan enforcement)
CREATE TABLE usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    metric_name TEXT NOT NULL CHECK (metric_name IN ('projects_created', 'ai_generations', 'exports', 'storage_mb')),
    metric_value INTEGER NOT NULL DEFAULT 0,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one record per user/metric/period
    UNIQUE(user_id, metric_name, period_start)
);

-- Plan limits configuration (for reference)
CREATE TABLE plan_limits (
    plan_name TEXT PRIMARY KEY CHECK (plan_name IN ('free', 'starter', 'growth', 'scale')),
    max_projects INTEGER NOT NULL,
    max_ai_generations_per_month INTEGER NOT NULL,
    max_exports_per_month INTEGER NOT NULL,
    max_storage_mb INTEGER NOT NULL,
    features JSONB DEFAULT '{}', -- Custom features per plan
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plan limits
INSERT INTO plan_limits (plan_name, max_projects, max_ai_generations_per_month, max_exports_per_month, max_storage_mb, features) VALUES
('free', 3, 10, 1, 100, '{"custom_domain": false, "white_label": false, "priority_support": false}'),
('starter', 10, 100, 10, 500, '{"custom_domain": false, "white_label": false, "priority_support": false}'),
('growth', 50, 500, 50, 2000, '{"custom_domain": true, "white_label": false, "priority_support": true}'),
('scale', -1, -1, -1, 10000, '{"custom_domain": true, "white_label": true, "priority_support": true}'); -- -1 = unlimited

-- Performance indexes
CREATE INDEX idx_customers_user_id ON customers(user_id);
CREATE INDEX idx_customers_stripe_id ON customers(stripe_customer_id);
CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_plan ON subscriptions(plan_name);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_usage_tracking_user_period ON usage_tracking(user_id, period_start, period_end);
CREATE INDEX idx_usage_tracking_metric ON usage_tracking(metric_name);

-- Updated_at triggers for automatic timestamp updates
CREATE TRIGGER trigger_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_usage_tracking_updated_at
    BEFORE UPDATE ON usage_tracking
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_plan_limits_updated_at
    BEFORE UPDATE ON plan_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Helper functions for subscription management
CREATE OR REPLACE FUNCTION get_user_subscription(p_user_id UUID)
RETURNS TABLE (
    subscription_id UUID,
    plan_name TEXT,
    status TEXT,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.plan_name,
        s.status,
        s.current_period_end,
        s.cancel_at_period_end
    FROM subscriptions s
    INNER JOIN customers c ON c.id = s.customer_id
    WHERE c.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_usage(p_user_id UUID, p_metric_name TEXT, p_period_start TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
    usage_count INTEGER;
BEGIN
    SELECT COALESCE(metric_value, 0) INTO usage_count
    FROM usage_tracking
    WHERE user_id = p_user_id 
    AND metric_name = p_metric_name
    AND period_start = p_period_start;
    
    RETURN COALESCE(usage_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_user_usage(p_user_id UUID, p_metric_name TEXT, p_increment INTEGER DEFAULT 1)
RETURNS VOID AS $$
DECLARE
    period_start TIMESTAMPTZ;
    period_end TIMESTAMPTZ;
BEGIN
    -- Get current month period
    period_start := date_trunc('month', NOW());
    period_end := period_start + interval '1 month';
    
    INSERT INTO usage_tracking (user_id, metric_name, metric_value, period_start, period_end)
    VALUES (p_user_id, p_metric_name, p_increment, period_start, period_end)
    ON CONFLICT (user_id, metric_name, period_start)
    DO UPDATE SET 
        metric_value = usage_tracking.metric_value + p_increment,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;

-- Customers: Users can only see their own customer record
CREATE POLICY customers_user_policy ON customers
    FOR ALL USING (auth.uid() = user_id);

-- Subscriptions: Users can only see their own subscriptions
CREATE POLICY subscriptions_user_policy ON subscriptions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM customers c
            WHERE c.id = customer_id AND c.user_id = auth.uid()
        )
    );

-- Payments: Users can only see their own payments
CREATE POLICY payments_user_policy ON payments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM customers c
            WHERE c.id = customer_id AND c.user_id = auth.uid()
        )
    );

-- Usage tracking: Users can only see their own usage
CREATE POLICY usage_tracking_user_policy ON usage_tracking
    FOR ALL USING (auth.uid() = user_id);

-- Plan limits: Read-only for all authenticated users
CREATE POLICY plan_limits_read_policy ON plan_limits
    FOR SELECT USING (auth.role() = 'authenticated');

-- Comments for documentation
COMMENT ON TABLE customers IS 'Links auth.users to Stripe customers';
COMMENT ON TABLE subscriptions IS 'Active subscriptions with Stripe integration';
COMMENT ON TABLE payments IS 'Payment history for billing transparency';
COMMENT ON TABLE usage_tracking IS 'Track usage metrics for plan enforcement';
COMMENT ON TABLE plan_limits IS 'Configuration for plan limits and features';
COMMENT ON FUNCTION get_user_subscription(UUID) IS 'Get active subscription for user';
COMMENT ON FUNCTION get_user_usage(UUID, TEXT, TIMESTAMPTZ) IS 'Get usage count for user/metric/period';
COMMENT ON FUNCTION increment_user_usage(UUID, TEXT, INTEGER) IS 'Increment usage counter for user/metric';