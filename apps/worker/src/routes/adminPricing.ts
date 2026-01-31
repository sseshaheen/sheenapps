/**
 * Admin Pricing Management Routes
 * 
 * Provides admin functionality for managing pricing catalogs:
 * - View active and historical pricing catalogs
 * - Create new pricing catalog versions
 * - Activate catalog versions with validation
 * - Manage pricing items (subscriptions and packages)
 * - Pricing analytics and usage insights
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdminAuth, requireFinancialAccess } from '../middleware/adminAuthentication';
import { withCorrelationId, adminErrorResponse } from '../middleware/correlationIdMiddleware';
import { enforceReason } from '../middleware/reasonEnforcement';
import { pricingCatalogService, PricingItem, CatalogVersion } from '../services/pricingCatalogService';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

// =====================================================
// Pricing Catalog Management
// =====================================================

/**
 * GET /v1/admin/pricing/catalogs
 * List all catalog versions with status
 */
async function listCatalogs(
  request: FastifyRequest<{
    Querystring: {
      limit?: number;
      offset?: number;
    }
  }>,
  reply: FastifyReply
) {
  try {
    const { limit = 20, offset = 0 } = request.query;
    
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    // Get total count for pagination
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM pricing_catalog_versions pcv
    `);

    const total = parseInt(countResult.rows[0]?.total || '0');

    const result = await pool.query(`
      SELECT 
        pcv.*,
        COUNT(pi.id) as item_count,
        COUNT(pi.id) FILTER (WHERE pi.is_active = true) as active_item_count
      FROM pricing_catalog_versions pcv
      LEFT JOIN pricing_items pi ON pi.catalog_version_id = pcv.id
      GROUP BY pcv.id
      ORDER BY pcv.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    return reply.send(
      withCorrelationId({
        success: true,
        catalogs: result.rows,
        pagination: {
          limit,
          offset,
          returned: result.rows.length,
          total
        }
      }, request)
    );

  } catch (error) {
    await loggingService.logCriticalError('admin_pricing_catalogs_list_error', error as Error, {
      admin_user: (request as any).adminClaims?.userId
    });

    return reply.code(500).send(
      adminErrorResponse(request, 'Failed to fetch pricing catalogs')
    );
  }
}

/**
 * GET /v1/admin/pricing/catalogs/:id
 * Get detailed catalog with all items
 */
async function getCatalogDetails(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    const [catalogResult, itemsResult] = await Promise.all([
      pool.query(`
        SELECT * FROM pricing_catalog_versions WHERE id = $1
      `, [id]),
      pool.query(`
        SELECT * FROM pricing_items 
        WHERE catalog_version_id = $1 
        ORDER BY item_type, display_order
      `, [id])
    ]);

    if (catalogResult.rows.length === 0) {
      return reply.code(404).send(
        adminErrorResponse(request, 'Catalog not found')
      );
    }

    return reply.send(
      withCorrelationId({
        success: true,
        catalog: catalogResult.rows[0],
        items: itemsResult.rows
      }, request)
    );

  } catch (error) {
    await loggingService.logCriticalError('admin_pricing_catalog_details_error', error as Error, {
      admin_user: (request as any).adminClaims?.userId,
      catalog_id: request.params.id
    });

    return reply.code(500).send(
      adminErrorResponse(request, 'Failed to fetch catalog details')
    );
  }
}

/**
 * POST /v1/admin/pricing/catalogs
 * Create new catalog version
 */
async function createCatalog(
  request: FastifyRequest<{
    Body: {
      version_tag: string;
      rollover_days?: number;
      reason: string;
    }
  }>,
  reply: FastifyReply
) {
  try {
    const { version_tag, rollover_days = 90, reason } = request.body;
    const adminClaims = (request as any).adminClaims;

    // Check if version already exists
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    const existingResult = await pool.query(`
      SELECT id FROM pricing_catalog_versions WHERE version_tag = $1
    `, [version_tag]);

    if (existingResult.rows.length > 0) {
      return reply.code(400).send(
        adminErrorResponse(request, `Catalog version '${version_tag}' already exists`)
      );
    }

    const catalogId = await pricingCatalogService.createCatalogVersion(
      version_tag,
      rollover_days,
      adminClaims.userId
    );

    // Log admin action
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    await pool.query(`
      SELECT rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
    `, [
      adminClaims.userId,
      'pricing.catalog.create',
      'pricing_catalog_version',
      catalogId,
      reason,
      request.correlationId,
      JSON.stringify({
        version_tag,
        rollover_days
      })
    ]);

    return reply.code(201).send(
      withCorrelationId({
        success: true,
        message: 'Pricing catalog created successfully',
        catalog: {
          id: catalogId,
          version_tag,
          rollover_days,
          created_by: adminClaims.userId
        }
      }, request)
    );

  } catch (error) {
    await loggingService.logCriticalError('admin_pricing_catalog_create_error', error as Error, {
      admin_user: (request as any).adminClaims?.userId
    });

    return reply.code(500).send(
      adminErrorResponse(request, 'Failed to create pricing catalog')
    );
  }
}

