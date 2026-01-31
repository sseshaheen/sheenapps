import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { getPool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import { unifiedLogger } from '../services/unifiedLogger';
import { VercelSyncService } from '../services/vercelSyncService';
import { VercelAPIService } from '../services/vercelAPIService';

/**
 * Vercel Auto-Deploy Configuration Routes
 * Manages automatic deployments triggered by git push events
 * Implements branch pattern matching and deployment guardrails
 */

interface AutoDeployConfig {
  enabled: boolean;
  branchPatterns: string[]; // e.g., ['main', 'develop', 'release/*']
  targetEnvironment: 'production' | 'preview' | 'auto'; // auto = main->production, others->preview
  requiresApproval: boolean;
  deploymentChecks: {
    runTests: boolean;
    requirePassing: boolean;
    allowSkip: boolean;
  };
  notifications: {
    onStart: boolean;
    onSuccess: boolean;
    onFailure: boolean;
    channels: string[]; // email, slack, etc.
  };
  rollbackPolicy: {
    autoRollbackOnFailure: boolean;
    rollbackTimeoutMinutes: number;
  };
}

interface BranchDeploymentRule {
  pattern: string;
  target: 'production' | 'preview';
  requiresApproval: boolean;
  runChecks: boolean;
}

export async function vercelAutoDeployRoutes(fastify: FastifyInstance) {
  const loggingService = ServerLoggingService.getInstance();
  const syncService = new VercelSyncService();

  /**
   * GET /v1/projects/:projectId/vercel/auto-deploy/config
   * Get auto-deploy configuration for project
   */
  fastify.get<{
    Params: { projectId: string };
    Querystring: { userId: string };
  }>('/v1/projects/:projectId/vercel/auto-deploy/config', {
    config: {
      security: { scheme: 'hmac', scope: ['deploy:vercel'] }
    },
    preHandler: requireHmacSignature()
  }, async (request, reply) => {
    const { projectId } = request.params;
    const { userId } = request.query;

    if (!userId) {
      return reply.code(400).send({ error: 'Missing required parameter: userId' });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(
        'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
        [projectId, userId]
      );

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Project not found or access denied' });
      }

      // Get auto-deploy configuration
      const configResult = await getPool().query(`
        SELECT 
          vpm.id,
          vpm.auto_deploy,
          vpm.deployment_branch_patterns,
          vpm.deployment_hooks_enabled,
          vpm.metadata,
          vc.status as connection_status
        FROM vercel_project_mappings vpm
        JOIN vercel_connections vc ON vpm.vercel_connection_id = vc.id
        WHERE vpm.project_id = $1
      `, [projectId]);

      if (configResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'No Vercel project mapping found',
          code: 'NOT_LINKED'
        });
      }

      const config = configResult.rows[0];
      const metadata = config.metadata || {};

      const autoDeployConfig: AutoDeployConfig = {
        enabled: config.auto_deploy && config.deployment_hooks_enabled,
        branchPatterns: config.deployment_branch_patterns || ['main'],
        targetEnvironment: metadata.targetEnvironment || 'auto',
        requiresApproval: metadata.requiresApproval || false,
        deploymentChecks: {
          runTests: metadata.runTests || false,
          requirePassing: metadata.requirePassing || true,
          allowSkip: metadata.allowSkip || false
        },
        notifications: {
          onStart: metadata.notifyOnStart || true,
          onSuccess: metadata.notifyOnSuccess || true,
          onFailure: metadata.notifyOnFailure || true,
          channels: metadata.notificationChannels || ['email']
        },
        rollbackPolicy: {
          autoRollbackOnFailure: metadata.autoRollback || false,
          rollbackTimeoutMinutes: metadata.rollbackTimeout || 5
        }
      };

      reply.send({
        config: autoDeployConfig,
        connectionStatus: config.connection_status,
        mappingId: config.id
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'auto_deploy_config_fetch_error',
        error as Error,
        { projectId, userId }
      );

      reply.code(500).send({ 
        error: 'Failed to fetch auto-deploy configuration',
        code: 'CONFIG_FETCH_ERROR'
      });
    }
  });

  /**
   * PUT /v1/projects/:projectId/vercel/auto-deploy/config
   * Update auto-deploy configuration
   */
  fastify.put<{
    Params: { projectId: string };
    Body: Partial<AutoDeployConfig> & { userId: string };
  }>('/v1/projects/:projectId/vercel/auto-deploy/config', {
    config: {
      security: { scheme: 'hmac', scope: ['deploy:vercel:write'] }
    },
    preHandler: requireHmacSignature()
  }, async (request, reply) => {
    const { projectId } = request.params;
    const { userId, ...updates } = request.body;

    if (!userId) {
      return reply.code(400).send({ error: 'Missing required field: userId' });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(
        'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
        [projectId, userId]
      );

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Project not found or access denied' });
      }

      // Get current mapping
      const mappingResult = await getPool().query(
        'SELECT id, metadata FROM vercel_project_mappings WHERE project_id = $1',
        [projectId]
      );

      if (mappingResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'No Vercel project mapping found',
          code: 'NOT_LINKED'
        });
      }

      const mapping = mappingResult.rows[0];
      const currentMetadata = mapping.metadata || {};

      // Validate branch patterns
      if (updates.branchPatterns) {
        const invalidPatterns = updates.branchPatterns.filter(pattern => 
          !pattern || typeof pattern !== 'string' || pattern.length > 100
        );
        
        if (invalidPatterns.length > 0) {
          return reply.code(400).send({
            error: 'Invalid branch patterns',
            code: 'INVALID_BRANCH_PATTERNS',
            details: { invalidPatterns }
          });
        }
      }

      // Build updated metadata
      const updatedMetadata = {
        ...currentMetadata,
        ...(updates.targetEnvironment && { targetEnvironment: updates.targetEnvironment }),
        ...(updates.requiresApproval !== undefined && { requiresApproval: updates.requiresApproval }),
        ...(updates.deploymentChecks && {
          runTests: updates.deploymentChecks.runTests,
          requirePassing: updates.deploymentChecks.requirePassing,
          allowSkip: updates.deploymentChecks.allowSkip
        }),
        ...(updates.notifications && {
          notifyOnStart: updates.notifications.onStart,
          notifyOnSuccess: updates.notifications.onSuccess,
          notifyOnFailure: updates.notifications.onFailure,
          notificationChannels: updates.notifications.channels
        }),
        ...(updates.rollbackPolicy && {
          autoRollback: updates.rollbackPolicy.autoRollbackOnFailure,
          rollbackTimeout: updates.rollbackPolicy.rollbackTimeoutMinutes
        })
      };

      // Update mapping configuration
      await getPool().query(`
        UPDATE vercel_project_mappings 
        SET 
          auto_deploy = COALESCE($2, auto_deploy),
          deployment_branch_patterns = COALESCE($3, deployment_branch_patterns),
          deployment_hooks_enabled = COALESCE($4, deployment_hooks_enabled),
          metadata = $5,
          updated_at = NOW()
        WHERE id = $1
      `, [
        mapping.id,
        updates.enabled,
        updates.branchPatterns,
        updates.enabled, // deployment_hooks_enabled follows auto_deploy
        JSON.stringify(updatedMetadata)
      ]);

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Auto-deploy configuration updated',
        {
          projectId,
          userId,
          updates: {
            enabled: updates.enabled,
            branchPatterns: updates.branchPatterns,
            targetEnvironment: updates.targetEnvironment
          }
        }
      );

      // Log configuration change to unified logger
      unifiedLogger.deploy(
        `config-${Date.now()}`, // buildId for configuration change
        userId,
        projectId,
        'progress',
        `Auto-deploy configuration updated: ${updates.enabled ? 'enabled' : 'disabled'}`,
        undefined,
        {
          configChange: true,
          enabled: updates.enabled,
          branchPatterns: updates.branchPatterns,
          targetEnvironment: updates.targetEnvironment,
          requiresApproval: updates.requiresApproval,
          notificationChannels: updates.notifications?.channels
        }
      );

      reply.send({ 
        message: 'Auto-deploy configuration updated successfully',
        config: updates
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'auto_deploy_config_update_error',
        error as Error,
        { projectId, userId, updates }
      );

      reply.code(500).send({ 
        error: 'Failed to update auto-deploy configuration',
        code: 'CONFIG_UPDATE_ERROR'
      });
    }
  });

  /**
   * POST /v1/projects/:projectId/vercel/auto-deploy/rules
   * Add deployment rule for specific branch pattern
   */
  fastify.post<{
    Params: { projectId: string };
    Body: BranchDeploymentRule & { userId: string };
  }>('/v1/projects/:projectId/vercel/auto-deploy/rules', async (request, reply) => {
    const { projectId } = request.params;
    const { userId, ...rule } = request.body;

    if (!userId) {
      return reply.code(400).send({ error: 'Missing required field: userId' });
    }

    try {
      // Validate rule
      if (!rule.pattern || !rule.target) {
        return reply.code(400).send({
          error: 'Pattern and target are required',
          code: 'INVALID_RULE'
        });
      }

      // Verify project ownership
      const projectResult = await getPool().query(
        'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
        [projectId, userId]
      );

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Project not found or access denied' });
      }

      // Get current mapping and rules
      const mappingResult = await getPool().query(
        'SELECT id, metadata FROM vercel_project_mappings WHERE project_id = $1',
        [projectId]
      );

      if (mappingResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'No Vercel project mapping found',
          code: 'NOT_LINKED'
        });
      }

      const mapping = mappingResult.rows[0];
      const metadata = mapping.metadata || {};
      const currentRules = metadata.deploymentRules || [];

      // Check for duplicate pattern
      const existingRule = currentRules.find((r: BranchDeploymentRule) => r.pattern === rule.pattern);
      if (existingRule) {
        return reply.code(409).send({
          error: 'Rule for this pattern already exists',
          code: 'RULE_EXISTS',
          existingRule
        });
      }

      // Add new rule
      const updatedRules = [...currentRules, rule];
      const updatedMetadata = {
        ...metadata,
        deploymentRules: updatedRules
      };

      await getPool().query(
        'UPDATE vercel_project_mappings SET metadata = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(updatedMetadata), mapping.id]
      );

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Deployment rule added',
        { projectId, userId, rule }
      );

      reply.code(201).send({ 
        message: 'Deployment rule added successfully',
        rule,
        allRules: updatedRules
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'deployment_rule_add_error',
        error as Error,
        { projectId, userId, rule }
      );

      reply.code(500).send({ 
        error: 'Failed to add deployment rule',
        code: 'RULE_ADD_ERROR'
      });
    }
  });

  /**
   * GET /v1/projects/:projectId/vercel/auto-deploy/rules
   * List deployment rules for project
   */
  fastify.get<{
    Params: { projectId: string };
    Querystring: { userId: string };
  }>('/v1/projects/:projectId/vercel/auto-deploy/rules', async (request, reply) => {
    const { projectId } = request.params;
    const { userId } = request.query;

    if (!userId) {
      return reply.code(400).send({ error: 'Missing required parameter: userId' });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(
        'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
        [projectId, userId]
      );

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Project not found or access denied' });
      }

      // Get deployment rules
      const mappingResult = await getPool().query(
        'SELECT metadata FROM vercel_project_mappings WHERE project_id = $1',
        [projectId]
      );

      if (mappingResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'No Vercel project mapping found',
          code: 'NOT_LINKED'
        });
      }

      const metadata = mappingResult.rows[0].metadata || {};
      const rules = metadata.deploymentRules || [];

      reply.send({ 
        rules,
        count: rules.length
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'deployment_rules_fetch_error',
        error as Error,
        { projectId, userId }
      );

      reply.code(500).send({ 
        error: 'Failed to fetch deployment rules',
        code: 'RULES_FETCH_ERROR'
      });
    }
  });

  /**
   * DELETE /v1/projects/:projectId/vercel/auto-deploy/rules/:pattern
   * Remove deployment rule by pattern
   */
  fastify.delete<{
    Params: { projectId: string; pattern: string };
    Querystring: { userId: string };
  }>('/v1/projects/:projectId/vercel/auto-deploy/rules/:pattern', async (request, reply) => {
    const { projectId, pattern } = request.params;
    const { userId } = request.query;

    if (!userId) {
      return reply.code(400).send({ error: 'Missing required parameter: userId' });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(
        'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
        [projectId, userId]
      );

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Project not found or access denied' });
      }

      // Get current mapping and rules
      const mappingResult = await getPool().query(
        'SELECT id, metadata FROM vercel_project_mappings WHERE project_id = $1',
        [projectId]
      );

      if (mappingResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'No Vercel project mapping found',
          code: 'NOT_LINKED'
        });
      }

      const mapping = mappingResult.rows[0];
      const metadata = mapping.metadata || {};
      const currentRules = metadata.deploymentRules || [];

      // Find and remove rule
      const decodedPattern = decodeURIComponent(pattern);
      const ruleIndex = currentRules.findIndex((r: BranchDeploymentRule) => r.pattern === decodedPattern);
      
      if (ruleIndex === -1) {
        return reply.code(404).send({
          error: 'Rule not found',
          code: 'RULE_NOT_FOUND',
          pattern: decodedPattern
        });
      }

      const removedRule = currentRules[ruleIndex];
      const updatedRules = currentRules.filter((_: any, index: number) => index !== ruleIndex);
      const updatedMetadata = {
        ...metadata,
        deploymentRules: updatedRules
      };

      await getPool().query(
        'UPDATE vercel_project_mappings SET metadata = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(updatedMetadata), mapping.id]
      );

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Deployment rule removed',
        { projectId, userId, removedRule }
      );

      reply.send({ 
        message: 'Deployment rule removed successfully',
        removedRule,
        remainingRules: updatedRules
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'deployment_rule_delete_error',
        error as Error,
        { projectId, userId, pattern }
      );

      reply.code(500).send({ 
        error: 'Failed to remove deployment rule',
        code: 'RULE_DELETE_ERROR'
      });
    }
  });

  /**
   * POST /v1/projects/:projectId/vercel/auto-deploy/test
   * Test auto-deploy configuration with a simulated git push
   */
  fastify.post<{
    Params: { projectId: string };
    Body: {
      userId: string;
      branch: string;
      commitSha?: string;
      commitMessage?: string;
      dryRun?: boolean;
    };
  }>('/v1/projects/:projectId/vercel/auto-deploy/test', async (request, reply) => {
    const { projectId } = request.params;
    const { userId, branch, commitSha, commitMessage, dryRun = true } = request.body;

    if (!userId) {
      return reply.code(400).send({ error: 'Missing required field: userId' });
    }

    try {
      // Verify project ownership
      const projectResult = await getPool().query(
        'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
        [projectId, userId]
      );

      if (projectResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Project not found or access denied' });
      }

      // Get auto-deploy configuration
      const mappingResult = await getPool().query(`
        SELECT 
          vpm.id,
          vpm.auto_deploy,
          vpm.deployment_branch_patterns,
          vpm.deployment_hooks_enabled,
          vpm.metadata,
          vpm.vercel_project_id,
          vc.id as connection_id
        FROM vercel_project_mappings vpm
        JOIN vercel_connections vc ON vpm.vercel_connection_id = vc.id
        WHERE vpm.project_id = $1
      `, [projectId]);

      if (mappingResult.rows.length === 0) {
        return reply.code(404).send({ 
          error: 'No Vercel project mapping found',
          code: 'NOT_LINKED'
        });
      }

      const mapping = mappingResult.rows[0];
      
      if (!mapping.auto_deploy || !mapping.deployment_hooks_enabled) {
        return reply.code(400).send({
          error: 'Auto-deploy is not enabled for this project',
          code: 'AUTO_DEPLOY_DISABLED'
        });
      }

      // Test branch pattern matching
      const branchPatterns = mapping.deployment_branch_patterns || ['main'];
      const metadata = mapping.metadata || {};
      const deploymentRules = metadata.deploymentRules || [];

      const matchesPattern = branchPatterns.some((pattern: string) => {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(branch);
        }
        return pattern === branch;
      });

      if (!matchesPattern) {
        return reply.send({
          wouldDeploy: false,
          reason: 'Branch does not match any deployment patterns',
          branchPatterns,
          matchedPattern: null,
          targetEnvironment: null,
          dryRun: true
        });
      }

      // Find matching deployment rule
      const matchingRule = deploymentRules.find((rule: BranchDeploymentRule) => {
        if (rule.pattern.includes('*')) {
          const regex = new RegExp('^' + rule.pattern.replace(/\*/g, '.*') + '$');
          return regex.test(branch);
        }
        return rule.pattern === branch;
      });

      // Determine target environment
      const targetEnvironment = matchingRule?.target || 
        (metadata.targetEnvironment === 'auto' 
          ? (branch === 'main' || branch === 'master' ? 'production' : 'preview')
          : metadata.targetEnvironment || 'preview'
        );

      const testResult = {
        wouldDeploy: true,
        reason: 'Branch matches deployment patterns',
        branchPatterns,
        matchedPattern: matchingRule?.pattern || branchPatterns.find((p: string) => 
          p.includes('*') 
            ? new RegExp('^' + p.replace(/\*/g, '.*') + '$').test(branch)
            : p === branch
        ),
        targetEnvironment,
        requiresApproval: matchingRule?.requiresApproval || metadata.requiresApproval || false,
        wouldRunChecks: matchingRule?.runChecks !== false && metadata.runTests,
        deploymentConfig: {
          branch,
          commitSha: commitSha || 'test-sha-' + Date.now(),
          commitMessage: commitMessage || 'Test deployment from auto-deploy test',
          target: targetEnvironment
        },
        dryRun: dryRun,
        deployment: null as any
      };

      // If not dry run, actually create the deployment
      if (!dryRun) {
        try {
          const deployment = await syncService.deployFromGit(projectId, {
            branch,
            commitSha: testResult.deploymentConfig.commitSha,
            target: targetEnvironment === 'production' ? 'production' : 'preview'
          });

          testResult.deployment = {
            id: deployment.uid,
            url: deployment.url,
            state: deployment.state
          };
        } catch (deployError) {
          return reply.code(500).send({
            ...testResult,
            deploymentError: (deployError as Error).message,
            dryRun: false
          });
        }
      }

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Auto-deploy configuration tested',
        { projectId, userId, branch, testResult }
      );

      reply.send(testResult);

    } catch (error) {
      await loggingService.logCriticalError(
        'auto_deploy_test_error',
        error as Error,
        { projectId, userId, branch }
      );

      reply.code(500).send({ 
        error: 'Failed to test auto-deploy configuration',
        code: 'TEST_ERROR'
      });
    }
  });
}