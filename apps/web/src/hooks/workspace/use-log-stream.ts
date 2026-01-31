/**
 * Workspace Log Stream Hook
 *
 * Real-time log streaming using expert-validated SSE patterns
 * Reuses robust patterns from usePersistentLive
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { logger } from '@/utils/logger'

interface LogEvent {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  tier: 'system' | 'application' | 'build' | 'deploy'
  message: string
  metadata?: Record<string, any>
}

interface ConnectionStatus {
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  error?: string
  retryCount?: number
}

interface UseLogStreamOptions {
  enabled?: boolean
}

interface UseLogStreamReturn {
  logs: LogEvent[]
  connectionStatus: ConnectionStatus
  isConnected: boolean
  connect: () => void
  disconnect: () => void
  reconnect: () => void
  clearLogs: () => void
}

// Memory cap: Expert pattern (4000 lines max to prevent memory creep)
const MAX_LOG_LINES = 4000

export function useLogStream(
  projectId: string,
  advisorId: string,
  options: UseLogStreamOptions = {}
): UseLogStreamReturn {
  const { enabled = true } = options

  const [logs, setLogs] = useState<LogEvent[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'disconnected'
  })

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const retryCountRef = useRef(0)
  const maxRetries = 5
  const baseRetryDelay = 1000 // 1 second

  // Update connection status
  const updateConnectionStatus = useCallback((status: Partial<ConnectionStatus>) => {
    setConnectionStatus(prev => ({ ...prev, ...status }))
  }, [])

  // Handle SSE message event
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      if (event.type === 'log') {
        const logEvent: LogEvent = JSON.parse(event.data)

        setLogs(prev => {
          // Deduplicate by log ID
          const existing = prev.find(log => log.id === logEvent.id)
          if (existing) return prev

          // Add new log and apply memory cap
          const updated = [...prev, logEvent]
          return updated.length > MAX_LOG_LINES ? updated.slice(-MAX_LOG_LINES) : updated
        })

        logger.debug('workspace-log-stream', 'Log event received', {
          logId: logEvent.id,
          level: logEvent.level,
          tier: logEvent.tier
        })
      } else if (event.type === 'connection_status') {
        const statusData = JSON.parse(event.data)
        updateConnectionStatus({
          status: 'connected',
          ...statusData
        })
      }
    } catch (error) {
      logger.error('Error parsing SSE event', { error }, 'workspace-log-stream')
    }
  }, [updateConnectionStatus])

  // Handle SSE connection open
  const handleOpen = useCallback(() => {
    logger.info('Log stream connected', { projectId, advisorId }, 'workspace-log-stream')
    retryCountRef.current = 0
    updateConnectionStatus({
      status: 'connected',
      error: undefined,
      retryCount: 0
    })
  }, [projectId, advisorId, updateConnectionStatus])

  // Handle SSE connection error
  const handleError = useCallback((error: Event) => {
    logger.error('Log stream error', { projectId, advisorId, error }, 'workspace-log-stream')
    updateConnectionStatus({
      status: 'error',
      error: 'Connection error',
      retryCount: retryCountRef.current
    })
  }, [projectId, advisorId, updateConnectionStatus])

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (!enabled || !projectId || !advisorId) return
    if (eventSourceRef.current) return // Already connected

    logger.info('Connecting to log stream', { projectId, advisorId }, 'workspace-log-stream')
    updateConnectionStatus({ status: 'connecting' })

    try {
      const params = new URLSearchParams({
        project_id: projectId,
        advisor_id: advisorId
      })

      const eventSource = new EventSource(`/api/workspace/logs/stream?${params}`)

      eventSource.addEventListener('message', handleMessage)
      eventSource.addEventListener('log', handleMessage)
      eventSource.addEventListener('connection_status', handleMessage)
      eventSource.addEventListener('open', handleOpen)
      eventSource.addEventListener('error', handleError)

      eventSourceRef.current = eventSource
    } catch (error) {
      logger.error('Failed to create SSE connection', { error }, 'workspace-log-stream')
      updateConnectionStatus({
        status: 'error',
        error: error instanceof Error ? error.message : 'Connection failed'
      })
    }
  }, [enabled, projectId, advisorId, handleMessage, handleOpen, handleError, updateConnectionStatus])

  // Disconnect from SSE stream
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      logger.info('Disconnecting from log stream', { projectId, advisorId }, 'workspace-log-stream')
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    updateConnectionStatus({ status: 'disconnected' })
  }, [projectId, advisorId, updateConnectionStatus])

  // Reconnect with exponential backoff
  const reconnect = useCallback(() => {
    if (retryCountRef.current >= maxRetries) {
      logger.error('Max reconnection attempts reached', { projectId, advisorId }, 'workspace-log-stream')
      updateConnectionStatus({
        status: 'error',
        error: 'Max reconnection attempts reached',
        retryCount: retryCountRef.current
      })
      return
    }

    const delay = baseRetryDelay * Math.pow(2, retryCountRef.current)
    retryCountRef.current++

    logger.info('Reconnecting to log stream', {
      projectId,
      advisorId,
      delay,
      attempt: retryCountRef.current
    }, 'workspace-log-stream')

    updateConnectionStatus({
      status: 'connecting',
      retryCount: retryCountRef.current
    })

    reconnectTimeoutRef.current = setTimeout(() => {
      disconnect()
      connect()
    }, delay)
  }, [projectId, advisorId, connect, disconnect, updateConnectionStatus])

  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([])
    logger.info('Logs cleared', { projectId, advisorId }, 'workspace-log-stream')
  }, [projectId, advisorId])

  // Force reconnect (reset retry count)
  const forceReconnect = useCallback(() => {
    retryCountRef.current = 0
    disconnect()
    setTimeout(connect, 100) // Small delay for clean disconnect
  }, [connect, disconnect])

  // Connect/disconnect based on enabled state
  useEffect(() => {
    if (enabled && projectId && advisorId) {
      connect()
    } else {
      disconnect()
    }
    return () => disconnect()
  }, [enabled, projectId, advisorId, connect, disconnect])

  // Handle connection state changes for auto-reconnect
  useEffect(() => {
    if (!enabled || !projectId || !advisorId) return

    const eventSource = eventSourceRef.current
    if (eventSource) {
      const stateCheckInterval = setInterval(() => {
        if (eventSource.readyState === EventSource.CLOSED && enabled) {
          logger.warn('workspace-log-stream', 'Connection closed, attempting reconnect')
          reconnect()
        }
      }, 5000)

      return () => clearInterval(stateCheckInterval)
    }
  }, [enabled, projectId, advisorId, reconnect])

  return {
    logs,
    connectionStatus,
    isConnected: connectionStatus.status === 'connected',
    connect,
    disconnect,
    reconnect: forceReconnect,
    clearLogs
  }
}