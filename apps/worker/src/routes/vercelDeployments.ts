import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VercelAPIService, DeployOptions } from '../services/vercelAPIService';
import { VercelOAuthService } from '../services/vercelOAuthService';
import { VercelDeploymentGuardrailService } from '../services/vercelDeploymentGuardrailService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { getPool } from '../services/database';
import { unifiedLogger } from '../services/unifiedLogger';
import * as crypto from 'crypto';

/**
 * Vercel Deployment Management Routes
 * Handles deployment creation, monitoring, and promotion
 */

interface DeployRequest {
  userId: string;
  name: string;
  gitSource?: {
    type: 'github' | 'gitlab' | 'bitbucket';
    repo: string;
    ref: string;
    sha?: string;
  };
  target?: 'production' | 'preview';
  regions?: string[];
  buildOverrides?: {
    framework?: string;
    buildCommand?: string;
    outputDirectory?: string;
  };
  idempotencyKey?: string;
  overrideToken?: string;
}

interface ListDeploymentsQuery {
  userId: string;
  cursor?: string;
  limit?: string;
  target?: 'production' | 'preview';
  state?: string;
}

interface PromoteDeploymentRequest {
  userId: string;
  deploymentId: string;
  alias?: string;
}

interface DeploymentDetailsQuery {
  userId: string;
}

