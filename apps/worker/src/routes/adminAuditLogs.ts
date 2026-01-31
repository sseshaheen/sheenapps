/**
 * Admin Audit Log Retrieval Routes
 * 
 * Provides comprehensive audit log access for admin panel:
 * - Query admin actions with filtering
 * - Support for date range queries
 * - Pagination for large result sets
 * - Secure access with permission checking
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAdminAuth } from '../middleware/adminAuthentication';
import { withCorrelationId, adminErrorResponse } from '../middleware/correlationIdMiddleware';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

interface AuditLogQueryParams {
  action?: string;
  admin_id?: string;
  resource_type?: string;
  resource_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

interface AuditLogEntry {
  id?: string;
  admin_user_id: string;
  admin_email?: string;
  action: string;
  resource_type: string;
  resource_id: string;
  reason?: string;
  extra: any;
  created_at: string;
  correlation_id?: string;
}

export default async function adminAuditLogRoutes(fastify: FastifyInstance) {
  
  /**
   * GET /v1/admin/audit/logs
   * Retrieve audit logs with filtering and pagination
   */
  fastify.get<{ Querystring: AuditLogQueryParams }>('/v1/admin/audit/logs', {
    preHandler: [requireAdminAuth({
      permissions: ['admin.audit', 'admin.elevated'],
      logActions: true
    })]
  }, async (request: FastifyRequest<{ Querystring: AuditLogQueryParams }>, reply: FastifyReply) => {
    try {
      const adminUser = (request as any).adminClaims;
      const {
        action,
        admin_id,
        resource_type,
        resource_id,
        from_date,
        to_date,
        limit = 50,
        offset = 0
      } = request.query;

      // Validate pagination limits
      const safeLimit = Math.min(Math.max(1, limit), 100);
      const safeOffset = Math.max(0, offset);

      // Build dynamic query
      let whereConditions: string[] = ['1=1'];
      let queryParams: any[] = [];
      let paramIndex = 1;

      if (action) {
        whereConditions.push(`al.action = $${paramIndex}`);
        queryParams.push(action);
        paramIndex++;
      }

      if (admin_id) {
        whereConditions.push(`al.admin_user_id = $${paramIndex}::uuid`);
        queryParams.push(admin_id);
        paramIndex++;
      }

      if (resource_type) {
        whereConditions.push(`al.resource_type = $${paramIndex}`);
        queryParams.push(resource_type);
        paramIndex++;
      }

      if (resource_id) {
        whereConditions.push(`al.resource_id = $${paramIndex}`);
        queryParams.push(resource_id);
        paramIndex++;
      }

      if (from_date) {
        whereConditions.push(`al.created_at >= $${paramIndex}::timestamp`);
        queryParams.push(from_date);
        paramIndex++;
      }

      if (to_date) {
        whereConditions.push(`al.created_at <= $${paramIndex}::timestamp`);
        queryParams.push(to_date);
        paramIndex++;
      }

      // Add pagination parameters
      queryParams.push(safeLimit);
      queryParams.push(safeOffset);

      const whereClause = whereConditions.join(' AND ');

      if (!pool) {
        throw new Error('Database pool not initialized');
      }

      // Query audit logs with admin email join
      const query = `
        SELECT 
          al.*,
          au.email as admin_email
        FROM public.admin_action_log_app al
        LEFT JOIN auth.users au ON al.admin_user_id = au.id
        WHERE ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const result = await pool.query(query, queryParams);

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as total
        FROM public.admin_action_log_app al
        WHERE ${whereClause}
      `;
      const countResult = await pool.query(countQuery, queryParams.slice(0, -2)); // Exclude limit/offset
      const totalCount = parseInt(countResult.rows[0]?.total || '0');

      // Format response
      const auditLogs: AuditLogEntry[] = result.rows.map(row => ({
        id: row.id,
        admin_user_id: row.admin_user_id,
        admin_email: row.admin_email,
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        reason: row.reason,
        extra: row.extra,
        created_at: row.created_at,
        correlation_id: row.correlation_id
      }));

      // Log successful audit log retrieval
      await loggingService.logServerEvent(
        'routing',
        'info',
        'Admin audit logs retrieved',
        {
          admin_user: adminUser.email,
          filters: {
            action,
            admin_id,
            resource_type,
            resource_id,
            from_date,
            to_date
          },
          results_count: auditLogs.length,
          total_count: totalCount
        }
      );

      return reply.send(
        withCorrelationId({
          success: true,
          logs: auditLogs,
          pagination: {
            limit: safeLimit,
            offset: safeOffset,
            total: totalCount,
            returned: auditLogs.length,
            has_more: (safeOffset + safeLimit) < totalCount
          },
          filters: {
            action,
            admin_id,
            resource_type,
            resource_id,
            from_date,
            to_date
          }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_audit_logs_retrieval_error', error as Error, {
        admin_user: (request as any).adminClaims?.email,
        query: request.query
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Failed to retrieve audit logs')
      );
    }
  });

  /**
   * GET /v1/admin/audit/logs/:id
   * Get detailed information about a specific audit log entry
   */
  fastify.get<{ Params: { id: string } }>('/v1/admin/audit/logs/:id', {
    preHandler: [requireAdminAuth({
      permissions: ['admin.audit', 'admin.elevated'],
      logActions: false
    })]
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      
      if (!pool) {
        throw new Error('Database pool not initialized');
      }

      const query = `
        SELECT 
          al.*,
          au.email as admin_email,
          au.raw_user_meta_data as admin_metadata
        FROM public.admin_action_log_app al
        LEFT JOIN auth.users au ON al.admin_user_id = au.id
        WHERE al.id = $1
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return reply.code(404).send(
          adminErrorResponse(request, 'Audit log entry not found')
        );
      }

      const auditLog = result.rows[0];

      return reply.send(
        withCorrelationId({
          success: true,
          log: {
            id: auditLog.id,
            admin_user_id: auditLog.admin_user_id,
            admin_email: auditLog.admin_email,
            admin_metadata: auditLog.admin_metadata,
            action: auditLog.action,
            resource_type: auditLog.resource_type,
            resource_id: auditLog.resource_id,
            reason: auditLog.reason,
            extra: auditLog.extra,
            created_at: auditLog.created_at,
            correlation_id: auditLog.correlation_id
          }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_audit_log_detail_error', error as Error, {
        admin_user: (request as any).adminClaims?.email,
        log_id: request.params.id
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Failed to retrieve audit log details')
      );
    }
  });

  /**
   * GET /v1/admin/audit/logs/stats/summary
   * Get audit log statistics and summary
   */
  fastify.get('/v1/admin/audit/logs/stats/summary', {
    preHandler: [requireAdminAuth({
      permissions: ['admin.audit', 'admin.elevated'],
      logActions: false
    })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!pool) {
        throw new Error('Database pool not initialized');
      }

      // Get summary statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total_actions,
          COUNT(DISTINCT admin_user_id) as unique_admins,
          COUNT(DISTINCT action) as unique_actions,
          COUNT(DISTINCT resource_type) as unique_resource_types,
          MIN(created_at) as earliest_log,
          MAX(created_at) as latest_log
        FROM public.admin_action_log_app
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `;

      const topActionsQuery = `
        SELECT 
          action,
          COUNT(*) as count
        FROM public.admin_action_log_app
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY action
        ORDER BY count DESC
        LIMIT 10
      `;

      const topAdminsQuery = `
        SELECT 
          al.admin_user_id,
          au.email as admin_email,
          COUNT(*) as action_count
        FROM public.admin_action_log_app al
        LEFT JOIN auth.users au ON al.admin_user_id = au.id
        WHERE al.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY al.admin_user_id, au.email
        ORDER BY action_count DESC
        LIMIT 10
      `;

      const [statsResult, topActionsResult, topAdminsResult] = await Promise.all([
        pool.query(statsQuery),
        pool.query(topActionsQuery),
        pool.query(topAdminsQuery)
      ]);

      return reply.send(
        withCorrelationId({
          success: true,
          summary: {
            period: '30_days',
            stats: statsResult.rows[0],
            top_actions: topActionsResult.rows,
            top_admins: topAdminsResult.rows
          }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_audit_log_stats_error', error as Error, {
        admin_user: (request as any).adminClaims?.email
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Failed to retrieve audit log statistics')
      );
    }
  });

  /**
   * GET /v1/admin/audit/alerts
   * Retrieve security alerts for admin panel security monitoring
   */
  fastify.get<{ 
    Querystring: {
      severity?: 'critical' | 'high' | 'medium' | 'low';
      resolved?: boolean;
      limit?: number;
      offset?: number;
    }
  }>('/v1/admin/audit/alerts', {
    preHandler: [requireAdminAuth({
      permissions: ['audit.read', 'security.read']
    })]
  }, async (request: FastifyRequest<{
    Querystring: {
      severity?: 'critical' | 'high' | 'medium' | 'low';
      resolved?: boolean;
      limit?: number;
      offset?: number;
    }
  }>, reply: FastifyReply) => {
    try {
      const adminUser = (request as any).adminClaims;
      const { severity, resolved, limit = 50, offset = 0 } = request.query;

      // Build WHERE conditions
      const conditions: string[] = ['1=1'];
      const params: any[] = [];
      
      if (severity) {
        conditions.push(`sal.severity = $${params.length + 1}`);
        params.push(severity);
      }
      
      if (resolved !== undefined) {
        if (resolved) {
          conditions.push(`sal.resolved_at IS NOT NULL`);
        } else {
          conditions.push(`sal.resolved_at IS NULL`);
        }
      }
      
      // Add limit and offset
      params.push(limit, offset);

      // Filter out system/migration events that aren't relevant for security monitoring
      const systemEventFilter = `
        AND sal.event_type NOT LIKE '%migration%'
        AND sal.event_type NOT LIKE '%phase%'
        AND sal.event_type NOT LIKE '%schema%'
        AND sal.event_type NOT LIKE '%policy%'
        AND sal.event_type NOT LIKE '%privilege%'
        AND sal.event_type NOT LIKE '%rls%'
        AND sal.event_type NOT IN (
          'emergency_rls_shield_applied',
          'dynamic_privileges_granted',
          'critical_missing_policies_fixed_corrected',
          'missing_privileges_granted'
        )
      `;

      // Query security alerts from security_audit_log
      const alertsQuery = `
        SELECT 
          sal.id,
          sal.user_id,
          sal.event_type,
          sal.severity,
          sal.details,
          sal.ip_address,
          sal.user_agent,
          sal.created_at,
          sal.resolved_at,
          sal.resolved_by,
          u.email as user_email
        FROM security_audit_log sal
        LEFT JOIN auth.users u ON u.id = sal.user_id
        WHERE ${conditions.join(' AND ')} ${systemEventFilter}
        ORDER BY 
          CASE sal.severity 
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
            ELSE 5
          END,
          sal.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;

      const alertsResult = await pool!.query(alertsQuery, params);

      // Format alerts according to frontend interface
      const formattedAlerts = alertsResult.rows.map(row => {
        // Map event types to frontend alert types
        let alertType: 'login_failure' | 'unusual_activity' | 'new_location' | 'security_breach' | 'rate_limit' = 'unusual_activity';
        let title = 'Security Alert';
        let description = row.event_type || 'Security event detected';
        
        // Enhanced alert mapping with better titles and descriptions
        if (row.event_type?.includes('login') || row.event_type?.includes('auth')) {
          alertType = 'login_failure';
          if (row.event_type === 'login_failure_repeated') {
            title = 'Repeated Login Failures';
            const attempts = row.details?.attempt_count || 'multiple';
            description = `${attempts} failed login attempts detected${row.user_email ? ' for ' + row.user_email : ''}`;
          } else {
            title = 'Authentication Issue';
            description = `Authentication problem detected${row.user_email ? ' for ' + row.user_email : ''}`;
          }
        } else if (row.event_type?.includes('rate') || row.event_type?.includes('limit')) {
          alertType = 'rate_limit';
          title = 'Rate Limit Exceeded';
          const requestCount = row.details?.requests_count || row.details?.attempt_count;
          const endpoint = row.details?.endpoint;
          description = `Rate limit exceeded${requestCount ? ` (${requestCount} requests)` : ''}${endpoint ? ` on ${endpoint}` : ''}${row.user_email ? ' by ' + row.user_email : ''}`;
        } else if (row.event_type?.includes('breach') || row.event_type?.includes('violation')) {
          alertType = 'security_breach';
          title = 'Security Breach Detected';
          const reason = row.details?.reason || 'Security violation';
          description = `${reason}${row.user_email ? ' affecting user ' + row.user_email : ''}`;
        } else if (row.event_type?.includes('location') || row.event_type?.includes('geo')) {
          alertType = 'new_location';
          title = 'New Location Access';
          const location = row.details?.location || 'unknown location';
          const previousLocation = row.details?.previous_location;
          description = `Access from ${location}${previousLocation ? ` (previously: ${previousLocation})` : ''}${row.user_email ? ' by ' + row.user_email : ''}`;
        } else if (row.event_type?.includes('suspicious') || row.event_type?.includes('anomaly')) {
          alertType = 'unusual_activity';
          title = 'Suspicious Activity';
          const pattern = row.details?.pattern || row.details?.type || 'Unusual behavior';
          const confidence = row.details?.confidence ? ` (confidence: ${Math.round(row.details.confidence * 100)}%)` : '';
          description = `${pattern} detected${confidence}${row.user_email ? ' for ' + row.user_email : ''}`;
        } else {
          // Default case for unrecognized event types
          title = row.event_type?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Security Event';
          description = row.details?.reason || row.details?.description || `Security event: ${row.event_type}`;
        }
        
        // Extract metadata from details JSONB
        const metadata: any = {};
        if (row.ip_address) metadata.ip_address = row.ip_address;
        if (row.user_email) metadata.user_email = row.user_email;
        if (row.details?.location) metadata.location = row.details.location;
        if (row.details?.attempt_count) metadata.attempt_count = row.details.attempt_count;
        if (row.details?.action_count) metadata.action_count = row.details.action_count;
        
        return {
          id: row.id.toString(),
          type: alertType,
          severity: row.severity || 'medium',
          title,
          description,
          timestamp: row.created_at,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          resolved: !!row.resolved_at
        };
      });

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as total
        FROM security_audit_log sal
        LEFT JOIN auth.users u ON u.id = sal.user_id
        WHERE ${conditions.join(' AND ')} ${systemEventFilter}
      `;
      
      const countResult = await pool!.query(countQuery, params.slice(0, -2));
      const totalCount = parseInt(countResult.rows[0]?.total || '0');

      // Log successful alerts retrieval
      await loggingService.logServerEvent(
        'routing',
        'info',
        'Security alerts retrieved',
        {
          admin_user: adminUser.email,
          filters: { severity, resolved },
          results_count: formattedAlerts.length,
          total_count: totalCount
        }
      );

      return reply.send(
        withCorrelationId({
          success: true,
          alerts: formattedAlerts,
          pagination: {
            limit,
            offset,
            total: totalCount,
            returned: formattedAlerts.length,
            has_more: (offset + limit) < totalCount
          }
        }, request)
      );

    } catch (error) {
      await loggingService.logCriticalError('admin_security_alerts_error', error as Error, {
        admin_user: (request as any).adminClaims?.email
      });

      return reply.code(500).send(
        adminErrorResponse(request, 'Failed to retrieve security alerts')
      );
    }
  });
}