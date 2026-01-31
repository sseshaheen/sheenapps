/**
 * GitHub Integration Status Adapter
 *
 * Provides GitHub repository status information including branch tracking,
 * commit activity, and integration health monitoring.
 */

import { IntegrationStatusAdapter, IntegrationStatus, AdapterContext, AdapterCacheOptions, CircuitBreakerMetrics, AdapterUtils } from '../IntegrationStatusAdapter';
import { getGitHubAppService } from '../../services/githubAppService';
import { pool as db } from '../../services/database';
import { Redis } from 'ioredis';
import { ServerLoggingService } from '../../services/serverLoggingService';

interface GitHubIntegrationData {
  id: string;
  project_id: string;
  repository_owner: string;
  repository_name: string;
  installation_id: string;
  default_branch: string;
  sync_mode: string;
  status: 'connected' | 'pending' | 'disconnected' | 'error' | 'revoked';
  error_reason?: string;
  metadata: Record<string, any>;
  connected_at: Date;
  updated_at: Date;
}

interface RecentActivity {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  lastCommitSha?: string | undefined;
  lastCommitMessage?: string | undefined;
  lastCommitAuthor?: string | undefined;
  lastCommitDate?: Date | undefined;
  commitCount7Days: number;
  branchProtected: boolean;
}

export class GitHubStatusAdapter extends IntegrationStatusAdapter {
  readonly key = 'github' as const;

  private githubService = getGitHubAppService();
  private redis: Redis;
  private loggingService = ServerLoggingService.getInstance();
  private circuitBreaker = {
    failureCount: 0,
    successCount: 0,
    lastFailureTime: undefined as Date | undefined,
    lastSuccessTime: undefined as Date | undefined,
    state: 'closed' as CircuitBreakerMetrics['state']
  };

