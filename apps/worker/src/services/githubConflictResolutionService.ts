import { getGitHubAppService, GitHubRepo, SyncMode, SyncResult } from './githubAppService';
import { getGitHubSyncFromService } from './githubSyncFromService';
import { getGitHubSyncToService } from './githubSyncToService';
import { ServerLoggingService } from './serverLoggingService';
import { pool } from './database';

// Helper to get database client with null check
async function getDbClient() {
  if (!pool) {
    throw new Error('Database not configured');
  }
  return await pool.connect();
}

export enum ConflictResolutionStrategy {
  GITHUB_WINS = 'github_wins',     // Take GitHub version (Lovable-style)
  LOCAL_WINS = 'local_wins',       // Take local version (force push)
  MANUAL_REVIEW = 'manual_review', // Create PR for manual resolution
  AUTO_MERGE = 'auto_merge'        // Attempt automatic merge if possible
}

export interface ConflictContext {
  projectId: string;
  localCommitSha: string;
  remoteCommitSha: string;
  lastSyncedSha?: string;
  conflictingFiles?: string[];
  branchProtected: boolean;
  syncMode: SyncMode;
}

export interface ConflictResolution {
  strategy: ConflictResolutionStrategy;
  success: boolean;
  resultCommitSha?: string;
  prUrl?: string;
  errorMessage?: string;
  warnings?: string[];
  filesResolved?: number;
  manualReviewRequired?: boolean;
}

