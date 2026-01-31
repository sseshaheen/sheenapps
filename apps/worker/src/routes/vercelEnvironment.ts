import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VercelAPIService } from '../services/vercelAPIService';
import { VercelOAuthService } from '../services/vercelOAuthService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { getPool } from '../services/database';
import { createHash } from 'crypto';

/**
 * Vercel Environment Variable Management Routes
 * Handles environment variable synchronization with production guardrails
 */

interface ListEnvVarsQuery {
  userId: string;
  target?: 'production' | 'preview' | 'development';
}

interface SyncEnvVarsRequest {
  userId: string;
  direction: 'to_vercel' | 'from_vercel' | 'bidirectional';
  targets: ('production' | 'preview' | 'development')[];
  dryRun?: boolean;
  forceProductionSync?: boolean;
  variables?: {
    key: string;
    value: string;
    targets: ('production' | 'preview' | 'development')[];
    type?: 'secret' | 'plain';
    action?: 'create' | 'update' | 'delete';
  }[];
}

interface CreateEnvVarRequest {
  userId: string;
  key: string;
  value: string;
  targets: ('production' | 'preview' | 'development')[];
  type?: 'secret' | 'plain';
}

interface UpdateEnvVarRequest {
  userId: string;
  key?: string;
  value?: string;
  targets?: ('production' | 'preview' | 'development')[];
}

interface DeleteEnvVarRequest {
  userId: string;
  confirmProduction?: boolean;
}

