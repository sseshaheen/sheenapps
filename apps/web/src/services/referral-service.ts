/**
 * SheenApps Friends Referral Program Service
 * Handles partner management, referral tracking, and commission analytics
 */

import { createWorkerAuthHeaders } from '@/utils/worker-auth'

// =============================================================================
// TYPES
// =============================================================================

export interface CreatePartnerRequest {
  company_name?: string;
  website_url?: string;
  marketing_channels?: string[];
  payout_method?: 'stripe' | 'paypal' | 'wire' | 'wise';
  terms_accepted: boolean;
}

export interface CreatePartnerResponse {
  success: boolean;
  partner: ReferralPartner;
  referral_link: string;
}

export interface ReferralPartner {
  id: string;
  user_id: string;
  partner_code: string;
  tier: 'bronze' | 'silver' | 'gold';
  status: 'active' | 'paused' | 'suspended';
  commission_rate: number;
  successful_referrals: number;
  total_earnings_cents: number;
  company_name?: string;
  website_url?: string;
  marketing_channels?: string[];
  payout_method?: string;
  created_at: string;
  updated_at: string;
}

export interface Referral {
  id: string;
  partner_id: string;
  referred_user_id: string;
  partner_code: string;
  status: 'pending' | 'confirmed' | 'failed';
  attribution_method: 'cookie' | 'email_match' | 'referral_code';
  fraud_check: 'clean' | 'flagged' | 'approved' | 'blocked';
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ip_address: string;
  user_agent?: string;
  created_at: string;
}

