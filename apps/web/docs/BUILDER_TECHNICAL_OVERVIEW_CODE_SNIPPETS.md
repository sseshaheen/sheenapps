here is src/services/worker-api-client.ts:
/**
 * Worker API Client v2.1
 * Handles communication with Worker service endpoints
 * Features: HMAC authentication, rate limiting, error handling, exponential backoff
 */

import {
  WorkerAPIError,
  InsufficientBalanceError,
  PayloadTooLargeError,
  RateLimitError,
  type WorkerRequestOptions
} from '@/types/worker-api';
import {
  generateWorkerSignature,
  parseRateLimitHeaders,
  validateWorkerAuthEnvironment
} from '@/utils/worker-auth';
import { logger } from '@/utils/logger';
import { getBillingPath } from '@/utils/navigation';

export class WorkerAPIClient {
  private readonly baseUrl: string;
  private static instance: WorkerAPIClient;

  constructor() {
    // Use client-accessible env vars when available (NEXT_PUBLIC_), fallback to server-side vars
    this.baseUrl = process.env.NEXT_PUBLIC_WORKER_BASE_URL || process.env.WORKER_BASE_URL || 'https://worker.sheenapps.com';
  }

  /**
   * Validate environment variables at runtime
   */
  private validateEnvironment(): void {
    const validation = validateWorkerAuthEnvironment();
    if (!validation.valid) {
      logger.error('❌ Worker API environment validation failed:', validation.errors);
      throw new Error(`Worker API configuration invalid: ${validation.errors.join(', ')}`);
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): WorkerAPIClient {
    if (!WorkerAPIClient.instance) {
      WorkerAPIClient.instance = new WorkerAPIClient();
    }
    return WorkerAPIClient.instance;
  }

  /**
   * Make authenticated request to Worker API
   * @param pathWithQuery Full path including query parameters
   * @param options Request options (method, body, headers, etc.)
   */
  async request<T>(pathWithQuery: string, options: WorkerRequestOptions = {}): Promise<T> {
    // Validate environment on first use
    this.validateEnvironment();

    const body = options.body || '';
    const signature = generateWorkerSignature(body.toString(), pathWithQuery);
    const retryAttempt = options.__retryAttempt || 0;

    const response = await fetch(`${this.baseUrl}${pathWithQuery}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-sheen-signature': signature,
        ...options.headers,
      },
    });

    // Handle rate limiting with exponential backoff
    if (response.status === 429) {
      const rateLimitInfo = parseRateLimitHeaders(response.headers);
      const retryAfter = rateLimitInfo.retryAfter ||
                        rateLimitInfo.resetAt ?
                          Math.ceil((rateLimitInfo.resetAt.getTime() - Date.now()) / 1000) :
                          60; // Default 60 seconds

      // Exponential backoff with jitter
      await this.exponentialBackoff(retryAfter, retryAttempt);

      // Retry with incremented attempt counter
      return this.request(pathWithQuery, {
        ...options,
        __retryAttempt: retryAttempt + 1
      });
    }

    // Handle non-success responses
    if (!response.ok) {
      await this.handleError(response, pathWithQuery);
    }

    // Parse and return response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }

    // For non-JSON responses (like binary downloads)
    return response as unknown as T;
  }

  /**
   * Exponential backoff with jitter for rate limiting
   * @param baseSeconds Base delay in seconds
   * @param attempt Current attempt number (0-based)
   */
  private async exponentialBackoff(baseSeconds: number, attempt: number = 0): Promise<void> {
    const maxDelay = 300000; // 5 minutes maximum
    const jitter = Math.random() * 0.1; // 10% jitter

    const delay = Math.min(
      Math.pow(2, attempt) * baseSeconds * 1000 * (1 + jitter),
      maxDelay
    );

    logger.info(`⏳ Rate limited. Retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`);

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Handle API errors with specific error types
   */
  private async handleError(response: Response, pathWithQuery: string): Promise<never> {
    const status = response.status;

    try {
      // Try to parse error response
      const errorData = await response.json();

      switch (status) {
        case 402: // Payment Required
          throw new InsufficientBalanceError(errorData);

        case 413: // Payload Too Large
          throw new PayloadTooLargeError(
            errorData.message || 'Project too large for processing (>2GB)'
          );

        case 429: // Rate Limited (shouldn't reach here due to retry logic)
          const rateLimitInfo = parseRateLimitHeaders(response.headers);
          throw new RateLimitError(
            rateLimitInfo.retryAfter || 60,
            errorData.message || 'Rate limit exceeded'
          );

        default:
          throw new WorkerAPIError(
            status,
            errorData.code,
            errorData.message || `HTTP ${status}`,
            errorData
          );
      }
    } catch (parseError) {
      // Handle cases where response body is empty or invalid JSON
      // This often happens with CDN-stripped 402 responses
      if (status === 402) {
        throw new InsufficientBalanceError({
          sufficient: false,
          estimate: null,
          balance: { welcomeBonus: 0, dailyGift: 0, paid: 0, total: 0 },
          recommendation: {
            suggestedPackage: 'You can add more AI time credits from the billing page to continue building your project.',
            costToComplete: 0,
            purchaseUrl: getBillingPath() // Server-safe: returns relative path, client resolves locale
          }
        });
      }

      // For other errors, throw generic WorkerAPIError
      throw new WorkerAPIError(
        status,
        undefined,
        `HTTP ${status}`,
        { path: pathWithQuery, parseError: parseError instanceof Error ? parseError.message : 'Unknown' }
      );
    }
  }

  /**
   * GET request helper
   */
  async get<T>(pathWithQuery: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(pathWithQuery, {
      method: 'GET',
      headers
    });
  }

  /**
   * Generate correlation ID for request tracking
   */
  private generateCorrelationId(): string {
    return `nextjs_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }

  /**
   * POST request helper with automatic correlation ID
   */
  async post<T>(pathWithQuery: string, data?: any, headers?: Record<string, string>): Promise<T> {
    // Generate correlation ID for worker team debugging
    const correlationId = this.generateCorrelationId();

    // Enhanced logging for worker team correlation tracking
    logger.info(`[NextJS] Creating project (correlation: ${correlationId}):`, {
      correlationId,
      userId: data?.userId,
      timestamp: new Date().toISOString(),
      endpoint: pathWithQuery,
      hasProjectId: !!data?.projectId,
      projectId: data?.projectId || 'SERVER_GENERATED'
    });

    // Log request payload for worker team debugging
    logger.info(`[NextJS] Request payload (correlation: ${correlationId}):`, {
      correlationId,
      hasProjectId: !!data?.projectId,
      projectId: data?.projectId || 'SERVER_GENERATED',
      metadata: data?.metadata,
      promptLength: data?.prompt?.length || 0,
      hasTemplateFiles: !!(data?.templateFiles && Object.keys(data.templateFiles).length > 0)
    });

    // Add correlation ID to headers
    const enhancedHeaders = {
      ...headers,
      'x-correlation-id': correlationId
    };

    try {
      const result = await this.request<T>(pathWithQuery, {
        method: 'POST',
        body: data ? JSON.stringify(data) : '',
        headers: enhancedHeaders
      });

      // Log successful response for worker team correlation tracking
      logger.info(`[NextJS] Project creation response (correlation: ${correlationId}):`, {
        correlationId,
        success: !!(result as any)?.success,
        projectId: (result as any)?.projectId,
        buildId: (result as any)?.buildId,
        status: (result as any)?.status
      });

      return result;
    } catch (error) {
      // Log error response for worker team correlation tracking
      logger.error(`[NextJS] Project creation error (correlation: ${correlationId}):`, {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      });

      throw error;
    }
  }

  /**
   * POST request helper without correlation tracking (for non-project endpoints)
   */
  async postWithoutCorrelation<T>(pathWithQuery: string, data?: any, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(pathWithQuery, {
      method: 'POST',
      body: data ? JSON.stringify(data) : '',
      headers
    });
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.get('/health');
  }

  /**
   * Get current rate limit status
   */
  async getRateLimitStatus(): Promise<{
    limit?: number;
    remaining?: number;
    resetAt?: Date;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/rate-limit-status`, {
        method: 'HEAD', // Use HEAD to avoid response body
        headers: {
          'x-sheen-signature': generateWorkerSignature('', '/v1/rate-limit-status')
        }
      });

      return parseRateLimitHeaders(response.headers);
    } catch (error) {
      logger.warn('Failed to get rate limit status:', error);
      return {};
    }
  }
}

// Export singleton instance
export const workerClient = WorkerAPIClient.getInstance();




here is src/store/build-state-store.ts:
/**
 * Global Build State Store
 *
 * Manages current buildId state globally to prevent multiple useCleanBuildEvents
 * instances from polling different buildIds simultaneously (zombie polling issue).
 *
 * Ensures atomic buildId transitions across all components.
 */

'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { logger } from '@/utils/logger'

interface BuildState {
  // Current active buildId for the project
  currentBuildId: string | null
  // Previous buildId (for debugging)
  previousBuildId: string | null
  // Project this buildId belongs to
  currentProjectId: string | null
  // When the buildId was last updated
  lastUpdated: number
}

interface BuildStateActions {
  // Set the current buildId (triggers cleanup of old polling)
  setCurrentBuildId: (buildId: string | null, projectId?: string, source?: string) => void
  // Get the current buildId
  getCurrentBuildId: () => string | null
  // Check if a specific buildId is the current active one
  isBuildIdCurrent: (buildId: string | null) => boolean
  // Clear all build state
  clearBuildState: () => void
  // Debug: Get current state
  getDebugState: () => BuildState
}

type BuildStateStore = BuildState & BuildStateActions

const initialState: BuildState = {
  currentBuildId: null,
  previousBuildId: null,
  currentProjectId: null,
  lastUpdated: 0
}

export const useBuildStateStore = create<BuildStateStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setCurrentBuildId: (buildId: string | null, projectId?: string, source = 'unknown') => {
        const state = get()
        const now = Date.now()

        // 🆕 ENHANCED: Track who is calling this function
        const caller = source || 'unknown'

        // Skip if same buildId (avoid unnecessary updates) - 🆕 Enhanced logging
        if (state.currentBuildId === buildId) {
          logger.debug('build-state', `✅ BuildId unchanged: ${buildId?.slice(0, 8) || 'null'} - no update needed (caller: ${caller})`)
          return
        }

        const previousBuildId = state.currentBuildId

        logger.warn('build-state', `🔄 GLOBAL BUILD STATE UPDATE from ${caller}: ${previousBuildId?.slice(0, 8) || 'null'} → ${buildId?.slice(0, 8) || 'null'}`)

        // Log debugging info for buildId transitions
        if (previousBuildId && buildId && previousBuildId !== buildId) {
          logger.info('build-state', `🔄 Build ID transition from ${caller}: ${previousBuildId.slice(0, 8)} → ${buildId.slice(0, 8)}`)

          // 🆕 STACK TRACE: In development, show who called this
          if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
            console.trace(`🔥 BuildId State Change Source: ${caller}`)
          }
        } else if (!previousBuildId && buildId) {
          logger.info('build-state', `🆕 INITIAL from ${caller}: Setting first buildId to ${buildId.slice(0, 8)}`)
        } else if (previousBuildId && !buildId) {
          logger.warn('build-state', `🗑️ CLEARING from ${caller}: Removing buildId ${previousBuildId.slice(0, 8)}`)
        }

        // 🆕 ATOMIC UPDATE: All changes happen together
        set({
          currentBuildId: buildId,
          previousBuildId: previousBuildId,
          currentProjectId: projectId || state.currentProjectId,
          lastUpdated: now
        })

        logger.debug('build-state', `✅ Global build state updated by ${caller}`)

        // Broadcast change to all listeners immediately
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          console.log('🌐 Global BuildId State Change:', {
            from: previousBuildId?.slice(0, 8) || 'null',
            to: buildId?.slice(0, 8) || 'null',
            source: caller,
            projectId: (projectId || state.currentProjectId)?.slice(0, 8) || 'null',
            timestamp: new Date().toISOString()
          })
        }

        // Trigger build query manager cleanup if the buildId changed
        if (previousBuildId !== buildId) {
          // Import here to avoid circular dependencies
          import('@/utils/build-query-manager').then(({ buildQueryManager }) => {
            // Note: We let individual useCleanBuildEvents hooks handle their own cleanup
            // based on the global state change, rather than doing it here
            logger.debug('build-state', `Build query manager available for cleanup coordination`)
          })
        }
      },

      getCurrentBuildId: () => {
        const state = get()
        return state.currentBuildId
      },

      isBuildIdCurrent: (buildId: string | null) => {
        const state = get()
        return state.currentBuildId === buildId
      },

      clearBuildState: () => {
        logger.info('build-state', '🧹 Clearing global build state')
        set(initialState)
      },

      getDebugState: () => {
        const { setCurrentBuildId, getCurrentBuildId, isBuildIdCurrent, clearBuildState, getDebugState, ...state } = get()
        return state
      }
    }),
    {
      name: 'build-state-store',
      enabled: process.env.NODE_ENV === 'development'
    }
  )
)

/**
 * Hook to get current buildId from global store
 * Use this instead of passing buildId through props when possible
 */
export function useCurrentBuildId() {
  return useBuildStateStore(state => state.currentBuildId)
}

// 🆕 CACHED SELECTORS to prevent infinite re-renders
const buildIdActionsSelector = (state: BuildStateStore) => ({
  setCurrentBuildId: state.setCurrentBuildId,
  isBuildIdCurrent: state.isBuildIdCurrent,
  clearBuildState: state.clearBuildState
})

/**
 * Hook to get buildId setter for updating global state
 * 🆕 Uses cached selector to prevent infinite re-renders
 */
export function useBuildIdActions() {
  return useBuildStateStore(buildIdActionsSelector)
}

/**
 * Hook to get individual action functions (more selective)
 */
export function useSetCurrentBuildId() {
  return useBuildStateStore(state => state.setCurrentBuildId)
}

export function useIsBuildIdCurrent() {
  return useBuildStateStore(state => state.isBuildIdCurrent)
}

/**
 * Hook for debugging build state issues
 * 🆕 Returns individual values to prevent object recreation
 */
export function useBuildStateDebug() {
  const currentBuildId = useBuildStateStore(state => state.currentBuildId)
  const previousBuildId = useBuildStateStore(state => state.previousBuildId)
  const currentProjectId = useBuildStateStore(state => state.currentProjectId)
  const lastUpdated = useBuildStateStore(state => state.lastUpdated)
  const isBuildIdCurrent = useBuildStateStore(state => state.isBuildIdCurrent)
  const getDebugState = useBuildStateStore(state => state.getDebugState)

  return {
    currentBuildId: currentBuildId?.slice(0, 8) || 'null',
    previousBuildId: previousBuildId?.slice(0, 8) || 'null',
    currentProjectId: currentProjectId?.slice(0, 8) || 'null',
    lastUpdated: new Date(lastUpdated).toISOString(),
    isBuildIdCurrent,
    getDebugState
  }
}


Here is /src/hooks/use-clean-build-events.ts:
/**
 * Clean Build Events Hook
 * Uses the new clean events API for accurate progress tracking and reliable completion detection
 * Eliminates complex string parsing and provides structured data
 *
 * 🆕 SINGLETON PATTERN: Ensures only ONE polling instance per buildId+userId combination
 * Multiple components can use the same hook but share data to prevent resource waste
 */

'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CleanBuildEvent, CleanBuildApiResponse, CleanBuildEventsReturn } from '@/types/build-events'
import { logger } from '@/utils/logger'
import { buildQueryManager } from '@/utils/build-query-manager'
import { useCurrentBuildId, useSetCurrentBuildId, useIsBuildIdCurrent } from '@/store/build-state-store'

// 🆕 SINGLETON PATTERN: Hook Registry and Shared State Management
type HookInstanceId = string
type BuildEventsKey = `${string}-${string}` // buildId-userId

interface HookInstance {
  id: HookInstanceId
  isPrimary: boolean
  updateCallback: (data: CleanBuildEventsReturn) => void
  unmounted: boolean
}

/**
 * Shared store for build events data - broadcasts from primary to secondary instances
 */
class SharedBuildEventsStore {
  private data = new Map<BuildEventsKey, CleanBuildEventsReturn>()
  private subscribers = new Map<BuildEventsKey, Set<(data: CleanBuildEventsReturn) => void>>()
  private completionStatus = new Map<BuildEventsKey, boolean>() // Track completion status

  subscribe(key: BuildEventsKey, callback: (data: CleanBuildEventsReturn) => void): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set())
    }
    this.subscribers.get(key)!.add(callback)

    // Immediately call with existing data if available
    const existingData = this.data.get(key)
    if (existingData) {
      callback(existingData)
    }

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(key)
      if (subs) {
        subs.delete(callback)
        if (subs.size === 0) {
          this.subscribers.delete(key)
        }
      }
    }
  }

  publish(key: BuildEventsKey, data: CleanBuildEventsReturn) {
    this.data.set(key, data)

    // 🆕 COORDINATION: Track completion status
    if (data.isComplete) {
      this.completionStatus.set(key, true)
      logger.debug('shared-store', `✅ Marked ${key} as completed in shared store`)
    }

    const subscribers = this.subscribers.get(key)
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          logger.error('shared-store', 'Error in subscriber callback:', error)
        }
      })
    }
  }

  getData(key: BuildEventsKey): CleanBuildEventsReturn | undefined {
    return this.data.get(key)
  }

  // 🆕 COORDINATION: Check if build is marked as completed
  isCompleted(key: BuildEventsKey): boolean {
    return this.completionStatus.get(key) || false
  }

  clear(key: BuildEventsKey) {
    this.data.delete(key)
    this.subscribers.delete(key)
    this.completionStatus.delete(key) // 🆕 Clear completion status
  }
}

/**
 * Global registry to manage hook instances and ensure singleton polling
 */
class HookInstanceRegistry {
  private instances = new Map<BuildEventsKey, HookInstance[]>()
  private instanceCounter = 0

  register(buildId: string, userId: string, updateCallback: (data: CleanBuildEventsReturn) => void): {
    instanceId: HookInstanceId
    isPrimary: boolean
    key: BuildEventsKey
  } {
    const key: BuildEventsKey = `${buildId}-${userId}`
    const instanceId = `hook-${++this.instanceCounter}`

    if (!this.instances.has(key)) {
      this.instances.set(key, [])
    }

    const instances = this.instances.get(key)!
    const isPrimary = instances.length === 0 // First instance becomes primary

    const hookInstance: HookInstance = {
      id: instanceId,
      isPrimary,
      updateCallback,
      unmounted: false
    }

    instances.push(hookInstance)

    logger.info('hook-registry', `🎯 Hook registered: ${instanceId} for ${key} (${isPrimary ? 'PRIMARY' : 'SECONDARY'}) - Total instances: ${instances.length}`)

    return { instanceId, isPrimary, key }
  }

  unregister(instanceId: HookInstanceId, key: BuildEventsKey): { needsOwnershipTransfer: boolean } {
    const instances = this.instances.get(key)
    if (!instances) return { needsOwnershipTransfer: false }

    const instanceIndex = instances.findIndex(inst => inst.id === instanceId)
    if (instanceIndex === -1) return { needsOwnershipTransfer: false }

    const wasInstance = instances[instanceIndex]
    const wasPrimary = wasInstance.isPrimary

    // Remove the instance
    instances.splice(instanceIndex, 1)

    logger.info('hook-registry', `🗑️ Hook unregistered: ${instanceId} for ${key} (was ${wasPrimary ? 'PRIMARY' : 'SECONDARY'}) - Remaining instances: ${instances.length}`)

    // Clean up if no instances left
    if (instances.length === 0) {
      this.instances.delete(key)
      sharedStore.clear(key)
      logger.info('hook-registry', `🧹 All instances removed for ${key} - cleaned up shared data`)
      return { needsOwnershipTransfer: false }
    }

    // Transfer primary ownership if the primary instance was removed
    if (wasPrimary && instances.length > 0) {
      const nextPrimary = instances[0]
      nextPrimary.isPrimary = true
      logger.warn('hook-registry', `👑 PRIMARY OWNERSHIP TRANSFERRED: ${nextPrimary.id} is now primary for ${key}`)
      return { needsOwnershipTransfer: true }
    }

    return { needsOwnershipTransfer: false }
  }

  getInstanceCount(buildId: string, userId: string): number {
    const key: BuildEventsKey = `${buildId}-${userId}`
    return this.instances.get(key)?.length || 0
  }

  getAllInstances(): Array<{ key: BuildEventsKey, instances: HookInstance[] }> {
    return Array.from(this.instances.entries()).map(([key, instances]) => ({
      key,
      instances: instances.filter(inst => !inst.unmounted)
    }))
  }
}

// Global singleton instances
const hookRegistry = new HookInstanceRegistry()
const sharedStore = new SharedBuildEventsStore()

interface UseCleanBuildEventsOptions {
  /** Enable automatic polling when build is active */
  autoPolling?: boolean
  /** Initial polling interval in milliseconds */
  initialInterval?: number
  /** Project build status - stops polling if 'deployed' */
  projectBuildStatus?: 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed'
}

/**
 * Hook for consuming clean build events with intelligent polling
 * Provides accurate progress, reliable completion detection, and clean error handling
 */
export function useCleanBuildEvents(
  buildId: string | null,
  userId: string,
  options: UseCleanBuildEventsOptions = {}
): CleanBuildEventsReturn {
  // 🚀 ULTIMATE FIX: Normalize all parameters to prevent Hook dependency array size changes
  // CRITICAL: Always provide consistent parameter structure to prevent React Hook violations
  const normalizedBuildId = buildId || null
  const normalizedUserId = userId || ''
  const normalizedOptions = {
    autoPolling: Boolean(options?.autoPolling ?? true),
    initialInterval: Number(options?.initialInterval ?? 2000),
    projectBuildStatus: options?.projectBuildStatus || null
  }

  const {
    autoPolling,
    initialInterval,
    projectBuildStatus
  } = normalizedOptions

  const queryClient = useQueryClient()
  const wasCompleteRef = useRef(false)
  const currentBuildIdRef = useRef<string | null>(buildId)

  // 🆕 SINGLETON PATTERN: Hook instance management
  const [hookInstance, setHookInstance] = useState<{
    instanceId: HookInstanceId
    isPrimary: boolean
    key: BuildEventsKey
  } | null>(null)

  // State for secondary instances (subscribers)
  const [sharedData, setSharedData] = useState<CleanBuildEventsReturn | null>(null)

  // 🆕 GLOBAL STATE INTEGRATION - CONSUME ONLY (no competitive updates)
  const globalCurrentBuildId = useCurrentBuildId()
  const isBuildIdCurrent = useIsBuildIdCurrent()

  // 🚀 STABILITY FIX: Create stable reference for isBuildIdCurrent to prevent Hook violations
  const stableIsBuildIdCurrent = useCallback((id: string | null) => {
    return isBuildIdCurrent(id)
  }, [isBuildIdCurrent])

  // 🆕 CRITICAL FIX: Use global buildId as source of truth, with prop fallback for initial state
  // DO NOT try to update global state from hooks - this causes race conditions
  const effectiveBuildId = globalCurrentBuildId || normalizedBuildId

  // 🆕 DEBUG: Log when there's a mismatch between prop and global state
  React.useEffect(() => {
    if (normalizedBuildId && globalCurrentBuildId && normalizedBuildId !== globalCurrentBuildId) {
      logger.warn('clean-events', `📋 BuildId mismatch - prop: ${normalizedBuildId.slice(0, 8)}, global: ${globalCurrentBuildId.slice(0, 8)}, using global as source of truth`)
    }
  }, [normalizedBuildId, globalCurrentBuildId])

  // 🆕 SINGLETON PATTERN: Register hook instance and determine primary/secondary role
  useEffect(() => {
    if (!effectiveBuildId || !normalizedUserId) {
      return
    }

    // 🆕 INITIALIZATION PATIENCE: Wait a bit to ensure global state is initialized
    const isGloballyCurrent = stableIsBuildIdCurrent(effectiveBuildId)
    if (!isGloballyCurrent) {
      logger.debug('clean-events', `⏳ Hook registration delayed: BuildId ${effectiveBuildId.slice(0, 8)} not yet globally current - waiting for initialization...`)

      // Use a small delay to allow synchronous initialization to complete
      const timeoutId = setTimeout(() => {
        if (!stableIsBuildIdCurrent(effectiveBuildId)) {
          logger.warn('clean-events', `⚠️ BuildId ${effectiveBuildId.slice(0, 8)} still not globally current after delay - proceeding anyway`)
        }
      }, 100) // Small delay to allow sync initialization

      return () => clearTimeout(timeoutId)
    }

    const updateCallback = (data: CleanBuildEventsReturn) => {
      setSharedData(data)
    }

    const registration = hookRegistry.register(effectiveBuildId, normalizedUserId, updateCallback)
    setHookInstance(registration)

    const instanceCount = hookRegistry.getInstanceCount(effectiveBuildId, normalizedUserId)
    logger.info('clean-events', `🎭 Hook instance initialized: ${registration.instanceId} (${registration.isPrimary ? 'PRIMARY' : 'SECONDARY'}) - Total: ${instanceCount}`)

    // If this is a secondary instance, subscribe to shared data
    let unsubscribe: (() => void) | null = null
    if (!registration.isPrimary) {
      unsubscribe = sharedStore.subscribe(registration.key, updateCallback)
      logger.info('clean-events', `📡 Secondary instance ${registration.instanceId} subscribed to shared data`)
    }

    // Cleanup on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe()
      }

      const { needsOwnershipTransfer } = hookRegistry.unregister(registration.instanceId, registration.key)

      if (needsOwnershipTransfer) {
        logger.warn('clean-events', `👑 Primary instance ${registration.instanceId} unmounted - ownership transferred`)
      }
    }
  }, [effectiveBuildId, normalizedUserId, stableIsBuildIdCurrent])

  // Register this QueryClient with the global manager and activate current buildId
  useEffect(() => {
    buildQueryManager.registerQueryClient(queryClient)

    // Initialize buildId as active on first mount
    if (effectiveBuildId) {
      buildQueryManager.activateBuildId(effectiveBuildId, queryClient)
      currentBuildIdRef.current = effectiveBuildId
    }
  }, [queryClient])

  // 🆕 CRITICAL: Global buildId transition with defensive cleanup
  useEffect(() => {
    if (effectiveBuildId && effectiveBuildId !== currentBuildIdRef.current) {
      const oldBuildId = currentBuildIdRef.current

      logger.info('clean-events', `🔄 Global buildId transition detected: ${oldBuildId?.slice(0, 8) || 'null'} → ${effectiveBuildId.slice(0, 8)}`)

      // STEP 1: SURGICAL CLEANUP - Cancel polling for old buildId but preserve final data
      if (oldBuildId && !isBuildIdCurrent(oldBuildId)) {
        logger.info('clean-events', `🔄 Stopping polling for old buildId (not globally current): ${oldBuildId.slice(0, 8)}`)
        queryClient.cancelQueries({ queryKey: ['clean-build-events', oldBuildId] })
        // Note: We keep the data intact so completed builds can still display their final state
      }

      // STEP 2: Activate new buildId and cleanup stale queries (only if globally current)
      if (stableIsBuildIdCurrent(effectiveBuildId)) {
        buildQueryManager.activateBuildId(effectiveBuildId, queryClient)
        currentBuildIdRef.current = effectiveBuildId

        // STEP 3: Force immediate invalidation to start fresh polling
        logger.info('clean-events', `🚀 Starting fresh queries for globally current buildId: ${effectiveBuildId.slice(0, 8)}`)
        queryClient.invalidateQueries({ queryKey: ['clean-build-events', effectiveBuildId] })
      } else {
        logger.warn('clean-events', `❌ BuildId ${effectiveBuildId.slice(0, 8)} is not globally current, skipping activation`)
      }
    }
  }, [effectiveBuildId, queryClient, stableIsBuildIdCurrent])

  // Component unmount cleanup - stop polling but preserve data
  useEffect(() => {
    return () => {
      if (effectiveBuildId) {
        logger.debug('clean-events', `🧹 Component unmounting, stopping polling for buildId: ${effectiveBuildId.slice(0, 8)}`)
        queryClient.cancelQueries({ queryKey: ['clean-build-events', effectiveBuildId], exact: true })
        // Note: We keep the data intact for other components that might still need it
      }
    }
  }, [effectiveBuildId, queryClient])

  // 🆕 SINGLETON PATTERN: Only primary instances run React Query
  const shouldRunQuery = hookInstance?.isPrimary || false

  const { data, isSuccess, isLoading, error } = useQuery({
    queryKey: ['clean-build-events', effectiveBuildId], // Use effective buildId as key
    queryFn: async (): Promise<CleanBuildApiResponse | null> => {
      if (!effectiveBuildId) return null

      // 🆕 GLOBAL STATE: Quadruple-check we're fetching the globally current buildId
      if (!stableIsBuildIdCurrent(effectiveBuildId)) {
        logger.warn('clean-events', `❌ Query cancelled - buildId ${effectiveBuildId.slice(0, 8)} not globally current`)
        throw new Error(`Non-current buildId query cancelled: ${effectiveBuildId.slice(0, 8)}`)
      }

      // DEFENSIVE: Triple-check we're fetching the current buildId
      if (effectiveBuildId !== currentBuildIdRef.current || !buildQueryManager.isActiveBuildId(effectiveBuildId)) {
        const debugInfo = {
          queryBuildId: effectiveBuildId.slice(0, 8),
          currentBuildId: currentBuildIdRef.current?.slice(0, 8) || 'null',
          globalCurrentBuildId: globalCurrentBuildId?.slice(0, 8) || 'null',
          isActive: buildQueryManager.isActiveBuildId(effectiveBuildId),
          isGloballyCurrent: stableIsBuildIdCurrent(effectiveBuildId),
          reason: effectiveBuildId !== currentBuildIdRef.current ? 'buildId_mismatch' : 'not_active'
        }
        logger.warn('clean-events', `❌ Query function cancelled - stale buildId detected: ${JSON.stringify(debugInfo)}`)
        throw new Error(`Stale buildId query cancelled: ${effectiveBuildId.slice(0, 8)}`)
      }

      // ADDITIONAL: Final validation before making HTTP request
      const activeBuildIds = buildQueryManager.getActiveBuildIds()
      if (activeBuildIds.length > 0 && !activeBuildIds.includes(effectiveBuildId)) {
        logger.error('clean-events', `🚨 Critical: BuildId ${effectiveBuildId.slice(0, 8)} not in active list: [${activeBuildIds.map(id => id.slice(0, 8)).join(', ')}]`)
        throw new Error(`BuildId not in active list: ${effectiveBuildId.slice(0, 8)}`)
      }

      // Always fetch all events (lastEventId=0) to ensure consistency across components
      const url = `/api/builds/${effectiveBuildId}/events?userId=${normalizedUserId}&lastEventId=0`

      logger.debug('clean-events', `Fetching events for globally current buildId: ${effectiveBuildId.slice(0, 8)}`)

      const response = await fetch(url, {
        credentials: 'include' // Include authentication cookies
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch build events: ${response.status}`)
      }

      const data = await response.json() as CleanBuildApiResponse
      logger.info('clean-events', `🚨 CLEAN BUILD EVENTS: Data updated - buildId: ${effectiveBuildId.slice(0, 8)}, events: ${data.events?.length || 0}`)

      return data
    },
    enabled: Boolean(
      shouldRunQuery && // 🆕 SINGLETON PATTERN: Only primary instances poll
      effectiveBuildId &&
      normalizedUserId &&
      autoPolling &&
      effectiveBuildId === currentBuildIdRef.current &&
      buildQueryManager.isActiveBuildId(effectiveBuildId) &&
      stableIsBuildIdCurrent(effectiveBuildId) // 🆕 GLOBAL STATE: Only poll if globally current
    ),
    refetchInterval: (query) => {
      if (!autoPolling || !effectiveBuildId || !shouldRunQuery) {
        logger.debug('clean-events', `⏹️ Polling disabled: autoPolling=${autoPolling}, buildId=${effectiveBuildId?.slice(0, 8) || 'null'}, shouldRunQuery=${shouldRunQuery}`)
        return false
      }

      // 🆕 COORDINATION: Check if build is already completed in shared store
      if (hookInstance) {
        const isSharedCompleted = sharedStore.isCompleted(hookInstance.key)
        if (isSharedCompleted) {
          logger.info('clean-events', `⏹️ PRIMARY ${hookInstance.instanceId}: Polling stopped - Build marked completed in shared store`)
          return false
        }
      }

      // 🆕 GLOBAL STATE: Stop polling if buildId is not globally current
      if (!stableIsBuildIdCurrent(effectiveBuildId)) {
        logger.warn('clean-events', `⏹️ Polling stopped: BuildId ${effectiveBuildId.slice(0, 8)} not globally current`)
        return false
      }

      // SURGICAL OPTION 1: Stop polling if this is not the current/active buildId
      if (effectiveBuildId !== currentBuildIdRef.current || !buildQueryManager.isActiveBuildId(effectiveBuildId)) {
        const debugInfo = {
          queryBuildId: effectiveBuildId.slice(0, 8),
          currentBuildId: currentBuildIdRef.current?.slice(0, 8) || 'null',
          globalCurrentBuildId: globalCurrentBuildId?.slice(0, 8) || 'null',
          isActive: buildQueryManager.isActiveBuildId(effectiveBuildId),
          isGloballyCurrent: stableIsBuildIdCurrent(effectiveBuildId),
          activeBuildIds: buildQueryManager.getActiveBuildIds().map(id => id.slice(0, 8)),
          reason: effectiveBuildId !== currentBuildIdRef.current ? 'buildId_mismatch' : 'not_active'
        }
        logger.warn('clean-events', `⏹️ Polling stopped: Stale buildId detected: ${JSON.stringify(debugInfo)}`)
        return false
      }

      // SURGICAL OPTION 2: Stop polling if project build status is deployed (but preserve data)
      if (projectBuildStatus === 'deployed') {
        // 🆕 SINGLETON COORDINATION: Only primary instance logs to reduce spam
        if (shouldRunQuery) {
          logger.info('clean-events', `⏹️ PRIMARY ${hookInstance?.instanceId}: Build polling stopped - Project status: deployed for buildId: ${effectiveBuildId.slice(0, 8)}`)
        }
        return false
      }

      // SURGICAL OPTION 3: Stop polling on failed status (but preserve data)
      if (projectBuildStatus === 'failed') {
        // 🆕 SINGLETON COORDINATION: Only primary instance logs to reduce spam
        if (shouldRunQuery) {
          logger.info('clean-events', `⏹️ PRIMARY ${hookInstance?.instanceId}: Build polling stopped - Project status: failed for buildId: ${effectiveBuildId.slice(0, 8)}`)
        }
        return false
      }

      // SURGICAL OPTION 4: Check individual events for completion (fallback)
      const queryData = query.state.data as CleanBuildApiResponse | null
      const currentEvents = queryData?.events || []
      const isFinished = currentEvents.some(e => e.finished)

      // Hard max runtime ceiling (15 minutes) - use query creation time
      const queryCreatedAt = query.state.dataUpdatedAt || Date.now()
      if (Date.now() - queryCreatedAt > 15 * 60 * 1000) {
        // 🆕 SINGLETON COORDINATION: Only primary instance logs to reduce spam
        if (shouldRunQuery) {
          logger.warn('clean-events', `⏰ PRIMARY ${hookInstance?.instanceId}: Build polling stopped - 15-minute ceiling reached for buildId: ${effectiveBuildId.slice(0, 8)}`)
        }
        return false
      }

      // SURGICAL OPTION 5: Stop polling when build is finished via events (but preserve final data)
      if (isFinished) {
        // 🆕 SINGLETON COORDINATION: Only primary instance logs to reduce spam
        if (shouldRunQuery) {
          logger.info('clean-events', `🎉 PRIMARY ${hookInstance?.instanceId}: Build polling stopped - Build completed for buildId: ${effectiveBuildId.slice(0, 8)}`)

          // 🆕 COORDINATION: Update shared store with completion status
          if (hookInstance) {
            const completedData: CleanBuildEventsReturn = {
              events: currentEvents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
              isComplete: true,
              currentProgress: currentEvents[currentEvents.length - 1]?.overall_progress || 1,
              previewUrl: currentEvents.slice().reverse().find(e => e.preview_url)?.preview_url || null,
              stepIndex: currentEvents[currentEvents.length - 1]?.step_index,
              totalSteps: currentEvents[currentEvents.length - 1]?.total_steps,
              currentPhase: currentEvents[currentEvents.length - 1]?.phase,
              error: null,
              isLoading: false
            }
            sharedStore.publish(hookInstance.key, completedData)
            logger.info('clean-events', `📡 PRIMARY ${hookInstance.instanceId}: Published completion status to secondary instances`)
          }
        }
        return false
      }

      // 🆕 CIRCUIT BREAKER: Check for zombie polling before continuing
      const { zombieCount } = buildQueryManager.checkForZombiePolling()
      if (zombieCount > 0) {
        logger.error('clean-events', `🧟 Zombie polling detected for ${effectiveBuildId.slice(0, 8)} - killing zombie instances`)
        buildQueryManager.killZombiePolling()
        // Continue polling if current buildId is still valid after cleanup
        if (!buildQueryManager.isActiveBuildId(effectiveBuildId)) {
          logger.warn('clean-events', `⏹️ Current buildId ${effectiveBuildId.slice(0, 8)} was killed by zombie cleanup`)
          return false
        }
      }

      // Adaptive polling intervals based on latest event phase from React Query data
      const latestEvent = currentEvents[currentEvents.length - 1]
      const interval = getAdaptiveInterval(latestEvent?.phase)

      logger.debug('clean-events', `🔄 Polling continues for ${effectiveBuildId.slice(0, 8)}: interval=${interval}ms, phase=${latestEvent?.phase || 'unknown'}`)
      return interval
    },
    staleTime: 500, // Keep data fresh for progress updates
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnMount: true, // Refetch on mount to get latest data
    refetchOnWindowFocus: false, // Don't refetch on window focus to prevent duplicate requests
  })

  // Derive all values directly from React Query data - no component state
  const events = data?.events || []
  const sortedEvents = events.sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const latestEvent = sortedEvents[sortedEvents.length - 1]
  const isComplete = sortedEvents.some(e => e.finished)
  // Get the LATEST preview URL, not the first one
  const previewUrl = sortedEvents.slice().reverse().find(e => e.preview_url)?.preview_url || null
  const currentProgress = latestEvent?.overall_progress || 0
  const currentPhase = latestEvent?.phase
  const stepIndex = latestEvent?.step_index
  const totalSteps = latestEvent?.total_steps

  // 🆕 SINGLETON PATTERN: Prepare return data
  const returnData: CleanBuildEventsReturn = {
    events: sortedEvents,
    isComplete,
    currentProgress,
    previewUrl,
    stepIndex,
    totalSteps,
    currentPhase,
    error: error as Error | null,
    isLoading
  }

  // 🚀 STABILITY FIX: Create stable refs for dependency array
  const hookInstanceIdRef = useRef<string | null>(null)
  const hookInstanceKeyRef = useRef<string | null>(null)

  if (hookInstance) {
    hookInstanceIdRef.current = hookInstance.instanceId
    hookInstanceKeyRef.current = hookInstance.key
  }

  // 🆕 SINGLETON PATTERN: Primary instances publish data to secondary instances
  useEffect(() => {
    if (shouldRunQuery && isSuccess && data && hookInstance) {
      const eventsWithPreviewUrls = events.filter(e => e.preview_url)

      // Only log for primary instances to reduce console spam
      console.log('🚨 CLEAN BUILD EVENTS: Data updated (PRIMARY)', {
        instanceId: hookInstance.instanceId,
        buildId: normalizedBuildId?.slice(0, 8),
        newEventCount: events.length,
        lastEventId: data.lastEventId,
        previewUrlsFound: eventsWithPreviewUrls.length,
        extractedPreviewUrl: previewUrl
      })

      // Publish to secondary instances
      sharedStore.publish(hookInstance.key, returnData)

      logger.info('clean-events', `📡 PRIMARY ${hookInstance.instanceId}: Published data to secondary instances - ${events.length} events`)
    }
  }, [shouldRunQuery, isSuccess, data, hookInstance?.instanceId, events.length, previewUrl, normalizedBuildId, isComplete])

  // Decide output data but don't return early to maintain hook call invariants
  const outputData = (!shouldRunQuery && sharedData) ? sharedData : returnData

  if (!shouldRunQuery && sharedData) {
    logger.debug('clean-events', `📡 SECONDARY ${hookInstance?.instanceId}: Using shared data - ${sharedData.events.length} events`)
  }

  // Handle build completion and invalidate related caches - ONLY FOR PRIMARY INSTANCES
  useEffect(() => {
    if (isComplete && !wasCompleteRef.current && effectiveBuildId && shouldRunQuery) {
      wasCompleteRef.current = true

      logger.info(`🎉 Build ${effectiveBuildId.slice(0, 8)} completed! Invalidating version caches... (PRIMARY ${hookInstance?.instanceId})`)

      // Invalidate all version-related queries to refresh version displays
      queryClient.invalidateQueries({ queryKey: ['project-status'] })
      queryClient.invalidateQueries({ queryKey: ['version-history'] })
      queryClient.invalidateQueries({ queryKey: ['current-version'] })

      // Also invalidate any workspace project queries
      queryClient.invalidateQueries({ queryKey: ['workspace-project'] })

      console.log('🔄 Version caches invalidated after build completion (PRIMARY ONLY)')
    }
  }, [isComplete, effectiveBuildId, queryClient, shouldRunQuery, hookInstance?.instanceId])

  // Reset completion tracking when buildId changes
  useEffect(() => {
    wasCompleteRef.current = false
  }, [effectiveBuildId])

  // Cleanup: Cancel query when component unmounts
  useEffect(() => {
    return () => {
      if (effectiveBuildId) {
        logger.info('clean-events', `Component unmounting - cancelling query for buildId: ${effectiveBuildId.slice(0, 8)}`)
        queryClient.cancelQueries({ queryKey: ['clean-build-events', effectiveBuildId] })
      }
    }
  }, [effectiveBuildId, queryClient])

  // 🆕 SINGLETON PATTERN: Return decided output data (primary data or shared data for secondary)
  return outputData
}

