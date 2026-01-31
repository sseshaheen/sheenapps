import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseConnectionService } from '../services/supabaseConnectionService';
import { SupabaseManagementAPI } from '../services/supabaseManagementAPI';
import { ServerLoggingService } from '../services/serverLoggingService';
import { requireHmacSignature } from '../middleware/hmacValidation';

/**
 * Supabase OAuth Integration Routes
 * Implements secure OAuth token exchange and account management
 */

interface OAuthExchangeRequest {
  code: string;
  codeVerifier: string;
  userId: string;
  projectId: string;
  idempotencyKey?: string;
}

interface DiscoveryRequest {
  connectionId: string;
}

interface CredentialsRequest {
  ref: string;
  userId: string;
  projectId: string;
  includeSecret?: string;
}

interface DisconnectRequest {
  userId: string;
  projectId: string;
}

export async function supabaseOAuthRoutes(fastify: FastifyInstance) {
  const connectionService = SupabaseConnectionService.getInstance();
  const managementAPI = SupabaseManagementAPI.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  // Apply HMAC validation to all Supabase OAuth routes
  fastify.addHook('preHandler', requireHmacSignature());

  /**
   * POST /v1/internal/supabase/oauth/exchange
   * Exchange OAuth authorization code for tokens and store connection
   */
  fastify.post<{ Body: OAuthExchangeRequest }>(
    '/v1/internal/supabase/oauth/exchange',
    async (request: FastifyRequest<{ Body: OAuthExchangeRequest }>, reply: FastifyReply) => {
      const { code, codeVerifier, userId, projectId, idempotencyKey } = request.body;

      // Validate required fields
      if (!code || !codeVerifier || !userId || !projectId) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['code', 'codeVerifier', 'userId', 'projectId']
        });
      }

      try {
        // Check for idempotency to prevent duplicate processing
        if (idempotencyKey) {
          const existingResult = await connectionService.checkIdempotency(idempotencyKey);
          if (existingResult) {
            return reply.send(existingResult);
          }
        }

        // Determine redirect URI based on environment
        const redirectUri = process.env.NODE_ENV === 'production'
          ? 'https://sheenapps.com/connect/supabase/callback'
          : 'http://localhost:3000/connect/supabase/callback';

        // Exchange code for tokens with timeout and retry
        const tokens = await Promise.race([
          managementAPI.exchangeOAuthCode(code, codeVerifier, redirectUri),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Token exchange timeout')), 15000)
          )
        ]);

        // Perform account discovery immediately
        const discovery = await Promise.race([
          managementAPI.discoverSupabaseAccount(tokens.access_token),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Discovery timeout')), 15000)
          )
        ]);

        // Store connection with encrypted tokens
        const connectionId = await connectionService.storeConnection(userId, projectId, tokens, discovery);

        const result = {
          connectionId,
          needsProjectCreation: discovery.projects.length === 0,
          availableProjects: discovery.projects.length,
          readyProjects: discovery.readyProjects || 0
        };

        // Store idempotency result
        if (idempotencyKey) {
          await connectionService.storeIdempotencyResult(idempotencyKey, result);
        }

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Supabase OAuth exchange completed successfully',
          {
            connectionId,
            userId,
            projectId,
            projectCount: discovery.projects.length,
            readyProjects: discovery.readyProjects
          }
        );

        reply.send(result);

      } catch (error) {
        await loggingService.logCriticalError(
          'oauth_exchange_error',
          error as Error,
          { userId, projectId }
        );

        const errorMessage = (error as Error).message.includes('timeout')
          ? 'Connection timeout - please try again'
          : 'Token exchange failed';

        const canRetry = !(error as Error).message.includes('invalid_grant') &&
                        !(error as Error).message.includes('invalid_client');

        reply.code(500).send({
          error: errorMessage,
          canRetry,
          details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
      }
    }
  );

  /**
   * GET /v1/internal/supabase/discovery
   * Get stored account discovery data for UI display
   */
  fastify.get<{ Querystring: DiscoveryRequest }>(
    '/v1/internal/supabase/discovery',
    async (request: FastifyRequest<{ Querystring: DiscoveryRequest }>, reply: FastifyReply) => {
      const { connectionId } = request.query;

      if (!connectionId) {
        return reply.code(400).send({
          error: 'Missing required parameter: connectionId'
        });
      }

      try {
        const discovery = await connectionService.getStoredDiscovery(connectionId);

        // Return only non-sensitive discovery data for UI
        reply.send({
          projects: discovery.projects.map(p => ({
            id: p.id,
            ref: p.ref,
            name: p.name,
            organization: p.organization,
            status: p.status,
            canConnect: p.canConnect,
            url: p.url
          })),
          needsProjectCreation: discovery.needsProjectCreation,
          canCreateProjects: discovery.canCreateProjects,
          readyProjects: discovery.readyProjects,
          discoveryFailed: discovery.discoveryFailed,
          fallbackToManual: discovery.fallbackToManual
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'discovery_retrieval_error',
          error as Error,
          { connectionId }
        );

        reply.code(500).send({
          error: 'Failed to retrieve discovery data',
          canRetry: true
        });
      }
    }
  );

  /**
   * GET /v1/internal/supabase/credentials
   * Get project credentials for UI context (publishable keys only)
   */
  fastify.get<{ Querystring: CredentialsRequest }>(
    '/v1/internal/supabase/credentials',
    async (request: FastifyRequest<{ Querystring: CredentialsRequest }>, reply: FastifyReply) => {
      const { ref, userId, projectId, includeSecret } = request.query;

      // Security: UI context can never access service keys
      if (includeSecret === 'true') {
        return reply.code(403).send({
          error: 'Service keys not accessible from UI context',
          code: 'FORBIDDEN_CONTEXT'
        });
      }

      if (!ref || !userId || !projectId) {
        return reply.code(400).send({
          error: 'Missing required parameters',
          required: ['ref', 'userId', 'projectId']
        });
      }

      try {
        // Get connection and valid tokens
        const connection = await connectionService.getConnection(userId, projectId);
        if (!connection) {
          return reply.code(404).send({
            error: 'Supabase connection not found',
            fallbackToManual: true,
            code: 'CONNECTION_NOT_FOUND'
          });
        }

        const tokens = await connectionService.getValidTokens(connection.id);

        // Fetch credentials from Supabase Management API (publishable only)
        const credentials = await managementAPI.getProjectCredentials(
          tokens.access_token,
          ref,
          false // Never include service key from UI endpoint
        );

        // Return credentials (ephemeral - discarded after response)
        reply.send({
          url: credentials.url,
          publishableKey: credentials.publishableKey
        });

      } catch (error) {
        await loggingService.logServerEvent('error', 'error', 'UI credentials retrieval failed', {
          error: (error as Error).message,
          ref,
          userId,
          projectId
        });

        if ((error as Error).message.includes('INSUFFICIENT_PERMISSIONS')) {
          return reply.code(403).send({
            error: 'User lacks permission to read API keys for this project',
            fallbackToManual: true,
            code: 'INSUFFICIENT_PERMISSIONS'
          });
        }

        if ((error as Error).message.includes('expired') || (error as Error).message.includes('UNAUTHORIZED')) {
          return reply.code(401).send({
            error: 'OAuth connection expired - please reconnect',
            requiresReauth: true,
            code: 'TOKEN_EXPIRED'
          });
        }

        reply.code(500).send({
          error: 'Failed to retrieve credentials',
          canRetry: !(error as Error).message.includes('INSUFFICIENT_PERMISSIONS')
        });
      }
    }
  );

  /**
   * DELETE /v1/internal/supabase/connection
   * Disconnect Supabase OAuth connection
   */
  fastify.delete<{ Body: DisconnectRequest }>(
    '/v1/internal/supabase/connection',
    async (request: FastifyRequest<{ Body: DisconnectRequest }>, reply: FastifyReply) => {
      const { userId, projectId } = request.body;

      if (!userId || !projectId) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'projectId']
        });
      }

      try {
        const deleted = await connectionService.deleteConnection(userId, projectId);

        if (!deleted) {
          return reply.code(404).send({
            error: 'Connection not found',
            alreadyDisconnected: true
          });
        }

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Supabase connection disconnected',
          { userId, projectId }
        );

        reply.send({
          disconnected: true,
          message: "To complete disconnection, revoke SheenApps access in your Supabase dashboard: Organization → OAuth Apps → SheenApps → Revoke"
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'connection_deletion_error',
          error as Error,
          { userId, projectId }
        );

        reply.code(500).send({
          error: 'Failed to disconnect',
          canRetry: true
        });
      }
    }
  );

  /**
   * GET /v1/internal/supabase/status
   * Get connection status for a user/project
   */
  fastify.get<{ Querystring: { userId: string; projectId: string } }>(
    '/v1/internal/supabase/status',
    async (request: FastifyRequest<{ Querystring: { userId: string; projectId: string } }>, reply: FastifyReply) => {
      const { userId, projectId } = request.query;

      if (!userId || !projectId) {
        return reply.code(400).send({
          error: 'Missing required parameters',
          required: ['userId', 'projectId']
        });
      }

      try {
        const connection = await connectionService.getConnection(userId, projectId);

        if (!connection) {
          return reply.send({
            connected: false,
            status: 'not_connected'
          });
        }

        // Check if tokens are still valid (not expired)
        const now = new Date();
        const isExpired = connection.token_expires_at < now;

        reply.send({
          connected: true,
          status: connection.connection_status,
          connectionId: connection.id,
          expiresAt: connection.token_expires_at.toISOString(),
          isExpired,
          createdAt: connection.created_at.toISOString()
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'connection_status_error',
          error as Error,
          { userId, projectId }
        );

        reply.code(500).send({
          error: 'Failed to check connection status',
          canRetry: true
        });
      }
    }
  );

  /**
   * POST /v1/internal/supabase/test-connection
   * Test a Supabase connection by validating project access
   */
  fastify.post<{ Body: { userId: string; projectId: string; projectRef: string } }>(
    '/v1/internal/supabase/test-connection',
    async (request: FastifyRequest<{ Body: { userId: string; projectId: string; projectRef: string } }>, reply: FastifyReply) => {
      const { userId, projectId, projectRef } = request.body;

      if (!userId || !projectId || !projectRef) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'projectId', 'projectRef']
        });
      }

      try {
        const connection = await connectionService.getConnection(userId, projectId);
        if (!connection) {
          return reply.code(404).send({
            error: 'Connection not found',
            connected: false
          });
        }

        const tokens = await connectionService.getValidTokens(connection.id);
        const hasAccess = await managementAPI.validateProjectAccess(tokens.access_token, projectRef);

        reply.send({
          connected: true,
          hasAccess,
          projectRef,
          testedAt: new Date().toISOString()
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'connection_test_error',
          error as Error,
          { userId, projectId, projectRef }
        );

        reply.code(500).send({
          error: 'Failed to test connection',
          connected: false,
          canRetry: true
        });
      }
    }
  );

  /**
   * GET /v1/internal/supabase/health
   * Check Supabase Management API health
   */
  fastify.get('/v1/internal/supabase/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await managementAPI.healthCheck();

      reply.send({
        healthy: health.available,
        latency: health.latency,
        error: health.error,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      reply.code(500).send({
        healthy: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });
}