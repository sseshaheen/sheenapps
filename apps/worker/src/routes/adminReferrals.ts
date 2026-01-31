// Admin Referral Management Routes
// Comprehensive admin interface for managing referral partners, commissions, and payouts

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { 
  ReferralPartner, 
  Commission,
  AdminPartnerOverview,
  PayoutBatch,
  FraudCheckResult 
} from '../types/referrals';
import { referralCommissionService } from '../services/referralCommissionService';

// Initialize middleware
const hmacMiddleware = requireHmacSignature;

// Database connection
const { pool } = require('../services/database');

// =====================================================
// ADMIN OVERVIEW & ANALYTICS
// =====================================================

async function getAdminOverview(
  request: FastifyRequest<{ Querystring: { days?: number } }>,
  reply: FastifyReply
) {
  const { days = 30 } = request.query;

  try {
    // Get comprehensive overview stats
    const overviewResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT rp.id) as total_partners,
        COUNT(DISTINCT CASE WHEN rp.status = 'active' THEN rp.id END) as active_partners,
        COUNT(DISTINCT r.id) as total_referrals,
        COUNT(DISTINCT CASE WHEN r.status = 'confirmed' THEN r.id END) as successful_referrals,
        
        -- Commission totals
        SUM(CASE WHEN c.status = 'paid' THEN c.commission_amount_cents ELSE 0 END) as total_paid_cents,
        SUM(CASE WHEN c.status = 'approved' THEN c.commission_amount_cents ELSE 0 END) as pending_payout_cents,
        SUM(CASE WHEN c.status = 'pending' THEN c.commission_amount_cents ELSE 0 END) as pending_approval_cents,
        
        -- Recent activity (last 30 days)
        COUNT(DISTINCT CASE WHEN r.created_at >= CURRENT_DATE - INTERVAL '$1 days' THEN r.id END) as recent_referrals,
        SUM(CASE WHEN c.created_at >= CURRENT_DATE - INTERVAL '$1 days' AND c.status != 'reversed' 
             THEN c.commission_amount_cents ELSE 0 END) as recent_commissions_cents
        
      FROM referral_partners rp
      LEFT JOIN referrals r ON rp.id = r.partner_id
      LEFT JOIN referral_commissions c ON r.id = c.referral_id
    `, [days]);

    // Get top performers
    const topPerformersResult = await pool.query(`
      SELECT 
        rp.id, rp.partner_code, rp.company_name, rp.tier,
        u.email as partner_email,
        rp.successful_referrals,
        SUM(CASE WHEN c.status IN ('approved', 'paid') THEN c.commission_amount_cents ELSE 0 END) as total_earned_cents,
        COUNT(DISTINCT r.id) as total_referrals
      FROM referral_partners rp
      JOIN auth.users u ON rp.user_id = u.id
      LEFT JOIN referrals r ON rp.id = r.partner_id
      LEFT JOIN referral_commissions c ON r.id = c.referral_id
      WHERE rp.status = 'active'
      GROUP BY rp.id, u.email
      ORDER BY total_earned_cents DESC NULLS LAST
      LIMIT 10
    `);

    // Get recent suspicious activity
    const suspiciousActivityResult = await pool.query(`
      SELECT 
        rts.partner_id,
        rp.partner_code,
        rp.company_name,
        rts.ip_address,
        rts.suspicion_reasons,
        rts.click_count,
        rts.signup_count,
        rts.last_seen
      FROM referral_tracking_sessions rts
      JOIN referral_partners rp ON rts.partner_id = rp.id
      WHERE rts.is_suspicious = true
        AND rts.last_seen >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY rts.last_seen DESC
      LIMIT 20
    `);

    const stats = overviewResult.rows[0];

    return reply.send({
      overview: {
        total_partners: parseInt(stats.total_partners || '0'),
        active_partners: parseInt(stats.active_partners || '0'),
        total_referrals: parseInt(stats.total_referrals || '0'),
        successful_referrals: parseInt(stats.successful_referrals || '0'),
        total_paid_cents: parseInt(stats.total_paid_cents || '0'),
        pending_payout_cents: parseInt(stats.pending_payout_cents || '0'),
        pending_approval_cents: parseInt(stats.pending_approval_cents || '0'),
        recent_referrals: parseInt(stats.recent_referrals || '0'),
        recent_commissions_cents: parseInt(stats.recent_commissions_cents || '0')
      },
      top_performers: topPerformersResult.rows.map((row: any) => ({
        partner: {
          id: row.id,
          partner_code: row.partner_code,
          company_name: row.company_name,
          tier: row.tier,
          partner_email: row.partner_email
        },
        metrics: {
          referrals: parseInt(row.total_referrals || '0'),
          successful_referrals: parseInt(row.successful_referrals || '0'),
          commissions_earned_cents: parseInt(row.total_earned_cents || '0')
        }
      })),
      suspicious_activity: suspiciousActivityResult.rows
    } as AdminPartnerOverview);

  } catch (error) {
    console.error('[AdminReferrals] Failed to get admin overview:', error);
    return reply.code(500).send({ error: 'Failed to get admin overview' });
  }
}

// =====================================================
// PARTNER MANAGEMENT
// =====================================================

async function getAllPartners(
  request: FastifyRequest<{ 
    Querystring: { 
      page?: number; 
      limit?: number; 
      status?: 'active' | 'paused' | 'suspended';
      search?: string;
    } 
  }>,
  reply: FastifyReply
) {
  const { page = 1, limit = 50, status, search } = request.query;
  const offset = (page - 1) * limit;

  try {
    let whereClause = '';
    const params: any[] = [limit, offset];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND rp.status = $${++paramCount}`;
      params.push(status);
    }

    if (search) {
      whereClause += ` AND (rp.partner_code ILIKE $${++paramCount} OR rp.company_name ILIKE $${++paramCount} OR u.email ILIKE $${++paramCount})`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const result = await pool.query(`
      SELECT 
        rp.*,
        u.email as partner_email,
        COUNT(DISTINCT r.id) as total_referrals_count,
        COUNT(DISTINCT CASE WHEN r.status = 'confirmed' THEN r.id END) as successful_referrals_count,
        SUM(CASE WHEN c.status IN ('approved', 'paid') THEN c.commission_amount_cents ELSE 0 END) as total_earned_cents,
        SUM(CASE WHEN c.status = 'pending' THEN c.commission_amount_cents ELSE 0 END) as pending_cents
      FROM referral_partners rp
      JOIN auth.users u ON rp.user_id = u.id
      LEFT JOIN referrals r ON rp.id = r.partner_id
      LEFT JOIN referral_commissions c ON r.id = c.referral_id
      WHERE 1=1 ${whereClause}
      GROUP BY rp.id, u.email
      ORDER BY rp.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    // Get total count for pagination
    const countResult = await pool.query(`
      SELECT COUNT(DISTINCT rp.id) as total
      FROM referral_partners rp
      JOIN auth.users u ON rp.user_id = u.id
      WHERE 1=1 ${whereClause.replace(/\$1|\$2/g, (match) => `$${parseInt(match.slice(1)) - 2}`)}
    `, params.slice(2));

    return reply.send({
      partners: result.rows.map((row: any) => ({
        ...row,
        total_referrals_count: parseInt(row.total_referrals_count || '0'),
        successful_referrals_count: parseInt(row.successful_referrals_count || '0'),
        total_earned_cents: parseInt(row.total_earned_cents || '0'),
        pending_cents: parseInt(row.pending_cents || '0')
      })),
      pagination: {
        current_page: page,
        per_page: limit,
        total_count: parseInt(countResult.rows[0]?.total || '0'),
        total_pages: Math.ceil(parseInt(countResult.rows[0]?.total || '0') / limit)
      }
    });

  } catch (error) {
    console.error('[AdminReferrals] Failed to get partners:', error);
    return reply.code(500).send({ error: 'Failed to get partners' });
  }
}

async function updatePartnerStatus(
  request: FastifyRequest<{ 
    Params: { partnerId: string }; 
    Body: { status: 'active' | 'paused' | 'suspended'; reason?: string } 
  }>,
  reply: FastifyReply
) {
  const { partnerId } = request.params;
  const { status, reason } = request.body;

  try {
    const result = await pool.query(`
      UPDATE referral_partners 
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [status, partnerId]);

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Partner not found' });
    }

    // Log the status change for audit
    console.log(`[AdminReferrals] Updated partner ${partnerId} status to ${status}. Reason: ${reason || 'Not specified'}`);

    return reply.send({ 
      success: true, 
      partner: result.rows[0],
      message: `Partner status updated to ${status}`
    });

  } catch (error) {
    console.error('[AdminReferrals] Failed to update partner status:', error);
    return reply.code(500).send({ error: 'Failed to update partner status' });
  }
}

