/**
 * Domain Search Rate Limiter
 *
 * Redis-based fixed-window rate limiting for domain search endpoints.
 * Unlike the spam filter (fail-open), this fails CLOSED with a conservative
 * in-memory fallback because domain searches have real API costs.
 *
 * Design:
 * - IP burst protection (10/minute) catches scrapers and buggy clients
 * - Project hourly limit (100/hour) protects against abuse
 * - Fail-closed: When Redis is down, use conservative in-memory fallback
 *
 * Part of easy-mode-email-enhancements-plan.md (Enhancement 1)
 */

import type Redis from 'ioredis'
import { getBestEffortRedis } from '../redisBestEffort'
import { createLogger } from '../../observability/logger'

const log = createLogger('domain-search-rate-limiter')

// =============================================================================
// TYPES
// =============================================================================

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetInSeconds: number
  reason?: string
}

export interface DomainSearchRateLimitConfig {
  /** Max searches per project per hour */
  projectLimitPerHour: number
  /** Max searches per IP per minute (burst protection) */
  ipLimitPerMinute: number
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: DomainSearchRateLimitConfig = {
  projectLimitPerHour: parseInt(process.env.DOMAIN_SEARCH_PROJECT_LIMIT_PER_HOUR || '100', 10),
  ipLimitPerMinute: parseInt(process.env.DOMAIN_SEARCH_IP_LIMIT_PER_MINUTE || '10', 10),
}

// =============================================================================
// IN-MEMORY FALLBACK
// =============================================================================

/**
 * In-memory fallback when Redis is unavailable.
 *
 * IMPORTANT: This is per-process and does not share state across instances.
 * Under multi-instance deployment, rate limiting becomes approximate during
 * Redis outages. This is acceptable for degraded mode but should be monitored.
 */
const inMemoryCounters = new Map<string, { count: number; resetAt: number }>()

/** Very conservative limit when Redis is down - protect the API */
const IN_MEMORY_LIMIT = 5

/** 1 minute window for in-memory fallback */
const IN_MEMORY_WINDOW_MS = 60_000

/** Maximum number of entries before cleanup */
const IN_MEMORY_MAX_ENTRIES = 1000

function cleanupExpiredEntries(): void {
  const now = Date.now()
  for (const [key, entry] of inMemoryCounters) {
    if (entry.resetAt < now) {
      inMemoryCounters.delete(key)
    }
  }
}

function checkInMemoryFallback(key: string): RateLimitResult {
  const now = Date.now()

  // Cleanup expired entries periodically
  if (inMemoryCounters.size > IN_MEMORY_MAX_ENTRIES) {
    cleanupExpiredEntries()
  }

  const entry = inMemoryCounters.get(key)

  if (!entry || entry.resetAt < now) {
    // New window or expired entry
    inMemoryCounters.set(key, { count: 1, resetAt: now + IN_MEMORY_WINDOW_MS })
    return {
      allowed: true,
      remaining: IN_MEMORY_LIMIT - 1,
      resetInSeconds: Math.ceil(IN_MEMORY_WINDOW_MS / 1000),
    }
  }

  entry.count++

  if (entry.count > IN_MEMORY_LIMIT) {
    const resetInSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds,
      reason: `Rate limit exceeded (degraded mode): ${entry.count}/${IN_MEMORY_LIMIT} per minute`,
    }
  }

  return {
    allowed: true,
    remaining: IN_MEMORY_LIMIT - entry.count,
    resetInSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  }
}

// =============================================================================
// IP PARSING
// =============================================================================

/**
 * Parse client IP from request.
 *
 * When trustProxy is configured in Fastify, request.ip is already the correct
 * client IP (Fastify parses x-forwarded-for for you). Only fall back to manual
 * XFF parsing if request.ip is missing or is the proxy IP.
 *
 * x-forwarded-for format: "client, proxy1, proxy2" — we want the leftmost (client).
 */
