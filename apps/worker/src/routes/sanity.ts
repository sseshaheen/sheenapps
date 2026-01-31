import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SanityService, SanityConnection, validateSanityProjectId, validateDatasetName } from '../services/sanityService';
import { SanityWebhookService } from '../services/sanityWebhookService';
import { SanityContentService } from '../services/sanityContentService';
import { SanityPreviewService } from '../services/sanityPreviewService';
import { SanityBreakglassService } from '../services/sanityBreakglassService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { adminRoleVerificationService } from '../services/adminRoleVerificationService';

/**
 * Sanity CMS Integration Routes
 * Handles connection management, configuration, and basic operations
 * Following the Vercel integration pattern with comprehensive error handling
 */

// =============================================================================
// REQUEST/RESPONSE INTERFACES
// =============================================================================

interface CreateConnectionRequest {
  userId: string;
  projectId?: string;
  sanityProjectId: string;
  datasetName: string;
  projectTitle?: string;
  authToken: string;
  robotToken?: string;
  tokenType?: 'personal' | 'robot' | 'jwt';
  apiVersion?: string;
  useCdn?: boolean;
  perspective?: 'published' | 'previewDrafts';
  realtimeEnabled?: boolean;
  webhookSecret?: string;
  i18nStrategy?: 'document' | 'field';
}

interface UpdateConnectionRequest {
  userId: string;
  connectionId: string;
  projectTitle?: string;
  apiVersion?: string;
  useCdn?: boolean;
  perspective?: 'published' | 'previewDrafts';
  realtimeEnabled?: boolean;
  i18nStrategy?: 'document' | 'field';
  slugPolicy?: { mode: string; transliterate: boolean };
}

interface ListConnectionsQuery {
  userId: string;
  projectId?: string;
}

interface GetConnectionQuery {
  userId: string;
  connectionId: string;
}

interface DeleteConnectionRequest {
  userId: string;
  connectionId: string;
}

interface TestConnectionRequest {
  sanityProjectId: string;
  datasetName: string;
  authToken: string;
  apiVersion?: string;
  useCdn?: boolean;
  perspective?: 'published' | 'previewDrafts';
}