// =====================================================
// COMMISSION MANAGEMENT
// =====================================================

async function getPendingCommissions(
  request: FastifyRequest<{ 
    Querystring: { 
      page?: number; 
      limit?: number;
      partner_id?: string;
      min_amount?: number;
    } 
  }>,
  reply: FastifyReply
) {
  const { page = 1, limit = 100, partner_id, min_amount } = request.query;
  const offset = (page - 1) * limit;

  try {
    let whereClause = "WHERE c.status = 'pending'";
    const params: any[] = [limit, offset];
    let paramCount = 2;

    if (partner_id) {
      whereClause += ` AND c.partner_id = $${++paramCount}`;
      params.push(partner_id);
    }

    if (min_amount) {
      whereClause += ` AND c.commission_amount_cents >= $${++paramCount}`;
      params.push(min_amount);
    }

    const result = await pool.query(`
      SELECT 
        c.*,
        rp.partner_code,
        rp.company_name,
        u.email as partner_email,
        r.referral_code,
        ru.email as referred_user_email
      FROM referral_commissions c
      JOIN referral_partners rp ON c.partner_id = rp.id
      JOIN auth.users u ON rp.user_id = u.id
      JOIN referrals r ON c.referral_id = r.id
      LEFT JOIN auth.users ru ON r.referred_user_id = ru.id
      ${whereClause}
      ORDER BY c.created_at ASC
      LIMIT $1 OFFSET $2
    `, params);

    return reply.send({
      commissions: result.rows,
      pagination: {
        current_page: page,
        per_page: limit
      }
    });

  } catch (error) {
    console.error('[AdminReferrals] Failed to get pending commissions:', error);
    return reply.code(500).send({ error: 'Failed to get pending commissions' });
  }
}

