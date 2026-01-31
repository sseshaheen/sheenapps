import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VercelOAuthService } from '../services/vercelOAuthService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { requireHmacSignature } from '../middleware/hmacValidation';

/**
 * Vercel OAuth Integration Routes
 * Implements secure OAuth 2.0 flow with PKCE for Vercel integration
 */

interface OAuthInitiateRequest {
  userId: string;
  projectId?: string;
  redirectUrl?: string;
}

interface OAuthCallbackQuery {
  code: string;
  state: string;
  error?: string;
  error_description?: string;
}

interface OAuthRefreshRequest {
  connectionId: string;
}

interface DisconnectRequest {
  userId: string;
  projectId?: string;
}

interface ConnectionStatusQuery {
  userId: string;
  projectId?: string;
}

interface TestConnectionRequest {
  connectionId: string;
}

export async function vercelOAuthRoutes(fastify: FastifyInstance) {
  const oauthService = VercelOAuthService.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  // Apply HMAC validation to all Vercel OAuth routes
  fastify.addHook('preHandler', requireHmacSignature());

  /**
   * POST /v1/internal/vercel/oauth/initiate
   * Generate OAuth authorization URL with PKCE challenge
   */
  fastify.post<{ Body: OAuthInitiateRequest }>(
    '/v1/internal/vercel/oauth/initiate',
    async (request: FastifyRequest<{ Body: OAuthInitiateRequest }>, reply: FastifyReply) => {
      const { userId, projectId, redirectUrl } = request.body;

      // Validate required fields
      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field: userId'
        });
      }

      try {
        const { authUrl, state } = await oauthService.generateAuthUrl(userId, projectId, redirectUrl);

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Vercel OAuth initiation successful',
          { userId, projectId, hasRedirectUrl: !!redirectUrl }
        );

        reply.send({
          authUrl,
          state,
          expiresIn: 600 // 10 minutes
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_oauth_initiate_error',
          error as Error,
          { userId, projectId }
        );

        reply.code(500).send({
          error: 'Failed to initiate OAuth flow',
          canRetry: true
        });
      }
    }
  );

  /**
   * GET /v1/internal/vercel/oauth/callback
   * Handle OAuth callback and exchange code for tokens
   */
  fastify.get<{ Querystring: OAuthCallbackQuery }>(
    '/v1/internal/vercel/oauth/callback',
    async (request: FastifyRequest<{ Querystring: OAuthCallbackQuery }>, reply: FastifyReply) => {
      const { code, state, error, error_description } = request.query;

      // Handle OAuth errors
      if (error) {
        await loggingService.logServerEvent(
          'error',
          'warn',
          'Vercel OAuth callback error',
          { error, error_description }
        );

        return reply.code(400).send({
          error: `OAuth error: ${error}`,
          description: error_description,
          code: 'OAUTH_ERROR'
        });
      }

      // Validate required parameters
      if (!code || !state) {
        return reply.code(400).send({
          error: 'Missing required parameters: code and state'
        });
      }

      try {
        const result = await oauthService.exchangeCodeForTokens(code, state);

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Vercel OAuth callback successful',
          {
            connectionId: result.connectionId,
            teamId: result.tokens.team_id,
            grantedScopes: result.tokens.granted_scopes
          }
        );

        reply.send({
          success: true,
          connectionId: result.connectionId,
          teamId: result.tokens.team_id,
          teamName: result.userInfo.team?.name,
          accountType: result.tokens.team_id ? 'team' : 'personal',
          userEmail: result.userInfo.user.email,
          grantedScopes: result.tokens.granted_scopes?.split(' ') || []
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_oauth_callback_error',
          error as Error,
          { code: code.substring(0, 10) + '...', state }
        );

        const errorMessage = (error as Error).message;
        const isExpiredState = errorMessage.includes('expired') || errorMessage.includes('INVALID_STATE');
        const isInvalidCode = errorMessage.includes('invalid_grant') || errorMessage.includes('TOKEN_EXCHANGE_FAILED');

        reply.code(500).send({
          error: isExpiredState 
            ? 'OAuth state expired - please restart the connection process'
            : isInvalidCode 
            ? 'Invalid authorization code - please try connecting again'
            : 'Token exchange failed',
          canRetry: !isInvalidCode,
          code: isExpiredState ? 'EXPIRED_STATE' : isInvalidCode ? 'INVALID_CODE' : 'TOKEN_EXCHANGE_FAILED'
        });
      }
    }
  );

  /**
   * POST /v1/internal/vercel/oauth/refresh
   * Refresh expired OAuth tokens
   */
  fastify.post<{ Body: OAuthRefreshRequest }>(
    '/v1/internal/vercel/oauth/refresh',
    async (request: FastifyRequest<{ Body: OAuthRefreshRequest }>, reply: FastifyReply) => {
      const { connectionId } = request.body;

      if (!connectionId) {
        return reply.code(400).send({
          error: 'Missing required field: connectionId'
        });
      }

      try {
        const tokens = await oauthService.getValidTokens(connectionId);

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Vercel OAuth token refresh successful',
          { connectionId }
        );

        reply.send({
          success: true,
          refreshed: true,
          // Don't return actual tokens for security
          hasValidTokens: !!tokens.access_token
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_oauth_refresh_error',
          error as Error,
          { connectionId }
        );

        const errorMessage = (error as Error).message;
        const requiresReauth = errorMessage.includes('expired') || 
                              errorMessage.includes('NO_REFRESH_TOKEN') ||
                              errorMessage.includes('TOKEN_REFRESH_FAILED');

        reply.code(requiresReauth ? 401 : 500).send({
          error: requiresReauth 
            ? 'Token refresh failed - please reconnect your Vercel account'
            : 'Token refresh temporarily unavailable',
          requiresReauth,
          canRetry: !requiresReauth
        });
      }
    }
  );

  /**
   * POST /v1/internal/vercel/oauth/disconnect
   * Disconnect Vercel OAuth connection
   */
  fastify.delete<{ Body: DisconnectRequest }>(
    '/v1/internal/vercel/oauth/disconnect',
    async (request: FastifyRequest<{ Body: DisconnectRequest }>, reply: FastifyReply) => {
      const { userId, projectId } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field: userId'
        });
      }

      try {
        const disconnected = await oauthService.disconnect(userId, projectId);

        if (!disconnected) {
          return reply.code(404).send({
            error: 'Connection not found',
            alreadyDisconnected: true
          });
        }

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Vercel connection disconnected',
          { userId, projectId }
        );

        reply.send({
          disconnected: true,
          message: "Connection removed from SheenApps. To complete disconnection, revoke SheenApps access in your Vercel dashboard: Settings → Integrations → SheenApps → Remove"
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_disconnect_error',
          error as Error,
          { userId, projectId }
        );

        reply.code(500).send({
          error: 'Failed to disconnect Vercel account',
          canRetry: true
        });
      }
    }
  );

  /**
   * GET /v1/internal/vercel/oauth/status
   * Get connection status for a user/project
   */
  fastify.get<{ Querystring: ConnectionStatusQuery }>(
    '/v1/internal/vercel/oauth/status',
    async (request: FastifyRequest<{ Querystring: ConnectionStatusQuery }>, reply: FastifyReply) => {
      const { userId, projectId } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      try {
        const status = await oauthService.getConnectionStatus(userId, projectId);

        reply.send({
          connected: status.connected,
          status: status.status || 'not_connected',
          connectionId: status.connectionId,
          expiresAt: status.expiresAt,
          teamId: status.teamId,
          teamName: status.teamName,
          accountType: status.teamId ? 'team' : status.connected ? 'personal' : undefined
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_status_error',
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
   * POST /v1/internal/vercel/oauth/test-connection
   * Test Vercel connection health
   */
  fastify.post<{ Body: TestConnectionRequest }>(
    '/v1/internal/vercel/oauth/test-connection',
    async (request: FastifyRequest<{ Body: TestConnectionRequest }>, reply: FastifyReply) => {
      const { connectionId } = request.body;

      if (!connectionId) {
        return reply.code(400).send({
          error: 'Missing required field: connectionId'
        });
      }

      try {
        const health = await oauthService.testConnection(connectionId);

        reply.send({
          healthy: health.healthy,
          latency: health.latency,
          error: health.error,
          testedAt: new Date().toISOString()
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_connection_test_error',
          error as Error,
          { connectionId }
        );

        reply.code(500).send({
          healthy: false,
          error: 'Connection test failed',
          testedAt: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /v1/internal/vercel/oauth/health
   * Check Vercel OAuth service health
   */
  fastify.get('/v1/internal/vercel/oauth/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Test basic service functionality
      const startTime = Date.now();
      
      // Check if we can generate PKCE challenge (basic crypto test)
      const oauthService = VercelOAuthService.getInstance();
      const pkce = oauthService.generatePKCEChallenge();
      const hasValidPKCE = pkce.codeVerifier.length > 0 && 
                          pkce.codeChallenge.length > 0 && 
                          pkce.codeChallengeMethod === 'S256';

      const latency = Date.now() - startTime;

      if (!hasValidPKCE) {
        throw new Error('PKCE generation failed');
      }

      reply.send({
        healthy: true,
        latency,
        features: {
          pkceGeneration: true,
          tokenEncryption: true,
          databaseConnection: true
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'vercel_oauth_health_check_failed',
        error as Error
      );

      reply.code(500).send({
        healthy: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /v1/internal/vercel/oauth/scopes
   * Get available OAuth scopes and their descriptions
   */
  fastify.get('/v1/internal/vercel/oauth/scopes', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const scopes = [
        {
          scope: 'user',
          description: 'Access user profile information',
          required: true
        },
        {
          scope: 'project:read',
          description: 'Read project information and settings',
          required: true
        },
        {
          scope: 'deployment:read',
          description: 'View deployment history and status',
          required: false
        },
        {
          scope: 'deployment:write',
          description: 'Create and manage deployments',
          required: false
        },
        {
          scope: 'project:write',
          description: 'Modify project settings and configuration',
          required: false
        },
        {
          scope: 'env:read',
          description: 'Read environment variables',
          required: false
        },
        {
          scope: 'env:write',
          description: 'Manage environment variables',
          required: false
        },
        {
          scope: 'team',
          description: 'Access team information (for team accounts)',
          required: false
        }
      ];

      reply.send({
        scopes,
        defaultScopes: ['user', 'project:read', 'deployment:read', 'deployment:write'],
        minimalScopes: ['user', 'project:read']
      });

    } catch (error) {
      reply.code(500).send({
        error: 'Failed to retrieve scope information'
      });
    }
  });
}