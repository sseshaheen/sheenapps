/**
 * Stream Controller
 *
 * Manages SSE connections with resumption support via Last-Event-ID.
 * Single point of coordination for all streaming in the builder.
 *
 * Key Features:
 * - Automatic reconnection with exponential backoff
 * - Event sequence validation (rejects out-of-order events)
 * - Resumption via Last-Event-ID header
 * - Connection state tracking
 * - Event buffering during reconnection
 *
 * Architecture:
 * - One controller per build session (not per component)
 * - Events flow through the controller to stores
 * - Sequence validation happens here, not in stores
 *
 * Usage:
 * ```typescript
 * const controller = createStreamController({
 *   buildSessionId,
 *   endpoint: '/api/chat-plan/stream',
 *   onEvent: (event) => { ... },
 *   onConnectionChange: (state) => { ... }
 * })
 *
 * controller.connect()
 *
 * // On unmount
 * controller.disconnect()
 * ```
 */

'use client'

import { logger } from '@/utils/logger'

/**
 * Connection states.
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

/**
 * Parsed SSE event.
 */
export interface StreamEvent {
  id: string | null
  type: string
  data: unknown
  seq: number
  retry?: number
}

/**
 * Stream controller configuration.
 */
export interface StreamControllerConfig {
  /** The build session ID for this stream */
  buildSessionId: string
  /** The SSE endpoint URL */
  endpoint: string
  /** Called for each event received */
  onEvent: (event: StreamEvent) => void
  /** Called when connection state changes */
  onConnectionChange?: (state: ConnectionState) => void
  /** Called on unrecoverable error */
  onError?: (error: Error) => void
  /** Maximum reconnection attempts before giving up */
  maxReconnectAttempts?: number
  /** Initial reconnection delay in ms */
  initialReconnectDelay?: number
  /** Maximum reconnection delay in ms */
  maxReconnectDelay?: number
}

/**
 * Stream controller class.
 */
class StreamController {
  private config: Required<StreamControllerConfig>
  private eventSource: EventSource | null = null
  private connectionState: ConnectionState = 'disconnected'
  private lastEventId: string | null = null
  private lastSeq: number = 0
  private reconnectAttempts: number = 0
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null
  private abortController: AbortController | null = null

  constructor(config: StreamControllerConfig) {
    this.config = {
      maxReconnectAttempts: 5,
      initialReconnectDelay: 1000,
      maxReconnectDelay: 30000,
      onConnectionChange: () => {},
      onError: () => {},
      ...config
    }
  }

  /**
   * Get the current connection state.
   */
  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  /**
   * Get the last event ID received.
   */
  getLastEventId(): string | null {
    return this.lastEventId
  }

  /**
   * Get the last sequence number received.
   */
  getLastSeq(): number {
    return this.lastSeq
  }

  /**
   * Connect to the SSE endpoint.
   */
  connect(): void {
    // Guard: don't connect if already connected or connecting
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      logger.debug('stream-controller', 'Already connected or connecting, skipping')
      return
    }