/**
 * Get adaptive polling interval based on build phase
 * Faster polling during active phases, slower during longer operations
 */
function getAdaptiveInterval(phase?: string): number {
  // Fast polling during active phases
  if (phase === 'build' || phase === 'deploy') return 1000

  // Slower polling during longer steps
  if (phase === 'dependencies') return 3000

  // Default polling interval
  return 2000
}

/**
 * Simplified build events hook for components that only need basic status
 */
export function useCleanBuildStatus(buildId: string | null, userId: string) {
  // 🚀 ULTIMATE FIX: Use consistent parameter normalization - no conditional objects
  const normalizedOptions = useMemo(() => ({
    autoPolling: true,
    initialInterval: 3000,
    projectBuildStatus: null as 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed' | null
  }), [])

  const { isComplete, currentProgress, previewUrl, error, isLoading } = useCleanBuildEvents(
    buildId || null,
    userId || '',
    normalizedOptions
  )

  return {
    isComplete,
    currentProgress,
    previewUrl,
    error,
    isLoading,
    progressPercentage: Math.round(currentProgress * 100)
  }
}

// 🆕 DEVELOPMENT TOOLS: Expose singleton pattern monitoring in dev mode
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Extend existing debug tools with singleton monitoring
  const existingTools = (window as any).buildDebugTools || {}

  ;(window as any).buildDebugTools = {
    ...existingTools,

    // Monitor hook instances
    hookInstances: () => {
      const allInstances = hookRegistry.getAllInstances()
      console.group('🎭 Hook Instance Registry')
      console.log(`📊 Total buildId-userId combinations: ${allInstances.length}`)

      allInstances.forEach(({ key, instances }) => {
        const [buildId, userId] = key.split('-')
        console.log(`\n🔑 ${buildId.slice(0, 8)}-${userId.slice(0, 8)}:`)
        instances.forEach(instance => {
          console.log(`  ${instance.isPrimary ? '👑 PRIMARY' : '📡 SECONDARY'}: ${instance.id}`)
        })
      })

      if (allInstances.length === 0) {
        console.log('✅ No active hook instances')
      }

      console.groupEnd()
      return allInstances
    },

    // Check for multiple instances of same buildId
    findDuplicates: () => {
      const allInstances = hookRegistry.getAllInstances()
      const duplicates = allInstances.filter(({ instances }) => instances.length > 1)

      if (duplicates.length > 0) {
        console.group('⚠️  Multiple Hook Instances Detected')
        duplicates.forEach(({ key, instances }) => {
          const [buildId, userId] = key.split('-')
          console.warn(`🚨 ${instances.length} instances for ${buildId.slice(0, 8)}-${userId.slice(0, 8)}:`)
          instances.forEach(instance => {
            console.log(`  ${instance.isPrimary ? '👑 PRIMARY' : '📡 SECONDARY'}: ${instance.id}`)
          })
        })
        console.groupEnd()
      } else {
        console.log('✅ No duplicate instances found')
      }

      return duplicates
    },

    // Get shared store data
    sharedData: () => {
      console.group('📦 Shared Store Data')
      const allInstances = hookRegistry.getAllInstances()

      allInstances.forEach(({ key }) => {
        const data = sharedStore.getData(key)
        const isSharedCompleted = sharedStore.isCompleted(key)
        const [buildId, userId] = key.split('-')
        console.log(`${buildId.slice(0, 8)}-${userId.slice(0, 8)}:`, {
          hasData: !!data,
          eventCount: data?.events.length || 0,
          isComplete: data?.isComplete || false,
          isSharedCompleted, // 🆕 Show shared completion status
          previewUrl: data?.previewUrl || 'none'
        })
      })

      console.groupEnd()
    },

    // Force cleanup all hook instances (emergency reset)
    clearAllHooks: () => {
      console.warn('🧹 EMERGENCY: Clearing all hook instances')
      const allInstances = hookRegistry.getAllInstances()
      let clearedCount = 0

      allInstances.forEach(({ key, instances }) => {
        instances.forEach(instance => {
          hookRegistry.unregister(instance.id, key)
          clearedCount++
        })
        sharedStore.clear(key)
      })

      console.log(`💀 Cleared ${clearedCount} hook instances`)
      return clearedCount
    }
  }

  console.log('🎭 Hook registry debug tools available at window.buildDebugTools')
  console.log('Commands: hookInstances(), findDuplicates(), sharedData(), clearAllHooks()')
}