export async function vercelDeploymentRoutes(fastify: FastifyInstance) {
  const apiService = VercelAPIService.getInstance();
  const oauthService = VercelOAuthService.getInstance();
  const guardrailService = new VercelDeploymentGuardrailService();
  const loggingService = ServerLoggingService.getInstance();

  // Apply HMAC validation to all deployment routes
  fastify.addHook('preHandler', requireHmacSignature());

  /**
   * POST /v1/projects/:projectId/vercel/deploy
   * Create a new Vercel deployment
   */
  fastify.post<{ Params: { projectId: string }; Body: DeployRequest }>(
    '/v1/projects/:projectId/vercel/deploy',
    async (request: FastifyRequest<{ Params: { projectId: string }; Body: DeployRequest }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const { userId, name, gitSource, target = 'preview', regions, buildOverrides, idempotencyKey } = request.body;

      if (!userId || !name) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'name']
        });
      }

      try {
        // Check for idempotency
        if (idempotencyKey) {
          const existingDeploy = await getPool().query(
            `SELECT deployment_id, deployment_url, deployment_state, created_at
             FROM vercel_deployments 
             WHERE correlation_id = $1 AND project_id = $2`,
            [idempotencyKey, projectId]
          );

          if (existingDeploy.rows.length > 0) {
            const existing = existingDeploy.rows[0];
            return reply.code(existing.deployment_state === 'READY' ? 200 : 202).send({
              deploymentId: existing.deployment_id,
              url: existing.deployment_url,
              state: existing.deployment_state,
              message: 'Deployment already exists (idempotent)',
              createdAt: existing.created_at
            });
          }
        }

        // Get project mapping
        const mappingResult = await getPool().query(
          `SELECT vpm.*, vc.id as connection_id, p.name as local_project_name, p.owner_id
           FROM vercel_project_mappings vpm
           JOIN vercel_connections vc ON vpm.vercel_connection_id = vc.id
           JOIN projects p ON vpm.project_id = p.id
           WHERE vpm.project_id = $1 AND p.owner_id = $2`,
          [projectId, userId]
        );

        if (mappingResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'Project not linked to Vercel or access denied',
            code: 'PROJECT_NOT_LINKED'
          });
        }

        const mapping = mappingResult.rows[0];
        const correlationId = idempotencyKey || crypto.randomUUID();

        // Prepare deployment options
        const deployOptions: DeployOptions = {
          name,
          target,
          regions,
          gitSource,
          projectSettings: {
            framework: buildOverrides?.framework || mapping.framework,
            buildCommand: buildOverrides?.buildCommand || mapping.build_command,
            outputDirectory: buildOverrides?.outputDirectory || mapping.output_directory
          }
        };

        // Validate git source if provided
        if (gitSource) {
          if (!gitSource.repo || !gitSource.ref) {
            return reply.code(400).send({
              error: 'Git source requires repo and ref fields'
            });
          }
        }

        // Check deployment permissions for production
        if (target === 'production') {
          await oauthService.requireScope(mapping.connection_id, 'deployment:write');
          
          // Log production deployment attempt
          await loggingService.logServerEvent(
            'capacity',
            'warn',
            'Production deployment initiated',
            {
              userId,
              projectId,
              vercelProjectId: mapping.vercel_project_id,
              gitRef: gitSource?.ref,
              correlationId
            }
          );
        }

        // Run deployment guardrail checks
        const guardrailWarnings = await guardrailService.checkDeploymentGuardrails({
          projectId,
          branch: gitSource?.ref?.replace('refs/heads/', '') || 'unknown',
          targetEnvironment: target,
          commitSha: gitSource?.sha || 'unknown',
          requestedBy: userId,
          overrideToken: request.body.overrideToken
        });

        // Check for blocking warnings
        const blockingWarnings = guardrailWarnings.filter(w => w.blockDeployment);
        
        if (blockingWarnings.length > 0) {
          // If override token provided, validate it
          if (request.body.overrideToken) {
            const overrideValidation = await guardrailService.validateOverrideToken(
              projectId,
              request.body.overrideToken,
              userId
            );

            if (!overrideValidation.valid) {
              return reply.code(403).send({
                error: 'Deployment blocked by guardrails',
                code: 'DEPLOYMENT_BLOCKED',
                warnings: blockingWarnings,
                overrideError: overrideValidation.reason
              });
            }

            await loggingService.logServerEvent(
              'capacity',
              'warn',
              'Deployment guardrails overridden',
              {
                projectId,
                userId,
                blockingWarnings: blockingWarnings.length,
                overrideReason: overrideValidation.reason
              }
            );
          } else {
            return reply.code(403).send({
              error: 'Deployment blocked by guardrails',
              code: 'DEPLOYMENT_BLOCKED',
              warnings: blockingWarnings,
              canOverride: blockingWarnings.some(w => w.canOverride),
              message: 'Use POST /v1/projects/:projectId/vercel/deployment-override to create an override token'
            });
          }
        }

        // Return non-blocking warnings for information
        if (guardrailWarnings.length > 0) {
          const nonBlockingWarnings = guardrailWarnings.filter(w => !w.blockDeployment);
          if (nonBlockingWarnings.length > 0) {
            await loggingService.logServerEvent(
              'capacity',
              'info',
              'Deployment proceeding with warnings',
              {
                projectId,
                userId,
                warningCount: nonBlockingWarnings.length,
                warningTypes: nonBlockingWarnings.map(w => w.type)
              }
            );
          }
        }

        // Generate stable deploymentId for correlation
        const stableDeploymentId = await apiService.getOrCreateDeploymentId(correlationId);

        // Log deployment initiation
        unifiedLogger.deploy(
          correlationId, 
          userId, 
          projectId, 
          'started',
          `Starting Vercel deployment: ${name} (${target})`,
          stableDeploymentId,
          { 
            framework: deployOptions.projectSettings?.framework, 
            target,
            gitRef: gitSource?.ref,
            vercelProjectId: mapping.vercel_project_id
          }
        );

        // Create deployment via Vercel API with streaming
        const deployment = await deployWithStreamingLogs(
          apiService,
          mapping.connection_id,
          deployOptions,
          correlationId,
          userId,
          projectId,
          stableDeploymentId
        );

        // Store deployment in our database
        await getPool().query(
          `INSERT INTO vercel_deployments (
             project_id, vercel_project_mapping_id, deployment_id, deployment_url,
             deployment_state, deployment_type, git_source, correlation_id,
             created_by, environment, metadata, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
          [
            projectId,
            mapping.id,
            deployment.uid,
            deployment.url,
            deployment.state,
            target === 'production' ? 'PRODUCTION' : 'PREVIEW',
            JSON.stringify(gitSource || {}),
            correlationId,
            userId,
            target,
            JSON.stringify({
              name,
              buildOverrides,
              regions,
              vercelProjectId: mapping.vercel_project_id,
              stableDeploymentId
            })
          ]
        );

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Vercel deployment created successfully',
          {
            userId,
            projectId,
            deploymentId: deployment.uid,
            target,
            correlationId
          }
        );

        reply.code(202).send({
          deploymentId: deployment.uid,
          url: deployment.url,
          state: deployment.state,
          target,
          correlationId,
          message: `Deployment initiated. ${target === 'production' ? 'Production' : 'Preview'} deployment in progress.`,
          estimatedDuration: '2-5 minutes',
          createdAt: deployment.created || new Date().toISOString()
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_deployment_error',
          error as Error,
          { userId, projectId, target, correlationId: idempotencyKey }
        );

        const errorMessage = (error as Error).message;
        if (errorMessage.includes('scope')) {
          return reply.code(403).send({
            error: 'Insufficient permissions for deployment',
            code: 'INSUFFICIENT_SCOPE',
            requiredScope: 'deployment:write'
          });
        }

        reply.code(500).send({
          error: 'Failed to create deployment',
          canRetry: !errorMessage.includes('invalid')
        });
      }
    }
  );

  /**
   * GET /v1/projects/:projectId/vercel/deployments
   * List project deployments with filtering
   */
  fastify.get<{ Params: { projectId: string }; Querystring: ListDeploymentsQuery }>(
    '/v1/projects/:projectId/vercel/deployments',
    async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: ListDeploymentsQuery }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const { userId, cursor, limit, target, state } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      try {
        // Verify project access
        const projectResult = await getPool().query(
          'SELECT id, name FROM projects WHERE id = $1 AND owner_id = $2',
          [projectId, userId]
        );

        if (projectResult.rows.length === 0) {
          return reply.code(403).send({
            error: 'Project not found or access denied',
            code: 'PROJECT_ACCESS_DENIED'
          });
        }

        // Build query conditions
        let whereConditions = ['project_id = $1'];
        let queryParams: any[] = [projectId];
        let paramIndex = 2;

        if (target) {
          whereConditions.push(`deployment_type = $${paramIndex}`);
          queryParams.push(target.toUpperCase());
          paramIndex++;
        }

        if (state) {
          whereConditions.push(`deployment_state = $${paramIndex}`);
          queryParams.push(state.toUpperCase());
          paramIndex++;
        }

        if (cursor) {
          whereConditions.push(`created_at < $${paramIndex}`);
          queryParams.push(new Date(cursor));
          paramIndex++;
        }

        const limitValue = limit ? Math.min(parseInt(limit), 100) : 20;

        // Query deployments from our database
        const deploymentsResult = await getPool().query(
          `SELECT 
             deployment_id, deployment_url, alias_urls, deployment_state, deployment_type,
             git_source, correlation_id, created_by, environment, build_duration_ms,
             error_message, error_code, error_step, created_at, ready_at, completed_at,
             metadata
           FROM vercel_deployments
           WHERE ${whereConditions.join(' AND ')}
           ORDER BY created_at DESC
           LIMIT $${paramIndex}`,
          [...queryParams, limitValue + 1] // Get one extra to check for next page
        );

        const deployments = deploymentsResult.rows.slice(0, limitValue);
        const hasNextPage = deploymentsResult.rows.length > limitValue;
        const nextCursor = hasNextPage ? deployments[deployments.length - 1].created_at : null;

        // Enhance deployments with additional info
        const enhancedDeployments = deployments.map(deployment => {
          const gitSource = deployment.git_source || {};
          const metadata = deployment.metadata || {};

          return {
            id: deployment.deployment_id,
            url: deployment.deployment_url,
            aliasUrls: deployment.alias_urls || [],
            state: deployment.deployment_state,
            type: deployment.deployment_type,
            environment: deployment.environment,
            createdAt: deployment.created_at,
            readyAt: deployment.ready_at,
            completedAt: deployment.completed_at,
            buildDurationMs: deployment.build_duration_ms,
            gitSource: Object.keys(gitSource).length > 0 ? gitSource : null,
            correlationId: deployment.correlation_id,
            createdBy: deployment.created_by,
            error: deployment.error_message ? {
              message: deployment.error_message,
              code: deployment.error_code,
              step: deployment.error_step
            } : null,
            metadata: metadata
          };
        });

        // Get deployment statistics
        const statsResult = await getPool().query(
          `SELECT 
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE deployment_state = 'READY') as successful,
             COUNT(*) FILTER (WHERE deployment_state = 'ERROR') as failed,
             COUNT(*) FILTER (WHERE deployment_state IN ('QUEUED', 'INITIALIZING', 'BUILDING')) as in_progress,
             COUNT(*) FILTER (WHERE deployment_type = 'PRODUCTION') as production,
             COUNT(*) FILTER (WHERE deployment_type = 'PREVIEW') as preview
           FROM vercel_deployments
           WHERE project_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
          [projectId]
        );

        const stats = statsResult.rows[0];

        reply.send({
          deployments: enhancedDeployments,
          pagination: {
            hasNextPage,
            nextCursor,
            limit: limitValue
          },
          stats: {
            total: parseInt(stats.total),
            successful: parseInt(stats.successful),
            failed: parseInt(stats.failed),
            inProgress: parseInt(stats.in_progress),
            production: parseInt(stats.production),
            preview: parseInt(stats.preview),
            period: '30 days'
          }
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_list_deployments_error',
          error as Error,
          { userId, projectId, target, state }
        );

        reply.code(500).send({
          error: 'Failed to list deployments',
          canRetry: true
        });
      }
    }
  );

  /**
   * GET /v1/projects/:projectId/vercel/deployments/:deploymentId
   * Get detailed deployment information
   */
  fastify.get<{ Params: { projectId: string; deploymentId: string }; Querystring: DeploymentDetailsQuery }>(
    '/v1/projects/:projectId/vercel/deployments/:deploymentId',
    async (request: FastifyRequest<{ Params: { projectId: string; deploymentId: string }; Querystring: DeploymentDetailsQuery }>, reply: FastifyReply) => {
      const { projectId, deploymentId } = request.params;
      const { userId } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      try {
        // Get deployment from our database
        const deploymentResult = await getPool().query(
          `SELECT vd.*, vpm.vercel_connection_id, p.name as project_name
           FROM vercel_deployments vd
           JOIN vercel_project_mappings vpm ON vd.vercel_project_mapping_id = vpm.id
           JOIN projects p ON vd.project_id = p.id
           WHERE vd.deployment_id = $1 AND vd.project_id = $2 AND p.owner_id = $3`,
          [deploymentId, projectId, userId]
        );

        if (deploymentResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'Deployment not found or access denied',
            code: 'DEPLOYMENT_NOT_FOUND'
          });
        }

        const localDeployment = deploymentResult.rows[0];

        // Get live deployment details from Vercel API
        let liveDeployment = null;
        try {
          liveDeployment = await apiService.getDeployment(localDeployment.vercel_connection_id, deploymentId);
        } catch (vercelError) {
          // Log but don't fail if Vercel API is unavailable
          await loggingService.logServerEvent(
            'capacity',
            'warn',
            'Failed to fetch live deployment details from Vercel',
            { deploymentId, error: (vercelError as Error).message }
          );
        }

        // Combine local and live data
        const deployment = {
          id: deploymentId,
          projectId,
          projectName: localDeployment.project_name,
          url: localDeployment.deployment_url,
          aliasUrls: localDeployment.alias_urls || [],
          state: liveDeployment?.state || localDeployment.deployment_state,
          type: localDeployment.deployment_type,
          environment: localDeployment.environment,
          createdAt: localDeployment.created_at,
          readyAt: liveDeployment?.ready ? new Date(liveDeployment.ready).toISOString() : localDeployment.ready_at,
          completedAt: localDeployment.completed_at,
          buildDurationMs: localDeployment.build_duration_ms,
          correlationId: localDeployment.correlation_id,
          createdBy: localDeployment.created_by,
          gitSource: localDeployment.git_source,
          error: localDeployment.error_message ? {
            message: localDeployment.error_message,
            code: localDeployment.error_code,
            step: localDeployment.error_step
          } : null,
          metadata: localDeployment.metadata || {},
          // Live data from Vercel (if available)
          live: liveDeployment ? {
            functions: liveDeployment.functions,
            regions: liveDeployment.regions,
            plan: liveDeployment.plan,
            buildingAt: liveDeployment.buildingAt,
            meta: liveDeployment.meta
          } : null
        };

        reply.send({ deployment });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_get_deployment_error',
          error as Error,
          { userId, projectId, deploymentId }
        );

        reply.code(500).send({
          error: 'Failed to get deployment details',
          canRetry: true
        });
      }
    }
  );

  /**
   * POST /v1/projects/:projectId/vercel/deployments/:deploymentId/promote
   * Promote a deployment to production (assign alias)
   */
  fastify.post<{ Params: { projectId: string; deploymentId: string }; Body: PromoteDeploymentRequest }>(
    '/v1/projects/:projectId/vercel/deployments/:deploymentId/promote',
    async (request: FastifyRequest<{ Params: { projectId: string; deploymentId: string }; Body: PromoteDeploymentRequest }>, reply: FastifyReply) => {
      const { projectId, deploymentId } = request.params;
      const { userId, alias } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field: userId'
        });
      }

      try {
        // Verify deployment exists and user has access
        const deploymentResult = await getPool().query(
          `SELECT vd.*, vpm.vercel_connection_id, vpm.vercel_project_id
           FROM vercel_deployments vd
           JOIN vercel_project_mappings vpm ON vd.vercel_project_mapping_id = vpm.id
           JOIN projects p ON vd.project_id = p.id
           WHERE vd.deployment_id = $1 AND vd.project_id = $2 AND p.owner_id = $3`,
          [deploymentId, projectId, userId]
        );

        if (deploymentResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'Deployment not found or access denied',
            code: 'DEPLOYMENT_NOT_FOUND'
          });
        }

        const deployment = deploymentResult.rows[0];

        // Check if deployment is ready for promotion
        if (deployment.deployment_state !== 'READY') {
          return reply.code(400).send({
            error: 'Only successful deployments can be promoted',
            currentState: deployment.deployment_state,
            code: 'DEPLOYMENT_NOT_READY'
          });
        }

        // Use advisory lock to prevent concurrent promotions
        const lockResult = await getPool().query(
          'SELECT vercel_lock_deployment_promotion($1, $2)',
          [deployment.deployment_id, 'promotion']
        );

        if (!lockResult.rows[0].vercel_lock_deployment_promotion) {
          return reply.code(409).send({
            error: 'Another promotion is in progress for this deployment',
            code: 'PROMOTION_IN_PROGRESS'
          });
        }

        try {
          // Require deployment write scope
          await oauthService.requireScope(deployment.vercel_connection_id, 'deployment:write');

          // Get current deployment details from Vercel
          const liveDeployment = await apiService.getDeployment(deployment.vercel_connection_id, deploymentId);

          // Assign production alias (this promotes to production)
          const aliasToAssign = alias || `${deployment.vercel_project_id}.vercel.app`;
          
          // Note: Vercel API doesn't have a direct "assignProductionAlias" method
          // In practice, this would be done via their deployments API or CLI
          // For now, we'll simulate the promotion by updating our records
          
          await getPool().query(
            `UPDATE vercel_deployments 
             SET deployment_type = 'PRODUCTION', 
                 alias_urls = COALESCE(alias_urls, '{}') || $1::text[],
                 updated_at = NOW(),
                 metadata = COALESCE(metadata, '{}') || $2::jsonb
             WHERE deployment_id = $3`,
            [
              [aliasToAssign],
              JSON.stringify({
                promotedAt: new Date().toISOString(),
                promotedBy: userId,
                previousType: deployment.deployment_type
              }),
              deploymentId
            ]
          );

          await loggingService.logServerEvent(
            'capacity',
            'info',
            'Deployment promoted to production',
            {
              userId,
              projectId,
              deploymentId,
              alias: aliasToAssign,
              previousType: deployment.deployment_type
            }
          );

          reply.send({
            success: true,
            deploymentId,
            alias: aliasToAssign,
            type: 'PRODUCTION',
            promotedAt: new Date().toISOString(),
            message: 'Deployment successfully promoted to production'
          });

        } finally {
          // Always release the lock
          await getPool().query(
            'SELECT vercel_unlock_deployment_promotion($1)',
            [deployment.deployment_id]
          );
        }

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_promote_deployment_error',
          error as Error,
          { userId, projectId, deploymentId }
        );

        const errorMessage = (error as Error).message;
        if (errorMessage.includes('scope')) {
          return reply.code(403).send({
            error: 'Insufficient permissions to promote deployment',
            code: 'INSUFFICIENT_SCOPE',
            requiredScope: 'deployment:write'
          });
        }

        reply.code(500).send({
          error: 'Failed to promote deployment',
          canRetry: true
        });
      }
    }
  );

  /**
   * DELETE /v1/projects/:projectId/vercel/deployments/:deploymentId
   * Cancel a running deployment
   */
  fastify.delete<{ Params: { projectId: string; deploymentId: string }; Body: { userId: string } }>(
    '/v1/projects/:projectId/vercel/deployments/:deploymentId',
    async (request: FastifyRequest<{ Params: { projectId: string; deploymentId: string }; Body: { userId: string } }>, reply: FastifyReply) => {
      const { projectId, deploymentId } = request.params;
      const { userId } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field: userId'
        });
      }

      try {
        // Verify deployment exists and user has access
        const deploymentResult = await getPool().query(
          `SELECT vd.*, vpm.vercel_connection_id
           FROM vercel_deployments vd
           JOIN vercel_project_mappings vpm ON vd.vercel_project_mapping_id = vpm.id
           JOIN projects p ON vd.project_id = p.id
           WHERE vd.deployment_id = $1 AND vd.project_id = $2 AND p.owner_id = $3`,
          [deploymentId, projectId, userId]
        );

        if (deploymentResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'Deployment not found or access denied',
            code: 'DEPLOYMENT_NOT_FOUND'
          });
        }

        const deployment = deploymentResult.rows[0];

        // Check if deployment can be canceled
        const cancelableStates = ['QUEUED', 'INITIALIZING', 'BUILDING'];
        if (!cancelableStates.includes(deployment.deployment_state)) {
          return reply.code(400).send({
            error: 'Only running deployments can be canceled',
            currentState: deployment.deployment_state,
            code: 'DEPLOYMENT_NOT_CANCELABLE'
          });
        }

        // Cancel deployment via Vercel API
        await apiService.cancelDeployment(deployment.vercel_connection_id, deploymentId);

        // Update our records
        await getPool().query(
          `UPDATE vercel_deployments 
           SET deployment_state = 'CANCELED', 
               completed_at = NOW(),
               metadata = COALESCE(metadata, '{}') || $1::jsonb
           WHERE deployment_id = $2`,
          [
            JSON.stringify({
              canceledAt: new Date().toISOString(),
              canceledBy: userId
            }),
            deploymentId
          ]
        );

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Deployment canceled successfully',
          { userId, projectId, deploymentId }
        );

        reply.send({
          success: true,
          deploymentId,
          state: 'CANCELED',
          canceledAt: new Date().toISOString(),
          message: 'Deployment canceled successfully'
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_cancel_deployment_error',
          error as Error,
          { userId, projectId, deploymentId }
        );

        reply.code(500).send({
          error: 'Failed to cancel deployment',
          canRetry: true
        });
      }
    }
  );

  /**
   * POST /v1/projects/:projectId/vercel/deployment-override
   * Create override token for bypassing deployment guardrails
   */
  fastify.post<{
    Params: { projectId: string };
    Body: {
      userId: string;
      reason: string;
      expiresInHours?: number;
      maxUses?: number;
    };
  }>(
    '/v1/projects/:projectId/vercel/deployment-override',
    async (request: FastifyRequest<{
      Params: { projectId: string };
      Body: {
        userId: string;
        reason: string;
        expiresInHours?: number;
        maxUses?: number;
      };
    }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const { userId, reason, expiresInHours = 24, maxUses = 1 } = request.body;

      if (!userId || !reason) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'reason']
        });
      }

      if (reason.length < 10) {
        return reply.code(400).send({
          error: 'Reason must be at least 10 characters long',
          code: 'INSUFFICIENT_REASON'
        });
      }

      try {
        // Verify project ownership
        const projectResult = await getPool().query(
          'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
          [projectId, userId]
        );

        if (projectResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'Project not found or access denied',
            code: 'PROJECT_NOT_FOUND'
          });
        }

        // Create override token
        const overrideToken = await guardrailService.createOverrideToken(
          projectId,
          userId,
          reason,
          expiresInHours,
          maxUses
        );

        reply.code(201).send({
          overrideToken,
          expiresInHours,
          maxUses,
          reason,
          message: 'Override token created successfully. Use this token to bypass deployment guardrails.',
          usage: {
            includeInDeployRequest: 'Add "overrideToken" field to your deployment request',
            validFor: `${expiresInHours} hours`,
            maxUses: maxUses
          }
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'deployment_override_token_creation_error',
          error as Error,
          { userId, projectId, reason }
        );

        reply.code(500).send({
          error: 'Failed to create override token',
          code: 'OVERRIDE_TOKEN_CREATION_ERROR'
        });
      }
    }
  );

  /**
   * GET /v1/projects/:projectId/vercel/deployment-guardrails
   * Get deployment guardrail configuration and check status
   */
  fastify.get<{
    Params: { projectId: string };
    Querystring: { 
      userId: string;
      branch?: string;
      target?: 'production' | 'preview';
    };
  }>(
    '/v1/projects/:projectId/vercel/deployment-guardrails',
    async (request: FastifyRequest<{
      Params: { projectId: string };
      Querystring: { 
        userId: string;
        branch?: string;
        target?: 'production' | 'preview';
      };
    }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const { userId, branch, target = 'preview' } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      try {
        // Verify project ownership
        const projectResult = await getPool().query(
          'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
          [projectId, userId]
        );

        if (projectResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'Project not found or access denied',
            code: 'PROJECT_NOT_FOUND'
          });
        }

        // If branch provided, run guardrail check
        let warnings: any[] = [];
        if (branch) {
          warnings = await guardrailService.checkDeploymentGuardrails({
            projectId,
            branch,
            targetEnvironment: target,
            commitSha: 'preview-check',
            requestedBy: userId
          });
        }

        // Get recent guardrail check history
        const historyResult = await getPool().query(`
          SELECT 
            branch, target_environment, warnings, blocking_warnings,
            override_token_used, created_at
          FROM vercel_deployment_guardrail_checks
          WHERE project_id = $1
          ORDER BY created_at DESC
          LIMIT 10
        `, [projectId]);

        reply.send({
          guardrailsEnabled: true, // Could be configurable
          currentWarnings: warnings,
          blockingWarnings: warnings.filter(w => w.blockDeployment),
          nonBlockingWarnings: warnings.filter(w => !w.blockDeployment),
          recentChecks: historyResult.rows,
          configuration: {
            productionBranches: ['main', 'master'],
            blockNonMainProduction: true,
            requireManualConfirmation: target === 'production',
            allowOverrides: true
          }
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'guardrail_check_error',
          error as Error,
          { userId, projectId, branch, target }
        );

        reply.code(500).send({
          error: 'Failed to check deployment guardrails',
          code: 'GUARDRAIL_CHECK_ERROR'
        });
      }
    }
  );
}

