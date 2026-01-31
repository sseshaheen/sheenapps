/**
 * AI Rate Limiting Service - Expert Validated Implementation
 *
 * Implements expert-validated patterns:
 * - Time-bucket upsert pattern instead of COUNT(*) queries for better performance
 * - Atomic counter increments via SQL function (avoids race conditions)
 * - Anonymous user support with COALESCE pattern
 * - Fail-closed security approach
 * - Integration with AI service configuration
 *
 * Based on CRITICAL_HIGH_PRIORITY_IMPLEMENTATION_PLAN.md Section 2.3
 */

import { logger } from '@/utils/logger'
import { AI_SERVICES } from '@/config/ai-services'

// Import server-side Supabase client for database operations
async function getServiceClient() {
  const { createServerSupabaseClientNew } = await import('@/lib/supabase-server')
  return await createServerSupabaseClientNew()
}

// Rate limit configuration per provider
interface RateLimitConfig {
  requestsPerMinute: number
  enabled: boolean
}

// Default rate limits (can be overridden by AI_SERVICES config)
const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  'openai': { requestsPerMinute: 60, enabled: true },
  'claude': { requestsPerMinute: 30, enabled: true },
  'mock-fast': { requestsPerMinute: 1000, enabled: false }, // No limits for mocks
  'mock-premium': { requestsPerMinute: 1000, enabled: false },
  'default': { requestsPerMinute: 10, enabled: true }
}

export class AIRateLimiter {
  /**
   * ✅ EXPERT PATTERN: Check rate limit using optimized SQL function with anonymous user support
   */
  static async checkRateLimit(provider: string, userId?: string): Promise<{
    allowed: boolean
    currentCount: number
    maxAllowed: number
    resetTime: Date
  }> {
    const config = this.getRateLimitConfig(provider)

    // Skip rate limiting if disabled for this provider
    if (!config.enabled) {
      return {
        allowed: true,
        currentCount: 0,
        maxAllowed: config.requestsPerMinute,
        resetTime: this.getNextMinuteBoundary()
      }
    }

    const bucket = this.getCurrentMinuteBucket()
    const max = config.requestsPerMinute

    try {
      const supabase = await getServiceClient()

      // ✅ EXPERT PATTERN: Use optimized SQL function with anonymous user support
      const { data, error } = await supabase.rpc('ai_rate_limit_bump', {
        _provider: provider,
        _user: userId ?? null, // ✅ EXPERT: NULL for anonymous users
        _bucket: bucket.toISOString()
      })

      if (error) {
        // ✅ EXPERT NOTE: Expected error code 23505 on unique constraint conflicts (handled by SQL function)
        if (error.code !== '23505') {
          logger.error('Rate limit check failed:', error)
        }

        // ✅ EXPERT: Fail closed for security
        return {
          allowed: false,
          currentCount: max,
          maxAllowed: max,
          resetTime: this.getNextMinuteBoundary()
        }
      }

      const currentCount = data as number
      const allowed = currentCount <= max

      if (!allowed) {
        logger.warn(`Rate limit exceeded for provider ${provider}`, {
          provider,
          userId: userId ? 'authenticated' : 'anonymous',
          currentCount,
          maxAllowed: max,
          bucket: bucket.toISOString()
        })
      }

      return {
        allowed,
        currentCount,
        maxAllowed: max,
        resetTime: this.getNextMinuteBoundary()
      }

    } catch (error) {
      logger.error('Rate limiting error:', error)

      // ✅ EXPERT: Fail closed for security
      return {
        allowed: false,
        currentCount: max,
        maxAllowed: max,
        resetTime: this.getNextMinuteBoundary()
      }
    }
  }

  /**
   * Get rate limit configuration for a provider
   */
  private static getRateLimitConfig(provider: string): RateLimitConfig {
    // Check AI_SERVICES configuration first
    const serviceConfig = AI_SERVICES[provider]
    if (serviceConfig?.rateLimit) {
      return {
        requestsPerMinute: serviceConfig.rateLimit.requestsPerMinute,
        enabled: true // AI services are enabled by default
      }
    }

    // Check default configurations
    const defaultConfig = DEFAULT_RATE_LIMITS[provider] || DEFAULT_RATE_LIMITS.default
    return defaultConfig
  }

