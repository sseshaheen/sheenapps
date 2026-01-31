/**
 * Stream Controller Hook
 *
 * Manages SSE connection lifecycle for build sessions.
 * Provides automatic reconnection, sequence validation, and resumption support.
 *
 * Key Features:
 * - Single controller per build session
 * - Automatic reconnection with exponential backoff
 * - Last-Event-ID support for resumption
 * - Event routing to subscribers
 * - Connection state tracking
 *
 * Usage:
 * ```typescript
 * const { connectionState, subscribe, isConnected } = useStreamController({
 *   buildSessionId,
 *   projectId,
 *   enabled: isBuilding
 * })
 *
 * // Subscribe to specific event types
 * useEffect(() => {
 *   if (!isConnected) return
 *   return subscribe('recommendations_ready', (event) => {
 *     // handle event
 *   })
 * }, [subscribe, isConnected])
 * ```
 */

'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import {
  createStreamController,
  StreamEvent,
  ConnectionState
} from '@/lib/stream-controller'
import { logger } from '@/utils/logger'

interface UseStreamControllerOptions {
  /** Build session ID for this stream */
  buildSessionId: string | null
  /** Project ID for routing */
  projectId: string | null
  /** Whether the controller should be active */
  enabled?: boolean
  /** SSE endpoint URL (defaults to /api/chat-plan/stream) */
  endpoint?: string
  /** Called when connection state changes */
  onConnectionChange?: (state: ConnectionState) => void
  /** Called on unrecoverable error */
  onError?: (error: Error) => void
}

interface StreamControllerState {
  /** Current connection state */
  connectionState: ConnectionState
  /** Whether connected */
  isConnected: boolean
  /** Whether reconnecting */
  isReconnecting: boolean
  /** Last error message */
  lastError: string | null
  /** Last sequence number received */
  lastSeq: number
}

type EventCallback = (event: StreamEvent) => void

interface UseStreamControllerReturn extends StreamControllerState {
  /** Subscribe to an event type. Returns unsubscribe function. */
  subscribe: (eventType: string, callback: EventCallback) => () => void
  /** Manually reconnect */
  reconnect: () => void
  /** Manually disconnect */
  disconnect: () => void
}

/**
 * Hook to manage SSE connection via StreamController.
 */
export function useStreamController({
  buildSessionId,
  projectId,
  enabled = true,
  endpoint = '/api/chat-plan/stream',
  onConnectionChange,
  onError
}: UseStreamControllerOptions): UseStreamControllerReturn {
  // Controller ref (persists across renders)
  const controllerRef = useRef<ReturnType<typeof createStreamController> | null>(null)

  // Subscribers map: eventType -> Set of callbacks
  const subscribersRef = useRef<Map<string, Set<EventCallback>>>(new Map())

  // State
  const [state, setState] = useState<StreamControllerState>({
    connectionState: 'disconnected',
    isConnected: false,
    isReconnecting: false,
    lastError: null,
    lastSeq: 0
  })

  // Handle incoming events - route to subscribers
  const handleEvent = useCallback((event: StreamEvent) => {
    logger.debug('stream-controller-hook', `Event received: ${event.type}`, {
      seq: event.seq,
      hasData: !!event.data
    })

    // Update last sequence
    setState(prev => ({ ...prev, lastSeq: event.seq }))

    // Route to subscribers
    const subscribers = subscribersRef.current.get(event.type)
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(event)
        } catch (error) {
          logger.error('stream-controller-hook', `Subscriber error for ${event.type}:`, error)
        }
      })
    }

    // Also notify 'all' subscribers
    const allSubscribers = subscribersRef.current.get('*')
    if (allSubscribers) {
      allSubscribers.forEach(callback => {
        try {
          callback(event)
        } catch (error) {
          logger.error('stream-controller-hook', `All-subscriber error:`, error)
        }
      })
    }
  }, [])

  // Handle connection state changes
  const handleConnectionChange = useCallback((newState: ConnectionState) => {
    logger.debug('stream-controller-hook', `Connection state: ${newState}`)

    setState(prev => ({
      ...prev,
      connectionState: newState,
      isConnected: newState === 'connected',
      isReconnecting: newState === 'reconnecting',
      lastError: newState === 'error' ? 'Connection failed' : prev.lastError
    }))

    onConnectionChange?.(newState)
  }, [onConnectionChange])

  // Handle unrecoverable errors
  const handleError = useCallback((error: Error) => {
    logger.error('stream-controller-hook', 'Unrecoverable error:', error.message)

    setState(prev => ({
      ...prev,
      lastError: error.message,
      connectionState: 'error',
      isConnected: false,
      isReconnecting: false
    }))

    onError?.(error)
  }, [onError])

  // Initialize/cleanup controller
  useEffect(() => {
    // Skip if not enabled or missing required IDs
    if (!enabled || !buildSessionId || !projectId) {
      // Disconnect existing controller if present
      if (controllerRef.current) {
        controllerRef.current.disconnect()
        controllerRef.current = null
        setState({
          connectionState: 'disconnected',
          isConnected: false,
          isReconnecting: false,
          lastError: null,
          lastSeq: 0
        })
      }
      return
    }

    // Create new controller
    logger.info('stream-controller-hook', `Creating controller for session ${buildSessionId.slice(0, 10)}`)

    const controller = createStreamController({
      buildSessionId,
      endpoint,
      onEvent: handleEvent,
      onConnectionChange: handleConnectionChange,
      onError: handleError
    })

    controllerRef.current = controller
    controller.connect()

    // Cleanup on unmount or dependency change
    return () => {
      logger.info('stream-controller-hook', 'Disconnecting controller')
      controller.disconnect()
      controllerRef.current = null
    }
  }, [buildSessionId, projectId, enabled, endpoint, handleEvent, handleConnectionChange, handleError])

  // Subscribe to event type
  const subscribe = useCallback((eventType: string, callback: EventCallback): (() => void) => {
    if (!subscribersRef.current.has(eventType)) {
      subscribersRef.current.set(eventType, new Set())
    }

    subscribersRef.current.get(eventType)!.add(callback)

    logger.debug('stream-controller-hook', `Subscribed to ${eventType}`)

    // Return unsubscribe function
    return () => {
      subscribersRef.current.get(eventType)?.delete(callback)
      logger.debug('stream-controller-hook', `Unsubscribed from ${eventType}`)
    }
  }, [])

  // Manual reconnect
  const reconnect = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.disconnect()
      controllerRef.current.connect()
    }
  }, [])

  // Manual disconnect
  const disconnect = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.disconnect()
    }
  }, [])

  return {
    ...state,
    subscribe,
    reconnect,
    disconnect
  }
}

/**
 * Hook to subscribe to a specific event type.
 * Convenience wrapper around useStreamController.subscribe.
 */
export function useStreamEvent(
  subscribe: UseStreamControllerReturn['subscribe'],
  eventType: string,
  callback: EventCallback,
  deps: React.DependencyList = []
): void {
  useEffect(() => {
    return subscribe(eventType, callback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, eventType, ...deps])
}
