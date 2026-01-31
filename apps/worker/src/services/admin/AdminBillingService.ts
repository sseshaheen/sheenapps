/**
 * Admin Billing Service
 * 
 * Expert-validated service for Customer 360, health scoring, and revenue analytics.
 * Implements transparent health scoring formula and multi-currency revenue tracking.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface HealthScoreBreakdown {
  score: number; // 0-100 total
  factors: {
    usage_trend: number;    // 35% weight (30d vs 60d usage)
    payment_risk: number;   // 25% weight (failures in 90d)
    minutes_runway: number; // 20% weight (paid seconds / 7-day avg use)
    last_activity: number;  // 10% weight (recency)
    support_friction: number; // 10% weight (tickets in 30d)
  };
}

export interface CustomerFinancialProfile {
  customer: {
    customer_id: string;
    stripe_customer_id: string | null;
    email: string;
    created_at: string;
    customer_since: string;
    region?: string;
  };
  subscription: {
    subscription_id: string | null;
    plan_name: string | null;
    subscription_status: string | null;
    amount_cents: number;
    currency: string | null;
    payment_provider: string | null;
    next_billing_date: string | null;
  };
  balance: {
    remaining_time_seconds: number;
    total_time_consumed: number;
    minutes_runway_days: number;
  };
  payments: {
    total_payments: number;
    successful_payments: number;
    failed_payments: number;
    last_payment_attempt: string | null;
    total_paid_cents: number;
  };
  health: {
    health_score: number;
    risk_level: 'low' | 'medium' | 'high';
    breakdown: HealthScoreBreakdown;
    risk_flags: string[];
  };
  activity: {
    last_activity: string | null;
    is_inactive: boolean;
  };
}

export interface RevenueAnalytics {
  mrr_current_usd_cents: number;
  arr_current_usd_cents: number;
  growth_mom: number;
  by_currency: Record<string, {
    mrr_cents: number;
    active_subscribers: number;
    providers: Record<string, { mrr_cents: number; subscribers: number; }>;
  }>;
  by_provider: Record<string, {
    mrr_usd_cents: number;
    currencies: string[];
    success_rate_pct: number;
  }>;
  exchange_rates_used: Record<string, number>;
}

export interface AdminBillingOverview {
  revenue: {
    mrr_current_usd_cents: number;
    arr_current_usd_cents: number;
    growth_mom: number;
    churn_rate: number;
  };
  customers: {
    total_paying: number;
    new_this_month: number;
    churned_this_month: number;
    at_risk_count: number;
  };
  health: {
    avg_health_score: number;
    payment_failures_30d: number;
    low_balance_customers: number;
  };
  providers: {
    total_active: number;
    avg_success_rate: number;
    top_error_category: string | null;
  };
}

export class AdminBillingService {
  constructor(
    private supabase: SupabaseClient,
    private logger: any // Using pino logger interface
  ) {}

  /**
   * Get comprehensive customer financial profile (Phase A1 core feature)
   */
  async getCustomerFinancialProfile(userId: string): Promise<CustomerFinancialProfile | null> {
    try {
      const { data, error } = await this.supabase
        .from('mv_customer_financial_summary')
        .select('*')
        .eq('customer_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Customer not found
          return null;
        }
        throw error;
      }

      // Calculate health score breakdown if not already cached
      let healthBreakdown: HealthScoreBreakdown;
      if (data.health_factors && Object.keys(data.health_factors).length > 0) {
        healthBreakdown = data.health_factors as HealthScoreBreakdown;
      } else {
        healthBreakdown = await this.calculateHealthScore(userId, data);
        
        // Update cached health score
        await this.updateCustomerHealthScore(userId, healthBreakdown);
      }

      // Calculate minutes runway in days
      const avgDailyUsage = await this.getAverageUsagePerDay(userId, 7);
      const minutesRunwayDays = avgDailyUsage > 0 
        ? Math.floor(data.remaining_time_seconds / (avgDailyUsage * 60))
        : 999; // Unlimited if no usage pattern

      // Compile risk flags
      const riskFlags: string[] = [];
      if (data.has_payment_risk) riskFlags.push('payment_failure');
      if (data.low_balance_risk) riskFlags.push('low_balance');
      if (data.inactive_risk) riskFlags.push('inactive_user');

      return {
        customer: {
          customer_id: data.customer_id,
          stripe_customer_id: data.stripe_customer_id,
          email: data.email,
          created_at: data.customer_since,
          customer_since: data.customer_since,
        },
        subscription: {
          subscription_id: data.subscription_id,
          plan_name: data.plan_name,
          subscription_status: data.subscription_status,
          amount_cents: data.subscription_amount_cents || 0,
          currency: data.currency,
          payment_provider: data.payment_provider,
          next_billing_date: data.next_billing_date,
        },
        balance: {
          remaining_time_seconds: data.remaining_time_seconds,
          total_time_consumed: data.total_time_consumed,
          minutes_runway_days: minutesRunwayDays,
        },
        payments: {
          total_payments: data.total_payments,
          successful_payments: data.successful_payments,
          failed_payments: data.failed_payments,
          last_payment_attempt: data.last_payment_attempt,
          total_paid_cents: data.total_paid_cents,
        },
        health: {
          health_score: healthBreakdown.score,
          risk_level: this.getRiskLevel(healthBreakdown.score),
          breakdown: healthBreakdown,
          risk_flags: riskFlags,
        },
        activity: {
          last_activity: data.last_activity,
          is_inactive: data.inactive_risk,
        },
      };

    } catch (error) {
      this.logger.error({ 
        userId, 
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to get customer financial profile');
      throw error;
    }
  }

  /**
   * Expert-validated transparent health score calculation (0-100)
   * Formula matches METRICS_CONTRACT.md specification
   */
  private async calculateHealthScore(userId: string, customerData: any): Promise<HealthScoreBreakdown> {
    try {
      // Factor 1: Usage Trend (35% weight) - 30d vs 60d consumption
      const usageTrend = await this.calculateUsageTrendScore(userId);

      // Factor 2: Payment Risk (25% weight) - Failed payments in 90d
      const paymentRisk = this.calculatePaymentRiskScore(customerData);

      // Factor 3: Minutes Runway (20% weight) - Available time vs consumption rate
      const minutesRunway = await this.calculateMinutesRunwayScore(userId, customerData);

      // Factor 4: Last Activity (10% weight) - Days since last login
      const lastActivity = this.calculateLastActivityScore(customerData.last_activity);

      // Factor 5: Support Friction (10% weight) - Support tickets in 30d
      const supportFriction = await this.calculateSupportFrictionScore(userId);

      const breakdown: HealthScoreBreakdown = {
        score: usageTrend + paymentRisk + minutesRunway + lastActivity + supportFriction,
        factors: {
          usage_trend: usageTrend,
          payment_risk: paymentRisk,
          minutes_runway: minutesRunway,
          last_activity: lastActivity,
          support_friction: supportFriction,
        },
      };

      return breakdown;

    } catch (error) {
      this.logger.error({ userId, error: error instanceof Error ? error.message : String(error) }, 'Failed to calculate health score');
      
      // Return conservative default score
      return {
        score: 50,
        factors: {
          usage_trend: 17.5,
          payment_risk: 12.5,
          minutes_runway: 10,
          last_activity: 5,
          support_friction: 5,
        },
      };
    }
  }

  /**
   * Usage trend scoring: 35% weight (30-day vs 60-day AI consumption)
   */
  private async calculateUsageTrendScore(userId: string): Promise<number> {
    const { data: recentUsage, error: recentError } = await this.supabase
      .from('ai_time_ledger')
      .select('time_seconds_consumed')
      .eq('customer_id', userId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const { data: olderUsage, error: olderError } = await this.supabase
      .from('ai_time_ledger')
      .select('time_seconds_consumed')
      .eq('customer_id', userId)
      .gte('created_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
      .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (recentError || olderError) {
      return 17.5; // Neutral score if data unavailable
    }

    const recent30d = recentUsage?.reduce((sum, record) => sum + (record.time_seconds_consumed || 0), 0) || 0;
    const older30d = olderUsage?.reduce((sum, record) => sum + (record.time_seconds_consumed || 0), 0) || 0;

    if (older30d === 0) {
      return recent30d > 0 ? 35 : 17.5; // New user with usage gets full points
    }

    const changeRatio = recent30d / older30d;

    if (changeRatio >= 1.0) return 35;      // Usage increasing or stable
    if (changeRatio >= 0.75) return 20;    // Slight decline (10-25%)
    if (changeRatio >= 0.50) return 10;    // Moderate decline (25-50%)
    return 0;                               // Severe decline (>50%)
  }

  /**
   * Payment risk scoring: 25% weight (failed payments in 90 days)
   */
  private calculatePaymentRiskScore(customerData: any): number {
    const failedPayments = customerData.failed_payments || 0;

    if (failedPayments === 0) return 25;     // No payment failures
    if (failedPayments === 1) return 15;     // 1 failure, might be resolved
    if (failedPayments <= 3) return 5;      // 2-3 failures
    return 0;                               // 4+ failures or current failure
  }

  /**
   * Minutes runway scoring: 20% weight (available time vs consumption rate)
   */
  private async calculateMinutesRunwayScore(userId: string, customerData: any): Promise<number> {
    const remainingSeconds = customerData.remaining_time_seconds || 0;
    const avgDailyUsage = await this.getAverageUsagePerDay(userId, 7);

    if (avgDailyUsage <= 0) return 20; // No usage pattern, assume healthy

    const runwayDays = Math.floor(remainingSeconds / (avgDailyUsage * 60));

    if (runwayDays >= 30) return 20;    // >30 days runway
    if (runwayDays >= 14) return 15;    // 14-30 days runway
    if (runwayDays >= 7) return 10;     // 7-14 days runway
    return 0;                           // <7 days runway
  }

  /**
   * Last activity scoring: 10% weight (days since last login)
   */
  private calculateLastActivityScore(lastActivity: string | null): number {
    if (!lastActivity) return 0;

    const daysSinceActivity = Math.floor(
      (Date.now() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000)
    );

    if (daysSinceActivity <= 7) return 10;   // Active within 7 days
    if (daysSinceActivity <= 14) return 7;   // Active within 14 days
    if (daysSinceActivity <= 30) return 3;   // Active within 30 days
    return 0;                                // Inactive >30 days
  }

  /**
   * Support friction scoring: 10% weight (tickets in 30 days)
   */
  private async calculateSupportFrictionScore(userId: string): Promise<number> {
    // Note: Assuming support_tickets table exists, adjust query if different
    try {
      const { data, error } = await this.supabase
        .from('support_tickets')
        .select('id, status')
        .eq('customer_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        // If support_tickets table doesn't exist, return neutral score
        return 7;
      }

      const ticketCount = data?.length || 0;
      const unresolvedCount = data?.filter(t => t.status !== 'resolved').length || 0;

      if (ticketCount === 0) return 10;                      // 0 tickets
      if (ticketCount === 1 && unresolvedCount === 0) return 7; // 1 resolved ticket
      if (ticketCount <= 3) return 3;                        // 2-3 tickets
      return 0;                                               // 4+ tickets or unresolved
    } catch (error) {
      // Support system not implemented yet, return neutral score
      return 7;
    }
  }

  /**
   * Get average daily usage for runway calculations
   */
  private async getAverageUsagePerDay(userId: string, days: number): Promise<number> {
    const { data, error } = await this.supabase
      .from('ai_time_ledger')
      .select('time_seconds_consumed')
      .eq('customer_id', userId)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    if (error || !data) return 0;

    const totalUsage = data.reduce((sum, record) => sum + (record.time_seconds_consumed || 0), 0);
    return totalUsage / days; // Average seconds per day
  }

  /**
   * Determine risk level from health score
   */
  private getRiskLevel(score: number): 'low' | 'medium' | 'high' {
    if (score >= 71) return 'low';      // 71-100: healthy customer
    if (score >= 41) return 'medium';   // 41-70: monitor closely
    return 'high';                      // 0-40: immediate intervention needed
  }

  /**
   * Update customer health score in database
   */
  private async updateCustomerHealthScore(userId: string, breakdown: HealthScoreBreakdown): Promise<void> {
    const { error } = await this.supabase
      .from('billing_customers')
      .update({
        health_score: breakdown.score,
        risk_level: this.getRiskLevel(breakdown.score),
        health_factors: breakdown,
        last_health_update: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      this.logger.error({ 
        userId, 
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to update customer health score');
    }
  }

  /**
   * Get revenue analytics with multi-currency and provider breakdown
   */
  async getRevenueAnalytics(): Promise<RevenueAnalytics> {
    try {
      // Get current MRR data
      const { data: mrrData, error: mrrError } = await this.supabase
        .from('mv_mrr_usd_normalized')
        .select('*')
        .single();

      if (mrrError) throw mrrError;

      // Get currency breakdown
      const { data: currencyData, error: currencyError } = await this.supabase
        .from('mv_mrr_by_currency')
        .select('*');

      if (currencyError) throw currencyError;

      // Get provider performance
      const { data: providerData, error: providerError } = await this.supabase
        .from('mv_provider_performance')
        .select('*');

      if (providerError) throw providerError;

      // Get exchange rates
      const { data: ratesData, error: ratesError } = await this.supabase
        .from('exchange_rates')
        .select('from_currency, rate')
        .eq('to_currency', 'USD')
        .order('effective_date', { ascending: false });

      if (ratesError) throw ratesError;

      // Calculate month-over-month growth (simplified)
      const currentMRR = mrrData.total_mrr_usd_cents || 0;
      // TODO: Implement proper MoM calculation with historical data
      const growthMoM = 0; // Placeholder

      // Build currency breakdown
      const byCurrency: Record<string, any> = {};
      currencyData?.forEach(item => {
        if (!byCurrency[item.currency]) {
          byCurrency[item.currency] = {
            mrr_cents: 0,
            active_subscribers: 0,
            providers: {},
          };
        }
        byCurrency[item.currency].mrr_cents += item.mrr_cents;
        byCurrency[item.currency].active_subscribers += item.active_subscribers;
        byCurrency[item.currency].providers[item.payment_provider] = {
          mrr_cents: item.mrr_cents,
          subscribers: item.active_subscribers,
        };
      });

      // Build provider breakdown
      const byProvider: Record<string, any> = {};
      providerData?.forEach(item => {
        if (!byProvider[item.payment_provider]) {
          byProvider[item.payment_provider] = {
            mrr_usd_cents: 0,
            currencies: [],
            success_rate_pct: 0,
          };
        }
        byProvider[item.payment_provider].currencies.push(item.currency);
        byProvider[item.payment_provider].success_rate_pct = item.success_rate_pct;
      });

      // Build exchange rates map
      const exchangeRatesUsed: Record<string, number> = {};
      ratesData?.forEach(rate => {
        exchangeRatesUsed[rate.from_currency] = rate.rate;
      });

      return {
        mrr_current_usd_cents: currentMRR,
        arr_current_usd_cents: currentMRR * 12,
        growth_mom: growthMoM,
        by_currency: byCurrency,
        by_provider: byProvider,
        exchange_rates_used: exchangeRatesUsed,
      };

    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get revenue analytics');
      throw error;
    }
  }

  /**
   * Get admin billing overview dashboard
   */
  async getAdminBillingOverview(): Promise<AdminBillingOverview> {
    try {
      const revenueData = await this.getRevenueAnalytics();

      // Get at-risk customers count
      const { data: atRiskData, error: atRiskError } = await this.supabase
        .from('billing_customers')
        .select('id')
        .eq('risk_level', 'high');

      // Get recent payment failures
      const { data: failuresData, error: failuresError } = await this.supabase
        .from('billing_payments')
        .select('id')
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      // Get low balance customers
      const { data: lowBalanceData, error: lowBalanceError } = await this.supabase
        .from('mv_customer_financial_summary')
        .select('customer_id')
        .eq('low_balance_risk', true);

      // Calculate provider metrics
      const providerCount = Object.keys(revenueData.by_provider).length;
      const avgSuccessRate = Object.values(revenueData.by_provider)
        .reduce((sum: number, provider: any) => sum + (provider.success_rate_pct || 0), 0) / providerCount;

      return {
        revenue: {
          mrr_current_usd_cents: revenueData.mrr_current_usd_cents,
          arr_current_usd_cents: revenueData.arr_current_usd_cents,
          growth_mom: revenueData.growth_mom,
          churn_rate: 0, // TODO: Calculate from mv_monthly_revenue_history
        },
        customers: {
          total_paying: Object.values(revenueData.by_currency)
            .reduce((sum: number, currency: any) => sum + currency.active_subscribers, 0),
          new_this_month: 0, // TODO: Calculate from subscription creation dates
          churned_this_month: 0, // TODO: Calculate from subscription cancellations
          at_risk_count: atRiskData?.length || 0,
        },
        health: {
          avg_health_score: 0, // TODO: Calculate average from billing_customers
          payment_failures_30d: failuresData?.length || 0,
          low_balance_customers: lowBalanceData?.length || 0,
        },
        providers: {
          total_active: providerCount,
          avg_success_rate: Math.round(avgSuccessRate * 100) / 100,
          top_error_category: null, // TODO: Calculate from mv_provider_performance
        },
      };

    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get admin billing overview');
      throw error;
    }
  }

  /**
   * Get customers at risk (health score based)
   */
  async getCustomersAtRisk(limit: number = 50): Promise<CustomerFinancialProfile[]> {
    try {
      const { data: atRiskCustomers, error } = await this.supabase
        .from('billing_customers')
        .select('id')
        .in('risk_level', ['high', 'medium'])
        .order('health_score', { ascending: true })
        .limit(limit);

      if (error) throw error;

      const profiles: CustomerFinancialProfile[] = [];
      
      for (const customer of atRiskCustomers || []) {
        const profile = await this.getCustomerFinancialProfile(customer.id);
        if (profile) {
          profiles.push(profile);
        }
      }

      return profiles;

    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get customers at risk');
      throw error;
    }
  }
}