here is /src/components/builder/builder-interface.tsx:
'use client'

import React, { useState, useEffect, useRef } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { baseStyles, templates, colorThemes, businessNames } from './preview-templates'
import { questionFlow, buildStepTemplates } from './question-flow'

interface BuilderInterfaceV2Props {
  initialIdea: string
  translations: {
    chat: {
      title: string
      thinking: string
    }
    preview: {
      title: string
      loading: string
    }
    buildLog: {
      title: string
      steps: {
        analyzing: string
        scaffolding: string
        generating: string
        styling: string
        deploying: string
      }
    }
  }
}

interface ChatMessage {
  id: string
  type: 'ai' | 'user' | 'system'
  content: string
  chips?: string[]
  timestamp: Date
  isTyping?: boolean
}

interface BuildStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'complete'
  detail?: string
}

interface BuilderState {
  businessType?: string
  colorTheme?: string
  brandName?: string
  features: string[]
  targetAudience?: string
}

export function BuilderInterface({ initialIdea, translations }: BuilderInterfaceV2Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [buildSteps, setBuildSteps] = useState<BuildStep[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set())
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [builderState, setBuilderState] = useState<BuilderState>({ features: [] })
  const [customInput, setCustomInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)
  const customInputRef = useRef<HTMLInputElement>(null)

  // Initialize with the user's idea
  useEffect(() => {
    const initialMessage: ChatMessage = {
      id: '1',
      type: 'user',
      content: initialIdea,
      timestamp: new Date()
    }
    setMessages([initialMessage])

    // Start the building process
    startBuilding()
  }, [initialIdea]) // eslint-disable-line react-hooks/exhaustive-deps

  const startBuilding = async () => {
    // Add initial build steps
    const steps: BuildStep[] = [
      { id: '1', label: translations.buildLog.steps.analyzing, status: 'active' },
      { id: '2', label: translations.buildLog.steps.scaffolding, status: 'pending' },
      { id: '3', label: translations.buildLog.steps.generating, status: 'pending' },
      { id: '4', label: translations.buildLog.steps.styling, status: 'pending' },
    ]
    setBuildSteps(steps)

    // Initial preview
    updatePreview('initial')

    // Simulate initial analysis with dynamic messages
    await simulateStepWithMessages(0, steps, 'analyzing')

    // Ask first question
    askNextQuestion()
  }

  const simulateStepWithMessages = async (stepIndex: number, steps: BuildStep[], stepType: keyof typeof buildStepTemplates) => {
    const messages = buildStepTemplates[stepType]?.messages || []

    for (let i = 0; i < messages.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const updatedSteps = [...steps]
      updatedSteps[stepIndex].detail = messages[i]
      setBuildSteps([...updatedSteps])
    }

    await new Promise(resolve => setTimeout(resolve, 500))

    const updatedSteps = [...steps]
    updatedSteps[stepIndex].status = 'complete'
    updatedSteps[stepIndex].detail = undefined
    if (stepIndex + 1 < updatedSteps.length) {
      updatedSteps[stepIndex + 1].status = 'active'
    }
    setBuildSteps(updatedSteps)
  }

  const updatePreview = (template: keyof typeof templates | 'custom', customHtml?: string) => {
    if (previewRef.current?.contentDocument) {
      const doc = previewRef.current.contentDocument
      const html = customHtml || (template === 'custom' ? templates.initial.html : templates[template]?.html) || templates.initial.html

      doc.open()
      doc.write(`
        ${baseStyles}
        <body>
          ${html}
        </body>
      `)
      doc.close()

      // Apply color theme if set
      if (builderState.colorTheme && colorThemes[builderState.colorTheme as keyof typeof colorThemes]) {
        const theme = colorThemes[builderState.colorTheme as keyof typeof colorThemes]
        const root = doc.documentElement
        root.style.setProperty('--primary', theme.primary)
        root.style.setProperty('--secondary', theme.secondary)
        root.style.setProperty('--accent', theme.accent)
      }

      // Apply brand name if set
      if (builderState.brandName) {
        const logos = doc.querySelectorAll('.logo')
        logos.forEach(logo => {
          if (logo) logo.textContent = builderState.brandName || 'Your Business'
        })
      }
    }
  }

  const askNextQuestion = () => {
    if (currentQuestionIndex >= questionFlow.length) {
      // All questions asked, finalize
      finalizeBuild()
      return
    }

    const question = questionFlow[currentQuestionIndex]
    const aiMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'ai',
      content: question.text,
      chips: question.chips,
      timestamp: new Date(),
      isTyping: true
    }

    // Simulate typing effect
    setMessages(prev => [...prev, { ...aiMessage, content: '' }])

    let charIndex = 0
    const typeInterval = setInterval(() => {
      if (charIndex < question.text.length) {
        setMessages(prev => {
          const newMessages = [...prev]
          const lastMessage = newMessages[newMessages.length - 1]
          lastMessage.content = question.text.slice(0, charIndex + 1)
          return newMessages
        })
        charIndex++
      } else {
        clearInterval(typeInterval)
        setMessages(prev => {
          const newMessages = [...prev]
          const lastMessage = newMessages[newMessages.length - 1]
          lastMessage.isTyping = false
          return newMessages
        })
      }
    }, 20)
  }

  const handleChipSelect = async (chip: string) => {
    // Handle special chips
    if (chip === "I'll type my own") {
      setShowCustomInput(true)
      setTimeout(() => customInputRef.current?.focus(), 100)
      return
    }

    if (chip === 'Use AI suggestion') {
      const suggestions = businessNames[builderState.businessType as keyof typeof businessNames] || ['YourBusiness']
      chip = suggestions[Math.floor(Math.random() * suggestions.length)]
    }

    // Add visual feedback
    setSelectedChips(prev => new Set([...prev, chip]))

    // Add user response
    const userResponse: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: chip,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userResponse])

    // Update builder state
    const currentQuestion = questionFlow[currentQuestionIndex]
    updateBuilderState(currentQuestion.type, chip)

    // Start thinking animation
    setIsThinking(true)

    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 800))

    // Update preview based on selection
    applySelectionToPreview(currentQuestion.type, chip)

    // Continue build steps
    const currentStepIndex = buildSteps.findIndex(s => s.status === 'active')
    if (currentStepIndex >= 0 && currentStepIndex < buildSteps.length - 1) {
      const stepTypes: (keyof typeof buildStepTemplates)[] = ['scaffolding', 'generating', 'styling', 'features']
      await simulateStepWithMessages(currentStepIndex, buildSteps, stepTypes[currentStepIndex] || 'scaffolding')
    }

    setIsThinking(false)

    // Move to next question
    setCurrentQuestionIndex(prev => prev + 1)
    askNextQuestion()
  }

  const handleCustomSubmit = () => {
    if (!customInput.trim()) return

    setShowCustomInput(false)
    handleChipSelect(customInput)
    setCustomInput('')
  }

  const updateBuilderState = (type: string, value: string) => {
    setBuilderState(prev => {
      switch (type) {
        case 'business_type':
          return { ...prev, businessType: value }
        case 'color_theme':
          return { ...prev, colorTheme: value }
        case 'brand_name':
          return { ...prev, brandName: value }
        case 'features':
          return { ...prev, features: [...prev.features, value] }
        case 'target_audience':
          return { ...prev, targetAudience: value }
        default:
          return prev
      }
    })
  }

  const applySelectionToPreview = (type: string, value: string) => {
    switch (type) {
      case 'business_type':
        if (value === 'SaaS Platform') updatePreview('saas')
        else if (value === 'E-commerce Store') updatePreview('ecommerce')
        break
      case 'color_theme':
        updatePreview('custom')
        break
      case 'brand_name':
        updatePreview('custom')
        break
    }
  }

  const finalizeBuild = async () => {
    const finalMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'ai',
      content: "🎉 Incredible! Your app is ready. You've just built a fully functional business in minutes. Ready to go live?",
      chips: ['Deploy Now', 'Add More Features', 'Preview on Mobile'],
      timestamp: new Date()
    }
    setMessages(prev => [...prev, finalMessage])
  }

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="fixed inset-0 bg-gray-950 flex">
      {/* Left Panel - Chat */}
      <m.div
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-80 border-r border-gray-800 flex flex-col bg-gray-900/50"
      >
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="message-square" className="w-5 h-5 text-purple-400"  />
            {translations.chat.title}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence>
            {messages.map((message, index) => (
              <m.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  'rounded-lg p-3',
                  message.type === 'user'
                    ? 'bg-purple-600/20 ml-8'
                    : 'bg-gray-800/50 mr-8'
                )}
              >
                <div className="flex items-start gap-2">
                  {message.type === 'ai' && (
                    <Icon name="sparkles" className="w-4 h-4 text-purple-400 mt-1 flex-shrink-0"  />
                  )}
                  <div className="flex-1">
                    <p className="text-sm">
                      {message.content}
                      {message.isTyping && (
                        <span className="inline-block w-1 h-4 bg-purple-400 ml-1 animate-pulse" />
                      )}
                    </p>

                    {message.chips && !message.isTyping && (
                      <div className="mt-3 space-y-2">
                        <AnimatePresence>
                          {message.chips.map((chip, chipIndex) => (
                            <m.button
                              key={chip}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: chipIndex * 0.1 }}
                              onClick={() => handleChipSelect(chip)}
                              disabled={selectedChips.has(chip)}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className={cn(
                                'w-full text-left px-3 py-2 rounded-md text-sm transition-all',
                                'bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50',
                                'hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10',
                                'flex items-center justify-between group',
                                selectedChips.has(chip) && 'opacity-50 cursor-not-allowed'
                              )}
                            >
                              <span>{chip}</span>
                              <Icon name="chevron-right" className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity"  />
                            </m.button>
                          ))}
                        </AnimatePresence>

                        {showCustomInput && (
                          <m.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="flex gap-2"
                          >
                            <input
                              ref={customInputRef}
                              type="text"
                              value={customInput}
                              onChange={(e) => setCustomInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                              placeholder="Type your answer..."
                              className="flex-1 px-3 py-2 rounded-md text-sm bg-gray-800 border border-gray-700 focus:border-purple-500 focus:outline-none"
                            />
                            <button
                              onClick={handleCustomSubmit}
                              className="p-2 rounded-md bg-purple-600 hover:bg-purple-700 transition-colors"
                            >
                              <Icon name="send" className="w-4 h-4"  />
                            </button>
                          </m.div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </m.div>
            ))}
          </AnimatePresence>

          {isThinking && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-gray-400 text-sm ml-8"
            >
              <Icon name="sparkles" className="w-4 h-4 animate-pulse"  />
              {translations.chat.thinking}
            </m.div>
          )}

          <div ref={chatEndRef} />
        </div>
      </m.div>

      {/* Center - Preview */}
      <div className="flex-1 flex flex-col bg-gray-950">
        <m.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="p-4 border-b border-gray-800 flex items-center justify-between"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="globe" className="w-5 h-5 text-blue-400"  />
            {translations.preview.title}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-3 py-1 bg-gray-800 rounded-full text-xs">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-gray-400">Live Preview</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
          </div>
        </m.div>

        <div className="flex-1 p-4">
          <m.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="w-full h-full rounded-lg overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl"
          >
            <iframe
              ref={previewRef}
              className="w-full h-full"
              title="Preview"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </m.div>
        </div>
      </div>

      {/* Right Panel - Build Log */}
      <m.div
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-64 border-l border-gray-800 flex flex-col bg-gray-900/50"
      >
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="code" className="w-5 h-5 text-green-400"  />
            {translations.buildLog.title}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            <AnimatePresence>
              {buildSteps.map((step, index) => (
                <m.div
                  key={step.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    'flex items-start gap-3 text-sm',
                    step.status === 'pending' && 'opacity-40'
                  )}
                >
                  {step.status === 'complete' ? (
                    <Icon name="check-circle" className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0"  />
                  ) : step.status === 'active' ? (
                    <m.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      className="flex-shrink-0"
                    >
                      <Icon name="zap" className="w-4 h-4 text-yellow-400 mt-0.5"  />
                    </m.div>
                  ) : (
                    <Icon name="circle" className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0"  />
                  )}
                  <div className="flex-1">
                    <p className={cn(
                      step.status === 'active' && 'text-yellow-400',
                      step.status === 'complete' && 'text-green-400'
                    )}>
                      {step.label}
                    </p>
                    <AnimatePresence>
                      {step.detail && (
                        <m.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="text-xs text-gray-500 mt-1"
                        >
                          {step.detail}
                        </m.p>
                      )}
                    </AnimatePresence>
                  </div>
                </m.div>
              ))}
            </AnimatePresence>

            {/* Progress indicator */}
            <div className="mt-6 pt-6 border-t border-gray-800">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                <span>Progress</span>
                <span>{Math.round((buildSteps.filter(s => s.status === 'complete').length / buildSteps.length) * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <m.div
                  className="h-full bg-gradient-to-r from-purple-600 to-pink-600"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(buildSteps.filter(s => s.status === 'complete').length / buildSteps.length) * 100}%`
                  }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </div>
        </div>
      </m.div>
    </div>
  )
}

// Keep legacy export for backward compatibility during Phase 1
export { BuilderInterface as BuilderInterfaceV2 }


The worker is a separate fastify app that lives in its own server. Here is the event emitter for your info and as per your request.

eventService.ts from the worker codebase:

import { EventEmitter } from 'events';
import {
  BuildPhase,
  CleanEventData,
  InternalBuildEvent,
  sanitizeErrorMessage,
  UserBuildEvent
} from '../types/cleanEvents';
import { pool } from './database';
import { getWebhookService } from './webhookService';

// Create event bus for instant in-process updates
export const bus = new EventEmitter();

/**
 * Emit a build event - stores in DB and broadcasts via EventEmitter
 * @param buildId - The build ID
 * @param type - Event type (e.g., 'plan_started', 'task_completed')
 * @param data - Event data payload
 */
export async function emitBuildEvent(buildId: string, type: string, data: any) {
  try {
    // Store in DB if pool is available
    if (!pool) {
      console.warn('[Event] Database not available, skipping event storage');
      return;
    }

    // Extract userId from data if available
    const userId = data?.userId || data?.user_id || null;

    const result = await pool.query(
      'INSERT INTO project_build_events (build_id, event_type, event_data, user_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [buildId, type, JSON.stringify(data), userId]
    );

    const eventId = result.rows[0].id;

    // Emit to in-process bus for instant updates
    const event = {
      id: eventId,
      buildId,
      type,
      data,
      timestamp: new Date().toISOString()
    };

    bus.emit(buildId, event);
    bus.emit('all', event); // Also emit to a global channel

    // Send webhook if configured
    try {
      const webhookService = getWebhookService();
      await webhookService.send({
        buildId,
        type: type as any, // Allow any event type for flexibility
        data,
        timestamp: Date.now()
      });
    } catch (webhookError) {
      console.warn('[Event] Webhook delivery failed (non-blocking):', webhookError);
    }

    // Log for debugging
    console.log(`[Event] ${type} for build ${buildId}:`, data);

    return eventId;
  } catch (error) {
    console.error('Failed to emit build event:', error);
    // Don't throw - we don't want event failures to break builds
  }
}

/**
 * Get events for a build since a specific event ID
 * @param buildId - The build ID
 * @param lastEventId - Last event ID received by client
 * @param userId - User ID for security filtering (optional)
 */
export async function getEventsSince(buildId: string, lastEventId: number = 0, userId?: string) {
  if (!pool) {
    return [];
  }

  // If userId is provided, filter by it for security (only user's events, no system events)
  const query = userId
    ? `SELECT id, event_type as type, event_data as data, created_at as timestamp
       FROM project_build_events
       WHERE build_id = $1 AND id > $2 AND user_id = $3
       ORDER BY id`
    : `SELECT id, event_type as type, event_data as data, created_at as timestamp
       FROM project_build_events
       WHERE build_id = $1 AND id > $2
       ORDER BY id`;

  const params = userId ? [buildId, lastEventId, userId] : [buildId, lastEventId];
  const result = await pool.query(query, params);

  return result.rows.map((row: any) => ({
    id: row.id,
    type: row.type,
    data: row.data,
    timestamp: row.timestamp
  }));
}

/**
 * Subscribe to events for a specific build
 * @param buildId - The build ID
 * @param callback - Function to call when events occur
 * @returns Unsubscribe function
 */
export function subscribeToEvents(buildId: string, callback: (event: any) => void) {
  bus.on(buildId, callback);

  // Return unsubscribe function
  return () => {
    bus.off(buildId, callback);
  };
}

// ============================================================================
// CLEAN EVENT SYSTEM - NextJS Team API UX Implementation
// ============================================================================

/**
 * Emit a clean, structured build event with security filtering
 * @param buildId - The build ID
 * @param userId - User ID for security filtering
 * @param eventData - Clean event data
 */
export async function emitCleanBuildEvent(
  buildId: string,
  userId: string,
  eventData: CleanEventData
): Promise<number | undefined> {
  try {
    if (!pool) {
      console.warn('[CleanEvent] Database not available, skipping event storage');
      return;
    }

    // Sanitize error message if present
    const sanitizedErrorMessage = eventData.errorMessage
      ? sanitizeErrorMessage(eventData.errorMessage)
      : null;

    // Insert clean event with new schema
    const result = await pool.query(`
      INSERT INTO project_build_events (
        build_id,
        event_type,
        event_data,
        user_id,
        user_visible,
        internal_data,
        event_phase,
        event_title,
        event_description,
        overall_progress,
        finished,
        preview_url,
        error_message,
        duration_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [
      buildId,
      eventData.eventType,
      JSON.stringify(eventData.legacyData || {}), // Keep legacy data for backward compatibility
      userId,
      true, // user_visible - all clean events are user-visible by default
      eventData.internalData ? JSON.stringify(eventData.internalData) : null,
      eventData.phase,
      eventData.title,
      eventData.description,
      // Clamp overall progress to valid range (0.0 - 1.0) for numeric(3,2) constraint
      eventData.overallProgress ? Math.min(Math.max(eventData.overallProgress, 0.0), 1.0) : null,
      eventData.finished || false,
      eventData.previewUrl || null,
      sanitizedErrorMessage,
      // Cap duration to prevent numeric overflow - max 999999.99 seconds for numeric(8,2)
      eventData.durationSeconds ? Math.min(eventData.durationSeconds, 999999.99) : null
    ]);

    const eventId = result.rows[0].id;

    // Create user-facing event for EventEmitter
    const userEvent: UserBuildEvent = {
      id: eventId.toString(),
      build_id: buildId,
      event_type: eventData.eventType,
      phase: eventData.phase,
      title: eventData.title,
      description: eventData.description,
      overall_progress: eventData.overallProgress || 0,
      finished: eventData.finished || false,
      preview_url: eventData.previewUrl,
      error_message: sanitizedErrorMessage || undefined,
      created_at: new Date().toISOString(),
      duration_seconds: eventData.durationSeconds,
      // Frontend team requested: Include version information in events
      versionId: eventData.versionId,
      versionName: eventData.versionName
    };

    // Emit to in-process bus for instant updates
    bus.emit(buildId, userEvent);
    bus.emit('all', userEvent);

    // Send webhook with clean event (no internal data)
    try {
      const webhookService = getWebhookService();
      await webhookService.send({
        buildId,
        type: eventData.eventType as any,
        data: userEvent,
        timestamp: Date.now()
      });
    } catch (webhookError) {
      console.warn('[CleanEvent] Webhook delivery failed (non-blocking):', webhookError);
    }

    // Log for debugging (with internal data if available)
    console.log(`[CleanEvent] ${eventData.eventType}/${eventData.phase} for build ${buildId}: ${eventData.title}`);
    if (eventData.internalData) {
      console.log(`[CleanEvent] Internal data:`, eventData.internalData);
    }

    return eventId;
  } catch (error) {
    console.error('Failed to emit clean build event:', error);
    // Don't throw - we don't want event failures to break builds
    return undefined;
  }
}

