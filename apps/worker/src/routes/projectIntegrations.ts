import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ProjectIntegrationService } from '../services/projectIntegrationService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { requireHmacSignature } from '../middleware/hmacValidation';

/**
 * Project Integration Registry Routes
 * Provides dashboard and analytics data for project integrations
 * Uses the optimized query patterns recommended by the consultant
 */

interface ProjectIntegrationsRequest {
  userId: string;
}

interface ProjectIntegrationDetailsRequest {
  projectId: string;
}

interface IntegrationStatusRequest {
  projectId: string;
  integrationType: 'supabase' | 'sanity' | 'stripe';
  status: 'connected' | 'pending' | 'disconnected' | 'error' | 'revoked';
  errorReason?: string;
}

export async function projectIntegrationRoutes(fastify: FastifyInstance) {
  const integrationService = ProjectIntegrationService.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  // Apply HMAC validation to all integration routes
  fastify.addHook('preHandler', requireHmacSignature());

  /**
   * GET /v1/internal/integrations/projects
   * Get projects with their active integrations for dashboard
   */
  fastify.get<{ Querystring: ProjectIntegrationsRequest }>(
    '/v1/internal/integrations/projects',
    async (request: FastifyRequest<{ Querystring: ProjectIntegrationsRequest }>, reply: FastifyReply) => {
      const { userId } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      try {
        const projects = await integrationService.getProjectsWithIntegrations(userId);

        await loggingService.logServerEvent(
          'capacity',
          'error',
          'Project integrations retrieved for dashboard',
          { userId, projectCount: projects.length }
        );

        reply.send({
          projects,
          total: projects.length
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'dashboard_integrations_failed',
          error as Error,
          { userId }
        );

        reply.code(500).send({
          error: 'Failed to retrieve project integrations'
        });
      }
    }
  );

  /**
   * GET /v1/internal/integrations/project/:projectId
   * Get detailed integration status for a specific project
   */
  fastify.get<{ Params: ProjectIntegrationDetailsRequest }>(
    '/v1/internal/integrations/project/:projectId',
    async (request: FastifyRequest<{ Params: ProjectIntegrationDetailsRequest }>, reply: FastifyReply) => {
      const { projectId } = request.params;

      try {
        const integrations = await integrationService.getProjectIntegrations(projectId);

        reply.send({
          projectId,
          integrations,
          total: integrations.length
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'project_integration_details_failed',
          error as Error,
          { projectId }
        );

        reply.code(500).send({
          error: 'Failed to retrieve project integration details'
        });
      }
    }
  );

  /**
   * GET /v1/internal/integrations/counts
   * Get integration counts by type for analytics dashboard
   */
  fastify.get('/v1/internal/integrations/counts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const counts = await integrationService.getIntegrationCounts();

      reply.send({
        integrationCounts: counts,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'integration_counts_failed',
        error as Error
      );

      reply.code(500).send({
        error: 'Failed to retrieve integration counts'
      });
    }
  });

  /**
   * GET /v1/internal/integrations/health
   * Get integration health summary for monitoring
   */
  fastify.get('/v1/internal/integrations/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const healthSummary = await integrationService.getIntegrationHealthSummary();

      const isHealthy = healthSummary.health_percentage >= 95;

      reply.send({
        ...healthSummary,
        status: isHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'integration_health_check_failed',
        error as Error
      );

      reply.code(500).send({
        error: 'Failed to retrieve integration health',
        status: 'error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /v1/internal/integrations/status
   * Update integration status (for manual status changes)
   */
  fastify.post<{ Body: IntegrationStatusRequest }>(
    '/v1/internal/integrations/status',
    async (request: FastifyRequest<{ Body: IntegrationStatusRequest }>, reply: FastifyReply) => {
      const { projectId, integrationType, status, errorReason } = request.body;

      if (!projectId || !integrationType || !status) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['projectId', 'integrationType', 'status']
        });
      }

      // Validate integration type
      if (!['supabase', 'sanity', 'stripe'].includes(integrationType)) {
        return reply.code(400).send({
          error: 'Invalid integration type',
          allowed: ['supabase', 'sanity', 'stripe']
        });
      }

      // Validate status
      if (!['connected', 'pending', 'disconnected', 'error', 'revoked'].includes(status)) {
        return reply.code(400).send({
          error: 'Invalid status',
          allowed: ['connected', 'pending', 'disconnected', 'error', 'revoked']
        });
      }

      try {
        const updated = await integrationService.updateIntegrationStatus(
          projectId,
          integrationType,
          status,
          errorReason
        );

        if (!updated) {
          return reply.code(404).send({
            error: 'Integration not found or already in requested status'
          });
        }

        reply.send({
          success: true,
          projectId,
          integrationType,
          status,
          updatedAt: new Date().toISOString()
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'integration_status_update_api_failed',
          error as Error,
          { projectId, integrationType, status }
        );

        reply.code(500).send({
          error: 'Failed to update integration status'
        });
      }
    }
  );

  /**
   * GET /v1/internal/integrations/check/:projectId/:type
   * Quick boolean check if project has specific integration
   */
  fastify.get<{ 
    Params: { projectId: string; type: 'supabase' | 'sanity' | 'stripe' } 
  }>(
    '/v1/internal/integrations/check/:projectId/:type',
    async (request: FastifyRequest<{ 
      Params: { projectId: string; type: 'supabase' | 'sanity' | 'stripe' } 
    }>, reply: FastifyReply) => {
      const { projectId, type } = request.params;

      // Validate integration type
      if (!['supabase', 'sanity', 'stripe'].includes(type)) {
        return reply.code(400).send({
          error: 'Invalid integration type',
          allowed: ['supabase', 'sanity', 'stripe']
        });
      }

      try {
        const hasIntegration = await integrationService.hasIntegration(projectId, type);

        reply.send({
          projectId,
          integrationType: type,
          hasIntegration,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        await loggingService.logServerEvent(
          'capacity',
          'error',
          'Integration check API failed',
          { 
            projectId, 
            integrationType: type, 
            error: (error as Error).message 
          }
        );

        reply.code(500).send({
          error: 'Failed to check integration status',
          projectId,
          integrationType: type,
          hasIntegration: false
        });
      }
    }
  );
}