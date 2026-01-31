/**
 * Integration Status API Routes
 *
 * Provides unified integration status endpoints with ETag caching,
 * action execution, and SSE events for real-time updates.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { IntegrationStatusService } from '../services/integrationStatusService';
import { AdapterContext } from '../adapters/IntegrationStatusAdapter';
// Simple SSE utilities for integration status events
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';

interface StatusQuerystring {
  projectId: string;
  userId: string;
  includeMetrics?: boolean;
  forceRefresh?: boolean;
}

interface ActionBody {
  userId: string;
  integrationKey: 'github' | 'vercel' | 'sanity' | 'supabase';
  actionId: string;
  parameters?: Record<string, any>;
}

interface ActionParams {
  projectId: string;
}

interface SSEQuerystring {
  projectId: string;
  userId: string;
  lastEventId?: string;
}

// Rate limiting for actions (5 per minute per user+project)
const actionRateLimit = new Map<string, { count: number; windowStart: number }>();
const ACTION_RATE_WINDOW = 60 * 1000; // 1 minute
const ACTION_RATE_LIMIT = 5;

// Simple SSE helper functions
function sendSSEEvent(reply: FastifyReply, eventId: string, eventType: string, data: any) {
  const message = `id: ${eventId}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  reply.raw.write(message);
}

function sendSSEHeartbeat(reply: FastifyReply, eventId: string) {
  const message = `id: ${eventId}\nevent: heartbeat\ndata: {"timestamp":"${new Date().toISOString()}"}\n\n`;
  reply.raw.write(message);
}

function setupSSEHeaders(reply: FastifyReply) {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no'); // Nginx compatibility
}

export default async function integrationStatusRoutes(fastify: FastifyInstance) {
  const statusService = IntegrationStatusService.getInstance();
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: 3,
  });

  /**
   * GET /api/integrations/status - Main status aggregation endpoint
   * Returns all integration statuses with ETag support for caching
   */
  fastify.get<{
    Querystring: StatusQuerystring;
  }>('/status', async (request, reply) => {
    const { projectId, userId, includeMetrics, forceRefresh } = request.query;

    try {
      // Build adapter context
      const context: AdapterContext = {
        projectId,
        userId,
        userRole: await getUserRole(userId, projectId), // This would integrate with auth service
        locale: request.headers['x-sheen-locale'] as string || 'en'
      };

      // Get current status
      const { envelope, metrics } = await statusService.getProjectIntegrationStatus(context, {
        forceRefresh,
        includeMetrics
      });

      // Check If-None-Match header for ETag support
      const clientETag = request.headers['if-none-match'];
      const serverETag = `W/"${envelope.renderHash}"`;

      if (clientETag === serverETag && !forceRefresh) {
        return reply.code(304).send();
      }

      // Set response headers
      reply.header('ETag', serverETag);
      reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
      reply.header('X-Integration-Hash', envelope.hash);
      reply.header('X-Response-Time', Date.now() - (request as any).startTime + 'ms');

      const response: any = { ...envelope };
      if (includeMetrics && metrics) {
        response.metrics = metrics;
      }

      return reply.code(200).send(response);

    } catch (error: any) {
      fastify.log.error('Integration status error:', error);

      return reply.code(500).send({
        error: 'INTEGRATION_STATUS_ERROR',
        message: 'Failed to retrieve integration status'
      });
    }
  });

  /**
   * POST /api/integrations/actions/:projectId - Execute integration actions
   * Supports idempotency and rate limiting
   */
  fastify.post<{
    Params: ActionParams;
    Body: ActionBody;
  }>('/actions/:projectId', async (request, reply) => {
    const { projectId } = request.params;
    const { userId, integrationKey, actionId, parameters } = request.body;

    try {
      // Check idempotency key
      const idempotencyKey = request.headers['idempotency-key'] as string;
      if (!idempotencyKey) {
        return reply.code(400).send({
          error: 'MISSING_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key header is required'
        });
      }

      // Check rate limiting
      const rateLimitKey = `${userId}:${projectId}`;
      const now = Date.now();
      const window = actionRateLimit.get(rateLimitKey);

      if (window) {
        if (now - window.windowStart < ACTION_RATE_WINDOW) {
          if (window.count >= ACTION_RATE_LIMIT) {
            return reply.code(429).send({
              error: 'RATE_LIMITED',
              message: 'Too many actions, please wait',
              retryAfter: Math.ceil((ACTION_RATE_WINDOW - (now - window.windowStart)) / 1000)
            });
          }
          window.count++;
        } else {
          // Reset window
          window.windowStart = now;
          window.count = 1;
        }
      } else {
        actionRateLimit.set(rateLimitKey, { count: 1, windowStart: now });
      }

      // Check for existing idempotent request
      const idempotencyResult = await redis.get(`action:idempotency:${idempotencyKey}`);
      if (idempotencyResult) {
        const existingResult = JSON.parse(idempotencyResult);
        return reply.code(existingResult.success ? 200 : 400).send(existingResult);
      }

      // Build adapter context
      const context: AdapterContext = {
        projectId,
        userId,
        userRole: await getUserRole(userId, projectId),
        locale: request.headers['x-sheen-locale'] as string || 'en'
      };

      // Execute action
      const result = await statusService.executeIntegrationAction(
        context,
        integrationKey,
        actionId,
        idempotencyKey,
        parameters
      );

      // Store idempotency result (24 hour TTL)
      await redis.setex(`action:idempotency:${idempotencyKey}`, 24 * 60 * 60, JSON.stringify(result));

      // Set response headers
      reply.header('X-Idempotency-Key', idempotencyKey);

      if (result.retryAfter) {
        reply.header('Retry-After', result.retryAfter.toString());
      }

      const statusCode = result.success ? (result.data?.requiresOAuth ? 202 : 200) : 400;
      return reply.code(statusCode).send(result);

    } catch (error: any) {
      fastify.log.error('Integration action error:', error);

      return reply.code(500).send({
        error: 'ACTION_EXECUTION_ERROR',
        message: 'Failed to execute integration action'
      });
    }
  });

  /**
   * GET /api/integrations/events - SSE endpoint for real-time updates
   * Supports heartbeats, reconnection with Last-Event-ID, and compression
   */
  fastify.get<{
    Querystring: SSEQuerystring;
  }>('/events', async (request, reply) => {
    const { projectId, userId, lastEventId } = request.query;

    try {
      // Validate user access to project
      const context: AdapterContext = {
        projectId,
        userId,
        userRole: await getUserRole(userId, projectId),
        locale: request.headers['x-sheen-locale'] as string || 'en'
      };

      if (!context.userRole) {
        return reply.code(403).send({
          error: 'FORBIDDEN',
          message: 'Access denied to project integrations'
        });
      }

      // Set up SSE connection
      const connectionId = randomUUID();
      // Set up SSE headers
      setupSSEHeaders(reply);

      // Set up heartbeat interval
      const heartbeatInterval = setInterval(() => {
        sendSSEHeartbeat(reply, Date.now().toString());
      }, 30000); // 30s heartbeats

      // Clean up on connection close
      const cleanup = () => {
        clearInterval(heartbeatInterval);
        if (statusCheckInterval) clearInterval(statusCheckInterval);
      };

      reply.raw.on('close', cleanup);
      reply.raw.on('error', cleanup);

      fastify.log.info(`SSE connection established: ${connectionId} for project ${projectId}`);

      // Send connection established event
      let sequenceNumber = lastEventId ? parseInt(lastEventId) + 1 : Date.now();

      sendSSEEvent(reply, (sequenceNumber++).toString(), 'connection.established', {
        connectionId,
        reason: 'Integration status monitoring active',
        timestamp: new Date().toISOString()
      });

      // Send current status immediately
      const { envelope } = await statusService.getProjectIntegrationStatus(context);

      sendSSEEvent(reply, (sequenceNumber++).toString(), 'status.snapshot', {
        ...envelope,
        timestamp: new Date().toISOString()
      });

      // Set up periodic status checks (every 60 seconds)
      let statusCheckInterval: NodeJS.Timeout;
      statusCheckInterval = setInterval(async () => {
        try {
          const { envelope: currentStatus } = await statusService.getProjectIntegrationStatus(context);

          sendSSEEvent(reply, (sequenceNumber++).toString(), 'status.update', {
            ...currentStatus,
            timestamp: new Date().toISOString()
          });

        } catch (error) {
          sendSSEEvent(reply, (sequenceNumber++).toString(), 'system.error', {
            code: 'STATUS_CHECK_FAILED',
            message: 'Failed to check integration status',
            timestamp: new Date().toISOString()
          });
        }
      }, 60000);

      // Clean up on connection close
      reply.raw.on('close', () => {
        clearInterval(statusCheckInterval);
        cleanup();
      });

      // Keep connection alive
      return reply;

    } catch (error: any) {
      fastify.log.error('SSE setup error:', error);

      return reply.code(500).send({
        error: 'SSE_SETUP_ERROR',
        message: 'Failed to establish event stream'
      });
    }
  });

  /**
   * GET /api/integrations/actions/:projectId/:integrationKey - Get available actions
   */
  fastify.get<{
    Params: { projectId: string; integrationKey: 'github' | 'vercel' | 'sanity' | 'supabase' };
    Querystring: { userId: string };
  }>('/actions/:projectId/:integrationKey', async (request, reply) => {
    const { projectId, integrationKey } = request.params;
    const { userId } = request.query;

    try {
      const context: AdapterContext = {
        projectId,
        userId,
        userRole: await getUserRole(userId, projectId),
        locale: request.headers['x-sheen-locale'] as string || 'en'
      };

      const actions = await statusService.getIntegrationActions(context, integrationKey);

      return reply.code(200).send({ actions });

    } catch (error: any) {
      fastify.log.error('Get actions error:', error);

      return reply.code(500).send({
        error: 'GET_ACTIONS_ERROR',
        message: 'Failed to retrieve available actions'
      });
    }
  });

  /**
   * POST /api/integrations/status/:projectId/refresh - Force refresh all statuses
   */
  fastify.post<{
    Params: { projectId: string };
    Body: { userId: string };
  }>('/status/:projectId/refresh', async (request, reply) => {
    const { projectId } = request.params;
    const { userId } = request.body;

    try {
      const context: AdapterContext = {
        projectId,
        userId,
        userRole: await getUserRole(userId, projectId),
        locale: request.headers['x-sheen-locale'] as string || 'en'
      };

      await statusService.forceRefreshAll(context);

      return reply.code(200).send({
        success: true,
        message: 'All integration statuses refreshed'
      });

    } catch (error: any) {
      fastify.log.error('Force refresh error:', error);

      return reply.code(500).send({
        error: 'REFRESH_ERROR',
        message: 'Failed to refresh integration statuses'
      });
    }
  });

  /**
   * GET /api/integrations/metrics - Get circuit breaker metrics for monitoring
   */
  fastify.get('/metrics', async (request, reply) => {
    try {
      const metrics = statusService.getCircuitBreakerMetrics();

      return reply.code(200).send({
        circuitBreakers: metrics,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      fastify.log.error('Get metrics error:', error);

      return reply.code(500).send({
        error: 'METRICS_ERROR',
        message: 'Failed to retrieve integration metrics'
      });
    }
  });
}

// Helper function to determine user role for a project
async function getUserRole(userId: string, projectId: string): Promise<AdapterContext['userRole']> {
  // This would integrate with the existing auth/project membership system
  // For now, return a default role
  return 'owner'; // Could be 'owner', 'admin', 'editor', 'viewer'
}