/**
 * Get clean user-facing events for a build (filtered for security)
 * @param buildId - The build ID
 * @param lastEventId - Last event ID received by client
 * @param userId - User ID for security filtering
 */
export async function getCleanEventsSince(
  buildId: string,
  lastEventId: number = 0,
  userId?: string
): Promise<UserBuildEvent[]> {
  if (!pool) {
    return [];
  }

  // Query only user-visible events with clean schema
  const query = userId
    ? `SELECT
        id, build_id, event_type, event_phase, event_title, event_description,
        overall_progress, finished, preview_url, error_message,
        created_at, duration_seconds
       FROM project_build_events
       WHERE build_id = $1 AND id > $2 AND user_id = $3 AND user_visible = true
       AND event_phase IS NOT NULL  -- Only clean events
       ORDER BY id`
    : `SELECT
        id, build_id, event_type, event_phase, event_title, event_description,
        overall_progress, finished, preview_url, error_message,
        created_at, duration_seconds
       FROM project_build_events
       WHERE build_id = $1 AND id > $2 AND user_visible = true
       AND event_phase IS NOT NULL  -- Only clean events
       ORDER BY id`;

  const params = userId ? [buildId, lastEventId, userId] : [buildId, lastEventId];
  const result = await pool.query(query, params);

  return result.rows.map((row: any) => ({
    id: row.id.toString(),
    build_id: row.build_id,
    event_type: row.event_type,
    phase: row.event_phase,
    title: row.event_title,
    description: row.event_description,
    overall_progress: row.overall_progress || 0,
    finished: row.finished || false,
    preview_url: row.preview_url || undefined,
    error_message: row.error_message || undefined,
    // error_message_user_friendly: row.error_message_friendly //TODO
    created_at: row.created_at,
    duration_seconds: row.duration_seconds || undefined
  }));
}