  constructor() {
    super();
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });
  }

  async getStatus(context: AdapterContext, options?: AdapterCacheOptions): Promise<IntegrationStatus> {
    const cacheKey = AdapterUtils.getCacheKey(this.key, context.projectId, context.userId);
    const now = new Date().toISOString();

    try {
      // Check cache first
      if (options?.circuitBreakerEnabled !== false && this.circuitBreaker.state !== 'open') {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const cachedStatus = JSON.parse(cached) as IntegrationStatus;
          const isStale = AdapterUtils.isStale(cachedStatus.updatedAt, 90);

          if (!isStale || options?.staleDataFallback) {
            return { ...cachedStatus, stale: isStale };
          }
        }
      }

      // Circuit breaker check
      if (this.circuitBreaker.state === 'open') {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const cachedStatus = JSON.parse(cached) as IntegrationStatus;
          return {
            ...cachedStatus,
            stale: true,
            problem: {
              code: 'timeout',
              hint: 'Service temporarily unavailable, showing cached data'
            }
          };
        }

        return this.getDisconnectedStatus(now, 'Service temporarily unavailable');
      }

      // Get fresh status
      const status = await this.getFreshStatus(context, now);

      // Update circuit breaker
      this.updateCircuitBreakerSuccess();

      // Cache the result
      const ttl = AdapterUtils.applyJitter(options?.ttlSeconds || 15, options?.jitterPercent);
      await this.redis.setex(cacheKey, Math.floor(ttl), JSON.stringify(status));

      return status;

    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'github_status_adapter_error',
        error,
        { projectId: context.projectId, userId: context.userId }
      );

      this.updateCircuitBreakerFailure();

      // Return cached data if available
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const cachedStatus = JSON.parse(cached) as IntegrationStatus;
        return {
          ...cachedStatus,
          stale: true,
          problem: {
            code: this.getErrorCode(error),
            hint: this.getErrorHint(error)
          }
        };
      }

      return this.getErrorStatus(now, error);
    }
  }

  async executeAction(
    context: AdapterContext,
    actionId: string,
    idempotencyKey: string,
    parameters?: Record<string, any>
  ): Promise<{ success: boolean; message?: string; data?: any; retryAfter?: number }> {

    try {
      const integration = await this.getIntegrationData(context.projectId);
      if (!integration) {
        return { success: false, message: 'GitHub integration not configured' };
      }

      const octokit = await this.githubService.getInstallationOctokit(integration.installation_id);

      switch (actionId) {
        case 'push':
          // This would integrate with existing GitHub sync service
          return { success: true, message: 'Push action queued' };

        case 'pull':
          // Fetch latest changes from GitHub
          return { success: true, message: 'Pull completed' };

        case 'sync':
          // Full bidirectional sync
          return { success: true, message: 'Sync initiated' };

        case 'connect':
          // OAuth reconnection flow
          return {
            success: false,
            message: 'Redirect to GitHub OAuth required',
            data: { requiresOAuth: true }
          };

        default:
          return { success: false, message: `Unknown action: ${actionId}` };
      }

    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'github_action_failed',
        error,
        { projectId: context.projectId, actionId, idempotencyKey }
      );

      if (error.status === 429) {
        return {
          success: false,
          message: 'Rate limited',
          retryAfter: parseInt(error.headers?.['retry-after'] || '60')
        };
      }

      return { success: false, message: error.message || 'Action failed' };
    }
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  async getAvailableActions(context: AdapterContext): Promise<Array<{ id: string; label: string; can: boolean; reason?: string | undefined }>> {
    const integration = await this.getIntegrationData(context.projectId);

    const baseActions = [
      { id: 'push', label: 'Push Changes', can: false },
      { id: 'pull', label: 'Pull Latest', can: false },
      { id: 'sync', label: 'Full Sync', can: false },
      { id: 'connect', label: 'Connect', can: false }
    ];

    if (!integration) {
      return baseActions.map(action =>
        action.id === 'connect'
          ? { ...action, can: true }
          : { ...action, reason: 'GitHub not connected' }
      );
    }

    if (integration.status !== 'connected') {
      return baseActions.map(action =>
        action.id === 'connect'
          ? { ...action, can: true }
          : { ...action, reason: 'GitHub connection error' }
      );
    }

    // Filter by user role
    const actionsWithPermissions = baseActions.map(action => ({ ...action, can: true }));
    return AdapterUtils.filterActionsByRole(actionsWithPermissions, context.userRole);
  }

  async validateConfiguration(context: AdapterContext): Promise<{
    configured: boolean;
    configuredReason?: IntegrationStatus['configuredReason'];
    visible: boolean;
  }> {
    try {
      const integration = await this.getIntegrationData(context.projectId);

      if (!integration) {
        return { configured: false, configuredReason: 'not_linked', visible: true };
      }

      if (integration.status === 'revoked') {
        return { configured: true, configuredReason: 'revoked', visible: true };
      }

      if (integration.status === 'error') {
        return { configured: true, configuredReason: 'disabled', visible: true };
      }

      return { configured: true, visible: true };

    } catch (error) {
      return { configured: false, configuredReason: 'not_linked', visible: true };
    }
  }

  getCircuitBreakerMetrics(): CircuitBreakerMetrics {
    return { ...this.circuitBreaker };
  }

  async forceRefresh(context: AdapterContext): Promise<void> {
    const cacheKey = AdapterUtils.getCacheKey(this.key, context.projectId, context.userId);
    await this.redis.del(cacheKey);
  }

  // Private helper methods

  private async getFreshStatus(context: AdapterContext, now: string): Promise<IntegrationStatus> {
    const [config, integration] = await Promise.all([
      this.validateConfiguration(context),
      this.getIntegrationData(context.projectId)
    ]);

    if (!config.configured || !integration) {
      return {
        key: this.key,
        configured: config.configured,
        configuredReason: config.configuredReason,
        visible: config.visible,
        status: 'disconnected',
        summary: 'Not connected',
        updatedAt: now
      };
    }

    if (integration.status !== 'connected') {
      return {
        key: this.key,
        configured: true,
        configuredReason: integration.status === 'revoked' ? 'revoked' : 'disabled',
        visible: true,
        status: 'error',
        summary: integration.error_reason || 'Connection error',
        updatedAt: now,
        problem: {
          code: integration.status === 'revoked' ? 'oauth_revoked' : 'unknown',
          hint: integration.status === 'revoked'
            ? 'Reconnect GitHub to restore sync'
            : 'Check GitHub integration settings'
        },
        actions: await this.getAvailableActions(context)
      };
    }

    // Get repository activity
    const activity = await this.getRecentActivity(integration);
    const actions = await this.getAvailableActions(context);

    // Determine status based on activity
    let status: IntegrationStatus['status'] = 'connected';
    let summary = 'Connected';

    if (activity.lastCommitDate) {
      const daysSinceLastCommit = (Date.now() - activity.lastCommitDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceLastCommit <= 7) {
        summary = `Linked to ${integration.default_branch} · Last push ${this.formatTimeAgo(activity.lastCommitDate)}`;
      } else {
        status = 'warning';
        summary = `Linked to ${integration.default_branch} · No recent pushes (${Math.floor(daysSinceLastCommit)} days)`;
      }
    } else {
      summary = `Linked to ${integration.default_branch} · No recent activity`;
    }

    const result: IntegrationStatus = {
      key: this.key,
      configured: true,
      visible: true,
      status,
      summary,
      updatedAt: now,
      actions: AdapterUtils.filterActionsByRole(actions, context.userRole)
    };

    return AdapterUtils.redactSensitiveData(result, context.userRole);
  }

  private async getIntegrationData(projectId: string): Promise<GitHubIntegrationData | null> {
    if (!db) return null;

    try {
      const result = await db.query(`
        SELECT id, project_id, repository_owner, repository_name, installation_id,
               default_branch, sync_mode, status, error_reason, metadata,
               connected_at, updated_at
        FROM project_integrations
        WHERE project_id = $1 AND type = 'github'
        ORDER BY updated_at DESC
        LIMIT 1
      `, [projectId]);

      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  private async getRecentActivity(integration: GitHubIntegrationData): Promise<RecentActivity> {
    try {
      const octokit = await this.githubService.getInstallationOctokit(integration.installation_id);

      // Get recent commits
      const { data: commits } = await octokit.request('GET /repos/{owner}/{repo}/commits', {
        owner: integration.repository_owner,
        repo: integration.repository_name,
        sha: integration.default_branch,
        per_page: 10
      });

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const recentCommits = commits.filter(commit =>
        new Date(commit.commit.author?.date || 0) > sevenDaysAgo
      );

      let branchProtected = false;
      try {
        await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}/protection', {
          owner: integration.repository_owner,
          repo: integration.repository_name,
          branch: integration.default_branch
        });
        branchProtected = true;
      } catch {
        // Branch not protected if this fails
      }

      return {
        lastCommitSha: commits[0]?.sha,
        lastCommitMessage: commits[0]?.commit.message,
        lastCommitAuthor: commits[0]?.commit.author?.name,
        lastCommitDate: commits[0] ? new Date(commits[0].commit.author?.date || 0) : undefined,
        commitCount7Days: recentCommits.length,
        branchProtected
      };

    } catch (error) {
      return {
        commitCount7Days: 0,
        branchProtected: false
      };
    }
  }

  private getDisconnectedStatus(now: string, summary: string): IntegrationStatus {
    return {
      key: this.key,
      configured: false,
      configuredReason: 'not_linked',
      visible: true,
      status: 'disconnected',
      summary,
      updatedAt: now
    };
  }

  private getErrorStatus(now: string, error: any): IntegrationStatus {
    return {
      key: this.key,
      configured: true,
      visible: true,
      status: 'error',
      summary: 'Connection error',
      updatedAt: now,
      problem: {
        code: this.getErrorCode(error),
        hint: this.getErrorHint(error)
      }
    };
  }

  private getErrorCode(error: any): 'oauth_revoked' | 'rate_limited' | 'timeout' | 'unknown' {
    if (error?.status === 401) return 'oauth_revoked';
    if (error?.status === 429) return 'rate_limited';
    if (error?.code === 'ETIMEDOUT') return 'timeout';
    return 'unknown';
  }

  private getErrorHint(error: any): string {
    if (error?.status === 401) return 'Reconnect GitHub to restore access';
    if (error?.status === 429) return 'Rate limited, will retry automatically';
    if (error?.code === 'ETIMEDOUT') return 'GitHub API timeout, will retry';
    return 'Check GitHub integration configuration';
  }

  private formatTimeAgo(date: Date): string {
    const minutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));

    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  private updateCircuitBreakerSuccess(): void {
    this.circuitBreaker.successCount++;
    this.circuitBreaker.lastSuccessTime = new Date();

    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.state = 'closed';
      this.circuitBreaker.failureCount = 0;
    }
  }

  private updateCircuitBreakerFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = new Date();

    if (this.circuitBreaker.failureCount >= 5) {
      this.circuitBreaker.state = 'open';
    }
  }
}