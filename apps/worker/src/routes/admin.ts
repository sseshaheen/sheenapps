/**
 * Admin Panel API Routes
 * 
 * Provides comprehensive admin functionality with security-first approach:
 * - JWT-based authentication with granular permissions
 * - Mandatory reason headers for sensitive operations  
 * - Comprehensive audit logging with trigger-based system
 * - Row Level Security policies
 * - Control center dashboard with key KPIs
 * - User management with search and actions
 * - Advisor approval workflow
 * - Support ticket management
 * - Financial oversight with guarded operations
 * - Trust & safety features
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdminAuth, requireUserManagement, requireAdvisorManagement, requireFinancialAccess, requireSupportAccess } from '../middleware/adminAuthentication';
import { correlationIdMiddleware, withCorrelationId, adminErrorResponse } from '../middleware/correlationIdMiddleware';
import { enforceReason } from '../middleware/reasonEnforcement';
import { makeRequestHashFromRequest } from '../utils/requestHash';
import { getIdempotencyKey } from '../utils/requestHeaders';
import { parsePage } from '../utils/pagination';
import { StripeProvider } from '../services/payment/StripeProvider';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import { randomUUID } from 'crypto';
import { setupIdempotencyCache, safeParsePayload, sendAdminOk } from './admin/_utils';

const loggingService = ServerLoggingService.getInstance();

// Idempotency cache initialized per-instance in registerAdminRoutes
let idempotencyCache: ReturnType<typeof setupIdempotencyCache> | null = null;

// =====================================================
// Control Center Dashboard
// =====================================================

interface DashboardKPIs {
  open_tickets: number;
  due_2h: number;
  pending_advisors: number;
  revenue_today: number;
  build_errors_24h: number;
  critical_alerts: number;
}

// =====================================================
// Admin Routes Registration
// =====================================================

export async function registerAdminRoutes(fastify: FastifyInstance) {
  if (!pool) {
    console.warn('⚠️  Database connection not available - admin routes disabled');
    return;
  }

  // Initialize idempotency cache with proper lifecycle management
  idempotencyCache = setupIdempotencyCache(fastify);

  // Add correlation ID middleware to all admin routes
  fastify.addHook('preHandler', correlationIdMiddleware);

  // =====================================================
  // Control Center Dashboard
  // =====================================================

  /**
   * GET /v1/admin/dashboard
   * Control center with today's health and key KPIs
   */
  fastify.get('/v1/admin/dashboard', {
    preHandler: requireAdminAuth({ permissions: ['admin.read'] })
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Execute all KPI queries in parallel for performance
      const [
        ticketsResult,
        advisorsResult, 
        revenueResult,
        alertsResult
      ] = await Promise.all([
        // Tickets due soon and total open
        pool!.query(`
          SELECT 
            COUNT(*) FILTER (WHERE status IN ('open','in_progress') 
              AND COALESCE(sla_due_at, NOW() + INTERVAL '100 years') < NOW() + INTERVAL '2 hours') AS due_2h,
            COUNT(*) FILTER (WHERE status IN ('open','in_progress')) AS open_total
          FROM public.support_tickets
        `).catch(() => ({ rows: [{ due_2h: 0, open_total: 0 }] })),
        // Pending advisor applications
        pool!.query(`
          SELECT COUNT(*) AS pending_count FROM public.advisors WHERE approval_status = 'pending'
        `).catch(() => ({ rows: [{ pending_count: 0 }] })),
        // Revenue today (use date range for better index use)
        pool!.query(`
          SELECT COALESCE(SUM(amount_cents), 0) AS revenue_cents
          FROM public.billing_payments
          WHERE created_at >= CURRENT_DATE
            AND created_at < CURRENT_DATE + INTERVAL '1 day'
            AND status = 'succeeded'
        `).catch(() => ({ rows: [{ revenue_cents: 0 }] })),
        // Critical alerts count
        pool!.query(`
          SELECT COUNT(*) AS critical_count
          FROM public.admin_alerts
          WHERE severity = 'critical' AND resolved_at IS NULL
        `).catch(() => ({ rows: [{ critical_count: 0 }] }))
      ]);

      const kpis: DashboardKPIs = {
        open_tickets: parseInt(ticketsResult.rows[0]?.open_total || '0'),
        due_2h: parseInt(ticketsResult.rows[0]?.due_2h || '0'),
        pending_advisors: parseInt(advisorsResult.rows[0]?.pending_count || '0'),
        revenue_today: parseFloat(revenueResult.rows[0]?.revenue_cents || '0') / 100,
        build_errors_24h: 0, // TODO: Add build error tracking
        critical_alerts: parseInt(alertsResult.rows[0]?.critical_count || '0')
      };

      return sendAdminOk(request, reply, {
        kpis,
        health_status: {
          tickets: kpis.due_2h > 0 ? 'warning' : 'good',
          advisors: kpis.pending_advisors > 10 ? 'warning' : 'good',
          alerts: kpis.critical_alerts > 0 ? 'critical' : 'good'
        }
      });

    } catch (error) {
      await loggingService.logCriticalError('admin_dashboard_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Failed to load dashboard')
      );
    }
  });

  /**
   * GET /v1/admin/inhouse/eject-requests
   * List Easy Mode eject requests
   */
  fastify.get<{
    Querystring: {
      status?: string;
      limit?: string;
      offset?: string;
    };
  }>('/v1/admin/inhouse/eject-requests', {
    preHandler: requireAdminAuth({ permissions: ['admin.read'] })
  }, async (request, reply) => {
    try {
      const { status, limit, offset } = request.query;
      const parsedLimit = Math.min(Math.max(parseInt(limit || '50', 10), 1), 200);
      const parsedOffset = Math.max(parseInt(offset || '0', 10), 0);

      const countResult = await pool!.query(`
        SELECT COUNT(*)::int AS total
        FROM public.inhouse_eject_requests
        WHERE ($1::text IS NULL OR status = $1)
      `, [status || null]);

      const result = await pool!.query(`
        SELECT
          r.id,
          r.project_id,
          p.name AS project_name,
          r.user_id,
          u.email AS user_email,
          r.status,
          r.reason,
          r.details,
          r.created_at,
          r.updated_at,
          r.resolved_at
        FROM public.inhouse_eject_requests r
        LEFT JOIN public.projects p ON p.id = r.project_id
        LEFT JOIN auth.users u ON u.id = r.user_id
        WHERE ($1::text IS NULL OR r.status = $1)
        ORDER BY r.created_at DESC
        LIMIT $2 OFFSET $3
      `, [status || null, parsedLimit, parsedOffset]);

      return reply.send(withCorrelationId({
        success: true,
        data: {
          requests: result.rows,
          total: countResult.rows[0]?.total || 0,
          limit: parsedLimit,
          offset: parsedOffset
        }
      }, request));
    } catch (error) {
      await loggingService.logCriticalError('admin_inhouse_eject_requests_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Failed to load eject requests')
      );
    }
  });

  // =====================================================
  // User Management
  // =====================================================

  /**
   * GET /v1/admin/users
   * Search and list users with filtering
   */
  fastify.get<{
    Querystring: {
      search?: string;
      status?: 'active' | 'suspended' | 'banned';
      exclude_admin_users?: boolean;
      exclude_advisor_users?: boolean;
      limit?: number;
      offset?: number;
    }
  }>('/v1/admin/users', {
    preHandler: requireUserManagement()
  }, async (request, reply) => {
    try {
      const query = request.query;
      const search = (query.search && String(query.search) !== 'undefined') ? query.search : undefined;
      const status = (query.status && String(query.status) !== 'undefined') ? query.status : undefined;
      const exclude_admin_users = (query.exclude_admin_users && String(query.exclude_admin_users) === 'true');
      const exclude_advisor_users = (query.exclude_advisor_users && String(query.exclude_advisor_users) === 'true');

      // Parse and clamp pagination parameters (max 200 limit)
      const { limit, offset } = parsePage(query);

      let whereConditions = ['1=1'];
      let filterParams: any[] = [];

      // Add search filter
      if (search) {
        const paramIndex = filterParams.length + 1;
        whereConditions.push(`
          (
            u.email ILIKE $${paramIndex}
            OR COALESCE(u.raw_user_meta_data->>'full_name', '') ILIKE $${paramIndex}
          )
        `);
        filterParams.push(`%${search}%`);
      }

      // Add status filter
      if (status === 'suspended') {
        whereConditions.push('u.banned_until > NOW()');
      } else if (status === 'banned') {
        whereConditions.push('u.banned_until IS NOT NULL AND u.banned_until > NOW() + INTERVAL \'1 year\'');
      } else if (status === 'active') {
        whereConditions.push('(u.banned_until IS NULL OR u.banned_until < NOW())');
      }

      // Add admin exclusion filter
      if (exclude_admin_users) {
        whereConditions.push(`
          NOT (
            -- Exclude users with explicit admin flags (null-safe)
            COALESCE((u.raw_app_meta_data->>'is_admin')::boolean, false) = true
            OR COALESCE(u.raw_app_meta_data->>'role', '') IN ('admin', 'super_admin')
            OR (u.raw_app_meta_data ? 'admin_permissions' AND u.raw_app_meta_data->'admin_permissions' IS NOT NULL)
          )
        `);
      }

      // Add advisor exclusion filter
      if (exclude_advisor_users) {
        whereConditions.push(`
          NOT (
            -- Exclude users with advisor roles (null-safe)
            COALESCE(u.raw_app_meta_data->>'role', '') = 'advisor'
            OR COALESCE(u.raw_user_meta_data->>'role', '') = 'advisor'
            -- Exclude users who have advisor profiles
            OR EXISTS (
              SELECT 1 FROM public.advisors a
              WHERE a.user_id = u.id
            )
          )
        `);
      }

      // Get total count using ONLY filter params (no limit/offset)
      const countResult = await pool!.query(`
        SELECT COUNT(*) as total
        FROM auth.users u
        LEFT JOIN user_admin_status uas ON uas.user_id = u.id
        WHERE ${whereConditions.join(' AND ')}
      `, filterParams);

      const total = parseInt(countResult.rows[0]?.total || '0');

      // Create paged params array for data query
      const pagedParams = [...filterParams, limit, offset];

      const result = await pool!.query(`
        SELECT 
          u.id, u.email, u.created_at, u.updated_at, u.last_sign_in_at,
          u.raw_user_meta_data->>'full_name' as full_name,
          u.raw_user_meta_data->>'role' as role,
          COALESCE(uas.is_suspended, false) as is_suspended,
          COALESCE(uas.is_banned, false) as is_banned,
          uas.suspended_until,
          CASE 
            WHEN COALESCE(uas.is_banned, false) = true THEN 'banned'
            WHEN COALESCE(uas.is_suspended, false) = true AND uas.suspended_until > NOW() THEN 'suspended'
            ELSE 'active'
          END as status,
          bc.provider_customer_id as stripe_customer_id,
          bs.status as subscription_status
        FROM auth.users u
        LEFT JOIN user_admin_status uas ON uas.user_id = u.id
        LEFT JOIN billing_customers bc ON bc.user_id = u.id
        LEFT JOIN billing_subscriptions bs ON bs.customer_id = bc.id AND bs.status = 'active'
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY u.created_at DESC
        LIMIT $${pagedParams.length - 1} OFFSET $${pagedParams.length}
      `, pagedParams);

      return reply.send(
        withCorrelationId({
          success: true,
          users: result.rows,
          pagination: {
            limit,
            offset,
            returned: result.rows.length,
            total
          },
          filters: { search, status }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_users_list_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch users' }
      });
    }
  });

  /**
   * PUT /v1/admin/users/:id/status
   * Update user status (suspend, ban, activate)
   */
  fastify.put<{
    Params: { id: string };
    Body: {
      action: 'suspend' | 'ban' | 'activate';
      duration?: string; // ISO duration for temporary suspensions
      reason: string;
    }
  }>('/v1/admin/users/:id/status', {
    preHandler: requireUserManagement()
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { action, duration, reason } = request.body;
      const adminClaims = (request as any).adminClaims;

      if (!reason) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Reason is required for user status changes' }
        });
      }

      let is_suspended = false;
      let is_banned = false;
      let suspended_until: Date | null = null;

      switch (action) {
        case 'suspend':
          is_suspended = true;
          if (duration) {
            const durationMs = parseDuration(duration);
            suspended_until = new Date(Date.now() + durationMs);
          } else {
            suspended_until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
          }
          break;
        case 'ban':
          is_banned = true;
          is_suspended = false;
          suspended_until = null;
          break;
        case 'activate':
          is_suspended = false;
          is_banned = false;
          suspended_until = null;
          break;
      }

      // Insert or update user_admin_status
      const result = await pool!.query(`
        INSERT INTO user_admin_status (
          user_id, is_suspended, suspended_until, suspension_reason, 
          is_banned, ban_reason, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          is_suspended = EXCLUDED.is_suspended,
          suspended_until = EXCLUDED.suspended_until,
          suspension_reason = EXCLUDED.suspension_reason,
          is_banned = EXCLUDED.is_banned,
          ban_reason = EXCLUDED.ban_reason,
          updated_at = NOW()
        RETURNING user_id, is_suspended, suspended_until, is_banned
      `, [id, is_suspended, suspended_until, reason, is_banned, action === 'ban' ? reason : null]);

      // Get user email for response
      const userResult = await pool!.query(`
        SELECT id, email FROM auth.users WHERE id = $1
      `, [id]);

      if (userResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' }
        });
      }

      const user = userResult.rows[0];
      const statusUpdate = result.rows[0];

      return reply.send({
        success: true,
        message: `User ${action}ed successfully`,
        user: {
          ...user,
          ...statusUpdate
        },
        admin_action: {
          admin_id: adminClaims.userId,
          reason,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      await loggingService.logCriticalError('admin_user_status_update_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId,
        target_user: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update user status' }
      });
    }
  });

  // =====================================================
  // Advisor Management
  // =====================================================

  /**
   * GET /v1/admin/advisors/applications
   * List advisor applications with filtering
   */
  fastify.get<{
    Querystring: {
      status?: 'pending' | 'approved' | 'rejected';
      limit?: number;
      offset?: number;
    }
  }>('/v1/admin/advisors/applications', {
    preHandler: requireAdvisorManagement()
  }, async (request, reply) => {
    try {
      const { status = 'pending', limit = 50, offset = 0 } = request.query;

      // Get total count for pagination
      const countResult = await pool!.query(`
        SELECT COUNT(*) as total
        FROM advisors a
        WHERE a.approval_status = $1
      `, [status]);

      const total = parseInt(countResult.rows[0]?.total || '0');

      const result = await pool!.query(`
        SELECT 
          a.id, a.display_name, a.bio, a.skills, a.specialties, a.languages,
          a.country_code, a.cal_com_event_type_url, a.approval_status,
          a.created_at, u.email,
          EXTRACT(EPOCH FROM NOW() - a.created_at) / 3600 as hours_pending
        FROM advisors a
        JOIN auth.users u ON u.id = a.user_id
        WHERE a.approval_status = $1
        ORDER BY a.created_at ASC
        LIMIT $2 OFFSET $3
      `, [status, limit, offset]);

      return reply.send(
        withCorrelationId({
          success: true,
          applications: result.rows,
          pagination: {
            limit,
            offset,
            returned: result.rows.length,
            total
          },
          filters: { status }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_advisor_applications_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch advisor applications' }
      });
    }
  });

  /**
   * PUT /v1/admin/advisors/:id/approval
   * Approve or reject advisor application
   */
  fastify.put<{
    Params: { id: string };
    Body: {
      action: 'approve' | 'reject';
      reason: string;
      notes?: string;
    }
  }>('/v1/admin/advisors/:id/approval', {
    preHandler: requireAdvisorManagement()
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { action, reason, notes } = request.body;
      const adminClaims = (request as any).adminClaims;

      if (!reason) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Reason is required for advisor approval decisions' }
        });
      }

      const approval_status = action === 'approve' ? 'approved' : 'rejected';
      const approved_at = action === 'approve' ? new Date() : null;

      const result = await pool!.query(`
        UPDATE advisors 
        SET 
          approval_status = $1,
          approved_at = $2,
          rejection_reason = $3,
          admin_notes = $4,
          updated_at = NOW()
        WHERE id = $5
        RETURNING id, display_name, approval_status, approved_at
      `, [approval_status, approved_at, action === 'reject' ? reason : null, notes, id]);

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Advisor application not found' }
        });
      }

      const advisor = result.rows[0];

      // Log admin action with new audit system
      await pool!.query(`
        SELECT rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
      `, [
        adminClaims.userId,
        action === 'approve' ? 'advisor.approve' : 'advisor.reject',
        'advisor',
        id,
        reason,
        request.correlationId,
        JSON.stringify({
          advisor_name: advisor.display_name,
          admin_notes: notes || null,
          previous_status: 'pending'
        })
      ]);

      // TODO: Send notification email to advisor

      return reply.send(
        withCorrelationId({
          success: true,
          message: `Advisor application ${action}ed successfully`,
          advisor: advisor,
          admin_action: {
            admin_id: adminClaims.userId,
            action,
            reason,
            notes,
            timestamp: new Date().toISOString()
          }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_advisor_approval_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId,
        advisor_id: request.params.id
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update advisor approval status' }
      });
    }
  });

  // =====================================================
  // Support Ticket Management  
  // =====================================================

  /**
   * GET /v1/admin/support/tickets
   * List support tickets with filtering and SLA tracking
   */
  fastify.get<{
    Querystring: {
      status?: 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';
      priority?: 'urgent' | 'high' | 'medium' | 'low';
      assigned_to?: string;
      limit?: number;
      offset?: number;
    }
  }>('/v1/admin/support/tickets', {
    preHandler: requireSupportAccess()
  }, async (request, reply) => {
    try {
      const { status, priority, assigned_to, limit = 50, offset = 0 } = request.query;

      let whereConditions = ['1=1'];
      let filterParams: any[] = [];

      if (status) {
        whereConditions.push(`t.status = $${filterParams.length + 1}`);
        filterParams.push(status);
      }

      if (priority) {
        whereConditions.push(`t.priority = $${filterParams.length + 1}`);
        filterParams.push(priority);
      }

      if (assigned_to) {
        whereConditions.push(`t.assigned_to = $${filterParams.length + 1}`);
        filterParams.push(assigned_to);
      }

      // Get total count using ONLY filter params (no limit/offset)
      const countResult = await pool!.query(`
        SELECT COUNT(*) as total
        FROM support_tickets t
        WHERE ${whereConditions.join(' AND ')}
      `, filterParams);

      const total = parseInt(countResult.rows[0]?.total || '0');

      // Calculate SLA metrics using filter params only
      const slaMetricsResult = await pool!.query(`
        WITH ticket_metrics AS (
          SELECT 
            -- Average first response time (in hours)
            AVG(
              CASE 
                WHEN t.first_response_at IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (t.first_response_at - t.created_at)) / 3600
                ELSE NULL
              END
            ) as avg_first_response_hours,
            
            -- Average resolution time (in hours) 
            AVG(
              CASE 
                WHEN t.status IN ('resolved', 'closed') AND t.resolved_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600
                ELSE NULL
              END
            ) as avg_resolution_hours,
            
            -- SLA compliance rate
            COUNT(
              CASE 
                WHEN t.sla_due_at IS NOT NULL AND t.resolved_at IS NOT NULL 
                     AND t.resolved_at <= t.sla_due_at 
                THEN 1 
                ELSE NULL 
              END
            )::FLOAT / 
            NULLIF(
              COUNT(
                CASE 
                  WHEN t.sla_due_at IS NOT NULL 
                  THEN 1 
                  ELSE NULL 
                END
              ), 0
            ) * 100 as sla_compliance_rate,
            
            -- Count of breached tickets
            COUNT(
              CASE 
                WHEN t.sla_due_at IS NOT NULL AND t.sla_due_at < NOW() 
                     AND t.status NOT IN ('resolved', 'closed')
                THEN 1 
                ELSE NULL 
              END
            ) as currently_breached_count
            
          FROM support_tickets t
          WHERE ${whereConditions.join(' AND ')}
        )
        SELECT 
          COALESCE(avg_first_response_hours, 0) as avg_response_time,
          COALESCE(avg_resolution_hours, 0) as avg_resolution_time,
          COALESCE(sla_compliance_rate, 100) as sla_compliance_rate,
          COALESCE(currently_breached_count, 0) as breached_tickets
        FROM ticket_metrics
      `, filterParams);

      const slaMetrics = slaMetricsResult.rows[0] || {
        avg_response_time: 0,
        avg_resolution_time: 0,
        sla_compliance_rate: 100,
        breached_tickets: 0
      };

      // Create paged params array for data query
      const pagedParams = [...filterParams, limit, offset];

      const result = await pool!.query(`
        SELECT
          t.id, t.ticket_number, t.subject, t.category, t.priority, t.status,
          t.created_at, t.updated_at, t.sla_due_at,
          CASE
            WHEN t.sla_due_at IS NOT NULL AND t.sla_due_at < NOW() THEN true
            ELSE false
          END as sla_breached,
          EXTRACT(EPOCH FROM t.sla_due_at - NOW()) / 3600 as hours_until_due,
          u.email as user_email,
          a.email as assigned_to_email,
          (
            SELECT COUNT(*)
            FROM support_ticket_messages stm
            WHERE stm.ticket_id = t.id AND stm.is_internal = false
          ) as message_count,
          -- Add response and resolution times for individual tickets
          CASE
            WHEN t.first_response_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (t.first_response_at - t.created_at)) / 3600
            ELSE NULL
          END as response_time_hours,
          CASE
            WHEN t.resolved_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600
            ELSE NULL
          END as resolution_time_hours
        FROM support_tickets t
        LEFT JOIN auth.users u ON u.id = t.user_id
        LEFT JOIN auth.users a ON a.id = t.assigned_to
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY
          CASE WHEN t.sla_due_at < NOW() THEN 0 ELSE 1 END,
          t.priority = 'urgent' DESC,
          t.priority = 'high' DESC,
          t.created_at ASC
        LIMIT $${pagedParams.length - 1} OFFSET $${pagedParams.length}
      `, pagedParams);

      return reply.send(
        withCorrelationId({
          success: true,
          tickets: result.rows,
          sla_metrics: {
            avg_response_time: parseFloat(slaMetrics.avg_response_time).toFixed(2) + ' hours',
            avg_resolution_time: parseFloat(slaMetrics.avg_resolution_time).toFixed(2) + ' hours',
            sla_compliance_rate: parseFloat(slaMetrics.sla_compliance_rate).toFixed(1) + '%',
            breached_tickets: parseInt(slaMetrics.breached_tickets)
          },
          pagination: {
            limit,
            offset,
            returned: result.rows.length,
            total
          },
          filters: { status, priority, assigned_to }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_support_tickets_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch support tickets' }
      });
    }
  });

  // =====================================================
  // Financial Management
  // =====================================================

  /**
   * GET /v1/admin/finance/overview
   * Financial overview and key metrics
   */
  fastify.get('/v1/admin/finance/overview', {
    preHandler: requireFinancialAccess()
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [
        todayRevenueResult,
        monthRevenueResult,
        pendingPayoutsResult,
        refundRequestsResult
      ] = await Promise.all([
        // Today's revenue (date range for better index use)
        pool!.query(`
          SELECT COALESCE(SUM(amount_cents), 0) as revenue_cents
          FROM billing_payments
          WHERE created_at >= CURRENT_DATE
            AND created_at < CURRENT_DATE + INTERVAL '1 day'
            AND status = 'succeeded'
        `),
        // This month's revenue (date range for better index use)
        pool!.query(`
          SELECT COALESCE(SUM(amount_cents), 0) as revenue_cents
          FROM billing_payments
          WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
            AND created_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
            AND status = 'succeeded'
        `),
        // Pending payouts
        pool!.query(`
          SELECT COUNT(*) as count, COALESCE(SUM(total_earnings_cents), 0) as total_amount_cents
          FROM advisor_payouts
          WHERE status = 'pending'
        `),
        // Recent refund requests (placeholder - adjust based on actual refund tracking)
        pool!.query(`
          SELECT COUNT(*) as count
          FROM billing_invoices
          WHERE status = 'refund_requested'
            AND created_at > NOW() - INTERVAL '7 days'
        `)
      ]);

      return sendAdminOk(request, reply, {
        overview: {
          revenue_today: parseFloat(todayRevenueResult.rows[0]?.revenue_cents || '0') / 100,
          revenue_month: parseFloat(monthRevenueResult.rows[0]?.revenue_cents || '0') / 100,
          pending_payouts: {
            count: parseInt(pendingPayoutsResult.rows[0]?.count || '0'),
            total_amount: parseFloat(pendingPayoutsResult.rows[0]?.total_amount_cents || '0') / 100
          },
          refund_requests: parseInt(refundRequestsResult.rows[0]?.count || '0')
        }
      });

    } catch (error) {
      await loggingService.logCriticalError('admin_finance_overview_error', error as Error, {
        admin_user: (request as any).adminClaims?.userId
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to load financial overview' }
      });
    }
  });

  /**
   * POST /v1/admin/finance/refunds
   * Process refund with mandatory reason and audit trail
   */
  fastify.post<{
    Body: {
      invoice_id: string;
      amount?: number; // Optional partial refund
      reason: string;
      notify_user?: boolean;
    }
  }>('/v1/admin/finance/refunds', {
    preHandler: [requireFinancialAccess(), enforceReason]
  }, async (request, reply) => {
    try {
      const { invoice_id, amount, reason, notify_user = true } = request.body;
      const adminClaims = (request as any).adminClaims;
      
      // Use same UUID for API header, DB, and Stripe (expert requirement)
      const correlationId = request.correlationId;
      const idempotencyKey = getIdempotencyKey(request, correlationId);
      
      // Step 1: Check in-memory cache first for fast dedupe response
      const cachedResponse = idempotencyCache?.get(idempotencyKey);
      if (cachedResponse) {
        return reply.send(cachedResponse);
      }
      
      // Step 2: Generate request hash for database idempotency
      const requestHash = makeRequestHashFromRequest(request);

      // Step 3: Atomic database idempotency claim
      const idempotencyResult = await pool!.query(`
        SELECT claim_idempotency($1, $2, $3, $4, $5, $6)
      `, [
        idempotencyKey,
        adminClaims.userId, 
        'refund.issue',
        'invoice',
        invoice_id,
        requestHash
      ]);

      if (!idempotencyResult.rows[0].claim_idempotency) {
        // Database-level duplicate detected
        return reply.send({
          success: true,
          deduped: true,
          correlation_id: correlationId,
          message: 'Request already processed'
        });
      }

      // Step 2: Get invoice details and determine amount
      const invoiceResult = await pool!.query(`
        SELECT
          bi.amount_paid,
          bi.stripe_payment_intent_id,
          bi.user_id,
          bc.stripe_customer_id
        FROM billing_invoices bi
        LEFT JOIN billing_customers bc ON bc.user_id = bi.user_id
        WHERE bi.id = $1
      `, [invoice_id]);

      if (invoiceResult.rows.length === 0) {
        return reply.code(404).send(
          adminErrorResponse(request, 'Invoice not found')
        );
      }

      const invoice = invoiceResult.rows[0];

      // Normalize to cents: amount_paid is already in cents (bigint from DB)
      // If amount provided in request, it's in dollars - convert to cents
      const invoiceAmountCents = Number(invoice.amount_paid);
      const requestedAmountCents = amount != null
        ? Math.round(Number(amount) * 100)
        : invoiceAmountCents;

      // Validate refund doesn't exceed invoice amount
      if (requestedAmountCents > invoiceAmountCents) {
        return reply.code(400).send(
          adminErrorResponse(request, 'Refund amount cannot exceed invoice amount')
        );
      }

      // Step 3: Check two-person approval requirement (>$500 = 50,000 cents)
      const TWO_PERSON_THRESHOLD_CENTS = 50_000;
      if (requestedAmountCents > TWO_PERSON_THRESHOLD_CENTS) {
        // Create two-person approval request (store amount in cents)
        const twoPersonResult = await pool!.query(`
          INSERT INTO admin_two_person_queue(
            action, resource_type, resource_id, payload, threshold,
            requested_by, correlation_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          'refund.issue',
          'invoice',
          invoice_id,
          JSON.stringify({ invoice_id, amount_cents: requestedAmountCents, reason, notify_user }),
          requestedAmountCents,
          adminClaims.userId,
          correlationId
        ]);

        // Log the two-person request
        await pool!.query(`
          SELECT rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
        `, [
          adminClaims.userId,
          'refund.request_approval',
          'invoice',
          invoice_id,
          `Refund request ($${(requestedAmountCents / 100).toFixed(2)}): ${reason}`,
          correlationId,
          JSON.stringify({
            two_person_queue_id: twoPersonResult.rows[0].id,
            threshold_cents: requestedAmountCents,
            requires_approval: true
          })
        ]);

        const approvalResponse = withCorrelationId({
          success: true,
          status: 'pending_approval',
          approval_id: twoPersonResult.rows[0].id,
          message: `Refund of $${(requestedAmountCents / 100).toFixed(2)} requires approval (threshold: $500)`,
          refund: {
            invoice_id,
            amount: requestedAmountCents / 100, // Return dollars to client
            amount_cents: requestedAmountCents, // Include cents for clarity
            reason,
            requested_by: adminClaims.userId,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          }
        }, request);

        // Cache response for idempotency
        idempotencyCache?.set(idempotencyKey, approvalResponse, correlationId);

        return reply.code(202).send(approvalResponse);
      }

      // Step 4: Process refund immediately (≤$500)
      let stripeRefundId = null;

      if (invoice.stripe_payment_intent_id) {
        try {
          const stripeProvider = new StripeProvider();

          // Use same idempotencyKey for Stripe API (expert requirement)
          const stripeRefund = await stripeProvider.createRefund({
            payment_intent: invoice.stripe_payment_intent_id,
            amount: requestedAmountCents, // Already in cents, no conversion needed
            reason: 'requested_by_customer',
            metadata: {
              admin_user_id: adminClaims.userId,
              correlation_id: correlationId,
              admin_reason: reason
            }
          }, idempotencyKey);
          
          stripeRefundId = stripeRefund.id;
          
        } catch (stripeError) {
          await loggingService.logCriticalError('stripe_refund_failed', stripeError as Error, {
            admin_user_id: adminClaims.userId,
            invoice_id,
            correlation_id: correlationId
          });
          
          return reply.code(500).send(
            adminErrorResponse(request, 'Stripe refund failed', (stripeError as Error).message)
          );
        }
      }

      // Step 5: Complete audit logging with Stripe ID
      await pool!.query(`
        SELECT rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
      `, [
        adminClaims.userId,
        'refund.issue',
        'invoice',
        invoice_id,
        `Refund processed: $${(requestedAmountCents / 100).toFixed(2)} - ${reason}`,
        correlationId,
        JSON.stringify({
          stripe_refund_id: stripeRefundId,
          amount_cents: requestedAmountCents,
          notify_user,
          processed_immediately: true
        })
      ]);

      const successResponse = withCorrelationId({
        success: true,
        message: 'Refund processed successfully',
        refund: {
          invoice_id,
          amount: requestedAmountCents / 100, // Return dollars to client
          amount_cents: requestedAmountCents, // Include cents for clarity
          reason,
          stripe_refund_id: stripeRefundId,
          processed_by: adminClaims.userId,
          processed_at: new Date().toISOString()
        }
      }, request);

      // Cache response for idempotency
      idempotencyCache?.set(idempotencyKey, successResponse, correlationId);

      return reply.send(successResponse);

    } catch (error) {
      await loggingService.logCriticalError('admin_refund_error', error as Error, {
        admin_user_id: (request as any).adminClaims?.userId,
        invoice_id: (request as any).body?.invoice_id,
        correlation_id: request.correlationId
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Failed to process refund')
      );
    }
  });

  // =====================================================
  // Two-Person Approval System
  // =====================================================

  /**
   * GET /v1/admin/approvals/pending
   * List all pending two-person approval requests
   */
  fastify.get('/v1/admin/approvals/pending', {
    preHandler: requireAdminAuth({ permissions: ['admin.read'] })
  }, async (request, reply) => {
    try {
      const pendingApprovals = await pool!.query(`
        SELECT 
          tpq.id,
          tpq.action,
          tpq.resource_type,
          tpq.resource_id,
          tpq.payload,
          tpq.threshold,
          tpq.requested_by,
          tpq.correlation_id,
          tpq.created_at,
          u.email as requested_by_email
        FROM admin_two_person_queue tpq
        LEFT JOIN auth.users u ON u.id = tpq.requested_by
        WHERE tpq.state = 'pending'
        ORDER BY tpq.created_at DESC
      `);

      return reply.send(
        withCorrelationId({
          success: true,
          pending_approvals: pendingApprovals.rows,
          count: pendingApprovals.rows.length
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_pending_approvals_error', error as Error, {
        correlation_id: request.correlationId
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Failed to load pending approvals')
      );
    }
  });

  /**
   * POST /v1/admin/approvals/:id/approve
   * Approve a pending two-person request
   */
  fastify.post<{
    Params: { id: string };
    Body: { reason: string };
  }>('/v1/admin/approvals/:id/approve', {
    preHandler: [requireAdminAuth({ permissions: ['admin.approve'] }), enforceReason]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { reason } = request.body;
      const adminClaims = (request as any).adminClaims;

      // Atomic approval operation
      const approvalResult = await pool!.query(`
        SELECT approve_two_person($1, $2, $3)
      `, [id, adminClaims.userId, reason]);

      if (!approvalResult.rows[0].approve_two_person) {
        return reply.code(400).send(
          adminErrorResponse(request, 'Approval failed - request not found, already processed, or same user')
        );
      }

      // Get the approved request details for processing
      const requestDetails = await pool!.query(`
        SELECT 
          tpq.action,
          tpq.resource_type, 
          tpq.resource_id,
          tpq.payload,
          tpq.threshold,
          tpq.requested_by,
          tpq.correlation_id
        FROM admin_two_person_queue tpq
        WHERE tpq.id = $1
      `, [id]);

      if (requestDetails.rows.length === 0) {
        return reply.code(404).send(
          adminErrorResponse(request, 'Approved request not found')
        );
      }

      const approvedRequest = requestDetails.rows[0];

      // Log the approval
      await pool!.query(`
        SELECT rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
      `, [
        adminClaims.userId,
        'two_person.approve',
        approvedRequest.resource_type,
        approvedRequest.resource_id,
        `Approved ${approvedRequest.action}: ${reason}`,
        request.correlationId,
        JSON.stringify({
          original_correlation_id: approvedRequest.correlation_id,
          threshold: approvedRequest.threshold,
          requested_by: approvedRequest.requested_by,
          original_action: approvedRequest.action
        })
      ]);

      // If this was a refund approval, process the refund now
      if (approvedRequest.action === 'refund.issue') {
        // Track invoice_id for error logging even if we fail mid-execution
        let invoiceIdForLogging = 'unknown';
        try {
          // Safely parse JSONB payload (may come as string depending on pg driver)
          interface RefundPayload {
            invoice_id: string
            amount_cents: number
            reason: string
            notify_user?: boolean
            executed_at?: string
            stripe_refund_id?: string
          }
          const payload = safeParsePayload<RefundPayload>(approvedRequest.payload);

          if (!payload?.invoice_id || !Number.isFinite(payload.amount_cents)) {
            return reply.code(400).send(adminErrorResponse(request, 'Invalid approval payload'));
          }
          invoiceIdForLogging = payload.invoice_id;

          // Idempotency guard: Check if already executed
          if (payload.executed_at || payload.stripe_refund_id) {
            // Already executed - return success without re-executing
            return reply.send(withCorrelationId({
              success: true,
              message: 'Refund already executed',
              approval: {
                id,
                action: approvedRequest.action,
                executed_at: payload.executed_at,
                stripe_refund_id: payload.stripe_refund_id
              }
            }, request));
          }

          const { invoice_id, amount_cents: amountCents, reason: originalReason, notify_user } = payload;

          // Mark as executing atomically (prevents concurrent execution)
          const lockResult = await pool!.query(`
            UPDATE admin_two_person_queue
            SET payload = payload || jsonb_build_object(
              'executing', true,
              'executing_by', $2::text,
              'executing_at', NOW()::text
            )
            WHERE id = $1
              AND state = 'approved'
              AND (payload->>'executing' IS NULL OR payload->>'executing' = 'false')
            RETURNING id
          `, [id, adminClaims.userId]);

          if (lockResult.rows.length === 0) {
            // Another request is executing or already executed
            return reply.send(withCorrelationId({
              success: true,
              message: 'Refund execution in progress or already completed'
            }, request));
          }

          // Get invoice details for Stripe processing
          const invoiceResult = await pool!.query(`
            SELECT
              bi.stripe_payment_intent_id,
              bc.stripe_customer_id
            FROM billing_invoices bi
            LEFT JOIN billing_customers bc ON bc.user_id = bi.user_id
            WHERE bi.id = $1
          `, [invoice_id]);

          let stripeRefundId = null;
          if (invoiceResult.rows.length > 0 && invoiceResult.rows[0].stripe_payment_intent_id) {
            const stripeProvider = new StripeProvider();

            // Use stable idempotency key (does not change across retries)
            const stableIdempotencyKey = `two_person_refund_${id}`;

            const stripeRefund = await stripeProvider.createRefund({
              payment_intent: invoiceResult.rows[0].stripe_payment_intent_id,
              amount: amountCents, // Already in cents, no conversion needed
              reason: 'requested_by_customer',
              metadata: {
                approval_id: id,
                admin_user_id: adminClaims.userId,
                correlation_id: request.correlationId,
                original_correlation_id: approvedRequest.correlation_id,
                admin_reason: originalReason,
                approver_reason: reason,
                two_person_approved: 'true'
              }
            }, stableIdempotencyKey);

            stripeRefundId = stripeRefund.id;

            // Store Stripe refund ID back in payload (transaction-safe record)
            await pool!.query(`
              UPDATE admin_two_person_queue
              SET payload = payload || jsonb_build_object(
                'stripe_refund_id', $2::text,
                'executed_at', NOW()::text,
                'executed_by', $3::text,
                'executing', false,
                'execution_status', 'executed'
              )
              WHERE id = $1
            `, [id, stripeRefundId, adminClaims.userId]);
          }

          // Log the actual refund execution
          await pool!.query(`
            SELECT rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
          `, [
            adminClaims.userId,
            'refund.issue',
            'invoice',
            invoice_id,
            `Executed approved refund: $${(amountCents / 100).toFixed(2)} - ${originalReason} | Approval: ${reason}`,
            request.correlationId,
            JSON.stringify({
              stripe_refund_id: stripeRefundId,
              amount_cents: amountCents,
              notify_user,
              two_person_approved: true,
              original_correlation_id: approvedRequest.correlation_id
            })
          ]);
          
        } catch (refundError) {
          // Clear the executing lock and record failure state
          await pool!.query(`
            UPDATE admin_two_person_queue
            SET payload = payload || jsonb_build_object(
              'executing', false,
              'execution_status', 'failed',
              'execution_failed_at', NOW()::text,
              'execution_error', $2::text
            )
            WHERE id = $1
          `, [id, refundError instanceof Error ? refundError.message : 'unknown']).catch(() => {
            // Swallow DB error to not mask the original refund error
          });

          // Log audit action for failure
          await pool!.query(`
            SELECT rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
          `, [
            adminClaims.userId,
            'refund.execution_failed',
            'invoice',
            invoiceIdForLogging,
            `Approved refund failed to execute: ${refundError instanceof Error ? refundError.message : 'unknown'}`,
            request.correlationId,
            JSON.stringify({ approval_id: id })
          ]).catch(() => {
            // Swallow to not mask original error
          });

          await loggingService.logCriticalError('approved_refund_execution_failed', refundError as Error, {
            approval_id: id,
            correlation_id: request.correlationId,
            admin_user_id: adminClaims.userId
          });

          // Don't fail the approval - just log the refund failure
        }
      }

      return reply.send(
        withCorrelationId({
          success: true,
          message: 'Request approved and processed successfully',
          approval: {
            id,
            action: approvedRequest.action,
            approved_by: adminClaims.userId,
            approved_at: new Date().toISOString(),
            reason
          }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_approve_error', error as Error, {
        approval_id: request.params.id,
        admin_user_id: (request as any).adminClaims?.userId,
        correlation_id: request.correlationId
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Failed to process approval')
      );
    }
  });

  /**
   * POST /v1/admin/approvals/:id/reject
   * Reject a pending two-person request
   */
  fastify.post<{
    Params: { id: string };
    Body: { reason: string };
  }>('/v1/admin/approvals/:id/reject', {
    preHandler: [requireAdminAuth({ permissions: ['admin.approve'] }), enforceReason]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { reason } = request.body;
      const adminClaims = (request as any).adminClaims;

      // Atomic rejection operation
      const rejectionResult = await pool!.query(`
        SELECT reject_two_person($1, $2, $3)
      `, [id, adminClaims.userId, reason]);

      if (!rejectionResult.rows[0].reject_two_person) {
        return reply.code(400).send(
          adminErrorResponse(request, 'Rejection failed - request not found, already processed, or same user')
        );
      }

      // Get request details for logging
      const requestDetails = await pool!.query(`
        SELECT 
          action, resource_type, resource_id, correlation_id, requested_by
        FROM admin_two_person_queue
        WHERE id = $1
      `, [id]);

      if (requestDetails.rows.length > 0) {
        const rejectedRequest = requestDetails.rows[0];
        
        // Log the rejection
        await pool!.query(`
          SELECT rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
        `, [
          adminClaims.userId,
          'two_person.reject',
          rejectedRequest.resource_type,
          rejectedRequest.resource_id,
          `Rejected ${rejectedRequest.action}: ${reason}`,
          request.correlationId,
          JSON.stringify({
            original_correlation_id: rejectedRequest.correlation_id,
            requested_by: rejectedRequest.requested_by,
            original_action: rejectedRequest.action
          })
        ]);
      }

      return reply.send(
        withCorrelationId({
          success: true,
          message: 'Request rejected successfully',
          rejection: {
            id,
            rejected_by: adminClaims.userId,
            rejected_at: new Date().toISOString(),
            reason
          }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_reject_error', error as Error, {
        approval_id: request.params.id,
        admin_user_id: (request as any).adminClaims?.userId,
        correlation_id: request.correlationId
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Failed to process rejection')
      );
    }
  });
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Parse ISO 8601 duration string to milliseconds
 */
function parseDuration(duration: string): number {
  // Simple implementation for common durations
  // In production, use a proper ISO 8601 duration parser
  const match = duration.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 30 * 24 * 60 * 60 * 1000; // Default 30 days

  const days = parseInt(match[1] || '0');
  const hours = parseInt(match[2] || '0');
  const minutes = parseInt(match[3] || '0');

  return (days * 24 * 60 * 60 + hours * 60 * 60 + minutes * 60) * 1000;
}
