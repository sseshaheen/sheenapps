/**
 * Persistent Chat Live Events Hook
 * Manages SSE connection for real-time chat updates via leader-tab pattern
 *
 * CRITICAL: Separate state from React Query to avoid cache conflicts
 *
 * Implementation of SSE_ARCHITECTURE_ANALYSIS.md
 * Uses SSEConnectionManager for leader election + BroadcastChannel
 */

'use client'

/* eslint-disable no-restricted-globals */

import { useEffect, useRef, useState, useCallback } from 'react'
import { PersistentChatMessage, PresenceInfo } from '@/services/persistent-chat-client'
import { logger } from '@/utils/logger'
import { SSEConnectionManager, ConnectionStatus as ManagerConnectionStatus, EventPayload } from '@/services/sse-connection-manager'

export type LiveEventType = 'message' | 'presence' | 'system' | 'connection_status'

export interface LiveEvent {
  type: LiveEventType
  data: any
  timestamp: string
}

export interface ConnectionStatus {
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  error?: string
  isLeader?: boolean
  activeConnections?: number
  retryCount?: number
}

/**
 * EXPERT FIX: Transform function for backend message format
 * Backend team corrected specs - expert was right about nested structure!
 */
const transformBackendMessage = (backendData: any, projectId: string): PersistentChatMessage => {
  return {
    id: backendData.messageId,                    // Backend ACTUAL: "messageId" 
    seq: backendData.seq,
    text: backendData.content.text,               // Backend ACTUAL: "content.text"
    message_type: backendData.content.type,       // Backend ACTUAL: "content.type" 
    target: (backendData.content.mode === 'ai' || backendData.content.actor_type === 'ai') ? 'ai' : 'team',
    user_id: backendData.userId,                  // Backend ACTUAL: "userId"
    project_id: projectId,                        // Added from context
    client_msg_id: backendData.client_msg_id,
    created_at: backendData.timestamp,            // Backend ACTUAL: "timestamp"
    updated_at: backendData.timestamp,
    // Store additional backend metadata in response_data
    response_data: {
      build_id: backendData.metadata?.build_id,    // Backend ACTUAL: "metadata.build_id"
      original_response_data: backendData.metadata?.response_data, // Backend ACTUAL: "metadata.response_data"
      mode: backendData.content.mode,               // Backend ACTUAL: "content.mode"
      actor_type: backendData.content.actor_type   // Backend ACTUAL: "content.actor_type"
    }
  }
}

interface UsePersistentLiveOptions {
  projectId: string
  userId: string // Required for SSEConnectionManager
  enabled?: boolean
  onMessage?: (message: PersistentChatMessage) => void
  onPresenceUpdate?: (presence: PresenceInfo[]) => void
  onSystemMessage?: (message: any) => void
  onConnectionStatusChange?: (status: ConnectionStatus) => void
}

/**
 * Hook for persistent chat live events via SSE
 * Uses SSEConnectionManager for leader-tab pattern (one SSE per browser instance)
 *
 * Key improvements from SSE_ARCHITECTURE_ANALYSIS.md:
 * - Leader election via Web Locks API (with localStorage fallback)
 * - BroadcastChannel for cross-tab message sharing
 * - Only leader tab holds EventSource, followers receive via broadcast
 * - Heartbeat + timeout for crash recovery
 */