/**
 * Get internal events with full debug data (admin/internal use only)
 * @param buildId - The build ID
 * @param lastEventId - Last event ID received
 * @param adminToken - Admin token for verification (TODO: implement auth)
 */
export async function getInternalEventsSince(
  buildId: string,
  lastEventId: number = 0,
  adminToken?: string  // TODO: Implement proper admin authentication
): Promise<InternalBuildEvent[]> {
  if (!pool) {
    return [];
  }

  // TODO: Verify adminToken for security
  // For now, this is just a placeholder for the internal API

  const query = `SELECT
      id, build_id, event_type, event_data, user_id, internal_data,
      event_phase, event_title, event_description, overall_progress,
      finished, preview_url, error_message, created_at, duration_seconds
     FROM project_build_events
     WHERE build_id = $1 AND id > $2
     AND event_phase IS NOT NULL  -- Only clean events
     ORDER BY id`;

  const result = await pool.query(query, [buildId, lastEventId]);

  return result.rows.map((row: any) => ({
    id: row.id.toString(),
    build_id: row.build_id,
    event_type: row.event_type,
    phase: row.event_phase,
    title: row.event_title,
    description: row.event_description,
    overall_progress: row.overall_progress || 0,
    finished: row.finished || false,
    preview_url: row.preview_url || undefined,
    error_message: row.error_message || undefined,
    created_at: row.created_at,
    duration_seconds: row.duration_seconds || undefined,
    user_id: row.user_id || undefined,
    internal_data: row.internal_data || undefined
  }));
}

