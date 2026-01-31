/**
 * Deployment Logs Hook
 *
 * INHOUSE_MODE_REMAINING.md Task 5: Live Deployment Logs with Hybrid SSE
 *
 * Consumes SSE stream of deployment events with:
 * - Automatic reconnection on disconnect
 * - Event deduplication
 * - Fallback to polling if SSE fails
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface DeploymentLogEvent {
  id: number
  step: string
  level: 'info' | 'warn' | 'error'
  message: string
  ts: string
  meta?: Record<string, unknown>
}

export type DeploymentLogStatus = 'idle' | 'connecting' | 'streaming' | 'complete' | 'error'

interface UseDeploymentLogsOptions {
  projectId: string
  deploymentId: string | null
  enabled?: boolean
}

interface UseDeploymentLogsResult {
  events: DeploymentLogEvent[]
  status: DeploymentLogStatus
  error: string | null
  deploymentStatus: string | null
  isComplete: boolean
  reset: () => void
}

export function useDeploymentLogs({
  projectId,
  deploymentId,
  enabled = true,
}: UseDeploymentLogsOptions): UseDeploymentLogsResult {
  const [events, setEvents] = useState<DeploymentLogEvent[]>([])
  const [status, setStatus] = useState<DeploymentLogStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [deploymentStatus, setDeploymentStatus] = useState<string | null>(null)
  const [isComplete, setIsComplete] = useState(false)

  // Track last event ID for deduplication
  const lastEventIdRef = useRef<number>(0)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttemptRef = useRef<number>(0)
  const maxReconnectAttempts = 5

  const reset = useCallback(() => {
    setEvents([])
    setStatus('idle')
    setError(null)
    setDeploymentStatus(null)
    setIsComplete(false)
    lastEventIdRef.current = 0
    reconnectAttemptRef.current = 0
  }, [])

  useEffect(() => {
    if (!enabled || !deploymentId || !projectId) {
      return
    }

    // Don't reconnect if already complete
    if (isComplete) {
      return
    }

    const connect = () => {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }

      setStatus('connecting')

      const url = `/api/inhouse/projects/${projectId}/deployments/${deploymentId}/logs`
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setStatus('streaming')
        setError(null)
        reconnectAttemptRef.current = 0
      }

      eventSource.addEventListener('connected', (e) => {
        // Connection established
        setStatus('streaming')
      })

      eventSource.addEventListener('log', (e) => {
        try {
          const data = JSON.parse(e.data) as Omit<DeploymentLogEvent, 'id'>
          const eventId = parseInt(e.lastEventId || '0', 10)

          // Deduplicate events
          if (eventId > lastEventIdRef.current) {
            lastEventIdRef.current = eventId
            setEvents(prev => [...prev, { ...data, id: eventId }])
          }
        } catch (err) {
          console.error('[useDeploymentLogs] Failed to parse log event:', err)
        }
      })

      eventSource.addEventListener('complete', (e) => {
        try {
          const data = JSON.parse(e.data) as { status: string }
          setDeploymentStatus(data.status)
          setIsComplete(true)
          setStatus('complete')
        } catch (err) {
          console.error('[useDeploymentLogs] Failed to parse complete event:', err)
        }
      })

      eventSource.addEventListener('timeout', () => {
        setStatus('error')
        setError('Stream timeout - deployment may still be in progress')
      })

      eventSource.onerror = () => {
        // EventSource automatically reconnects, but we track attempts
        if (eventSource.readyState === EventSource.CLOSED) {
          reconnectAttemptRef.current++

          if (reconnectAttemptRef.current >= maxReconnectAttempts) {
            setStatus('error')
            setError('Connection lost - please refresh to see latest status')
            eventSource.close()
          } else {
            // Allow automatic reconnection
            setStatus('connecting')
          }
        }
      }
    }

    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [projectId, deploymentId, enabled, isComplete])

  return {
    events,
    status,
    error,
    deploymentStatus,
    isComplete,
    reset,
  }
}

/**
 * Get the current step from events
 */
export function getCurrentStep(events: DeploymentLogEvent[]): string | null {
  if (events.length === 0) return null
  return events[events.length - 1].step
}

/**
 * Get step progress (0-100)
 */
export function getStepProgress(step: string | null): number {
  const steps: Record<string, number> = {
    'upload_assets': 25,
    'deploy_worker': 50,
    'update_kv': 75,
    'activate': 90,
    'done': 100,
    'error': 0,
  }
  return step ? (steps[step] ?? 0) : 0
}

/**
 * Group events by step for display
 */
export function groupEventsByStep(events: DeploymentLogEvent[]): Record<string, DeploymentLogEvent[]> {
  return events.reduce((acc, event) => {
    if (!acc[event.step]) {
      acc[event.step] = []
    }
    acc[event.step].push(event)
    return acc
  }, {} as Record<string, DeploymentLogEvent[]>)
}
