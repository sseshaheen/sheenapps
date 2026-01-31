/**
 * Inbox Spam Filter
 *
 * Lightweight spam detection for inbound emails.
 * Uses Redis-based rate limiting per sender and configurable domain blocklists.
 *
 * Design: Never throws - always returns a result. Errors are logged and
 * treated as "not spam" to avoid blocking legitimate messages.
 *
 * Part of easy-mode-email-plan.md (Phase 1.5: Post-Receive Pipeline)
 */

import type Redis from 'ioredis'
import { getBestEffortRedis } from '../redisBestEffort'
import { createLogger } from '../../observability/logger'

const log = createLogger('inbox-spam-filter')

// =============================================================================
// TYPES
// =============================================================================

export interface SpamCheckResult {
  isSpam: boolean
  reason?: string
}

export interface SpamFilterConfig {
  /** Max messages per sender per inbox per hour */
  rateLimit?: number
  /** Blocked sender domains (e.g., ['spam.com', 'junk.org']) */
  blockedDomains?: string[]
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default rate limit: 50 messages per sender per inbox per hour */
const DEFAULT_RATE_LIMIT = 50

/** Redis key TTL in seconds (1 hour window) */
const RATE_LIMIT_WINDOW_SECONDS = 3600

/** Common no-reply patterns to never mark as spam */
const NO_REPLY_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^do-not-reply@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
]

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract domain from an email address
 */
function extractDomain(email: string): string | null {
  const match = email.match(/@(.+)$/i)
  return match?.[1]?.toLowerCase() ?? null
}

/**
 * Check if a sender is rate-limited (too many messages per hour)
 */
async function checkRateLimit(
  redis: Redis,
  inboxId: string,
  senderEmail: string,
  limit: number
): Promise<SpamCheckResult> {
  const key = `spam-rate:${inboxId}:${senderEmail.trim().toLowerCase()}`

  try {
    const count = await redis.incr(key)

    // Set TTL on first increment
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS)
    }

    if (count > limit) {
      return {
        isSpam: true,
        reason: `Rate limit exceeded: ${count}/${limit} messages per hour from ${senderEmail}`,
      }
    }
  } catch (error) {
    log.error({ err: error, inboxId, senderEmail }, 'Rate limit check failed (failing open)')
  }

  return { isSpam: false }
}

/**
 * Check if sender domain is in the blocklist
 */
function checkDomainBlocklist(
  senderEmail: string,
  blockedDomains: string[]
): SpamCheckResult {
  if (blockedDomains.length === 0) return { isSpam: false }

  const domain = extractDomain(senderEmail)
  if (!domain) return { isSpam: false }

  const blocked = blockedDomains.some(
    (d) => domain === d.toLowerCase() || domain.endsWith('.' + d.toLowerCase())
  )

  if (blocked) {
    return {
      isSpam: true,
      reason: `Sender domain ${domain} is blocklisted`,
    }
  }

  return { isSpam: false }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Check an inbound message for spam indicators.
 * Never throws - returns { isSpam: false } on any error.
 *
 * @param inboxId - The inbox ID (for rate limiting scope)
 * @param senderEmail - The sender's email address
 * @param config - Optional per-project spam filter configuration
 */
export async function checkSpam(
  inboxId: string,
  senderEmail: string,
  config?: SpamFilterConfig
): Promise<SpamCheckResult> {
  try {
    // Skip spam checks for no-reply addresses (system messages)
    if (NO_REPLY_PATTERNS.some((pattern) => pattern.test(senderEmail))) {
      return { isSpam: false }
    }

    // 1. Domain blocklist check (no Redis needed)
    const blockedDomains = config?.blockedDomains ?? []
    const blocklistResult = checkDomainBlocklist(senderEmail, blockedDomains)
    if (blocklistResult.isSpam) return blocklistResult

    // 2. Rate limiting (requires Redis)
    const redis = getBestEffortRedis()
    if (redis) {
      const rateLimit = config?.rateLimit ?? DEFAULT_RATE_LIMIT
      const rateLimitResult = await checkRateLimit(redis, inboxId, senderEmail, rateLimit)
      if (rateLimitResult.isSpam) return rateLimitResult
    }

    return { isSpam: false }
  } catch (error) {
    log.error({ err: error, inboxId, senderEmail }, 'Unexpected error during spam check (failing open)')
    return { isSpam: false }
  }
}
