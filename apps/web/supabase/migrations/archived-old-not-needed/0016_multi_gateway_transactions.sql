-- Migration: Multi-Gateway Payment Architecture
-- Description: Create unified transactions table and supporting structures for multi-gateway payment support
-- Date: 2025-06-27

-- Create unified transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  gateway VARCHAR(50) NOT NULL, -- 'stripe', 'cashier', 'paypal', etc.
  gateway_transaction_id VARCHAR(255) NOT NULL, -- External reference
  status VARCHAR(50) NOT NULL, -- 'pending', 'completed', 'failed', 'refunded'
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL,
  plan_name VARCHAR(50),
  product_type VARCHAR(50) NOT NULL, -- 'subscription', 'one-time', 'bonus'
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  country VARCHAR(2),
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_content VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_gateway ON public.transactions(gateway);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_transaction_date ON public.transactions(transaction_date);
CREATE INDEX idx_transactions_gateway_transaction_id ON public.transactions(gateway, gateway_transaction_id);
CREATE INDEX idx_transactions_product_type ON public.transactions(product_type);

-- Create webhook dead letter queue with retry history
CREATE TABLE IF NOT EXISTS public.webhook_dead_letter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  retry_history JSONB[] DEFAULT ARRAY[]::JSONB[], -- Array of {timestamp, error, status_code}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_retry_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for webhook dead letter
CREATE INDEX idx_webhook_dead_letter_gateway ON public.webhook_dead_letter(gateway);
CREATE INDEX idx_webhook_dead_letter_retry_count ON public.webhook_dead_letter(retry_count);
CREATE INDEX idx_webhook_dead_letter_created_at ON public.webhook_dead_letter(created_at);

-- Create usage bonuses table for bonus system
CREATE TABLE IF NOT EXISTS public.usage_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  metric VARCHAR(50) NOT NULL, -- 'ai_generations', 'exports'
  amount INTEGER NOT NULL,
  reason VARCHAR(100) NOT NULL, -- 'signup', 'referral', 'social_share', 'profile_complete'
  expires_at TIMESTAMP WITH TIME ZONE,
  consumed INTEGER DEFAULT 0,
  redeemed_at TIMESTAMP WITH TIME ZONE, -- First time bonus was used
  expiry_notified BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for usage bonuses
CREATE INDEX idx_usage_bonuses_user_id ON public.usage_bonuses(user_id);
CREATE INDEX idx_usage_bonuses_metric ON public.usage_bonuses(metric);
CREATE INDEX idx_usage_bonuses_expires_at ON public.usage_bonuses(expires_at);
CREATE INDEX idx_usage_bonuses_archived ON public.usage_bonuses(archived);

-- Create referrals table for referral tracking
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID REFERENCES auth.users(id) NOT NULL,
  referred_user_id UUID REFERENCES auth.users(id),
  referral_code VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'converted', 'expired'
  converted_at TIMESTAMP WITH TIME ZONE,
  conversion_plan VARCHAR(50), -- Which plan they subscribed to
  referrer_bonus_granted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days')
);

-- Create indexes for referrals
CREATE INDEX idx_referrals_code ON public.referrals(referral_code);
CREATE INDEX idx_referrals_status ON public.referrals(status, created_at);
CREATE INDEX idx_referrals_referrer_user_id ON public.referrals(referrer_user_id);
CREATE INDEX idx_referrals_referred_user_id ON public.referrals(referred_user_id);

-- Add new columns to subscriptions table for enhanced functionality
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS trial_start TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pause_reason VARCHAR(255),
  ADD COLUMN IF NOT EXISTS resume_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS tax_rate_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS tax_percentage DECIMAL(5,2);

-- Create organizations table for team support
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create organization members table
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- 'owner', 'admin', 'member', 'viewer'
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  joined_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(organization_id, user_id)
);

