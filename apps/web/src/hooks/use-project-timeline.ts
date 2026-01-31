/**
 * Project Timeline React Query Hook
 * Provides infinite scroll pagination for project timeline
 * Includes chat messages, build events, and deployments
 */

'use client'

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { fetchJSONWithBalanceHandling } from '@/utils/api-client'
import { logger } from '@/utils/logger'
import { type TimelineResponse, type TimelineQuery, type TimelineItem } from '@/types/chat-plan'
import { useAuthStore } from '@/store'

interface UseProjectTimelineOptions {
  mode?: 'all' | 'plan' | 'build'
  limit?: number
  enabled?: boolean
  refetchInterval?: number
  staleTime?: number
}

const DEFAULT_OPTIONS: Required<UseProjectTimelineOptions> = {
  mode: 'all',
  limit: 50,
  enabled: true,
  refetchInterval: 0, // No auto refetch by default
  staleTime: 5000 // 5 seconds
}

/**
 * Infinite query hook for project timeline
 * Returns paginated timeline items with automatic loading states
 */
export function useProjectTimeline(
  projectId: string, 
  options: UseProjectTimelineOptions = {}
) {
  const user = useAuthStore(state => state.user)
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options }

  const query = useInfiniteQuery({
    queryKey: ['timeline', projectId, mergedOptions.mode, user?.id],
    
    queryFn: async ({ pageParam = 0 }): Promise<TimelineResponse> => {
      const queryParams: TimelineQuery = {
        projectId,
        mode: mergedOptions.mode,
        offset: pageParam,
        limit: mergedOptions.limit
      }

      const urlParams = new URLSearchParams({
        mode: queryParams.mode!,
        offset: String(queryParams.offset!),
        limit: String(queryParams.limit!)
      })

      logger.debug('timeline', 'Fetching timeline page', {
        projectId: projectId.slice(0, 8),
        mode: mergedOptions.mode,
        offset: pageParam,
        limit: mergedOptions.limit
      })

      const response = await fetchJSONWithBalanceHandling<TimelineResponse>(
        `/api/projects/${projectId}/timeline?${urlParams.toString()}`
      )

      logger.debug('timeline', 'Timeline page loaded', {
        projectId: projectId.slice(0, 8),
        itemCount: response.items.length,
        total: response.total,
        hasMore: response.hasMore
      })

      return response
    },

    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined
      return lastPage.offset + lastPage.limit
    },

    initialPageParam: 0,
    
    enabled: mergedOptions.enabled && !!user?.id,
    staleTime: mergedOptions.staleTime,
    refetchInterval: mergedOptions.refetchInterval,

    // Enable background refetch for real-time updates
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  })

  // Flatten all pages into single array
  const allItems: TimelineItem[] = query.data?.pages.flatMap(page => page.items) ?? []
  
  // Calculate total metrics
  const totalItems = query.data?.pages[0]?.total ?? 0
  const loadedItems = allItems.length

  return {
    // Data
    items: allItems,
    totalItems,
    loadedItems,
    
    // Pagination
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    
    // Loading states
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isRefetching: query.isRefetching,
    
    // Actions
    refetch: query.refetch,
    
    // Status helpers
    isEmpty: allItems.length === 0 && !query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    canLoadMore: query.hasNextPage && !query.isFetchingNextPage,
    
    // Progress indicator
    loadProgress: totalItems > 0 ? (loadedItems / totalItems) * 100 : 0
  }
}

/**
 * Hook for real-time timeline updates using smart polling
 * Automatically adjusts polling frequency based on activity
 */
export function useTimelinePolling(projectId: string, isActive = false) {
  const queryClient = useQueryClient()
  const user = useAuthStore(state => state.user)

  // Smart polling with exponential backoff
  const { refetch } = useProjectTimeline(projectId, {
    refetchInterval: isActive ? 5000 : 30000, // 5s active, 30s idle
    staleTime: 2000,
    enabled: !!user?.id
  })

  const invalidateTimeline = () => {
    queryClient.invalidateQueries({ queryKey: ['timeline', projectId] })
    logger.debug('timeline', 'Timeline invalidated for polling update', {
      projectId: projectId.slice(0, 8)
    })
  }

  const forceRefresh = () => {
    refetch()
    logger.info('Timeline force refreshed', {
      projectId: projectId.slice(0, 8)
    }, 'timeline')
  }

  return {
    invalidateTimeline,
    forceRefresh,
    isPolling: isActive
  }
}

/**
 * Hook to add optimistic updates to timeline
 * For immediate UI feedback while API calls are pending
 */
export function useTimelineOptimisticUpdates(projectId: string) {
  const queryClient = useQueryClient()

  const addOptimisticMessage = (
    content: any, 
    itemType: 'chat_message' | 'build_event' | 'deployment'
  ) => {
    const optimisticItem: TimelineItem = {
      id: `optimistic-${Date.now()}`,
      project_id: projectId,
      timeline_seq: Date.now(), // Temporary sequence
      item_type: itemType,
      content,
      created_at: new Date().toISOString(),
      is_visible: true
    }

    queryClient.setQueryData(
      ['timeline', projectId, 'all'],
      (oldData: any) => {
        if (!oldData) return oldData

        // Add to first page
        const updatedPages = [...oldData.pages]
        updatedPages[0] = {
          ...updatedPages[0],
          items: [optimisticItem, ...updatedPages[0].items]
        }

        return {
          ...oldData,
          pages: updatedPages
        }
      }
    )

    logger.debug('timeline', 'Added optimistic timeline item', {
      projectId: projectId.slice(0, 8),
      itemType,
      itemId: optimisticItem.id
    })

    return optimisticItem.id
  }

  const removeOptimisticMessage = (optimisticId: string) => {
    queryClient.setQueryData(
      ['timeline', projectId, 'all'],
      (oldData: any) => {
        if (!oldData) return oldData

        const updatedPages = oldData.pages.map((page: any) => ({
          ...page,
          items: page.items.filter((item: TimelineItem) => item.id !== optimisticId)
        }))

        return {
          ...oldData,
          pages: updatedPages
        }
      }
    )

    logger.debug('timeline', 'Removed optimistic timeline item', {
      projectId: projectId.slice(0, 8),
      optimisticId
    })
  }

  return {
    addOptimisticMessage,
    removeOptimisticMessage
  }
}

/**
 * Timeline statistics hook
 * Provides analytics about timeline activity
 */
export function useTimelineStats(projectId: string) {
  const { items } = useProjectTimeline(projectId, {
    mode: 'all',
    limit: 100, // Get more items for better stats
    staleTime: 30000 // Cache for 30 seconds
  })

  const stats = {
    totalItems: items.length,
    chatMessages: items.filter(item => item.item_type === 'chat_message').length,
    buildEvents: items.filter(item => item.item_type === 'build_event').length,
    deployments: items.filter(item => item.item_type === 'deployment').length,
    lastActivity: items[0]?.created_at ? new Date(items[0].created_at) : null,
    
    // Activity by day (last 7 days)
    activityByDay: (() => {
      const days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date()
        date.setDate(date.getDate() - i)
        return date.toISOString().split('T')[0]
      })

      return days.map(day => ({
        date: day,
        count: items.filter(item => 
          item.created_at.startsWith(day)
        ).length
      })).reverse()
    })()
  }

  return stats
}