/**
 * Helper function to emit common build phase events
 */
export class CleanEventEmitter {
  constructor(private buildId: string, private userId: string) {}

  async phaseStarted(phase: BuildPhase, title: string, description: string, progress: number = 0) {
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'started',
      title,
      description,
      overallProgress: progress,
      finished: false
    });
  }

  async phaseProgress(phase: BuildPhase, title: string, description: string, progress: number) {
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'progress',
      title,
      description,
      overallProgress: progress,
      finished: false
    });
  }

  async phaseCompleted(phase: BuildPhase, title: string, description: string, progress: number, durationSeconds?: number) {
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'completed',
      title,
      description,
      overallProgress: progress,
      finished: false, // Only the final deploy phase should set finished = true
      durationSeconds
    });
  }

  async buildCompleted(previewUrl: string, durationSeconds?: number, versionInfo?: { versionId: string; versionName: string }) {
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase: 'deploy',
      eventType: 'completed',
      title: 'Preview Complete',
      description: 'Your application is ready!',
      overallProgress: 1.0,
      finished: true,
      previewUrl,
      durationSeconds,
      // Frontend team requested: Add version information to completion events
      versionId: versionInfo?.versionId,
      versionName: versionInfo?.versionName
    });
  }

  async buildFailed(phase: BuildPhase, errorMessage: string, internalData?: any) {
    return emitCleanBuildEvent(this.buildId, this.userId, {
      phase,
      eventType: 'failed',
      title: 'Build Failed',
      description: 'Something went wrong',
      overallProgress: 0,
      finished: true,
      errorMessage,
      internalData
    });
  }
}



	4.	DB migrations for projects and project_build_events (and any triggers):



