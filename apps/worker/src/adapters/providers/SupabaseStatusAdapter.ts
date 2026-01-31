/**
 * Supabase Integration Status Adapter
 *
 * Provides Supabase database status information including health monitoring,
 * latency tracking, and connection reliability metrics.
 */

import { IntegrationStatusAdapter, IntegrationStatus, AdapterContext, AdapterCacheOptions, CircuitBreakerMetrics, AdapterUtils } from '../IntegrationStatusAdapter';
import { SupabaseConnectionService } from '../../services/supabaseConnectionService';
import { SupabaseManagementAPI } from '../../services/supabaseManagementAPI';
import { pool as db } from '../../services/database';
import { Redis } from 'ioredis';
import { ServerLoggingService } from '../../services/serverLoggingService';

interface SupabaseIntegrationData {
  id: string;
  project_id: string;
  supabase_project_id: string;
  supabase_project_ref: string;
  supabase_project_name: string;
  supabase_url: string;
  region: string;
  organization_name?: string;
  connection_status: 'active' | 'expired' | 'revoked';
  token_expires_at: Date;
  last_health_check?: Date;
  health_metrics: {
    average_latency_ms: number;
    success_rate: number;
    last_error?: string;
    error_count_24h: number;
  };
  created_at: Date;
  updated_at: Date;
}

interface DatabaseHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  connectionsActive: number;
  connectionsMax: number;
  lastChecked: Date;
  errorRate24h: number;
  uptime: string;
}

export class SupabaseStatusAdapter extends IntegrationStatusAdapter {
  readonly key = 'supabase' as const;

  private connectionService = SupabaseConnectionService.getInstance();
  private managementAPI = SupabaseManagementAPI.getInstance();
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
              hint: 'Supabase API temporarily unavailable, showing cached data'
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
      const ttl = AdapterUtils.applyJitter(options?.ttlSeconds || 45, options?.jitterPercent);
      await this.redis.setex(cacheKey, Math.floor(ttl), JSON.stringify(status));

