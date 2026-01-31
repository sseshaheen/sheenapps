import { Job } from 'bullmq';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getGitHubAppService, GitHubRepo, GitHubWebhookPayload, SyncMode } from './githubAppService';
import { GitHubSyncJobData } from '../queue/modularQueues';
import { ServerLoggingService } from './serverLoggingService';
import { WorkingDirectoryService } from './workingDirectoryService';
// import { createVersion, CreateVersionParams } from './versionService';
// import { supabase } from './supabaseConnectionService';
import { pool } from './database';
import { emitGitHubSyncEvent, GitHubSyncEvent } from './eventService';

// Helper to get database client with null check
async function getDbClient() {
  if (!pool) {
    throw new Error('Database not configured');
  }
  return await pool.connect();
}

interface GitHubSyncOperation {
  id: string;
  projectId: string;
  operationType: 'pull' | 'webhook';
  status: 'pending' | 'processing' | 'success' | 'failed';
  direction: 'from_github';
  githubCommitSha?: string;
  githubCommitMessage?: string;
  githubAuthorName?: string;
  githubAuthorEmail?: string;
  localVersionId?: string;
  localCommitSha?: string;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
  errorMessage?: string;
  errorCode?: string;
  metadata?: any;
}

interface ProjectGitHubConfig {
  projectId: string;
  ownerId: string;
  githubRepoOwner: string;
  githubRepoName: string;
  githubBranch: string;
  githubInstallationId: string;
  githubSyncEnabled: boolean;
  githubSyncMode: SyncMode;
  lastRemoteMainSha?: string;
  lastSyncedMainSha?: string;
  lastOutboundBaseSha?: string;
}

