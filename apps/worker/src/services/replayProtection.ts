/**
 * Replay Protection Service
 *
 * Provides request-ID based replay protection for critical endpoints.
 * Uses Redis with TTL for multi-instance safety.
 *
 * This complements the HMAC nonce validation but provides stricter control:
 * - Request-ID is REQUIRED (not optional like HMAC nonce)
 * - Shorter TTL for request-IDs (5 minutes vs 10 minutes for HMAC nonce)
 * - Explicit validation before processing
 *
 * Usage:
 * ```typescript
 * const protection = getReplayProtection()
 *
 * // In route handler
 * const requestId = request.headers['x-request-id']
 * const result = await protection.validateRequestId(requestId)
 * if (!result.valid) {
 *   return reply.code(409).send({ error: result.error, code: 'REPLAY_DETECTED' })
 * }
 *
 * // Process request...
 * ```
 */

import Redis from 'ioredis'

/**
 * Request ID validation result.
 */
export interface RequestIdValidationResult {
  valid: boolean
  error?: string
  requestId?: string
  /** Whether the ID was found in cache (replay detected) */
  wasReplay: boolean
}

/**
 * Request ID format validation.
 * Accepts formats:
 * - trace_{timestamp}_{random} (frontend trace IDs)
 * - UUID v4 format
 * - Any string 8-128 chars
 */
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/

/**
 * TTL for request IDs (5 minutes).
 * Shorter than HMAC nonce TTL because these are for immediate replay detection.
 */
const REQUEST_ID_TTL_SECONDS = 300

/**
 * Redis key prefix for request IDs.
 */
const REQUEST_ID_PREFIX = 'reqid:'

/**
 * ReplayProtection class for validating request IDs.
 */
class ReplayProtection {
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
   * Validate a request ID for replay protection.
   * Returns invalid if:
   * - Request ID is missing or empty
   * - Request ID format is invalid
   * - Request ID has been seen before (replay detected)
   *
   * @param requestId - The x-request-id header value
   * @returns Validation result
   */
  async validateRequestId(requestId: string | undefined): Promise<RequestIdValidationResult> {
    // Check if request ID is present
    if (!requestId || requestId.trim() === '') {
      return {
        valid: false,
        error: 'Missing x-request-id header',
        wasReplay: false
      }
    }

    const trimmedId = requestId.trim()

    // Validate format
    if (!REQUEST_ID_PATTERN.test(trimmedId)) {
      return {
        valid: false,
        error: 'Invalid x-request-id format (must be 8-128 alphanumeric characters)',
        requestId: trimmedId,
        wasReplay: false
      }
    }

    try {
      // Use SETNX (SET if Not eXists) for atomic check-and-set
      // This prevents race conditions between check and store
      const key = `${REQUEST_ID_PREFIX}${trimmedId}`
      const result = await this.redis.set(key, Date.now().toString(), 'EX', REQUEST_ID_TTL_SECONDS, 'NX')

      if (result === null) {
        // Key already exists - this is a replay
        return {
          valid: false,
          error: 'Request ID has already been used (replay detected)',
          requestId: trimmedId,
          wasReplay: true
        }
      }

      // Request ID is new and has been stored
      return {
        valid: true,
        requestId: trimmedId,
        wasReplay: false
      }
    } catch (error) {
      // Redis error - fail open with warning
      // This is a tradeoff: we prioritize availability over strict replay protection
      console.error('[ReplayProtection] Redis error during validation:', error)
      return {
        valid: true, // Graceful degradation
        requestId: trimmedId,
        wasReplay: false,
        error: `Redis error (request allowed): ${(error as Error).message}`
      }
    }
  }

  /**
   * Check if a request ID has been used (without storing).
   * Useful for pre-validation without consuming the ID.
   *
   * @param requestId - The request ID to check
   * @returns True if the request ID has been seen before
   */
  async isRequestIdUsed(requestId: string): Promise<boolean> {
    if (!requestId || !REQUEST_ID_PATTERN.test(requestId.trim())) {
      return false
    }

    try {
      const key = `${REQUEST_ID_PREFIX}${requestId.trim()}`
      const exists = await this.redis.exists(key)
      return exists === 1
    } catch (error) {
      console.error('[ReplayProtection] Redis error during check:', error)
      return false
    }
  }

  /**
   * Manually invalidate a request ID.
   * Use this if a request fails and you want to allow retry.
   *
   * @param requestId - The request ID to invalidate
   */
  async invalidateRequestId(requestId: string): Promise<void> {
    if (!requestId) return

    try {
      const key = `${REQUEST_ID_PREFIX}${requestId.trim()}`
      await this.redis.del(key)
    } catch (error) {
      console.error('[ReplayProtection] Redis error during invalidation:', error)
    }
  }

  /**
   * Get statistics about replay protection.
   * Useful for monitoring.
   */
  async getStats(): Promise<{
    activeRequestIds: number
    redisConnected: boolean
  }> {
    try {
      // Count active request IDs using KEYS (only for stats, not in hot path)
      const keys = await this.redis.keys(`${REQUEST_ID_PREFIX}*`)
      return {
        activeRequestIds: keys.length,
        redisConnected: true
      }
    } catch (error) {
      return {
        activeRequestIds: 0,
        redisConnected: false
      }
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
let replayProtectionInstance: ReplayProtection | null = null

/**
 * Get the singleton ReplayProtection instance.
 */
export function getReplayProtection(): ReplayProtection {
  if (!replayProtectionInstance) {
    replayProtectionInstance = new ReplayProtection()
  }
  return replayProtectionInstance
}

/**
 * Create a new ReplayProtection instance (for testing).
 */
export function createReplayProtection(redisUrl?: string): ReplayProtection {
  return new ReplayProtection(redisUrl)
}

/**
 * Fastify preHandler for replay protection.
 * Add this to routes that require strict replay protection.
 *
 * Usage:
 * ```typescript
 * fastify.post('/critical-endpoint', {
 *   preHandler: [requireHmacSignature(), requireReplayProtection()]
 * }, handler)
 * ```
 */
export function requireReplayProtection() {
  const protection = getReplayProtection()

  return async function replayProtectionMiddleware(
    request: { headers: Record<string, string | string[] | undefined> },
    reply: { code: (code: number) => { send: (body: unknown) => void } }
  ): Promise<void> {
    const requestId = request.headers['x-request-id']
    const requestIdStr = Array.isArray(requestId) ? requestId[0] : requestId

    const result = await protection.validateRequestId(requestIdStr)

    if (!result.valid) {
      const statusCode = result.wasReplay ? 409 : 400
      reply.code(statusCode).send({
        error: result.error,
        code: result.wasReplay ? 'REPLAY_DETECTED' : 'INVALID_REQUEST_ID',
        timestamp: new Date().toISOString()
      })
      return
    }

    // Attach to request for downstream use
    ;(request as Record<string, unknown>).requestId = result.requestId
  }
}
