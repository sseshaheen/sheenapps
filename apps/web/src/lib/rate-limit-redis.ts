/**
 * 🚦 Production-Ready Rate Limiting with Redis
 * Replaces in-memory rate limiting for multi-region deployments
 */

import { NextRequest } from 'next/server'
import { logger } from '@/utils/logger';

// Redis client interface (supports Upstash Redis)
interface RedisClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, options?: { ex?: number }): Promise<void>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<void>
  eval(script: string, keys: string[], args: string[]): Promise<any>
}

// Rate limit configuration
interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  keyGenerator?: (request: NextRequest) => string
  skipIf?: (request: NextRequest) => boolean
  onLimitReached?: (request: NextRequest, remaining: number) => void
}

// Rate limit result
interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  totalRequests: number
}

// Sliding window rate limiter using Redis
export class RedisRateLimiter {
  private redis: RedisClient
  private config: RateLimitConfig

  constructor(redis: RedisClient, config: RateLimitConfig) {
    this.redis = redis
    this.config = config
  }

  /**
   * Check if request is within rate limit using sliding window algorithm
   */
  async checkLimit(request: NextRequest): Promise<RateLimitResult> {
    // Skip rate limiting if configured
    if (this.config.skipIf && this.config.skipIf(request)) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetTime: Date.now() + this.config.windowMs,
        totalRequests: 0
      }
    }

    const key = this.generateKey(request)
    const now = Date.now()
    const windowStart = now - this.config.windowMs

    try {
      // Use Redis sliding window algorithm with Lua script for atomicity
      const luaScript = `
        local key = KEYS[1]
        local window_start = tonumber(ARGV[1])
        local window_end = tonumber(ARGV[2])
        local max_requests = tonumber(ARGV[3])
        local current_time = tonumber(ARGV[4])
        
        -- Remove expired entries
        redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
        
        -- Count current requests in window
        local current_count = redis.call('ZCARD', key)
        
        if current_count < max_requests then
          -- Add current request
          redis.call('ZADD', key, current_time, current_time)
          -- Set expiration for cleanup
          redis.call('EXPIRE', key, math.ceil(tonumber(ARGV[5]) / 1000))
          return {1, max_requests - current_count - 1, current_count + 1}
        else
          return {0, 0, current_count}
        end
      `

      const result = await this.redis.eval(
        luaScript,
        [key],
        [
          windowStart.toString(),
          now.toString(),
          this.config.maxRequests.toString(),
          now.toString(),
          this.config.windowMs.toString()
        ]
      ) as [number, number, number]

      const [allowed, remaining, totalRequests] = result
      const resetTime = now + this.config.windowMs

      const rateLimitResult: RateLimitResult = {
        allowed: allowed === 1,
        remaining,
        resetTime,
        totalRequests
      }

      // Call limit reached callback if configured
      if (!rateLimitResult.allowed && this.config.onLimitReached) {
        this.config.onLimitReached(request, remaining)
      }

      return rateLimitResult

    } catch (error) {
      logger.error('❌ Redis rate limiting error:', error);
      
      // Fail open - allow request if Redis is unavailable
      // In production, you might want to fail closed for security
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
        totalRequests: 0
      }
    }
  }

  /**
   * Generate rate limit key for request
   */
  private generateKey(request: NextRequest): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(request)
    }

    // Default key generation using IP and path
    const ip = this.getClientIP(request)
    const path = request.nextUrl.pathname
    
    return `rate_limit:${ip}:${path}`
  }

  /**
   * Get client IP from request headers
   */
  private getClientIP(request: NextRequest): string {
    return (
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') || // Cloudflare
      request.headers.get('x-client-ip') ||
      'anonymous'
    )
  }
}

/**
 * Create Upstash Redis client (or other Redis-compatible client)
 */
export function createRedisClient(): RedisClient | null {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!redisUrl || !redisToken) {
    logger.warn('⚠️ Redis credentials not found, falling back to in-memory rate limiting');
    return null
  }

  // Upstash Redis REST API client
  return {
    async get(key: string): Promise<string | null> {
      const response = await fetch(`${redisUrl}/get/${encodeURIComponent(key)}`, {
        headers: {
          'Authorization': `Bearer ${redisToken}`,
        },
      })
      
      if (!response.ok) {
        throw new Error(`Redis GET failed: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.result
    },

    async set(key: string, value: string, options?: { ex?: number }): Promise<void> {
      const url = options?.ex 
        ? `${redisUrl}/setex/${encodeURIComponent(key)}/${options.ex}/${encodeURIComponent(value)}`
        : `${redisUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${redisToken}`,
        },
      })
      
      if (!response.ok) {
        throw new Error(`Redis SET failed: ${response.statusText}`)
      }
    },

    async incr(key: string): Promise<number> {
      const response = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${redisToken}`,
        },
      })
      
      if (!response.ok) {
        throw new Error(`Redis INCR failed: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.result
    },

    async expire(key: string, seconds: number): Promise<void> {
      const response = await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${seconds}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${redisToken}`,
        },
      })
      
      if (!response.ok) {
        throw new Error(`Redis EXPIRE failed: ${response.statusText}`)
      }
    },

    async eval(script: string, keys: string[], args: string[]): Promise<any> {
      const response = await fetch(`${redisUrl}/eval`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          script,
          keys,
          args,
        }),
      })
      
      if (!response.ok) {
        throw new Error(`Redis EVAL failed: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.result
    },
  }
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const RateLimiters = {
  // API endpoints
  api: (redis: RedisClient) => new RedisRateLimiter(redis, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    keyGenerator: (req) => `api:${req.headers.get('x-forwarded-for') || 'anonymous'}:${req.nextUrl.pathname}`
  }),

  // Authentication endpoints
  auth: (redis: RedisClient) => new RedisRateLimiter(redis, {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyGenerator: (req) => `auth:${req.headers.get('x-forwarded-for') || 'anonymous'}`
  }),

  // AI generation endpoints
  aiGeneration: (redis: RedisClient) => new RedisRateLimiter(redis, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyGenerator: (req) => `ai:${req.headers.get('x-forwarded-for') || 'anonymous'}`
  }),

  // File uploads
  upload: (redis: RedisClient) => new RedisRateLimiter(redis, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    keyGenerator: (req) => `upload:${req.headers.get('x-forwarded-for') || 'anonymous'}`
  }),
}

/**
 * Middleware helper for rate limiting
 */
export async function withRateLimit(
  request: NextRequest,
  limiterType: keyof typeof RateLimiters
): Promise<Response | null> {
  const redis = createRedisClient()
  
  if (!redis) {
    // Fall back to in-memory rate limiting or skip
    return null
  }

  const rateLimiter = RateLimiters[limiterType](redis)
  const result = await rateLimiter.checkLimit(request)

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        resetTime: result.resetTime,
        remaining: result.remaining
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
          'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
        },
      }
    )
  }

  return null // Allow request to continue
}