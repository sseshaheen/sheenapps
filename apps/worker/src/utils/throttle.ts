/**
 * Simple in-memory rate limiter for auth endpoints
 *
 * Prevents credential stuffing and magic-link spam attacks.
 * This is a lightweight solution suitable for moderate traffic.
 *
 * For production with multiple worker instances, consider Redis-based rate limiting.
 *
 * Usage:
 *   if (!allow(`signin:${projectId}:${email}:${ip}`, 10, 10 * 60 * 1000)) {
 *     return reply.code(429).send({ error: 'Too many attempts' })
 *   }
 */

type Key = string

interface HitRecord {
  count: number
  resetAt: number
}

// In-memory store of rate limit hits
const hits = new Map<Key, HitRecord>()

/**
 * Check if a request should be allowed based on rate limit
 *
 * @param key - Unique identifier for the rate limit bucket (e.g., "signin:project123:user@example.com:1.2.3.4")
 * @param limit - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns true if request is allowed, false if rate limit exceeded
 */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const cur = hits.get(key)

  // First request or window expired - reset counter
  if (!cur || now > cur.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  // Within window - check if limit exceeded
  if (cur.count >= limit) {
    return false
  }

  // Within window and under limit - increment counter
  cur.count++
  return true
}

/**
 * Periodic cleanup of expired entries to prevent memory leaks
 * Call this periodically (e.g., every 5 minutes) in a background job
 */
export function cleanup(): void {
  const now = Date.now()
  let removed = 0

  for (const [key, record] of hits.entries()) {
    if (now > record.resetAt) {
      hits.delete(key)
      removed++
    }
  }

  if (removed > 0) {
    console.log(`[Throttle] Cleaned up ${removed} expired rate limit entries`)
  }
}

/**
 * Get current size of the rate limit store (for monitoring)
 */
export function getStoreSize(): number {
  return hits.size
}

/**
 * Clear all rate limit entries (for testing only)
 */
export function clearAll(): void {
  hits.clear()
}