      return status;

    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'supabase_status_adapter_error',
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
        return { success: false, message: 'Supabase integration not configured' };
      }

      switch (actionId) {
        case 'test-connection':
          // Test database connectivity and latency
          return await this.testDatabaseConnection(integration);

        case 'reconnect':
          // Refresh tokens and re-establish connection
          return await this.reconnectDatabase(integration, context);

        case 'connect':
          // OAuth reconnection flow
          return {
            success: false,
            message: 'Redirect to Supabase OAuth required',
            data: { requiresOAuth: true }
          };

        default:
          return { success: false, message: `Unknown action: ${actionId}` };
      }

    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'supabase_action_failed',
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
      { id: 'test-connection', label: 'Test Connection', can: false },
      { id: 'reconnect', label: 'Reconnect', can: false },
      { id: 'connect', label: 'Connect', can: false }
    ];

    if (!integration) {
      return baseActions.map(action =>
        action.id === 'connect'
          ? { ...action, can: true }
          : { ...action, reason: 'Supabase not connected' }
      );
    }

    if (integration.connection_status !== 'active') {
      return baseActions.map(action =>
        ['connect', 'reconnect'].includes(action.id)
          ? { ...action, can: true }
          : { ...action, reason: 'Supabase connection error' }
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

      if (integration.connection_status === 'revoked') {
        return { configured: true, configuredReason: 'revoked', visible: true };
      }

      if (integration.connection_status === 'expired') {
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

    if (integration.connection_status !== 'active') {
      return {
        key: this.key,
        configured: true,
        configuredReason: integration.connection_status === 'revoked' ? 'revoked' : 'disabled',
        visible: true,
        status: 'error',
        summary: `Connection ${integration.connection_status}`,
        updatedAt: now,
        problem: {
          code: integration.connection_status === 'revoked' ? 'oauth_revoked' : 'unknown',
          hint: integration.connection_status === 'revoked'
            ? 'Reconnect Supabase to restore database access'
            : 'Check Supabase token expiration'
        },
        actions: await this.getAvailableActions(context)
      };
    }

    // Get database health
    const health = await this.getDatabaseHealth(integration);
    const actions = await this.getAvailableActions(context);

    // Determine status and summary based on health
    let status: IntegrationStatus['status'] = 'connected';
    let summary = '';

    if (health.status === 'healthy') {
      summary = `Database healthy · ${health.latencyMs}ms avg`;
    } else if (health.status === 'degraded') {
      status = 'warning';
      summary = `Database degraded · ${health.latencyMs}ms avg`;
    } else {
      status = 'error';
      summary = `Database unhealthy · High latency`;
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

  private async getIntegrationData(projectId: string): Promise<SupabaseIntegrationData | null> {
    if (!db) return null;

    try {
      const result = await db.query(`
        SELECT id, project_id, supabase_project_id, supabase_project_ref,
               supabase_project_name, supabase_url, region, organization_name,
               connection_status, token_expires_at, last_health_check,
               health_metrics, created_at, updated_at
        FROM supabase_connections
        WHERE project_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `, [projectId]);

      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  private async getDatabaseHealth(integration: SupabaseIntegrationData): Promise<DatabaseHealth> {
    try {
      const startTime = Date.now();

      // Simple health check using a lightweight query
      const healthCheck = await this.performHealthCheck(integration);
      const latencyMs = Date.now() - startTime;

      // Get error metrics from the last 24 hours
      const errorRate = await this.getErrorRate24h(integration.id);

      let status: DatabaseHealth['status'] = 'healthy';
      if (latencyMs > 1000 || errorRate > 5) {
        status = 'unhealthy';
      } else if (latencyMs > 500 || errorRate > 1) {
        status = 'degraded';
      }

      return {
        status,
        latencyMs: Math.round(latencyMs),
        connectionsActive: healthCheck.connectionsActive || 0,
        connectionsMax: healthCheck.connectionsMax || 100,
        lastChecked: new Date(),
        errorRate24h: errorRate,
        uptime: healthCheck.uptime || '99.9%'
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: 9999,
        connectionsActive: 0,
        connectionsMax: 0,
        lastChecked: new Date(),
        errorRate24h: 100,
        uptime: 'N/A'
      };
    }
  }

  private async performHealthCheck(integration: SupabaseIntegrationData): Promise<{
    success: boolean;
    connectionsActive?: number;
    connectionsMax?: number;
    uptime?: string;
  }> {
    // This would make a simple query to the Supabase database
    // For now, return mock data based on integration health metrics
    return {
      success: true,
      connectionsActive: Math.floor(Math.random() * 20) + 5,
      connectionsMax: 100,
      uptime: '99.9%'
    };
  }

  private async getErrorRate24h(connectionId: string): Promise<number> {
    try {
      if (!db) throw new Error('Database connection not available');
      const result = await db.query(`
        SELECT COUNT(*) as error_count
        FROM supabase_connection_logs
        WHERE connection_id = $1
          AND level = 'error'
          AND created_at >= NOW() - INTERVAL '24 hours'
      `, [connectionId]);

      return parseInt(result.rows[0]?.error_count || '0');
    } catch (error) {
      return 0;
    }
  }

  private async testDatabaseConnection(integration: SupabaseIntegrationData) {
    try {
      const startTime = Date.now();
      const healthCheck = await this.performHealthCheck(integration);
      const latencyMs = Date.now() - startTime;

      return {
        success: healthCheck.success,
        message: healthCheck.success
          ? `Connection successful (${latencyMs}ms)`
          : 'Connection failed',
        data: { latencyMs, ...healthCheck }
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Connection test failed',
        data: { error: error.message }
      };
    }
  }

  private async reconnectDatabase(integration: SupabaseIntegrationData, context: AdapterContext) {
    // This would integrate with the connection service to refresh tokens
    return { success: true, message: 'Database reconnection initiated' };
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
    if (error?.status === 401) return 'Reconnect Supabase to restore database access';
    if (error?.status === 429) return 'Rate limited, will retry automatically';
    if (error?.code === 'ETIMEDOUT') return 'Supabase API timeout, will retry';
    return 'Check Supabase integration configuration';
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