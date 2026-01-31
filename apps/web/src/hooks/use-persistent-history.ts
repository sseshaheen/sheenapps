/**
 * Persistent Chat History Hook
 * Uses React Query useInfiniteQuery for paginated message history
 * 
 * CRITICAL: Separate from live events to avoid cache conflicts
 */

'use client'

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { persistentChatClient, PersistentChatMessage, PersistentChatMessageHistory } from '@/services/persistent-chat-client'
import { logger } from '@/utils/logger'
import { useCallback } from 'react'

interface UsePersistentHistoryOptions {
  projectId: string
  limit?: number
  enabled?: boolean
}

/**
 * Hook for paginated persistent chat message history
 * Uses React Query for proper caching and pagination
 */
export function usePersistentHistory({
  projectId,
  limit = 50,
  enabled = true
}: UsePersistentHistoryOptions) {
  const queryClient = useQueryClient()

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch
  } = useInfiniteQuery({
    queryKey: ['persistent-chat-history', projectId],
    
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      logger.debug('persistent-chat', 'Fetching persistent chat history', {
        projectId,
        before: pageParam,
        limit
      })
      
      const result = await persistentChatClient.getMessages(projectId, pageParam, limit)
      
      logger.debug('persistent-chat', 'Fetched persistent chat history', {
        projectId,
        messagesCount: result.messages.length,
        hasMore: result.has_more,
        nextBefore: result.next_before
      })
      
      return result
    },
    
    getNextPageParam: (lastPage: PersistentChatMessageHistory) => {
      return lastPage.has_more ? lastPage.next_before : undefined
    },
    
    initialPageParam: undefined as string | undefined,
    
    staleTime: 1000 * 60, // 1 minute - with live SSE, shorter stale reduces old page surprises
    gcTime: 1000 * 60 * 30, // 30 minutes
    enabled: enabled && !!projectId,
    
    // Optimize for chat UX
    refetchOnWindowFocus: false, // Don't refetch on focus - live events handle updates
    refetchOnReconnect: true, // Do refetch on reconnect in case we missed events
  })

  // Flatten all pages into a single message array
  const messages: PersistentChatMessage[] = data?.pages.flatMap(page => page.messages) || []
  
  // Total count from latest page (backend provides this)
  const totalCount = data?.pages[0]?.total_count

  /**
   * Invalidate and refetch history cache
   * Useful after sending messages or when SSE indicates major changes
   */
  const invalidateHistory = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['persistent-chat-history', projectId]
    })
  }, [queryClient, projectId])

  /**
   * Optimistically add a message to the cache
   * Used for immediate UI feedback when sending messages
   */
  const optimisticallyAddMessage = useCallback((message: PersistentChatMessage) => {
    queryClient.setQueryData(
      ['persistent-chat-history', projectId],
      (oldData: any) => {
        if (!oldData) return oldData

        // Add to the first page (most recent messages)
        const newPages = [...oldData.pages]
        if (newPages.length > 0) {
          newPages[0] = {
            ...newPages[0],
            messages: [message, ...newPages[0].messages]
          }
        }

        return {
          ...oldData,
          pages: newPages
        }
      }
    )
  }, [queryClient, projectId])

  /**
   * Remove optimistic message (if it failed to send)
   */
  const removeOptimisticMessage = useCallback((clientMsgId: string) => {
    queryClient.setQueryData(
      ['persistent-chat-history', projectId],
      (oldData: any) => {
        if (!oldData) return oldData

        const newPages = oldData.pages.map((page: PersistentChatMessageHistory) => ({
          ...page,
          messages: page.messages.filter(msg => msg.client_msg_id !== clientMsgId)
        }))

        return {
          ...oldData,
          pages: newPages
        }
      }
    )
  }, [queryClient, projectId])

  return {
    // Data
    messages,
    totalCount,
    
    // Pagination
    hasNextPage,
    fetchNextPage,
    
    // Loading states
    isLoading,
    isFetching,
    isFetchingNextPage,
    
    // Error state
    isError,
    error: error as Error | null,
    
    // Actions
    refetch,
    invalidateHistory,
    optimisticallyAddMessage,
    removeOptimisticMessage
  }
}