CREATE FUNCTION public.get_user_build_events(target_user_id uuid, build_limit integer DEFAULT 50) RETURNS TABLE(id integer, build_id character varying, event_type character varying, event_data jsonb, created_at timestamp without time zone, user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Verify the requesting user can access these events
  IF auth.uid() != target_user_id AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Access denied: Cannot access build events for other users';
  END IF;

  RETURN QUERY
  SELECT
    pbe.id,
    pbe.build_id,
    pbe.event_type,
    pbe.event_data,
    pbe.created_at,
    pbe.user_id
  FROM public.project_build_events pbe
  WHERE pbe.user_id = target_user_id
  ORDER BY pbe.created_at DESC
  LIMIT build_limit;
END;
$$;



CREATE FUNCTION public.publish_build_event(p_build_id character varying, p_event_type character varying, p_event_data jsonb, p_user_id uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  event_id INTEGER;
BEGIN
  -- Insert the build event
  INSERT INTO public.project_build_events (
    build_id,
    event_type,
    event_data,
    user_id
  ) VALUES (
    p_build_id,
    p_event_type,
    p_event_data,
    p_user_id
  )
  RETURNING id INTO event_id;

  -- Return the event ID
  RETURN event_id;
END;
$$;


CREATE TABLE public.project_build_events (
    id integer NOT NULL,
    build_id character varying(64) NOT NULL,
    event_type character varying(50) NOT NULL,
    event_data jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    user_id uuid,
    user_visible boolean DEFAULT true,
    internal_data jsonb,
    event_phase character varying(20),
    event_title character varying(200),
    event_description text,
    overall_progress numeric(3,2),
    finished boolean DEFAULT false,
    preview_url text,
    error_message text,
    duration_seconds numeric(8,2),
    CONSTRAINT project_build_events_overall_progress_check CHECK (((overall_progress >= 0.0) AND (overall_progress <= 1.0)))
);



ALTER TABLE ONLY public.project_build_events ALTER COLUMN id SET DEFAULT nextval('public.worker_build_events_id_seq'::regclass);


ALTER TABLE ONLY public.project_build_events
    ADD CONSTRAINT worker_build_events_pkey PRIMARY KEY (id);


ALTER TABLE ONLY public.project_build_events
    ADD CONSTRAINT project_build_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;



CREATE POLICY "Service role can insert build events" ON public.project_build_events FOR INSERT WITH CHECK (true);


CREATE POLICY "Service role can update build events" ON public.project_build_events FOR UPDATE USING (true);


CREATE POLICY "Users can view own build events" ON public.project_build_events FOR SELECT USING ((auth.uid() = user_id));


	5.	Preview deployment path (the endpoint + any domain config): currently we are using wrangler to deploy to cloudflare pages and we serving the returned url to our clients (it looks like: https://65e0037a.sheenapps-preview.pages.dev). We plan to set things up on cloudflare dns so that the link would be a subdomain on sheenapps.com)



	6.	Your current SSE/WebSocket experiment if any (even a WIP branch): none

7. The “credits”/AI time accounting code (reserve/commit/release)

All of this is done on the worker microservice side and saved to the db (which as you know by now is one database shared by both the nextjs and worker apps). Here is the code of aiTimeBillingService.ts from the worker for your info and as per your request:

import { pool } from './database';
import type { PoolClient } from 'pg';

// =====================================================
// TYPES AND INTERFACES
// =====================================================

export interface UserBalance {
  welcomeBonus: number; // seconds
  dailyGift: number; // seconds available today
  paid: number; // seconds from purchases/subscriptions
  total: number; // total seconds available
}

export interface ConsumptionBreakdown {
  welcomeUsed: number;
  dailyUsed: number;
  paidUsed: number;
  totalConsumed: number;
}

export interface TrackingSession {
  trackingId: string;
  startedAt: Date;
  estimatedSeconds: number;
}

export interface ConsumptionRecord {
  id: string;
  userId: string;
  buildId: string;
  operationType: string;
  durationSeconds: number;
  billableSeconds: number;
  consumption: ConsumptionBreakdown;
  balanceBefore: UserBalance;
  balanceAfter: UserBalance;
  success: boolean;
}

export interface EstimateResult {
  estimatedSeconds: number;
  estimatedMinutes: number;
  confidence: 'high' | 'medium' | 'low';
  basedOnSamples: number;
}

export interface BalanceSnapshot {
  welcome: number;
  daily: number;
  paid: number;
}

export interface UsageStats {
  totalSecondsUsed: number;
  totalCostUsd: number;
  operationBreakdown: Record<string, number>;
  dailyUsage: Array<{ date: string; seconds: number }>;
}

export interface AutoTopUpSettings {
  enabled: boolean;
  thresholdSeconds: number;
  packageName: string;
  consentAt?: Date;
}

// =====================================================
// ERRORS
// =====================================================

export class InsufficientAITimeError extends Error {
  constructor(
    public required: number,
    public available: number,
    public breakdown: UserBalance,
    public estimate?: EstimateResult
  ) {
    super(`Insufficient AI time: ${required} seconds required, ${available} available`);
    this.name = 'InsufficientAITimeError';
  }
}

export class AITimeBillingError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AITimeBillingError';
  }
}

// =====================================================
// BILLING SERVICE
// =====================================================

export class AITimeBillingService {

  // =====================================================
  // BALANCE MANAGEMENT
  // =====================================================

  /**
   * Get user's current AI time balance across all sources
   */
  async getUserBalance(userId: string): Promise<UserBalance> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const query = `
      SELECT
        welcome_bonus_seconds,
        daily_gift_used_today,
        paid_seconds_remaining,
        subscription_seconds_remaining
      FROM user_ai_time_balance
      WHERE user_id = $1
    `;

    try {
      const result = await pool.query(query, [userId]);

      if (result.rows.length === 0) {
        // Create new user balance with welcome bonus
        await this.initializeUserBalance(userId);
        return this.getUserBalance(userId);
      }

      const row = result.rows[0];

      // Calculate available daily gift (15 minutes = 900 seconds)
      const dailyGiftAvailable = Math.max(0, 900 - (row.daily_gift_used_today || 0));

      const balance: UserBalance = {
        welcomeBonus: row.welcome_bonus_seconds || 0,
        dailyGift: dailyGiftAvailable,
        paid: (row.paid_seconds_remaining || 0) + (row.subscription_seconds_remaining || 0),
        total: 0
      };

      balance.total = balance.welcomeBonus + balance.dailyGift + balance.paid;

      return balance;
    } catch (error) {
      throw new AITimeBillingError(`Failed to get user balance: ${error}`, 'BALANCE_FETCH_ERROR');
    }
  }

  /**
   * Check if user has sufficient balance for estimated operation
   */
  async checkSufficientBalance(userId: string, estimatedSeconds: number): Promise<boolean> {
    const balance = await this.getUserBalance(userId);
    return balance.total >= estimatedSeconds;
  }

  /**
   * Initialize balance for new user with welcome bonus
   */
  private async initializeUserBalance(userId: string): Promise<void> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const query = `
      INSERT INTO user_ai_time_balance (user_id, welcome_bonus_seconds)
      VALUES ($1, 3000)
      ON CONFLICT (user_id) DO NOTHING
    `;

    await pool.query(query, [userId]);
  }

  // =====================================================
  // TIME TRACKING AND CONSUMPTION
  // =====================================================

  /**
   * Start tracking AI time for an operation
   */
  async startTracking(
    buildId: string,
    operationType: 'main_build' | 'metadata_generation' | 'update',
    context: { projectId: string; versionId: string; userId: string; sessionId?: string }
  ): Promise<TrackingSession> {

    // Get historical estimate
    const estimate = await this.estimateDuration(operationType, context);

    // Check if user has sufficient balance
    const hasBalance = await this.checkSufficientBalance(context.userId, estimate.estimatedSeconds);
    if (!hasBalance) {
      const balance = await this.getUserBalance(context.userId);
      throw new InsufficientAITimeError(estimate.estimatedSeconds, balance.total, balance, estimate);
    }

    return {
      trackingId: `${buildId}_${operationType}`,
      startedAt: new Date(),
      estimatedSeconds: estimate.estimatedSeconds
    };
  }

  /**
   * End tracking and record consumption
   */
  async endTracking(
    trackingId: string,
    context: {
      userId: string;
      projectId: string;
      versionId: string;
      sessionId?: string;
      startedAt: Date;
      success: boolean;
      errorType?: string;
    }
  ): Promise<ConsumptionRecord> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const endedAt = new Date();
    const durationMs = endedAt.getTime() - context.startedAt.getTime();
    const durationSeconds = Math.ceil(durationMs / 1000);

    // Round up to nearest 10-second increment for billing
    const billableSeconds = Math.ceil(durationSeconds / 10) * 10;

    const [buildId, ...operationTypeParts] = trackingId.split('_');
    const operationType = operationTypeParts.join('_'); // Handle operation types with underscores

    console.log(`[AI Time Billing] Recording consumption:`, {
      trackingId,
      buildId,
      operationType,
      durationSeconds,
      billableSeconds
    });

    // Validate operation type
    const allowedTypes = ['main_build', 'metadata_generation', 'update'];
    if (!allowedTypes.includes(operationType)) {
      console.error(`[AI Time Billing] Invalid operation type: ${operationType}. Allowed: ${allowedTypes.join(', ')}`);
    }

    return await this.recordConsumption({
      userId: context.userId,
      projectId: context.projectId,
      buildId,
      versionId: context.versionId,
      sessionId: context.sessionId,
      operationType: operationType as 'main_build' | 'metadata_generation' | 'update',
      startedAt: context.startedAt,
      endedAt,
      durationMs,
      durationSeconds,
      billableSeconds,
      success: context.success,
      errorType: context.errorType
    });
  }

  /**
   * Record AI time consumption with atomic balance update
   */
  async recordConsumption(params: {
    userId: string;
    projectId: string;
    buildId: string;
    versionId: string;
    sessionId?: string;
    operationType: 'main_build' | 'metadata_generation' | 'update';
    startedAt: Date;
    endedAt: Date;
    durationMs: number;
    durationSeconds: number;
    billableSeconds: number;
    success: boolean;
    errorType?: string;
  }): Promise<ConsumptionRecord> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lock user balance for update
      const balanceQuery = `
        SELECT
          welcome_bonus_seconds,
          daily_gift_used_today,
          paid_seconds_remaining,
          subscription_seconds_remaining
        FROM user_ai_time_balance
        WHERE user_id = $1
        FOR UPDATE
      `;

      const balanceResult = await client.query(balanceQuery, [params.userId]);
      if (balanceResult.rows.length === 0) {
        throw new AITimeBillingError('User balance not found', 'USER_BALANCE_NOT_FOUND');
      }

      const balance = balanceResult.rows[0];
      const dailyGiftAvailable = Math.max(0, 900 - (balance.daily_gift_used_today || 0));

      const balanceBefore: BalanceSnapshot = {
        welcome: balance.welcome_bonus_seconds || 0,
        daily: dailyGiftAvailable,
        paid: (balance.paid_seconds_remaining || 0) + (balance.subscription_seconds_remaining || 0)
      };

      // Calculate consumption breakdown (Welcome → Daily → Paid)
      let remaining = params.billableSeconds;
      const consumption: ConsumptionBreakdown = {
        welcomeUsed: 0,
        dailyUsed: 0,
        paidUsed: 0,
        totalConsumed: params.billableSeconds
      };

      // Use welcome bonus first
      if (balanceBefore.welcome > 0 && remaining > 0) {
        consumption.welcomeUsed = Math.min(remaining, balanceBefore.welcome);
        remaining -= consumption.welcomeUsed;
      }

      // Then daily gift
      if (balanceBefore.daily > 0 && remaining > 0) {
        consumption.dailyUsed = Math.min(remaining, balanceBefore.daily);
        remaining -= consumption.dailyUsed;
      }

      // Finally paid
      if (remaining > 0) {
        if (balanceBefore.paid >= remaining) {
          consumption.paidUsed = remaining;
          remaining = 0;
        } else {
          await client.query('ROLLBACK');
          throw new InsufficientAITimeError(params.billableSeconds, balanceBefore.welcome + balanceBefore.daily + balanceBefore.paid, {
            welcomeBonus: balanceBefore.welcome,
            dailyGift: balanceBefore.daily,
            paid: balanceBefore.paid,
            total: balanceBefore.welcome + balanceBefore.daily + balanceBefore.paid
          });
        }
      }

      // Calculate balance after consumption
      const balanceAfter: BalanceSnapshot = {
        welcome: balanceBefore.welcome - consumption.welcomeUsed,
        daily: balanceBefore.daily - consumption.dailyUsed,
        paid: balanceBefore.paid - consumption.paidUsed
      };

      // Update user balance
      const updateBalanceQuery = `
        UPDATE user_ai_time_balance
        SET
          welcome_bonus_seconds = welcome_bonus_seconds - $2,
          daily_gift_used_today = daily_gift_used_today + $3,
          paid_seconds_remaining = GREATEST(0, paid_seconds_remaining - $4),
          subscription_seconds_remaining = GREATEST(0, subscription_seconds_remaining - GREATEST(0, $4 - paid_seconds_remaining)),
          total_seconds_used_today = total_seconds_used_today + $5,
          total_seconds_used_lifetime = total_seconds_used_lifetime + $5,
          last_used_at = NOW(),
          updated_at = NOW()
        WHERE user_id = $1
      `;

      await client.query(updateBalanceQuery, [
        params.userId,
        consumption.welcomeUsed,
        consumption.dailyUsed,
        Math.min(consumption.paidUsed, balance.paid_seconds_remaining || 0),
        params.billableSeconds
      ]);

      // Insert consumption record
      const idempotencyKey = `${params.buildId}_${params.operationType}`;
      const insertConsumptionQuery = `
        INSERT INTO user_ai_time_consumption (
          user_id, project_id, build_id, version_id, session_id,
          idempotency_key, operation_type, started_at, ended_at,
          duration_ms, duration_seconds, billable_seconds,
          welcome_bonus_used_seconds, daily_gift_used_seconds, paid_seconds_used,
          balance_before_seconds, balance_after_seconds,
          success, error_type
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )
        RETURNING id
      `;

      try {
        const consumptionResult = await client.query(insertConsumptionQuery, [
          params.userId,
          params.projectId,
          params.buildId,
          params.versionId,
          params.sessionId,
          idempotencyKey,
          params.operationType,
          params.startedAt,
          params.endedAt,
          params.durationMs,
        params.durationSeconds,
        params.billableSeconds,
        consumption.welcomeUsed,
        consumption.dailyUsed,
        consumption.paidUsed,
        JSON.stringify(balanceBefore),
        JSON.stringify(balanceAfter),
        params.success,
        params.errorType
        ]);

        await client.query('COMMIT');

        return {
        id: consumptionResult.rows[0].id,
        userId: params.userId,
        buildId: params.buildId,
        operationType: params.operationType,
        durationSeconds: params.durationSeconds,
        billableSeconds: params.billableSeconds,
        consumption,
        balanceBefore: {
          welcomeBonus: balanceBefore.welcome,
          dailyGift: balanceBefore.daily,
          paid: balanceBefore.paid,
          total: balanceBefore.welcome + balanceBefore.daily + balanceBefore.paid
        },
        balanceAfter: {
          welcomeBonus: balanceAfter.welcome,
          dailyGift: balanceAfter.daily,
          paid: balanceAfter.paid,
          total: balanceAfter.welcome + balanceAfter.daily + balanceAfter.paid
        },
        success: params.success
        };

      } catch (insertError: any) {
        await client.query('ROLLBACK');

        // Handle duplicate key error gracefully - this means consumption was already recorded
        if (insertError.code === '23505' && insertError.constraint === 'user_ai_time_consumption_idempotency_key_key') {
          console.log(`[AI Time Billing] Consumption already recorded for ${idempotencyKey}, fetching existing record`);

          // Fetch the existing record instead of failing
          const existingQuery = `
            SELECT * FROM user_ai_time_consumption
            WHERE idempotency_key = $1
          `;
          const existingResult = await client.query(existingQuery, [idempotencyKey]);

          if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];
            return {
              id: existing.id,
              userId: existing.user_id,
              buildId: existing.build_id,
              operationType: existing.operation_type,
              durationSeconds: existing.duration_seconds,
              billableSeconds: existing.billable_seconds,
              consumption: {
                welcomeUsed: existing.welcome_bonus_used_seconds || 0,
                dailyUsed: existing.daily_gift_used_seconds || 0,
                paidUsed: existing.paid_seconds_used || 0,
                totalConsumed: existing.billable_seconds
              },
              balanceBefore: JSON.parse(existing.balance_before_seconds || '{}'),
              balanceAfter: JSON.parse(existing.balance_after_seconds || '{}'),
              success: existing.success
            };
          }
        }

        throw insertError;
      }

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // ESTIMATION AND ANALYTICS
  // =====================================================

  /**
   * Estimate operation duration based on historical data
   */
  async estimateDuration(
    operationType: 'main_build' | 'metadata_generation' | 'update',
    context: { projectId?: string; isUpdate?: boolean; projectSize?: 'small' | 'medium' | 'large' }
  ): Promise<EstimateResult> {
    if (!pool) {
      // Return default estimates if no database
      const defaults = {
        main_build: 180, // 3 minutes
        metadata_generation: 30, // 30 seconds
        update: 120 // 2 minutes
      };

      return {
        estimatedSeconds: defaults[operationType],
        estimatedMinutes: Math.ceil(defaults[operationType] / 60),
        confidence: 'low',
        basedOnSamples: 0
      };
    }

    try {
      // Get p95 duration from historical data (last 30 days)
      const query = `
        SELECT
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY billable_seconds) as p95_seconds,
          COUNT(*) as sample_count
        FROM user_ai_time_consumption
        WHERE operation_type = $1
          AND success = true
          AND created_at > NOW() - INTERVAL '30 days'
      `;

      const result = await pool.query(query, [operationType]);
      const row = result.rows[0];

      let baseEstimate = row.p95_seconds || this.getDefaultEstimate(operationType);

      // Adjust for context
      if (context.isUpdate) {
        baseEstimate *= 0.7; // Updates typically 30% faster
      }

      if (context.projectSize === 'large') {
        baseEstimate *= 1.3;
      } else if (context.projectSize === 'small') {
        baseEstimate *= 0.8;
      }

      // Round up to nearest 10 seconds
      const estimatedSeconds = Math.ceil(baseEstimate / 10) * 10;

      return {
        estimatedSeconds,
        estimatedMinutes: Math.ceil(estimatedSeconds / 60),
        confidence: row.sample_count > 10 ? 'high' : (row.sample_count > 3 ? 'medium' : 'low'),
        basedOnSamples: parseInt(row.sample_count) || 0
      };

    } catch (error) {
      // Fallback to defaults
      return {
        estimatedSeconds: this.getDefaultEstimate(operationType),
        estimatedMinutes: Math.ceil(this.getDefaultEstimate(operationType) / 60),
        confidence: 'low',
        basedOnSamples: 0
      };
    }
  }

  private getDefaultEstimate(operationType: string): number {
    const defaults: Record<string, number> = {
      main_build: 180, // 3 minutes
      metadata_generation: 30, // 30 seconds
      update: 120 // 2 minutes
    };
    return defaults[operationType] || 120;
  }

  // =====================================================
  // PURCHASES AND SUBSCRIPTIONS
  // =====================================================

  /**
   * Add purchased minutes to user balance
   */
  async addPurchasedMinutes(userId: string, minutes: number, source: 'package' | 'subscription' = 'package'): Promise<void> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const seconds = Math.floor(minutes * 60);
    const column = source === 'subscription' ? 'subscription_seconds_remaining' : 'paid_seconds_remaining';

    const query = `
      UPDATE user_ai_time_balance
      SET ${column} = ${column} + $2,
          updated_at = NOW()
      WHERE user_id = $1
    `;

    await pool.query(query, [userId, seconds]);
  }

  // =====================================================
  // DAILY RESET AND MAINTENANCE
  // =====================================================

  /**
   * Reset daily gift allocation for all users (called by cron job)
   */
  async resetDailyAllocation(): Promise<{ usersReset: number }> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const query = `
      UPDATE user_ai_time_balance
      SET daily_gift_used_today = 0,
          total_seconds_used_today = 0,
          updated_at = NOW()
      WHERE daily_gift_used_today > 0 OR total_seconds_used_today > 0
    `;

    const result = await pool.query(query);
    return { usersReset: result.rowCount || 0 };
  }

  // =====================================================
  // USER ANALYTICS
  // =====================================================

  /**
   * Get user usage statistics for a time period
   */
  async getUserUsageStats(userId: string, period: 'day' | 'week' | 'month'): Promise<UsageStats> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const intervalMap = {
      day: '1 day',
      week: '7 days',
      month: '30 days'
    };

    const query = `
      SELECT
        SUM(billable_seconds) as total_seconds,
        SUM(total_cost_usd) as total_cost,
        operation_type,
        COUNT(*) as operation_count
      FROM user_ai_time_consumption
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '${intervalMap[period]}'
      GROUP BY operation_type
    `;

    const result = await pool.query(query, [userId]);

    const operationBreakdown: Record<string, number> = {};
    let totalSecondsUsed = 0;
    let totalCostUsd = 0;

    result.rows.forEach(row => {
      operationBreakdown[row.operation_type] = parseInt(row.total_seconds) || 0;
      totalSecondsUsed += parseInt(row.total_seconds) || 0;
      totalCostUsd += parseFloat(row.total_cost) || 0;
    });

    return {
      totalSecondsUsed,
      totalCostUsd,
      operationBreakdown,
      dailyUsage: [] // TODO: Implement daily breakdown
    };
  }

  /**
   * Get auto top-up settings for user
   */
  async getAutoTopUpSettings(userId: string): Promise<AutoTopUpSettings> {
    if (!pool) {
      throw new AITimeBillingError('Database not available', 'DB_NOT_AVAILABLE');
    }

    const query = `
      SELECT
        auto_topup_enabled,
        auto_topup_threshold_seconds,
        auto_topup_package,
        auto_topup_consent_at
      FROM user_ai_time_balance
      WHERE user_id = $1
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return {
        enabled: false,
        thresholdSeconds: 600,
        packageName: 'mini'
      };
    }

    const row = result.rows[0];

    return {
      enabled: row.auto_topup_enabled || false,
      thresholdSeconds: row.auto_topup_threshold_seconds || 600,
      packageName: row.auto_topup_package || 'mini',
      consentAt: row.auto_topup_consent_at
    };
  }
}

// Export singleton instance
export const aiTimeBillingService = new AITimeBillingService();
