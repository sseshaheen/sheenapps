/**
 * Admin Multi-Provider Promotions Management Routes
 * 
 * Enhanced promotion management with multi-provider support:
 * - Support for 5 payment providers (Stripe, Fawry, Paymob, STC Pay, PayTabs)
 * - Multi-currency promotion configuration
 * - Regional preferences and localization
 * - Provider compatibility validation
 * - Scenario testing capabilities
 * - Complete audit trail with IP/UA tracking
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdminAuth } from '../middleware/adminAuthentication';
import { correlationIdMiddleware, withCorrelationId, adminErrorResponse } from '../middleware/correlationIdMiddleware';
import { enforceReason } from '../middleware/reasonEnforcement';
import { pool } from '../services/database';
import { 
  validatePromotionRequest,
  validateProviderCompatibility,
  testPromotionScenario,
  getProviderAvailability,
  getRegionalDefaults,
  normalizeCurrency,
  normalizeRegion,
  normalizeProvider,
  PromotionRequest,
  TestScenario,
  CheckoutType,
  RegionCode,
  CurrencyCode,
  PROVIDER_CAPABILITIES,
  PaymentProviderKey // Import this from promotionValidationService
} from '../services/promotionValidationService';
import { randomUUID } from 'crypto';

// =====================================================
// Enhanced Request/Response Types
// =====================================================

interface ValidatePromotionRequest {
  promotion_config: PromotionRequest;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  test_scenarios?: TestScenario[] | undefined;
}

interface ValidatePromotionResponse {
  valid: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  warnings?: string[] | undefined;
  errors?: string[] | undefined;
  scenario_results?: Array<{
    scenario: TestScenario;
    eligible: boolean;
    discount_amount: number;
    final_amount: number;
    selected_provider: PaymentProviderKey | null;
    reason?: string | undefined;
  }> | undefined;
}

interface ProviderAvailabilityResponse {
  providers: Array<{
    key: string;
    name: string;
    supported_currencies: string[];
    supported_regions: string[];
    checkout_types: string[];
    status: 'active' | 'maintenance' | 'disabled';
    features: {
      supports_percentage_discount: boolean;
      supports_fixed_discount: boolean;
      supports_minimum_order: boolean;
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      max_discount_percentage?: number | undefined;
      max_fixed_discount?: { [currency: string]: number } | undefined;
    };
  }>;
  last_updated: string;
  cache_ttl_seconds: number;
}

// =====================================================
// Audit Logging Helper
// =====================================================

async function logPromotionProviderChange(
  client: any,
  promotionId: string,
  changedBy: string,
  changeType: string,
  oldValue: any,
  newValue: any,
  reason: string | undefined,
  ip: string,
  userAgent: string | undefined,
  correlationId: string
): Promise<void> {
  await client.query(
    `SELECT log_promotion_provider_change($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      promotionId,
      changedBy,
      changeType,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      reason,
      ip,
      userAgent,
      correlationId
    ]
  );
}

// =====================================================
// Multi-Provider Admin Routes
// =====================================================

export async function adminPromotionsMultiProviderRoutes(fastify: FastifyInstance) {
  // Apply middleware to all routes
  fastify.addHook('preHandler', correlationIdMiddleware);
  
  /**
   * Validate promotion configuration with multi-provider support
   * POST /admin/promotions/validate
   */
  fastify.post<{
    Body: ValidatePromotionRequest;
  }>('/admin/promotions/validate', {
    preHandler: [requireAdminAuth(), async (req, res) => {
      const user = (req as any).user;
      if (!user.permissions?.includes('promotion:read') && !user.permissions?.includes('promotion:*')) {
        return res.status(403).send(adminErrorResponse(req, 'Insufficient permissions'));
      }
    }]
  }, async (request, reply) => {
    const { promotion_config, test_scenarios } = request.body;
    
    // Normalize inputs at API boundary with validation
    if (promotion_config.currency) {
      const normalized = normalizeCurrency(promotion_config.currency);
      if (!normalized) {
        return reply.status(400).send(adminErrorResponse(request, `Unsupported currency: ${promotion_config.currency}`));
      }
      promotion_config.currency = normalized;
    }
    if (promotion_config.minimum_order_currency) {
      const normalized = normalizeCurrency(promotion_config.minimum_order_currency);
      if (!normalized) {
        return reply.status(400).send(adminErrorResponse(request, `Unsupported minimum order currency: ${promotion_config.minimum_order_currency}`));
      }
      promotion_config.minimum_order_currency = normalized;
    }
    if (promotion_config.regional_configs) {
      for (const rc of promotion_config.regional_configs) {
        const normalizedRegion = normalizeRegion(rc.region_code);
        if (!normalizedRegion) {
          return reply.status(400).send(adminErrorResponse(request, `Unsupported region: ${rc.region_code}`));
        }
        rc.region_code = normalizedRegion as RegionCode;
      }
    }
    
    // Validate the promotion configuration
    const validation = validatePromotionRequest(promotion_config);
    
    // Run test scenarios if provided
    let scenarioResults;
    if (test_scenarios && test_scenarios.length > 0) {
      scenarioResults = test_scenarios.map(scenario => 
        testPromotionScenario(promotion_config, scenario)
      );
    }
    
    const response: ValidatePromotionResponse = {
      valid: validation.valid,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
      errors: validation.errors.length > 0 ? validation.errors : undefined,
      scenario_results: scenarioResults
    };
    
    return reply.send(withCorrelationId(response, request));
  });
  
  /**
   * Get provider availability and capabilities
   * GET /admin/providers/availability
   */
  fastify.get('/admin/providers/availability', {
    preHandler: [requireAdminAuth(), async (req, res) => {
      const user = (req as any).user;
      if (!user.permissions?.includes('promotion:read') && !user.permissions?.includes('promotion:*')) {
        return res.status(403).send(adminErrorResponse(req, 'Insufficient permissions'));
      }
    }]
  }, async (request, reply) => {
    const providers = getProviderAvailability();
    
    const response: ProviderAvailabilityResponse = {
      providers,
      last_updated: new Date().toISOString(),
      cache_ttl_seconds: 300 // 5 minutes
    };
    
    return reply.send(withCorrelationId(response, request));
  });
  
  /**
   * Create promotion with multi-provider support
   * POST /admin/promotions/multi-provider
   */
  fastify.post<{
    Body: PromotionRequest;
    Headers: { 'x-admin-reason'?: string };
  }>('/admin/promotions/multi-provider', {
    preHandler: [
      requireAdminAuth(),
      enforceReason,
      async (req, res) => {
        const user = (req as any).user;
        if (!user.permissions?.includes('promotion:write') && 
            !user.permissions?.includes('promotion:provider_config') &&
            !user.permissions?.includes('promotion:*')) {
          return res.status(403).send(adminErrorResponse(req, 'Insufficient permissions'));
        }
      }
    ]
  }, async (request, reply) => {
    if (!pool) {
      return reply.status(500).send(adminErrorResponse(request, 'Database not configured'));
    }
    
    const adminUser = (request as any).user;
    const reason = request.headers['x-admin-reason'];
    const correlationId = (request as any).correlationId;
    
    // Normalize inputs with validation
    const normalizedBody = { ...request.body };
    if (normalizedBody.currency) {
      const normalized = normalizeCurrency(normalizedBody.currency);
      if (!normalized) {
        return reply.status(400).send(adminErrorResponse(request, `Unsupported currency: ${normalizedBody.currency}`));
      }
      normalizedBody.currency = normalized;
    }
    if (normalizedBody.minimum_order_currency) {
      const normalized = normalizeCurrency(normalizedBody.minimum_order_currency);
      if (!normalized) {
        return reply.status(400).send(adminErrorResponse(request, `Unsupported minimum order currency: ${normalizedBody.minimum_order_currency}`));
      }
      normalizedBody.minimum_order_currency = normalized;
    }
    if (normalizedBody.regional_configs) {
      for (const rc of normalizedBody.regional_configs) {
        const normalizedRegion = normalizeRegion(rc.region_code);
        if (!normalizedRegion) {
          return reply.status(400).send(adminErrorResponse(request, `Unsupported region: ${rc.region_code}`));
        }
        rc.region_code = normalizedRegion as RegionCode;
      }
    }
    
    // Default providers if not specified
    if (!normalizedBody.supported_providers || normalizedBody.supported_providers.length === 0) {
      normalizedBody.supported_providers = ['stripe' as PaymentProviderKey];
    }
    
    // Validate the request
    const validation = validatePromotionRequest(normalizedBody);
    if (!validation.valid) {
      return reply.status(400).send(adminErrorResponse(request, 
        'Invalid promotion configuration', 
        `Validation errors: ${validation.errors.join(', ')}`
      ));
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create the promotion
      const promotionResult = await client.query(
        `INSERT INTO promotions (
          id, name, description, discount_type, discount_value,
          currency, max_total_uses, max_uses_per_user,
          valid_from, valid_until, notes, status,
          supported_providers, checkout_type_restrictions,
          minimum_order_minor_units, minimum_order_currency,
          created_by, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, $10, 'active',
          $11, $12,
          $13, $14,
          $15, NOW()
        ) RETURNING *`,
        [
          normalizedBody.name,
          normalizedBody.description,
          normalizedBody.discount_type,
          normalizedBody.discount_value,
          normalizedBody.currency || null,
          normalizedBody.max_total_uses || null,
          normalizedBody.max_uses_per_user || null,
          normalizedBody.valid_from || null,
          normalizedBody.valid_until || null,
          normalizedBody.notes || null,
          normalizedBody.supported_providers,
          normalizedBody.checkout_type_restrictions || null,
          normalizedBody.minimum_order_amount || null,
          normalizedBody.minimum_order_currency || null,
          adminUser.id
        ]
      );
      
      const promotion = promotionResult.rows[0];
      
      // Create promotion codes
      if (normalizedBody.codes && normalizedBody.codes.length > 0) {
        for (const code of normalizedBody.codes) {
          await client.query(
            `INSERT INTO promotion_codes (
              id, promotion_id, code, max_uses, is_active, created_at
            ) VALUES (
              gen_random_uuid(), $1, $2, NULL, true, NOW()
            )`,
            [promotion.id, code.trim()]
          );
        }
      }
      
      // Create regional configurations if provided
      if (normalizedBody.regional_configs && normalizedBody.regional_configs.length > 0) {
        for (const config of normalizedBody.regional_configs) {
          await client.query(
            `INSERT INTO promotion_regional_config (
              id, promotion_id, region_code, preferred_providers,
              localized_name, localized_description, min_order_amount_override,
              created_at
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW()
            )`,
            [
              promotion.id,
              config.region_code,
              config.preferred_providers || null,
              config.localized_name ? JSON.stringify(config.localized_name) : null,
              config.localized_description ? JSON.stringify(config.localized_description) : null,
              config.min_order_override || null
            ]
          );
        }
      }
      
      // Log the creation
      await logPromotionProviderChange(
        client,
        promotion.id,
        adminUser.id,
        'create',
        null,
        promotion,
        reason,
        request.ip,
        request.headers['user-agent'],
        correlationId
      );
      
      await client.query('COMMIT');
      
      return reply.send(withCorrelationId({
        success: true,
        promotion_id: promotion.id,
        warnings: validation.warnings.length > 0 ? validation.warnings : undefined
      }, request));
      
    } catch (error) {
      await client.query('ROLLBACK');
      fastify.log.error({ err: error }, 'Failed to create multi-provider promotion');
      return reply.status(500).send(adminErrorResponse(request, 'Failed to create promotion'));
    } finally {
      client.release();
    }
  });
  
  /**
   * Update promotion provider configuration
   * PATCH /admin/promotions/:id/providers
   */
  fastify.patch<{
    Params: { id: string };
    Body: {
      supported_providers?: PaymentProviderKey[];
      currency?: string;
      checkout_type_restrictions?: CheckoutType[];
      minimum_order_amount?: number;
      minimum_order_currency?: string;
    };
    Headers: { 'x-admin-reason'?: string };
  }>('/admin/promotions/:id/providers', {
    preHandler: [
      requireAdminAuth(),
      enforceReason,
      async (req, res) => {
        const user = (req as any).user;
        if (!user.permissions?.includes('promotion:provider_config') &&
            !user.permissions?.includes('promotion:*')) {
          return res.status(403).send(adminErrorResponse(req, 'Insufficient permissions'));
        }
      }
    ]
  }, async (request, reply) => {
    if (!pool) {
      return reply.status(500).send(adminErrorResponse(request, 'Database not configured'));
    }
    
    const adminUser = (request as any).user;
    const reason = request.headers['x-admin-reason'];
    const correlationId = (request as any).correlationId;
    const promotionId = request.params.id;
    
    // Normalize inputs with validation
    const updates = { ...request.body };
    if (updates.currency) {
      const normalized = normalizeCurrency(updates.currency);
      if (!normalized) {
        return reply.status(400).send(adminErrorResponse(request, `Unsupported currency: ${updates.currency}`));
      }
      updates.currency = normalized;
    }
    if (updates.minimum_order_currency) {
      const normalized = normalizeCurrency(updates.minimum_order_currency);
      if (!normalized) {
        return reply.status(400).send(adminErrorResponse(request, `Unsupported minimum order currency: ${updates.minimum_order_currency}`));
      }
      updates.minimum_order_currency = normalized;
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current promotion
      const currentResult = await client.query(
        'SELECT * FROM promotions WHERE id = $1',
        [promotionId]
      );
      
      if (currentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(adminErrorResponse(request, 'Promotion not found'));
      }
      
      const currentPromotion = currentResult.rows[0];
      
      // Validate provider compatibility if providers or currency changed
      if (updates.supported_providers || updates.currency) {
        const validation = validateProviderCompatibility(
          updates.supported_providers || currentPromotion.supported_providers,
          updates.currency || currentPromotion.currency,
          updates.checkout_type_restrictions || currentPromotion.checkout_type_restrictions
        );
        
        if (!validation.valid) {
          await client.query('ROLLBACK');
          return reply.status(400).send(adminErrorResponse(request, 
            'Invalid provider configuration',
            `Validation errors: ${validation.errors.join(', ')}`
          ));
        }
      }
      
      // Build update query
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;
      
      if (updates.supported_providers !== undefined) {
        updateFields.push(`supported_providers = $${paramIndex}`);
        updateValues.push(updates.supported_providers);
        paramIndex++;
      }
      
      if (updates.currency !== undefined) {
        updateFields.push(`currency = $${paramIndex}`);
        updateValues.push(updates.currency);
        paramIndex++;
      }
      
      if (updates.checkout_type_restrictions !== undefined) {
        updateFields.push(`checkout_type_restrictions = $${paramIndex}`);
        updateValues.push(updates.checkout_type_restrictions);
        paramIndex++;
      }
      
      if (updates.minimum_order_amount !== undefined) {
        updateFields.push(`minimum_order_minor_units = $${paramIndex}`);
        updateValues.push(updates.minimum_order_amount);
        paramIndex++;
      }
      
      if (updates.minimum_order_currency !== undefined) {
        updateFields.push(`minimum_order_currency = $${paramIndex}`);
        updateValues.push(updates.minimum_order_currency);
        paramIndex++;
      }
      
      // Add updated_at
      updateFields.push(`updated_at = NOW()`);
      
      // Add promotion ID for WHERE clause
      updateValues.push(promotionId);
      
      // Execute update
      const updateResult = await client.query(
        `UPDATE promotions 
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        updateValues
      );
      
      const updatedPromotion = updateResult.rows[0];
      
      // Log the change
      await logPromotionProviderChange(
        client,
        promotionId,
        adminUser.id,
        'update_config',
        currentPromotion,
        updatedPromotion,
        reason,
        request.ip,
        request.headers['user-agent'],
        correlationId
      );
      
      await client.query('COMMIT');
      
      return reply.send(withCorrelationId({
        success: true,
        promotion: updatedPromotion
      }, request));
      
    } catch (error) {
      await client.query('ROLLBACK');
      fastify.log.error({ err: error }, 'Failed to update promotion providers');
      return reply.status(500).send(adminErrorResponse(request, 'Failed to update promotion'));
    } finally {
      client.release();
    }
  });
  
  /**
   * Get promotion provider analytics
   * GET /admin/promotions/:id/provider-analytics
   */
  fastify.get<{
    Params: { id: string };
  }>('/admin/promotions/:id/provider-analytics', {
    preHandler: [requireAdminAuth(), async (req, res) => {
      const user = (req as any).user;
      if (!user.permissions?.includes('promotion:analytics') &&
          !user.permissions?.includes('promotion:*')) {
        return res.status(403).send(adminErrorResponse(req, 'Insufficient permissions'));
      }
    }]
  }, async (request, reply) => {
    if (!pool) {
      return reply.status(500).send(adminErrorResponse(request, 'Database not configured'));
    }
    
    const promotionId = request.params.id;
    
    try {
      // Get analytics from the view
      const result = await pool.query(
        `SELECT * FROM promotion_analytics_dashboard WHERE id = $1`,
        [promotionId]
      );
      
      if (result.rows.length === 0) {
        return reply.status(404).send(adminErrorResponse(request, 'Promotion not found'));
      }
      
      const analytics = result.rows[0];
      
      return reply.send(withCorrelationId({
        promotion_id: analytics.id,
        name: analytics.name,
        status: analytics.effective_status,
        discount_type: analytics.discount_type,
        discount_value: analytics.discount_value,
        currency: analytics.currency,
        supported_providers: analytics.supported_providers,
        metrics: {
          total_redemptions: analytics.total_redemptions,
          unique_users: analytics.unique_users,
          total_discount_given: analytics.total_discount_given,
          utilization_percentage: analytics.utilization_percentage,
          active_reservations: analytics.active_reservations
        },
        provider_breakdown: analytics.provider_usage || {},
        currency_breakdown: analytics.currency_usage || {}
      }, request));
      
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to get provider analytics');
      return reply.status(500).send(adminErrorResponse(request, 'Failed to retrieve analytics'));
    }
  });
  
  /**
   * Get regional defaults for promotion creation
   * GET /admin/promotions/regional-defaults
   */
  fastify.get<{
    Querystring: { region?: string };
  }>('/admin/promotions/regional-defaults', {
    preHandler: [requireAdminAuth(), async (req, res) => {
      const user = (req as any).user;
      if (!user.permissions?.includes('promotion:read') && !user.permissions?.includes('promotion:*')) {
        return res.status(403).send(adminErrorResponse(req, 'Insufficient permissions'));
      }
    }]
  }, async (request, reply) => {
    const region = request.query.region;
    
    try {
      const normalizedRegion = region ? normalizeRegion(region) as RegionCode : undefined;
      const defaults = getRegionalDefaults(normalizedRegion);
      
      return reply.send(withCorrelationId({
        region: normalizedRegion || 'us',
        defaults
      }, request));
      
    } catch (error) {
      // Invalid region
      return reply.status(400).send(adminErrorResponse(request, `Invalid region: ${region}`));
    }
  });
  
  fastify.log.info('Admin multi-provider promotion routes initialized');
}