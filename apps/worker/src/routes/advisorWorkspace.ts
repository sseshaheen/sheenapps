import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { workspaceLogStreamingService } from '../services/workspaceLogStreamingService';
import { workspaceFileAccessService } from '../services/workspaceFileAccessService';
import { workspaceDatabaseService } from '../services/workspaceDatabaseService';
import { workspaceHistoricalLogService } from '../services/workspaceHistoricalLogService';
import type { LogTier } from '../services/unifiedLogger';

/**
 * Advisor Workspace API Routes
 * Implements secure file access and log streaming for advisor workspace
 */
export default async function advisorWorkspaceRoutes(fastify: FastifyInstance) {
  
  // Access Control Routes

  /**
   * Check workspace access for advisor
   * GET /api/workspace/access
   */
  fastify.get<{
    Querystring: {
      userId: string;
      projectId: string;
    };
  }>('/api/workspace/access', async (request, reply) => {
    const { userId, projectId } = request.query;

    try {
      const accessResult = await workspaceDatabaseService.checkWorkspaceAccess(userId, projectId);
      
      if (!accessResult.hasAccess) {
        reply.status(403).send({
          success: false,
          error: accessResult.reason || 'Access denied'
        });
        return;
      }

      reply.send({
        success: true,
        hasAccess: true,
        permissions: accessResult.permissions,
        settings: accessResult.settings
      });

    } catch (error) {
      console.error('Failed to check workspace access:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to check workspace access'
      });
    }
  });

  /**
   * Update advisor workspace permissions (project owner only)
   * PUT /api/workspace/permissions
   */
  fastify.put<{
    Body: {
      userId: string;      // Project owner ID
      projectId: string;
      advisorId: string;   // Target advisor
      permissions: {
        view_code: boolean;
        view_logs: boolean;
      };
    };
  }>('/api/workspace/permissions', async (request, reply) => {
    const { userId, projectId, advisorId, permissions } = request.body;

    try {
      const success = await workspaceDatabaseService.updateAdvisorPermissions(
        projectId,
        advisorId,
        permissions,
        userId
      );

      if (!success) {
        reply.status(403).send({
          success: false,
          error: 'Failed to update permissions - check ownership'
        });
        return;
      }

      reply.send({
        success: true,
        permissions,
        updatedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to update advisor permissions:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to update advisor permissions'
      });
    }
  });

  /**
   * Update project workspace settings (project owner only)
   * PUT /api/workspace/settings
   */
  fastify.put<{
    Body: {
      userId: string;      // Project owner ID
      projectId: string;
      settings: {
        advisor_code_access?: boolean;
        advisor_log_access?: boolean;
        restricted_paths?: string[];
        allowed_log_tiers?: LogTier[];
      };
    };
  }>('/api/workspace/settings', async (request, reply) => {
    const { userId, projectId, settings } = request.body;

    try {
      const result = await workspaceDatabaseService.updateWorkspaceSettings(
        projectId,
        userId,
        settings
      );

      if (!result) {
        reply.status(403).send({
          success: false,
          error: 'Failed to update settings - check ownership'
        });
        return;
      }

      reply.send({
        success: true,
        settings: result
      });

    } catch (error) {
      console.error('Failed to update workspace settings:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to update workspace settings'
      });
    }
  });

  // Session Management Routes

  /**
   * Start workspace session
   * POST /api/workspace/session/start
   */
  fastify.post<{
    Body: {
      userId: string;
      projectId: string;
    };
  }>('/api/workspace/session/start', async (request, reply) => {
    const { userId, projectId } = request.body;

    try {
      // Check workspace access first
      const accessResult = await workspaceDatabaseService.checkWorkspaceAccess(userId, projectId);
      
      if (!accessResult.hasAccess) {
        reply.status(403).send({
          success: false,
          error: accessResult.reason || 'Access denied'
        });
        return;
      }

      const sessionId = ulid();
      
      // Store session in database
      const session = await workspaceDatabaseService.startSession(sessionId, userId, projectId, {
        userAgent: request.headers['user-agent'],
        clientIp: request.ip
      });

      if (!session) {
        reply.status(500).send({
          success: false,
          error: 'Failed to create session'
        });
        return;
      }

      reply.send({
        success: true,
        sessionId,
        projectId,
        advisorId: userId,
        permissions: accessResult.permissions
      });

    } catch (error) {
      console.error('Failed to start workspace session:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to start workspace session'
      });
    }
  });

  /**
   * End workspace session
   * POST /api/workspace/session/end
   */
  fastify.post<{
    Body: {
      userId: string;
      sessionId: string;
    };
  }>('/api/workspace/session/end', async (request, reply) => {
    const { userId, sessionId } = request.body;

    try {
      // End session in database
      const success = await workspaceDatabaseService.endSession(sessionId, userId);
      
      if (!success) {
        reply.status(404).send({
          success: false,
          error: 'Session not found or already ended'
        });
        return;
      }

      // Disconnect any active log streams for this advisor
      workspaceLogStreamingService.disconnectAdvisorClients(userId);

      reply.send({
        success: true,
        sessionId
      });

    } catch (error) {
      console.error('Failed to end workspace session:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to end workspace session'
      });
    }
  });

  /**
   * Update session activity (heartbeat)
   * PATCH /api/workspace/session/ping
   */
  fastify.patch<{
    Body: {
      userId: string;
      sessionId: string;
    };
  }>('/api/workspace/session/ping', async (request, reply) => {
    const { userId, sessionId } = request.body;

    try {
      const success = await workspaceDatabaseService.updateSessionActivity(sessionId, userId);
      
      if (!success) {
        reply.status(404).send({
          success: false,
          error: 'Session not found'
        });
        return;
      }

      reply.send({
        success: true,
        acknowledged: true,
        serverTime: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to update session activity:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to update session activity'
      });
    }
  });

  /**
   * Get active sessions for project
   * GET /api/workspace/sessions
   */
  fastify.get<{
    Querystring: {
      userId: string;
      projectId: string;
    };
  }>('/api/workspace/sessions', async (request, reply) => {
    const { userId, projectId } = request.query;

    try {
      // Check if user has access to view sessions (project owner or assigned advisor)
      const accessResult = await workspaceDatabaseService.checkWorkspaceAccess(userId, projectId);
      
      if (!accessResult.hasAccess) {
        reply.status(403).send({
          success: false,
          error: 'Access denied'
        });
        return;
      }

      const sessions = await workspaceDatabaseService.getActiveSessions(projectId);

      reply.send({
        success: true,
        sessions,
        totalActive: sessions.length
      });

    } catch (error) {
      console.error('Failed to get active sessions:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to get active sessions'
      });
    }
  });

  // File Access Routes

  /**
   * List directory contents
   * GET /api/workspace/files/list
   */
  fastify.get<{
    Querystring: {
      userId: string;
      projectId: string;
      path?: string;
    };
  }>('/api/workspace/files/list', async (request, reply) => {
    const { userId, projectId, path = '.' } = request.query;

    try {
      // Check workspace access
      const accessResult = await workspaceDatabaseService.checkWorkspaceAccess(userId, projectId);
      
      if (!accessResult.hasAccess || !accessResult.permissions?.view_code) {
        reply.status(403).send({
          success: false,
          error: 'Code access denied'
        });
        return;
      }

      // Get project root path
      const projectRoot = await workspaceDatabaseService.getProjectRootPath(projectId);
      if (!projectRoot) {
        reply.status(404).send({
          success: false,
          error: 'Project not found'
        });
        return;
      }

      const listing = await workspaceFileAccessService.listDirectory(
        projectRoot,
        path,
        userId
      );

      // Log audit event
      await workspaceDatabaseService.logAuditEvent(
        undefined, // No specific session
        projectId,
        userId,
        'file_read',
        `directory:${path}`,
        { fileCount: listing.files.length, filteredCount: listing.filteredCount },
        request.ip,
        request.headers['user-agent']
      );

      reply.send({
        success: true,
        ...listing
      });

    } catch (error) {
      console.error('Failed to list directory:', error);
      
      // Log blocked access attempt
      await workspaceDatabaseService.logAuditEvent(
        undefined,
        projectId,
        userId,
        'path_blocked',
        `directory:${path}`,
        { error: error instanceof Error ? error.message : 'Unknown error' },
        request.ip,
        request.headers['user-agent']
      );

      reply.status(403).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list directory'
      });
    }
  });

  /**
   * Read file content
   * GET /api/workspace/files/read
   */
  fastify.get<{
    Querystring: {
      userId: string;
      projectId: string;
      path: string;
    };
  }>('/api/workspace/files/read', async (request, reply) => {
    const { userId, projectId, path } = request.query;

    try {
      // TODO: Get project root from database/config
      const projectRoot = `/tmp/projects/${projectId}`; // Placeholder

      // Extract caching headers
      const ifNoneMatch = request.headers['if-none-match'];
      const ifModifiedSince = request.headers['if-modified-since'] 
        ? new Date(request.headers['if-modified-since']) 
        : undefined;

      const result = await workspaceFileAccessService.readFile(
        projectRoot,
        path,
        userId,
        { ifNoneMatch, ifModifiedSince }
      );

      if ('notModified' in result) {
        reply.status(304).send();
        return;
      }

      // Set caching headers
      reply.header('ETag', result.etag);
      reply.header('Last-Modified', result.mtime.toUTCString());
      reply.header('Cache-Control', 'private, max-age=60');

      reply.send({
        success: true,
        file: result
      });

    } catch (error) {
      console.error('Failed to read file:', error);
      reply.status(403).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file'
      });
    }
  });

  /**
   * Get file metadata
   * GET /api/workspace/files/metadata
   */
  fastify.get<{
    Querystring: {
      userId: string;
      projectId: string;
      path: string;
    };
  }>('/api/workspace/files/metadata', async (request, reply) => {
    const { userId, projectId, path } = request.query;

    try {
      // TODO: Get project root from database/config
      const projectRoot = `/tmp/projects/${projectId}`; // Placeholder

      const metadata = await workspaceFileAccessService.getFileMetadata(
        projectRoot,
        path,
        userId
      );

      // Validate file suitability for workspace
      const validation = await workspaceFileAccessService.validateFileForWorkspace(metadata.path);

      reply.send({
        success: true,
        metadata,
        validation
      });

    } catch (error) {
      console.error('Failed to get file metadata:', error);
      reply.status(403).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get file metadata'
      });
    }
  });

  // Log Streaming Routes

  /**
   * Start log stream (SSE)
   * GET /api/workspace/logs/stream
   */
  fastify.get<{
    Querystring: {
      userId: string;
      projectId: string;
      tiers?: string; // Comma-separated tier list
      since?: string; // ISO timestamp
    };
  }>('/api/workspace/logs/stream', async (request, reply) => {
    const { userId, projectId, tiers, since } = request.query;

    try {
      // Parse filters
      const tierFilters = tiers ? (tiers.split(',') as LogTier[]) : undefined;
      const sinceDate = since ? new Date(since) : undefined;
      const lastEventId = request.headers['last-event-id'] as string | undefined;

      const clientId = ulid();

      // Start SSE stream
      await workspaceLogStreamingService.startLogStream(
        clientId,
        userId,
        projectId,
        reply,
        {
          lastEventId,
          tiers: tierFilters,
          since: sinceDate
        }
      );

      // TODO: Log audit event
      // INSERT INTO advisor_workspace_audit_log (project_id, advisor_id, action_type, resource_path)

    } catch (error) {
      console.error('Failed to start log stream:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to start log stream'
      });
    }
  });

  /**
   * Get historical logs (paginated)
   * GET /api/workspace/logs/history
   */
  fastify.get<{
    Querystring: {
      userId: string;
      projectId: string;
      tier?: LogTier;
      startTime?: string;
      endTime?: string;
      limit?: number;
      offset?: number;
    };
  }>('/api/workspace/logs/history', async (request, reply) => {
    const { userId, projectId, tier, startTime, endTime, limit = 100, offset = 0 } = request.query;

    try {
      // Check workspace access
      const accessResult = await workspaceDatabaseService.checkWorkspaceAccess(userId, projectId);
      
      if (!accessResult.hasAccess || !accessResult.permissions?.view_logs) {
        reply.status(403).send({
          success: false,
          error: 'Log access denied'
        });
        return;
      }

      // Parse time filters
      const parsedStartTime = startTime ? new Date(startTime) : undefined;
      const parsedEndTime = endTime ? new Date(endTime) : undefined;

      // Query historical logs
      const result = await workspaceHistoricalLogService.queryHistoricalLogs({
        projectId,
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        tier: tier as LogTier,
        limit: Number(limit),
        offset: Number(offset)
      });

      // Log audit event
      await workspaceDatabaseService.logAuditEvent(
        undefined,
        projectId,
        userId,
        'log_stream_start',
        'historical',
        { 
          tier, 
          startTime, 
          endTime, 
          limit, 
          offset,
          resultCount: result.logs.length 
        },
        request.ip,
        request.headers['user-agent']
      );

      reply.send({
        success: true,
        logs: result.logs,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: result.totalMatched || 0,
          hasMore: result.hasMore
        },
        filters: {
          tier,
          startTime,
          endTime
        }
      });

    } catch (error) {
      console.error('Failed to get historical logs:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to get historical logs'
      });
    }
  });

  // Rate Limiting and Monitoring Routes

  /**
   * Get rate limit status
   * GET /api/workspace/rate-limits
   */
  fastify.get<{
    Querystring: {
      userId: string;
    };
  }>('/api/workspace/rate-limits', async (request, reply) => {
    const { userId } = request.query;

    try {
      const rateLimits = workspaceFileAccessService.getRateLimitStatus(userId);
      const connectedClients = workspaceLogStreamingService.getConnectedClientsCount();

      reply.send({
        success: true,
        rateLimits,
        connectedClients
      });

    } catch (error) {
      console.error('Failed to get rate limits:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to get rate limits'
      });
    }
  });

  /**
   * Get workspace status
   * GET /api/workspace/status
   */
  fastify.get<{
    Querystring: {
      userId: string;
      projectId: string;
    };
  }>('/api/workspace/status', async (request, reply) => {
    const { userId, projectId } = request.query;

    try {
      const projectClients = workspaceLogStreamingService.getProjectClients(projectId);
      const rateLimits = workspaceFileAccessService.getRateLimitStatus(userId);

      reply.send({
        success: true,
        status: {
          connectedClients: projectClients.length,
          advisorConnected: projectClients.some(client => client.advisorId === userId),
          rateLimits
        }
      });

    } catch (error) {
      console.error('Failed to get workspace status:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to get workspace status'
      });
    }
  });

  // Admin Routes (TODO: Add proper admin authentication)

  /**
   * Reset advisor rate limits (admin only)
   * POST /api/workspace/admin/reset-rate-limits
   */
  fastify.post<{
    Body: {
      userId: string; // Admin user
      targetAdvisorId: string;
    };
  }>('/api/workspace/admin/reset-rate-limits', async (request, reply) => {
    const { userId, targetAdvisorId } = request.body;

    try {
      // TODO: Validate admin permissions

      workspaceFileAccessService.resetRateLimits(targetAdvisorId);

      reply.send({
        success: true,
        message: `Rate limits reset for advisor ${targetAdvisorId}`
      });

    } catch (error) {
      console.error('Failed to reset rate limits:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to reset rate limits'
      });
    }
  });

  /**
   * Disconnect advisor sessions (admin only)
   * POST /api/workspace/admin/disconnect-advisor
   */
  fastify.post<{
    Body: {
      userId: string; // Admin user
      targetAdvisorId: string;
    };
  }>('/api/workspace/admin/disconnect-advisor', async (request, reply) => {
    const { userId, targetAdvisorId } = request.body;

    try {
      // TODO: Validate admin permissions

      workspaceLogStreamingService.disconnectAdvisorClients(targetAdvisorId);

      reply.send({
        success: true,
        message: `Disconnected all sessions for advisor ${targetAdvisorId}`
      });

    } catch (error) {
      console.error('Failed to disconnect advisor:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to disconnect advisor'
      });
    }
  });
}