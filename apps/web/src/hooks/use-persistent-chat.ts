/**
 * Persistent Chat Combined Hook
 * Combines history (React Query) with live events (SSE state)
 * 
 * CRITICAL: Single source of truth pattern - backend controls seq ordering
 */

'use client'

import { useCallback, useMemo } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { usePersistentHistory } from './use-persistent-history'
import { usePersistentLive } from './use-persistent-live'
import { 
  persistentChatClient, 
  PersistentChatMessage, 
  SendMessageRequest,
  UpdatePresenceRequest,
  MarkReadRequest,
  UnifiedChatRequest 
} from '@/services/persistent-chat-client'
import { logger } from '@/utils/logger'
import { useAuthStore } from '@/store'
import { debounce } from '@/utils/debounce'

interface UsePersistentChatOptions {
  projectId: string
  enabled?: boolean
  historyLimit?: number
}

/**
 * Main persistent chat hook combining history and live events
 * Provides unified interface for chat functionality
 */
export function usePersistentChat({
  projectId,
  enabled = true,
  historyLimit = 50
}: UsePersistentChatOptions) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore() // Move to top level to fix React Hook rules

  // History management (React Query)
  const {
    messages: historyMessages,
    totalCount,
    hasNextPage,
    fetchNextPage,
    isLoading: isLoadingHistory,
    isFetching: isFetchingHistory,
    isFetchingNextPage,
    isError: isHistoryError,
    error: historyError,
    refetch: refetchHistory,
    invalidateHistory,
    optimisticallyAddMessage,
    removeOptimisticMessage
  } = usePersistentHistory({
    projectId,
    limit: historyLimit,
    enabled
  })

  // Stabilized callbacks for usePersistentLive to prevent infinite renders
  const onMessage = useCallback((message: PersistentChatMessage) => {
    logger.debug('persistent-chat', 'Live message received', { messageId: message.id })
    // Note: We don't automatically add to history cache
    // Let React Query handle its own state, live events are for real-time feedback
  }, [])

  const onPresenceUpdate = useCallback((presence: any[]) => {
    logger.debug('persistent-chat', 'Presence updated', { presenceCount: presence.length })
  }, [])

  const onConnectionStatusChange = useCallback((status: any) => {
    logger.debug('persistent-chat', 'Connection status changed', { status: status.status })
  }, [])

  // Live events management (SSE) - Uses leader-tab pattern for efficient connections
  const {
    liveMessages,
    presenceInfo,
    connectionStatus,
    disconnect: disconnectLive,
    reconnect: reconnectLive,
    clearLiveMessages,
    isConnected,
    isConnecting,
    isDisconnected,
    hasError: hasConnectionError,
    isLeader // NEW: Indicates if this tab is the SSE leader
  } = usePersistentLive({
    projectId,
    userId: user?.id ?? '', // Required for SSEConnectionManager leader election
    enabled: enabled && !!user?.id, // Only enable when we have a user
    onMessage,
    onPresenceUpdate,
    onConnectionStatusChange
  })

  // Read status management (expert recommendation: bootstrap last_read_seq)
  // EXPERT FIX: Now enabled with proper user?.id gating to avoid pre-auth retries
  const {
    data: readStatuses,
    error: readStatusError,
    isLoading: isLoadingReadStatus,
    refetch: refetchReadStatus
  } = useQuery({
    queryKey: ['persistent-chat-read-status', projectId],
    queryFn: async () => {
      return await persistentChatClient.getReadStatus(projectId)
    },
    staleTime: 1000 * 30, // 30 seconds - read status can be slightly stale
    // EXPERT FIX: Gate by user?.id to avoid running before auth hydration
    enabled: enabled && !!projectId && !!user?.id,
    refetchOnWindowFocus: false, // Don't refetch on focus - only when needed
    retry: 2, // Reduced retry count to prevent infinite loops
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Max 10s delay
    refetchOnReconnect: true // Refetch when network reconnects
  })

  // Merge and deduplicate messages from history and live events
  const allMessages = useMemo(() => {
    const messageMap = new Map<string, PersistentChatMessage>()
    // EXPERT FIX: Track client_msg_ids to deduplicate optimistic vs real messages
    const seenClientMsgIds = new Set<string>()

    // Add history messages first (they have definitive seq numbers)
    historyMessages.forEach(msg => {
      messageMap.set(msg.id, msg)
      if (msg.client_msg_id) {
        seenClientMsgIds.add(msg.client_msg_id)
      }
    })

    // Add live messages that aren't already in history
    // EXPERT FIX: Check BOTH id AND client_msg_id for proper idempotency
    liveMessages.forEach(msg => {
      const isDuplicateById = messageMap.has(msg.id)
      const isDuplicateByClientMsgId = msg.client_msg_id && seenClientMsgIds.has(msg.client_msg_id)

      if (!isDuplicateById && !isDuplicateByClientMsgId) {
        messageMap.set(msg.id, msg)
        if (msg.client_msg_id) {
          seenClientMsgIds.add(msg.client_msg_id)
        }
      }
    })

    // Sort by seq number (backend-controlled chronology)
    // EXPERT FIX: Handle messages without seq (optimistic) - put them at the end
    return Array.from(messageMap.values())
      .sort((a, b) => {
        const seqA = a.seq ?? Number.MAX_SAFE_INTEGER
        const seqB = b.seq ?? Number.MAX_SAFE_INTEGER
        return seqA - seqB
      })
  }, [historyMessages, liveMessages])

  // Send message mutation with retry limits
  const sendMessageMutation = useMutation({
    mutationFn: async (request: SendMessageRequest) => {
      // EXPERT FIX: Generate client_msg_id as pure UUID (backend schema requires UUID format)
      const clientMsgId = request.client_msg_id || crypto.randomUUID()
      
      // EXPERT FIX: Create optimistic message without seq (no client-side seq management)
      const optimisticMessage: PersistentChatMessage = {
        id: clientMsgId, // Temporary ID
        // seq: ❌ EXPERT FIX: Don't set seq - backend controls this, dedupe via client_msg_id only
        project_id: request.project_id,
        // EXPERT FIX: Use real userId for optimistic messages (fixes "my messages" logic)
        user_id: user?.id || 'unknown',
        message_type: request.message_type || 'user',
        text: request.text,
        target: request.target || 'team',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client_msg_id: clientMsgId
      } as PersistentChatMessage // Type assertion since we're omitting seq
      
      // Add optimistic message immediately
      optimisticallyAddMessage(optimisticMessage)
      
      try {
        const result = await persistentChatClient.sendMessage({
          ...request,
          client_msg_id: clientMsgId,
          mode: request.mode || 'unified' // Ensure mode is always present
        })
        
        // Remove optimistic message and let live events or refetch handle the real one
        removeOptimisticMessage(clientMsgId)
        
        return result
      } catch (error) {
        // Remove failed optimistic message
        removeOptimisticMessage(clientMsgId)
        throw error
      }
    },
    retry: 2, // Maximum 2 retries to prevent infinite loops
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 5000), // Max 5s delay
    onSuccess: (data) => {
      logger.info('Message sent successfully:', data)
      // Don't manually add to cache - let SSE events or next refetch handle it
    },
    onError: (error) => {
      logger.error('Failed to send message (will not retry infinitely):', error)
    }
  })

  // NEW: Unified message mutation for build/plan mode
  const sendUnifiedMessageMutation = useMutation({
    mutationFn: async (request: UnifiedChatRequest) => {
      // EXPERT FIX: Generate client_msg_id as pure UUID (backend schema requires UUID format)
      const clientMsgId = request.client_msg_id || crypto.randomUUID()
      
      // EXPERT FIX: Create optimistic message without seq (no client-side seq management)
      const optimisticMessage: PersistentChatMessage = {
        id: clientMsgId,
        // seq: ❌ EXPERT FIX: Don't set seq - backend controls this, dedupe via client_msg_id only
        project_id: request.projectId,
        user_id: request.userId,
        message_type: 'user',
        text: request.message,
        target: 'ai',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client_msg_id: clientMsgId
      } as PersistentChatMessage // Type assertion since we're omitting seq
      
      // Add optimistic message immediately
      optimisticallyAddMessage(optimisticMessage)
      
      try {
        const result = await persistentChatClient.sendUnifiedMessage({
          ...request,
          client_msg_id: clientMsgId
        })
        
        // Remove optimistic message and let live events or refetch handle the real one
        removeOptimisticMessage(clientMsgId)
        
        return result
      } catch (error) {
        // Remove failed optimistic message
        removeOptimisticMessage(clientMsgId)
        throw error
      }
    },
    retry: 2, // Maximum 2 retries to prevent infinite loops
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 5000), // Max 5s delay
    onSuccess: (data) => {
      logger.info('Unified message sent successfully:', data)
    },
    onError: (error) => {
      logger.error('Failed to send unified message (will not retry infinitely):', error)
    }
  })

  // Update presence mutation with retry limits  
  const updatePresenceMutation = useMutation({
    mutationFn: (request: UpdatePresenceRequest) => 
      persistentChatClient.updatePresence(request),
    retry: 1, // Only 1 retry for presence updates (less critical)
    retryDelay: 2000, // Fixed 2s delay for presence
    onError: (error) => {
      logger.error('Failed to update presence (limited retries):', error)
    }
  })

  // Mark as read mutation - RE-ENABLED with strict retry limits
  const markAsReadMutation = useMutation({
    mutationFn: async (request: MarkReadRequest) => {
      logger.debug('api', 'markAsRead call - backend endpoint available', { request })
      return await persistentChatClient.markAsRead(request)
    },
    retry: 2, // Maximum 2 retries to prevent infinite loops
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 5000), // Max 5s delay
    onError: (error) => {
      logger.error('Failed to mark as read (will not retry infinitely):', error)
    }
  })

  // UPDATED: Helper functions with unified endpoint support
  // EXPERT FIX: Added optional client_msg_id parameter for recommendation tracking
  const sendMessage = useCallback((
    text: string,
    target: 'team' | 'ai' = 'team',
    messageType: 'user' | 'assistant' = 'user',
    buildImmediately?: boolean,
    clientMsgId?: string  // EXPERT FIX: Thread client_msg_id for recommendation correlation
  ) => {
    // Use unified endpoint for AI messages with build mode specification
    if (target === 'ai' && typeof buildImmediately === 'boolean') {
      return sendUnifiedMessageMutation.mutateAsync({
        message: text,
        buildImmediately,
        userId: user?.id || '',
        projectId,
        client_msg_id: clientMsgId  // EXPERT FIX: Pass through client_msg_id
      })
    }

    // Fallback to legacy endpoint for team messages or when buildImmediately not specified
    return sendMessageMutation.mutateAsync({
      project_id: projectId,
      text,
      target,
      message_type: messageType,
      mode: target === 'ai' ? (buildImmediately ? 'build' : 'plan') : 'unified',
      client_msg_id: clientMsgId  // EXPERT FIX: Pass through client_msg_id
    })
  }, [projectId, sendMessageMutation, sendUnifiedMessageMutation, user])

  const updatePresence = useCallback((status: 'online' | 'typing' | 'away' | 'offline', activity?: string) => {
    return updatePresenceMutation.mutateAsync({
      project_id: projectId,
      status,
      activity
    })
  }, [projectId, updatePresenceMutation])

  const markAsRead = useCallback((readUpToSeq: number) => {
    return markAsReadMutation.mutateAsync({
      project_id: projectId,
      read_up_to_seq: readUpToSeq
    })
  }, [projectId, markAsReadMutation])

  // Get latest message sequence number for read status
  // EXPERT FIX: Handle undefined seq from optimistic messages to prevent NaN
  const latestSeq = useMemo(() => {
    let max = 0
    for (const m of allMessages) {
      const s = typeof m.seq === 'number' ? m.seq : 0
      if (s > max) max = s
    }
    return max
  }, [allMessages])

  // Mark all messages as read
  const markAllAsRead = useCallback(() => {
    if (latestSeq > 0) {
      return markAsRead(latestSeq)
    }
  }, [latestSeq, markAsRead])

  // Calculate unread messages (expert recommendation: server-authoritative last_read_seq bootstrap)
  const { unreadMessages, unreadCount, lastReadSeq } = useMemo(() => {
    // Use user from top-level hook call (no hook inside useMemo)
    if (!user || !readStatuses || readStatuses.length === 0) {
      return {
        unreadMessages: [],
        unreadCount: 0,
        lastReadSeq: 0
      }
    }

    // Find current user's read status
    const userReadStatus = readStatuses.find(status => status.user_id === user.id)
    const lastReadSeq = userReadStatus?.read_up_to_seq || 0

    // Filter messages that are after the last read sequence
    // EXPERT FIX: Handle undefined seq (treat as 0, so they're never marked unread)
    const unreadMessages = allMessages.filter(message => {
      const seq = typeof message.seq === 'number' ? message.seq : 0
      return seq > lastReadSeq
    })

    return {
      unreadMessages,
      unreadCount: unreadMessages.length,
      lastReadSeq
    }
  }, [allMessages, readStatuses, user])

  // Throttled mark as read to prevent excessive API calls - FIXED: Remove query invalidation loop
  const throttledMarkAsRead = useCallback(
    debounce((readUpToSeq: number) => {
      markAsRead(readUpToSeq)
      // REMOVED: queryClient.invalidateQueries to prevent infinite retry loops
      // Read status will be updated via normal stale time or manual refetch if needed
    }, 1500), // 1.5 second throttle
    [markAsRead, projectId]
  )

  return {
    // Combined message data
    messages: allMessages,
    totalCount,

    // EXPERT FIX ROUND 3: Expose liveMessages for downstream processors
    // This prevents mounting usePersistentLive twice
    liveMessages, // NEW: Raw SSE messages for recommendation action tracking

    // Presence data
    presenceInfo,

    // Connection status
    connectionStatus,
    isConnected,
    isConnecting,
    isDisconnected,
    hasConnectionError,

    // Pagination
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,

    // Loading states
    isLoadingHistory,
    isFetchingHistory,
    // EXPERT FIX ROUND 5: Include both mutations (unified sends were ignored)
    isSendingMessage: sendMessageMutation.isPending || sendUnifiedMessageMutation.isPending,
    isUpdatingPresence: updatePresenceMutation.isPending,

    // Error states
    isHistoryError,
    historyError,
    sendError: sendMessageMutation.error,
    presenceError: updatePresenceMutation.error,

    // Actions
    sendMessage,
    updatePresence,
    markAsRead,
    markAllAsRead,

    // Read status and unread functionality (Expert Phase 2: server-authoritative bootstrap)
    unreadMessages,
    unreadCount,
    lastReadSeq,
    throttledMarkAsRead,
    readStatuses,
    isLoadingReadStatus,

    // Connection management
    reconnect: reconnectLive,
    disconnect: disconnectLive,
    isLeader, // NEW: Indicates if this tab is the SSE leader (leader-tab pattern)

    // Cache management
    refetchHistory,
    invalidateHistory,
    clearLiveMessages,

    // Utilities
    latestSeq
  }
}