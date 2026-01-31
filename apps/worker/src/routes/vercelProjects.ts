import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VercelAPIService, VercelProject } from '../services/vercelAPIService';
import { VercelOAuthService } from '../services/vercelOAuthService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { getPool } from '../services/database';

/**
 * Vercel Project Management Routes
 * Handles project listing, linking, configuration, and management
 */

interface ListProjectsQuery {
  userId: string;
  teamId?: string;
  cursor?: string;
  limit?: string;
}

interface LinkProjectRequest {
  userId: string;
  localProjectId: string;
  vercelProjectId: string;
  vercelProjectName?: string;
  autoDetectConfig?: boolean;
}

interface UnlinkProjectRequest {
  userId: string;
  localProjectId: string;
  vercelProjectId: string;
}

interface ProjectConfigRequest {
  userId: string;
  localProjectId: string;
  vercelProjectId: string;
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  installCommand?: string;
  devCommand?: string;
  rootDirectory?: string;
  environmentTargets?: ('production' | 'preview' | 'development')[];
  deploymentBranchPatterns?: string[];
  autoDeployEnabled?: boolean;
}

interface GetProjectDetailsQuery {
  userId: string;
  vercelProjectId: string;
}

export async function vercelProjectRoutes(fastify: FastifyInstance) {
  const apiService = VercelAPIService.getInstance();
  const oauthService = VercelOAuthService.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  // Apply HMAC validation to all project routes
  fastify.addHook('preHandler', requireHmacSignature());

  /**
   * GET /v1/projects/:projectId/vercel/projects
   * List user's Vercel projects with pagination
   */
  fastify.get<{ Params: { projectId: string }; Querystring: ListProjectsQuery }>(
    '/v1/projects/:projectId/vercel/projects',
    async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: ListProjectsQuery }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const { userId, teamId, cursor, limit } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      try {
        // Get user's Vercel connection
        const connection = await oauthService.getConnection(userId, projectId);
        if (!connection) {
          return reply.code(404).send({
            error: 'Vercel connection not found',
            code: 'CONNECTION_NOT_FOUND',
            action: 'Please connect your Vercel account first'
          });
        }

        if (connection.status !== 'connected') {
          return reply.code(401).send({
            error: 'Vercel connection not active',
            status: connection.status,
            code: 'CONNECTION_NOT_ACTIVE',
            requiresReauth: connection.status === 'expired'
          });
        }

        // List Vercel projects
        const projects = await apiService.listProjects(connection.id, {
          teamId: teamId || connection.team_id || undefined,
          cursor,
          limit: limit ? parseInt(limit) : 20
        });

        // Get existing project mappings for this user
        const mappingResult = await getPool().query(
          `SELECT vpm.vercel_project_id, vpm.vercel_project_name, vpm.auto_deploy,
                  vpm.framework, vpm.environment_target, vpm.deployment_branch_patterns,
                  p.name as local_project_name
           FROM vercel_project_mappings vpm
           JOIN projects p ON vpm.project_id = p.id
           WHERE p.owner_id = $1`,
          [userId]
        );

        const existingMappings = new Map();
        mappingResult.rows.forEach(mapping => {
          existingMappings.set(mapping.vercel_project_id, {
            linked: true,
            localProjectName: mapping.local_project_name,
            autoDeployEnabled: mapping.auto_deploy,
            framework: mapping.framework,
            environmentTargets: mapping.environment_target,
            branchPatterns: mapping.deployment_branch_patterns
          });
        });

        // Enhance projects with linking status
        const enhancedProjects = projects.data.map(project => ({
          ...project,
          linkStatus: existingMappings.get(project.id) || { linked: false },
          canLink: !existingMappings.has(project.id) // Can only link if not already linked
        }));

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Vercel projects listed successfully',
          {
            userId,
            projectId,
            connectionId: connection.id,
            projectCount: projects.data.length,
            linkedCount: mappingResult.rows.length
          }
        );

        reply.send({
          projects: enhancedProjects,
          pagination: projects.pagination,
          summary: {
            total: projects.data.length,
            linked: mappingResult.rows.length,
            available: projects.data.length - mappingResult.rows.length
          },
          accountInfo: {
            accountType: connection.account_type,
            teamId: connection.team_id,
            teamName: connection.team_name
          }
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_list_projects_error',
          error as Error,
          { userId, projectId, teamId }
        );

        const errorMessage = (error as Error).message;
        if (errorMessage.includes('scope')) {
          return reply.code(403).send({
            error: 'Insufficient permissions to list projects',
            code: 'INSUFFICIENT_SCOPE',
            requiredScope: 'project:read'
          });
        }

        reply.code(500).send({
          error: 'Failed to list Vercel projects',
          canRetry: !errorMessage.includes('CONNECTION_NOT_FOUND')
        });
      }
    }
  );

  /**
   * POST /v1/projects/:projectId/vercel/projects/link
   * Link a Vercel project to a local project
   */
  fastify.post<{ Params: { projectId: string }; Body: LinkProjectRequest }>(
    '/v1/projects/:projectId/vercel/projects/link',
    async (request: FastifyRequest<{ Params: { projectId: string }; Body: LinkProjectRequest }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const { userId, localProjectId, vercelProjectId, vercelProjectName, autoDetectConfig } = request.body;

      // Validate required fields
      if (!userId || !localProjectId || !vercelProjectId) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'localProjectId', 'vercelProjectId']
        });
      }

      // Ensure localProjectId matches URL param
      if (localProjectId !== projectId) {
        return reply.code(400).send({
          error: 'Project ID mismatch between URL and body'
        });
      }

      try {
        // Get user's Vercel connection
        const connection = await oauthService.getConnection(userId, projectId);
        if (!connection) {
          return reply.code(404).send({
            error: 'Vercel connection not found',
            code: 'CONNECTION_NOT_FOUND'
          });
        }

        // Verify user owns the local project
        const projectResult = await getPool().query(
          'SELECT id, name FROM projects WHERE id = $1 AND owner_id = $2',
          [localProjectId, userId]
        );

        if (projectResult.rows.length === 0) {
          return reply.code(403).send({
            error: 'Project not found or access denied',
            code: 'PROJECT_ACCESS_DENIED'
          });
        }

        const localProject = projectResult.rows[0];

        // Check if mapping already exists
        const existingMapping = await getPool().query(
          `SELECT id FROM vercel_project_mappings 
           WHERE project_id = $1 AND vercel_project_id = $2`,
          [localProjectId, vercelProjectId]
        );

        if (existingMapping.rows.length > 0) {
          return reply.code(409).send({
            error: 'Project mapping already exists',
            code: 'MAPPING_EXISTS'
          });
        }

        // Get Vercel project details if auto-detect is enabled
        let projectConfig: any = {};
        if (autoDetectConfig) {
          try {
            const vercelProject = await apiService.getProject(connection.id, vercelProjectId);
            projectConfig = {
              framework: vercelProject.framework,
              buildCommand: vercelProject.buildCommand,
              outputDirectory: vercelProject.outputDirectory,
              installCommand: vercelProject.installCommand,
              devCommand: vercelProject.devCommand,
              rootDirectory: vercelProject.rootDirectory
            };

            await loggingService.logServerEvent(
              'capacity',
              'info',
              'Vercel project configuration auto-detected',
              { vercelProjectId, framework: projectConfig.framework }
            );
          } catch (configError) {
            // Log but don't fail if auto-detection fails
            await loggingService.logServerEvent(
              'capacity',
              'warn',
              'Failed to auto-detect project configuration',
              { vercelProjectId, error: (configError as Error).message }
            );
          }
        }

        // Create project mapping
        const mappingId = await getPool().query(
          `INSERT INTO vercel_project_mappings (
             project_id, vercel_connection_id, vercel_project_id, vercel_project_name,
             framework, build_command, output_directory, install_command, dev_command, root_directory,
             environment_target, auto_deploy, deployment_hooks_enabled, deployment_branch_patterns,
             metadata
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
           ) RETURNING id`,
          [
            localProjectId,
            connection.id,
            vercelProjectId,
            vercelProjectName || null,
            projectConfig.framework || null,
            projectConfig.buildCommand || null,
            projectConfig.outputDirectory || null,
            projectConfig.installCommand || null,
            projectConfig.devCommand || null,
            projectConfig.rootDirectory || null,
            ['production', 'preview'], // Default environment targets
            true, // Auto-deploy enabled by default
            false, // Deployment hooks disabled by default
            ['main', 'master'], // Default branch patterns
            JSON.stringify({ 
              autoDetected: !!autoDetectConfig,
              linkedAt: new Date().toISOString(),
              localProjectName: localProject.name
            })
          ]
        );

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Vercel project linked successfully',
          {
            userId,
            localProjectId,
            vercelProjectId,
            mappingId: mappingId.rows[0].id,
            autoDetected: !!autoDetectConfig
          }
        );

        reply.send({
          success: true,
          mappingId: mappingId.rows[0].id,
          message: `Successfully linked "${vercelProjectName || vercelProjectId}" to "${localProject.name}"`,
          configuration: {
            ...projectConfig,
            environmentTargets: ['production', 'preview'],
            autoDeployEnabled: true,
            branchPatterns: ['main', 'master']
          }
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_link_project_error',
          error as Error,
          { userId, localProjectId, vercelProjectId }
        );

        reply.code(500).send({
          error: 'Failed to link Vercel project',
          canRetry: true
        });
      }
    }
  );

  /**
   * POST /v1/projects/:projectId/vercel/projects/unlink
   * Unlink a Vercel project from a local project
   */
  fastify.post<{ Params: { projectId: string }; Body: UnlinkProjectRequest }>(
    '/v1/projects/:projectId/vercel/projects/unlink',
    async (request: FastifyRequest<{ Params: { projectId: string }; Body: UnlinkProjectRequest }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const { userId, localProjectId, vercelProjectId } = request.body;

      if (!userId || !localProjectId || !vercelProjectId) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['userId', 'localProjectId', 'vercelProjectId']
        });
      }

      if (localProjectId !== projectId) {
        return reply.code(400).send({
          error: 'Project ID mismatch between URL and body'
        });
      }

      try {
        // Verify user owns the project and mapping exists
        const mappingResult = await getPool().query(
          `SELECT vpm.id, vpm.vercel_project_name, p.name as local_project_name
           FROM vercel_project_mappings vpm
           JOIN projects p ON vpm.project_id = p.id
           WHERE vpm.project_id = $1 AND vpm.vercel_project_id = $2 AND p.owner_id = $3`,
          [localProjectId, vercelProjectId, userId]
        );

        if (mappingResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'Project mapping not found or access denied',
            code: 'MAPPING_NOT_FOUND'
          });
        }

        const mapping = mappingResult.rows[0];

        // Delete the mapping
        await getPool().query(
          'DELETE FROM vercel_project_mappings WHERE id = $1',
          [mapping.id]
        );

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Vercel project unlinked successfully',
          {
            userId,
            localProjectId,
            vercelProjectId,
            mappingId: mapping.id
          }
        );

        reply.send({
          success: true,
          message: `Successfully unlinked "${mapping.vercel_project_name || vercelProjectId}" from "${mapping.local_project_name}"`
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_unlink_project_error',
          error as Error,
          { userId, localProjectId, vercelProjectId }
        );

        reply.code(500).send({
          error: 'Failed to unlink Vercel project',
          canRetry: true
        });
      }
    }
  );

  /**
   * GET /v1/projects/:projectId/vercel/projects/:vercelProjectId
   * Get detailed information about a linked Vercel project
   */
  fastify.get<{ Params: { projectId: string; vercelProjectId: string }; Querystring: GetProjectDetailsQuery }>(
    '/v1/projects/:projectId/vercel/projects/:vercelProjectId',
    async (request: FastifyRequest<{ Params: { projectId: string; vercelProjectId: string }; Querystring: GetProjectDetailsQuery }>, reply: FastifyReply) => {
      const { projectId, vercelProjectId } = request.params;
      const { userId } = request.query;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required parameter: userId'
        });
      }

      try {
        // Verify project mapping exists and user has access
        const mappingResult = await getPool().query(
          `SELECT vpm.*, vc.id as connection_id, p.name as local_project_name
           FROM vercel_project_mappings vpm
           JOIN vercel_connections vc ON vpm.vercel_connection_id = vc.id
           JOIN projects p ON vpm.project_id = p.id
           WHERE vpm.project_id = $1 AND vpm.vercel_project_id = $2 AND p.owner_id = $3`,
          [projectId, vercelProjectId, userId]
        );

        if (mappingResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'Project mapping not found or access denied',
            code: 'MAPPING_NOT_FOUND'
          });
        }

        const mapping = mappingResult.rows[0];

        // Get Vercel project details
        const vercelProject = await apiService.getProject(mapping.connection_id, vercelProjectId);

        // Get recent deployment count
        const deployments = await apiService.listDeployments(mapping.connection_id, vercelProjectId, { limit: 5 });

        reply.send({
          localProject: {
            id: projectId,
            name: mapping.local_project_name
          },
          vercelProject,
          mapping: {
            id: mapping.id,
            framework: mapping.framework,
            buildCommand: mapping.build_command,
            outputDirectory: mapping.output_directory,
            installCommand: mapping.install_command,
            devCommand: mapping.dev_command,
            rootDirectory: mapping.root_directory,
            environmentTargets: mapping.environment_target,
            autoDeployEnabled: mapping.auto_deploy,
            deploymentHooksEnabled: mapping.deployment_hooks_enabled,
            branchPatterns: mapping.deployment_branch_patterns,
            createdAt: mapping.created_at,
            updatedAt: mapping.updated_at
          },
          recentDeployments: deployments.data,
          stats: {
            totalDeployments: deployments.pagination.count,
            lastDeployment: deployments.data[0]?.created || null
          }
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_get_project_details_error',
          error as Error,
          { userId, projectId, vercelProjectId }
        );

        reply.code(500).send({
          error: 'Failed to get project details',
          canRetry: true
        });
      }
    }
  );

  /**
   * PUT /v1/projects/:projectId/vercel/projects/:vercelProjectId/config
   * Update project configuration and settings
   */
  fastify.put<{ Params: { projectId: string; vercelProjectId: string }; Body: ProjectConfigRequest }>(
    '/v1/projects/:projectId/vercel/projects/:vercelProjectId/config',
    async (request: FastifyRequest<{ Params: { projectId: string; vercelProjectId: string }; Body: ProjectConfigRequest }>, reply: FastifyReply) => {
      const { projectId, vercelProjectId } = request.params;
      const { 
        userId, 
        framework, 
        buildCommand, 
        outputDirectory,
        installCommand,
        devCommand,
        rootDirectory,
        environmentTargets,
        deploymentBranchPatterns,
        autoDeployEnabled
      } = request.body;

      if (!userId) {
        return reply.code(400).send({
          error: 'Missing required field: userId'
        });
      }

      try {
        // Verify project mapping exists and user has access
        const mappingResult = await getPool().query(
          `SELECT vpm.id, vpm.vercel_connection_id
           FROM vercel_project_mappings vpm
           JOIN projects p ON vpm.project_id = p.id
           WHERE vpm.project_id = $1 AND vpm.vercel_project_id = $2 AND p.owner_id = $3`,
          [projectId, vercelProjectId, userId]
        );

        if (mappingResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'Project mapping not found or access denied',
            code: 'MAPPING_NOT_FOUND'
          });
        }

        const mapping = mappingResult.rows[0];

        // Update local mapping configuration
        await getPool().query(
          `UPDATE vercel_project_mappings 
           SET framework = $1, build_command = $2, output_directory = $3,
               install_command = $4, dev_command = $5, root_directory = $6,
               environment_target = $7, deployment_branch_patterns = $8,
               auto_deploy = $9, updated_at = NOW()
           WHERE id = $10`,
          [
            framework || null,
            buildCommand || null,
            outputDirectory || null,
            installCommand || null,
            devCommand || null,
            rootDirectory || null,
            environmentTargets || ['production', 'preview'],
            deploymentBranchPatterns || ['main', 'master'],
            autoDeployEnabled !== undefined ? autoDeployEnabled : true,
            mapping.id
          ]
        );

        await loggingService.logServerEvent(
          'capacity',
          'info',
          'Vercel project configuration updated',
          {
            userId,
            projectId,
            vercelProjectId,
            mappingId: mapping.id,
            framework,
            autoDeployEnabled
          }
        );

        reply.send({
          success: true,
          message: 'Project configuration updated successfully',
          configuration: {
            framework,
            buildCommand,
            outputDirectory,
            installCommand,
            devCommand,
            rootDirectory,
            environmentTargets: environmentTargets || ['production', 'preview'],
            branchPatterns: deploymentBranchPatterns || ['main', 'master'],
            autoDeployEnabled: autoDeployEnabled !== undefined ? autoDeployEnabled : true
          }
        });

      } catch (error) {
        await loggingService.logCriticalError(
          'vercel_update_project_config_error',
          error as Error,
          { userId, projectId, vercelProjectId }
        );

        reply.code(500).send({
          error: 'Failed to update project configuration',
          canRetry: true
        });
      }
    }
  );
}