export async function vercelEnvironmentRoutes(fastify: FastifyInstance) {
  const apiService = VercelAPIService.getInstance();
  const oauthService = VercelOAuthService.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  // Apply HMAC validation to all environment routes
  fastify.addHook('preHandler', requireHmacSignature());

  /**
   * Get project mapping and verify access
   */
  async function getProjectMapping(projectId: string, userId: string, vercelProjectId?: string) {
    const query = vercelProjectId 
      ? `SELECT vpm.*, vc.id as connection_id, p.name as project_name
         FROM vercel_project_mappings vpm
         JOIN vercel_connections vc ON vpm.vercel_connection_id = vc.id
         JOIN projects p ON vpm.project_id = p.id
         WHERE vpm.project_id = $1 AND vpm.vercel_project_id = $2 AND p.owner_id = $3`
      : `SELECT vpm.*, vc.id as connection_id, p.name as project_name
         FROM vercel_project_mappings vpm
         JOIN vercel_connections vc ON vpm.vercel_connection_id = vc.id
         JOIN projects p ON vpm.project_id = p.id
         WHERE vpm.project_id = $1 AND p.owner_id = $2`;

    const params = vercelProjectId ? [projectId, vercelProjectId, userId] : [projectId, userId];
    const result = await getPool().query(query, params);

    if (result.rows.length === 0) {
      throw new Error('Project not linked to Vercel or access denied');
    }

    return result.rows[0];
  }

  /**
   * Hash environment variable value for change detection
   */
  function hashEnvValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * GET /v1/projects/:projectId/vercel/env
   * List project environment variables
   */
  fastify.get<{ Params: { projectId: string }; Querystring: ListEnvVarsQuery }>(
    '/v1/projects/:projectId/vercel/env',
    async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: ListEnvVarsQuery }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const { userId, target } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      try {
        const mapping = await getProjectMapping(projectId, userId);

        // Get environment variables from Vercel (values are never returned for security)
        const envVars = await apiService.listEnvVars(mapping.connection_id, mapping.vercel_project_id);

        // Filter by target if specified
        const filteredVars = target 
          ? envVars.filter(env => env.target.includes(target))
          : envVars;

        // Get sync configuration
        const syncConfigResult = await getPool().query(
          'SELECT * FROM vercel_env_sync_configs WHERE vercel_project_mapping_id = $1',
          [mapping.id]
        );

        const syncConfig = syncConfigResult.rows[0] || null;

        reply.send({
          variables: filteredVars.map(env => ({
            id: env.id,
            key: env.key,
            targets: env.target,
            type: env.type,
            hasValue: true, // Never return actual values
            updatedAt: env.updatedAt,
            createdAt: env.createdAt
          })),
          summary: {
            total: filteredVars.length,
            byTarget: {
              production: envVars.filter(v => v.target.includes('production')).length,
              preview: envVars.filter(v => v.target.includes('preview')).length,
              development: envVars.filter(v => v.target.includes('development')).length
            },
            byType: {
              secret: envVars.filter(v => v.type === 'secret').length,
              plain: envVars.filter(v => v.type === 'plain').length,
              system: envVars.filter(v => v.type === 'system').length
            }
          },
          syncConfiguration: syncConfig ? {
            direction: syncConfig.sync_direction,
            targets: syncConfig.env_targets,
            includePatterns: syncConfig.include_patterns,
            excludePatterns: syncConfig.exclude_patterns,
            lastSyncAt: syncConfig.last_sync_at,
            lastSyncStatus: syncConfig.last_sync_status
          } : null
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_list_env_vars_error',
          error as Error,
          { userId, projectId, target }
        );

        const errorMessage = (error as Error).message;
        if (errorMessage.includes('scope')) {
          return reply.code(403).send({
            error: 'Insufficient permissions to read environment variables',
            code: 'INSUFFICIENT_SCOPE',
            requiredScope: 'env:read'
          });
        }

        reply.code(500).send({
          error: 'Failed to list environment variables',
          canRetry: true
        });
      }
    }
  );

  /**
   * POST /v1/projects/:projectId/vercel/env/sync
   * Sync environment variables with production guardrails
   */
  fastify.post<{ Params: { projectId: string }; Body: SyncEnvVarsRequest }>(
    '/v1/projects/:projectId/vercel/env/sync',
    async (request: FastifyRequest<{ Params: { projectId: string }; Body: SyncEnvVarsRequest }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const { 
        userId, 
        direction, 
        targets, 
        dryRun = false, 
        forceProductionSync = false,
        variables = []
      } = request.body;

      if (!userId || !direction || !targets || targets.length === 0) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'direction', 'targets']
        });
      }

      // Production sync guardrails
      const affectsProduction = targets.includes('production');
      if (affectsProduction && !dryRun && !forceProductionSync) {
        return reply.code(400).send({
          error: 'Production environment sync requires explicit confirmation',
          code: 'PRODUCTION_SYNC_REQUIRES_CONFIRMATION',
          solution: 'Set forceProductionSync: true to proceed with production sync'
        });
      }

      try {
        const mapping = await getProjectMapping(projectId, userId);

        // Require appropriate scopes
        if (direction === 'to_vercel' || direction === 'bidirectional') {
          await oauthService.requireScope(mapping.connection_id, 'env:write');
        }
        if (direction === 'from_vercel' || direction === 'bidirectional') {
          await oauthService.requireScope(mapping.connection_id, 'env:read');
        }

        // Get current Vercel environment variables
        const currentEnvVars = await apiService.listEnvVars(mapping.connection_id, mapping.vercel_project_id);
        const currentEnvMap = new Map(currentEnvVars.map(env => [env.key, env]));

        let syncResults = {
          created: [] as any[],
          updated: [] as any[],
          deleted: [] as any[],
          errors: [] as any[],
          warnings: [] as string[]
        };

        // Process each variable
        for (const variable of variables) {
          try {
            const existingVar = currentEnvMap.get(variable.key);

            if (variable.action === 'create' || (!existingVar && variable.value)) {
              // Create new environment variable
              if (!dryRun) {
                const createdVar = await apiService.createEnvVar(
                  mapping.connection_id,
                  mapping.vercel_project_id,
                  {
                    key: variable.key,
                    value: variable.value,
                    target: variable.targets,
                    type: variable.type || 'plain'
                  }
                );
                syncResults.created.push({
                  key: variable.key,
                  targets: variable.targets,
                  type: variable.type || 'plain',
                  id: createdVar.id
                });
              } else {
                syncResults.created.push({
                  key: variable.key,
                  targets: variable.targets,
                  type: variable.type || 'plain',
                  dryRun: true
                });
              }

            } else if (variable.action === 'update' && existingVar) {
              // Update existing environment variable
              if (!dryRun) {
                const updatedVar = await apiService.updateEnvVar(
                  mapping.connection_id,
                  mapping.vercel_project_id,
                  existingVar.id,
                  {
                    key: variable.key,
                    value: variable.value,
                    target: variable.targets
                  }
                );
                syncResults.updated.push({
                  key: variable.key,
                  targets: variable.targets,
                  id: updatedVar.id,
                  previousTargets: existingVar.target
                });
              } else {
                syncResults.updated.push({
                  key: variable.key,
                  targets: variable.targets,
                  previousTargets: existingVar.target,
                  dryRun: true
                });
              }

            } else if (variable.action === 'delete' && existingVar) {
              // Delete environment variable
              if (existingVar.target.includes('production') && !forceProductionSync) {
                syncResults.warnings.push(
                  `Skipping deletion of production variable '${variable.key}' - requires forceProductionSync`
                );
                continue;
              }

              if (!dryRun) {
                await apiService.deleteEnvVar(
                  mapping.connection_id,
                  mapping.vercel_project_id,
                  existingVar.id
                );
              }

              syncResults.deleted.push({
                key: variable.key,
                targets: existingVar.target,
                dryRun
              });
            }

          } catch (varError) {
            syncResults.errors.push({
              key: variable.key,
              action: variable.action,
              error: (varError as Error).message
            });
          }
        }

        // Update sync configuration if not dry run
        if (!dryRun && syncResults.errors.length === 0) {
          await getPool().query(
            `INSERT INTO vercel_env_sync_configs (
               vercel_project_mapping_id, sync_direction, env_targets,
               last_sync_at, last_sync_status
             ) VALUES ($1, $2, $3, NOW(), 'success')
             ON CONFLICT (vercel_project_mapping_id) 
             DO UPDATE SET
               sync_direction = EXCLUDED.sync_direction,
               env_targets = EXCLUDED.env_targets,
               last_sync_at = NOW(),
               last_sync_status = 'success'`,
            [mapping.id, direction, targets]
          );
        }

        const logLevel = syncResults.errors.length > 0 ? 'warn' : 'info';
        await loggingService.logServerEvent(
          'capacity',
          logLevel,
          dryRun ? 'Environment variables sync (dry run)' : 'Environment variables synced',
          {
            userId,
            projectId,
            direction,
            targets,
            dryRun,
            affectsProduction,
            created: syncResults.created.length,
            updated: syncResults.updated.length,
            deleted: syncResults.deleted.length,
            errors: syncResults.errors.length
          }
        );

        reply.send({
          success: syncResults.errors.length === 0,
          dryRun,
          results: syncResults,
          summary: {
            totalProcessed: variables.length,
            successful: variables.length - syncResults.errors.length,
            failed: syncResults.errors.length,
            affectedTargets: targets
          }
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_env_sync_error',
          error as Error,
          { userId, projectId, direction, targets }
        );

        const errorMessage = (error as Error).message;
        if (errorMessage.includes('scope')) {
          return reply.code(403).send({
            error: 'Insufficient permissions for environment variable sync',
            code: 'INSUFFICIENT_SCOPE',
            requiredScope: direction === 'to_vercel' ? 'env:write' : 'env:read'
          });
        }

        reply.code(500).send({
          error: 'Environment variable sync failed',
          canRetry: true
        });
      }
    }
  );

  /**
   * PUT /v1/projects/:projectId/vercel/env/:key
   * Create or update a specific environment variable
   */
  fastify.put<{ Params: { projectId: string; key: string }; Body: CreateEnvVarRequest }>(
    '/v1/projects/:projectId/vercel/env/:key',
    async (request: FastifyRequest<{ Params: { projectId: string; key: string }; Body: CreateEnvVarRequest }>, reply: FastifyReply) => {
      const { projectId, key } = request.params;
      const { userId, value, targets, type = 'plain' } = request.body;

      if (!userId || !value || !targets || targets.length === 0) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'value', 'targets']
        });
      }

      // URL key must match body key
      if (request.body.key && request.body.key !== key) {
        return reply.code(400).send({
          error: 'Key mismatch between URL and body'
        });
      }

      let existingVar = null;

      try {
        const mapping = await getProjectMapping(projectId, userId);
        await oauthService.requireScope(mapping.connection_id, 'env:write');

        // Get current environment variables to check if key exists
        const currentEnvVars = await apiService.listEnvVars(mapping.connection_id, mapping.vercel_project_id);
        existingVar = currentEnvVars.find(env => env.key === key);

        let result;
        let action;

        if (existingVar) {
          // Update existing variable
          result = await apiService.updateEnvVar(
            mapping.connection_id,
            mapping.vercel_project_id,
            existingVar.id,
            { key, value, target: targets }
          );
          action = 'updated';
        } else {
          // Create new variable
          result = await apiService.createEnvVar(
            mapping.connection_id,
            mapping.vercel_project_id,
            { key, value, target: targets, type }
          );
          action = 'created';
        }

        await loggingService.logServerEvent(
          'capacity',
          'info',
          `Environment variable ${action}`,
          {
            userId,
            projectId,
            key,
            targets,
            type,
            action,
            affectsProduction: targets.includes('production')
          }
        );

        reply.send({
          success: true,
          action,
          variable: {
            id: result.id,
            key: result.key,
            targets: result.target,
            type: result.type,
            updatedAt: result.updatedAt,
            createdAt: result.createdAt
          }
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_env_var_update_error',
          error as Error,
          { userId, projectId, key, targets }
        );

        const errorMessage = (error as Error).message;
        if (errorMessage.includes('scope')) {
          return reply.code(403).send({
            error: 'Insufficient permissions to modify environment variables',
            code: 'INSUFFICIENT_SCOPE',
            requiredScope: 'env:write'
          });
        }

        reply.code(500).send({
          error: `Failed to ${existingVar ? 'update' : 'create'} environment variable`,
          canRetry: true
        });
      }
    }
  );

  /**
   * DELETE /v1/projects/:projectId/vercel/env/:key
   * Delete a specific environment variable
   */
  fastify.delete<{ Params: { projectId: string; key: string }; Body: DeleteEnvVarRequest }>(
    '/v1/projects/:projectId/vercel/env/:key',
    async (request: FastifyRequest<{ Params: { projectId: string; key: string }; Body: DeleteEnvVarRequest }>, reply: FastifyReply) => {
      const { projectId, key } = request.params;
      const { userId, confirmProduction = false } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field: userId'
        });
      }

      try {
        const mapping = await getProjectMapping(projectId, userId);
        await oauthService.requireScope(mapping.connection_id, 'env:write');

        // Get current environment variables to find the one to delete
        const currentEnvVars = await apiService.listEnvVars(mapping.connection_id, mapping.vercel_project_id);
        const envVar = currentEnvVars.find(env => env.key === key);

        if (!envVar) {
          return reply.code(404).send({
            error: 'Environment variable not found',
            code: 'ENV_VAR_NOT_FOUND'
          });
        }

        // Check for production confirmation
        if (envVar.target.includes('production') && !confirmProduction) {
          return reply.code(400).send({
            error: 'Deleting production environment variables requires confirmation',
            code: 'PRODUCTION_DELETE_REQUIRES_CONFIRMATION',
            targets: envVar.target,
            solution: 'Set confirmProduction: true to proceed'
          });
        }

        // Delete the environment variable
        await apiService.deleteEnvVar(
          mapping.connection_id,
          mapping.vercel_project_id,
          envVar.id
        );

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Environment variable deleted',
          {
            userId,
            projectId,
            key,
            targets: envVar.target,
            affectedProduction: envVar.target.includes('production'),
            confirmedProduction: confirmProduction
          }
        );

        reply.send({
          success: true,
          message: `Environment variable '${key}' deleted successfully`,
          deletedFrom: envVar.target
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_env_var_delete_error',
          error as Error,
          { userId, projectId, key }
        );

        reply.code(500).send({
          error: 'Failed to delete environment variable',
          canRetry: true
        });
      }
    }
  );
}