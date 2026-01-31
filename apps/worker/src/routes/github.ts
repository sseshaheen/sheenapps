import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getGitHubAppService, SyncMode } from '../services/githubAppService';
import { addGitHubPushJob, addGitHubSyncJob } from '../queue/modularQueues';
import { getGitHubConflictResolutionService, ConflictContext } from '../services/githubConflictResolutionService';
import { ServerLoggingService } from '../services/serverLoggingService';
import { pool } from '../services/database';
import { requireHmacSignature } from '../middleware/hmacValidation';

// Helper to get database client with null check
async function getDbClient() {
  if (!pool) {
    throw new Error('Database not configured');
  }
  return await pool.connect();
}

interface GitHubLinkRequest {
  repoOwner: string;
  repoName: string;
  installationId: string;
  branch?: string;
  syncMode?: SyncMode;
  webhookSecret?: string;
}

interface GitHubSyncTriggerRequest {
  direction: 'to_github' | 'from_github' | 'both';
  versionId?: string;
  force?: boolean;
}

interface GitHubConflictResolveRequest {
  strategy: 'github_wins' | 'local_wins' | 'manual_review' | 'auto_merge';
  localCommitSha: string;
  remoteCommitSha: string;
}

interface GitHubSyncStatusResponse {
  enabled: boolean;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  syncMode?: SyncMode;
  lastSync?: string;
  lastRemoteSha?: string;
  lastLocalSha?: string;
  pendingOperations?: number;
  recentOperations?: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    completedAt?: string;
    error?: string;
  }>;
}

// Standard error codes for consistent frontend handling
const GitHubErrorCodes = {
  APP_NOT_INSTALLED: 'APP_NOT_INSTALLED',
  BRANCH_PROTECTED: 'BRANCH_PROTECTED', 
  NOT_FAST_FORWARD: 'NOT_FAST_FORWARD',
  REPO_ARCHIVED: 'REPO_ARCHIVED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  APP_UNINSTALLED: 'APP_UNINSTALLED',
  RATE_LIMIT: 'RATE_LIMIT',
  INVALID_INSTALLATION: 'INVALID_INSTALLATION',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS'
} as const;

interface StandardError {
  error: string;
  error_code: keyof typeof GitHubErrorCodes;
  recovery_url?: string;
  details?: any;
}

function createStandardError(
  message: string, 
  code: keyof typeof GitHubErrorCodes, 
  recoveryUrl?: string, 
  details?: any
): StandardError {
  return {
    error: message,
    error_code: code,
    ...(recoveryUrl && { recovery_url: recoveryUrl }),
    ...(details && { details })
  };
}

