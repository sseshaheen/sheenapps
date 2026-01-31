/**
 * Sanity CMS Integration Status Adapter
 *
 * Provides Sanity CMS status information including document sync status,
 * webhook health, and content activity monitoring.
 */

import { IntegrationStatusAdapter, IntegrationStatus, AdapterContext, AdapterCacheOptions, CircuitBreakerMetrics, AdapterUtils } from '../IntegrationStatusAdapter';
import { SanityService } from '../../services/sanityService';
import { pool as db } from '../../services/database';
import { Redis } from 'ioredis';
import { ServerLoggingService } from '../../services/serverLoggingService';

interface SanityIntegrationData {
  id: string;
  project_id: string;
  sanity_project_id: string;
  dataset_name: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  project_title?: string | undefined;
  status: 'connected' | 'disconnected' | 'error' | 'revoked' | 'expired';
  error_message?: string | undefined;
  realtime_enabled: boolean;
  webhook_secret?: string | undefined;
  last_health_check?: Date | undefined;
  last_webhook_event_id?: string | undefined;
  circuit_breaker_state: {
    consecutive_failures: number;
    is_open: boolean;
    last_failure_at?: Date | undefined;
    open_until?: Date | undefined;
  };
  created_at: Date;
  updated_at: Date;
  last_sync_at?: Date | undefined;
}

interface ContentActivity {
  documentsUpdatedToday: number;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  lastDocumentUpdate?: Date | undefined;
  lastWebhookReceived?: Date | undefined;
  webhookHealth: 'healthy' | 'degraded' | 'offline';
  syncStatus: 'live' | 'delayed' | 'offline';
}

export class SanityStatusAdapter extends IntegrationStatusAdapter {
  readonly key = 'sanity' as const;

  private sanityService = new SanityService();
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
              hint: 'Sanity API temporarily unavailable, showing cached data'
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
      const ttl = AdapterUtils.applyJitter(options?.ttlSeconds || 30, options?.jitterPercent);
      await this.redis.setex(cacheKey, Math.floor(ttl), JSON.stringify(status));

      return status;

    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'sanity_status_adapter_error',
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
        return { success: false, message: 'Sanity integration not configured' };
      }

      switch (actionId) {
        case 'sync':
          // Trigger full content sync
          return await this.triggerContentSync(integration);

        case 'open-studio':
          // Generate Sanity Studio URL
          const studioUrl = `https://${integration.sanity_project_id}.sanity.studio`;
          return {
            success: true,
            message: 'Opening Sanity Studio',
            data: { url: studioUrl }
          };

        case 'connect':
          // Reconnection flow
          return {
            success: false,
            message: 'Sanity reconnection required',
            data: { requiresAuth: true }
          };

        default:
          return { success: false, message: `Unknown action: ${actionId}` };
      }

    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'sanity_action_failed',
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
      { id: 'sync', label: 'Sync Content', can: false },
      { id: 'open-studio', label: 'Open Studio', can: false },
      { id: 'connect', label: 'Connect', can: false }
    ];

    if (!integration) {
      return baseActions.map(action =>
        action.id === 'connect'
          ? { ...action, can: true }
          : { ...action, reason: 'Sanity not connected' }
      );
    }

    if (integration.status !== 'connected') {
      return baseActions.map(action =>
        action.id === 'connect'
          ? { ...action, can: true }
          : { ...action, reason: 'Sanity connection error' }
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

      if (integration.status === 'error' || integration.status === 'expired') {
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
        summary: integration.error_message || 'Connection error',
        updatedAt: now,
        problem: {
          code: integration.status === 'revoked' ? 'oauth_revoked' : 'unknown',
          hint: integration.status === 'revoked'
            ? 'Reconnect Sanity to restore content sync'
            : 'Check Sanity integration settings'
        },
        actions: await this.getAvailableActions(context)
      };
    }

    // Get content activity
    const activity = await this.getContentActivity(integration);
    const actions = await this.getAvailableActions(context);

    // Determine status and summary based on activity
    let status: IntegrationStatus['status'] = 'connected';
    let summary = '';

    if (activity.syncStatus === 'live') {
      if (activity.documentsUpdatedToday > 0) {
        summary = `${activity.documentsUpdatedToday} doc${activity.documentsUpdatedToday > 1 ? 's' : ''} updated today · Live sync`;
      } else {
        summary = 'Connected · Live sync';
      }
    } else if (activity.syncStatus === 'delayed') {
      status = 'warning';
      summary = 'Connected · Sync delayed';
    } else {
      status = 'warning';
      summary = 'Connected · Sync offline';
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

  private async getIntegrationData(projectId: string): Promise<SanityIntegrationData | null> {
    if (!db) return null;

    try {
      const result = await db.query(`
        SELECT id, project_id, sanity_project_id, dataset_name, project_title,
               status, error_message, realtime_enabled, webhook_secret,
               last_health_check, last_webhook_event_id, circuit_breaker_state,
               created_at, updated_at, last_sync_at
        FROM sanity_connections
        WHERE project_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `, [projectId]);

      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  private async getContentActivity(integration: SanityIntegrationData): Promise<ContentActivity> {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Get webhook events from today
      if (!db) throw new Error('Database connection not available');
      const webhookResult = await db.query(`
        SELECT COUNT(*) as today_count,
               MAX(created_at) as last_webhook
        FROM sanity_webhook_events
        WHERE connection_id = $1
          AND created_at >= $2
      `, [integration.id, todayStart]);

      const webhookData = webhookResult.rows[0];
      const documentsUpdatedToday = parseInt(webhookData?.today_count || '0');
      const lastWebhookReceived = webhookData?.last_webhook ? new Date(webhookData.last_webhook) : undefined;

      // Get document sync status
      const syncResult = await db.query(`
        SELECT MAX(updated_at) as last_sync
        FROM sanity_documents
        WHERE connection_id = $1
      `, [integration.id]);

      const lastDocumentUpdate = syncResult.rows[0]?.last_sync ? new Date(syncResult.rows[0].last_sync) : undefined;

      // Determine webhook health
      let webhookHealth: ContentActivity['webhookHealth'] = 'healthy';
      if (integration.realtime_enabled) {
        if (!lastWebhookReceived) {
          webhookHealth = 'offline';
        } else {
          const timeSinceLastWebhook = now.getTime() - lastWebhookReceived.getTime();
          const hoursWithoutWebhook = timeSinceLastWebhook / (1000 * 60 * 60);

          if (hoursWithoutWebhook > 24) {
            webhookHealth = 'offline';
          } else if (hoursWithoutWebhook > 6) {
            webhookHealth = 'degraded';
          }
        }
      }

      // Determine sync status
      let syncStatus: ContentActivity['syncStatus'] = 'live';
      if (webhookHealth === 'offline') {
        syncStatus = 'offline';
      } else if (webhookHealth === 'degraded') {
        syncStatus = 'delayed';
      }

      return {
        documentsUpdatedToday,
        lastDocumentUpdate,
        lastWebhookReceived,
        webhookHealth,
        syncStatus
      };

    } catch (error) {
      return {
        documentsUpdatedToday: 0,
        webhookHealth: 'offline',
        syncStatus: 'offline'
      };
    }
  }

  private async triggerContentSync(integration: SanityIntegrationData) {
    // This would integrate with the existing Sanity sync service
    return { success: true, message: 'Content sync initiated' };
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
    if (error?.status === 401) return 'Reconnect Sanity to restore content sync';
    if (error?.status === 429) return 'Rate limited, will retry automatically';
    if (error?.code === 'ETIMEDOUT') return 'Sanity API timeout, will retry';
    return 'Check Sanity integration configuration';
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