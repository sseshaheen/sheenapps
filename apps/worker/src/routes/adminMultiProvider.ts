/**
 * Admin Multi-Provider Dashboard Routes
 * 
 * Expert-validated admin interface for multi-provider payment monitoring.
 * 
 * Features:
 * - Per-provider metrics tiles with SLO thresholds
 * - Circuit breaker toggles with graceful degradation
 * - Mapping completeness warnings (no gaps for live regions)
 * - Capability mismatch guardrails
 * - Provider health monitoring and recovery controls
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { regionalPaymentFactory, paymentProviderRegistry } from '../services/payment/RegionalPaymentFactory';
import { webhookProcessor } from '../services/payment/WebhookProcessor';
import { PaymentProviderKey } from '../services/payment/enhancedTypes';
import { pool } from '../services/database';

const adminMultiProvider: FastifyPluginAsync = async (fastify) => {
  
  // Authentication middleware for admin routes
  fastify.addHook('preHandler', async (request, reply) => {
    const adminKey = request.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return reply.status(401).send({ 
        error: 'UNAUTHORIZED', 
        message: 'Admin API key required' 
      });
    }
  });

  // Get comprehensive provider dashboard data
  fastify.get('/admin/providers/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get provider health status
      const healthStatus = regionalPaymentFactory.getProviderHealthStatus();
      
      // Get webhook processing stats
      const webhookStats = await webhookProcessor.getWebhookStats();
      
      // Get price mapping coverage
      const mappingCoverage = await getMappingCoverage();
      
      // Get regional availability
      const regionalAvailability = getRegionalAvailability();
      
      // Calculate SLO compliance
      const sloCompliance = calculateSLOCompliance(healthStatus, webhookStats);
      
      return reply.send({
        success: true,
        data: {
          provider_health: healthStatus,
          webhook_stats: webhookStats,
          mapping_coverage: mappingCoverage,
          regional_availability: regionalAvailability,
          slo_compliance: sloCompliance
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error({ err: error }, 'Dashboard data fetch failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'DASHBOARD_ERROR' },
        message: errorMessage
      });
    }
  });

  // Get specific provider metrics
  fastify.get('/admin/providers/:provider/metrics', async (request: FastifyRequest<{
    Params: { provider: PaymentProviderKey }
  }>, reply: FastifyReply) => {
    try {
      const { provider } = request.params;
      
      // Validate provider
      const validProviders: PaymentProviderKey[] = ['stripe', 'fawry', 'paymob', 'stcpay', 'paytabs'];
      if (!validProviders.includes(provider)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'INVALID_PROVIDER' },
          message: `Invalid provider: ${provider}`
        });
      }
      
      // Get detailed metrics for this provider
      const healthStatus = regionalPaymentFactory.getProviderHealthStatus()
        .find(status => status.provider === provider);
      
      const webhookStats = await webhookProcessor.getWebhookStats(provider);
      const mappingStats = await getProviderMappingStats(provider);
      const transactionStats = await getProviderTransactionStats(provider);
      
      return reply.send({
        success: true,
        provider,
        data: {
          health: healthStatus,
          webhooks: webhookStats[0] || { total_events: 0, processed_events: 0, failed_events: 0 },
          mappings: mappingStats,
          transactions: transactionStats
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error({ err: error }, 'Provider metrics fetch failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'METRICS_ERROR' },
        message: errorMessage
      });
    }
  });

  // Circuit breaker controls
  fastify.post('/admin/providers/:provider/circuit-breaker/:action', async (request: FastifyRequest<{
    Params: { provider: PaymentProviderKey; action: 'trip' | 'recover' }
  }>, reply: FastifyReply) => {
    try {
      const { provider, action } = request.params;
      
      const validProviders: PaymentProviderKey[] = ['stripe', 'fawry', 'paymob', 'stcpay', 'paytabs'];
      if (!validProviders.includes(provider)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'INVALID_PROVIDER' },
          message: `Invalid provider: ${provider}`
        });
      }
      
      if (action === 'recover') {
        // Force provider recovery
        regionalPaymentFactory.forceProviderRecovery(provider);
        
        fastify.log.info(`Admin forced recovery for provider ${provider}`);
        
        return reply.send({
          success: true,
          message: `Circuit breaker recovered for ${provider}`,
          provider,
          action: 'recovered',
          timestamp: new Date().toISOString()
        });
        
      } else if (action === 'trip') {
        // Manually trip circuit breaker (record multiple failures)
        for (let i = 0; i < 10; i++) {
          regionalPaymentFactory.recordPaymentOutcome(provider, false);
        }
        
        fastify.log.warn(`Admin tripped circuit breaker for provider ${provider}`);
        
        return reply.send({
          success: true,
          message: `Circuit breaker tripped for ${provider}`,
          provider,
          action: 'tripped',
          timestamp: new Date().toISOString()
        });
      }
      
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'INVALID_ACTION' },
        message: 'Action must be "trip" or "recover"'
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error({ err: error }, 'Circuit breaker action failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'CIRCUIT_BREAKER_ERROR' },
        message: errorMessage
      });
    }
  });

  // Validate mapping completeness for regions
  fastify.get('/admin/providers/validate-mappings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationResults = await validateMappingCompleteness();
      
      return reply.send({
        success: true,
        data: validationResults,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error({ err: error }, 'Mapping validation failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'VALIDATION_ERROR' },
        message: errorMessage
      });
    }
  });

  // Replay webhook events (admin action)
  fastify.post('/admin/webhooks/:provider/:eventId/replay', async (request: FastifyRequest<{
    Params: { provider: PaymentProviderKey; eventId: string }
  }>, reply: FastifyReply) => {
    try {
      const { provider, eventId } = request.params;
      
      const success = await webhookProcessor.replayWebhookEvent(provider, eventId);
      
      return reply.send({
        success,
        message: success ? 'Event replayed successfully' : 'Event replay failed',
        eventId,
        provider,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error({ err: error }, 'Webhook replay failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'REPLAY_ERROR' },
        message: errorMessage
      });
    }
  });

};

// Helper functions

async function getMappingCoverage() {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        pi.item_key,
        pi.item_type,
        COUNT(pip.id) as provider_count,
        array_agg(DISTINCT pip.payment_provider) as available_providers,
        array_agg(DISTINCT pip.currency) as available_currencies
      FROM pricing_items pi
      LEFT JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id AND pip.is_active = true
      WHERE pi.catalog_version_id = (SELECT id FROM pricing_catalog_versions WHERE is_active = true LIMIT 1)
        AND pi.is_active = true
      GROUP BY pi.item_key, pi.item_type
      ORDER BY pi.item_key
    `);
    
    return result.rows;
  } finally {
    client.release();
  }
}

function getRegionalAvailability() {
  const regions = ['eg', 'sa', 'us', 'ca', 'gb', 'eu'];
  const currencies = ['EGP', 'SAR', 'USD', 'EUR', 'GBP'];
  
  const availability = regions.map(region => {
    const subscriptionProviders = regionalPaymentFactory.getHealthyProvidersForRegion(region, 'USD');
    const packageProviders = regionalPaymentFactory.getHealthyProvidersForRegion(region, 'USD');
    
    return {
      region,
      subscription_providers: subscriptionProviders,
      package_providers: packageProviders,
      recommended_currencies: regionalPaymentFactory.getRecommendedCurrencies(region),
      is_supported: subscriptionProviders.length > 0 || packageProviders.length > 0
    };
  });
  
  return availability;
}

function calculateSLOCompliance(healthStatus: any[], webhookStats: any[]) {
  return healthStatus.map(status => {
    const webhookStat = webhookStats.find(ws => ws.payment_provider === status.provider);
    const webhookSuccessRate = webhookStat ? parseFloat(webhookStat.success_rate) : 1.0;
    
    return {
      provider: status.provider,
      payment_success_rate: status.successRate,
      webhook_success_rate: webhookSuccessRate,
      is_healthy: status.isHealthy,
      slo_compliance: {
        payment_slo_met: status.successRate >= 0.95, // 95% threshold
        webhook_slo_met: webhookSuccessRate >= 0.99,  // 99% threshold
        overall_compliant: status.isHealthy && status.successRate >= 0.95 && webhookSuccessRate >= 0.99
      }
    };
  });
}

async function getProviderMappingStats(provider: PaymentProviderKey) {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        pip.currency,
        COUNT(*) as total_mappings,
        SUM(CASE WHEN pip.supports_recurring THEN 1 ELSE 0 END) as subscription_mappings,
        SUM(CASE WHEN NOT pip.supports_recurring THEN 1 ELSE 0 END) as package_mappings,
        array_agg(pi.item_key) as mapped_items
      FROM pricing_item_prices pip
      JOIN pricing_items pi ON pi.id = pip.pricing_item_id
      WHERE pip.payment_provider = $1::payment_provider_key AND pip.is_active = true
      GROUP BY pip.currency
      ORDER BY pip.currency
    `, [provider]);
    
    return result.rows;
  } finally {
    client.release();
  }
}

async function getProviderTransactionStats(provider: PaymentProviderKey) {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  const client = await pool.connect();
  try {
    // Get transaction stats for last 30 days
    const result = await client.query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status = 'succeeded'::payment_status THEN 1 ELSE 0 END) as successful_transactions,
        SUM(CASE WHEN status = 'failed'::payment_status THEN 1 ELSE 0 END) as failed_transactions,
        SUM(amount_cents) as total_volume_cents,
        AVG(amount_cents) as avg_transaction_cents,
        array_agg(DISTINCT currency) as currencies_processed
      FROM billing_payments
      WHERE payment_provider = $1::payment_provider_key
        AND created_at >= NOW() - INTERVAL '30 days'
    `, [provider]);
    
    return result.rows[0] || {
      total_transactions: 0,
      successful_transactions: 0,
      failed_transactions: 0,
      total_volume_cents: 0,
      avg_transaction_cents: 0,
      currencies_processed: []
    };
  } finally {
    client.release();
  }
}

async function validateMappingCompleteness() {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  const client = await pool.connect();
  try {
    // Find items without provider mappings
    const missingMappings = await client.query(`
      SELECT 
        pi.item_key,
        pi.item_type,
        pi.currency as base_currency,
        COALESCE(array_agg(pip.payment_provider) FILTER (WHERE pip.id IS NOT NULL), '{}') as available_providers
      FROM pricing_items pi
      LEFT JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id AND pip.is_active = true
      WHERE pi.catalog_version_id = (SELECT id FROM pricing_catalog_versions WHERE is_active = true LIMIT 1)
        AND pi.is_active = true
      GROUP BY pi.item_key, pi.item_type, pi.currency
      HAVING COUNT(pip.id) = 0
      ORDER BY pi.item_key
    `);
    
    // Find capability mismatches
    const capabilityMismatches = await client.query(`
      SELECT 
        pi.item_key,
        pi.item_type,
        pip.payment_provider,
        pip.supports_recurring,
        pip.currency
      FROM pricing_items pi
      JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id
      WHERE pi.catalog_version_id = (SELECT id FROM pricing_catalog_versions WHERE is_active = true LIMIT 1)
        AND pi.is_active = true
        AND pip.is_active = true
        AND (
          -- Subscription items mapped to providers that don't support recurring
          (pi.item_type = 'subscription' AND pip.supports_recurring = false)
          OR 
          -- Package items incorrectly marked as recurring
          (pi.item_type = 'package' AND pip.supports_recurring = true)
        )
      ORDER BY pi.item_key, pip.payment_provider
    `);
    
    return {
      missing_mappings: missingMappings.rows,
      capability_mismatches: capabilityMismatches.rows,
      validation_passed: missingMappings.rows.length === 0 && capabilityMismatches.rows.length === 0
    };
  } finally {
    client.release();
  }
}

export default adminMultiProvider;