export function parseClientIp(
  request: { ip?: string; headers: Record<string, string | string[] | undefined> },
  trustProxyConfigured: boolean = true
): string {
  // When trustProxy is configured, Fastify's request.ip is authoritative
  if (trustProxyConfigured && request.ip && request.ip !== '127.0.0.1') {
    return request.ip
  }

  // Fallback: manually parse x-forwarded-for
  const xff = request.headers['x-forwarded-for']
  if (xff) {
    const headerValue = Array.isArray(xff) ? xff[0] : xff
    if (headerValue) {
      const clientIp = headerValue.split(',')[0]?.trim()
      if (clientIp) return clientIp
    }
  }

  return request.ip || 'unknown'
}

// =============================================================================
// MAIN RATE LIMIT CHECK
// =============================================================================

/**
 * Check domain search rate limits.
 *
 * Checks two limits:
 * 1. IP burst limit (stricter, shorter window) - catches scrapers/bugs
 * 2. Project hourly limit (longer window) - protects against sustained abuse
 *
 * @param projectId - The project making the request
 * @param clientIp - The client IP address
 * @param config - Optional rate limit configuration override
 */
export async function checkDomainSearchRateLimit(
  projectId: string,
  clientIp: string,
  config: Partial<DomainSearchRateLimitConfig> = {}
): Promise<RateLimitResult> {
  const redis = getBestEffortRedis()
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // Fail-closed with in-memory fallback when Redis unavailable
  if (!redis) {
    log.warn(
      { projectId, clientIp, mode: 'degraded' },
      'Redis unavailable, using in-memory fallback for domain search rate limit'
    )
    return checkInMemoryFallback(`fallback:${projectId}:${clientIp}`)
  }

  try {
    // Check IP burst limit first (stricter, shorter window)
    const ipResult = await checkIpBurstLimit(redis, clientIp, cfg.ipLimitPerMinute)
    if (!ipResult.allowed) {
      log.info(
        { projectId, clientIp, count: ipResult.reason },
        'Domain search IP rate limit exceeded'
      )
      return ipResult
    }

    // Check project hourly limit
    const projectResult = await checkProjectHourlyLimit(redis, projectId, cfg.projectLimitPerHour)
    if (!projectResult.allowed) {
      log.info(
        { projectId, clientIp, count: projectResult.reason },
        'Domain search project rate limit exceeded'
      )
      return projectResult
    }

    // Both checks passed
    return projectResult

  } catch (error) {
    log.error(
      { err: error, projectId, clientIp },
      'Redis error during rate limit check, using in-memory fallback'
    )
    return checkInMemoryFallback(`fallback:${projectId}:${clientIp}`)
  }
}

/**
 * Normalize Redis TTL response.
 * Redis ttl() returns: -1 (no expiry), -2 (key missing), or positive seconds.
 * Normalize to always return a positive value for headers.
 */
function normalizeTtl(ttl: number, fallback: number): number {
  if (ttl <= 0) return fallback
  return ttl
}

/**
 * Check IP burst limit (10 requests per minute by default)
 */
async function checkIpBurstLimit(
  redis: Redis,
  clientIp: string,
  limit: number
): Promise<RateLimitResult> {
  const key = `domain-search-ip:${clientIp}`
  const count = await redis.incr(key)

  if (count === 1) {
    await redis.expire(key, 60) // 1 minute window
  }

  if (count > limit) {
    const ttl = await redis.ttl(key)
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: normalizeTtl(ttl, 60),
      reason: `IP rate limit exceeded: ${count}/${limit} per minute`,
    }
  }

  return {
    allowed: true,
    remaining: limit - count,
    resetInSeconds: normalizeTtl(await redis.ttl(key), 60),
  }
}

/**
 * Check project hourly limit (100 requests per hour by default)
 */
async function checkProjectHourlyLimit(
  redis: Redis,
  projectId: string,
  limit: number
): Promise<RateLimitResult> {
  const key = `domain-search-project:${projectId}`
  const count = await redis.incr(key)

  if (count === 1) {
    await redis.expire(key, 3600) // 1 hour window
  }

  if (count > limit) {
    const ttl = await redis.ttl(key)
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: normalizeTtl(ttl, 3600),
      reason: `Project rate limit exceeded: ${count}/${limit} per hour`,
    }
  }

  return {
    allowed: true,
    remaining: limit - count,
    resetInSeconds: normalizeTtl(await redis.ttl(key), 3600),
  }
}