-- Create indexes for organizations
CREATE INDEX idx_organizations_owner_id ON public.organizations(owner_id);
CREATE INDEX idx_organizations_slug ON public.organizations(slug);
CREATE INDEX idx_organization_members_org_id ON public.organization_members(organization_id);
CREATE INDEX idx_organization_members_user_id ON public.organization_members(user_id);

-- Create organization usage tracking table
CREATE TABLE IF NOT EXISTS public.organization_usage (
  organization_id UUID REFERENCES public.organizations(id),
  period_start TIMESTAMP WITH TIME ZONE,
  metric_name VARCHAR(50),
  metric_value INTEGER,
  PRIMARY KEY (organization_id, period_start, metric_name)
);

-- Add foreign key constraint for organization_id in subscriptions
ALTER TABLE public.subscriptions
  ADD CONSTRAINT fk_subscriptions_organization
  FOREIGN KEY (organization_id)
  REFERENCES public.organizations(id)
  ON DELETE SET NULL;

-- Create RLS policies for new tables
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own transactions
CREATE POLICY "Users can view own transactions" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

-- RLS Policy: Service role can manage all transactions
CREATE POLICY "Service role can manage transactions" ON public.transactions
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policy: Users can view their own usage bonuses
CREATE POLICY "Users can view own usage bonuses" ON public.usage_bonuses
  FOR SELECT USING (auth.uid() = user_id);

-- RLS Policy: Service role can manage all usage bonuses
CREATE POLICY "Service role can manage usage bonuses" ON public.usage_bonuses
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policy: Users can view referrals they created or were referred by
CREATE POLICY "Users can view related referrals" ON public.referrals
  FOR SELECT USING (
    auth.uid() = referrer_user_id OR 
    auth.uid() = referred_user_id
  );

-- RLS Policy: Service role can manage all referrals
CREATE POLICY "Service role can manage referrals" ON public.referrals
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policy: Organization members can view their organization
CREATE POLICY "Organization members can view organization" ON public.organizations
  FOR SELECT USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organizations.id
      AND user_id = auth.uid()
    )
  );

-- RLS Policy: Only owners can update their organization
CREATE POLICY "Organization owners can update" ON public.organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- RLS Policy: Service role can manage all organizations
CREATE POLICY "Service role can manage organizations" ON public.organizations
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policy: Organization members can view member list
CREATE POLICY "Organization members can view members" ON public.organization_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can manage all organization members
CREATE POLICY "Service role can manage organization members" ON public.organization_members
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policy: Organization members can view their org usage
CREATE POLICY "Organization members can view usage" ON public.organization_usage
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_usage.organization_id
      AND user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can manage all organization usage
CREATE POLICY "Service role can manage organization usage" ON public.organization_usage
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policy: Service role can manage webhook dead letter
CREATE POLICY "Service role can manage webhook dead letter" ON public.webhook_dead_letter
  FOR ALL USING (auth.role() = 'service_role');

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER handle_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.transactions IS 'Unified payment transactions across all gateways';
COMMENT ON TABLE public.webhook_dead_letter IS 'Failed webhook events for retry processing';
COMMENT ON TABLE public.usage_bonuses IS 'Bonus usage grants for users (signup, referral, etc)';
COMMENT ON TABLE public.referrals IS 'User referral tracking and attribution';
COMMENT ON TABLE public.organizations IS 'Team/organization accounts';
COMMENT ON TABLE public.organization_members IS 'Members of organizations with roles';
COMMENT ON TABLE public.organization_usage IS 'Usage tracking at organization level';

COMMENT ON COLUMN public.transactions.gateway IS 'Payment gateway identifier (stripe, cashier, paypal, etc)';
COMMENT ON COLUMN public.transactions.product_type IS 'Type of product (subscription, one-time, bonus)';
COMMENT ON COLUMN public.usage_bonuses.reason IS 'Reason for bonus grant (signup, referral, social_share, profile_complete)';
COMMENT ON COLUMN public.referrals.status IS 'Referral status (pending, converted, expired)';
COMMENT ON COLUMN public.organization_members.role IS 'Member role (owner, admin, member, viewer)';