/**
 * PUT /v1/admin/pricing/catalogs/:id/activate
 * Activate a catalog version with validation
 */
async function activateCatalog(
  request: FastifyRequest<{
    Params: { id: string };
    Body: { reason: string };
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const { reason } = request.body;
    const adminClaims = (request as any).adminClaims;

    // Get catalog details for logging
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    const catalogResult = await pool.query(`
      SELECT version_tag, is_active FROM pricing_catalog_versions WHERE id = $1
    `, [id]);

    if (catalogResult.rows.length === 0) {
      return reply.code(404).send(
        adminErrorResponse(request, 'Catalog not found')
      );
    }

    const catalog = catalogResult.rows[0];
    
    if (catalog.is_active) {
      return reply.code(400).send(
        adminErrorResponse(request, 'Catalog is already active')
      );
    }

    // Validate and activate catalog (includes safety checks)
    await pricingCatalogService.activateCatalogVersion(id);

    // Log admin action
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    await pool.query(`
      SELECT rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
    `, [
      adminClaims.userId,
      'pricing.catalog.activate',
      'pricing_catalog_version',
      id,
      reason,
      request.correlationId,
      JSON.stringify({
        version_tag: catalog.version_tag,
        previous_active: 'deactivated'
      })
    ]);

    return reply.send(
      withCorrelationId({
        success: true,
        message: `Pricing catalog '${catalog.version_tag}' activated successfully`,
        catalog: {
          id,
          version_tag: catalog.version_tag,
          is_active: true,
          activated_by: adminClaims.userId,
          activated_at: new Date().toISOString()
        }
      }, request)
    );

  } catch (error) {
    await loggingService.logCriticalError('admin_pricing_catalog_activate_error', error as Error, {
      admin_user: (request as any).adminClaims?.userId,
      catalog_id: request.params.id
    });

    // Check if it's a validation error
    if (error instanceof Error && error.message.includes('must have')) {
      return reply.code(400).send(
        adminErrorResponse(request, `Activation failed: ${error.message}`)
      );
    }

    return reply.code(500).send(
      adminErrorResponse(request, 'Failed to activate pricing catalog')
    );
  }
}

/**
 * GET /v1/admin/pricing/analytics
 * Pricing analytics and usage insights
 */
