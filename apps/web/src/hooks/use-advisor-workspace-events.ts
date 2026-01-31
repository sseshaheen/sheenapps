/**
 * Advisor Workspace Events Hook
 *
 * Listens for advisor workspace provisioning events via SSE.
 * Uses SSEConnectionManager singleton for proper connection management.
 *
 * Event Structure (from ADVISOR_MATCHING_API_GUIDE.md):
 * {
 *   event: 'advisor.workspace_ready',
 *   data: {
 *     matchId: string,
 *     advisorId: string,
 *     projectId: string,
 *     timestamp: string
 *   }
 * }
 *
 * Following CLAUDE.md patterns:
 * - Uses SSEConnectionManager singleton (prevents connection thrashing)
 * - Proper cleanup with ref counting
 * - TypeScript event types
 */

'use client'

import { useEffect, useCallback, useRef } from 'react'
import { SSEConnectionManager, EventPayload, ConnectionStatus } from '@/services/sse-connection-manager'
import { logger } from '@/utils/logger'

export interface WorkspaceReadyEvent {
  matchId: string
  advisorId: string
  projectId: string
  timestamp: string
}

export interface UseAdvisorWorkspaceEventsProps {
  projectId: string
  userId?: string
  onWorkspaceReady?: (event: WorkspaceReadyEvent) => void
  enabled?: boolean
}

/**
 * Hook to listen for advisor workspace provisioning events
 *
 * Usage:
 * ```typescript
 * useAdvisorWorkspaceEvents({
 *   projectId,
 *   onWorkspaceReady: (event) => {
 *     showNotification('Your advisor has joined!')
 *     refreshAdvisorList()
 *   }
 * })
 * ```
 */
export function useAdvisorWorkspaceEvents({
  projectId,
  userId,
  onWorkspaceReady,
  enabled = true
}: UseAdvisorWorkspaceEventsProps) {
  const managerRef = useRef<SSEConnectionManager | null>(null)
  const didReleaseRef = useRef(false)
  const connectionStatusRef = useRef<ConnectionStatus>({ state: 'disconnected' })
  const subscriberIdRef = useRef(crypto.randomUUID())

  const handleMessage = useCallback((payload: EventPayload) => {
    try {
      const data = payload.data

      // Only handle advisor.workspace_ready events
      // SSE events come as { event: 'advisor.workspace_ready', data: {...} }
      if (data?.event !== 'advisor.workspace_ready') {
        return
      }

      // Extract event data
      const eventData: WorkspaceReadyEvent = {
        matchId: data.data?.matchId || data.matchId,
        advisorId: data.data?.advisorId || data.advisorId,
        projectId: data.data?.projectId || data.projectId,
        timestamp: data.data?.timestamp || data.timestamp || new Date().toISOString()
      }

      logger.info('Advisor workspace ready event received', eventData)

      // Trigger callback
      onWorkspaceReady?.(eventData)

      // Show browser notification if permission granted
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification('Advisor Ready!', {
            body: 'Your advisor has joined the workspace and is ready to help',
            icon: '/sheenapps-logo-trans--min.png',
            tag: `advisor-ready-${eventData.advisorId}`
          })
        }
      }
    } catch (error) {
      logger.error('Failed to parse workspace ready event', { error, eventData: payload.data })
    }
  }, [onWorkspaceReady])

  const handleStatusChange = useCallback((status: ConnectionStatus) => {
    connectionStatusRef.current = status
    logger.info('Advisor events connection status changed', {
      status: status.state,
      projectId
    })
  }, [projectId])

  useEffect(() => {
    // Don't connect if disabled or missing required params
    if (!enabled || !projectId || !userId) {
      return
    }

    // Get or create singleton manager instance
    const manager = SSEConnectionManager.getInstance(projectId, userId)
    managerRef.current = manager
    didReleaseRef.current = false

    // Add ref count
    manager.addRef()

    // Subscribe with callbacks (new pattern)
    manager.subscribe({
      projectId,
      userId,
      onMessage: handleMessage,
      onStatusChange: handleStatusChange
    }, subscriberIdRef.current)

    // Connect if needed (only does expensive setup once)
    manager.connectIfNeeded()

    logger.info('Advisor events hook subscribed to SSEConnectionManager', {
      projectId,
      subscriberId: subscriberIdRef.current,
      userId: userId.substring(0, 8)
    })

    // Cleanup on unmount or dependency change
    return () => {
      // Guard against double-release
      if (didReleaseRef.current) return
      didReleaseRef.current = true

      logger.info('Advisor events hook unsubscribing from SSEConnectionManager', {
        projectId,
        subscriberId: subscriberIdRef.current
      })
      manager.unsubscribe(subscriberIdRef.current)
      manager.releaseRef()
      managerRef.current = null
    }
  }, [enabled, projectId, userId, handleMessage, handleStatusChange])

  return {
    isConnected: connectionStatusRef.current.state === 'connected'
  }
}

/**
 * Request browser notification permission
 */
export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return Promise.resolve('denied')
  }

  if (Notification.permission === 'granted') {
    return Promise.resolve('granted')
  }

  if (Notification.permission === 'denied') {
    return Promise.resolve('denied')
  }

  return Notification.requestPermission()
}