    // Clear any pending reconnect
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }

    this.setConnectionState('connecting')
    this.abortController = new AbortController()

    // Build URL with query params
    const url = new URL(this.config.endpoint, window.location.origin)
    url.searchParams.set('buildSessionId', this.config.buildSessionId)
    if (this.lastEventId) {
      url.searchParams.set('lastEventId', this.lastEventId)
    }

    logger.info('stream-controller', `Connecting to ${url.pathname}...`)

    try {
      this.eventSource = new EventSource(url.toString())

      this.eventSource.onopen = () => {
        logger.info('stream-controller', 'Connection established')
        this.setConnectionState('connected')
        this.reconnectAttempts = 0
      }

      this.eventSource.onerror = (error) => {
        logger.warn('stream-controller', 'Connection error', String(error.type))

        // EventSource auto-reconnects, but we track state
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.handleDisconnect()
        } else if (this.eventSource?.readyState === EventSource.CONNECTING) {
          this.setConnectionState('reconnecting')
        }
      }

      // Handle generic message events
      this.eventSource.onmessage = (event) => {
        this.handleEvent('message', event)
      }

      // Handle specific event types
      const eventTypes = [
        'connection',
        'assistant_text',
        'tool_use',
        'tool_result',
        'progress',
        'complete',
        'error',
        'recommendations_ready',
        'recommendations_failed',
        'file_start',
        'content',
        'file_end'
      ]

      for (const type of eventTypes) {
        this.eventSource.addEventListener(type, (event) => {
          this.handleEvent(type, event as MessageEvent)
        })
      }
    } catch (error) {
      logger.error('stream-controller', `Failed to create EventSource: ${error}`)
      this.setConnectionState('error')
      this.config.onError(error as Error)
    }
  }

  /**
   * Disconnect from the SSE endpoint.
   */
  disconnect(): void {
    logger.info('stream-controller', 'Disconnecting...')

    // Cancel any pending reconnect
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }

    // Abort any pending operations
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    // Close the EventSource
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    this.setConnectionState('disconnected')
  }

  /**
   * Reset the stream state for a new build session.
   */
  reset(newBuildSessionId: string): void {
    this.disconnect()
    this.config.buildSessionId = newBuildSessionId
    this.lastEventId = null
    this.lastSeq = 0
    this.reconnectAttempts = 0
  }

  /**
   * Handle an incoming event.
   */
  private handleEvent(type: string, event: MessageEvent): void {
    try {
      // Parse event data
      let data: unknown
      try {
        data = JSON.parse(event.data)
      } catch {
        data = event.data
      }

      // Extract sequence number from data if present
      const seq = typeof data === 'object' && data !== null && 'seq' in data
        ? (data as { seq: number }).seq
        : this.lastSeq + 1

      // Validate sequence (reject out-of-order events)
      if (seq <= this.lastSeq && type !== 'connection') {
        logger.warn('stream-controller', `Rejecting out-of-order event: seq=${seq}, lastSeq=${this.lastSeq}`)
        return
      }

      // Update tracking
      if (event.lastEventId) {
        this.lastEventId = event.lastEventId
      }
      this.lastSeq = seq

      // Build parsed event
      const streamEvent: StreamEvent = {
        id: event.lastEventId || null,
        type,
        data,
        seq
      }

      // Dispatch to handler
      this.config.onEvent(streamEvent)

    } catch (error) {
      logger.error('stream-controller', `Error handling event: ${error}`)
    }
  }

  /**
   * Handle disconnection with optional reconnect.
   */
  private handleDisconnect(): void {
    this.eventSource?.close()
    this.eventSource = null

    // Check if we should attempt reconnection
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('stream-controller', `Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`)
      this.setConnectionState('error')
      this.config.onError(new Error('Max reconnection attempts reached'))
      return
    }

    // Calculate backoff delay
    const delay = Math.min(
      this.config.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelay
    )

    logger.info('stream-controller', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`)
    this.setConnectionState('reconnecting')

    // Store timeout ID and clear on abort
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null
      this.reconnectAttempts++
      this.connect()
    }, delay)
  }

  /**
   * Update connection state and notify listener.
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state
      this.config.onConnectionChange(state)
    }
  }
}

/**
 * Create a new stream controller.
 */
export function createStreamController(config: StreamControllerConfig): StreamController {
  return new StreamController(config)
}

/**
 * SSE parser for multi-line events.
 * Handles id:, event:, data:, retry: fields per SSE spec.
 */
export function parseSSELine(line: string): { field: string; value: string } | null {
  if (!line || line.startsWith(':')) {
    // Comment or empty line
    return null
  }

  const colonIndex = line.indexOf(':')
  if (colonIndex === -1) {
    return { field: line, value: '' }
  }

  const field = line.slice(0, colonIndex)
  let value = line.slice(colonIndex + 1)

  // Remove leading space if present (per SSE spec)
  if (value.startsWith(' ')) {
    value = value.slice(1)
  }

  return { field, value }
}