export function usePersistentLive({
  projectId,
  userId,
  enabled = true,
  onMessage,
  onPresenceUpdate,
  onSystemMessage,
  onConnectionStatusChange
}: UsePersistentLiveOptions) {
  // EXPERT FIX: Guard against double-release
  const didReleaseRef = useRef(false)
  const managerRef = useRef<SSEConnectionManager | null>(null)

  // Use refs for callback props to prevent recreation cycles
  const onMessageRef = useRef(onMessage)
  const onPresenceUpdateRef = useRef(onPresenceUpdate)
  const onSystemMessageRef = useRef(onSystemMessage)
  const onConnectionStatusChangeRef = useRef(onConnectionStatusChange)

  // EXPERT FIX: Immediate connection for test stability
  const isTestMode = process.env.NEXT_PUBLIC_TEST_E2E === '1' || process.env.NODE_ENV === 'test'

  // Generate stable subscriber ID (must be before callbacks)
  const subscriberIdRef = useRef(crypto.randomUUID())

  // Update refs when props change
  useEffect(() => {
    onMessageRef.current = onMessage
    onPresenceUpdateRef.current = onPresenceUpdate
    onSystemMessageRef.current = onSystemMessage
    onConnectionStatusChangeRef.current = onConnectionStatusChange
  }, [onMessage, onPresenceUpdate, onSystemMessage, onConnectionStatusChange])

  // Live events state (separate from React Query cache)
  const [liveMessages, setLiveMessages] = useState<PersistentChatMessage[]>([])
  const [presenceInfo, setPresenceInfo] = useState<PresenceInfo[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: isTestMode ? 'connected' : 'disconnected'
  })

  /**
   * Handle events from SSEConnectionManager (normalized EventPayload)
   * CRITICAL FIX: Use stable wrapper with ref to prevent stale callbacks
   */
  const handleEventPayloadImpl = useCallback((payload: EventPayload) => {
    if (payload.parseError) {
      logger.warn('SSE parse error, raw data:', payload.raw)
      return
    }

    const liveEvent = payload.data as LiveEvent
    if (!liveEvent || !liveEvent.type) {
      logger.debug('persistent-chat', 'Received non-LiveEvent data', payload.data)
      return
    }

    logger.debug('persistent-chat', 'Received live event', {
      type: liveEvent.type,
      projectId,
      timestamp: liveEvent.timestamp
    })

    // EXPERT FIX: Wrap each case in blocks to prevent variable redeclaration issues
    switch (liveEvent.type) {
      case 'message': {
        // Transform backend message format
        const message = transformBackendMessage(liveEvent.data, projectId)
        setLiveMessages(prev => {
          // Deduplicate by message ID
          const existing = prev.find(m => m.id === message.id)
          if (existing) return prev
          return [...prev, message]
        })
        onMessageRef.current?.(message)
        break
      }

      case 'presence': {
        const presence = liveEvent.data as PresenceInfo[]
        setPresenceInfo(presence)
        onPresenceUpdateRef.current?.(presence)
        break
      }

      case 'system': {
        onSystemMessageRef.current?.(liveEvent.data)
        break
      }

      case 'connection_status': {
        setConnectionStatus(prev => ({
          ...prev,
          isLeader: liveEvent.data.is_leader,
          activeConnections: liveEvent.data.active_connections
        }))
        break
      }

      default: {
        logger.warn('Unknown live event type:', liveEvent.type)
      }
    }
  }, [projectId])

  // Store implementation in ref so wrapper always calls latest version
  const handleEventPayloadImplRef = useRef(handleEventPayloadImpl)
  useEffect(() => {
    handleEventPayloadImplRef.current = handleEventPayloadImpl
  }, [handleEventPayloadImpl])

  // Stable wrapper function that never changes identity
  const handleEventPayload = useRef((payload: EventPayload) => {
    handleEventPayloadImplRef.current(payload)
  }).current

  /**
   * Handle status changes from SSEConnectionManager
   * CRITICAL FIX: Use stable wrapper with ref to prevent stale callbacks
   */
  const handleStatusChangeImpl = useCallback((status: ManagerConnectionStatus) => {
    logger.debug('use-persistent-live', `handleStatusChange: ${status.state} for project ${projectId}`)
    let newStatus: ConnectionStatus

    // EXPERT FIX: Wrap each case in blocks to prevent variable redeclaration issues
    switch (status.state) {
      case 'connected': {
        newStatus = {
          status: 'connected',
          isLeader: status.isLeader,
          error: undefined
        }
        break
      }
      case 'connecting': {
        newStatus = {
          status: 'connecting',
          error: undefined
        }
        break
      }
      case 'disconnected': {
        newStatus = {
          status: 'disconnected',
          error: undefined
        }
        break
      }
      case 'error': {
        newStatus = {
          status: 'error',
          error: status.error,
          retryCount: status.retryIn ? Math.floor(status.retryIn / 1000) : undefined
        }
        break
      }
    }

    logger.debug('use-persistent-live', `Setting connection status to: ${newStatus.status}`)
    setConnectionStatus(newStatus)
    onConnectionStatusChangeRef.current?.(newStatus)
  }, [projectId])

  // Store implementation in ref so wrapper always calls latest version
  const handleStatusChangeImplRef = useRef(handleStatusChangeImpl)
  useEffect(() => {
    handleStatusChangeImplRef.current = handleStatusChangeImpl
  }, [handleStatusChangeImpl])

  // Stable wrapper function that never changes identity
  const handleStatusChange = useRef((status: ManagerConnectionStatus) => {
    logger.debug('use-persistent-live', `Stable wrapper called for subscriber ${subscriberIdRef.current}`)
    handleStatusChangeImplRef.current(status)
  }).current

  // Stamp callback with subscriber ID for debugging (as expert suggested)
  useEffect(() => {
    (handleStatusChange as any).__subscriberId = subscriberIdRef.current
  }, [handleStatusChange])

  /**
   * Clear live messages (useful when switching projects)
   */
  const clearLiveMessages = useCallback(() => {
    setLiveMessages([])
    setPresenceInfo([])
  }, [])

  /**
   * Manually trigger reconnection
   */
  const forceReconnect = useCallback(() => {
    logger.debug('use-persistent-live', `forceReconnect called (status: ${connectionStatus.status})`)
    managerRef.current?.forceReconnect()
  }, [connectionStatus.status])

  // Main connection effect using SSEConnectionManager
  // CRITICAL: handleEventPayload and handleStatusChange are stable refs, don't add to deps
  useEffect(() => {
    // Guard: need both projectId and userId
    if (!enabled || !projectId || !userId) {
      setConnectionStatus({ status: 'disconnected' })
      return
    }

    // Test mode: skip actual connection
    if (isTestMode) {
      logger.info('TEST_E2E mode: Skipping SSE connection, simulating connected state')
      setConnectionStatus({ status: 'connected', isLeader: true })
      return
    }

    logger.debug('use-persistent-live', `Setting up connection for project ${projectId}, subscriber ${subscriberIdRef.current}`)

    // Get or create manager instance
    const manager = SSEConnectionManager.getInstance(projectId, userId)
    managerRef.current = manager
    didReleaseRef.current = false

    // Add ref count
    manager.addRef()

    // Subscribe with stable callbacks (refs that never change identity)
    manager.subscribe(
      {
        projectId,
        userId,
        onMessage: handleEventPayload,
        onStatusChange: handleStatusChange
      },
      subscriberIdRef.current
    )

    // Connect if needed (only does expensive setup once)
    manager.connectIfNeeded()

    // Cleanup on unmount or dependency change
    return () => {
      // EXPERT FIX: Guard against double-release
      if (didReleaseRef.current) return
      didReleaseRef.current = true

      logger.debug('use-persistent-live', `Cleaning up connection for subscriber ${subscriberIdRef.current}`)

      manager.unsubscribe(subscriberIdRef.current)
      manager.releaseRef()
      managerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectId, userId, isTestMode])

  return {
    // Live data (separate from React Query cache)
    liveMessages,
    presenceInfo,
    connectionStatus,

    // Actions
    disconnect: () => managerRef.current?.disconnect(),
    reconnect: forceReconnect,
    clearLiveMessages,

    // Status helpers
    isConnected: connectionStatus.status === 'connected',
    isConnecting: connectionStatus.status === 'connecting',
    isDisconnected: connectionStatus.status === 'disconnected',
    hasError: connectionStatus.status === 'error',
    isLeader: connectionStatus.isLeader ?? false
  }
}
