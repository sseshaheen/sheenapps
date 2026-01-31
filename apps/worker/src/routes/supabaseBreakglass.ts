import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseBreakglassService } from '../services/supabaseBreakglassService';
import { SupabaseConnectionService } from '../services/supabaseConnectionService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { requireHmacSignature } from '../middleware/hmacValidation';

/**
 * Supabase Breakglass Recovery Admin Routes
 * 
 * ⚠️ EXTREME SECURITY RISK ⚠️ 
 * These routes handle plaintext token storage and retrieval
 * Only accessible by super_admin and breakglass_admin roles
 * All access is logged and audited
 */

interface CreateBreakglassRequest {
  userId: string;
  projectId: string;
  reason: string;
}

interface GetBreakglassRequest {
  userId: string;
  projectId: string;
  justification: string;
}

interface RevokeBreakglassRequest {
  userId: string;
  projectId: string;
  reason?: string;
}

// Middleware to verify admin permissions
async function verifyAdminPermissions(request: FastifyRequest, reply: FastifyReply) {
  // This should integrate with your existing admin authentication system
  // For now, check for admin headers or JWT token
  
  const adminId = request.headers['x-admin-id'] as string;
  const adminToken = request.headers['authorization'] as string;

  if (!adminId || !adminToken) {
    return reply.code(401).send({
      error: 'Admin authentication required',
      code: 'MISSING_ADMIN_AUTH'
    });
  }

  // Add admin info to request for downstream use
  (request as any).admin = {
    id: adminId,
    token: adminToken
  };
}

