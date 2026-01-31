/**
 * Real-time GitHub Sync Updates Hook
 * Subscribes to SSE events for GitHub sync operations via SSEConnectionManager singleton
 * Provides real-time status updates for sync operations
 */

'use client'

import { useEffect, useRef, useCallback } from 'react'
import { SSEConnectionManager, EventPayload, ConnectionStatus } from '@/services/sse-connection-manager'
import { useFeatureFlags } from '@/config/feature-flags'
import { useGitHubSyncStore } from '@/store/github-sync-store'
import { GitHubSyncOperation } from '@/types/github-sync'
import { logger } from '@/utils/logger'

interface GitHubSyncEvent {
  type: 'sync_started' | 'sync_progress' | 'sync_completed' | 'sync_failed' | 'sync_conflict'
  operation: GitHubSyncOperation
  timestamp: string
  data?: {
    progress_percentage?: number
    files_processed?: number
    total_files?: number
    current_file?: string
    conflict_files?: string[]
    error_message?: string
  }
}

interface UseGitHubSyncRealtimeOptions {
  projectId: string
  userId?: string
  enabled?: boolean
}

export function useGitHubSyncRealtime({
  projectId,
  userId,
  enabled = true
}: UseGitHubSyncRealtimeOptions) {
  const featureFlags = useFeatureFlags()
  const managerRef = useRef<SSEConnectionManager | null>(null)
  const didReleaseRef = useRef(false)
  const connectionStatusRef = useRef<ConnectionStatus>({ state: 'disconnected' })
  const subscriberIdRef = useRef(crypto.randomUUID())

  const {
    addOperation,
    updateOperation,
    setCurrentOperation,
    setSyncStatus,
    setError
  } = useGitHubSyncStore()

  const shouldConnect = enabled &&
    featureFlags.ENABLE_GITHUB_REALTIME &&
    featureFlags.ENABLE_GITHUB_SYNC &&
    projectId &&
    userId

  const handleSyncEvent = useCallback((event: GitHubSyncEvent) => {
    logger.info('GitHub sync event received', {
      type: event.type,
      operationId: event.operation.id,
      projectId
    })

    switch (event.type) {
      case 'sync_started':
        addOperation(event.operation)
        setCurrentOperation(event.operation)
        setSyncStatus('syncing')
        break

      case 'sync_progress':
        updateOperation(event.operation.id, {
          ...event.operation,
          metadata: {
            ...event.operation.metadata,
            ...event.data
          }
        })
        break

      case 'sync_completed':
        updateOperation(event.operation.id, {
          ...event.operation,
          status: 'completed',
          completed_at: event.timestamp
        })
        setSyncStatus('idle')

        // Clear current operation after a delay
        setTimeout(() => {
          setCurrentOperation(null)
        }, 3000)
        break

      case 'sync_failed':
        updateOperation(event.operation.id, {
          ...event.operation,
          status: 'failed',
          completed_at: event.timestamp,
          error_message: event.data?.error_message
        })
        setSyncStatus('error')
        setError({
          code: 'SYNC_OPERATION_FAILED',
          message: event.data?.error_message || 'Sync operation failed'
        })

        // Clear current operation
        setCurrentOperation(null)
        break

      case 'sync_conflict':
        updateOperation(event.operation.id, {
          ...event.operation,
          metadata: {
            ...event.operation.metadata,
            conflict_files: event.data?.conflict_files || []
          }
        })
        setSyncStatus('conflict')
        break

      default:
        logger.warn('Unknown GitHub sync event type', {
          type: event.type,
          operationId: event.operation.id
        })
    }
  }, [
    addOperation,
    updateOperation,
    setCurrentOperation,
    setSyncStatus,
    setError,
    projectId
  ])

  const handleMessage = useCallback((payload: EventPayload) => {
    try {
      const data = payload.data

      // Only handle github-sync events
      // SSE events come as { event: 'github-sync', data: {...} }
      if (data?.event !== 'github-sync') {
        return
      }

      // Parse and handle the GitHub sync event
      const syncEvent: GitHubSyncEvent = data.data || data
      handleSyncEvent(syncEvent)
    } catch (error) {
      logger.error('Failed to parse GitHub sync event', {
        error,
        eventData: payload.data
      })
    }
  }, [handleSyncEvent])

  const handleStatusChange = useCallback((status: ConnectionStatus) => {
    connectionStatusRef.current = status

    logger.info('GitHub sync connection status changed', {
      status: status.state,
      projectId
    })

    // Clear error on successful connection
    if (status.state === 'connected') {
      setError(null)
    } else if (status.state === 'error') {
      setError({
        code: 'REALTIME_CONNECTION_FAILED',
        message: status.error
      })
    }
  }, [projectId, setError])

  // Main connection effect
  useEffect(() => {
    if (!shouldConnect) {
      return
    }

    // Get or create singleton manager instance
    const manager = SSEConnectionManager.getInstance(projectId, userId!)
    managerRef.current = manager
    didReleaseRef.current = false

    // Add ref count
    manager.addRef()

    // Subscribe with callbacks (new pattern)
    manager.subscribe({
      projectId,
      userId: userId!,
      onMessage: handleMessage,
      onStatusChange: handleStatusChange
    }, subscriberIdRef.current)

    // Connect if needed (only does expensive setup once)
    manager.connectIfNeeded()

    logger.info('GitHub sync hook subscribed to SSEConnectionManager', {
      projectId,
      subscriberId: subscriberIdRef.current,
      userId: userId!.substring(0, 8)
    })

    // Cleanup on unmount or dependency change
    return () => {
      // Guard against double-release
      if (didReleaseRef.current) return
      didReleaseRef.current = true

      logger.info('GitHub sync hook unsubscribing from SSEConnectionManager', {
        projectId,
        subscriberId: subscriberIdRef.current
      })
      manager.unsubscribe(subscriberIdRef.current)
      manager.releaseRef()
      managerRef.current = null
    }
  }, [shouldConnect, projectId, userId, handleMessage, handleStatusChange])

  return {
    isConnected: connectionStatusRef.current.state === 'connected'
  }
}

/**
 * Simple hook for components that just need connection status
 */
export function useGitHubSyncConnection(projectId: string, userId?: string) {
  const { isConnected } = useGitHubSyncRealtime({
    projectId,
    userId,
    enabled: true
  })

  return isConnected
}

/**
 * Hook for managing real-time sync status in sync panels
 */
export function useGitHubSyncStatus(projectId: string, userId?: string) {
  const {
    currentOperation,
    syncStatus,
    operations,
    hasActiveOperation
  } = useGitHubSyncStore()

  const isConnected = useGitHubSyncConnection(projectId, userId)

  const getLatestOperation = useCallback(() => {
    return operations.find(op =>
      op.project_id === projectId &&
      (op.status === 'in_progress' || op.status === 'pending')
    ) || currentOperation
  }, [operations, currentOperation, projectId])

  const getRecentOperations = useCallback((limit = 5) => {
    return operations
      .filter(op => op.project_id === projectId)
      .slice(0, limit)
  }, [operations, projectId])

  return {
    isConnected,
    syncStatus,
    currentOperation,
    hasActiveOperation,
    latestOperation: getLatestOperation(),
    recentOperations: getRecentOperations()
  }
}