export class GitHubSyncFromService {
  private loggingService: ServerLoggingService;
  private githubService = getGitHubAppService();

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
  }

  /**
   * Main entry point for processing GitHub sync-from operations
   */
  async processGitHubSyncJob(job: Job<GitHubSyncJobData>): Promise<any> {
    const { projectId, deliveryId, payload, operation } = job.data;
    const operationId = job.id as string; // Use job.id for consistency 
    const buildId = `github-${projectId}`;

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Processing GitHub sync-from job',
      { operationId, projectId, deliveryId, operation }
    );

    // Progress: Processing GitHub webhook
    await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
      operationId,
      projectId,
      message: 'Processing GitHub webhook...',
      percent: 25
    });

    // Create sync operation record
    const syncOp = await this.createSyncOperation({
      id: operationId,
      projectId,
      operationType: operation === 'webhook' ? 'webhook' : 'pull',
      status: 'processing',
      direction: 'from_github',
      metadata: { deliveryId, jobId: job.id }
    });

    try {
      // Progress: Getting project configuration  
      await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
        operationId,
        projectId,
        message: 'Loading project configuration...',
        percent: 40
      });

      // Get project GitHub configuration
      const projectConfig = await this.getProjectGitHubConfig(projectId);
      if (!projectConfig) {
        throw new Error(`Project ${projectId} does not have GitHub sync configured`);
      }

      if (!projectConfig.githubSyncEnabled) {
        await this.loggingService.logServerEvent(
          'capacity',
          'info',
          'GitHub sync disabled for project, skipping',
          { projectId, operationId }
        );
        return {};
      }

      // Progress: Processing changes from GitHub
      await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
        operationId,
        projectId,
        message: 'Fetching changes from GitHub...',
        percent: 60
      });

      // Process based on operation type
      let result;
      if (operation === 'webhook' && payload) {
        // Progress: Processing webhook
        await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
          operationId,
          projectId,
          message: 'Processing webhook changes...',
          percent: 80
        });
        result = await this.processGitHubWebhook(projectConfig, payload, operationId);
      } else {
        // Progress: Pulling from GitHub
        await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
          operationId,
          projectId,
          message: 'Pulling changes from GitHub...',
          percent: 80
        });
        result = await this.pullFromGitHub(projectConfig, operationId);
      }

      // Update sync operation with success
      await this.updateSyncOperation(operationId, {
        status: 'success',
        githubCommitSha: result.commitSha,
        githubCommitMessage: result.commitMessage,
        githubAuthorName: result.authorName,
        githubAuthorEmail: result.authorEmail,
        localVersionId: result.versionId,
        localCommitSha: result.localCommitSha,
        filesChanged: result.filesChanged,
        insertions: result.insertions,
        deletions: result.deletions
      });

      // Progress: Finalizing sync
      await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
        operationId,
        projectId,
        message: 'Finalizing sync from GitHub...',
        percent: 95
      });

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub sync-from completed successfully',
        { 
          operationId, 
          projectId, 
          versionId: result.versionId,
          filesChanged: result.filesChanged 
        }
      );

      // Return result for worker to emit completion event
      return result;

    } catch (error: any) {
      await this.updateSyncOperation(operationId, {
        status: 'failed',
        errorMessage: error.message,
        errorCode: error.code || 'SYNC_FROM_ERROR'
      });

      await this.loggingService.logCriticalError(
        'github_sync_from_failed',
        error,
        { operationId, projectId, deliveryId }
      );

      throw error; // Re-throw for BullMQ retry logic
    }
  }

  /**
   * Process GitHub webhook payload (push events)
   */
  private async processGitHubWebhook(
    projectConfig: ProjectGitHubConfig,
    payload: any,
    operationId: string
  ): Promise<{
    commitSha: string;
    commitMessage: string;
    authorName: string;
    authorEmail: string;
    versionId: string;
    localCommitSha: string;
    filesChanged: number;
    insertions: number;
    deletions: number;
  }> {
    const { event, data } = payload;

    if (event !== 'push') {
      throw new Error(`Unsupported GitHub webhook event: ${event}`);
    }

    const pushData = data as GitHubWebhookPayload;
    
    // Validate push is to the configured branch
    const refBranch = pushData.ref?.replace('refs/heads/', '');
    if (refBranch !== projectConfig.githubBranch) {
      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub push to non-synced branch, ignoring',
        { 
          operationId, 
          projectId: projectConfig.projectId, 
          pushBranch: refBranch, 
          syncBranch: projectConfig.githubBranch 
        }
      );
      // Return a no-op result
      return {
        commitSha: pushData.after || 'unknown',
        commitMessage: 'No changes (different branch)',
        authorName: 'GitHub',
        authorEmail: 'noreply@github.com',
        versionId: '',
        localCommitSha: '',
        filesChanged: 0,
        insertions: 0,
        deletions: 0
      };
    }

    // Check if we've already processed this commit
    if (pushData.after === projectConfig.lastSyncedMainSha) {
      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub commit already synced, skipping',
        { operationId, projectId: projectConfig.projectId, commitSha: pushData.after }
      );
      return {
        commitSha: pushData.after || '',
        commitMessage: 'Already synced',
        authorName: 'GitHub',
        authorEmail: 'noreply@github.com',
        versionId: '',
        localCommitSha: '',
        filesChanged: 0,
        insertions: 0,
        deletions: 0
      };
    }

    // Get commit details
    const headCommit = pushData.head_commit;
    if (!headCommit) {
      throw new Error('No head commit in push payload');
    }

    // Pull changes and create version
    return await this.pullChangesAndCreateVersion(
      projectConfig,
      headCommit.id,
      headCommit.message,
      operationId
    );
  }

  /**
   * Pull latest changes from GitHub
   */
  private async pullFromGitHub(
    projectConfig: ProjectGitHubConfig,
    operationId: string
  ): Promise<{
    commitSha: string;
    commitMessage: string;
    authorName: string;
    authorEmail: string;
    versionId: string;
    localCommitSha: string;
    filesChanged: number;
    insertions: number;
    deletions: number;
  }> {
    // Get current HEAD SHA from GitHub
    const repo: GitHubRepo = {
      owner: projectConfig.githubRepoOwner,
      repo: projectConfig.githubRepoName,
      branch: projectConfig.githubBranch,
      installationId: projectConfig.githubInstallationId,
      syncMode: projectConfig.githubSyncMode,
      branchProtection: false // Will be determined later if needed
    };

    const currentSha = await this.githubService.getHeadSha(repo);

    // Check if we're already up to date
    if (currentSha === projectConfig.lastSyncedMainSha) {
      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub repository already in sync',
        { operationId, projectId: projectConfig.projectId, currentSha }
      );
      return {
        commitSha: currentSha,
        commitMessage: 'Already up to date',
        authorName: 'GitHub',
        authorEmail: 'noreply@github.com',
        versionId: '',
        localCommitSha: '',
        filesChanged: 0,
        insertions: 0,
        deletions: 0
      };
    }

    // Get commit information
    const octokit = await this.githubService.getInstallationOctokit(projectConfig.githubInstallationId);
    const { data: commitData } = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
      owner: projectConfig.githubRepoOwner,
      repo: projectConfig.githubRepoName,
      ref: currentSha,
    });

    return await this.pullChangesAndCreateVersion(
      projectConfig,
      currentSha,
      commitData.commit.message,
      operationId
    );
  }

  /**
   * Pull changes from GitHub and create a new local version
   */
  private async pullChangesAndCreateVersion(
    projectConfig: ProjectGitHubConfig,
    commitSha: string,
    commitMessage: string,
    operationId: string
  ): Promise<{
    commitSha: string;
    commitMessage: string;
    authorName: string;
    authorEmail: string;
    versionId: string;
    localCommitSha: string;
    filesChanged: number;
    insertions: number;
    deletions: number;
  }> {
    // Get repository contents at the commit
    const octokit = await this.githubService.getInstallationOctokit(projectConfig.githubInstallationId);
    
    // Get the tree for this commit to see all files
    const { data: commitDetails } = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
      owner: projectConfig.githubRepoOwner,
      repo: projectConfig.githubRepoName,
      ref: commitSha,
    });

    const { data: treeData } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
      owner: projectConfig.githubRepoOwner,
      repo: projectConfig.githubRepoName,
      tree_sha: commitDetails.commit.tree.sha,
      recursive: 'true'
    });

    // Download file contents and apply to local project
    const workingDir = `/tmp/sheen-projects/${projectConfig.projectId}`;
    await fs.mkdir(workingDir, { recursive: true });

    let filesChanged = 0;
    let totalInsertions = 0;
    let totalDeletions = 0;

    // Process each file in the tree
    for (const item of treeData.tree) {
      if (item.type === 'blob' && item.path && item.sha) {
        // Get file content
        const { data: blobData } = await octokit.request('GET /repos/{owner}/{repo}/git/blobs/{file_sha}', {
          owner: projectConfig.githubRepoOwner,
          repo: projectConfig.githubRepoName,
          file_sha: item.sha,
        });

        // Decode content
        const content = Buffer.from(blobData.content, 'base64').toString('utf8');
        
        // Write to working directory
        const filePath = path.join(workingDir, item.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);

        filesChanged++;
        // For now, we'll estimate insertions/deletions based on content length
        totalInsertions += content.split('\n').length;
      }
    }

    // Integrate with actual version creation service
    let versionId = `github-sync-${Date.now()}`; // Fallback version ID

    try {
      const { VersionService } = await import('./versionService');
      const versionService = new VersionService(workingDir);

      const version = await versionService.createVersion({
        projectId: projectConfig.projectId,
        userId: projectConfig.ownerId,
        changeType: 'patch', // Default to patch for GitHub sync operations
        versionDescription: `GitHub sync: ${filesChanged} files updated from commit ${commitSha.substring(0, 8)}`,
        breakingRisk: 'none', // GitHub sync operations should be safe
        autoClassified: true,
        confidence: 0.9,
        reasoning: 'Automated sync from GitHub repository',
        commitSha,
        stats: {
          filesChanged,
          linesAdded: totalInsertions,
          linesRemoved: totalDeletions,
          buildDuration: 0 // No build time for sync operations
        }
      });

      versionId = version.version_id;
      console.log(`[GitHub Sync] Created version ${versionId} for project ${projectConfig.projectId}`);
    } catch (versionError) {
      console.error(`[GitHub Sync] Failed to create version record:`, versionError);
      // Continue with sync using fallback version ID
    }

    // Update project's GitHub sync tracking
    await this.updateProjectGitHubSyncTracking(projectConfig.projectId, {
      lastRemoteMainSha: commitSha,
      lastSyncedMainSha: commitSha,
      lastGitHubSyncAt: new Date()
    });

    return {
      commitSha,
      commitMessage,
      authorName: commitDetails.commit.author?.name || 'GitHub User',
      authorEmail: commitDetails.commit.author?.email || 'noreply@github.com',
      versionId: versionId,
      localCommitSha: commitSha,
      filesChanged,
      insertions: totalInsertions,
      deletions: totalDeletions
    };
  }

  /**
   * Get project GitHub configuration
   */
  private async getProjectGitHubConfig(projectId: string): Promise<ProjectGitHubConfig | null> {
    const client = await getDbClient();
    try {
      const result = await client.query(`
        SELECT
          project_id,
          owner_id,
          github_repo_owner,
          github_repo_name,
          github_branch,
          github_installation_id,
          github_sync_enabled,
          github_sync_mode,
          last_remote_main_sha,
          last_synced_main_sha,
          last_outbound_base_sha
        FROM projects
        WHERE project_id = $1 AND github_sync_enabled = true
      `, [projectId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        projectId: row.project_id,
        ownerId: row.owner_id,
        githubRepoOwner: row.github_repo_owner,
        githubRepoName: row.github_repo_name,
        githubBranch: row.github_branch || 'main',
        githubInstallationId: row.github_installation_id,
        githubSyncEnabled: row.github_sync_enabled,
        githubSyncMode: row.github_sync_mode as SyncMode,
        lastRemoteMainSha: row.last_remote_main_sha,
        lastSyncedMainSha: row.last_synced_main_sha,
        lastOutboundBaseSha: row.last_outbound_base_sha
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update project GitHub sync tracking fields
   */
  private async updateProjectGitHubSyncTracking(
    projectId: string,
    updates: {
      lastRemoteMainSha?: string;
      lastSyncedMainSha?: string;
      lastOutboundBaseSha?: string;
      lastGitHubSyncAt?: Date;
    }
  ): Promise<void> {
    const client = await getDbClient();
    try {
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      if (updates.lastRemoteMainSha) {
        setClauses.push(`last_remote_main_sha = $${paramIndex++}`);
        values.push(updates.lastRemoteMainSha);
      }

      if (updates.lastSyncedMainSha) {
        setClauses.push(`last_synced_main_sha = $${paramIndex++}`);
        values.push(updates.lastSyncedMainSha);
      }

      if (updates.lastOutboundBaseSha) {
        setClauses.push(`last_outbound_base_sha = $${paramIndex++}`);
        values.push(updates.lastOutboundBaseSha);
      }

      if (updates.lastGitHubSyncAt) {
        setClauses.push(`last_github_sync_at = $${paramIndex++}`);
        values.push(updates.lastGitHubSyncAt);
      }

      if (setClauses.length === 0) return;

      values.push(projectId);

      await client.query(`
        UPDATE projects 
        SET ${setClauses.join(', ')}
        WHERE project_id = $${paramIndex}
      `, values);
    } finally {
      client.release();
    }
  }

  /**
   * Create sync operation record
   */
  private async createSyncOperation(operation: GitHubSyncOperation): Promise<void> {
    const client = await getDbClient();
    try {
      await client.query(`
        INSERT INTO github_sync_operations (
          id, project_id, operation_type, status, direction,
          github_commit_sha, github_commit_message, github_author_name, github_author_email,
          local_version_id, local_commit_sha, files_changed, insertions, deletions,
          error_message, error_code, started_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), $17)
      `, [
        operation.id,
        operation.projectId,
        operation.operationType,
        operation.status,
        operation.direction,
        operation.githubCommitSha,
        operation.githubCommitMessage,
        operation.githubAuthorName,
        operation.githubAuthorEmail,
        operation.localVersionId,
        operation.localCommitSha,
        operation.filesChanged || 0,
        operation.insertions || 0,
        operation.deletions || 0,
        operation.errorMessage,
        operation.errorCode,
        operation.metadata ? JSON.stringify(operation.metadata) : null
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Update sync operation record
   */
  private async updateSyncOperation(
    operationId: string, 
    updates: Partial<GitHubSyncOperation>
  ): Promise<void> {
    const client = await getDbClient();
    try {
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbColumn = this.camelToSnakeCase(key);
          setClauses.push(`${dbColumn} = $${paramIndex++}`);
          values.push(value);
        }
      });

      if (updates.status === 'success' || updates.status === 'failed') {
        setClauses.push(`completed_at = NOW()`);
      }

      values.push(operationId);

      if (setClauses.length > 0) {
        await client.query(`
          UPDATE github_sync_operations 
          SET ${setClauses.join(', ')}
          WHERE id = $${paramIndex}
        `, values);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Convert camelCase to snake_case for database columns
   */
  private camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

// Singleton instance for convenient usage
let githubSyncFromServiceInstance: GitHubSyncFromService | null = null;

export function getGitHubSyncFromService(): GitHubSyncFromService {
  if (!githubSyncFromServiceInstance) {
    githubSyncFromServiceInstance = new GitHubSyncFromService();
  }
  return githubSyncFromServiceInstance;
}