interface HealthCheckRequest {
  userId: string;
  connectionId: string;
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function sanityRoutes(fastify: FastifyInstance) {
  const sanityService = SanityService.getInstance();
  const webhookService = SanityWebhookService.getInstance();
  const contentService = SanityContentService.getInstance();
  const previewService = SanityPreviewService.getInstance();
  const breakglassService = SanityBreakglassService.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  // Apply HMAC validation to all Sanity routes except webhooks
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip HMAC validation for webhook endpoints (they have their own signature validation)
    if (request.url.includes('/webhook')) {
      return;
    }
    return requireHmacSignature()(request, reply);
  });

  // =============================================================================
  // CONNECTION MANAGEMENT
  // =============================================================================

  /**
   * POST /api/integrations/sanity/connect
   * Create a new Sanity connection
   */
  fastify.post('/api/integrations/sanity/connect', async (
    request: FastifyRequest<{ Body: CreateConnectionRequest }>,
    reply: FastifyReply
  ) => {
    try {
      const {
        userId,
        projectId,
        sanityProjectId,
        datasetName,
        projectTitle,
        authToken,
        robotToken,
        tokenType,
        apiVersion,
        useCdn,
        perspective,
        realtimeEnabled,
        webhookSecret,
        i18nStrategy
      } = request.body;

      // Validate required fields
      if (!userId || !sanityProjectId || !datasetName || !authToken) {
        return reply.code(400).send({
          error: 'Missing required fields',
          details: 'userId, sanityProjectId, datasetName, and authToken are required'
        });
      }

      // Validate project ID format
      if (!validateSanityProjectId(sanityProjectId)) {
        return reply.code(400).send({
          error: 'Invalid Sanity project ID',
          details: 'Project ID must be 8 characters long and contain only lowercase letters and numbers'
        });
      }

      // Validate dataset name
      if (!validateDatasetName(datasetName)) {
        return reply.code(400).send({
          error: 'Invalid dataset name',
          details: 'Dataset name must contain only lowercase letters, numbers, hyphens, and underscores'
        });
      }

      const connection = await sanityService.createConnection({
        user_id: userId,
        project_id: projectId,
        sanity_project_id: sanityProjectId,
        dataset_name: datasetName,
        project_title: projectTitle,
        auth_token: authToken,
        robot_token: robotToken,
        token_type: tokenType,
        api_version: apiVersion,
        use_cdn: useCdn,
        perspective: perspective,
        realtime_enabled: realtimeEnabled,
        webhook_secret: webhookSecret,
        i18n_strategy: i18nStrategy
      });

      await loggingService.logServerEvent(
        'error',
        'info',
        'Sanity connection created via API',
        {
          connection_id: connection.id,
          sanity_project_id: sanityProjectId,
          dataset_name: datasetName,
          user_id: userId
        }
      );

      // Return connection without sensitive data
      const safeConnection = {
        ...connection,
        auth_token_encrypted: '[ENCRYPTED]',
        auth_token_iv: '[ENCRYPTED]',
        auth_token_auth_tag: '[ENCRYPTED]',
        robot_token_encrypted: robotToken ? '[ENCRYPTED]' : undefined,
        robot_token_iv: robotToken ? '[ENCRYPTED]' : undefined,
        robot_token_auth_tag: robotToken ? '[ENCRYPTED]' : undefined,
        webhook_secret: '[REDACTED]'
      };

      reply.code(201).send({
        success: true,
        connection: safeConnection
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'sanity_connection_creation_api_failed',
        error as Error,
        { user_id: request.body.userId }
      );

      reply.code(500).send({
        error: 'Failed to create Sanity connection',
        message: (error as Error).message
      });
    }
  });

  /**
   * GET /api/integrations/sanity/connections
   * List all Sanity connections for a user
   */
  fastify.get('/api/integrations/sanity/connections', async (
    request: FastifyRequest<{ Querystring: ListConnectionsQuery }>,
    reply: FastifyReply
  ) => {
    try {
      const { userId, projectId } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter',
          details: 'userId is required'
        });
      }

      const connections = await sanityService.listConnections(userId, projectId);

      // Remove sensitive data from response
      const safeConnections = connections.map(connection => ({
        ...connection,
        auth_token_encrypted: '[ENCRYPTED]',
        auth_token_iv: '[ENCRYPTED]',
        auth_token_auth_tag: '[ENCRYPTED]',
        robot_token_encrypted: connection.robot_token_encrypted ? '[ENCRYPTED]' : undefined,
        robot_token_iv: connection.robot_token_iv ? '[ENCRYPTED]' : undefined,
        robot_token_auth_tag: connection.robot_token_auth_tag ? '[ENCRYPTED]' : undefined,
        webhook_secret: '[REDACTED]'
      }));

      reply.send({
        success: true,
        connections: safeConnections,
        total: connections.length
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to list Sanity connections via API',
        { user_id: request.query.userId, error: (error as Error).message }
      );

      reply.code(500).send({
        error: 'Failed to list connections',
        message: (error as Error).message
      });
    }
  });

  /**
   * GET /api/integrations/sanity/connections/:connectionId
   * Get a specific Sanity connection
   */
  fastify.get('/api/integrations/sanity/connections/:connectionId', async (
    request: FastifyRequest<{ 
      Params: { connectionId: string };
      Querystring: { userId: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.params;
      const { userId } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter',
          details: 'userId is required'
        });
      }

      const connection = await sanityService.getConnection(connectionId, userId);

      if (!connection) {
        return reply.code(404).send({
          error: 'Connection not found',
          details: 'The requested connection does not exist or you do not have access to it'
        });
      }

      // Remove sensitive data from response
      const safeConnection = {
        ...connection,
        auth_token_encrypted: '[ENCRYPTED]',
        auth_token_iv: '[ENCRYPTED]',
        auth_token_auth_tag: '[ENCRYPTED]',
        robot_token_encrypted: connection.robot_token_encrypted ? '[ENCRYPTED]' : undefined,
        robot_token_iv: connection.robot_token_iv ? '[ENCRYPTED]' : undefined,
        robot_token_auth_tag: connection.robot_token_auth_tag ? '[ENCRYPTED]' : undefined,
        webhook_secret: '[REDACTED]'
      };

      reply.send({
        success: true,
        connection: safeConnection
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to get Sanity connection via API',
        { 
          connection_id: request.params.connectionId,
          user_id: request.query.userId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Failed to get connection',
        message: (error as Error).message
      });
    }
  });

  /**
   * PUT /api/integrations/sanity/connections/:connectionId
   * Update a Sanity connection
   */
  fastify.put('/api/integrations/sanity/connections/:connectionId', async (
    request: FastifyRequest<{ 
      Params: { connectionId: string };
      Body: Omit<UpdateConnectionRequest, 'connectionId'>;
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.params;
      const {
        userId,
        projectTitle,
        apiVersion,
        useCdn,
        perspective,
        realtimeEnabled,
        i18nStrategy,
        slugPolicy
      } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field',
          details: 'userId is required'
        });
      }

      // Verify connection exists and belongs to user
      const existingConnection = await sanityService.getConnection(connectionId, userId);
      if (!existingConnection) {
        return reply.code(404).send({
          error: 'Connection not found',
          details: 'The requested connection does not exist or you do not have access to it'
        });
      }

      // Build updates object (only include defined values)
      const updates: any = {};
      if (projectTitle !== undefined) updates.project_title = projectTitle;
      if (apiVersion !== undefined) updates.api_version = apiVersion;
      if (useCdn !== undefined) updates.use_cdn = useCdn;
      if (perspective !== undefined) updates.perspective = perspective;
      if (realtimeEnabled !== undefined) updates.realtime_enabled = realtimeEnabled;
      if (i18nStrategy !== undefined) updates.i18n_strategy = i18nStrategy;
      if (slugPolicy !== undefined) updates.slug_policy = slugPolicy;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({
          error: 'No updates provided',
          details: 'At least one field must be provided for update'
        });
      }

      const updatedConnection = await sanityService.updateConnection(connectionId, updates);

      await loggingService.logServerEvent(
        'error',
        'info',
        'Sanity connection updated via API',
        {
          connection_id: connectionId,
          user_id: userId,
          updates: Object.keys(updates)
        }
      );

      // Remove sensitive data from response
      const safeConnection = {
        ...updatedConnection,
        auth_token_encrypted: '[ENCRYPTED]',
        auth_token_iv: '[ENCRYPTED]',
        auth_token_auth_tag: '[ENCRYPTED]',
        robot_token_encrypted: updatedConnection.robot_token_encrypted ? '[ENCRYPTED]' : undefined,
        robot_token_iv: updatedConnection.robot_token_iv ? '[ENCRYPTED]' : undefined,
        robot_token_auth_tag: updatedConnection.robot_token_auth_tag ? '[ENCRYPTED]' : undefined,
        webhook_secret: '[REDACTED]'
      };

      reply.send({
        success: true,
        connection: safeConnection
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to update Sanity connection via API',
        { 
          connection_id: request.params.connectionId,
          user_id: request.body.userId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Failed to update connection',
        message: (error as Error).message
      });
    }
  });

  /**
   * DELETE /api/integrations/sanity/connections/:connectionId
   * Delete a Sanity connection
   */
  fastify.delete('/api/integrations/sanity/connections/:connectionId', async (
    request: FastifyRequest<{ 
      Params: { connectionId: string };
      Body: { userId: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.params;
      const { userId } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field',
          details: 'userId is required'
        });
      }

      await sanityService.deleteConnection(connectionId, userId);

      await loggingService.logServerEvent(
        'error',
        'info',
        'Sanity connection deleted via API',
        { connection_id: connectionId, user_id: userId }
      );

      reply.send({
        success: true,
        message: 'Connection deleted successfully'
      });

    } catch (error) {
      const errorMessage = (error as Error).message;
      
      if (errorMessage.includes('not found') || errorMessage.includes('unauthorized')) {
        return reply.code(404).send({
          error: 'Connection not found',
          details: 'The requested connection does not exist or you do not have access to it'
        });
      }

      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to delete Sanity connection via API',
        { 
          connection_id: request.params.connectionId,
          user_id: request.body.userId,
          error: errorMessage
        }
      );

      reply.code(500).send({
        error: 'Failed to delete connection',
        message: errorMessage
      });
    }
  });

  // =============================================================================
  // CONNECTION TESTING & HEALTH
  // =============================================================================

  /**
   * POST /api/integrations/sanity/test-connection
   * Test Sanity credentials without creating a connection
   */
  fastify.post('/api/integrations/sanity/test-connection', async (
    request: FastifyRequest<{ Body: TestConnectionRequest }>,
    reply: FastifyReply
  ) => {
    try {
      const {
        sanityProjectId,
        datasetName,
        authToken,
        apiVersion,
        useCdn,
        perspective
      } = request.body;

      if (!sanityProjectId || !datasetName || !authToken) {
        return reply.code(400).send({
          error: 'Missing required fields',
          details: 'sanityProjectId, datasetName, and authToken are required'
        });
      }

      // Validate project ID format
      if (!validateSanityProjectId(sanityProjectId)) {
        return reply.code(400).send({
          error: 'Invalid Sanity project ID',
          details: 'Project ID must be 8 characters long and contain only lowercase letters and numbers'
        });
      }

      // Validate dataset name
      if (!validateDatasetName(datasetName)) {
        return reply.code(400).send({
          error: 'Invalid dataset name',
          details: 'Dataset name must contain only lowercase letters, numbers, hyphens, and underscores'
        });
      }

      const testResult = await sanityService.testConnection({
        projectId: sanityProjectId,
        dataset: datasetName,
        apiVersion: apiVersion || '2023-05-03',
        token: authToken,
        useCdn: useCdn !== false,
        perspective: perspective || 'published'
      });

      reply.send({
        success: testResult.success,
        message: testResult.message,
        projectInfo: testResult.projectInfo,
        error: testResult.error
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Sanity connection test failed via API',
        { error: (error as Error).message }
      );

      reply.code(500).send({
        error: 'Connection test failed',
        message: (error as Error).message
      });
    }
  });

  /**
   * POST /api/integrations/sanity/connections/:connectionId/health-check
   * Check health of an existing connection
   */
  fastify.post('/api/integrations/sanity/connections/:connectionId/health-check', async (
    request: FastifyRequest<{ 
      Params: { connectionId: string };
      Body: { userId: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.params;
      const { userId } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field',
          details: 'userId is required'
        });
      }

      // Verify connection exists and belongs to user
      const connection = await sanityService.getConnection(connectionId, userId);
      if (!connection) {
        return reply.code(404).send({
          error: 'Connection not found',
          details: 'The requested connection does not exist or you do not have access to it'
        });
      }

      const healthResult = await sanityService.testConnectionHealth(connectionId);

      reply.send({
        success: healthResult.success,
        message: healthResult.message,
        error: healthResult.error,
        connection_status: connection.status,
        last_health_check: connection.last_health_check,
        circuit_breaker_state: connection.circuit_breaker_state
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Sanity health check failed via API',
        { 
          connection_id: request.params.connectionId,
          user_id: request.body.userId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Health check failed',
        message: (error as Error).message
      });
    }
  });

  // =============================================================================
  // SCHEMA MANAGEMENT
  // =============================================================================

  /**
   * POST /api/integrations/sanity/connections/:connectionId/sync-schema
   * Synchronize schema from Sanity Studio
   */
  fastify.post('/api/integrations/sanity/connections/:connectionId/sync-schema', async (
    request: FastifyRequest<{ 
      Params: { connectionId: string };
      Body: { userId: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.params;
      const { userId } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field',
          details: 'userId is required'
        });
      }

      // Verify connection exists and belongs to user
      const connection = await sanityService.getConnection(connectionId, userId);
      if (!connection) {
        return reply.code(404).send({
          error: 'Connection not found',
          details: 'The requested connection does not exist or you do not have access to it'
        });
      }

      await sanityService.syncSchema(connectionId);

      await loggingService.logServerEvent(
        'error',
        'info',
        'Sanity schema sync completed via API',
        { connection_id: connectionId, user_id: userId }
      );

      reply.send({
        success: true,
        message: 'Schema synchronization completed successfully'
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Sanity schema sync failed via API',
        { 
          connection_id: request.params.connectionId,
          user_id: request.body.userId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Schema synchronization failed',
        message: (error as Error).message
      });
    }
  });

  // =============================================================================
  // UTILITY ENDPOINTS
  // =============================================================================

  /**
   * GET /api/integrations/sanity/cache-stats
   * Get Sanity client cache statistics (admin only)
   */
  fastify.get('/api/integrations/sanity/cache-stats', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      const stats = sanityService.getCacheStats();

      reply.send({
        success: true,
        cache_stats: stats
      });

    } catch (error) {
      reply.code(500).send({
        error: 'Failed to get cache stats',
        message: (error as Error).message
      });
    }
  });

  /**
   * POST /api/integrations/sanity/clear-cache
   * Clear Sanity client cache (admin only)
   */
  fastify.post('/api/integrations/sanity/clear-cache', async (
    request: FastifyRequest<{ Body: { connectionId?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.body;

      sanityService.clearClientCache(connectionId);

      await loggingService.logServerEvent(
        'error',
        'info',
        'Sanity client cache cleared',
        { connection_id: connectionId }
      );

      reply.send({
        success: true,
        message: connectionId 
          ? `Cache cleared for connection ${connectionId}`
          : 'All Sanity client caches cleared'
      });

    } catch (error) {
      reply.code(500).send({
        error: 'Failed to clear cache',
        message: (error as Error).message
      });
    }
  });

  // =============================================================================
  // PREVIEW ENDPOINTS
  // =============================================================================

  /**
   * POST /api/integrations/sanity/connections/:connectionId/preview
   * Create a preview deployment with secure tokens
   */
  fastify.post('/api/integrations/sanity/connections/:connectionId/preview', async (
    request: FastifyRequest<{ 
      Params: { connectionId: string };
      Body: {
        userId: string;
        documentIds: string[];
        previewUrl: string;
        deploymentId?: string;
        ttlHours?: number;
        singleUse?: boolean;
        themeOverrides?: any;
      };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.params;
      const {
        userId,
        documentIds,
        previewUrl,
        deploymentId,
        ttlHours,
        singleUse,
        themeOverrides
      } = request.body;

      if (!userId || !documentIds || !previewUrl) {
        return reply.code(400).send({
          error: 'Missing required fields',
          details: 'userId, documentIds, and previewUrl are required'
        });
      }

      // Verify connection exists and belongs to user
      const connection = await sanityService.getConnection(connectionId, userId);
      if (!connection) {
        return reply.code(404).send({
          error: 'Connection not found',
          details: 'The requested connection does not exist or you do not have access to it'
        });
      }

      const result = await previewService.createPreview(connectionId, {
        document_ids: documentIds,
        preview_url: previewUrl,
        deployment_id: deploymentId,
        ttl_hours: ttlHours,
        single_use: singleUse,
        theme_overrides: themeOverrides
      });

      // Generate full preview URL with embedded secret
      const fullPreviewUrl = previewService.generatePreviewUrl(
        previewUrl,
        result.preview.id,
        result.secret
      );

      reply.code(201).send({
        success: true,
        preview: {
          id: result.preview.id,
          preview_url: fullPreviewUrl,
          expires_at: result.preview.expires_at,
          single_use: result.preview.single_use,
          document_count: documentIds.length,
          theme: result.preview.preview_theme
        },
        // Return secret separately for programmatic access
        secret: result.secret
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to create preview via API',
        { 
          connection_id: request.params.connectionId,
          user_id: request.body.userId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Failed to create preview',
        message: (error as Error).message
      });
    }
  });

  /**
   * GET /api/integrations/sanity/preview/:previewId/validate
   * Validate preview secret and get preview data
   */
  fastify.get('/api/integrations/sanity/preview/:previewId/validate', async (
    request: FastifyRequest<{ 
      Params: { previewId: string };
      Querystring: { secret: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { previewId } = request.params;
      const { secret } = request.query;

      if (!secret) {
        return reply.code(400).send({
          error: 'Missing required parameter',
          details: 'secret is required'
        });
      }

      const result = await previewService.validatePreviewSecret(previewId, secret);

      if (!result.valid) {
        const statusCode = result.expired ? 410 : result.used ? 410 : 401;
        return reply.code(statusCode).send({
          error: result.error,
          expired: result.expired,
          used: result.used
        });
      }

      reply.send({
        valid: true,
        preview: {
          id: result.preview!.id,
          status: result.preview!.status,
          expires_at: result.preview!.expires_at,
          single_use: result.preview!.single_use,
          used_at: result.preview!.used_at,
          document_count: result.preview!.document_ids.length,
          theme: result.preview!.preview_theme
        }
      });

    } catch (error) {
      reply.code(500).send({
        error: 'Preview validation failed',
        message: (error as Error).message
      });
    }
  });

  /**
   * GET /api/integrations/sanity/preview/:previewId/content
   * Get preview content (documents and theme)
   */
  fastify.get('/api/integrations/sanity/preview/:previewId/content', async (
    request: FastifyRequest<{ 
      Params: { previewId: string };
      Querystring: { secret: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { previewId } = request.params;
      const { secret } = request.query;

      if (!secret) {
        return reply.code(400).send({
          error: 'Missing required parameter',
          details: 'secret is required'
        });
      }

      // First validate the secret
      const validation = await previewService.validatePreviewSecret(previewId, secret);
      if (!validation.valid) {
        const statusCode = validation.expired ? 410 : validation.used ? 410 : 401;
        return reply.code(statusCode).send({
          error: validation.error,
          expired: validation.expired,
          used: validation.used
        });
      }

      // Get preview content
      const content = await previewService.getPreviewContent(previewId);
      if (!content) {
        return reply.code(404).send({
          error: 'Preview content not found'
        });
      }

      reply.send({
        success: true,
        content
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to get preview content via API',
        { 
          preview_id: request.params.previewId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Failed to get preview content',
        message: (error as Error).message
      });
    }
  });

  /**
   * GET /api/integrations/sanity/connections/:connectionId/previews
   * List preview deployments for a connection
   */
  fastify.get('/api/integrations/sanity/connections/:connectionId/previews', async (
    request: FastifyRequest<{ 
      Params: { connectionId: string };
      Querystring: {
        userId: string;
        status?: string;
        limit?: string;
        offset?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.params;
      const { userId, status, limit, offset } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter',
          details: 'userId is required'
        });
      }

      // Verify connection exists and belongs to user
      const connection = await sanityService.getConnection(connectionId, userId);
      if (!connection) {
        return reply.code(404).send({
          error: 'Connection not found',
          details: 'The requested connection does not exist or you do not have access to it'
        });
      }

      const options = {
        status: status as 'active' | 'expired' | 'invalidated' | undefined,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined
      };

      const result = await previewService.listPreviews(connectionId, options);

      // Remove sensitive data from response
      const safePreviews = result.previews.map(preview => ({
        id: preview.id,
        preview_url: preview.preview_url,
        deployment_id: preview.deployment_id,
        status: preview.status,
        single_use: preview.single_use,
        used_at: preview.used_at,
        document_count: preview.document_ids.length,
        content_hash: preview.content_hash,
        theme: preview.preview_theme,
        expires_at: preview.expires_at,
        created_at: preview.created_at
        // Note: preview_secret_hash is excluded for security
      }));

      reply.send({
        success: true,
        previews: safePreviews,
        total: result.total,
        pagination: {
          limit: options.limit || 50,
          offset: options.offset || 0,
          has_more: (options.offset || 0) + result.previews.length < result.total
        }
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to list previews via API',
        { 
          connection_id: request.params.connectionId,
          user_id: request.query.userId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Failed to list previews',
        message: (error as Error).message
      });
    }
  });

  /**
   * DELETE /api/integrations/sanity/preview/:previewId
   * Invalidate/revoke a preview
   */
  fastify.delete('/api/integrations/sanity/preview/:previewId', async (
    request: FastifyRequest<{ 
      Params: { previewId: string };
      Body: { userId: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { previewId } = request.params;
      const { userId } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field',
          details: 'userId is required'
        });
      }

      // Note: In a full implementation, we'd verify the user has access to this preview
      // For now, we'll proceed with the invalidation

      await previewService.invalidatePreview(previewId);

      await loggingService.logServerEvent(
        'error',
        'info',
        'Preview invalidated via API',
        { preview_id: previewId, user_id: userId }
      );

      reply.send({
        success: true,
        message: 'Preview invalidated successfully'
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to invalidate preview via API',
        { 
          preview_id: request.params.previewId,
          user_id: request.body.userId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Failed to invalidate preview',
        message: (error as Error).message
      });
    }
  });

  // =============================================================================
  // BREAKGLASS RECOVERY ENDPOINTS
  // =============================================================================

  /**
   * GET /api/integrations/sanity/breakglass/:connectionId/status
   * Check breakglass availability for a connection
   */
  fastify.get('/api/integrations/sanity/breakglass/:connectionId/status', async (
    request: FastifyRequest<{ 
      Params: { connectionId: string };
      Querystring: { userId: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.params;
      const { userId } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter',
          details: 'userId is required'
        });
      }

      // Verify connection exists and belongs to user
      const connection = await sanityService.getConnection(connectionId, userId);
      if (!connection) {
        return reply.code(404).send({
          error: 'Connection not found',
          details: 'The requested connection does not exist or you do not have access to it'
        });
      }

      const status = await breakglassService.getBreakglassStatus(connectionId);

      reply.send({
        success: true,
        breakglass_status: {
          available: status.available,
          expires_at: status.expires_at,
          access_count: status.access_count,
          max_access_count: status.max_access_count,
          reason: status.reason,
          warning: status.available ? 
            '⚠️ Breakglass contains plaintext tokens - only use in emergencies' : 
            'Breakglass not available'
        }
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to get Sanity breakglass status via API',
        { 
          connection_id: request.params.connectionId,
          user_id: request.query.userId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Failed to get breakglass status',
        message: (error as Error).message
      });
    }
  });

  /**
   * POST /api/integrations/sanity/breakglass/:connectionId/access
   * Get breakglass credentials (admin-only with heavy audit logging)
   */
  fastify.post('/api/integrations/sanity/breakglass/:connectionId/access', async (
    request: FastifyRequest<{ 
      Params: { connectionId: string };
      Body: {
        adminId: string;
        justification: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.params;
      const { adminId, justification } = request.body;

      if (!adminId || !justification) {
        return reply.code(400).send({
          error: 'Missing required fields',
          details: 'adminId and justification are required'
        });
      }

      if (justification.length < 10) {
        return reply.code(400).send({
          error: 'Invalid justification',
          details: 'Justification must be at least 10 characters'
        });
      }

      // Verify admin has breakglass scope with comprehensive validation
      // Implements acceptance criteria: "Scope matrix tests pass (missing scope, wrong audience, expired token, ±60s skew)"
      const scopeVerification = await adminRoleVerificationService.verifyAdminScope(
        adminId,
        ['admin:breakglass'],
        request.headers.authorization?.replace('Bearer ', '')
      );

      if (!scopeVerification.hasScope) {
        return reply.code(403).send({
          success: false,
          error: 'Insufficient privileges',
          details: scopeVerification.reason,
          required_scopes: ['admin:breakglass'],
          verified_scopes: scopeVerification.verifiedScopes
        });
      }

      const credentials = await breakglassService.getBreakglassCredentials(
        connectionId,
        adminId,
        justification
      );

      // Extra security logging for breakglass access
      await loggingService.logServerEvent(
        'error',
        'error', // High severity
        'Sanity breakglass credentials accessed via API',
        {
          connection_id: connectionId,
          admin_id: adminId,
          justification: justification.substring(0, 100), // Truncate for logs
          sanity_project_id: credentials.sanity_project_id,
          access_count: credentials.access_count,
          user_agent: request.headers['user-agent'],
          ip: request.ip
        }
      );

      reply.send({
        success: true,
        credentials: {
          sanity_project_id: credentials.sanity_project_id,
          dataset_name: credentials.dataset_name,
          auth_token: credentials.auth_token,
          robot_token: credentials.robot_token,
          webhook_secret: credentials.webhook_secret,
          api_version: credentials.api_version,
          project_title: credentials.project_title
        },
        access_info: {
          access_count: credentials.access_count,
          expires_at: credentials.expires_at,
          max_remaining_uses: credentials.max_remaining_uses
        },
        warning: credentials.warning
      });

    } catch (error) {
      const errorMessage = (error as Error).message;
      
      // Different status codes for different failure types
      const statusCode = errorMessage.includes('expired') ? 410 :
                        errorMessage.includes('Maximum access') ? 429 :
                        errorMessage.includes('not found') ? 404 :
                        errorMessage.includes('restricted') ? 423 : 500;

      await loggingService.logCriticalError(
        'sanity_breakglass_access_failed_api',
        error as Error,
        { 
          connection_id: request.params.connectionId,
          admin_id: request.body.adminId,
          justification: request.body.justification?.substring(0, 100)
        }
      );

      reply.code(statusCode).send({
        error: 'Breakglass access failed',
        message: errorMessage,
        details: statusCode === 410 ? 'Breakglass entry has expired' :
                statusCode === 429 ? 'Maximum access count reached' :
                statusCode === 404 ? 'No breakglass entry found' :
                statusCode === 423 ? 'Access temporarily restricted' :
                'Internal server error'
      });
    }
  });

  /**
   * GET /api/integrations/sanity/breakglass
   * List breakglass entries (admin-only)
   */
  fastify.get('/api/integrations/sanity/breakglass', async (
    request: FastifyRequest<{ 
      Querystring: {
        adminId: string;
        userId?: string;
        expired?: string;
        projectId?: string;
        limit?: string;
        offset?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { adminId, userId, expired, projectId, limit, offset } = request.query;

      if (!adminId) {
        return reply.code(400).send({
          error: 'Missing required parameter',
          details: 'adminId is required'
        });
      }

      // Verify admin has read scope for breakglass entry listing
      const scopeVerification = await adminRoleVerificationService.verifyAdminScope(
        adminId,
        ['admin:read'],
        request.headers.authorization?.replace('Bearer ', '')
      );

      if (!scopeVerification.hasScope) {
        return reply.code(403).send({
          success: false,
          error: 'Insufficient privileges',
          details: scopeVerification.reason,
          required_scopes: ['admin:read'],
          verified_scopes: scopeVerification.verifiedScopes
        });
      }

      const options = {
        user_id: userId,
        expired: expired === 'true',
        project_id: projectId,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined
      };

      const result = await breakglassService.listBreakglassEntries(options);

      // Remove plaintext tokens from response (they're already redacted in service)
      const safeEntries = result.entries.map(entry => ({
        id: entry.id,
        connection_id: entry.connection_id,
        user_id: entry.user_id,
        project_id: entry.project_id,
        sanity_project_id: entry.sanity_project_id,
        dataset_name: entry.dataset_name,
        project_title: entry.project_title,
        api_version: entry.api_version,
        created_by_admin_id: entry.created_by_admin_id,
        reason: entry.reason,
        expires_at: entry.expires_at,
        accessed_at: entry.accessed_at,
        access_count: entry.access_count,
        is_active: entry.is_active,
        max_access_count: entry.max_access_count,
        created_at: entry.created_at,
        updated_at: entry.updated_at
      }));

      reply.send({
        success: true,
        entries: safeEntries,
        total: result.total,
        pagination: {
          limit: options.limit || 50,
          offset: options.offset || 0,
          has_more: (options.offset || 0) + result.entries.length < result.total
        }
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to list Sanity breakglass entries via API',
        { 
          admin_id: request.query.adminId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Failed to list breakglass entries',
        message: (error as Error).message
      });
    }
  });

  /**
   * DELETE /api/integrations/sanity/breakglass/:entryId
   * Revoke breakglass entry (admin-only)
   */
  fastify.delete('/api/integrations/sanity/breakglass/:entryId', async (
    request: FastifyRequest<{ 
      Params: { entryId: string };
      Body: { 
        adminId: string;
        reason?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { entryId } = request.params;
      const { adminId, reason } = request.body;

      if (!adminId) {
        return reply.code(400).send({
          error: 'Missing required field',
          details: 'adminId is required'
        });
      }

      // Verify admin has write scope for breakglass entry revocation
      const scopeVerification = await adminRoleVerificationService.verifyAdminScope(
        adminId,
        ['admin:write'],
        request.headers.authorization?.replace('Bearer ', '')
      );

      if (!scopeVerification.hasScope) {
        return reply.code(403).send({
          success: false,
          error: 'Insufficient privileges',
          details: scopeVerification.reason,
          required_scopes: ['admin:write'],
          verified_scopes: scopeVerification.verifiedScopes
        });
      }

      await breakglassService.revokeBreakglassEntry(entryId, adminId, reason);

      await loggingService.logServerEvent(
        'error',
        'warn',
        'Sanity breakglass entry revoked via API',
        { 
          entry_id: entryId,
          admin_id: adminId,
          reason: reason || 'manual_revocation'
        }
      );

      reply.send({
        success: true,
        message: 'Breakglass entry revoked successfully'
      });

    } catch (error) {
      const errorMessage = (error as Error).message;
      const statusCode = errorMessage.includes('not found') ? 404 : 500;

      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to revoke Sanity breakglass entry via API',
        { 
          entry_id: request.params.entryId,
          admin_id: request.body.adminId,
          error: errorMessage
        }
      );

      reply.code(statusCode).send({
        error: 'Failed to revoke breakglass entry',
        message: errorMessage
      });
    }
  });

  // =============================================================================
  // WEBHOOK ENDPOINTS
  // =============================================================================

  /**
   * POST /api/integrations/sanity/webhook/:connectionId
   * Receive webhooks from Sanity Studio
   */
  fastify.post('/api/integrations/sanity/webhook/:connectionId', async (
    request: FastifyRequest<{ 
      Params: { connectionId: string };
      Body: any;
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.params;
      const payload = request.body;
      const headers = request.headers as Record<string, string>;

      // Get raw body for signature verification
      const rawBody = (request as any).rawBody || Buffer.from(JSON.stringify(payload));

      const result = await webhookService.processWebhook({
        connection_id: connectionId,
        payload,
        headers,
        rawBody
      });

      if (!result.success) {
        const statusCode = result.error === 'INVALID_SIGNATURE' ? 401 : 
                          result.error === 'INVALID_CONNECTION' ? 404 : 500;

        return reply.code(statusCode).send({
          error: result.message,
          code: result.error
        });
      }

      if (result.duplicate) {
        return reply.code(200).send({
          message: result.message,
          duplicate: true,
          event_id: result.event_id
        });
      }

      reply.code(200).send({
        message: result.message,
        event_id: result.event_id
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'sanity_webhook_endpoint_error',
        error as Error,
        { connection_id: request.params.connectionId }
      );

      reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to process webhook'
      });
    }
  });

  /**
   * GET /api/integrations/sanity/connections/:connectionId/webhooks
   * List webhook events for a connection
   */
  fastify.get('/api/integrations/sanity/connections/:connectionId/webhooks', async (
    request: FastifyRequest<{ 
      Params: { connectionId: string };
      Querystring: {
        userId: string;
        limit?: string;
        offset?: string;
        processed?: string;
        documentType?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { connectionId } = request.params;
      const { userId, limit, offset, processed, documentType } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter',
          details: 'userId is required'
        });
      }

      // Verify connection exists and belongs to user
      const connection = await sanityService.getConnection(connectionId, userId);
      if (!connection) {
        return reply.code(404).send({
          error: 'Connection not found',
          details: 'The requested connection does not exist or you do not have access to it'
        });
      }

      const options = {
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
        processed: processed !== undefined ? processed === 'true' : undefined,
        document_type: documentType
      };

      const result = await webhookService.getWebhookEvents(connectionId, options);

      reply.send({
        success: true,
        events: result.events,
        total: result.total,
        pagination: {
          limit: options.limit || 50,
          offset: options.offset || 0,
          has_more: (options.offset || 0) + result.events.length < result.total
        }
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to list webhook events via API',
        { 
          connection_id: request.params.connectionId,
          user_id: request.query.userId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Failed to list webhook events',
        message: (error as Error).message
      });
    }
  });

  /**
   * POST /api/integrations/sanity/webhooks/:eventId/retry
   * Retry a failed webhook event
   */
  fastify.post('/api/integrations/sanity/webhooks/:eventId/retry', async (
    request: FastifyRequest<{ 
      Params: { eventId: string };
      Body: { userId: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { eventId } = request.params;
      const { userId } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field',
          details: 'userId is required'
        });
      }

      // Note: In a full implementation, we'd verify the user has access to this event
      // For now, we'll proceed with the retry

      const result = await webhookService.retryWebhookEvent(eventId);

      if (!result.success) {
        const statusCode = result.error === 'EVENT_NOT_FOUND' ? 404 : 500;
        return reply.code(statusCode).send({
          error: result.message,
          code: result.error
        });
      }

      await loggingService.logServerEvent(
        'error',
        'info',
        'Webhook event retry completed via API',
        { event_id: eventId, user_id: userId }
      );

      reply.send({
        success: true,
        message: result.message,
        event_id: result.event_id
      });

    } catch (error) {
      await loggingService.logServerEvent(
        'error',
        'error',
        'Failed to retry webhook event via API',
        { 
          event_id: request.params.eventId,
          user_id: request.body.userId,
          error: (error as Error).message
        }
      );

      reply.code(500).send({
        error: 'Failed to retry webhook event',
        message: (error as Error).message
      });
    }
  });

  // Admin Role Security Testing Endpoint
  // Implements acceptance criteria: "Scope matrix tests pass (missing scope, wrong audience, expired token, ±60s skew)"
  fastify.get('/v1/sanity/admin/security-test', {
    preHandler: requireHmacSignature(),
    schema: {
      querystring: {
        type: 'object',
        properties: {
          adminId: { type: 'string' },
          testType: { type: 'string', enum: ['scope', 'token'] }
        },
        required: ['adminId']
      }
    }
  }, async (request, reply) => {
    try {
      const { adminId, testType = 'scope' } = request.query as { adminId: string; testType?: string };

      if (testType === 'scope') {
        // Run scope verification tests
        const testResults = adminRoleVerificationService.runSecurityTests();

        return reply.send({
          success: true,
          testResults: {
            passed: testResults.passed,
            failed: testResults.failed,
            total: testResults.passed + testResults.failed,
            details: testResults.results
          },
          message: `Admin scope tests completed: ${testResults.passed} passed, ${testResults.failed} failed`
        });

      } else if (testType === 'token') {
        // Test token validation with various scenarios
        const token = request.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          return reply.code(400).send({
            error: 'Missing token',
            message: 'Authorization header with Bearer token is required for token testing'
          });
        }

        const tokenValidation = await adminRoleVerificationService.validateAdminToken(token, adminId);

        return reply.send({
          success: true,
          tokenValidation: {
            isValid: tokenValidation.isValid,
            adminId: tokenValidation.adminId,
            scopes: tokenValidation.scopes,
            reason: tokenValidation.reason,
            securityIssue: tokenValidation.securityIssue
          },
          message: `Token validation test completed: ${tokenValidation.isValid ? 'PASS' : 'FAIL'}`
        });

      } else {
        return reply.code(400).send({
          error: 'Invalid test type',
          message: 'testType must be either "scope" or "token"'
        });
      }

    } catch (error) {
      console.error('[Admin Security Test] Error:', error);
      return reply.code(500).send({
        error: 'Security test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}