export async function registerGitHubRoutes(app: FastifyInstance) {
  const loggingService = ServerLoggingService.getInstance();
  
  // Check if GitHub App credentials are configured
  if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_APP_PRIVATE_KEY) {
    console.log('⚠️ GitHub routes not registered - GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY not configured');
    return;
  }
  
  const githubService = getGitHubAppService();
  const conflictResolutionService = getGitHubConflictResolutionService();

  // Repository Discovery Endpoints

  // GET /v1/github/installations - List user's GitHub App installations
  app.get('/v1/github/installations', {
    preHandler: requireHmacSignature() as any
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // For now, we need the user to provide installation access
      // In a real implementation, this would use user GitHub OAuth tokens
      // Since we're using GitHub App auth, we'll return a helpful message
      return reply.code(501).send(
        createStandardError(
          'Installation discovery requires user OAuth integration',
          'INSUFFICIENT_PERMISSIONS',
          `${process.env.NEXT_PUBLIC_BASE_URL || 'https://github.com'}/apps/${process.env.GITHUB_APP_SLUG || 'your-app'}/installations/select_target`,
          { 
            message: 'Users must install the GitHub App and provide the installation ID',
            documentation: 'Use the GitHub App installation URL to guide users'
          }
        )
      );
    } catch (error: any) {
      await loggingService.logCriticalError(
        'github_installations_list_failed',
        error,
        { userId: 'anonymous' }
      );
      return reply.code(500).send(
        createStandardError('Failed to list GitHub installations', 'RATE_LIMIT')
      );
    }
  });

  // GET /v1/github/installations/:installationId/repos - List repositories for installation
  app.get('/v1/github/installations/:installationId/repos', {
    preHandler: requireHmacSignature() as any
  }, async (
    request: FastifyRequest<{
      Params: { installationId: string };
      Querystring: { query?: string; page?: string; per_page?: string };
    }>,
    reply: FastifyReply
  ) => {
    const { installationId } = request.params;
    const { query = '', page = '1', per_page = '30' } = request.query;

    await loggingService.logServerEvent(
      'capacity',
      'info',
      'GitHub repositories discovery requested',
      { installationId, query, page }
    );

    try {
      const octokit = await githubService.getInstallationOctokit(installationId);
      
      // Get installation repositories with optional search
      const response = await octokit.request('GET /installation/repositories', {
        per_page: Math.min(parseInt(per_page) || 30, 100),
        page: parseInt(page) || 1,
        ...(query && { q: query })
      });

      // Filter and format repositories for frontend
      const repos = response.data.repositories.map(repo => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        default_branch: repo.default_branch,
        archived: repo.archived,
        disabled: repo.disabled,
        language: repo.language,
        updated_at: repo.updated_at,
        html_url: repo.html_url
      }));

      return {
        repositories: repos,
        total_count: response.data.total_count,
        page: parseInt(page) || 1,
        per_page: parseInt(per_page) || 30
      };
    } catch (error: any) {
      if (error.status === 404) {
        return reply.code(404).send(
          createStandardError(
            'GitHub installation not found or not accessible',
            'INVALID_INSTALLATION',
            `${process.env.NEXT_PUBLIC_BASE_URL || 'https://github.com'}/apps/${process.env.GITHUB_APP_SLUG || 'your-app'}/installations/select_target`
          )
        );
      }
      if (error.status === 403) {
        return reply.code(403).send(
          createStandardError(
            'Insufficient permissions for GitHub installation',
            'INSUFFICIENT_PERMISSIONS'
          )
        );
      }
      
      await loggingService.logCriticalError(
        'github_repos_discovery_failed',
        error,
        { installationId, query }
      );
      
      return reply.code(500).send(
        createStandardError('Failed to discover GitHub repositories', 'RATE_LIMIT')
      );
    }
  });

  // Link project to GitHub repository
  app.post('/v1/projects/:projectId/github/link', {
    preHandler: requireHmacSignature() as any
  }, async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: GitHubLinkRequest;
    }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const { repoOwner, repoName, installationId, branch, syncMode, webhookSecret } = request.body;

    await loggingService.logServerEvent(
      'capacity',
      'info',
      'GitHub repository linking requested',
      { projectId, repo: `${repoOwner}/${repoName}`, installationId }
    );

    try {
      // Validate installation ID and repository access
      const repo = {
        owner: repoOwner,
        repo: repoName,
        branch: branch || 'main',
        installationId,
        syncMode: syncMode || SyncMode.PROTECTED_PR,
        branchProtection: false
      };

      // Test GitHub API access
      const repoInfo = await githubService.getRepositoryInfo(repo);
      
      // Update project with GitHub configuration
      const client = await getDbClient();
      try {
        await client.query(`
          UPDATE projects SET
            github_repo_owner = $1,
            github_repo_name = $2,
            github_branch = $3,
            github_installation_id = $4,
            github_sync_enabled = $5,
            github_sync_mode = $6,
            github_webhook_secret = $7,
            last_remote_main_sha = $8
          WHERE project_id = $9
        `, [
          repoOwner,
          repoName,
          repoInfo.defaultBranch, // Use actual default branch from GitHub
          parseInt(installationId),
          true,
          syncMode || 'protected_pr',
          webhookSecret,
          null, // Will be set on first sync
          projectId
        ]);

        const result = await client.query(
          'SELECT COUNT(*) as count FROM projects WHERE project_id = $1',
          [projectId]
        );

        if (parseInt(result.rows[0].count) === 0) {
          return reply.code(404).send({
            error: 'Project not found',
            projectId
          });
        }
      } finally {
        client.release();
      }

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub repository linked successfully',
        { 
          projectId, 
          repo: `${repoOwner}/${repoName}`,
          branch: repoInfo.defaultBranch,
          protected: repoInfo.protected,
          syncMode
        }
      );

      return reply.send({
        success: true,
        message: 'GitHub repository linked successfully',
        repository: {
          owner: repoOwner,
          name: repoName,
          branch: repoInfo.defaultBranch,
          protected: repoInfo.protected
        },
        syncMode: syncMode || 'protected_pr',
        webhookUrl: `${process.env.API_BASE_URL}/v1/webhooks/github/${projectId}`
      });

    } catch (error: any) {
      await loggingService.logCriticalError(
        'github_link_failed',
        error,
        { projectId, repo: `${repoOwner}/${repoName}` }
      );

      // Map GitHub API errors to standard error codes
      if (error.status === 404) {
        return reply.code(404).send(
          createStandardError(
            'GitHub installation or repository not found',
            'APP_NOT_INSTALLED',
            `${process.env.NEXT_PUBLIC_BASE_URL || 'https://github.com'}/apps/${process.env.GITHUB_APP_SLUG || 'your-app'}/installations/select_target`
          )
        );
      }
      if (error.status === 403) {
        return reply.code(403).send(
          createStandardError(
            'Insufficient permissions for GitHub repository',
            'INSUFFICIENT_PERMISSIONS'
          )
        );
      }
      if (error.status === 429) {
        return reply.code(429).send(
          createStandardError(
            'GitHub API rate limit exceeded',
            'RATE_LIMIT'
          )
        );
      }

      return reply.code(400).send(
        createStandardError(
          'Failed to link GitHub repository',
          'APP_NOT_INSTALLED',
          undefined,
          { originalError: error.message }
        )
      );
    }
  });

  // Unlink project from GitHub repository
  app.delete('/v1/projects/:projectId/github/unlink', {
    preHandler: requireHmacSignature() as any
  }, async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;

    try {
      const client = await getDbClient();
      try {
        // Clear GitHub configuration
        await client.query(`
          UPDATE projects SET
            github_repo_owner = NULL,
            github_repo_name = NULL,
            github_branch = NULL,
            github_installation_id = NULL,
            github_sync_enabled = FALSE,
            github_sync_mode = NULL,
            github_webhook_secret = NULL,
            last_remote_main_sha = NULL,
            last_synced_main_sha = NULL,
            last_outbound_base_sha = NULL,
            last_github_sync_at = NULL
          WHERE project_id = $1
        `, [projectId]);

        // Cancel any pending sync operations
        await client.query(`
          UPDATE github_sync_operations SET
            status = 'cancelled'
          WHERE project_id = $1 AND status IN ('pending', 'processing')
        `, [projectId]);
      } finally {
        client.release();
      }

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub repository unlinked successfully',
        { projectId }
      );

      return reply.send({
        success: true,
        message: 'GitHub repository unlinked successfully',
        projectId
      });

    } catch (error: any) {
      await loggingService.logCriticalError(
        'github_unlink_failed',
        error,
        { projectId }
      );

      return reply.code(500).send(
        createStandardError(
          'Failed to unlink GitHub repository',
          'RATE_LIMIT',
          undefined,
          { projectId, originalError: error.message }
        )
      );
    }
  });

  // Get GitHub sync status for project
  app.get('/v1/projects/:projectId/github/status', {
    preHandler: requireHmacSignature() as any
  }, async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;

    try {
      const client = await getDbClient();
      try {
        // Get project GitHub configuration
        const projectResult = await client.query(`
          SELECT 
            github_repo_owner,
            github_repo_name,
            github_branch,
            github_sync_enabled,
            github_sync_mode,
            last_remote_main_sha,
            last_synced_main_sha,
            last_github_sync_at
          FROM projects 
          WHERE project_id = $1
        `, [projectId]);

        if (projectResult.rows.length === 0) {
          return reply.code(404).send({
            error: 'Project not found',
            projectId
          });
        }

        const project = projectResult.rows[0];

        // Get recent sync operations
        const operationsResult = await client.query(`
          SELECT 
            id,
            operation_type,
            status,
            direction,
            created_at,
            completed_at,
            error_message
          FROM github_sync_operations
          WHERE project_id = $1
          ORDER BY created_at DESC
          LIMIT 10
        `, [projectId]);

        // Count pending operations
        const pendingResult = await client.query(`
          SELECT COUNT(*) as count
          FROM github_sync_operations
          WHERE project_id = $1 AND status IN ('pending', 'processing')
        `, [projectId]);

        const status: GitHubSyncStatusResponse = {
          enabled: project.github_sync_enabled,
          pendingOperations: parseInt(pendingResult.rows[0].count)
        };

        if (project.github_sync_enabled) {
          status.repoOwner = project.github_repo_owner;
          status.repoName = project.github_repo_name;
          status.branch = project.github_branch;
          status.syncMode = project.github_sync_mode;
          status.lastSync = project.last_github_sync_at;
          status.lastRemoteSha = project.last_remote_main_sha;
          status.lastLocalSha = project.last_synced_main_sha;
        }

        status.recentOperations = operationsResult.rows.map(op => ({
          id: op.id,
          type: `${op.operation_type}_${op.direction}`,
          status: op.status,
          createdAt: op.created_at,
          completedAt: op.completed_at,
          error: op.error_message
        }));

        return reply.send(status);

      } finally {
        client.release();
      }

    } catch (error: any) {
      await loggingService.logCriticalError(
        'github_status_failed',
        error,
        { projectId }
      );

      return reply.code(500).send(
        createStandardError(
          'Failed to get GitHub sync status',
          'RATE_LIMIT',
          undefined,
          { projectId, originalError: error.message }
        )
      );
    }
  });

  // Trigger manual sync operation
  app.post('/v1/projects/:projectId/github/sync/trigger', {
    preHandler: requireHmacSignature() as any
  }, async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: GitHubSyncTriggerRequest;
    }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const { direction, versionId, force } = request.body;

    await loggingService.logServerEvent(
      'capacity',
      'info',
      'Manual GitHub sync triggered',
      { projectId, direction, versionId, force }
    );

    try {
      // Verify project has GitHub sync enabled
      const client = await getDbClient();
      let project;
      try {
        const result = await client.query(`
          SELECT 
            github_sync_enabled,
            github_repo_owner,
            github_repo_name
          FROM projects 
          WHERE project_id = $1
        `, [projectId]);

        if (result.rows.length === 0) {
          return reply.code(404).send({
            error: 'Project not found',
            projectId
          });
        }

        project = result.rows[0];
      } finally {
        client.release();
      }

      if (!project.github_sync_enabled) {
        return reply.code(400).send(
          createStandardError(
            'GitHub sync is not enabled for this project',
            'APP_UNINSTALLED',
            undefined,
            { projectId }
          )
        );
      }

      const operations = [];

      // Queue sync operations based on direction
      if (direction === 'from_github' || direction === 'both') {
        const job = await addGitHubSyncJob({
          projectId,
          operation: 'pull'
        });
        operations.push({
          direction: 'from_github',
          jobId: job.id,
          type: 'pull'
        });
      }

      if (direction === 'to_github' || direction === 'both') {
        if (!versionId) {
          return reply.code(400).send(
            createStandardError(
              'versionId is required for to_github sync',
              'INSUFFICIENT_PERMISSIONS',
              undefined,
              { projectId }
            )
          );
        }

        const job = await addGitHubPushJob({
          projectId,
          versionId
        });
        operations.push({
          direction: 'to_github',
          jobId: job.id,
          type: 'push',
          versionId
        });
      }

      await loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub sync operations queued',
        { 
          projectId, 
          operationsCount: operations.length,
          operations: operations.map(op => ({ direction: op.direction, jobId: op.jobId }))
        }
      );

      return reply.send({
        success: true,
        message: 'GitHub sync operations queued',
        operations: operations.map(op => ({
          ...op,
          operationId: op.jobId // Ensure frontend gets operationId for SSE tracking
        })),
        projectId,
        repository: `${project.github_repo_owner}/${project.github_repo_name}`
      });

    } catch (error: any) {
      await loggingService.logCriticalError(
        'github_sync_trigger_failed',
        error,
        { projectId, direction, versionId }
      );

      return reply.code(500).send(
        createStandardError(
          'Failed to trigger GitHub sync operation',
          'RATE_LIMIT',
          undefined,
          { projectId, direction, originalError: error.message }
        )
      );
    }
  });

  // Resolve GitHub sync conflicts
  app.post('/v1/projects/:projectId/github/sync/resolve-conflict', {
    preHandler: requireHmacSignature() as any
  }, async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: GitHubConflictResolveRequest;
    }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const { strategy, localCommitSha, remoteCommitSha } = request.body;

    await loggingService.logServerEvent(
      'capacity',
      'info',
      'GitHub conflict resolution requested',
      { projectId, strategy, localCommitSha, remoteCommitSha }
    );

    try {
      // Get project GitHub configuration
      const client = await getDbClient();
      let project;
      try {
        const result = await client.query(`
          SELECT 
            github_sync_enabled,
            github_sync_mode,
            github_repo_owner,
            github_repo_name,
            github_branch,
            last_synced_main_sha
          FROM projects 
          WHERE project_id = $1
        `, [projectId]);

        if (result.rows.length === 0) {
          return reply.code(404).send({
            error: 'Project not found',
            projectId
          });
        }

        project = result.rows[0];
      } finally {
        client.release();
      }

      if (!project.github_sync_enabled) {
        return reply.code(400).send(
          createStandardError(
            'GitHub sync is not enabled for this project',
            'APP_UNINSTALLED',
            undefined,
            { projectId }
          )
        );
      }

      // Create conflict context
      const conflictContext: ConflictContext = {
        projectId,
        localCommitSha,
        remoteCommitSha,
        lastSyncedSha: project.last_synced_main_sha,
        syncMode: project.github_sync_mode,
        branchProtected: false // Will be determined by conflict resolution service
      };

      // Resolve conflict
      const operationId = `manual-conflict-${projectId}-${Date.now()}`;
      const resolution = await conflictResolutionService.resolveConflict(
        conflictContext,
        operationId
      );

      await loggingService.logServerEvent(
        'capacity',
        resolution.success ? 'info' : 'error',
        'GitHub conflict resolution completed',
        {
          projectId,
          operationId,
          strategy: resolution.strategy,
          success: resolution.success,
          commitSha: resolution.resultCommitSha,
          prUrl: resolution.prUrl
        }
      );

      return reply.send({
        success: resolution.success,
        strategy: resolution.strategy,
        message: resolution.success 
          ? 'Conflict resolved successfully'
          : 'Conflict resolution failed',
        operationId,
        result: {
          commitSha: resolution.resultCommitSha,
          prUrl: resolution.prUrl,
          filesResolved: resolution.filesResolved,
          manualReviewRequired: resolution.manualReviewRequired
        },
        warnings: resolution.warnings,
        error: resolution.errorMessage
      });

    } catch (error: any) {
      await loggingService.logCriticalError(
        'github_conflict_resolve_failed',
        error,
        { projectId, strategy }
      );

      return reply.code(500).send(
        createStandardError(
          'Failed to resolve GitHub sync conflict',
          'RATE_LIMIT',
          undefined,
          { projectId, strategy, originalError: error.message }
        )
      );
    }
  });

  // Get GitHub sync operations history
  app.get('/v1/admin/github/sync-operations', {
    preHandler: requireHmacSignature() as any
  }, async (
    request: FastifyRequest<{
      Querystring: {
        projectId?: string;
        status?: string;
        limit?: string;
        offset?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    const { projectId, status, limit = '50', offset = '0' } = request.query || {};

    try {
      const client = await getDbClient();
      try {
        let query = `
          SELECT 
            id,
            project_id,
            operation_type,
            status,
            direction,
            github_commit_sha,
            github_commit_message,
            local_version_id,
            files_changed,
            insertions,
            deletions,
            error_message,
            created_at,
            completed_at
          FROM github_sync_operations
        `;

        const conditions = [];
        const values = [];
        let paramIndex = 1;

        if (projectId) {
          conditions.push(`project_id = $${paramIndex++}`);
          values.push(projectId);
        }

        if (status) {
          conditions.push(`status = $${paramIndex++}`);
          values.push(status);
        }

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        values.push(parseInt(limit));
        values.push(parseInt(offset));

        const result = await client.query(query, values);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM github_sync_operations';
        if (conditions.length > 0) {
          countQuery += ' WHERE ' + conditions.join(' AND ');
        }

        const countResult = await client.query(countQuery, values.slice(0, -2)); // Remove limit/offset

        return reply.send({
          operations: result.rows,
          pagination: {
            total: parseInt(countResult.rows[0].total),
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: parseInt(offset) + parseInt(limit) < parseInt(countResult.rows[0].total)
          }
        });

      } finally {
        client.release();
      }

    } catch (error: any) {
      await loggingService.logCriticalError(
        'github_operations_list_failed',
        error,
        { projectId, status }
      );

      return reply.code(500).send({
        error: 'Failed to get GitHub sync operations',
        details: error.message
      });
    }
  });

  // Health check for GitHub integration
  app.get('/v1/admin/github/sync-status', {
    preHandler: requireHmacSignature() as any
  }, async (_, reply) => {
    try {
      const client = await getDbClient();
      let stats;
      
      try {
        const result = await client.query(`
          SELECT 
            COUNT(*) as total_projects,
            COUNT(*) FILTER (WHERE github_sync_enabled = true) as enabled_projects,
            COUNT(*) FILTER (WHERE last_github_sync_at > NOW() - INTERVAL '1 hour') as recently_synced
          FROM projects
          WHERE github_repo_owner IS NOT NULL
        `);

        const operationResult = await client.query(`
          SELECT 
            status,
            COUNT(*) as count
          FROM github_sync_operations
          WHERE created_at > NOW() - INTERVAL '24 hours'
          GROUP BY status
        `);

        stats = {
          projects: result.rows[0],
          operations: operationResult.rows.reduce((acc: any, row: any) => {
            acc[row.status] = parseInt(row.count);
            return acc;
          }, {})
        };
      } finally {
        client.release();
      }

      return reply.send({
        status: 'healthy',
        githubAppConfigured: !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY),
        webhookSecretConfigured: !!process.env.GITHUB_WEBHOOK_SECRET,
        stats,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      await loggingService.logCriticalError(
        'github_sync_status_failed',
        error,
        {}
      );

      return reply.code(500).send({
        status: 'unhealthy',
        error: 'Failed to get GitHub sync status',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}