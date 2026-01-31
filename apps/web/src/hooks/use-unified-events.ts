/**
 * Unified Events Hook
 * Manages SSE connection for real-time events with intelligent polling fallback
 *
 * Expert-hardened implementation with:
 * - Battle-tested SSE patterns from persistent chat
 * - Jittered exponential backoff
 * - Session storage persistence for hard refresh rehydration
 * - Heartbeat detection and auto-reconnection
 * - Graceful polling fallback when SSE fails
 * - Authentication error handling with re-auth flow
 */

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { UnifiedEventSchema, type UnifiedEvent, type ConnectionStatus } from '@/types/migration'
import { logger } from '@/utils/logger'

export interface UseUnifiedEventsParams {
  projectId?: string
  migrationId?: string
}

export interface UseUnifiedEventsReturn {
  events: UnifiedEvent[]
  connectionStatus: ConnectionStatus
  isConnected: boolean
  retry: () => void
}

/**
 * Hook for unified events via SSE with polling fallback
 * Manages connection lifecycle and event handling
 */
export function useUnifiedEvents({
  projectId,
  migrationId
}: UseUnifiedEventsParams): UseUnifiedEventsReturn {
  const [events, setEvents] = useState<UnifiedEvent[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')

  // Connection management refs
  const eventSourceRef = useRef<EventSource | null>(null)
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const retryCountRef = useRef(0)
  const lastIdRef = useRef<string | null>(null)
  const lastMessageRef = useRef(Date.now())
  const isPollingRef = useRef(false)
  const [requiresAuth, setRequiresAuth] = useState(false)

  // Configuration
  const maxRetries = 5
  const STORAGE_KEY = `unified-events-${projectId || migrationId}`

  // Expert: Persist last N events in sessionStorage for hard refresh rehydration
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsedEvents = JSON.parse(stored)
        setEvents(parsedEvents.slice(-200)) // Keep last 200 events
        if (parsedEvents.length > 0) {
          lastIdRef.current = parsedEvents[parsedEvents.length - 1]?.id
        }
        logger.debug('unified-events', 'Events restored from storage', {
          eventCount: parsedEvents.length,
          lastId: lastIdRef.current
        })
      }
    } catch (error) {
      logger.warn('Failed to restore events from storage:', error)
    }
  }, [STORAGE_KEY])

  // Expert: Persist events to sessionStorage
  useEffect(() => {
    if (events.length > 0) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-200)))
      } catch (error) {
        logger.warn('Failed to persist events to storage:', error)
      }
    }
  }, [events, STORAGE_KEY])

  // Expert: Jittered backoff for reconnection
  const getRetryDelay = useCallback(() => {
    const baseDelay = Math.pow(2, retryCountRef.current) * 1000
    const jitter = Math.random() * 500
    return Math.min(30000, baseDelay + jitter)
  }, [])

  // Expert: Add new event with deduplication and ordering
  const addEvent = useCallback((newEvent: UnifiedEvent) => {
    setEvents(prev => {
      // Expert: Merge by timestamp and dedupe by event ID
      const existing = prev.find(e => e.id === newEvent.id)
      if (existing) return prev

      // Insert in correct order by timestamp
      const newEvents = [...prev, newEvent]
      return newEvents.sort((a, b) => a.timestamp - b.timestamp)
    })
  }, [])

  // Expert: Polling fallback when SSE fails
  const startPollingFallback = useCallback(async () => {
    if (isPollingRef.current || requiresAuth) return

    isPollingRef.current = true
    setConnectionStatus('connected') // Show as connected via polling

    const poll = async () => {
      if (!isPollingRef.current || requiresAuth) return

      try {
        // Expert: No userId in polling fallback - resolved server-side from session
        const params = new URLSearchParams({
          ...(projectId ? { projectId } : {}),
          ...(migrationId ? { migrationId } : {}),
          ...(lastIdRef.current ? { sinceId: lastIdRef.current } : {})
        })

        const response = await fetch(`/api/events/status?${params.toString()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        })

        if (response.status === 401 || response.status === 403) {
          // Expert: Show re-auth toast and pause polling
          setConnectionStatus('auth_required')
          setRequiresAuth(true)
          isPollingRef.current = false
          toast.error('Session expired. Please sign in again.')
          return
        }

        if (response.ok) {
          const data = await response.json()

          // Process new events
          data.events?.forEach((event: unknown) => {
            try {
              const validEvent = UnifiedEventSchema.parse(event)
              addEvent(validEvent)
              lastIdRef.current = validEvent.id
            } catch (error) {
              logger.warn('Dropping invalid polling event:', error)
            }
          })

          logger.debug('unified-events', 'Polling: Received events', {
            count: data.events?.length || 0,
            hasMore: data.hasMore
          })
        }

        // Schedule next poll
        if (isPollingRef.current) {
          pollingTimeoutRef.current = setTimeout(poll, 3000) // Poll every 3s
        }
      } catch (error) {
        logger.warn('Polling error:', error)
        if (isPollingRef.current) {
          pollingTimeoutRef.current = setTimeout(poll, 5000) // Slower retry on error
        }
      }
    }

    poll()
  }, [projectId, migrationId, addEvent, requiresAuth])

  // Expert: Stop polling fallback
  const stopPollingFallback = useCallback(() => {
    isPollingRef.current = false
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current)
      pollingTimeoutRef.current = null
    }
  }, [])

  // Expert: SSE connection management
  const connect = useCallback(() => {
    if (!projectId && !migrationId) return
    if (eventSourceRef.current || requiresAuth) return

    stopPollingFallback() // Stop polling when trying SSE

    logger.info('Connecting to unified events SSE', { projectId, migrationId })
    setConnectionStatus('connecting')

    try {
      // Expert: No userId in query strings - resolved server-side from session
      const searchParams = new URLSearchParams({
        ...(projectId ? { projectId } : {}),
        ...(migrationId ? { migrationId } : {}),
        ...(lastIdRef.current ? { sinceId: lastIdRef.current } : {})
      })

      const eventSource = new EventSource(`/api/events/stream?${searchParams.toString()}`)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        retryCountRef.current = 0
        setConnectionStatus('connected')
        lastMessageRef.current = Date.now()
        logger.info('Events SSE: Connection opened')
      }

      eventSource.onmessage = (event) => {
        lastMessageRef.current = Date.now()
        lastIdRef.current = event.lastEventId || lastIdRef.current

        try {
          const payload = JSON.parse(event.data)

          // Expert: Validate with Zod and drop unknown types to avoid UI crashes
          const validEvent = UnifiedEventSchema.parse(payload)
          addEvent(validEvent)

          logger.debug('unified-events', 'SSE: Event received', {
            type: validEvent.type,
            id: validEvent.id
          })
        } catch (error) {
          // Expert: Drop invalid events silently to avoid UI crashes
          logger.warn('Dropping invalid SSE event:', error)
        }
      }

      eventSource.onerror = (error) => {
        logger.warn('Events SSE: Connection error', error)
        eventSource.close()

        // Expert: Check if this is an auth error via fetch to same endpoint
        fetch(`/api/events/stream?${searchParams.toString()}`, { method: 'HEAD' })
          .then(response => {
            if (response.status === 401 || response.status === 403) {
              // Expert: Show re-auth toast and pause auto-retry
              setConnectionStatus('auth_required')
              setRequiresAuth(true)
              toast.error('Session expired. Please sign in again.')
              return
            }

            setConnectionStatus('error')

            if (requiresAuth) return

            if (retryCountRef.current < maxRetries) {
              const delay = getRetryDelay()
              retryCountRef.current++
              logger.info('Events SSE: Retrying connection', {
                attempt: retryCountRef.current,
                delay
              })
              setTimeout(connect, delay)
            } else {
              logger.warn('Events SSE: Max retries reached, falling back to polling')
              setConnectionStatus('disconnected')
              // Expert: Start polling fallback
              startPollingFallback()
            }
          })
          .catch(() => {
            // Network error - continue with normal retry logic
            setConnectionStatus('error')
            if (!requiresAuth && retryCountRef.current < maxRetries) {
              const delay = getRetryDelay()
              retryCountRef.current++
              setTimeout(connect, delay)
            } else {
              startPollingFallback()
            }
          })
      }
    } catch (error) {
      logger.error('Failed to create SSE connection:', error)
      setConnectionStatus('error')
      startPollingFallback()
    }
  }, [projectId, migrationId, addEvent, getRetryDelay, startPollingFallback, stopPollingFallback, requiresAuth])

  // Expert: Disconnect from SSE
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      logger.info('Disconnecting from events SSE')
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    stopPollingFallback()
    setConnectionStatus('disconnected')
  }, [stopPollingFallback])

  // Expert: Manual retry function
  const retry = useCallback(() => {
    retryCountRef.current = 0
    setRequiresAuth(false)
    disconnect()
    setTimeout(connect, 100) // Small delay to ensure clean disconnect
  }, [connect, disconnect])

  // Expert: Heartbeat monitoring
  useEffect(() => {
    if (connectionStatus !== 'connected' || !eventSourceRef.current) return

    const heartbeatInterval = setInterval(() => {
      if (Date.now() - lastMessageRef.current > 30000) {
        logger.warn('SSE heartbeat timeout, forcing reconnect')
        eventSourceRef.current?.close()
      }
    }, 35000)

    return () => clearInterval(heartbeatInterval)
  }, [connectionStatus])

  // Expert: Main connection effect
  useEffect(() => {
    if ((projectId || migrationId) && !requiresAuth) {
      connect()
    } else {
      disconnect()
    }

    return () => disconnect()
  }, [projectId, migrationId, connect, disconnect, requiresAuth])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    events,
    connectionStatus,
    isConnected: connectionStatus === 'connected',
    retry
  }
}