async function getPricingAnalytics(
  request: FastifyRequest<{
    Querystring: {
      period?: 'day' | 'week' | 'month';
    }
  }>,
  reply: FastifyReply
) {
  try {
    const { period = 'month' } = request.query;
    
    let purchaseDateFilter = '';
    let usageDateFilter = '';
    switch (period) {
      case 'day':
        purchaseDateFilter = "DATE(p.purchased_at) = CURRENT_DATE";
        usageDateFilter = "DATE(created_at) = CURRENT_DATE";
        break;
      case 'week':
        purchaseDateFilter = "p.purchased_at >= NOW() - INTERVAL '7 days'";
        usageDateFilter = "created_at >= NOW() - INTERVAL '7 days'";
        break;
      case 'month':
        purchaseDateFilter = "DATE_TRUNC('month', p.purchased_at) = DATE_TRUNC('month', CURRENT_DATE)";
        usageDateFilter = "DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)";
        break;
    }

    if (!pool) {
      throw new Error('Database pool not initialized');
    }

    const [
      purchasesByPlanResult,
      revenueByPlanResult,
      usageStatsResult
    ] = await Promise.all([
      // Purchase counts by plan/package
      pool.query(`
        SELECT 
          pi.item_key,
          pi.item_type,
          pi.display_name,
          COUNT(p.id) as purchase_count,
          AVG(p.price) as avg_price
        FROM user_ai_time_purchases p
        JOIN pricing_items pi ON pi.item_key = p.package_name
        WHERE p.payment_status = 'completed' AND ${purchaseDateFilter}
        GROUP BY pi.item_key, pi.item_type, pi.display_name
        ORDER BY purchase_count DESC
      `),
      
      // Revenue by plan/package
      pool.query(`
        SELECT 
          pi.item_key,
          pi.item_type,
          pi.display_name,
          SUM(p.price) as total_revenue,
          COUNT(p.id) as purchase_count
        FROM user_ai_time_purchases p
        JOIN pricing_items pi ON pi.item_key = p.package_name
        WHERE p.payment_status = 'completed' AND ${purchaseDateFilter}
        GROUP BY pi.item_key, pi.item_type, pi.display_name
        ORDER BY total_revenue DESC
      `),
      
      // AI time usage stats
      pool.query(`
        SELECT 
          COUNT(DISTINCT user_id) as active_users,
          SUM(billable_seconds) as total_seconds_consumed,
          AVG(billable_seconds) as avg_seconds_per_operation,
          COUNT(*) as total_operations
        FROM user_ai_time_consumption
        WHERE ${usageDateFilter}
      `)
    ]);

    return reply.send(
      withCorrelationId({
        success: true,
        period,
        analytics: {
          purchases_by_plan: purchasesByPlanResult.rows,
          revenue_by_plan: revenueByPlanResult.rows,
          usage_stats: usageStatsResult.rows[0] || {
            active_users: 0,
            total_seconds_consumed: 0,
            avg_seconds_per_operation: 0,
            total_operations: 0
          }
        }
      }, request)
    );

  } catch (error) {
    await loggingService.logCriticalError('admin_pricing_analytics_error', error as Error, {
      admin_user: (request as any).adminClaims?.userId
    });

    return reply.code(500).send(
      adminErrorResponse(request, 'Failed to fetch pricing analytics')
    );
  }
}

// =====================================================
// Routes Registration
// =====================================================

export async function registerAdminPricingRoutes(fastify: FastifyInstance) {
  if (!pool) {
    console.warn('⚠️  Database connection not available - admin pricing routes disabled');
    return;
  }

  // GET /v1/admin/pricing/catalogs - List all pricing catalogs
  fastify.get<{
    Querystring: {
      limit?: number;
      offset?: number;
    }
  }>('/v1/admin/pricing/catalogs', {
    preHandler: requireFinancialAccess()
  }, listCatalogs);

  // GET /v1/admin/pricing/catalogs/:id - Get catalog details
  fastify.get<{
    Params: { id: string }
  }>('/v1/admin/pricing/catalogs/:id', {
    preHandler: requireFinancialAccess()
  }, getCatalogDetails);

  // POST /v1/admin/pricing/catalogs - Create new catalog
  fastify.post<{
    Body: {
      version_tag: string;
      rollover_days?: number;
      reason: string;
    }
  }>('/v1/admin/pricing/catalogs', {
    preHandler: [requireFinancialAccess(), enforceReason],
    schema: {
      body: {
        type: 'object',
        properties: {
          version_tag: { type: 'string', minLength: 1 },
          rollover_days: { type: 'number', minimum: 1 },
          reason: { type: 'string', minLength: 1 }
        },
        required: ['version_tag', 'reason']
      }
    }
  }, createCatalog);

  // PUT /v1/admin/pricing/catalogs/:id/activate - Activate catalog
  fastify.put<{
    Params: { id: string };
    Body: { reason: string };
  }>('/v1/admin/pricing/catalogs/:id/activate', {
    preHandler: [requireFinancialAccess(), enforceReason],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string', minLength: 1 }
        },
        required: ['reason']
      }
    }
  }, activateCatalog);

  // GET /v1/admin/pricing/analytics - Get pricing analytics
  fastify.get<{
    Querystring: {
      period?: 'day' | 'week' | 'month';
    }
  }>('/v1/admin/pricing/analytics', {
    preHandler: requireFinancialAccess()
  }, getPricingAnalytics);

  console.log('[Admin] Admin pricing management routes registered successfully');
}