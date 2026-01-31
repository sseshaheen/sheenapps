/**
 * Unified Logs Hook
 * Replaces individual build log hooks with unified approach
 * Supports all 5 log tiers: system, build, deploy, action, lifecycle
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query'

export interface UseUnifiedLogsOptions {
  tier?: 'build' | 'deploy' | 'system' | 'action' | 'lifecycle'
  buildId?: string
  userId?: string
  projectId?: string
  startDate?: string  // ISO 8601 format
  endDate?: string    // ISO 8601 format
  instanceId?: string
  format?: 'raw' | 'ndjson'
  limit?: number
  offset?: number     // For pagination
  sortOrder?: 'asc' | 'desc'  // Sort by timestamp
  enabled?: boolean
}

interface UnifiedLogEntry {
  timestamp: string
  instanceId: string
  tier: string
  seq: number
  buildId?: string
  userId?: string
  projectId?: string
  event: string
  action?: string  // Added for admin logs UI
  message: string
  metadata: Record<string, any>
}

type UnifiedLogsResult = string | UnifiedLogEntry[]

export function useUnifiedLogs(options: UseUnifiedLogsOptions): UseQueryResult<UnifiedLogsResult, Error> {
  const {
    tier = 'build',
    buildId,
    userId,
    projectId,
    startDate,
    endDate,
    instanceId,
    format = 'ndjson', // Updated: Backend now defaults to NDJSON for consistency
    limit = 1000,
    offset,
    sortOrder = 'desc', // Default to newest first (matches backend default)
    enabled = true
  } = options

  return useQuery({
    queryKey: ['unified-logs', tier, buildId, userId, projectId, startDate, endDate, instanceId, format, limit, offset, sortOrder],

    queryFn: async (): Promise<UnifiedLogsResult> => {
      const params = new URLSearchParams()

      // Add all defined parameters
      if (tier) params.append('tier', tier)
      if (buildId) params.append('buildId', buildId)
      if (userId) params.append('userId', userId)
      if (projectId) params.append('projectId', projectId)
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)
      if (instanceId) params.append('instanceId', instanceId)
      if (format) params.append('format', format)
      if (limit) params.append('limit', limit.toString())
      if (offset !== undefined) params.append('offset', offset.toString())
      if (sortOrder) params.append('sortOrder', sortOrder)

      // Cache busting - add timestamp
      params.append('_t', Date.now().toString())

      const response = await fetch(`/api/admin/unified-logs/stream?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `Failed to fetch logs: ${response.status}`

        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error || errorMessage
        } catch {
          // Use response text if not JSON
          errorMessage = errorText || errorMessage
        }

        throw new Error(errorMessage)
      }

      if (format === 'raw') {
        // Return raw text as-is
        return response.text()
      } else {
        // NDJSON format - parse each line
        const text = await response.text()
        return text.split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line) as UnifiedLogEntry
            } catch (error) {
              // Fallback for unparseable lines
              return {
                timestamp: new Date().toISOString(),
                instanceId: 'unknown',
                tier: tier || 'build',
                seq: 0,
                event: 'raw',
                message: line,
                metadata: { parseError: true }
              } as UnifiedLogEntry
            }
          })
      }
    },

    enabled: enabled, // Allow all tiers to fetch data even without specific IDs

    // DISABLED: Smart caching based on use case
    // staleTime: 30000, // Cache for 30 seconds by default
    staleTime: 0, // No caching - always fetch fresh data
    refetchOnWindowFocus: false,

    // Retry strategy for network issues
    retry: (failureCount, error) => {
      // Don't retry on 401/403 (auth issues)
      if (error.message.includes('401') || error.message.includes('403')) {
        return false
      }
      // Retry up to 2 times for other errors
      return failureCount < 2
    },

    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000)
  })
}

// Legacy compatibility hook for existing code
export function useBuildLogs(buildId: string): UseQueryResult<string, Error> {
  return useUnifiedLogs({
    tier: 'build',
    buildId,
    format: 'raw',
    enabled: !!buildId
  }) as UseQueryResult<string, Error>
}

// Specialized hooks for different log tiers
export function useSystemLogs(options: Omit<UseUnifiedLogsOptions, 'tier'> = {}) {
  return useUnifiedLogs({ ...options, tier: 'system' })
}

export function useDeployLogs(options: Omit<UseUnifiedLogsOptions, 'tier'>) {
  return useUnifiedLogs({ ...options, tier: 'deploy' })
}

export function useActionLogs(options: Omit<UseUnifiedLogsOptions, 'tier'>) {
  return useUnifiedLogs({ ...options, tier: 'action' })
}

export function useLifecycleLogs(options: Omit<UseUnifiedLogsOptions, 'tier'>) {
  return useUnifiedLogs({ ...options, tier: 'lifecycle' })
}

// Pagination helper hook
export function useUnifiedLogsPaginated(
  baseOptions: UseUnifiedLogsOptions,
  page: number = 0,
  pageSize: number = 1000
) {
  return useUnifiedLogs({
    ...baseOptions,
    limit: pageSize,
    offset: page * pageSize
  })
}

// Smart caching hook that adjusts cache time based on build status
export function useUnifiedLogsWithSmartCaching(
  options: UseUnifiedLogsOptions,
  buildStatus?: 'deployed' | 'failed' | 'in_progress' | 'building' | string
) {
  const {
    tier = 'build',
    buildId,
    userId,
    projectId,
    startDate,
    endDate,
    instanceId,
    format = 'ndjson', // Updated: Backend now defaults to NDJSON for consistency
    limit = 1000,
    offset,
    sortOrder = 'desc', // Default to newest first (matches backend default)
    enabled = true
  } = options

  // DISABLED: Determine optimal cache strategy based on build status
  // const getCacheSettings = (status?: string) => {
  //   switch (status) {
  //     case 'deployed':
  //     case 'failed':
  //       // Completed builds - logs won't change, cache aggressively
  //       return {
  //         staleTime: 3600000,    // 1 hour
  //         gcTime: 7200000,       // 2 hours (keep in memory longer)
  //         refetchOnWindowFocus: false,
  //         refetchOnReconnect: false
  //       }

  //     case 'in_progress':
  //     case 'building':
  //       // Active builds - logs changing rapidly, short cache
  //       return {
  //         staleTime: 30000,      // 30 seconds
  //         gcTime: 300000,        // 5 minutes
  //         refetchOnWindowFocus: true,
  //         refetchOnReconnect: true,
  //         refetchInterval: 30000  // Auto-refresh every 30 seconds
  //       }

  //     default:
  //       // Unknown status - moderate caching
  //       return {
  //         staleTime: 300000,     // 5 minutes
  //         gcTime: 600000,        // 10 minutes
  //         refetchOnWindowFocus: true,
  //         refetchOnReconnect: true
  //       }
  //   }
  // }

  // const cacheSettings = getCacheSettings(buildStatus)

  // DISABLED CACHING - Always fetch fresh data
  const cacheSettings = {
    staleTime: 0,        // No caching
    gcTime: 0,           // Don't keep in memory
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  }

  return useQuery({
    queryKey: ['unified-logs', 'smart-cache', tier, buildId, userId, projectId, startDate, endDate, instanceId, format, limit, offset, sortOrder, buildStatus],

    queryFn: async (): Promise<UnifiedLogsResult> => {
      const params = new URLSearchParams()

      // Add all defined parameters
      if (tier) params.append('tier', tier)
      if (buildId) params.append('buildId', buildId)
      if (userId) params.append('userId', userId)
      if (projectId) params.append('projectId', projectId)
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)
      if (instanceId) params.append('instanceId', instanceId)
      if (format) params.append('format', format)
      if (limit) params.append('limit', limit.toString())
      if (offset !== undefined) params.append('offset', offset.toString())
      if (sortOrder) params.append('sortOrder', sortOrder)

      // Only add cache-busting timestamp for active builds
      if (buildStatus === 'in_progress' || buildStatus === 'building') {
        params.append('_t', Date.now().toString())
      }

      const response = await fetch(`/api/admin/unified-logs/stream?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Cache-Control': buildStatus === 'deployed' || buildStatus === 'failed'
            ? 'public, max-age=3600'  // Allow caching for completed builds
            : 'no-cache',             // No caching for active builds
          'Pragma': buildStatus === 'deployed' || buildStatus === 'failed' ? 'cache' : 'no-cache'
        },
        cache: buildStatus === 'deployed' || buildStatus === 'failed' ? 'default' : 'no-store'
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `Failed to fetch logs: ${response.status}`

        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }

        throw new Error(errorMessage)
      }

      if (format === 'raw') {
        return response.text()
      } else {
        const text = await response.text()
        return text.split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line) as UnifiedLogEntry
            } catch (error) {
              return {
                timestamp: new Date().toISOString(),
                instanceId: 'unknown',
                tier: tier || 'build',
                seq: 0,
                event: 'raw',
                message: line,
                metadata: { parseError: true }
              } as UnifiedLogEntry
            }
          })
      }
    },

    enabled: enabled, // Allow all tiers to fetch data even without specific IDs

    // Apply dynamic cache settings
    ...cacheSettings,

    // Enhanced retry strategy
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error.message.includes('401') || error.message.includes('403')) {
        return false
      }
      // Retry more aggressively for active builds
      const maxRetries = (buildStatus === 'in_progress' || buildStatus === 'building') ? 3 : 2
      return failureCount < maxRetries
    },

    retryDelay: attemptIndex => {
      // Faster retry for active builds
      const baseDelay = (buildStatus === 'in_progress' || buildStatus === 'building') ? 1000 : 2000
      return Math.min(baseDelay * 2 ** attemptIndex, 30000)
    }
  })
}