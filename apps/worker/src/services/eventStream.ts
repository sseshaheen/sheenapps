/**
 * Event Stream Service
 *
 * Provides Redis-backed event sequencing and replay for SSE streams.
 * Enables stream resumption via Last-Event-ID header.
 *
 * Architecture:
 * - Uses Redis Streams (XADD/XRANGE) for event storage
 * - Automatic TTL-based cleanup (events expire after 1 hour)
 * - Sequence numbers for ordering
 * - Multi-instance safe (Redis is the coordinator)
 *
 * Usage:
 * ```typescript
 * const stream = getEventStream()
 *
 * // Store an event when sending
 * const eventId = await stream.storeEvent(buildSessionId, event)
 * reply.sse({ id: eventId, data: event })
 *
 * // On reconnect, get missed events
 * const lastEventId = request.headers['last-event-id']
 * const missedEvents = await stream.getMissedEvents(buildSessionId, lastEventId)
 * for (const event of missedEvents) {
 *   reply.sse({ id: event.id, data: event.data })
 * }
 * ```
 */

import Redis from 'ioredis'

/**
 * Stored event structure.
 */
export interface StoredEvent {
  id: string          // Redis stream ID (e.g., "1234567890123-0")
  seq: number         // Sequence number within the session
  type: string        // Event type (e.g., "assistant_text", "progress")
  data: string        // Event payload (JSON stringified)
  timestamp: number   // When the event was stored
}

/**
 * Event to be stored.
 */
export interface EventToStore {
  type: string
  data: unknown
}

/**
 * Stream key prefix for Redis.
 */
const STREAM_KEY_PREFIX = 'events:build:'

/**
 * Stream metadata key prefix.
 */
const META_KEY_PREFIX = 'events:meta:'

/**
 * Default TTL for events (1 hour).
 * Events older than this are automatically cleaned up.
 */
const DEFAULT_TTL_SECONDS = 3600

/**
 * Maximum events per stream (prevents unbounded growth).
 * Older events are trimmed when this limit is reached.
 */
const MAX_STREAM_LENGTH = 1000

/**
 * EventStream class for managing event storage and replay.
 */