async function approveCommissions(
  request: FastifyRequest<{ Body: { commission_ids: string[] } }>,
  reply: FastifyReply
) {
  const { commission_ids } = request.body;

  try {
    if (!commission_ids || commission_ids.length === 0) {
      return reply.code(400).send({ error: 'Commission IDs are required' });
    }

    const approvedCount = await referralCommissionService.approveCommissions(commission_ids);

    return reply.send({
      success: true,
      approved_count: approvedCount,
      message: `Approved ${approvedCount} commissions`
    });

  } catch (error) {
    console.error('[AdminReferrals] Failed to approve commissions:', error);
    return reply.code(500).send({ error: 'Failed to approve commissions' });
  }
}

// =====================================================
// PAYOUT MANAGEMENT
// =====================================================

async function createPayoutBatch(
  request: FastifyRequest<{ 
    Body: { 
      partner_ids?: string[]; 
      min_amount_cents?: number;
      currency?: string;
    } 
  }>,
  reply: FastifyReply
) {
  const { partner_ids, min_amount_cents = 5000, currency = 'USD' } = request.body;

  try {
    // Get pending payouts
    let pendingPayouts = await referralCommissionService.getPendingPayouts(min_amount_cents);

    // Filter by partner IDs if specified
    if (partner_ids && partner_ids.length > 0) {
      pendingPayouts = pendingPayouts.filter(payout => 
        partner_ids.includes(payout.partner_id)
      );
    }

    if (pendingPayouts.length === 0) {
      return reply.code(400).send({ 
        error: 'No eligible payouts found',
        min_amount_cents,
        currency
      });
    }

    // Create payout batch
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalAmountCents = pendingPayouts.reduce((sum, payout) => sum + payout.total_commission_cents, 0);
    const allCommissionIds = pendingPayouts.flatMap(payout => payout.commission_ids);

    const batchResult = await pool.query(`
      INSERT INTO referral_payout_batches (
        id, total_amount_cents, currency, partner_count, commission_ids
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [batchId, totalAmountCents, currency, pendingPayouts.length, allCommissionIds]);

    // Update commissions to processing status
    await pool.query(`
      UPDATE referral_commissions 
      SET payout_batch_id = $1, updated_at = NOW()
      WHERE id = ANY($2)
    `, [batchId, allCommissionIds]);

    return reply.send({
      success: true,
      payout_batch: {
        ...batchResult.rows[0],
        payouts: pendingPayouts
      }
    });

  } catch (error) {
    console.error('[AdminReferrals] Failed to create payout batch:', error);
    return reply.code(500).send({ error: 'Failed to create payout batch' });
  }
}

async function getPayoutBatches(
  request: FastifyRequest<{ 
    Querystring: { 
      page?: number; 
      limit?: number; 
      status?: string;
    } 
  }>,
  reply: FastifyReply
) {
  const { page = 1, limit = 50, status } = request.query;
  const offset = (page - 1) * limit;

  try {
    let whereClause = '';
    const params: any[] = [limit, offset];
    
    if (status) {
      whereClause = 'WHERE status = $3';
      params.push(status);
    }

    const result = await pool.query(`
      SELECT *
      FROM referral_payout_batches
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    return reply.send({
      payout_batches: result.rows,
      pagination: {
        current_page: page,
        per_page: limit
      }
    });

  } catch (error) {
    console.error('[AdminReferrals] Failed to get payout batches:', error);
    return reply.code(500).send({ error: 'Failed to get payout batches' });
  }
}

// =====================================================
// FRAUD MONITORING
// =====================================================

async function getFraudAlerts(
  request: FastifyRequest<{ Querystring: { days?: number } }>,
  reply: FastifyReply
) {
  const { days = 7 } = request.query;

  try {
    const result = await pool.query(`
      SELECT 
        rts.*,
        rp.partner_code,
        rp.company_name,
        u.email as partner_email,
        COUNT(DISTINCT r.id) as actual_referrals
      FROM referral_tracking_sessions rts
      JOIN referral_partners rp ON rts.partner_id = rp.id
      JOIN auth.users u ON rp.user_id = u.id
      LEFT JOIN referrals r ON rp.id = r.partner_id 
        AND r.referrer_ip_address = rts.ip_address
      WHERE rts.is_suspicious = true
        AND rts.last_seen >= CURRENT_DATE - INTERVAL '$1 days'
      GROUP BY rts.id, rp.partner_code, rp.company_name, u.email
      ORDER BY rts.last_seen DESC
    `, [days]);

    return reply.send({
      fraud_alerts: result.rows.map((row: any) => ({
        ...row,
        actual_referrals: parseInt(row.actual_referrals || '0')
      }))
    });

  } catch (error) {
    console.error('[AdminReferrals] Failed to get fraud alerts:', error);
    return reply.code(500).send({ error: 'Failed to get fraud alerts' });
  }
}

// =====================================================
// ROUTE REGISTRATION
// =====================================================

export function registerAdminReferralRoutes(app: FastifyInstance) {
  console.log('[AdminReferrals] Registering admin referral management routes...');

  // GET /v1/admin/referrals/overview - Admin dashboard overview
  app.get<{ Querystring: { days?: number } }>(
    '/v1/admin/referrals/overview',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'number', minimum: 1, maximum: 365 }
          }
        }
      }
    },
    getAdminOverview
  );

  // GET /v1/admin/referrals/partners - Get all partners with filters
  app.get<{ 
    Querystring: { 
      page?: number; 
      limit?: number; 
      status?: 'active' | 'paused' | 'suspended';
      search?: string;
    } 
  }>(
    '/v1/admin/referrals/partners',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1 },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            status: { type: 'string', enum: ['active', 'paused', 'suspended'] },
            search: { type: 'string', maxLength: 100 }
          }
        }
      }
    },
    getAllPartners
  );

  // PUT /v1/admin/referrals/partners/:partnerId/status - Update partner status
  app.put<{ 
    Params: { partnerId: string }; 
    Body: { status: 'active' | 'paused' | 'suspended'; reason?: string } 
  }>(
    '/v1/admin/referrals/partners/:partnerId/status',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        params: {
          type: 'object',
          properties: {
            partnerId: { type: 'string', format: 'uuid' }
          },
          required: ['partnerId']
        },
        body: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'paused', 'suspended'] },
            reason: { type: 'string', maxLength: 500 }
          },
          required: ['status']
        }
      }
    },
    updatePartnerStatus
  );

  // GET /v1/admin/referrals/commissions/pending - Get pending commissions
  app.get<{ 
    Querystring: { 
      page?: number; 
      limit?: number;
      partner_id?: string;
      min_amount?: number;
    } 
  }>(
    '/v1/admin/referrals/commissions/pending',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1 },
            limit: { type: 'number', minimum: 1, maximum: 500 },
            partner_id: { type: 'string', format: 'uuid' },
            min_amount: { type: 'number', minimum: 0 }
          }
        }
      }
    },
    getPendingCommissions
  );

  // POST /v1/admin/referrals/commissions/approve - Approve commissions
  app.post<{ Body: { commission_ids: string[] } }>(
    '/v1/admin/referrals/commissions/approve',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        body: {
          type: 'object',
          properties: {
            commission_ids: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              minItems: 1,
              maxItems: 1000
            }
          },
          required: ['commission_ids']
        }
      }
    },
    approveCommissions
  );

  // POST /v1/admin/referrals/payouts/batch - Create payout batch
  app.post<{ 
    Body: { 
      partner_ids?: string[]; 
      min_amount_cents?: number;
      currency?: string;
    } 
  }>(
    '/v1/admin/referrals/payouts/batch',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        body: {
          type: 'object',
          properties: {
            partner_ids: {
              type: 'array',
              items: { type: 'string', format: 'uuid' }
            },
            min_amount_cents: { type: 'number', minimum: 100 },
            currency: { type: 'string', enum: ['USD', 'EUR', 'GBP'] }
          }
        }
      }
    },
    createPayoutBatch
  );

  // GET /v1/admin/referrals/payouts/batches - Get payout batches
  app.get<{ 
    Querystring: { 
      page?: number; 
      limit?: number; 
      status?: string;
    } 
  }>(
    '/v1/admin/referrals/payouts/batches',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1 },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] }
          }
        }
      }
    },
    getPayoutBatches
  );

  // GET /v1/admin/referrals/fraud/alerts - Get fraud alerts
  app.get<{ Querystring: { days?: number } }>(
    '/v1/admin/referrals/fraud/alerts',
    {
      preHandler: hmacMiddleware as any,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'number', minimum: 1, maximum: 90 }
          }
        }
      }
    },
    getFraudAlerts
  );

  console.log('[AdminReferrals] Admin referral management routes registered successfully');
}