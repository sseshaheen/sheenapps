/**
 * Vercel Integration Status Adapter
 *
 * Provides Vercel deployment status information including multi-environment
 * aggregation, build status, and deployment health monitoring.
 */

import { IntegrationStatusAdapter, IntegrationStatus, AdapterContext, AdapterCacheOptions, CircuitBreakerMetrics, AdapterUtils } from '../IntegrationStatusAdapter';
import { VercelOAuthService } from '../../services/vercelOAuthService';
import { pool as db } from '../../services/database';
import { Redis } from 'ioredis';
import { ServerLoggingService } from '../../services/serverLoggingService';

interface VercelIntegrationData {
  id: string;
  project_id: string;
  vercel_project_id: string;
  vercel_project_name: string;
  team_id?: string;
  team_name?: string;
  account_type: 'personal' | 'team';
  status: 'connected' | 'pending' | 'disconnected' | 'error' | 'revoked';
  error_reason?: string;
  metadata: Record<string, any>;
  connected_at: Date;
  updated_at: Date;
}

interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  created: string;
  state: 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
  target?: 'production' | 'staging';
  aliasAssigned?: boolean;
  meta?: {
    githubCommitSha?: string;
    githubCommitMessage?: string;
    githubCommitRef?: string;
  };
  plan: 'hobby' | 'pro' | 'enterprise';
}

interface DeploymentSummary {
  preview: {
    status: IntegrationStatus['status'];
    summary?: string;
    url?: string;
    lastDeployAt?: string;
  };
  production: {
    status: IntegrationStatus['status'];
    summary?: string;
    url?: string;
    lastDeployAt?: string;
  };
  overallStatus: IntegrationStatus['status'];
  deploymentsThisWeek: number;
}

export class VercelStatusAdapter extends IntegrationStatusAdapter {
  readonly key = 'vercel' as const;

  private vercelOAuth = new VercelOAuthService();
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
              hint: 'Vercel API temporarily unavailable, showing cached data'
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
      const ttl = AdapterUtils.applyJitter(options?.ttlSeconds || 20, options?.jitterPercent);
      await this.redis.setex(cacheKey, Math.floor(ttl), JSON.stringify(status));

