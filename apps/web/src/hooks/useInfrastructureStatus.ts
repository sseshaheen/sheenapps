'use client'

import { useQuery } from '@tanstack/react-query'
import type { ApiResponse, InfrastructureStatus } from '@/types/inhouse-api'
import { safeJson } from '@/lib/api/safe-json'

interface UseInfrastructureStatusOptions {
  projectId: string
  enabled?: boolean
}

/**
 * React Query hook for fetching infrastructure status with adaptive polling
 *
 * Milestone C - Expert Review Fixes (Jan 2026):
 * - Resilient JSON parsing (handles HTML error pages from worker/proxy)
 * - Proper TypeScript error typing
 * - Explicit background polling control
 * - Smart polling for terminal error states (reduces load)
 * - Exponential retry backoff matching fetchWithRetry pattern
 *
 * Polling Strategy (adaptive based on status):
 * - 2s interval when provisioning/deploying (active states)
 * - 30s interval when stable (active/live states)
 * - 5min interval for terminal error states (user can manually retry)
 * - Does NOT poll in background tabs (explicit refetchIntervalInBackground: false)
 * - Refetches immediately when tab becomes visible (refetchOnWindowFocus: true)
 *
 * @param options - Configuration options
 * @returns React Query response with infrastructure status
 */
export function useInfrastructureStatus({
  projectId,
  enabled = true
}: UseInfrastructureStatusOptions) {
  // Fetcher function with resilient error handling
  const fetcher = async (): Promise<InfrastructureStatus> => {
    const response = await fetch(`/api/inhouse/projects/${projectId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    })

    if (!response.ok) {
      // EXPERT FIX ROUND 2: Use safe JSON helper for consistent error handling
      const errorData = await safeJson<ApiResponse<never>>(response)
      const errorMessage =
        errorData?.ok === false && errorData.error?.message
          ? errorData.error.message
          : `Server error (${response.status}): ${response.statusText}`

      throw new Error(errorMessage)
    }

    const data = await response.json() as ApiResponse<InfrastructureStatus>

    if (!data.ok) {
      // TypeScript narrowing: when ok is false, we know the type has error property
      const errorMessage = (data as { ok: false; error: { message: string } }).error.message
      throw new Error(errorMessage || 'Failed to fetch infrastructure status')
    }

    return data.data
  }

  // React Query hook with adaptive polling
  // EXPERT FIX: Explicit typing for error (useQuery<Data, Error>)
  const query = useQuery<InfrastructureStatus, Error>({
    queryKey: ['infra-status', projectId],
    queryFn: fetcher,
    enabled: enabled && !!projectId,

    // EXPERT FIX: Adaptive polling based on status with terminal state handling
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 3000 // Initial: poll every 3s

      const isProvisioning = data.database.status === 'provisioning'
      const isDeploying = data.hosting.status === 'deploying'

      // Terminal error states that are unlikely to recover without user action
      const hasTerminalError =
        data.database.status === 'error' ||
        data.hosting.status === 'error'

      // Fast polling during active operations
      if (isProvisioning || isDeploying) return 2000

      // EXPERT FIX: Very slow polling for terminal errors (reduces server load)
      // User can manually refetch via button if they fix the issue
      if (hasTerminalError) return 300000 // 5 minutes

      // Normal polling when stable
      return 30000
    },

    // EXPERT FIX: Explicit - don't poll in background tabs (saves bandwidth + server load)
    refetchIntervalInBackground: false,

    // Refetch on window focus
    refetchOnWindowFocus: true,

    // Refetch on reconnect
    refetchOnReconnect: true,

    // Keep data for 5 seconds (balances freshness vs unnecessary requests)
    staleTime: 5000,

    // EXPERT FIX: Retry with exponential backoff (matches fetchWithRetry pattern)
    // Total attempts: 3 (initial + 2 retries)
    retry: 2,

    // Exponential backoff: 1s, 2s, 4s
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 10000)
  })

  // Return SWR-compatible API for backward compatibility
  return {
    status: query.data,
    isLoading: query.isLoading,
    isValidating: query.isFetching,
    error: query.error,
    mutate: query.refetch
  }
}
