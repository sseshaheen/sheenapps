import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseConnectionService } from '../services/supabaseConnectionService';
import { SupabaseManagementAPI } from '../services/supabaseManagementAPI';
import { ServerLoggingService } from '../services/serverLoggingService';
import { requireHmacSignature } from '../middleware/hmacValidation';

/**
 * Supabase Deployment Context Routes
 * SECURITY: These routes can access service-role keys for deployment
 * Only accessible from deployment pipeline, never from UI
 */

interface DeploymentCredentialsQueryRequest {
  ref: string;
  userId: string;
  projectId: string;
  includeSecret?: string;
  deploymentContext?: string;
}

interface DeploymentCredentialsRequest {
  ref: string;
  userId: string;
  projectId: string;
  includeSecret: boolean;
  deploymentContext: string;
  hmacSignature: string;
}

interface SupabaseIntegrationRequest {
  userId: string;
  projectId: string;
  projectPath?: string;
}

export async function supabaseDeploymentRoutes(fastify: FastifyInstance) {
  const connectionService = SupabaseConnectionService.getInstance();
  const managementAPI = SupabaseManagementAPI.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  // Apply HMAC validation to all deployment routes
  fastify.addHook('preHandler', requireHmacSignature());

  /**
   * POST /v1/deploy/supabase/credentials
   * Get project credentials for deployment context (can include service keys)
   * SECURITY: Uses POST with HMAC-signed body to prevent query parameter logging
   */
  fastify.post<{ Body: DeploymentCredentialsRequest }>(
    '/v1/deploy/supabase/credentials',
    async (request: FastifyRequest<{ Body: DeploymentCredentialsRequest }>, reply: FastifyReply) => {
      const { ref, userId, projectId, includeSecret, deploymentContext, hmacSignature } = request.body;

      if (!ref || !userId || !projectId || !deploymentContext || !hmacSignature) {
        return reply.code(400).send({
          error: 'Missing required parameters',
          required: ['ref', 'userId', 'projectId', 'deploymentContext', 'hmacSignature']
        });
      }

      // Validate HMAC signature for deployment context
      const expectedPayload = `${deploymentContext}:${ref}:${userId}:${projectId}:${includeSecret}`;
      try {
        const crypto = await import('crypto');
        const expectedSignature = crypto.createHmac('sha256', process.env.HMAC_SECRET || 'dev-key')
          .update(expectedPayload)
          .digest('hex');
        
        if (hmacSignature !== expectedSignature) {
          return reply.code(403).send({
            error: 'Invalid HMAC signature',
            code: 'INVALID_SIGNATURE'
          });
        }
      } catch (error) {
        return reply.code(403).send({
          error: 'HMAC verification failed',
          code: 'HMAC_ERROR'
        });
      }

      // Validate deployment context for security
      if (includeSecret && !deploymentContext.startsWith('deploy-')) {
        return reply.code(403).send({
          error: 'Service keys only accessible from deployment context',
          code: 'INVALID_CONTEXT'
        });
      }

      try {
        // Get connection and valid tokens
        const connection = await connectionService.getConnection(userId, projectId);
        if (!connection) {
          // Graceful fallback to manual setup
          return reply.code(404).send({
            error: 'Supabase connection not found',
            fallbackToManual: true,
            code: 'CONNECTION_NOT_FOUND',
            instruction: 'Configure Supabase credentials manually in project settings'
          });
        }

        const tokens = await connectionService.getValidTokens(connection.id);

        // Fetch credentials from Supabase Management API
        const credentials = await managementAPI.getProjectCredentials(
          tokens.access_token,
          ref,
          includeSecret
        );

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Deployment credentials retrieved',
          {
            ref,
            userId,
            projectId,
            includeSecret,
            deploymentContext,
            hasServiceKey: !!credentials.serviceRoleKey
          }
        );

        // Return credentials (ephemeral - discarded after deployment)
        const response: any = {
          url: credentials.url,
          publishableKey: credentials.publishableKey
        };

        // Only include service key in deployment context with explicit request
        if (includeSecret && credentials.serviceRoleKey) {
          response.serviceRoleKey = credentials.serviceRoleKey;
        }

        reply.send(response);

      } catch (error) {
        await loggingService.logServerEvent('error', 'error', 'Deployment credentials retrieval failed', {
          error: (error as Error).message,
          ref,
          userId,
          projectId,
          includeSecret,
          deploymentContext
        });

        if ((error as Error).message.includes('INSUFFICIENT_PERMISSIONS')) {
          return reply.code(403).send({
            error: 'User lacks permission to read API keys for this project',
            fallbackToManual: true,
            code: 'INSUFFICIENT_PERMISSIONS',
            instruction: 'Use manual Supabase configuration or request project access'
          });
        }

        if ((error as Error).message.includes('expired') || (error as Error).message.includes('UNAUTHORIZED')) {
          return reply.code(401).send({
            error: 'OAuth connection expired',
            fallbackToManual: true,
            code: 'TOKEN_EXPIRED',
            instruction: 'Reconnect Supabase in project settings'
          });
        }

        if ((error as Error).message.includes('PROJECT_NOT_FOUND')) {
          return reply.code(404).send({
            error: 'Supabase project not found or inaccessible',
            fallbackToManual: true,
            code: 'PROJECT_NOT_FOUND'
          });
        }

        reply.code(500).send({
          error: 'Failed to retrieve credentials',
          fallbackToManual: true,
          canRetry: !(error as Error).message.includes('INSUFFICIENT_PERMISSIONS')
        });
      }
    }
  );

  /**
   * GET /v1/deploy/supabase/integration-status
   * Check Supabase integration status for deployment pipeline
   */
  fastify.get<{ Querystring: SupabaseIntegrationRequest }>(
    '/v1/deploy/supabase/integration-status',
    async (request: FastifyRequest<{ Querystring: SupabaseIntegrationRequest }>, reply: FastifyReply) => {
      const { userId, projectId, projectPath } = request.query;

      if (!userId || !projectId) {
        return reply.code(400).send({
          error: 'Missing required parameters',
          required: ['userId', 'projectId']
        });
      }

      try {
        // Check for OAuth connection
        const connection = await connectionService.getConnection(userId, projectId);

        if (connection) {
          const discovery = await connectionService.getStoredDiscovery(connection.id);
          
          // Check if we need to detect server-side patterns in the project
          let needsServiceRole = false;
          if (projectPath) {
            needsServiceRole = await checkForServerSidePatterns(projectPath);
          }

          return reply.send({
            hasSupabase: true,
            connectionType: 'oauth',
            connectionId: connection.id,
            availableProjects: discovery.projects,
            needsServiceRole,
            readyProjects: discovery.readyProjects || 0,
            status: connection.connection_status,
            expiresAt: connection.token_expires_at.toISOString()
          });
        }

        // Check for manual Supabase patterns if no OAuth connection
        let hasManualSupabase = false;
        if (projectPath) {
          hasManualSupabase = await checkForSupabasePatterns(projectPath);
        }

        reply.send({
          hasSupabase: hasManualSupabase,
          connectionType: hasManualSupabase ? 'manual' : null,
          needsServiceRole: false // Cannot determine for manual setup
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'integration_status_error',
          error as Error,
          { userId, projectId, projectPath }
        );

        reply.code(500).send({
          error: 'Failed to check integration status',
          hasSupabase: false,
          canRetry: true
        });
      }
    }
  );

  /**
   * POST /v1/deploy/supabase/validate-deployment
   * Validate Supabase configuration before deployment
   */
  fastify.post<{ Body: { 
    userId: string; 
    projectId: string; 
    supabaseProjectRef: string;
    deploymentLane: string;
    needsServiceRole: boolean;
  } }>(
    '/v1/deploy/supabase/validate-deployment',
    async (request: FastifyRequest<{ Body: { 
      userId: string; 
      projectId: string; 
      supabaseProjectRef: string;
      deploymentLane: string;
      needsServiceRole: boolean;
    } }>, reply: FastifyReply) => {
      const { userId, projectId, supabaseProjectRef, deploymentLane, needsServiceRole } = request.body;

      if (!userId || !projectId || !supabaseProjectRef || !deploymentLane) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'projectId', 'supabaseProjectRef', 'deploymentLane']
        });
      }

      try {
        // Check deployment lane compatibility
        if (needsServiceRole && deploymentLane !== 'workers-node') {
          return reply.code(400).send({
            error: 'Service role access requires Workers deployment lane',
            currentLane: deploymentLane,
            requiredLane: 'workers-node',
            reason: 'Service-role keys require secure server environment'
          });
        }

        // Validate OAuth connection exists
        const connection = await connectionService.getConnection(userId, projectId);
        if (!connection) {
          return reply.send({
            valid: false,
            error: 'No OAuth connection found',
            fallbackToManual: true,
            canProceed: false
          });
        }

        // Test project access
        const tokens = await connectionService.getValidTokens(connection.id);
        const hasAccess = await managementAPI.validateProjectAccess(tokens.access_token, supabaseProjectRef);

        if (!hasAccess) {
          return reply.send({
            valid: false,
            error: 'Cannot access Supabase project',
            fallbackToManual: true,
            canProceed: false
          });
        }

        // Validation passed
        reply.send({
          valid: true,
          deploymentLane,
          needsServiceRole,
          canProceed: true,
          connectionStatus: connection.connection_status,
          validatedAt: new Date().toISOString()
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'deployment_validation_error',
          error as Error,
          { userId, projectId, supabaseProjectRef, deploymentLane }
        );

        reply.code(500).send({
          valid: false,
          error: 'Validation failed',
          fallbackToManual: true,
          canProceed: false,
          canRetry: true
        });
      }
    }
  );

  /**
   * POST /v1/deploy/supabase/inject-env-vars
   * Get environment variables for deployment injection
   */
  fastify.post<{ Body: { 
    userId: string; 
    projectId: string; 
    supabaseProjectRef: string;
    deploymentLane: string;
    needsServiceRole: boolean;
  } }>(
    '/v1/deploy/supabase/inject-env-vars',
    async (request: FastifyRequest<{ Body: { 
      userId: string; 
      projectId: string; 
      supabaseProjectRef: string;
      deploymentLane: string;
      needsServiceRole: boolean;
    } }>, reply: FastifyReply) => {
      const { userId, projectId, supabaseProjectRef, deploymentLane, needsServiceRole } = request.body;

      if (!userId || !projectId || !supabaseProjectRef) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'projectId', 'supabaseProjectRef']
        });
      }

      try {
        // Force Workers lane if service key required
        if (needsServiceRole && deploymentLane !== 'workers-node') {
          throw new Error('Service role access requires Workers deployment lane');
        }

        const connection = await connectionService.getConnection(userId, projectId);
        if (!connection) {
          throw new Error('FALLBACK_TO_MANUAL: No OAuth connection found');
        }

        const tokens = await connectionService.getValidTokens(connection.id);

        // Determine if service key is needed and enforce lane restrictions
        const requiresServiceKey = deploymentLane === 'workers-node' && needsServiceRole;

        // Get credentials from deployment endpoint (can include secrets)
        const credentials = await managementAPI.getProjectCredentials(
          tokens.access_token,
          supabaseProjectRef,
          requiresServiceKey
        );

        if (!credentials.publishableKey) {
          throw new Error('Failed to retrieve Supabase credentials');
        }

        const envVars: Record<string, string> = {
          NEXT_PUBLIC_SUPABASE_URL: credentials.url,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: credentials.publishableKey
        };

        // Only add service key for Workers deployment with explicit need
        if (requiresServiceKey && credentials.serviceRoleKey) {
          envVars.SUPABASE_SERVICE_ROLE_KEY = credentials.serviceRoleKey;
        }

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Supabase environment variables injected',
          {
            userId,
            projectId,
            supabaseProjectRef,
            deploymentLane,
            hasServiceKey: !!envVars.SUPABASE_SERVICE_ROLE_KEY,
            needsServiceRole
          }
        );

        // Keys are ephemeral - discarded after this function returns
        reply.send({
          envVars,
          injectedAt: new Date().toISOString(),
          deploymentLane,
          hasServiceKey: !!envVars.SUPABASE_SERVICE_ROLE_KEY
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'env_injection_error',
          error as Error,
          { userId, projectId, supabaseProjectRef, deploymentLane }
        );

        if ((error as Error).message.includes('FALLBACK_TO_MANUAL')) {
          return reply.code(404).send({
            error: 'OAuth connection not available',
            fallbackToManual: true,
            instruction: 'Configure Supabase environment variables manually'
          });
        }

        if ((error as Error).message.includes('INSUFFICIENT_PERMISSIONS')) {
          return reply.code(403).send({
            error: 'Cannot access Supabase credentials',
            fallbackToManual: true,
            instruction: 'Use manual Supabase configuration'
          });
        }

        reply.code(500).send({
          error: 'Failed to inject environment variables',
          fallbackToManual: true,
          canRetry: true
        });
      }
    }
  );
}

/**
 * Helper: Check for server-side Supabase patterns in project
 */
async function checkForServerSidePatterns(projectPath: string): Promise<boolean> {
  // This would integrate with your existing pattern detection system
  // For now, return a placeholder
  try {
    // Check for server-side patterns like service-role usage
    const serverPatterns = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'createServerComponentClient',
      'createRouteHandlerClient',
      'createServerActionClient'
    ];

    // Implementation would use your existing pattern detection
    // from the three-lane deployment system
    return false; // Placeholder
  } catch {
    return false;
  }
}

/**
 * Helper: Check for any Supabase patterns in project
 */
async function checkForSupabasePatterns(projectPath: string): Promise<boolean> {
  try {
    // Check for general Supabase usage
    const supabasePatterns = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'createClientComponentClient',
      'supabase',
      '@supabase/supabase-js'
    ];

    // Implementation would use your existing pattern detection
    return false; // Placeholder
  } catch {
    return false;
  }
}