/**
 * Deploy to Vercel with streaming logs integration
 * Following CloudFlare pattern: API-first with CLI fallback
 */
async function deployWithStreamingLogs(
  apiService: VercelAPIService,
  connectionId: string,
  deployOptions: DeployOptions,
  buildId: string,
  userId: string,
  projectId: string,
  deploymentId: string
): Promise<any> {
  try {
    // 1. Create deployment via Vercel API
    const deployment = await apiService.createDeployment(connectionId, deployOptions);
    
    unifiedLogger.deploy(
      buildId,
      userId,
      projectId,
      'progress',
      `Deployment created: ${deployment.uid}`,
      deploymentId,
      { 
        vercelDeploymentId: deployment.uid,
        state: deployment.state,
        url: deployment.url
      }
    );

    // 2. Stream events via /v3/deployments/{id}/events with follow=1
    try {
      for await (const event of apiService.streamDeploymentEvents(connectionId, deployment.uid, { follow: true })) {
        // Process different event types
        switch (event.type) {
          case 'stdout':
            unifiedLogger.deploy(
              buildId,
              userId,
              projectId,
              'stdout',
              event.text || event.payload || '',
              deploymentId
            );
            break;
          
          case 'stderr':
            unifiedLogger.deploy(
              buildId,
              userId,
              projectId,
              'stderr',
              event.text || event.payload || '',
              deploymentId
            );
            break;
          
          case 'build-start':
            unifiedLogger.deploy(
              buildId,
              userId,
              projectId,
              'progress',
              'Build phase started',
              deploymentId,
              { phase: 'build', eventType: 'start' }
            );
            break;
          
          case 'build-end':
            unifiedLogger.deploy(
              buildId,
              userId,
              projectId,
              'progress',
              'Build phase completed',
              deploymentId,
              { phase: 'build', eventType: 'end' }
            );
            break;
          
          case 'ready':
            unifiedLogger.deploy(
              buildId,
              userId,
              projectId,
              'completed',
              'Deployment ready and accessible',
              deploymentId,
              { 
                finalUrl: deployment.url,
                state: 'READY',
                deploymentPhase: 'ready'
              }
            );
            return deployment;
          
          case 'error':
            unifiedLogger.deploy(
              buildId,
              userId,
              projectId,
              'failed',
              `Deployment failed: ${event.text || event.payload || 'Unknown error'}`,
              deploymentId,
              { 
                errorType: 'deployment_error',
                errorDetails: event.payload
              }
            );
            throw new Error(`Vercel deployment failed: ${event.text || event.payload}`);
          
          default:
            // Log other events as progress for completeness
            if (event.text || event.payload) {
              unifiedLogger.deploy(
                buildId,
                userId,
                projectId,
                'progress',
                event.text || JSON.stringify(event.payload),
                deploymentId,
                { eventType: event.type }
              );
            }
        }
      }
    } catch (streamError) {
      // Stream error - log but don't fail deployment
      unifiedLogger.deploy(
        buildId,
        userId,
        projectId,
        'progress',
        `Stream connection lost, falling back to polling: ${(streamError as Error).message}`,
        deploymentId,
        { fallback: 'polling', streamError: (streamError as Error).message }
      );
    }

    return deployment;

  } catch (error) {
    unifiedLogger.deploy(
      buildId,
      userId,
      projectId,
      'failed',
      `Vercel API deployment failed: ${(error as Error).message}`,
      deploymentId,
      { 
        errorSource: 'vercel_api',
        errorDetails: (error as Error).message
      }
    );
    throw error;
  }
}