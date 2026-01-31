'use client'

import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import type { ApiResponse, DeploymentHistoryItem, DeploymentHistoryResponse } from '@/types/inhouse-api'
import { safeJson } from '@/lib/api/safe-json'

interface UseDeploymentHistoryOptions {
  projectId: string
  enabled?: boolean
  /** Number of items per page (1-100, default 20) */
  limit?: number
}

/**
 * React Query hook for fetching deployment history with cursor-based pagination
 *
 * Features:
 * - Infinite scroll support via useInfiniteQuery
 * - Cursor-based pagination (efficient for large histories)
 * - Resilient JSON parsing (handles HTML error pages)
 * - Automatic refetch on window focus
 *
 * @param options - Configuration options
 * @returns React Query infinite query response with deployment history
 */
export function useDeploymentHistory({
  projectId,
  enabled = true,
  limit = 20
}: UseDeploymentHistoryOptions) {
  // Fetcher function for a single page
  const fetchPage = async ({ pageParam }: { pageParam: unknown }): Promise<DeploymentHistoryResponse> => {
    const cursor = pageParam as string | null
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) {
      params.set('cursor', cursor)
    }

    const response = await fetch(
      `/api/inhouse/projects/${projectId}/deployments?${params.toString()}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      }
    )

    if (!response.ok) {
      const errorData = await safeJson<ApiResponse<never>>(response)
      const errorMessage =
        errorData?.ok === false && errorData.error?.message
          ? errorData.error.message
          : `Server error (${response.status}): ${response.statusText}`

      throw new Error(errorMessage)
    }

    const data = await response.json() as ApiResponse<DeploymentHistoryResponse>

    if (!data.ok) {
      const errorMessage = (data as { ok: false; error: { message: string } }).error.message
      throw new Error(errorMessage || 'Failed to fetch deployment history')
    }

    return data.data
  }

  // Use infinite query for pagination support
  const query = useInfiniteQuery<DeploymentHistoryResponse, Error>({
    queryKey: ['deployment-history', projectId, limit],
    queryFn: fetchPage,
    enabled: enabled && !!projectId,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,

    // Don't auto-refetch frequently - deployments don't change that often
    staleTime: 30000, // 30 seconds

    // Refetch on window focus (user might have deployed)
    refetchOnWindowFocus: true,

    // Retry configuration
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 10000)
  })

  // Flatten all pages into a single array
  const deployments = query.data?.pages.flatMap(page => page.deployments) ?? []

  return {
    deployments,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    error: query.error,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch
  }
}

/**
 * Simpler hook for fetching just the latest deployments (no pagination)
 * Useful for compact views like HostingStatusCard
 */
export function useLatestDeployments({
  projectId,
  enabled = true,
  limit = 5
}: UseDeploymentHistoryOptions) {
  const fetchLatest = async (): Promise<DeploymentHistoryItem[]> => {
    const response = await fetch(
      `/api/inhouse/projects/${projectId}/deployments?limit=${limit}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      }
    )

    if (!response.ok) {
      const errorData = await safeJson<ApiResponse<never>>(response)
      const errorMessage =
        errorData?.ok === false && errorData.error?.message
          ? errorData.error.message
          : `Server error (${response.status}): ${response.statusText}`

      throw new Error(errorMessage)
    }

    const data = await response.json() as ApiResponse<DeploymentHistoryResponse>

    if (!data.ok) {
      const errorMessage = (data as { ok: false; error: { message: string } }).error.message
      throw new Error(errorMessage || 'Failed to fetch deployment history')
    }

    return data.data.deployments
  }

  const query = useQuery<DeploymentHistoryItem[], Error>({
    queryKey: ['latest-deployments', projectId, limit],
    queryFn: fetchLatest,
    enabled: enabled && !!projectId,
    staleTime: 30000,
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 10000)
  })

  return {
    deployments: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  }
}