  /**
   * Get current minute bucket (rounded to minute boundary)
   */
  private static getCurrentMinuteBucket(): Date {
    const now = new Date()
    now.setSeconds(0, 0) // Round to minute boundary
    return now
  }

  /**
   * Get the next minute boundary for reset time
   */
  private static getNextMinuteBoundary(): Date {
    const next = new Date()
    next.setMinutes(next.getMinutes() + 1)
    next.setSeconds(0, 0)
    return next
  }

  /**
   * Get current usage stats for a provider (for monitoring)
   */
  static async getUsageStats(provider: string, userId?: string): Promise<{
    currentMinute: number
    last5Minutes: number
    lastHour: number
  } | null> {
    try {
      const supabase = await getServiceClient()
      const now = new Date()

      // Current minute bucket
      const currentBucket = this.getCurrentMinuteBucket()

      // Get current minute usage
      const { data: currentMinuteData } = await supabase
        .from('ai_rate_limit_log')
        .select('requests_count')
        .eq('provider', provider)
        .eq('bucket_minute', currentBucket.toISOString())
        .eq('user_id', userId ?? null)
        .single()

      // Get last 5 minutes usage
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
      const { data: last5MinutesData } = await supabase
        .from('ai_rate_limit_log')
        .select('requests_count')
        .eq('provider', provider)
        .eq('user_id', userId ?? null)
        .gte('bucket_minute', fiveMinutesAgo.toISOString())

      // Get last hour usage
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const { data: lastHourData } = await supabase
        .from('ai_rate_limit_log')
        .select('requests_count')
        .eq('provider', provider)
        .eq('user_id', userId ?? null)
        .gte('bucket_minute', oneHourAgo.toISOString())

      return {
        currentMinute: currentMinuteData?.requests_count || 0,
        last5Minutes: last5MinutesData?.reduce((sum, row) => sum + (row.requests_count || 0), 0) || 0,
        lastHour: lastHourData?.reduce((sum, row) => sum + (row.requests_count || 0), 0) || 0
      }

    } catch (error) {
      logger.error('Failed to get usage stats:', error)
      return null
    }
  }

  /**
   * Check if rate limiting is enabled for a provider
   */
  static isRateLimitingEnabled(provider: string): boolean {
    const config = this.getRateLimitConfig(provider)
    return config.enabled
  }

  /**
   * Get the rate limit configuration for a provider (for display)
   */
  static getRateLimit(provider: string): RateLimitConfig {
    return this.getRateLimitConfig(provider)
  }

  /**
   * ✅ EXPERT PATTERN: Middleware-friendly rate limiting with structured response
   */
  static async enforceRateLimit(
    provider: string,
    userId?: string
  ): Promise<{ success: true } | { success: false; error: string; retryAfter: number }> {
    const result = await this.checkRateLimit(provider, userId)

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.resetTime.getTime() - Date.now()) / 1000)

      return {
        success: false,
        error: `Rate limit exceeded for ${provider}. Current: ${result.currentCount}/${result.maxAllowed} requests per minute.`,
        retryAfter: retryAfterSeconds
      }
    }

    return { success: true }
  }

  /**
   * ✅ EXPERT ANALYTICS: Get provider rate limit statistics
   */
  static async getProviderStats(provider?: string, hoursBack: number = 24): Promise<any[]> {
    try {
      const supabase = await getServiceClient()

      const { data, error } = await supabase.rpc('get_rate_limit_stats', {
        _provider: provider,
        _hours_back: hoursBack
      })

      if (error) {
        logger.error('Failed to get rate limit stats:', error)
        return []
      }

      return data || []
    } catch (error) {
      logger.error('Rate limit stats error:', error)
      return []
    }
  }
}