/**
 * Integration Status Aggregation Service
 *
 * Orchestrates all integration status adapters to provide unified status information
 * with caching, circuit breakers, and real-time event broadcasting.
 */

import { IntegrationStatus, StatusEnvelope, AdapterContext, AdapterCacheOptions, CircuitBreakerMetrics } from '../adapters/IntegrationStatusAdapter';
import { GitHubStatusAdapter } from '../adapters/providers/GitHubStatusAdapter';
import { VercelStatusAdapter } from '../adapters/providers/VercelStatusAdapter';
import { SanityStatusAdapter } from '../adapters/providers/SanityStatusAdapter';
import { SupabaseStatusAdapter } from '../adapters/providers/SupabaseStatusAdapter';
import { EnhancedSSEService } from './enhancedSSEService';
import { Redis } from 'ioredis';
import { ServerLoggingService } from './serverLoggingService';
import { createHash } from 'crypto';

interface StatusRequestOptions {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  cacheOptions?: AdapterCacheOptions | undefined;
  forceRefresh?: boolean | undefined;
  includeMetrics?: boolean | undefined;
}

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
interface StatusMetrics {
  adapters: Record<string, {
    circuitBreaker: CircuitBreakerMetrics;
    cacheHit: boolean;
    latencyMs: number;
  }>;
  overallLatencyMs: number;
  cacheEfficiency: number;
}

export class IntegrationStatusService {
  private static instance: IntegrationStatusService;

  private adapters = {
    github: new GitHubStatusAdapter(),
    vercel: new VercelStatusAdapter(),
    sanity: new SanityStatusAdapter(),
    supabase: new SupabaseStatusAdapter()
  };

