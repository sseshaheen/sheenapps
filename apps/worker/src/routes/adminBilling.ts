/**
 * Admin Billing Routes
 * 
 * Expert-validated admin API endpoints for customer intelligence, health scoring,
 * and multi-currency revenue analytics. Implements Phase A of billing enhancement plan.
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '../observability/logger';
import { AdminBillingService } from '../services/admin/AdminBillingService';
import { pool } from '../services/database';
import { createClient } from '@supabase/supabase-js';

const logger = createLogger('admin-billing-routes');

// Create Supabase service client for admin operations
const createSupabaseServiceClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
};

const adminBilling: FastifyPluginAsync = async (fastify) => {
  // Initialize admin billing service
  const supabaseServiceClient = createSupabaseServiceClient();
  const adminBillingService = new AdminBillingService(supabaseServiceClient, logger);

  // Add authentication middleware for admin routes
  fastify.addHook('preHandler', async (request, reply) => {
    const adminKey = request.headers['x-admin-key'] as string;
    
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return reply.status(401).send({ 
        error: 'UNAUTHORIZED', 
        message: 'Admin API key required' 
      });
    }
  });

  /**
   * Admin Billing Overview Dashboard
   * GET /admin/billing/overview
   */
  fastify.get('/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const overview = await adminBillingService.getAdminBillingOverview();
      
      return reply.send({
        success: true,
        data: overview,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get admin billing overview');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'OVERVIEW_ERROR' },
        message: 'Failed to get billing overview',
      });
    }
  });

  /**
   * Customer 360 Financial Profile (Phase A1 core feature)
   * GET /admin/billing/customers/:userId/financial-profile
   */
  fastify.get('/customers/:userId/financial-profile', async (
    request: FastifyRequest<{ Params: { userId: string } }>, 
    reply: FastifyReply
  ) => {
    try {
      const { userId } = request.params;
      
      const profile = await adminBillingService.getCustomerFinancialProfile(userId);
      
      if (!profile) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'CUSTOMER_NOT_FOUND' },
          message: 'Customer not found or has no billing data',
        });
      }

      return reply.send({
        success: true,
        data: profile,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ 
        userId: request.params.userId, 
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to get customer financial profile');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'PROFILE_ERROR' },
        message: 'Failed to get customer financial profile',
      });
    }
  });

  /**
   * Multi-Currency Revenue Analytics (Phase A2)
   * GET /admin/billing/analytics/revenue
   */
  fastify.get('/analytics/revenue', async (
    request: FastifyRequest<{
      Querystring: { 
        currency?: string;
        provider?: string;
        month?: string;
      }
    }>, 
    reply: FastifyReply
  ) => {
    try {
      const analytics = await adminBillingService.getRevenueAnalytics();
      
      // Filter by query parameters if provided
      const { currency, provider } = request.query;
      let filteredData = analytics;
      
      if (currency && analytics.by_currency[currency]) {
        filteredData = {
          ...analytics,
          by_currency: { [currency]: analytics.by_currency[currency] },
        };
      }
      
      if (provider && analytics.by_provider[provider]) {
        filteredData = {
          ...filteredData,
          by_provider: { [provider]: analytics.by_provider[provider] },
        };
      }

      return reply.send({
        success: true,
        data: filteredData,
        timestamp: new Date().toISOString(),
        filters: { currency, provider },
      });
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get revenue analytics');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'ANALYTICS_ERROR' },
        message: 'Failed to get revenue analytics',
      });
    }
  });

  /**
   * Currency-specific MRR breakdown
   * GET /admin/billing/analytics/revenue/currency-breakdown
   */
  fastify.get('/analytics/revenue/currency-breakdown', async (
    request: FastifyRequest, 
    reply: FastifyReply
  ) => {
    try {
      const { data: mrrData, error } = await supabaseServiceClient
        .from('mv_mrr_by_currency')
        .select('*')
        .order('mrr_cents', { ascending: false });

      if (error) throw error;

      // Group by currency and calculate totals
      const currencyBreakdown: Record<string, any> = {};
      
      mrrData?.forEach(item => {
        if (!currencyBreakdown[item.currency]) {
          currencyBreakdown[item.currency] = {
            currency: item.currency,
            total_mrr_cents: 0,
            total_subscribers: 0,
            providers: [],
          };
        }
        
        currencyBreakdown[item.currency].total_mrr_cents += item.mrr_cents;
        currencyBreakdown[item.currency].total_subscribers += item.active_subscribers;
        currencyBreakdown[item.currency].providers.push({
          payment_provider: item.payment_provider,
          mrr_cents: item.mrr_cents,
          active_subscribers: item.active_subscribers,
        });
      });

      return reply.send({
        success: true,
        data: Object.values(currencyBreakdown),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get currency breakdown');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'CURRENCY_BREAKDOWN_ERROR' },
        message: 'Failed to get currency breakdown',
      });
    }
  });

  /**
   * At-Risk Customers (Health Score Based)
   * GET /admin/billing/customers/at-risk
   */
  fastify.get('/customers/at-risk', async (
    request: FastifyRequest<{
      Querystring: { 
        limit?: string;
        risk_level?: 'high' | 'medium';
      }
    }>, 
    reply: FastifyReply
  ) => {
    try {
      const limit = Math.min(parseInt(request.query.limit || '50'), 100);
      const atRiskCustomers = await adminBillingService.getCustomersAtRisk(limit);

      // Filter by risk level if specified
      const { risk_level } = request.query;
      const filteredCustomers = risk_level 
        ? atRiskCustomers.filter(c => c.health.risk_level === risk_level)
        : atRiskCustomers;

      return reply.send({
        success: true,
        data: {
          customers: filteredCustomers,
          total_count: filteredCustomers.length,
          risk_distribution: {
            high: atRiskCustomers.filter(c => c.health.risk_level === 'high').length,
            medium: atRiskCustomers.filter(c => c.health.risk_level === 'medium').length,
          },
        },
        timestamp: new Date().toISOString(),
        filters: { limit, risk_level },
      });
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get at-risk customers');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'AT_RISK_ERROR' },
        message: 'Failed to get at-risk customers',
      });
    }
  });

  /**
   * Provider Performance Dashboard
   * GET /admin/billing/providers/performance
   */
  fastify.get('/providers/performance', async (
    request: FastifyRequest<{
      Querystring: { 
        provider?: string;
        currency?: string;
        days?: string;
      }
    }>, 
    reply: FastifyReply
  ) => {
    try {
      const { provider, currency } = request.query;
      const days = Math.min(parseInt(request.query.days || '30'), 90);

      let query = supabaseServiceClient
        .from('mv_provider_performance')
        .select('*');

      if (provider) {
        query = query.eq('payment_provider', provider);
      }

      if (currency) {
        query = query.eq('currency', currency);
      }

      const { data: performanceData, error } = await query
        .order('success_rate_pct', { ascending: false });

      if (error) throw error;

      // Calculate overall metrics
      const totalAttempts = performanceData?.reduce((sum, p) => sum + p.total_attempts, 0) || 0;
      const totalSuccessful = performanceData?.reduce((sum, p) => sum + p.successful_payments, 0) || 0;
      const overallSuccessRate = totalAttempts > 0 ? (totalSuccessful / totalAttempts) * 100 : 0;

      return reply.send({
        success: true,
        data: {
          providers: performanceData,
          overall_metrics: {
            total_attempts: totalAttempts,
            total_successful: totalSuccessful,
            overall_success_rate_pct: Math.round(overallSuccessRate * 100) / 100,
          },
          period_days: days,
        },
        timestamp: new Date().toISOString(),
        filters: { provider, currency, days },
      });
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get provider performance');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'PROVIDER_PERFORMANCE_ERROR' },
        message: 'Failed to get provider performance',
      });
    }
  });

  /**
   * Health Score Distribution
   * GET /admin/billing/health/distribution
   */
  fastify.get('/health/distribution', async (
    request: FastifyRequest, 
    reply: FastifyReply
  ) => {
    try {
      const { data: healthData, error } = await supabaseServiceClient
        .from('billing_customers')
        .select('health_score, risk_level')
        .not('health_score', 'is', null);

      if (error) throw error;

      // Calculate distribution buckets
      const distribution = {
        by_score: {
          healthy: healthData?.filter(c => c.health_score >= 71).length || 0,      // 71-100
          at_risk: healthData?.filter(c => c.health_score >= 41 && c.health_score < 71).length || 0,  // 41-70
          critical: healthData?.filter(c => c.health_score < 41).length || 0,      // 0-40
        },
        by_risk_level: {
          low: healthData?.filter(c => c.risk_level === 'low').length || 0,
          medium: healthData?.filter(c => c.risk_level === 'medium').length || 0,
          high: healthData?.filter(c => c.risk_level === 'high').length || 0,
        },
        average_score: healthData?.length 
          ? Math.round((healthData.reduce((sum, c) => sum + (c.health_score || 0), 0) / healthData.length) * 100) / 100
          : 0,
        total_customers: healthData?.length || 0,
      };

      return reply.send({
        success: true,
        data: distribution,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get health distribution');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'HEALTH_DISTRIBUTION_ERROR' },
        message: 'Failed to get health distribution',
      });
    }
  });

  /**
   * Package Revenue Analytics (separate from MRR)
   * GET /admin/billing/analytics/packages
   */
  fastify.get('/analytics/packages', async (
    request: FastifyRequest<{
      Querystring: { 
        days?: string;
        currency?: string;
        provider?: string;
      }
    }>, 
    reply: FastifyReply
  ) => {
    try {
      const days = Math.min(parseInt(request.query.days || '30'), 365);
      const { currency, provider } = request.query;

      let query = supabaseServiceClient
        .from('mv_package_revenue_daily')
        .select('*')
        .gte('revenue_date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      if (currency) {
        query = query.eq('currency', currency);
      }

      if (provider) {
        query = query.eq('payment_provider', provider);
      }

      const { data: packageData, error } = await query
        .order('revenue_date', { ascending: false });

      if (error) throw error;

      // Calculate totals and trends
      const totalRevenue = packageData?.reduce((sum, p) => sum + p.package_revenue_cents, 0) || 0;
      const totalPurchases = packageData?.reduce((sum, p) => sum + p.package_purchases, 0) || 0;
      const avgPackageValue = totalPurchases > 0 ? totalRevenue / totalPurchases : 0;

      // Group by currency and provider
      const byCurrency: Record<string, any> = {};
      const byProvider: Record<string, any> = {};

      packageData?.forEach(item => {
        // Currency grouping
        if (!byCurrency[item.currency]) {
          byCurrency[item.currency] = {
            revenue_cents: 0,
            purchases: 0,
            unique_customers: 0,
          };
        }
        byCurrency[item.currency].revenue_cents += item.package_revenue_cents;
        byCurrency[item.currency].purchases += item.package_purchases;
        byCurrency[item.currency].unique_customers += item.unique_customers;

        // Provider grouping
        if (!byProvider[item.payment_provider]) {
          byProvider[item.payment_provider] = {
            revenue_cents: 0,
            purchases: 0,
            currencies: new Set(),
          };
        }
        byProvider[item.payment_provider].revenue_cents += item.package_revenue_cents;
        byProvider[item.payment_provider].purchases += item.package_purchases;
        byProvider[item.payment_provider].currencies.add(item.currency);
      });

      // Convert currency sets to arrays
      Object.keys(byProvider).forEach(key => {
        byProvider[key].currencies = Array.from(byProvider[key].currencies);
      });

      return reply.send({
        success: true,
        data: {
          summary: {
            total_revenue_cents: totalRevenue,
            total_purchases: totalPurchases,
            avg_package_value_cents: Math.round(avgPackageValue),
            period_days: days,
          },
          by_currency: byCurrency,
          by_provider: byProvider,
          daily_data: packageData,
        },
        timestamp: new Date().toISOString(),
        filters: { days, currency, provider },
      });
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to get package analytics');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'PACKAGE_ANALYTICS_ERROR' },
        message: 'Failed to get package analytics',
      });
    }
  });

  /**
   * Refresh Materialized Views (Admin Maintenance)
   * POST /admin/billing/maintenance/refresh-views
   */
  fastify.post('/maintenance/refresh-views', async (
    request: FastifyRequest, 
    reply: FastifyReply
  ) => {
    try {
      const startTime = Date.now();
      
      // Refresh all materialized views used in admin billing
      const views = [
        'mv_customer_financial_summary',
        'mv_mrr_by_currency',
        'mv_mrr_usd_normalized',
        'mv_package_revenue_daily',
        'mv_monthly_revenue_history',
        'mv_provider_performance',
        'mv_customer_ltv_summary',
      ];

      const refreshResults = [];
      
      for (const view of views) {
        try {
          const viewStartTime = Date.now();
          
          // Use concurrent refresh where possible (requires unique indexes)
          const refreshQuery = `REFRESH MATERIALIZED VIEW ${view}`;
          
          await supabaseServiceClient.rpc('exec_sql', { sql: refreshQuery });
          
          const viewDuration = Date.now() - viewStartTime;
          refreshResults.push({
            view,
            status: 'success',
            duration_ms: viewDuration,
          });
          
          logger.info({ view, duration_ms: viewDuration }, `Refreshed materialized view: ${view}`);
        } catch (error) {
          refreshResults.push({
            view,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
          
          logger.error({ view, error: error instanceof Error ? error.message : String(error) }, `Failed to refresh materialized view: ${view}`);
        }
      }

      const totalDuration = Date.now() - startTime;
      const successCount = refreshResults.filter(r => r.status === 'success').length;

      return reply.send({
        success: true,
        data: {
          total_views: views.length,
          successful_refreshes: successCount,
          failed_refreshes: views.length - successCount,
          total_duration_ms: totalDuration,
          results: refreshResults,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to refresh materialized views');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'REFRESH_ERROR' },
        message: 'Failed to refresh materialized views',
      });
    }
  });
};

export default adminBilling;