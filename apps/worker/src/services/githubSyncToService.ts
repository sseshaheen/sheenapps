import { Job } from 'bullmq';
import * as path from 'path';
import * as fs from 'fs/promises';
import simpleGit, { SimpleGit } from 'simple-git';
import { getGitHubAppService, GitHubRepo, SyncMode, FileChange, SyncResult } from './githubAppService';
import { GitHubSyncJobData } from '../queue/modularQueues';
import { ServerLoggingService } from './serverLoggingService';
import { pool } from './database';
import { getProjectVersion } from './database';
import { emitGitHubSyncEvent, GitHubSyncEvent } from './eventService';

// Helper to get database client with null check
async function getDbClient() {
  if (!pool) {
    throw new Error('Database not configured');
  }
  return await pool.connect();
}

interface ProjectGitHubConfig {
  projectId: string;
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

interface LocalVersionContent {
  versionId: string;
  projectId: string;
  userId: string;
  commitSha: string;
  files: Array<{
    path: string;
    content: string;
    isDirectory: boolean;
  }>;
  stats: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  };
}

export class GitHubSyncToService {
  private loggingService: ServerLoggingService;
  private githubService = getGitHubAppService();

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
  }

  /**
   * Main entry point for processing GitHub sync-to operations
   */
  async processGitHubSyncToJob(job: Job<GitHubSyncJobData>): Promise<SyncResult> {
    const { projectId, versionId, operation } = job.data;
    const operationId = job.id as string; // Use job.id as operationId for consistency
    const buildId = `github-${projectId}`;

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Processing GitHub sync-to job',
      { operationId, projectId, versionId, operation }
    );

    // Progress: Reading project files
    await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
      operationId,
      projectId,
      message: 'Reading project files...',
      percent: 20
    });

    // Create sync operation record
    await this.createSyncOperation({
      id: operationId,
      projectId,
      operationType: 'push',
      status: 'processing',
      direction: 'to_github',
      localVersionId: versionId,
      metadata: { jobId: job.id }
    });

    try {
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
        return {} as SyncResult; // Return empty result for consistency
      }

      // Progress: Getting current state
      await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
        operationId,
        projectId,
        message: 'Loading project configuration...',
        percent: 30
      });

      // Get local version content
      const versionContent = await this.getLocalVersionContent(projectId, versionId!);
      if (!versionContent) {
        throw new Error(`Version ${versionId} not found for project ${projectId}`);
      }

      // Progress: Preparing GitHub operation
      await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
        operationId,
        projectId,
        message: 'Preparing GitHub operation...',
        percent: 40
      });

      // Sync to GitHub based on sync mode
      const result = await this.syncToGitHub(projectConfig, versionContent, operationId, buildId);

      // Update sync operation with success
      await this.updateSyncOperation(operationId, {
        status: 'success',
        githubCommitSha: result.commitSha,
        githubCommitMessage: `SheenApps sync: ${versionContent.versionId}`,
        localVersionId: versionContent.versionId,
        localCommitSha: versionContent.commitSha,
        filesChanged: versionContent.stats.filesChanged,
        insertions: versionContent.stats.linesAdded,
        deletions: versionContent.stats.linesRemoved,
        metadata: { prUrl: result.prUrl }
      });

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'GitHub sync-to completed successfully',
        { 
          operationId, 
          projectId, 
          versionId: versionContent.versionId,
          syncMode: projectConfig.githubSyncMode,
          commitSha: result.commitSha,
          prUrl: result.prUrl
        }
      );

      // Return result for worker to emit completion event
      return result;

    } catch (error: any) {
      await this.updateSyncOperation(operationId, {
        status: 'failed',
        errorMessage: error.message,
        errorCode: error.code || 'SYNC_TO_ERROR'
      });

      await this.loggingService.logCriticalError(
        'github_sync_to_failed',
        error,
        { operationId, projectId, versionId }
      );

      throw error; // Re-throw for BullMQ retry logic
    }
  }

  /**
   * Sync local version to GitHub using appropriate sync mode
   */
  private async syncToGitHub(
    projectConfig: ProjectGitHubConfig,
    versionContent: LocalVersionContent,
    operationId: string,
    buildId: string
  ): Promise<SyncResult> {
    const repo: GitHubRepo = {
      owner: projectConfig.githubRepoOwner,
      repo: projectConfig.githubRepoName,
      branch: projectConfig.githubBranch,
      installationId: projectConfig.githubInstallationId,
      syncMode: projectConfig.githubSyncMode,
      branchProtection: false // Will be determined dynamically
    };

    // Progress: Getting repository information
    await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
      operationId,
      projectId: projectConfig.projectId,
      message: 'Getting GitHub repository information...',
      percent: 50
    });

    // Get current GitHub repository info (default branch, protection status)
    const repoInfo = await this.githubService.getRepositoryInfo(repo);
    repo.branch = repoInfo.defaultBranch; // Always use actual default branch
    repo.branchProtection = repoInfo.protected;

    // Get current HEAD SHA from GitHub
    const currentGitHubSha = await this.githubService.getHeadSha(repo);

    // Progress: Preparing file changes
    await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
      operationId,
      projectId: projectConfig.projectId,
      message: 'Preparing file changes...',
      percent: 60
    });

    // Prepare file changes
    const fileChanges: FileChange[] = versionContent.files
      .filter(f => !f.isDirectory) // Skip directories
      .map(f => ({
        path: f.path,
        content: f.content,
        mode: f.path.endsWith('.sh') || f.path.endsWith('.py') ? '100755' : '100644'
      }));

    // Decide sync strategy based on mode and repository state
    const syncStrategy = this.determineSyncStrategy(
      projectConfig.githubSyncMode,
      repo.branchProtection,
      currentGitHubSha,
      projectConfig.lastSyncedMainSha
    );

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      `Using sync strategy: ${syncStrategy}`,
      { 
        operationId, 
        projectId: projectConfig.projectId,
        syncMode: projectConfig.githubSyncMode,
        branchProtected: repo.branchProtection,
        canFastForward: currentGitHubSha === projectConfig.lastSyncedMainSha
      }
    );

    // Progress: Executing sync strategy
    await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
      operationId,
      projectId: projectConfig.projectId,
      message: `Executing ${syncStrategy} sync...`,
      percent: 70
    });

    let result: SyncResult;
    switch (syncStrategy) {
      case 'direct_commit':
        // Progress: Creating commit
        await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
          operationId,
          projectId: projectConfig.projectId,
          message: 'Creating direct commit to GitHub...',
          percent: 80
        });
        result = await this.directCommitSync(repo, fileChanges, versionContent, currentGitHubSha);
        break;
        
      case 'force_push':
        // Progress: Force pushing
        await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
          operationId,
          projectId: projectConfig.projectId,
          message: 'Force pushing changes to GitHub...',
          percent: 80
        });
        result = await this.forcePushSync(repo, fileChanges, versionContent, currentGitHubSha);
        break;
        
      case 'pull_request':
        // Progress: Creating pull request
        await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
          operationId,
          projectId: projectConfig.projectId,
          message: 'Creating pull request...',
          percent: 80
        });
        result = await this.pullRequestSync(repo, fileChanges, versionContent, operationId);
        break;
        
      default:
        throw new Error(`Unknown sync strategy: ${syncStrategy}`);
    }

    // Progress: Finalizing sync
    await emitGitHubSyncEvent(buildId, GitHubSyncEvent.SYNC_PROGRESS, {
      operationId,
      projectId: projectConfig.projectId,
      message: 'Finalizing sync operation...',
      percent: 95
    });

    return result;
  }

  /**
   * Determine the best sync strategy based on mode and repository state
   */
  private determineSyncStrategy(
    syncMode: SyncMode,
    branchProtected: boolean,
    currentGitHubSha: string,
    lastSyncedSha?: string
  ): 'direct_commit' | 'force_push' | 'pull_request' {
    const canFastForward = currentGitHubSha === lastSyncedSha;

    switch (syncMode) {
      case SyncMode.DIRECT_COMMIT:
        // Lovable-style: Always try direct commits, force if needed
        if (branchProtected) {
          return 'pull_request'; // Can't force push to protected branch
        }
        return canFastForward ? 'direct_commit' : 'force_push';

      case SyncMode.PROTECTED_PR:
        // Always use PRs for safety
        return 'pull_request';

      case SyncMode.HYBRID:
        // Smart mode: direct commit if safe, PR if conflicts or protected
        if (branchProtected || !canFastForward) {
          return 'pull_request';
        }
        return 'direct_commit';

      default:
        return 'pull_request'; // Default to safest option
    }
  }

  /**
   * Direct commit to main branch (fast-forward safe)
   */
  private async directCommitSync(
    repo: GitHubRepo,
    fileChanges: FileChange[],
    versionContent: LocalVersionContent,
    baseCommitSha: string
  ): Promise<SyncResult> {
    const commitMessage = `SheenApps sync: ${versionContent.versionId}\n\nAuto-synced from SheenApps platform`;

    try {
      // Create tree and commit using Git Data API
      const { commitSha } = await this.githubService.createTreeCommit(
        repo,
        fileChanges,
        baseCommitSha,
        commitMessage
      );

      // Update reference (fast-forward only)
      await this.githubService.updateRef(repo, commitSha, false);

      return {
        success: true,
        commitSha,
        warnings: ['Direct commit to main branch']
      };

    } catch (error: any) {
      throw new Error(`Direct commit failed: ${error.message}`);
    }
  }

  /**
   * Force push to main branch (Lovable-style)
   */
  private async forcePushSync(
    repo: GitHubRepo,
    fileChanges: FileChange[],
    versionContent: LocalVersionContent,
    baseCommitSha: string
  ): Promise<SyncResult> {
    const commitMessage = `SheenApps sync: ${versionContent.versionId}\n\nForce-synced from SheenApps platform (GitHub wins policy)`;

    try {
      // Create tree and commit using Git Data API
      const { commitSha } = await this.githubService.createTreeCommit(
        repo,
        fileChanges,
        baseCommitSha,
        commitMessage
      );

      // Force update reference
      await this.githubService.updateRef(repo, commitSha, true);

      // Log force push for audit
      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'GitHub force push executed',
        {
          projectId: versionContent.projectId,
          versionId: versionContent.versionId,
          repo: `${repo.owner}/${repo.repo}`,
          fromSha: baseCommitSha,
          toSha: commitSha
        }
      );

      return {
        success: true,
        commitSha,
        warnings: ['Force push used - GitHub history may be overwritten']
      };

    } catch (error: any) {
      throw new Error(`Force push failed: ${error.message}`);
    }
  }

  /**
   * Create pull request for safer sync
   */
  private async pullRequestSync(
    repo: GitHubRepo,
    fileChanges: FileChange[],
    versionContent: LocalVersionContent,
    operationId: string
  ): Promise<SyncResult> {
    const branchName = `sheenapps-sync-${versionContent.versionId}-${Date.now()}`;
    const commitMessage = `SheenApps sync: ${versionContent.versionId}`;

    try {
      // Get current HEAD SHA as base for PR branch
      const baseCommitSha = await this.githubService.getHeadSha(repo);

      // Create tree and commit for PR branch
      const { commitSha } = await this.githubService.createTreeCommit(
        repo,
        fileChanges,
        baseCommitSha,
        commitMessage
      );

      // Create new branch with the commit
      const octokit = await this.githubService.getInstallationOctokit(repo.installationId);
      await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
        owner: repo.owner,
        repo: repo.repo,
        ref: `refs/heads/${branchName}`,
        sha: commitSha,
      });

      // Create pull request
      const prTitle = `SheenApps Sync: ${versionContent.versionId}`;
      const prBody = `## SheenApps Platform Sync\n\n` +
        `This PR contains changes synchronized from the SheenApps platform.\n\n` +
        `**Version:** ${versionContent.versionId}\n` +
        `**Files changed:** ${versionContent.stats.filesChanged}\n` +
        `**Lines added:** ${versionContent.stats.linesAdded}\n` +
        `**Lines removed:** ${versionContent.stats.linesRemoved}\n\n` +
        `*This PR was automatically generated by the SheenApps GitHub sync system.*`;

      const { url: prUrl, number: prNumber } = await this.githubService.createPullRequest(
        repo,
        prTitle,
        prBody,
        branchName,
        repo.branch
      );

      return {
        success: true,
        commitSha,
        prUrl,
        warnings: ['Created pull request - manual review required']
      };

    } catch (error: any) {
      throw new Error(`Pull request sync failed: ${error.message}`);
    }
  }

  /**
   * Get local version content from the database and filesystem
   */
  private async getLocalVersionContent(
    projectId: string, 
    versionId: string
  ): Promise<LocalVersionContent | null> {
    // Get version metadata from database
    const version = await getProjectVersion(versionId!);
    if (!version) {
      return null;
    }

    // For now, we'll simulate getting file content from the project
    // In a real implementation, this would read from the working directory or artifact store
    const workingDir = `/tmp/sheen-projects/${projectId}`;
    
    try {
      const files = await this.getProjectFiles(workingDir);
      
      return {
        versionId: version.versionId,
        projectId: version.projectId,
        userId: version.userId,
        commitSha: versionId, // Use versionId as commitSha for now
        files,
        stats: {
          filesChanged: files.length,
          linesAdded: files.reduce((sum, f) => sum + (f.content?.split('\n').length || 0), 0),
          linesRemoved: 0 // Would need diff analysis for accurate count
        }
      };
    } catch (error) {
      // If working directory doesn't exist, return minimal content
      return {
        versionId: version.versionId,
        projectId: version.projectId,
        userId: version.userId,
        commitSha: versionId, // Use versionId as commitSha for now
        files: [
          {
            path: 'README.md',
            content: `# ${projectId}\n\nSynchronized from SheenApps platform.\n`,
            isDirectory: false
          }
        ],
        stats: {
          filesChanged: 1,
          linesAdded: 3,
          linesRemoved: 0
        }
      };
    }
  }

  /**
   * Recursively get all files from a project directory
   */
  private async getProjectFiles(
    baseDir: string,
    relativePath: string = ''
  ): Promise<Array<{ path: string; content: string; isDirectory: boolean; }>> {
    const files: Array<{ path: string; content: string; isDirectory: boolean; }> = [];
    const currentDir = path.join(baseDir, relativePath);

    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(relativePath, entry.name);
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // Skip common directories that shouldn't be synced
          if (['.git', 'node_modules', '.next', 'dist', 'build', '.sheenapps-project'].includes(entry.name)) {
            continue;
          }

          files.push({
            path: entryPath,
            content: '',
            isDirectory: true
          });

          // Recursively get files from subdirectory
          const subFiles = await this.getProjectFiles(baseDir, entryPath);
          files.push(...subFiles);
        } else {
          // Read file content
          try {
            const content = await fs.readFile(fullPath, 'utf8');
            files.push({
              path: entryPath,
              content,
              isDirectory: false
            });
          } catch (readError) {
            // Skip files that can't be read (binary files, permissions, etc.)
            continue;
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }

    return files;
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
   * Create sync operation record
   */
  private async createSyncOperation(operation: {
    id: string;
    projectId: string;
    operationType: string;
    status: string;
    direction: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    localVersionId?: string | undefined;
    metadata?: any | undefined;
  }): Promise<void> {
    const client = await getDbClient();
    try {
      await client.query(`
        INSERT INTO github_sync_operations (
          id, project_id, operation_type, status, direction,
          local_version_id, started_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      `, [
        operation.id,
        operation.projectId,
        operation.operationType,
        operation.status,
        operation.direction,
        operation.localVersionId,
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
    updates: {
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      status?: string | undefined;
      githubCommitSha?: string | undefined;
      githubCommitMessage?: string | undefined;
      localVersionId?: string | undefined;
      localCommitSha?: string | undefined;
      filesChanged?: number | undefined;
      insertions?: number | undefined;
      deletions?: number | undefined;
      errorMessage?: string | undefined;
      errorCode?: string | undefined;
      metadata?: any | undefined;
    }
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
          
          // Special handling for metadata
          if (key === 'metadata') {
            values.push(value ? JSON.stringify(value) : null);
          } else {
            values.push(value);
          }
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
let githubSyncToServiceInstance: GitHubSyncToService | null = null;

export function getGitHubSyncToService(): GitHubSyncToService {
  if (!githubSyncToServiceInstance) {
    githubSyncToServiceInstance = new GitHubSyncToService();
  }
  return githubSyncToServiceInstance;
}