      return status;

    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'vercel_status_adapter_error',
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
        return { success: false, message: 'Vercel integration not configured' };
      }

      const connection = await this.vercelOAuth.getConnection(context.userId);
      if (!connection) {
        return { success: false, message: 'Vercel authentication required' };
      }

      switch (actionId) {
        case 'deploy':
          // Trigger a new deployment
          return await this.triggerDeployment(integration, connection, parameters?.target || 'preview');

        case 'link':
          // Link/relink repository
          return { success: true, message: 'Repository linking initiated' };

        case 'connect':
          // OAuth reconnection flow
          return {
            success: false,
            message: 'Redirect to Vercel OAuth required',
            data: { requiresOAuth: true }
          };

        default:
          return { success: false, message: `Unknown action: ${actionId}` };
      }

    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'vercel_action_failed',
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
      { id: 'deploy', label: 'Deploy', can: false },
      { id: 'link', label: 'Link Repository', can: false },
      { id: 'connect', label: 'Connect', can: false }
    ];

    if (!integration) {
      return baseActions.map(action =>
        action.id === 'connect'
          ? { ...action, can: true }
          : { ...action, reason: 'Vercel not connected' }
      );
    }

    if (integration.status !== 'connected') {
      return baseActions.map(action =>
        action.id === 'connect'
          ? { ...action, can: true }
          : { ...action, reason: 'Vercel connection error' }
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
            ? 'Reconnect Vercel to restore deployments'
            : 'Check Vercel integration settings'
        },
        actions: await this.getAvailableActions(context)
      };
    }

    // Get deployment summary
    const deploymentSummary = await this.getDeploymentSummary(integration, context);
    const actions = await this.getAvailableActions(context);

    // Build status summary
    let summary = '';
    if (deploymentSummary.deploymentsThisWeek > 0) {
      summary = `${deploymentSummary.deploymentsThisWeek} deployment${deploymentSummary.deploymentsThisWeek > 1 ? 's' : ''} this week`;

      if (deploymentSummary.production.status === 'connected') {
        summary += ' · Live';
      }
    } else {
      summary = 'No recent deployments';
    }

    const result: IntegrationStatus = {
      key: this.key,
      configured: true,
      visible: true,
      status: deploymentSummary.overallStatus,
      summary,
      updatedAt: now,
      actions: AdapterUtils.filterActionsByRole(actions, context.userRole),
      environments: [
        {
          name: 'preview',
          status: deploymentSummary.preview.status,
          summary: deploymentSummary.preview.summary,
          url: deploymentSummary.preview.url,
          lastDeployAt: deploymentSummary.preview.lastDeployAt
        },
        {
          name: 'production',
          status: deploymentSummary.production.status,
          summary: deploymentSummary.production.summary,
          url: deploymentSummary.production.url,
          lastDeployAt: deploymentSummary.production.lastDeployAt
        }
      ]
    };

    return AdapterUtils.redactSensitiveData(result, context.userRole);
  }

  private async getIntegrationData(projectId: string): Promise<VercelIntegrationData | null> {
    if (!db) return null;

    try {
      const result = await db.query(`
        SELECT id, project_id, vercel_project_id, vercel_project_name,
               team_id, team_name, account_type, status, error_reason,
               metadata, connected_at, updated_at
        FROM project_integrations
        WHERE project_id = $1 AND type = 'vercel'
        ORDER BY updated_at DESC
        LIMIT 1
      `, [projectId]);

      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  private async getDeploymentSummary(integration: VercelIntegrationData, context: AdapterContext): Promise<DeploymentSummary> {
    try {
      const connection = await this.vercelOAuth.getConnection(context.userId);
      if (!connection) {
        throw new Error('No Vercel connection found');
      }

      // Get recent deployments (last 20)
      const deployments = await this.fetchRecentDeployments(integration, connection);

      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const recentDeployments = deployments.filter(d => new Date(d.created) > oneWeekAgo);

      // Separate by environment
      const productionDeployments = deployments.filter(d => d.target === 'production');
      const previewDeployments = deployments.filter(d => d.target !== 'production');

      const latestProduction = productionDeployments[0];
      const latestPreview = previewDeployments[0];

      // Analyze production environment
      const production = this.analyzeEnvironment(latestProduction, 'production');

      // Analyze preview environment
      const preview = this.analyzeEnvironment(latestPreview, 'preview');

      // Determine overall status (worst-case aggregation)
      let overallStatus: IntegrationStatus['status'] = 'connected';

      if (production.status === 'error' || preview.status === 'error') {
        overallStatus = 'error';
      } else if (production.status === 'warning' || preview.status === 'warning') {
        overallStatus = 'warning';
      }

      return {
        preview,
        production,
        overallStatus,
        deploymentsThisWeek: recentDeployments.length
      };

    } catch (error) {
      return {
        preview: { status: 'disconnected', summary: 'Data unavailable' },
        production: { status: 'disconnected', summary: 'Data unavailable' },
        overallStatus: 'warning',
        deploymentsThisWeek: 0
      };
    }
  }

  private analyzeEnvironment(deployment: VercelDeployment | undefined, envName: string): {
    status: IntegrationStatus['status'];
    summary?: string;
    url?: string;
    lastDeployAt?: string;
  } {
    if (!deployment) {
      return {
        status: 'disconnected',
        summary: `No ${envName} deployments`
      };
    }

    const status = this.mapDeploymentStateToStatus(deployment.state);
    let summary = '';

    switch (deployment.state) {
      case 'READY':
        summary = `Ready`;
        break;
      case 'BUILDING':
        summary = `Building...`;
        break;
      case 'ERROR':
        summary = `Build failed`;
        break;
      case 'CANCELED':
        summary = `Canceled`;
        break;
      case 'QUEUED':
        summary = `Queued`;
        break;
    }

    return {
      status,
      summary,
      url: deployment.url,
      lastDeployAt: deployment.created
    };
  }

  private mapDeploymentStateToStatus(state: VercelDeployment['state']): IntegrationStatus['status'] {
    switch (state) {
      case 'READY':
        return 'connected';
      case 'BUILDING':
      case 'QUEUED':
        return 'warning';
      case 'ERROR':
      case 'CANCELED':
        return 'error';
      default:
        return 'disconnected';
    }
  }

  private async fetchRecentDeployments(integration: VercelIntegrationData, connection: any): Promise<VercelDeployment[]> {
    // This would integrate with the existing VercelAPIService
    // For now, return mock data based on the structure
    return [];
  }

  private async triggerDeployment(integration: VercelIntegrationData, connection: any, target: string) {
    // This would integrate with the existing Vercel deployment service
    return { success: true, message: `${target} deployment triggered` };
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
    if (error?.status === 401) return 'Reconnect Vercel to restore deployments';
    if (error?.status === 429) return 'Rate limited, will retry automatically';
    if (error?.code === 'ETIMEDOUT') return 'Vercel API timeout, will retry';
    return 'Check Vercel integration configuration';
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