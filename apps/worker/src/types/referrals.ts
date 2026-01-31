// Referral Program Type Definitions
// Generated for SheenApps Friends Referral Program

export interface ReferralPartner {
  id: string;
  user_id: string;
  partner_code: string;
  status: 'active' | 'paused' | 'suspended';
  tier: 'bronze' | 'silver' | 'gold';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  company_name?: string | undefined;
  website_url?: string | undefined;
  marketing_channels?: string[] | undefined;

  // Metrics
  total_referrals: number;
  successful_referrals: number;
  total_commissions_earned_cents: number;

  // Legal & Payout
  terms_accepted_at: string;
  terms_version: string;
  tax_form_submitted: boolean;
  payout_method?: 'stripe' | 'paypal' | 'wire' | 'wise' | undefined;

  created_at: string;
  updated_at: string;
}

export interface Referral {
  id: string;
  partner_id: string;
  referred_user_id: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  attribution_method: 'cookie' | 'email_match' | 'referral_code';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  referral_code?: string | undefined;

  // Fraud detection
  referrer_ip_address?: string | undefined;
  referred_ip_address?: string | undefined;
  user_agent?: string | undefined;
  utm_source?: string | undefined;
  utm_medium?: string | undefined;
  utm_campaign?: string | undefined;

  attribution_date: string;
  first_payment_date?: string | undefined;
  confirmed_at?: string | undefined;
  created_at: string;
}

export interface Commission {
  id: string;
  referral_id: string;
  payment_id: string;
  partner_id: string;

  // Commission details
  base_amount_cents: number;
  commission_amount_cents: number;
  currency: string;
  commission_rate: number; // e.g., 15.00 for 15%

  // Lifecycle
  status: 'pending' | 'approved' | 'paid' | 'disputed' | 'reversed';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  reversal_reason?: string | undefined;

  // Business logic
  commission_period: number; // 1-12 months
  is_activation_bonus: boolean;

  // Payment processing
  due_date?: string | undefined;
  paid_at?: string | undefined;
  reversed_at?: string | undefined;
  payout_batch_id?: string | undefined;

  created_at: string;
  updated_at: string;
}

export interface ReferralTrackingSession {
  id: string;
  partner_id: string;
  session_id: string;
  ip_address: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  user_agent?: string | undefined;

  // Fraud metrics
  click_count: number;
  signup_count: number;
  unique_users_referred: number;

  first_seen: string;
  last_seen: string;

  // Fraud flags
  is_suspicious: boolean;
  suspicion_reasons?: string[] | undefined;
}

// API Request/Response Types
export interface CreatePartnerRequest {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  company_name?: string | undefined;
  website_url?: string | undefined;
  marketing_channels?: string[] | undefined;
  payout_method?: 'stripe' | 'paypal' | 'wire' | 'wise' | undefined;
  terms_accepted: boolean;
}

export interface CreatePartnerResponse {
  success: boolean;
  partner: ReferralPartner;
  referral_link: string;
}

export interface PartnerDashboardResponse {
  partner: ReferralPartner;
  stats: {
    total_clicks: number;
    total_signups: number;
    conversion_rate: number;
    pending_commissions_cents: number;
    approved_commissions_cents: number;
    estimated_monthly_payout_cents: number;
  };
  recent_referrals: Referral[];
  recent_commissions: Commission[];
}

export interface TrackReferralRequest {
  partner_code: string;
  user_id: string;
  attribution_method: 'cookie' | 'email_match' | 'referral_code';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  utm_source?: string | undefined;
  utm_medium?: string | undefined;
  utm_campaign?: string | undefined;
  ip_address: string;
  user_agent?: string | undefined;
}

export interface CommissionCalculationRequest {
  referral_id: string;
  payment_id: string;
  payment_amount_cents: number;
  currency: string;
}

// Fraud Detection Types
export interface FraudCheckResult {
  is_suspicious: boolean;
  risk_score: number; // 0-100
  reasons: string[];
  action: 'allow' | 'flag' | 'block';
}

export interface VelocityCheck {
  partner_id: string;
  ip_address: string;
  timeframe_hours: number;
  referral_count: number;
  signup_count: number;
}

// Analytics Types
export interface PartnerAnalytics {
  partner_id: string;
  period: 'day' | 'week' | 'month' | 'quarter';
  metrics: {
    clicks: number;
    signups: number;
    conversions: number;
    commission_earned_cents: number;
    top_utm_sources: Array<{source: string; clicks: number}>;
    conversion_funnel: {
      clicks: number;
      signups: number;
      first_payments: number;
      conversion_rate: number;
    };
  };
}

// Admin Types
export interface AdminPartnerOverview {
  overview: {
    total_partners: number;
    active_partners: number;
    total_referrals: number;
    successful_referrals: number;
    total_paid_cents: number;
    pending_payout_cents: number;
    pending_approval_cents: number;
    recent_referrals: number;
    recent_commissions_cents: number;
  };
  top_performers: Array<{
    partner: ReferralPartner;
    metrics: {
      referrals: number;
      commissions_earned_cents: number;
    };
  }>;
  suspicious_activity: Array<{
    partner_code: string;
    suspicion_reasons: string[];
    click_count: number;
    signup_count: number;
    last_seen: string;
  }>;
}

export interface PayoutBatch {
  id: string;
  created_by: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_amount_cents: number;
  currency: string;
  partner_count: number;
  commission_ids: string[];
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  processed_at?: string | undefined;
  error_message?: string | undefined;
  created_at: string;
}

// Tier calculation thresholds
export const TIER_THRESHOLDS = {
  BRONZE: { min: 0, max: 9, commission_rate: 15 },
  SILVER: { min: 10, max: 24, commission_rate: 20 },
  GOLD: { min: 25, max: Infinity, commission_rate: 25 }
} as const;

// Business constants
export const REFERRAL_CONSTANTS = {
  COOKIE_DURATION_DAYS: 90,
  COMMISSION_DURATION_MONTHS: 12,
  MINIMUM_PAYOUT_CENTS: 5000, // $50 USD
  ACTIVATION_BONUS_THRESHOLD: 3, // referrals needed for bonus
  ACTIVATION_BONUS_CENTS: 2500, // $25 bonus
  VELOCITY_LIMIT_PER_DAY: 10, // max referrals per IP per day
} as const;