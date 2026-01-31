/**
 * Admin Logs SSE Hook
 * Real-time log streaming for active builds using Server-Sent Events
 * Includes automatic reconnection and connection management
 */

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { logger } from '@/utils/logger'

interface LogEntry {
  timestamp: string
  instanceId: string
  tier: string
  seq: number
  buildId?: string
  userId?: string
  projectId?: string
  event: string
  message: string
  metadata: Record<string, any>
}

interface SSEOptions {
  tier?: 'system' | 'build' | 'deploy' | 'action' | 'lifecycle'
  buildId?: string
  userId?: string
  projectId?: string
  instanceId?: string
  since?: string
  enabled?: boolean
  reconnectOnError?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
}

interface SSEState {
  logs: LogEntry[]
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  connectionId: string | null
  lastEventId: string | null
}

export function useAdminLogsSSE(options: SSEOptions) {
  const {
    tier = 'build',
    buildId,
    userId,
    projectId,
    instanceId,
    since,
    enabled = true,
    reconnectOnError = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5
  } = options

  const [state, setState] = useState<SSEState>({
    logs: [],
    isConnected: false,
    isConnecting: false,
    error: null,
    connectionId: null,
    lastEventId: null
  })

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const buildEventSourceUrl = useCallback(() => {
    const params = new URLSearchParams()

    if (tier) params.append('tier', tier)
    if (buildId) params.append('buildId', buildId)
    if (userId) params.append('userId', userId)
    if (projectId) params.append('projectId', projectId)
    if (instanceId) params.append('instanceId', instanceId)
    if (since) params.append('since', since)
    if (state.lastEventId) params.append('since', state.lastEventId)

    return `/api/admin/logs/stream-sse?${params.toString()}`
  }, [tier, buildId, userId, projectId, instanceId, since, state.lastEventId])

  const connect = useCallback(() => {
    if (!enabled || (!buildId && !projectId && !userId)) {
      return
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    setState(prev => ({
      ...prev,
      isConnecting: true,
      error: null
    }))

    const url = buildEventSourceUrl()
    logger.info('Establishing SSE connection', { url, options })

    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onopen = (event) => {
      logger.info('SSE connection opened', { url })
      setState(prev => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        error: null
      }))
      reconnectAttemptsRef.current = 0
    }

    eventSource.onmessage = (event) => {
      try {
        const logEntry: LogEntry = JSON.parse(event.data)

        // Handle special events
        if (logEntry.event === 'complete') {
          logger.info('SSE stream completed', { logEntry })
          eventSource.close()
          return
        }

        setState(prev => ({
          ...prev,
          logs: [...prev.logs, logEntry],
          lastEventId: event.lastEventId || logEntry.seq?.toString() || null
        }))

        logger.debug('api', 'SSE log entry received', {
          seq: logEntry.seq,
          message: logEntry.message.slice(0, 100)
        })

      } catch (parseError) {
        logger.error('Failed to parse SSE event data', {
          data: event.data.slice(0, 200),
          error: parseError
        })
      }
    }

    eventSource.onerror = (error) => {
      logger.error('SSE connection error', { error, url })

      setState(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: 'Connection error occurred'
      }))

      eventSource.close()

      // Auto-reconnect if enabled and under retry limit
      if (reconnectOnError && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++
        const delay = reconnectDelay * Math.pow(1.5, reconnectAttemptsRef.current - 1)

        logger.info('Scheduling SSE reconnect', {
          attempt: reconnectAttemptsRef.current,
          delay,
          maxAttempts: maxReconnectAttempts
        })

        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        setState(prev => ({
          ...prev,
          error: `Connection failed after ${maxReconnectAttempts} attempts`
        }))
      }
    }

    // Extract connection metadata from response headers when available
    const originalOnOpen = eventSource.onopen
    eventSource.onopen = (event) => {
      // Try to get connection info from custom headers (if browser supports it)
      const response = (event.target as any)?._response
      if (response) {
        const connectionId = response.headers?.get?.('x-connection-id')

        if (connectionId) {
          setState(prev => ({
            ...prev,
            connectionId: connectionId || prev.connectionId
          }))
        }
      }

      if (originalOnOpen) originalOnOpen.call(eventSource, event)
    }

  }, [enabled, buildId, projectId, userId, buildEventSourceUrl, reconnectOnError, reconnectDelay, maxReconnectAttempts])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      connectionId: null
    }))

    logger.info('SSE connection manually disconnected')
  }, [])

  const clearLogs = useCallback(() => {
    setState(prev => ({
      ...prev,
      logs: [],
      lastEventId: null
    }))
  }, [])

  // Connect when enabled and parameters are available
  useEffect(() => {
    if (enabled && (buildId || projectId || userId)) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [enabled, buildId, projectId, userId, connect, disconnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    logs: state.logs,
    isConnected: state.isConnected,
    isConnecting: state.isConnecting,
    error: state.error,
    connectionId: state.connectionId,
    lastEventId: state.lastEventId,
    connect,
    disconnect,
    clearLogs,
    reconnectAttempts: reconnectAttemptsRef.current
  }
}

// Specialized hook for build logs SSE
export function useBuildLogsSSE(buildId: string, enabled: boolean = true) {
  return useAdminLogsSSE({
    tier: 'build',
    buildId,
    enabled: enabled && !!buildId,
    reconnectOnError: true,
    maxReconnectAttempts: 3
  })
}

// Hook for system-wide logs SSE
export function useSystemLogsSSE(enabled: boolean = true) {
  return useAdminLogsSSE({
    tier: 'system',
    enabled,
    reconnectOnError: true,
    maxReconnectAttempts: 5
  })
}