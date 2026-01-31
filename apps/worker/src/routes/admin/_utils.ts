/**
 * Shared Admin Route Utilities
 *
 * Common helpers for admin routes to avoid duplication and ensure consistency.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { pool } from '../../services/database'
import { withCorrelationId, adminErrorResponse } from '../../middleware/correlationIdMiddleware'

// =============================================================================
// ERROR CODES
// =============================================================================

export type AdminErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'

// =============================================================================
// RESPONSE HELPERS
// =============================================================================

/**
 * Send a successful admin response with correlation ID and timestamp
 */
export function sendAdminOk<T extends object>(
  request: FastifyRequest,
  reply: FastifyReply,
  body: T,
  status = 200
) {
  return reply.status(status).send(
    withCorrelationId(
      { success: true, ...body, timestamp: new Date().toISOString() },
      request
    )
  )
}

/**
 * Send an error admin response with correlation ID and timestamp
 */
export function sendAdminFail(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  message: string,
  code: AdminErrorCode = 'INTERNAL_ERROR',
  details?: unknown
) {
  const base = adminErrorResponse(request, message)
  return reply.status(status).send({
    ...base,
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    timestamp: new Date().toISOString(),
  })
}

// =============================================================================
// DATABASE HELPERS
// =============================================================================

/**
 * Get database pool or throw if not available
 */
export function requirePool() {
  if (!pool) throw new Error('Database pool not initialized')
  return pool
}

// =============================================================================
// PAGINATION HELPERS
// =============================================================================

/**
 * Parse limit and offset query parameters with bounds checking
 */
export function parseLimitOffset(
  limitStr?: string,
  offsetStr?: string,
  defaultLimit = 50,
  maxLimit = 100
) {
  const limitRaw = parseInt(limitStr ?? String(defaultLimit), 10)
  const offsetRaw = parseInt(offsetStr ?? '0', 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), maxLimit) : defaultLimit
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0
  return { limit, offset }
}

// =============================================================================
// IDEMPOTENCY CACHE
// =============================================================================

interface CachedResponse {
  response: any
  timestamp: number
  correlationId: string
}

const IDEMPOTENCY_MAX_ENTRIES = 10_000

/**
 * Creates an idempotency cache with proper Fastify lifecycle management.
 * Call this once during route registration.
 */
export function setupIdempotencyCache(fastify: FastifyInstance, ttlMs = 24 * 60 * 60 * 1000) {
  const cache = new Map<string, CachedResponse>()

  // Cleanup expired entries every hour
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > ttlMs) cache.delete(key)
    }
  }, 60 * 60 * 1000)

  // Clear interval on server shutdown
  fastify.addHook('onClose', async () => clearInterval(timer))

  return {
    /**
     * Get cached response if valid, returns same shape with deduped: true
     */
    get(key?: string): any | null {
      if (!key) return null
      const hit = cache.get(key)
      if (!hit) return null
      if (Date.now() - hit.timestamp > ttlMs) {
        cache.delete(key)
        return null
      }
      // Return same shape as original, just add deduped flag
      return { ...hit.response, deduped: true, correlation_id: hit.correlationId }
    },

    /**
     * Cache a response for future idempotent requests
     */
    set(key: string | undefined, response: any, correlationId: string) {
      if (!key) return

      // Cap size to prevent unbounded memory growth
      if (cache.size >= IDEMPOTENCY_MAX_ENTRIES) {
        // Delete oldest entry (Map maintains insertion order)
        const oldestKey = cache.keys().next().value
        if (oldestKey) cache.delete(oldestKey)
      }

      cache.set(key, { response, correlationId, timestamp: Date.now() })
    },
  }
}

// =============================================================================
// PAYLOAD HELPERS
// =============================================================================

/**
 * Safely parse JSONB payload that may come as string or object depending on pg driver
 */
export function safeParsePayload<T>(payload: unknown): T | null {
  if (!payload) return null
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as T
    } catch {
      return null
    }
  }
  return payload as T
}
