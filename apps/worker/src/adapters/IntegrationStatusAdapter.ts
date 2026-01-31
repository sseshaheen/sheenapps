/**
 * Base Integration Status Adapter Interface
 *
 * Defines the contract for all integration status providers (GitHub, Vercel, Sanity, Supabase).
 * Each adapter implements provider-specific status checking with caching and circuit breaker support.
 */

export interface IntegrationStatus {
  key: 'sanity' | 'github' | 'vercel' | 'supabase';
  configured: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  configuredReason?: 'not_linked' | 'revoked' | 'disabled' | 'hidden_by_policy' | undefined;
  visible: boolean;      // after permission filtering
  status: 'connected' | 'warning' | 'error' | 'disconnected';
  summary?: string | undefined;
  updatedAt: string;     // ISO timestamp
  stale?: boolean | undefined;       // served from cache/circuit
  problem?: {
    code: 'oauth_revoked' | 'rate_limited' | 'timeout' | 'unknown';
    hint?: string | undefined;
    retryAfter?: number | undefined; // seconds for rate limits
  } | undefined;
  actions?: Array<{ id: string; label: string; can: boolean; reason?: string | undefined }> | undefined;
  environments?: Array<{
    name: 'preview' | 'production' | string;
    status: IntegrationStatus['status'];
    summary?: string | undefined;
    url?: string | undefined;
    lastDeployAt?: string | undefined;
  }> | undefined;
}

export interface StatusEnvelope {
  projectId: string;
  items: IntegrationStatus[];
  hash: string;          // stable hash (sorted, transients stripped)
  renderHash: string;    // includes updatedAt for UI invalidation
  overall: IntegrationStatus['status']; // computed server-side per rules
}

export interface AdapterContext {
  projectId: string;
  userId: string;
  userRole: 'owner' | 'admin' | 'editor' | 'viewer';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  locale?: string | undefined;
}

export interface AdapterCacheOptions {
  ttlSeconds?: number;
  jitterPercent?: number;
  circuitBreakerEnabled?: boolean;
  staleDataFallback?: boolean;
}

/**
 * Circuit breaker states for adapter resilience
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerMetrics {
  failureCount: number;
  successCount: number;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  lastFailureTime?: Date | undefined;
  lastSuccessTime?: Date | undefined;
  state: CircuitBreakerState;
}

/**
 * Base adapter interface that all integration status providers must implement
 */
export abstract class IntegrationStatusAdapter {
  abstract readonly key: IntegrationStatus['key'];

  /**
   * Get integration status for a project with caching and circuit breaker support
   */
  abstract getStatus(
    context: AdapterContext,
    options?: AdapterCacheOptions
  ): Promise<IntegrationStatus>;

  /**
   * Execute an action (e.g., deploy, push, sync, connect)
   * Returns action result with idempotency support
   */
  abstract executeAction(
    context: AdapterContext,
    actionId: string,
    idempotencyKey: string,
    parameters?: Record<string, any>
  ): Promise<{
    success: boolean;
    message?: string;
    data?: any;
    retryAfter?: number; // for rate limiting
  }>;

  /**
   * Get available actions for current user and project state
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  abstract getAvailableActions(
    context: AdapterContext
  ): Promise<Array<{ id: string; label: string; can: boolean; reason?: string | undefined }>>;

  /**
   * Validate if the integration is properly configured for this project
   */
  abstract validateConfiguration(context: AdapterContext): Promise<{
    configured: boolean;
    configuredReason?: IntegrationStatus['configuredReason'];
    visible: boolean;
  }>;

  /**
   * Get circuit breaker metrics for monitoring
   */
  abstract getCircuitBreakerMetrics(): CircuitBreakerMetrics;

  /**
   * Force refresh cached data (bypasses cache)
   */
  abstract forceRefresh(context: AdapterContext): Promise<void>;
}

/**
 * Utility functions for adapter implementations
 */
export class AdapterUtils {
  /**
   * Generate cache key for adapter status
   */
  static getCacheKey(adapterKey: string, projectId: string, userId: string): string {
    return `integration_status:${adapterKey}:${projectId}:${userId}`;
  }

  /**
   * Apply jitter to TTL to prevent thundering herd
   */
  static applyJitter(ttlSeconds: number, jitterPercent: number = 20): number {
    const jitter = ttlSeconds * (jitterPercent / 100);
    return ttlSeconds + (Math.random() * jitter * 2 - jitter);
  }

  /**
   * Determine if status should be marked as stale
   */
  static isStale(updatedAt: string, maxAgeSeconds: number = 90): boolean {
    const age = (Date.now() - new Date(updatedAt).getTime()) / 1000;
    return age > maxAgeSeconds;
  }

  /**
   * Filter actions based on user permissions
   */
  static filterActionsByRole(
    actions: Array<{ id: string; label: string; can: boolean; reason?: string | undefined }>,
    userRole: AdapterContext['userRole']
  ): Array<{ id: string; label: string; can: boolean; reason?: string | undefined }> {
    const rolePermissions: Record<string, string[]> = {
      owner: ['connect', 'disconnect', 'deploy', 'push', 'configure', 'sync', 'content_sync', 'preview_deploy'],
      admin: ['connect', 'disconnect', 'deploy', 'push', 'configure', 'sync', 'content_sync', 'preview_deploy'],
      editor: ['push', 'content_sync', 'preview_deploy', 'sync'],
      viewer: []
    };

    const allowedActions: string[] = rolePermissions[userRole] || [];

    return actions.map(action => ({
      ...action,
      can: action.can && allowedActions.includes(action.id),
      reason: action.can && !allowedActions.includes(action.id)
        ? `Requires ${userRole === 'viewer' ? 'editor' : 'admin'} permissions`
        : action.reason
    }));
  }

  /**
   * Redact sensitive information based on user permissions
   */
  static redactSensitiveData(
    status: IntegrationStatus,
    userRole: AdapterContext['userRole']
  ): IntegrationStatus {
    if (userRole === 'viewer') {
      return {
        ...status,
        summary: status.summary?.includes('Private') ? 'Private repository' : status.summary,
        environments: status.environments?.map(env => ({
          ...env,
          url: env.url?.includes('private') ? undefined : env.url
        }))
      };
    }

    return status;
  }
}