export async function supabaseBreakglassRoutes(fastify: FastifyInstance) {
  const breakglassService = SupabaseBreakglassService.getInstance();
  const connectionService = SupabaseConnectionService.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  // Apply HMAC validation and admin auth to all breakglass routes
  fastify.addHook('preHandler', requireHmacSignature());
  fastify.addHook('preHandler', verifyAdminPermissions);

  /**
   * POST /v1/admin/breakglass/create
   * Create breakglass recovery entry with plaintext tokens
   */
  fastify.post<{ Body: CreateBreakglassRequest }>(
    '/v1/admin/breakglass/create',
    async (request: FastifyRequest<{ Body: CreateBreakglassRequest }>, reply: FastifyReply) => {
      if (!breakglassService.isEnabled()) {
        return reply.code(503).send({
          error: 'Breakglass recovery is disabled',
          code: 'BREAKGLASS_DISABLED'
        });
      }

      const { userId, projectId, reason } = request.body;
      const adminId = (request as any).admin.id;

      if (!userId || !projectId || !reason) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'projectId', 'reason']
        });
      }

      try {
        // Get current connection and tokens
        const connection = await connectionService.getConnection(userId, projectId);
        if (!connection) {
          return reply.code(404).send({
            error: 'No active Supabase connection found',
            code: 'CONNECTION_NOT_FOUND'
          });
        }

        const tokens = await connectionService.getValidTokens(connection.id);
        const discovery = await connectionService.getStoredDiscovery(connection.id);

        const breakglassId = await breakglassService.createBreakglassRecovery(
          userId,
          projectId,
          tokens,
          discovery,
          reason,
          adminId
        );

        if (!breakglassId) {
          return reply.code(500).send({
            error: 'Failed to create breakglass recovery'
          });
        }

        await loggingService.logCriticalError(
          'admin_breakglass_created',
          new Error('Admin created breakglass recovery'),
          {
            breakglassId,
            userId,
            projectId,
            reason,
            adminId,
            warningLevel: 'EXTREME_SECURITY_RISK'
          }
        );

        reply.send({
          success: true,
          breakglassId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          warning: 'PLAINTEXT TOKENS STORED - EXTREME SECURITY RISK',
          createdBy: adminId,
          reason
        });

      } catch (error) {
        await loggingService.logCriticalError('admin_breakglass_creation_failed', error as Error, {
          userId,
          projectId,
          reason,
          adminId
        });

        reply.code(500).send({
          error: 'Failed to create breakglass recovery',
          details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
      }
    }
  );

  /**
   * GET /v1/admin/breakglass/credentials
   * Retrieve breakglass credentials (plaintext tokens)
   */
  fastify.get<{ Querystring: GetBreakglassRequest }>(
    '/v1/admin/breakglass/credentials',
    async (request: FastifyRequest<{ Querystring: GetBreakglassRequest }>, reply: FastifyReply) => {
      if (!breakglassService.isEnabled()) {
        return reply.code(503).send({
          error: 'Breakglass recovery is disabled',
          code: 'BREAKGLASS_DISABLED'
        });
      }

      const { userId, projectId, justification } = request.query;
      const adminId = (request as any).admin.id;

      if (!userId || !projectId || !justification) {
        return reply.code(400).send({
          error: 'Missing required parameters',
          required: ['userId', 'projectId', 'justification']
        });
      }

      try {
        const credentials = await breakglassService.getBreakglassCredentials(
          userId,
          projectId,
          adminId,
          justification
        );

        // Log this critical access
        await loggingService.logCriticalError(
          'admin_breakglass_accessed',
          new Error('Admin accessed breakglass credentials'),
          {
            userId,
            projectId,
            adminId,
            justification,
            accessCount: credentials.accessCount,
            warningLevel: 'PLAINTEXT_TOKEN_ACCESS'
          }
        );

        reply.send(credentials);

      } catch (error) {
        await loggingService.logCriticalError('admin_breakglass_access_failed', error as Error, {
          userId,
          projectId,
          adminId,
          justification
        });

        if ((error as Error).message.includes('Insufficient permissions')) {
          return reply.code(403).send({
            error: 'Insufficient permissions for breakglass access',
            code: 'INSUFFICIENT_PERMISSIONS'
          });
        }

        if ((error as Error).message.includes('No active breakglass')) {
          return reply.code(404).send({
            error: 'No active breakglass recovery found',
            code: 'BREAKGLASS_NOT_FOUND'
          });
        }

        reply.code(500).send({
          error: 'Failed to retrieve breakglass credentials',
          details: (error as Error).message
        });
      }
    }
  );

  /**
   * DELETE /v1/admin/breakglass/revoke
   * Revoke breakglass access
   */
  fastify.delete<{ Body: RevokeBreakglassRequest }>(
    '/v1/admin/breakglass/revoke',
    async (request: FastifyRequest<{ Body: RevokeBreakglassRequest }>, reply: FastifyReply) => {
      if (!breakglassService.isEnabled()) {
        return reply.code(503).send({
          error: 'Breakglass recovery is disabled',
          code: 'BREAKGLASS_DISABLED'
        });
      }

      const { userId, projectId, reason } = request.body;
      const adminId = (request as any).admin.id;

      if (!userId || !projectId) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'projectId']
        });
      }

      try {
        const revoked = await breakglassService.revokeBreakglassAccess(
          userId,
          projectId,
          adminId,
          reason
        );

        if (!revoked) {
          return reply.code(404).send({
            error: 'No breakglass access found to revoke',
            alreadyRevoked: true
          });
        }

        await loggingService.logCriticalError(
          'admin_breakglass_revoked',
          new Error('Admin revoked breakglass access'),
          {
            userId,
            projectId,
            adminId,
            reason
          }
        );

        reply.send({
          success: true,
          message: 'Breakglass access revoked',
          revokedBy: adminId,
          reason
        });

      } catch (error) {
        await loggingService.logCriticalError('admin_breakglass_revocation_failed', error as Error, {
          userId,
          projectId,
          adminId,
          reason
        });

        reply.code(500).send({
          error: 'Failed to revoke breakglass access'
        });
      }
    }
  );

  /**
   * GET /v1/admin/breakglass/list
   * List all active breakglass entries
   */
  fastify.get('/v1/admin/breakglass/list', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!breakglassService.isEnabled()) {
      return reply.send({
        enabled: false,
        entries: []
      });
    }

    const adminId = (request as any).admin.id;

    try {
      const entries = await breakglassService.listActiveBreakglass(adminId);

      reply.send({
        enabled: true,
        count: entries.length,
        entries: entries.map(entry => ({
          id: entry.id,
          userId: entry.user_id,
          projectId: entry.project_id,
          supabaseProjectRef: entry.supabase_project_ref,
          createdAt: entry.created_at.toISOString(),
          accessedAt: entry.accessed_at?.toISOString(),
          accessCount: entry.access_count,
          createdBy: entry.created_by_admin_id,
          reason: entry.reason,
          expiresAt: entry.expires_at.toISOString(),
          isActive: entry.is_active
        }))
      });

    } catch (error) {
      await loggingService.logCriticalError('admin_breakglass_list_failed', error as Error, {
        adminId
      });

      reply.code(500).send({
        error: 'Failed to list breakglass entries'
      });
    }
  });

  /**
   * GET /v1/admin/breakglass/stats
   * Get breakglass statistics for monitoring
   */
  fastify.get('/v1/admin/breakglass/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = (request as any).admin.id;

    try {
      const stats = await breakglassService.getBreakglassStats();

      reply.send({
        ...stats,
        requestedBy: adminId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await loggingService.logCriticalError('admin_breakglass_stats_failed', error as Error, {
        adminId
      });

      reply.code(500).send({
        error: 'Failed to retrieve breakglass statistics'
      });
    }
  });

  /**
   * POST /v1/admin/breakglass/cleanup
   * Manually trigger cleanup of expired entries
   */
  fastify.post('/v1/admin/breakglass/cleanup', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!breakglassService.isEnabled()) {
      return reply.send({
        enabled: false,
        deleted: 0
      });
    }

    const adminId = (request as any).admin.id;

    try {
      const deletedCount = await breakglassService.cleanupExpiredBreakglass();

      await loggingService.logServerEvent('capacity', 'error', 'Manual breakglass cleanup triggered', {
        adminId,
        deletedCount
      });

      reply.send({
        success: true,
        deletedCount,
        triggeredBy: adminId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await loggingService.logCriticalError('admin_breakglass_cleanup_failed', error as Error, {
        adminId
      });

      reply.code(500).send({
        error: 'Failed to cleanup breakglass entries'
      });
    }
  });

  /**
   * POST /v1/admin/breakglass/check
   * Check if user has breakglass access
   */
  fastify.post<{ Body: { userId: string; projectId: string } }>(
    '/v1/admin/breakglass/check',
    async (request: FastifyRequest<{ Body: { userId: string; projectId: string } }>, reply: FastifyReply) => {
      const { userId, projectId } = request.body;
      const adminId = (request as any).admin.id;

      if (!userId || !projectId) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'projectId']
        });
      }

      try {
        const hasAccess = await breakglassService.hasBreakglassAccess(userId, projectId);

        reply.send({
          userId,
          projectId,
          hasBreakglassAccess: hasAccess,
          enabled: breakglassService.isEnabled(),
          checkedBy: adminId,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        await loggingService.logCriticalError('admin_breakglass_check_failed', error as Error, {
          userId,
          projectId,
          adminId
        });

        reply.code(500).send({
          error: 'Failed to check breakglass access'
        });
      }
    }
  );

  /**
   * GET /v1/admin/breakglass/config
   * Get breakglass configuration status
   */
  fastify.get('/v1/admin/breakglass/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminId = (request as any).admin.id;

    reply.send({
      enabled: breakglassService.isEnabled(),
      environmentVariable: 'ENABLE_BREAKGLASS_RECOVERY',
      currentValue: process.env.ENABLE_BREAKGLASS_RECOVERY || 'undefined',
      warning: 'Breakglass recovery stores plaintext OAuth tokens - extreme security risk',
      useCases: [
        'Production emergency when user OAuth is broken',
        'Critical deployment needed when Supabase Management API is down',
        'Emergency access for support/debugging scenarios'
      ],
      securityControls: [
        'Admin-only access with role verification',
        '24-hour automatic expiry',
        'Comprehensive audit logging',
        'Database-enforced row-level security',
        'Access count tracking and monitoring'
      ],
      checkedBy: adminId,
      timestamp: new Date().toISOString()
    });
  });
}