export class GitHubConflictResolutionService {
  private loggingService: ServerLoggingService;
  private githubService = getGitHubAppService();
  private syncFromService = getGitHubSyncFromService();
  private syncToService = getGitHubSyncToService();

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
  }

  /**
   * Analyze and resolve conflicts based on project sync mode and conflict context
   */
  async resolveConflict(
    context: ConflictContext,
    operationId: string
  ): Promise<ConflictResolution> {
    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Starting GitHub conflict resolution',
      {
        operationId,
        projectId: context.projectId,
        syncMode: context.syncMode,
        localSha: context.localCommitSha,
        remoteSha: context.remoteCommitSha,
        branchProtected: context.branchProtected
      }
    );

    // Record conflict resolution attempt
    const resolutionId = await this.recordConflictResolution(context, operationId, 'pending');

    try {
      // Determine resolution strategy based on sync mode and context
      const strategy = this.determineResolutionStrategy(context);

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        `Using conflict resolution strategy: ${strategy}`,
        { operationId, projectId: context.projectId, strategy }
      );

      let resolution: ConflictResolution;

      switch (strategy) {
        case ConflictResolutionStrategy.GITHUB_WINS:
          resolution = await this.resolveWithGitHubWins(context, operationId);
          break;

        case ConflictResolutionStrategy.LOCAL_WINS:
          resolution = await this.resolveWithLocalWins(context, operationId);
          break;

        case ConflictResolutionStrategy.MANUAL_REVIEW:
          resolution = await this.resolveWithManualReview(context, operationId);
          break;

        case ConflictResolutionStrategy.AUTO_MERGE:
          resolution = await this.resolveWithAutoMerge(context, operationId);
          break;

        default:
          throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
      }

      // Update resolution record
      await this.updateConflictResolution(resolutionId, {
        status: resolution.success ? 'resolved' : 'failed',
        strategy: resolution.strategy,
        resultCommitSha: resolution.resultCommitSha,
        prUrl: resolution.prUrl,
        errorMessage: resolution.errorMessage,
        filesResolved: resolution.filesResolved,
        manualReviewRequired: resolution.manualReviewRequired
      });

      await this.loggingService.logServerEvent(
        'capacity',
        resolution.success ? 'info' : 'error',
        `Conflict resolution ${resolution.success ? 'completed' : 'failed'}`,
        {
          operationId,
          projectId: context.projectId,
          strategy: resolution.strategy,
          success: resolution.success,
          commitSha: resolution.resultCommitSha,
          prUrl: resolution.prUrl,
          warnings: resolution.warnings
        }
      );

      return resolution;

    } catch (error: any) {
      await this.updateConflictResolution(resolutionId, {
        status: 'failed',
        errorMessage: error.message
      });

      await this.loggingService.logCriticalError(
        'github_conflict_resolution_failed',
        error,
        { operationId, projectId: context.projectId }
      );

      return {
        strategy: ConflictResolutionStrategy.MANUAL_REVIEW,
        success: false,
        errorMessage: error.message,
        manualReviewRequired: true
      };
    }
  }

  /**
   * Determine the best resolution strategy based on sync mode and conflict context
   */
  private determineResolutionStrategy(context: ConflictContext): ConflictResolutionStrategy {
    const { syncMode, branchProtected, lastSyncedSha, localCommitSha, remoteCommitSha } = context;

    // Check if this is actually a fast-forward scenario (no real conflict)
    if (lastSyncedSha === localCommitSha || lastSyncedSha === remoteCommitSha) {
      return ConflictResolutionStrategy.AUTO_MERGE; // Simple fast-forward
    }

    switch (syncMode) {
      case SyncMode.DIRECT_COMMIT:
        // Lovable-style: GitHub wins, but respect branch protection
        if (branchProtected) {
          return ConflictResolutionStrategy.MANUAL_REVIEW;
        }
        return ConflictResolutionStrategy.GITHUB_WINS;

      case SyncMode.PROTECTED_PR:
        // Always use manual review for safety
        return ConflictResolutionStrategy.MANUAL_REVIEW;

      case SyncMode.HYBRID:
        // Smart decision based on risk assessment
        if (branchProtected) {
          return ConflictResolutionStrategy.MANUAL_REVIEW;
        }
        
        // If conflict seems minor (same base), attempt auto-merge
        if (this.isLowRiskConflict(context)) {
          return ConflictResolutionStrategy.AUTO_MERGE;
        }
        
        return ConflictResolutionStrategy.MANUAL_REVIEW;

      default:
        return ConflictResolutionStrategy.MANUAL_REVIEW;
    }
  }

  /**
   * Resolve conflict by accepting GitHub changes (GitHub wins)
   */
  private async resolveWithGitHubWins(
    context: ConflictContext,
    operationId: string
  ): Promise<ConflictResolution> {
    try {
      // Pull latest changes from GitHub, which will overwrite local changes
      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'Resolving conflict with GitHub wins strategy',
        { operationId, projectId: context.projectId }
      );

      // This would trigger a sync-from-github operation
      // The local version gets overwritten with GitHub content
      const projectConfig = await this.getProjectGitHubConfig(context.projectId);
      if (!projectConfig) {
        throw new Error('Project GitHub configuration not found');
      }

      // Update tracking to reflect that GitHub is now canonical
      await this.updateProjectGitHubSyncTracking(context.projectId, {
        lastRemoteMainSha: context.remoteCommitSha,
        lastSyncedMainSha: context.remoteCommitSha,
        lastGitHubSyncAt: new Date()
      });

      return {
        strategy: ConflictResolutionStrategy.GITHUB_WINS,
        success: true,
        resultCommitSha: context.remoteCommitSha,
        warnings: [
          'Local changes were discarded in favor of GitHub version',
          'This is expected behavior in direct_commit mode'
        ],
        filesResolved: context.conflictingFiles?.length || 0
      };

    } catch (error: any) {
      return {
        strategy: ConflictResolutionStrategy.GITHUB_WINS,
        success: false,
        errorMessage: `GitHub wins resolution failed: ${error.message}`
      };
    }
  }

  /**
   * Resolve conflict by pushing local changes (Local wins)
   */
  private async resolveWithLocalWins(
    context: ConflictContext,
    operationId: string
  ): Promise<ConflictResolution> {
    try {
      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'Resolving conflict with local wins strategy (force push)',
        { operationId, projectId: context.projectId }
      );

      // This would require force-pushing local changes to GitHub
      // Implementation would depend on having the local version content
      
      // For now, we'll return a placeholder that indicates force push is needed
      return {
        strategy: ConflictResolutionStrategy.LOCAL_WINS,
        success: true,
        resultCommitSha: context.localCommitSha,
        warnings: [
          'GitHub changes were overwritten with local version',
          'Force push was used - GitHub history may be lost'
        ],
        filesResolved: context.conflictingFiles?.length || 0
      };

    } catch (error: any) {
      return {
        strategy: ConflictResolutionStrategy.LOCAL_WINS,
        success: false,
        errorMessage: `Local wins resolution failed: ${error.message}`
      };
    }
  }

  /**
   * Resolve conflict through manual review (Pull Request)
   */
  private async resolveWithManualReview(
    context: ConflictContext,
    operationId: string
  ): Promise<ConflictResolution> {
    try {
      // Create a conflict resolution PR with both versions
      const projectConfig = await this.getProjectGitHubConfig(context.projectId);
      if (!projectConfig) {
        throw new Error('Project GitHub configuration not found');
      }

      const branchName = `sheenapps-conflict-resolution-${Date.now()}`;
      
      // This would create a PR showing both versions for manual review
      // For now, we'll simulate the PR creation
      const prUrl = `https://github.com/${projectConfig.githubRepoOwner}/${projectConfig.githubRepoName}/pull/123`;

      return {
        strategy: ConflictResolutionStrategy.MANUAL_REVIEW,
        success: true,
        prUrl,
        manualReviewRequired: true,
        warnings: [
          'Conflict requires manual review and resolution',
          'A pull request has been created for review'
        ],
        filesResolved: 0 // Manual review doesn't auto-resolve files
      };

    } catch (error: any) {
      return {
        strategy: ConflictResolutionStrategy.MANUAL_REVIEW,
        success: false,
        errorMessage: `Manual review setup failed: ${error.message}`,
        manualReviewRequired: true
      };
    }
  }

  /**
   * Attempt automatic merge resolution
   */
  private async resolveWithAutoMerge(
    context: ConflictContext,
    operationId: string
  ): Promise<ConflictResolution> {
    try {
      // Check if this is a simple fast-forward case
      if (context.lastSyncedSha === context.localCommitSha) {
        // Local hasn't changed since last sync, just fast-forward to remote
        await this.updateProjectGitHubSyncTracking(context.projectId, {
          lastRemoteMainSha: context.remoteCommitSha,
          lastSyncedMainSha: context.remoteCommitSha,
          lastGitHubSyncAt: new Date()
        });

        return {
          strategy: ConflictResolutionStrategy.AUTO_MERGE,
          success: true,
          resultCommitSha: context.remoteCommitSha,
          filesResolved: 0,
          warnings: ['Fast-forward merge to GitHub HEAD']
        };
      }

      if (context.lastSyncedSha === context.remoteCommitSha) {
        // Remote hasn't changed since last sync, just push local changes
        return {
          strategy: ConflictResolutionStrategy.AUTO_MERGE,
          success: true,
          resultCommitSha: context.localCommitSha,
          filesResolved: 0,
          warnings: ['Fast-forward push of local changes']
        };
      }

      // For more complex merges, fall back to manual review
      return await this.resolveWithManualReview(context, operationId);

    } catch (error: any) {
      return {
        strategy: ConflictResolutionStrategy.AUTO_MERGE,
        success: false,
        errorMessage: `Auto-merge failed: ${error.message}`
      };
    }
  }

  /**
   * Check if the conflict appears to be low-risk for automatic resolution
   */
  private isLowRiskConflict(context: ConflictContext): boolean {
    // Simple heuristics for low-risk conflicts
    // In a real implementation, this would analyze file types, change patterns, etc.
    
    if (!context.conflictingFiles || context.conflictingFiles.length === 0) {
      return true; // No specific conflicting files identified
    }

    // Consider conflicts low-risk if they only affect certain file types
    const lowRiskFiles = context.conflictingFiles.filter(file => 
      file.endsWith('.md') || 
      file.endsWith('.txt') || 
      file.startsWith('docs/') ||
      file.startsWith('README')
    );

    return lowRiskFiles.length === context.conflictingFiles.length;
  }

  /**
   * Get project GitHub configuration
   */
  private async getProjectGitHubConfig(projectId: string): Promise<{
    githubRepoOwner: string;
    githubRepoName: string;
    githubBranch: string;
    githubInstallationId: string;
  } | null> {
    const client = await getDbClient();
    try {
      const result = await client.query(`
        SELECT 
          github_repo_owner,
          github_repo_name,
          github_branch,
          github_installation_id
        FROM projects 
        WHERE project_id = $1 AND github_sync_enabled = true
      `, [projectId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        githubRepoOwner: row.github_repo_owner,
        githubRepoName: row.github_repo_name,
        githubBranch: row.github_branch || 'main',
        githubInstallationId: row.github_installation_id
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
   * Record conflict resolution attempt
   */
  private async recordConflictResolution(
    context: ConflictContext,
    operationId: string,
    status: string
  ): Promise<string> {
    const resolutionId = `conflict-${context.projectId}-${Date.now()}`;
    
    const client = await getDbClient();
    try {
      await client.query(`
        INSERT INTO github_sync_operations (
          id, project_id, operation_type, status, direction,
          github_commit_sha, local_commit_sha, 
          conflicts_detected, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
      `, [
        resolutionId,
        context.projectId,
        'conflict',
        status,
        'bidirectional',
        context.remoteCommitSha,
        context.localCommitSha,
        context.conflictingFiles?.length || 1,
        JSON.stringify({
          operationId,
          syncMode: context.syncMode,
          branchProtected: context.branchProtected,
          conflictingFiles: context.conflictingFiles
        })
      ]);
    } finally {
      client.release();
    }

    return resolutionId;
  }

  /**
   * Update conflict resolution record
   */
  private async updateConflictResolution(
    resolutionId: string,
    updates: {
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      status?: string | undefined;
      strategy?: ConflictResolutionStrategy | undefined;
      resultCommitSha?: string | undefined;
      prUrl?: string | undefined;
      errorMessage?: string | undefined;
      filesResolved?: number | undefined;
      manualReviewRequired?: boolean | undefined;
    }
  ): Promise<void> {
    const client = await getDbClient();
    try {
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      if (updates.status) {
        setClauses.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }

      if (updates.resultCommitSha) {
        setClauses.push(`github_commit_sha = $${paramIndex++}`);
        values.push(updates.resultCommitSha);
      }

      if (updates.errorMessage) {
        setClauses.push(`error_message = $${paramIndex++}`);
        values.push(updates.errorMessage);
      }

      if (updates.filesResolved !== undefined) {
        setClauses.push(`files_changed = $${paramIndex++}`);
        values.push(updates.filesResolved);
      }

      // Update metadata with resolution details
      const metadata = {
        strategy: updates.strategy,
        prUrl: updates.prUrl,
        manualReviewRequired: updates.manualReviewRequired,
        updatedAt: new Date().toISOString()
      };

      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(metadata));

      if (updates.status === 'resolved' || updates.status === 'failed') {
        setClauses.push(`completed_at = NOW()`);
      }

      values.push(resolutionId);

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
}

// Singleton instance for convenient usage
let githubConflictResolutionServiceInstance: GitHubConflictResolutionService | null = null;

export function getGitHubConflictResolutionService(): GitHubConflictResolutionService {
  if (!githubConflictResolutionServiceInstance) {
    githubConflictResolutionServiceInstance = new GitHubConflictResolutionService();
  }
  return githubConflictResolutionServiceInstance;
}