class EventStream {
  private redis: Redis

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null
        return Math.min(times * 200, 2000)
      }
    })
  }

  /**
   * Get the Redis stream key for a build session.
   */
  private getStreamKey(buildSessionId: string): string {
    return `${STREAM_KEY_PREFIX}${buildSessionId}`
  }

  /**
   * Get the metadata key for a build session.
   */
  private getMetaKey(buildSessionId: string): string {
    return `${META_KEY_PREFIX}${buildSessionId}`
  }

  /**
   * Store an event in the stream.
   * Returns the event ID for use in SSE id field.
   *
   * @param buildSessionId - The build session this event belongs to
   * @param event - The event to store
   * @returns The event ID (Redis stream ID)
   */
  async storeEvent(buildSessionId: string, event: EventToStore): Promise<string> {
    const streamKey = this.getStreamKey(buildSessionId)
    const metaKey = this.getMetaKey(buildSessionId)

    // Get and increment sequence number atomically
    const seq = await this.redis.incr(`${metaKey}:seq`)

    // Prepare event data
    const eventData = {
      seq: seq.toString(),
      type: event.type,
      data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
      timestamp: Date.now().toString()
    }

    // Store in Redis Stream with automatic ID and trimming
    // MAXLEN ~ keeps approximately MAX_STREAM_LENGTH entries (allows some slack for performance)
    const eventId = await this.redis.xadd(
      streamKey,
      'MAXLEN', '~', MAX_STREAM_LENGTH.toString(),
      '*', // Auto-generate ID
      ...Object.entries(eventData).flat()
    )

    // Set TTL on the stream (refreshed on each add)
    await this.redis.expire(streamKey, DEFAULT_TTL_SECONDS)
    await this.redis.expire(metaKey, DEFAULT_TTL_SECONDS)
    await this.redis.expire(`${metaKey}:seq`, DEFAULT_TTL_SECONDS)

    return eventId as string
  }

  /**
   * Get missed events after a given event ID.
   * Used for stream resumption when client reconnects with Last-Event-ID.
   *
   * @param buildSessionId - The build session to get events from
   * @param lastEventId - The last event ID the client received (exclusive)
   * @param limit - Maximum number of events to return (default 100)
   * @returns Array of missed events
   */
  async getMissedEvents(
    buildSessionId: string,
    lastEventId: string,
    limit: number = 100
  ): Promise<StoredEvent[]> {
    const streamKey = this.getStreamKey(buildSessionId)

    try {
      // Use exclusive range: (lastEventId, +] - events AFTER lastEventId
      // The '(' prefix makes it exclusive
      const results = await this.redis.xrange(
        streamKey,
        `(${lastEventId}`, // Exclusive start
        '+',               // Latest
        'COUNT', limit.toString()
      )

      return results.map(([id, fields]) => {
        const obj: Record<string, string> = {}
        for (let i = 0; i < fields.length; i += 2) {
          const key = fields[i]
          const value = fields[i + 1]
          if (key !== undefined) {
            obj[key] = value ?? ''
          }
        }
        return {
          id,
          seq: parseInt(obj.seq || '0', 10),
          type: obj.type || 'unknown',
          data: obj.data || '{}',
          timestamp: parseInt(obj.timestamp || '0', 10)
        }
      })
    } catch (error) {
      console.error('[EventStream] Error getting missed events:', error)
      return []
    }
  }

  /**
   * Get all events for a build session.
   * Useful for debugging or full replay.
   *
   * @param buildSessionId - The build session to get events from
   * @param limit - Maximum number of events to return
   * @returns Array of all stored events
   */
  async getAllEvents(buildSessionId: string, limit: number = 100): Promise<StoredEvent[]> {
    const streamKey = this.getStreamKey(buildSessionId)

    try {
      const results = await this.redis.xrange(
        streamKey,
        '-', // Earliest
        '+', // Latest
        'COUNT', limit.toString()
      )

      return results.map(([id, fields]) => {
        const obj: Record<string, string> = {}
        for (let i = 0; i < fields.length; i += 2) {
          const key = fields[i]
          const value = fields[i + 1]
          if (key !== undefined) {
            obj[key] = value ?? ''
          }
        }
        return {
          id,
          seq: parseInt(obj.seq || '0', 10),
          type: obj.type || 'unknown',
          data: obj.data || '{}',
          timestamp: parseInt(obj.timestamp || '0', 10)
        }
      })
    } catch (error) {
      console.error('[EventStream] Error getting all events:', error)
      return []
    }
  }

  /**
   * Get the current sequence number for a build session.
   *
   * @param buildSessionId - The build session to check
   * @returns Current sequence number, or 0 if no events
   */
  async getCurrentSequence(buildSessionId: string): Promise<number> {
    const metaKey = this.getMetaKey(buildSessionId)
    const seq = await this.redis.get(`${metaKey}:seq`)
    return seq ? parseInt(seq, 10) : 0
  }

  /**
   * Clear all events for a build session.
   * Call this when a build completes or fails.
   *
   * @param buildSessionId - The build session to clear
   */
  async clearEvents(buildSessionId: string): Promise<void> {
    const streamKey = this.getStreamKey(buildSessionId)
    const metaKey = this.getMetaKey(buildSessionId)

    await this.redis.del(streamKey)
    await this.redis.del(metaKey)
    await this.redis.del(`${metaKey}:seq`)
  }

  /**
   * Validate that an event ID exists in the stream.
   * Useful for checking if Last-Event-ID is valid before replay.
   *
   * @param buildSessionId - The build session to check
   * @param eventId - The event ID to validate
   * @returns True if the event exists
   */
  async isValidEventId(buildSessionId: string, eventId: string): Promise<boolean> {
    const streamKey = this.getStreamKey(buildSessionId)

    try {
      // Try to get exactly one event at this ID
      const results = await this.redis.xrange(
        streamKey,
        eventId,
        eventId,
        'COUNT', '1'
      )
      return results.length > 0
    } catch {
      return false
    }
  }

  /**
   * Close the Redis connection.
   * Call this on shutdown.
   */
  async close(): Promise<void> {
    await this.redis.quit()
  }
}

// Singleton instance
let eventStreamInstance: EventStream | null = null

/**
 * Get the singleton EventStream instance.
 */
export function getEventStream(): EventStream {
  if (!eventStreamInstance) {
    eventStreamInstance = new EventStream()
  }
  return eventStreamInstance
}

/**
 * Create a new EventStream instance (for testing).
 */
export function createEventStream(redisUrl?: string): EventStream {
  return new EventStream(redisUrl)
}
