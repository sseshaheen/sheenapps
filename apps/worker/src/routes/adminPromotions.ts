/**
 * Admin Promotions Management Routes
 * 
 * Provides comprehensive promotion management functionality:
 * - JWT-based authentication with promotion permissions
 * - Create, update, and manage promotion campaigns  
 * - Generate and manage promotion codes
 * - Analytics and usage reporting
 * - Comprehensive audit logging with correlation tracking
 * - Idempotent operations with conflict resolution
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdminAuth } from '../middleware/adminAuthentication';
import { correlationIdMiddleware, withCorrelationId, adminErrorResponse } from '../middleware/correlationIdMiddleware';
import { enforceReason } from '../middleware/reasonEnforcement';
import { pool } from '../services/database';
import { promoCore } from '../services/promotion/PromoCore';
import { stripeAdapter } from '../services/promotion/StripeAdapter';

// =====================================================
// Request/Response Types
// =====================================================

interface CreatePromotionRequest {
  name: string;
  description?: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  max_total_uses?: number;
  max_uses_per_user?: number;
  valid_from?: string;
  valid_until?: string;
  notes?: string;
  codes: string[]; // Initial codes to create
}

interface UpdatePromotionRequest {
  name?: string;
  description?: string;
  max_total_uses?: number;
  max_uses_per_user?: number;
  valid_until?: string;
  status?: 'active' | 'paused' | 'expired' | 'disabled';
  notes?: string;
}

interface CreatePromotionCodeRequest {
  codes: string[];
  max_uses?: number;
}

interface PromotionAnalyticsResponse {
  promotion_id: string;
  name: string;
  total_redemptions: number;
  total_discount_given: number;
  unique_users: number;
  conversion_rate: number;
  avg_discount_per_use: number;
  last_used: string | null;
}

interface ValidatePromotionConfig {
  name: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  currency?: 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR' | 'CAD';
  minimum_order_amount?: number;
  minimum_order_currency?: 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR' | 'CAD';
  supported_providers?: Array<'stripe' | 'fawry' | 'paymob' | 'stcpay' | 'paytabs'>;
  regional_configs?: any[];
}

interface ValidatePromotionScenario {
  region: 'us' | 'eu' | 'gb' | 'ca' | 'eg' | 'sa';
  currency: 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR' | 'CAD';
  order_amount: number;
  provider: 'stripe' | 'fawry' | 'paymob' | 'stcpay' | 'paytabs';
}

interface ValidatePromotionRequest {
  promotion_config: ValidatePromotionConfig;
  test_scenarios: ValidatePromotionScenario[];
}

interface ValidatePromotionResponse {
  success: boolean;
  valid: boolean;
  warnings: string[];
  scenario_results: Array<{
    eligible: boolean;
    discount_amount: number;
    final_amount: number;
    selected_provider: string;
    reason?: string;
  }>;
  correlation_id: string;
}

// =====================================================
// Validation Helpers
// =====================================================

// Approximate currency conversion rates (for testing purposes)
const CURRENCY_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.35,
  EGP: 30.9,
  SAR: 3.75
};

function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
  if (fromCurrency === toCurrency) return amount;
  
  const fromRate = CURRENCY_RATES[fromCurrency] || 1.0;
  const toRate = CURRENCY_RATES[toCurrency] || 1.0;
  
  // Convert to USD first, then to target currency
  const usdAmount = amount / fromRate;
  return Math.round(usdAmount * toRate);
}

function validatePromotionConfig(config: ValidatePromotionConfig): { valid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Validate required fields
  if (!config.name || config.name.trim().length < 1) {
    errors.push('Promotion name is required');
  }
  
  if (!config.discount_type || !['percentage', 'fixed_amount'].includes(config.discount_type)) {
    errors.push('discount_type must be either "percentage" or "fixed_amount"');
  }
  
  if (typeof config.discount_value !== 'number' || config.discount_value <= 0) {
    errors.push('discount_value must be a positive number');
  }
  
  // Validate percentage discount
  if (config.discount_type === 'percentage' && config.discount_value > 100) {
    errors.push('Percentage discount cannot exceed 100%');
  }
  
  // Validate fixed amount discount requires currency
  if (config.discount_type === 'fixed_amount' && !config.currency) {
    errors.push('Currency is required for fixed_amount discount type');
  }
  
  // Validate minimum order amount requires currency
  if (config.minimum_order_amount && !config.minimum_order_currency) {
    errors.push('minimum_order_currency is required when minimum_order_amount is set');
  }
  
  // Add warnings for edge cases
  if (config.discount_type === 'percentage' && config.discount_value > 50) {
    warnings.push('High percentage discount (>50%) detected');
  }
  
  if (config.minimum_order_amount && config.minimum_order_amount > 100000) {
    warnings.push('Very high minimum order amount detected');
  }
  
  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}

function calculateDiscount(
  orderAmount: number,
  config: ValidatePromotionConfig,
  scenarioCurrency: string
): number {
  if (config.discount_type === 'percentage') {
    return Math.round((orderAmount * config.discount_value) / 100);
  } else {
    // Fixed amount - need to convert if currencies don't match
    const discountInScenarioCurrency = convertCurrency(
      config.discount_value,
      config.currency || 'USD',
      scenarioCurrency
    );
    return Math.min(orderAmount, discountInScenarioCurrency);
  }
}

function checkMinimumOrder(
  orderAmount: number,
  scenarioCurrency: string,
  config: ValidatePromotionConfig
): { eligible: boolean; reason?: string } {
  if (!config.minimum_order_amount) {
    return { eligible: true };
  }
  
  // Convert minimum order amount to scenario currency
  const minimumInScenarioCurrency = convertCurrency(
    config.minimum_order_amount,
    config.minimum_order_currency || 'USD',
    scenarioCurrency
  );
  
  if (orderAmount < minimumInScenarioCurrency) {
    return {
      eligible: false,
      reason: `Order amount ${orderAmount} ${scenarioCurrency} below minimum ${minimumInScenarioCurrency} ${scenarioCurrency}`
    };
  }
  
  return { eligible: true };
}

function validateCreatePromotionRequest(data: any): CreatePromotionRequest | string {
  if (!data.name || typeof data.name !== 'string' || data.name.length < 1) {
    return 'Name is required and must be non-empty';
  }
  
  if (!data.discount_type || !['percentage', 'fixed_amount'].includes(data.discount_type)) {
    return 'discount_type must be either "percentage" or "fixed_amount"';
  }
  
  if (!data.discount_value || typeof data.discount_value !== 'number' || data.discount_value <= 0) {
    return 'discount_value must be a positive number';
  }
  
  if (data.discount_type === 'percentage' && data.discount_value > 100) {
    return 'percentage discount cannot exceed 100';
  }
  
  if (!data.codes || !Array.isArray(data.codes) || data.codes.length === 0) {
    return 'At least one promotion code must be provided';
  }
  
  // Validate codes format
  for (const code of data.codes) {
    if (typeof code !== 'string' || code.trim().length < 3) {
      return 'All codes must be strings with at least 3 characters';
    }
    if (!/^[A-Z0-9_-]+$/i.test(code.trim())) {
      return 'Codes can only contain letters, numbers, underscores, and hyphens';
    }
  }
  
  return data as CreatePromotionRequest;
}

// =====================================================
// Admin Promotion Routes
// =====================================================

import { FastifyPluginAsync } from 'fastify';

export const adminPromotionRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply middleware to all routes
  fastify.addHook('preHandler', correlationIdMiddleware);
  
  /**
   * List all promotions with pagination and filtering
   * GET /v1/admin/promotions
   */
  fastify.get('/v1/admin/promotions', {
    preHandler: [requireAdminAuth({
      permissions: ['promotion:read', 'promotion:write'],
      logActions: true
    })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!pool) {
      return reply.status(500).send(adminErrorResponse(request, 'Database not configured'));
    }

    try {
      const query = request.query as any;
      const page = Math.max(1, parseInt(query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
      const offset = (page - 1) * limit;
      const status = query.status || null;
      const search = query.search || null;

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (status) {
        whereClause += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (search) {
        whereClause += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Get promotions with usage statistics
      const promotions = await pool.query(`
        SELECT 
          p.*,
          COUNT(pc.id) as total_codes,
          COUNT(pr.id) as total_redemptions,
          COALESCE(SUM(pr.discount_applied_amount), 0) as total_discount_given
        FROM promotions p
        LEFT JOIN promotion_codes pc ON p.id = pc.promotion_id AND pc.is_active = true
        LEFT JOIN promotion_redemptions pr ON p.id = pr.promotion_id
        ${whereClause}
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, limit, offset]);

      // Get total count for pagination
      const countResult = await pool.query(`
        SELECT COUNT(*) as total
        FROM promotions p
        ${whereClause}
      `, params);

      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / limit);

      return reply.send(withCorrelationId({
        success: true,
        promotions: promotions.rows,
        pagination: {
          page,
          limit,
          total,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      }, request));

    } catch (error) {
      console.error('List promotions error:', error);
      return reply.status(500).send(adminErrorResponse(request, 'Failed to fetch promotions'));
    }
  });

  /**
   * Create a new promotion with initial codes
   * POST /v1/admin/promotions
   */
  fastify.post('/v1/admin/promotions', {
    preHandler: [requireAdminAuth({
      permissions: ['promotion:write'],
      requireReason: true,
      logActions: true
    }), enforceReason]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!pool) {
      return reply.status(500).send(adminErrorResponse(request, 'Database not configured'));
    }

    const validation = validateCreatePromotionRequest(request.body);
    if (typeof validation === 'string') {
      return reply.status(400).send(adminErrorResponse(request, validation));
    }

    const data = validation;
    const user = (request as any).adminClaims;
    const reason = (request as any).reason || 'No reason provided';

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create promotion
      const promotion = await client.query(`
        INSERT INTO promotions (
          name, description, discount_type, discount_value,
          max_total_uses, max_uses_per_user, valid_from, valid_until,
          created_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        data.name,
        data.description || null,
        data.discount_type,
        data.discount_value,
        data.max_total_uses || null,
        data.max_uses_per_user || 1,
        data.valid_from || new Date().toISOString(),
        data.valid_until || null,
        user.sub,
        data.notes || null
      ]);

      const promotionId = promotion.rows[0].id;

      // Create promotion codes
      const codes = [];
      for (const code of data.codes) {
        const codeResult = await client.query(`
          INSERT INTO promotion_codes (promotion_id, code)
          VALUES ($1, $2)
          RETURNING *
        `, [promotionId, code.trim()]);
        codes.push(codeResult.rows[0]);
      }

      // Log admin action
      await client.query(`
        SELECT public.rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
      `, [
        user.sub,
        'promotion_created', 
        'promotion',
        promotionId,
        reason,
        (request as any).correlationId,
        {
          promotion_id: promotionId,
          name: data.name,
          discount_type: data.discount_type,
          discount_value: data.discount_value,
          codes_created: data.codes.length
        }
      ]);

      await client.query('COMMIT');

      return reply.status(201).send(withCorrelationId({
        success: true,
        promotion: promotion.rows[0],
        codes: codes,
        message: 'Promotion created successfully'
      }, request));

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create promotion error:', error);
      
      if (error instanceof Error && error.message.includes('duplicate key')) {
        return reply.status(409).send(adminErrorResponse(request, 'One or more promotion codes already exist'));
      }
      
      return reply.status(500).send(adminErrorResponse(request, 'Failed to create promotion'));
    } finally {
      client.release();
    }
  });

  /**
   * Get promotion details with codes and analytics
   * GET /v1/admin/promotions/:id
   */
  fastify.get('/v1/admin/promotions/:id', {
    preHandler: [requireAdminAuth({
      permissions: ['promotion:read', 'promotion:write'],
      logActions: false
    })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!pool) {
      return reply.status(500).send(adminErrorResponse(request, 'Database not configured'));
    }

    const { id } = request.params as { id: string };

    try {
      // Get promotion with analytics
      const promotion = await pool.query(`
        SELECT 
          p.*,
          COUNT(DISTINCT pc.id) as total_codes,
          COUNT(DISTINCT pr.id) as total_redemptions,
          COUNT(DISTINCT pr.user_id) as unique_users,
          COALESCE(SUM(pr.discount_applied_amount), 0) as total_discount_given,
          MAX(pr.redeemed_at) as last_used_at
        FROM promotions p
        LEFT JOIN promotion_codes pc ON p.id = pc.promotion_id
        LEFT JOIN promotion_redemptions pr ON p.id = pr.promotion_id
        WHERE p.id = $1
        GROUP BY p.id
      `, [id]);

      if (promotion.rows.length === 0) {
        return reply.status(404).send(adminErrorResponse(request, 'Promotion not found'));
      }

      // Get promotion codes
      const codes = await pool.query(`
        SELECT 
          pc.*,
          COUNT(pr.id) as redemption_count,
          MAX(pr.redeemed_at) as last_used_at
        FROM promotion_codes pc
        LEFT JOIN promotion_redemptions pr ON pc.id = pr.promotion_code_id
        WHERE pc.promotion_id = $1
        GROUP BY pc.id
        ORDER BY pc.created_at DESC
      `, [id]);

      // Get recent redemptions
      const recentRedemptions = await pool.query(`
        SELECT 
          pr.redeemed_at,
          pr.discount_applied_amount,
          pr.original_amount,
          pr.final_amount,
          pc.code,
          u.email
        FROM promotion_redemptions pr
        JOIN promotion_codes pc ON pr.promotion_code_id = pc.id
        LEFT JOIN auth.users u ON pr.user_id = u.id::text
        WHERE pr.promotion_id = $1
        ORDER BY pr.redeemed_at DESC
        LIMIT 10
      `, [id]);

      return reply.send(withCorrelationId({
        success: true,
        promotion: promotion.rows[0],
        codes: codes.rows,
        recent_redemptions: recentRedemptions.rows
      }, request));

    } catch (error) {
      console.error('Get promotion details error:', error);
      return reply.status(500).send(adminErrorResponse(request, 'Failed to fetch promotion details'));
    }
  });

  /**
   * Update promotion settings
   * PATCH /v1/admin/promotions/:id
   */
  fastify.patch('/v1/admin/promotions/:id', {
    preHandler: [requireAdminAuth({
      permissions: ['promotion:write'],
      requireReason: true,
      logActions: true
    }), enforceReason]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!pool) {
      return reply.status(500).send(adminErrorResponse(request, 'Database not configured'));
    }

    const { id } = request.params as { id: string };
    const updates = request.body as UpdatePromotionRequest;
    const user = (request as any).adminClaims;
    const reason = (request as any).reason;

    try {
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      // Build dynamic update query
      if (updates.name) {
        updateFields.push(`name = $${paramIndex}`);
        updateValues.push(updates.name);
        paramIndex++;
      }

      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramIndex}`);
        updateValues.push(updates.description);
        paramIndex++;
      }

      if (updates.max_total_uses !== undefined) {
        updateFields.push(`max_total_uses = $${paramIndex}`);
        updateValues.push(updates.max_total_uses);
        paramIndex++;
      }

      if (updates.max_uses_per_user !== undefined) {
        updateFields.push(`max_uses_per_user = $${paramIndex}`);
        updateValues.push(updates.max_uses_per_user);
        paramIndex++;
      }

      if (updates.valid_until !== undefined) {
        updateFields.push(`valid_until = $${paramIndex}`);
        updateValues.push(updates.valid_until);
        paramIndex++;
      }

      if (updates.status) {
        updateFields.push(`status = $${paramIndex}`);
        updateValues.push(updates.status);
        paramIndex++;
      }

      if (updates.notes !== undefined) {
        updateFields.push(`notes = $${paramIndex}`);
        updateValues.push(updates.notes);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        return reply.status(400).send(adminErrorResponse(request, 'No valid fields provided for update'));
      }

      updateFields.push(`updated_at = now()`);
      updateValues.push(id);

      const result = await pool.query(`
        UPDATE promotions 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, updateValues);

      if (result.rows.length === 0) {
        return reply.status(404).send(adminErrorResponse(request, 'Promotion not found'));
      }

      // Log admin action
      await pool.query(`
        SELECT public.rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
      `, [
        user.sub,
        'promotion_updated',
        'promotion',
        id,
        reason,
        (request as any).correlationId,
        {
          promotion_id: id,
          updated_fields: Object.keys(updates)
        }
      ]);

      return reply.send(withCorrelationId({
        success: true,
        promotion: result.rows[0],
        message: 'Promotion updated successfully'
      }, request));

    } catch (error) {
      console.error('Update promotion error:', error);
      return reply.status(500).send(adminErrorResponse(request, 'Failed to update promotion'));
    }
  });

  /**
   * Add new codes to existing promotion
   * POST /v1/admin/promotions/:id/codes
   */
  fastify.post('/v1/admin/promotions/:id/codes', {
    preHandler: [requireAdminAuth({
      permissions: ['promotion:write'],
      requireReason: true,
      logActions: true
    }), enforceReason]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!pool) {
      return reply.status(500).send(adminErrorResponse(request, 'Database not configured'));
    }

    const { id } = request.params as { id: string };
    const data = request.body as CreatePromotionCodeRequest;
    const user = (request as any).adminClaims;
    const reason = (request as any).reason;

    if (!data.codes || !Array.isArray(data.codes) || data.codes.length === 0) {
      return reply.status(400).send(adminErrorResponse(request, 'At least one code must be provided'));
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Verify promotion exists
      const promotion = await client.query('SELECT id FROM promotions WHERE id = $1', [id]);
      if (promotion.rows.length === 0) {
        return reply.status(404).send(adminErrorResponse(request, 'Promotion not found'));
      }

      // Create codes
      const codes = [];
      for (const code of data.codes) {
        const codeResult = await client.query(`
          INSERT INTO promotion_codes (promotion_id, code, max_uses)
          VALUES ($1, $2, $3)
          RETURNING *
        `, [id, code.trim(), data.max_uses || null]);
        codes.push(codeResult.rows[0]);
      }

      // Log admin action
      await client.query(`
        SELECT public.rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
      `, [
        user.sub,
        'promotion_codes_added',
        'promotion',
        id,
        reason,
        (request as any).correlationId,
        {
          promotion_id: id,
          codes_added: data.codes.length,
          codes: data.codes
        }
      ]);

      await client.query('COMMIT');

      return reply.status(201).send(withCorrelationId({
        success: true,
        codes: codes,
        message: `${codes.length} promotion codes added successfully`
      }, request));

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Add promotion codes error:', error);
      
      if (error instanceof Error && error.message.includes('duplicate key')) {
        return reply.status(409).send(adminErrorResponse(request, 'One or more promotion codes already exist'));
      }
      
      return reply.status(500).send(adminErrorResponse(request, 'Failed to add promotion codes'));
    } finally {
      client.release();
    }
  });

  /**
   * Get promotion analytics and reporting
   * GET /v1/admin/promotions/analytics
   */
  fastify.get('/v1/admin/promotions/analytics', {
    preHandler: [requireAdminAuth({
      permissions: ['promotion:read', 'promotion:write'],
      logActions: false
    })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!pool) {
      return reply.status(500).send(adminErrorResponse(request, 'Database not configured'));
    }

    try {
      const query = request.query as any;
      const days = Math.min(365, Math.max(1, parseInt(query.days as string) || 30));

      // Overall promotion performance
      const overallStats = await pool.query(`
        SELECT 
          COUNT(DISTINCT p.id) as total_promotions,
          COUNT(DISTINCT pc.id) as total_codes,
          COUNT(DISTINCT pr.id) as total_redemptions,
          COUNT(DISTINCT pr.user_id) as unique_users,
          COALESCE(SUM(pr.discount_applied_amount), 0) as total_discount_given,
          COALESCE(AVG(pr.discount_applied_amount), 0) as avg_discount_per_use
        FROM promotions p
        LEFT JOIN promotion_codes pc ON p.id = pc.promotion_id
        LEFT JOIN promotion_redemptions pr ON p.id = pr.promotion_id 
          AND pr.redeemed_at >= now() - interval '${days} days'
      `);

      // Top performing promotions
      const topPromotions = await pool.query(`
        SELECT 
          p.id,
          p.name,
          p.discount_type,
          p.discount_value,
          COUNT(pr.id) as redemption_count,
          COUNT(DISTINCT pr.user_id) as unique_users,
          COALESCE(SUM(pr.discount_applied_amount), 0) as total_discount_given,
          MAX(pr.redeemed_at) as last_used_at
        FROM promotions p
        LEFT JOIN promotion_redemptions pr ON p.id = pr.promotion_id 
          AND pr.redeemed_at >= now() - interval '${days} days'
        GROUP BY p.id, p.name, p.discount_type, p.discount_value
        ORDER BY redemption_count DESC, total_discount_given DESC
        LIMIT 10
      `);

      // Daily usage trends
      const dailyTrends = await pool.query(`
        SELECT 
          DATE(pr.redeemed_at) as date,
          COUNT(pr.id) as redemptions,
          COUNT(DISTINCT pr.user_id) as unique_users,
          COALESCE(SUM(pr.discount_applied_amount), 0) as discount_given
        FROM promotion_redemptions pr
        WHERE pr.redeemed_at >= now() - interval '${days} days'
        GROUP BY DATE(pr.redeemed_at)
        ORDER BY date DESC
        LIMIT ${days}
      `);

      return reply.send(withCorrelationId({
        success: true,
        period_days: days,
        overall_stats: overallStats.rows[0],
        top_promotions: topPromotions.rows,
        daily_trends: dailyTrends.rows
      }, request));

    } catch (error) {
      console.error('Get promotion analytics error:', error);
      return reply.status(500).send(adminErrorResponse(request, 'Failed to fetch promotion analytics'));
    }
  });

  /**
   * Validate promotion configuration with test scenarios
   * POST /v1/admin/promotions/validate
   */
  fastify.post<{
    Body: ValidatePromotionRequest;
  }>('/v1/admin/promotions/validate', {
    preHandler: [requireAdminAuth({
      permissions: ['promotion:read', 'promotion:write'],
      logActions: false
    })]
  }, async (request: FastifyRequest<{ Body: ValidatePromotionRequest }>, reply: FastifyReply) => {
    try {
      const { promotion_config, test_scenarios } = request.body;
      
      // Validate request
      if (!promotion_config) {
        return reply.status(400).send(adminErrorResponse(request, 'promotion_config is required'));
      }
      
      if (!test_scenarios || !Array.isArray(test_scenarios)) {
        return reply.status(400).send(adminErrorResponse(request, 'test_scenarios must be an array'));
      }
      
      if (test_scenarios.length === 0) {
        return reply.status(400).send(adminErrorResponse(request, 'At least one test scenario is required'));
      }
      
      if (test_scenarios.length > 10) {
        return reply.status(400).send(adminErrorResponse(request, 'Maximum 10 test scenarios allowed'));
      }
      
      // Validate promotion configuration
      const configValidation = validatePromotionConfig(promotion_config);
      
      // If config has errors, return early
      if (!configValidation.valid) {
        return reply.status(400).send(withCorrelationId({
          success: false,
          valid: false,
          warnings: configValidation.warnings,
          errors: configValidation.errors,
          scenario_results: [],
          correlation_id: request.correlationId
        }, request));
      }
      
      // Process each test scenario
      const scenario_results = test_scenarios.map(scenario => {
        // Validate scenario fields
        if (!scenario.region || !scenario.currency || typeof scenario.order_amount !== 'number' || !scenario.provider) {
          return {
            eligible: false,
            discount_amount: 0,
            final_amount: scenario.order_amount || 0,
            selected_provider: scenario.provider || 'unknown',
            reason: 'Invalid scenario parameters'
          };
        }
        
        // Check minimum order requirement
        const minimumOrderCheck = checkMinimumOrder(
          scenario.order_amount,
          scenario.currency,
          promotion_config
        );
        
        if (!minimumOrderCheck.eligible) {
          return {
            eligible: false,
            discount_amount: 0,
            final_amount: scenario.order_amount,
            selected_provider: scenario.provider,
            reason: minimumOrderCheck.reason
          };
        }
        
        // Calculate discount
        const discount_amount = calculateDiscount(
          scenario.order_amount,
          promotion_config,
          scenario.currency
        );
        
        const final_amount = Math.max(0, scenario.order_amount - discount_amount);
        
        // Check if provider is supported (if restrictions are set)
        if (promotion_config.supported_providers && 
            promotion_config.supported_providers.length > 0 &&
            !promotion_config.supported_providers.includes(scenario.provider)) {
          return {
            eligible: false,
            discount_amount: 0,
            final_amount: scenario.order_amount,
            selected_provider: scenario.provider,
            reason: `Provider ${scenario.provider} not supported for this promotion`
          };
        }
        
        return {
          eligible: true,
          discount_amount,
          final_amount,
          selected_provider: scenario.provider
        };
      });
      
      // Return response
      return reply.send(withCorrelationId({
        success: true,
        valid: configValidation.valid,
        warnings: configValidation.warnings,
        scenario_results,
        correlation_id: request.correlationId
      }, request));
      
    } catch (error) {
      console.error('Promotion validation error:', error);
      return reply.status(500).send(adminErrorResponse(request, 'Failed to validate promotion configuration'));
    }
  });

  /**
   * Clean up expired ephemeral artifacts
   * POST /v1/admin/promotions/cleanup
   */
  fastify.post('/v1/admin/promotions/cleanup', {
    preHandler: [requireAdminAuth({
      permissions: ['promotion:write'],
      logActions: true
    })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Cleanup expired reservations
      const reservationCleanup = await promoCore.cleanupExpiredReservations();
      
      // Cleanup expired Stripe artifacts
      const artifactCleanup = await stripeAdapter.cleanupExpiredArtifacts();

      return reply.send(withCorrelationId({
        success: true,
        reservations_cleaned: reservationCleanup.cleaned,
        stripe_artifacts_cleaned: artifactCleanup.cleaned,
        errors: artifactCleanup.errors,
        message: 'Cleanup completed successfully'
      }, request));

    } catch (error) {
      console.error('Promotion cleanup error:', error);
      return reply.status(500).send(adminErrorResponse(request, 'Failed to perform cleanup'));
    }
  });
}