  private redis: Redis;
  private loggingService = ServerLoggingService.getInstance();
  private lastSequenceNumber = 0;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });
  }

  static getInstance(): IntegrationStatusService {
    if (!IntegrationStatusService.instance) {
      IntegrationStatusService.instance = new IntegrationStatusService();
    }
    return IntegrationStatusService.instance;
  }

  /**
   * Get aggregated status for all integrations with performance tracking
   */
  async getProjectIntegrationStatus(
    context: AdapterContext,
    options?: StatusRequestOptions
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  ): Promise<{ envelope: StatusEnvelope; metrics?: StatusMetrics | undefined }> {
    const startTime = Date.now();
    const metrics: StatusMetrics = {
      adapters: {},
      overallLatencyMs: 0,
      cacheEfficiency: 0
    };

    try {
      // Execute all adapters in parallel for optimal performance
      const adapterPromises = Object.entries(this.adapters).map(async ([key, adapter]) => {
        const adapterStartTime = Date.now();
        let cacheHit = false;

        try {
          // Check for force refresh
          if (options?.forceRefresh) {
            await adapter.forceRefresh(context);
          }

          const status = await adapter.getStatus(context, options?.cacheOptions);
          const latencyMs = Date.now() - adapterStartTime;

          // Track if this was served from cache
          cacheHit = status.stale === true;

          if (options?.includeMetrics) {
            metrics.adapters[key] = {
              circuitBreaker: adapter.getCircuitBreakerMetrics(),
              cacheHit,
              latencyMs
            };
          }

          return { key: adapter.key, status };

        } catch (error: any) {
          await this.loggingService.logCriticalError(
            'integration_status_adapter_failed',
            error,
            { projectId: context.projectId, adapter: key }
          );

          const latencyMs = Date.now() - adapterStartTime;

          if (options?.includeMetrics) {
            metrics.adapters[key] = {
              circuitBreaker: adapter.getCircuitBreakerMetrics(),
              cacheHit: false,
              latencyMs
            };
          }

          // Return disconnected status for failed adapters
          return {
            key: adapter.key,
            status: this.getFailedAdapterStatus(adapter.key, error)
          };
        }
      });

      const results = await Promise.all(adapterPromises);
      const items = results.map(result => result.status);

      // Compute overall status using worst-case aggregation
      const overallStatus = this.computeOverallStatus(items);

      // Generate stable hash for ETag support
      const { hash, renderHash } = this.generateHashes(items, context.projectId);

      const envelope: StatusEnvelope = {
        projectId: context.projectId,
        items,
        hash,
        renderHash,
        overall: overallStatus
      };

      // Complete metrics calculation
      const overallLatencyMs = Date.now() - startTime;
      if (options?.includeMetrics) {
        metrics.overallLatencyMs = overallLatencyMs;
        metrics.cacheEfficiency = this.calculateCacheEfficiency(metrics.adapters);
      }

      // Log performance metrics
      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Integration status aggregated',
        {
          projectId: context.projectId,
          userId: context.userId,
          latencyMs: overallLatencyMs,
          overallStatus,
          cacheEfficiency: metrics.cacheEfficiency,
          adapterCount: Object.keys(this.adapters).length
        }
      );

      return { envelope, metrics: options?.includeMetrics ? metrics : undefined };

    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'integration_status_service_failed',
        error,
        { projectId: context.projectId, userId: context.userId }
      );

      // Return degraded status envelope
      const fallbackItems = Object.keys(this.adapters).map(key =>
        this.getFailedAdapterStatus(key as any, error)
      );

      const envelope: StatusEnvelope = {
        projectId: context.projectId,
        items: fallbackItems,
        hash: this.generateFallbackHash(context.projectId),
        renderHash: this.generateFallbackHash(context.projectId, new Date().toISOString()),
        overall: 'error'
      };

      return { envelope };
    }
  }

  /**
   * Execute an action on a specific integration adapter
   */
  async executeIntegrationAction(
    context: AdapterContext,
    integrationKey: IntegrationStatus['key'],
    actionId: string,
    idempotencyKey: string,
    parameters?: Record<string, any>
  ): Promise<{ success: boolean; message?: string; data?: any; retryAfter?: number }> {

    const adapter = this.adapters[integrationKey];
    if (!adapter) {
      return { success: false, message: `Unknown integration: ${integrationKey}` };
    }

    try {
      const result = await adapter.executeAction(context, actionId, idempotencyKey, parameters);

      // Log the action
      await this.loggingService.logServerEvent(
        'capacity',
        result.success ? 'info' : 'warn',
        `Integration action ${result.success ? 'completed' : 'failed'}`,
        {
          projectId: context.projectId,
          userId: context.userId,
          integrationKey,
          actionId,
          idempotencyKey,
          success: result.success,
          message: result.message
        }
      );

      // Invalidate cache after action
      if (result.success) {
        await adapter.forceRefresh(context);
        await this.broadcastStatusUpdate(context, integrationKey);
      }

      return result;

    } catch (error: any) {
      await this.loggingService.logCriticalError(
        'integration_action_failed',
        error,
        { projectId: context.projectId, integrationKey, actionId, idempotencyKey }
      );

      return { success: false, message: 'Action execution failed' };
    }
  }

  /**
   * Get available actions for a specific integration
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  async getIntegrationActions(
    context: AdapterContext,
    integrationKey: IntegrationStatus['key']
  ): Promise<Array<{ id: string; label: string; can: boolean; reason?: string | undefined }>> {

    const adapter = this.adapters[integrationKey];
    if (!adapter) {
      return [];
    }

    try {
      return await adapter.getAvailableActions(context);
    } catch (error) {
      return [];
    }
  }

  /**
   * Force refresh all integration statuses
   */
  async forceRefreshAll(context: AdapterContext): Promise<void> {
    const refreshPromises = Object.values(this.adapters).map(adapter =>
      adapter.forceRefresh(context).catch(() => {
        // Ignore individual failures during bulk refresh
      })
    );

    await Promise.all(refreshPromises);

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'All integration statuses force refreshed',
      { projectId: context.projectId, userId: context.userId }
    );
  }

  /**
   * Broadcast status update via SSE
   */
  async broadcastStatusUpdate(
    context: AdapterContext,
    integrationKey?: IntegrationStatus['key']
  ): Promise<void> {
    try {
      // Get updated status
      const { envelope } = await this.getProjectIntegrationStatus(context);

      // Broadcast to SSE connections (this would integrate with the existing SSE service)
      await this.broadcastToSSE(context.projectId, envelope, integrationKey);

    } catch (error) {
      await this.loggingService.logCriticalError(
        'status_broadcast_failed',
        error as Error,
        { projectId: context.projectId, integrationKey }
      );
    }
  }

  /**
   * Get circuit breaker metrics for monitoring
   */
  getCircuitBreakerMetrics(): Record<string, CircuitBreakerMetrics> {
    return Object.fromEntries(
      Object.entries(this.adapters).map(([key, adapter]) => [
        key,
        adapter.getCircuitBreakerMetrics()
      ])
    );
  }

  // Private helper methods

  private computeOverallStatus(items: IntegrationStatus[]): IntegrationStatus['status'] {
    // Status priority: error > warning > connected > disconnected
    const statusPriority = { 'error': 4, 'warning': 3, 'connected': 2, 'disconnected': 1 };

    // Only consider configured integrations for overall status
    const configuredItems = items.filter(item => item.configured);

    if (configuredItems.length === 0) {
      return 'disconnected';
    }

    const highestPriority = Math.max(
      ...configuredItems.map(item => statusPriority[item.status] || 1)
    );

    const statusMap = { 4: 'error', 3: 'warning', 2: 'connected', 1: 'disconnected' } as const;
    return statusMap[highestPriority as keyof typeof statusMap] || 'disconnected';
  }

  private generateHashes(items: IntegrationStatus[], projectId: string): { hash: string; renderHash: string } {
    // Stable hash: strip transient fields (updatedAt, stale) and sort
    const stableData = items
      .map(({ updatedAt, stale, ...stable }) => stable)
      .sort((a, b) => a.key.localeCompare(b.key));

    const hash = createHash('sha256')
      .update(JSON.stringify({ projectId, items: stableData }))
      .digest('hex')
      .substring(0, 8);

    // Render hash: includes updatedAt for UI invalidation
    const renderHash = createHash('sha256')
      .update(JSON.stringify({ projectId, items, timestamp: Date.now() }))
      .digest('hex')
      .substring(0, 8);

    return { hash, renderHash };
  }

  private generateFallbackHash(projectId: string, timestamp?: string): string {
    return createHash('sha256')
      .update(JSON.stringify({ projectId, fallback: true, timestamp: timestamp || Date.now() }))
      .digest('hex')
      .substring(0, 8);
  }

  private getFailedAdapterStatus(key: IntegrationStatus['key'], error: any): IntegrationStatus {
    return {
      key,
      configured: false,
      configuredReason: 'not_linked',
      visible: true,
      status: 'disconnected',
      summary: 'Service unavailable',
      updatedAt: new Date().toISOString(),
      stale: true,
      problem: {
        code: 'unknown',
        hint: 'Integration service temporarily unavailable'
      }
    };
  }

  private calculateCacheEfficiency(adapters: StatusMetrics['adapters']): number {
    const adapterEntries = Object.values(adapters);
    if (adapterEntries.length === 0) return 0;

    const cacheHits = adapterEntries.filter(adapter => adapter.cacheHit).length;
    return Math.round((cacheHits / adapterEntries.length) * 100);
  }

  private async broadcastToSSE(
    projectId: string,
    envelope: StatusEnvelope,
    changedIntegration?: IntegrationStatus['key']
  ): Promise<void> {
    // This would integrate with the existing SSE infrastructure
    // For now, just log the event
    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Integration status SSE broadcast',
      {
        projectId,
        changedIntegration,
        overallStatus: envelope.overall,
        hash: envelope.hash
      }
    );
  }
}