export interface Commission {
  id: string;
  partner_id: string;
  referral_id: string;
  payment_id: string;
  commission_amount_cents: number;
  commission_rate: number;
  payment_amount_cents: number;
  status: 'pending' | 'approved' | 'paid' | 'reversed';
  is_activation_bonus: boolean;
  payout_batch_id?: string;
  created_at: string;
  approved_at?: string;
  paid_at?: string;
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

export interface TrackClickRequest {
  partner_code: string;
  ip_address: string;
  user_agent?: string;
}

export interface TrackClickResponse {
  success: boolean;
  tracked: boolean;
}

export interface TrackReferralRequest {
  partner_code: string;
  attribution_method: 'cookie' | 'email_match' | 'referral_code';
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ip_address: string;
  user_agent?: string;
}

export interface TrackReferralResponse {
  success: boolean;
  referral_id: string;
  fraud_check: 'clean' | 'flagged';
}

// =============================================================================
// ADMIN API TYPES
// =============================================================================

export interface AdminOverviewResponse {
  total_partners: number;
  active_partners: number;
  total_referrals: number;
  successful_referrals: number;
  total_paid_cents: number;
  pending_payout_cents: number;
  pending_approval_cents: number;
  recent_referrals: number;
  recent_commissions_cents: number;
  top_performers: Array<{
    partner_code: string;
    company_name?: string;
    referrals_count: number;
    commissions_cents: number;
  }>;
  fraud_alerts_count: number;
  conversion_rate: number;
}

export interface AdminPartnersResponse {
  partners: Array<ReferralPartner & {
    user_email: string;
    pending_commissions_cents: number;
    last_referral_at?: string;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface AdminPendingCommissionsResponse {
  commissions: Array<Commission & {
    partner_code: string;
    user_email: string;
  }>;
  summary: {
    total_pending_cents: number;
    total_commissions: number;
    unique_partners: number;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface PayoutBatch {
  id: string;
  total_amount_cents: number;
  partner_count: number;
  commission_count: number;
  payout_method: string;
  status: 'created' | 'processing' | 'completed' | 'failed';
  description?: string;
  created_at: string;
  processed_at?: string;
  error_message?: string;
}

export interface CreatePayoutBatchRequest {
  partner_ids?: string[];
  payout_method: 'stripe' | 'paypal' | 'wire' | 'wise';
  minimum_amount_cents: number;
  description: string;
}

export interface CreatePayoutBatchResponse {
  success: boolean;
  batch: PayoutBatch;
}

export interface PayoutBatchesResponse {
  batches: PayoutBatch[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface FraudAlert {
  id: string;
  type: 'suspicious_ip_pattern' | 'velocity_check' | 'duplicate_signup' | 'other';
  severity: 'low' | 'medium' | 'high';
  partner_code: string;
  description: string;
  affected_referrals: number;
  ip_address?: string;
  created_at: string;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
}

export interface FraudAlertsResponse {
  alerts: FraudAlert[];
  summary: {
    total_alerts: number;
    high_severity: number;
    medium_severity: number;
    open_alerts: number;
  };
}

export interface ApproveCommissionsRequest {
  commission_ids: string[];
}

export interface ApproveCommissionsResponse {
  success: boolean;
  approved_count: number;
  total_amount_cents: number;
  failed_approvals: Array<{
    commission_id: string;
    error: string;
  }>;
}

export interface UpdatePartnerStatusRequest {
  status: 'active' | 'paused' | 'suspended';
  reason?: string;
}

export interface UpdatePartnerStatusResponse {
  success: boolean;
  partner: {
    id: string;
    status: string;
    updated_at: string;
  };
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class ReferralService {
  private static baseUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL;

  private static getBaseUrl(): string {
    if (!this.baseUrl) {
      throw new Error('WORKER_BASE_URL not configured for referral service');
    }
    return this.baseUrl;
  }

  // ===========================================================================
  // PARTNER MANAGEMENT
  // ===========================================================================

  /**
   * Create a new referral partner account
   * User identity is derived from HMAC signature validation
   */
  static async createPartner(data: CreatePartnerRequest): Promise<CreatePartnerResponse> {
    const payload = { ...data };
    const authHeaders = createWorkerAuthHeaders('POST', '/v1/referrals/partners', JSON.stringify(payload));

    const response = await fetch(`${this.getBaseUrl()}/v1/referrals/partners`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create partner account' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get partner dashboard data
   */
  static async getPartnerDashboard(userId: string): Promise<PartnerDashboardResponse> {
    const path = `/v1/referrals/dashboard?userId=${userId}`;
    const authHeaders = createWorkerAuthHeaders('GET', path, '');

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: 'GET',
      headers: authHeaders
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to load dashboard' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check if user has partner account
   */
  static async checkPartnerStatus(userId: string): Promise<boolean> {
    try {
      await this.getPartnerDashboard(userId);
      return true;
    } catch (error: any) {
      if (error.message.includes('404') || error.message.includes('Partner not found')) {
        return false;
      }
      // Re-throw other errors (network, auth, etc.)
      throw error;
    }
  }

  // ===========================================================================
  // REFERRAL TRACKING
  // ===========================================================================

  /**
   * Track referral link click (no authentication required)
   */
  static async trackReferralClick(data: TrackClickRequest): Promise<TrackClickResponse> {
    const response = await fetch(`${this.getBaseUrl()}/v1/referrals/track-click`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to track click' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Track referral signup attribution
   * User identity is derived from HMAC signature validation
   */
  static async trackReferralSignup(data: TrackReferralRequest): Promise<TrackReferralResponse> {
    const payload = { ...data };
    const authHeaders = createWorkerAuthHeaders('POST', '/v1/referrals/signup', JSON.stringify(payload));

    const response = await fetch(`${this.getBaseUrl()}/v1/referrals/signup`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to track referral' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // ===========================================================================
  // ADMIN APIs
  // ===========================================================================

  /**
   * Get admin overview dashboard (admin only)
   */
  static async getAdminOverview(days = 30): Promise<AdminOverviewResponse> {
    const path = `/v1/admin/referrals/overview?days=${days}`;
    const authHeaders = createWorkerAuthHeaders('GET', path, '');

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: 'GET',
      headers: authHeaders
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to load admin overview' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get all partners with filtering and pagination (admin only)
   */
  static async getAdminPartners(options: {
    status?: 'active' | 'paused' | 'suspended';
    tier?: 'bronze' | 'silver' | 'gold';
    limit?: number;
    offset?: number;
    search?: string;
    sort?: 'created_asc' | 'created_desc' | 'earnings_asc' | 'earnings_desc' | 'referrals_asc' | 'referrals_desc';
  } = {}): Promise<AdminPartnersResponse> {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, value.toString());
      }
    });
    
    const path = `/v1/admin/referrals/partners?${params.toString()}`;
    const authHeaders = createWorkerAuthHeaders('GET', path, '');

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: 'GET',
      headers: authHeaders
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to load partners' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Update partner status (admin only)
   */
  static async updatePartnerStatus(partnerId: string, data: UpdatePartnerStatusRequest): Promise<UpdatePartnerStatusResponse> {
    const path = `/v1/admin/referrals/partners/${partnerId}/status`;
    const authHeaders = createWorkerAuthHeaders('PUT', path, JSON.stringify(data));

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to update partner status' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get pending commissions for admin approval (admin only)
   */
  static async getPendingCommissions(options: {
    partner_id?: string;
    days?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<AdminPendingCommissionsResponse> {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, value.toString());
      }
    });
    
    const path = `/v1/admin/referrals/commissions/pending?${params.toString()}`;
    const authHeaders = createWorkerAuthHeaders('GET', path, '');

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: 'GET',
      headers: authHeaders
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to load pending commissions' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Approve multiple commissions for payout (admin only)
   */
  static async approveCommissions(data: ApproveCommissionsRequest): Promise<ApproveCommissionsResponse> {
    const path = '/v1/admin/referrals/commissions/approve';
    const authHeaders = createWorkerAuthHeaders('POST', path, JSON.stringify(data));

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to approve commissions' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create payout batch from approved commissions (admin only)
   */
  static async createPayoutBatch(data: CreatePayoutBatchRequest): Promise<CreatePayoutBatchResponse> {
    const path = '/v1/admin/referrals/payouts/batch';
    const authHeaders = createWorkerAuthHeaders('POST', path, JSON.stringify(data));

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create payout batch' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get payout batches with filtering (admin only)
   */
  static async getPayoutBatches(options: {
    status?: 'created' | 'processing' | 'completed' | 'failed';
    payout_method?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<PayoutBatchesResponse> {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, value.toString());
      }
    });
    
    const path = `/v1/admin/referrals/payouts/batches?${params.toString()}`;
    const authHeaders = createWorkerAuthHeaders('GET', path, '');

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: 'GET',
      headers: authHeaders
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to load payout batches' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get fraud detection alerts (admin only)
   */
  static async getFraudAlerts(days = 7): Promise<FraudAlertsResponse> {
    const path = `/v1/admin/referrals/fraud/alerts?days=${days}`;
    const authHeaders = createWorkerAuthHeaders('GET', path, '');

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method: 'GET',
      headers: authHeaders
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to load fraud alerts' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================

  /**
   * Generate full referral link for a partner code
   */
  static generateReferralLink(partnerCode: string, baseUrl: string = 'https://app.sheenapps.com'): string {
    return `${baseUrl}/?ref=${partnerCode}`;
  }

  /**
   * Validate referral code format
   */
  static isValidReferralCode(code: string): boolean {
    return /^[A-Z0-9]{6,20}$/.test(code);
  }

  /**
   * Get user IP address (client-side helper)
   */
  static async getUserIP(): Promise<string> {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip || '127.0.0.1';
    } catch {
      return '127.0.0.1';
    }
  }

  /**
   * Extract and normalize referral code from URL parameters
   * Accepts: ref, r, referrer (standardizes to 'ref')
   */
  static extractReferralCode(searchParams: URLSearchParams): string | null {
    // Priority order: ref > r > referrer
    const code = searchParams.get('ref') || 
                 searchParams.get('r') || 
                 searchParams.get('referrer');
    
    return code && this.isValidReferralCode(code) ? code : null;
  }

  /**
   * Store referral code for attribution (90 days)
   */
  static storeReferralCode(code: string): void {
    if (typeof window === 'undefined') return;
    
    const maxAge = 90 * 24 * 60 * 60; // 90 days in seconds
    
    // Store in localStorage
    localStorage.setItem('referral_code', code);
    
    // Store in cookie for server-side access
    document.cookie = `referral_code=${code}; max-age=${maxAge}; path=/; SameSite=Lax`;
  }

  /**
   * Retrieve stored referral code
   */
  static getStoredReferralCode(): string | null {
    if (typeof window === 'undefined') return null;
    
    // Try localStorage first, fallback to cookie
    const stored = localStorage.getItem('referral_code') || this.getCookie('referral_code');
    return stored && this.isValidReferralCode(stored) ? stored : null;
  }

  /**
   * Clear stored referral code (after successful attribution)
   */
  static clearStoredReferralCode(): void {
    if (typeof window === 'undefined') return;
    
    localStorage.removeItem('referral_code');
    document.cookie = 'referral_code=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  }

  /**
   * Helper to get cookie value
   */
  private static getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    
    if (parts.length === 2) {
      const result = parts.pop()?.split(';').shift();
      return result || null;
    }
    
    return null;
  }

  /**
   * Generate tier-based commission rate
   */
  static getCommissionRate(tier: 'bronze' | 'silver' | 'gold'): number {
    switch (tier) {
      case 'bronze': return 0.15; // 15%
      case 'silver': return 0.20; // 20% 
      case 'gold': return 0.25; // 25%
      default: return 0.15;
    }
  }

  /**
   * Format commission amount for display
   */
  static formatCommission(amountCents: number): string {
    return `$${(amountCents / 100).toFixed(2)}`;
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

export class ReferralError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ReferralError';
  }
}

/**
 * Enhanced error handling wrapper
 */
export function withReferralErrorHandling<T extends any[]>(
  apiCall: (...args: T) => Promise<any>
) {
  return async (...args: T) => {
    try {
      return await apiCall(...args);
    } catch (error: any) {
      // Convert to ReferralError with user-friendly messages
      if (error.status === 409) {
        throw new ReferralError('You already have a partner account', 409, 'DUPLICATE_PARTNER');
      } else if (error.status === 403) {
        throw new ReferralError('Action blocked due to suspicious activity. Contact support if this seems wrong.', 403, 'BLOCKED');
      } else if (error.status === 404) {
        throw new ReferralError('Invalid referral code or partner not found', 404, 'NOT_FOUND');
      } else if (error.status >= 500) {
        throw new ReferralError('Server error. Please try again later.', 500, 'SERVER_ERROR');
      } else {
        throw new ReferralError(error.message || 'Something went wrong', error.status, 'UNKNOWN');
      }
    }
  };
}