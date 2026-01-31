import { NextRequest, NextResponse } from 'next/server'

interface RateLimitOptions {
  windowMs: number // Time window in milliseconds
  max: number // Max requests per window
  message?: string // Error message
  standardHeaders?: boolean // Return rate limit info in headers
  legacyHeaders?: boolean // Return legacy X-RateLimit headers
  skipSuccessfulRequests?: boolean // Don't count successful requests
  keyGenerator?: (req: NextRequest) => string // Custom key generator
}

interface RateLimitStore {
  hits: number
  resetTime: number
}

// In-memory store (for single instance)
// In production, use Redis or similar for distributed rate limiting
const store = new Map<string, RateLimitStore>()

export class RateLimiter {
  private options: Required<RateLimitOptions>

  constructor(options: RateLimitOptions) {
    this.options = {
      windowMs: options.windowMs,
      max: options.max,
      message: options.message || 'Too many requests, please try again later.',
      standardHeaders: options.standardHeaders ?? true,
      legacyHeaders: options.legacyHeaders ?? false,
      skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
      keyGenerator: options.keyGenerator || this.defaultKeyGenerator,
    }

    // Clean up expired entries periodically
    setInterval(() => this.cleanup(), this.options.windowMs)
  }

  private defaultKeyGenerator(req: NextRequest): string {
    // Get IP from various headers
    const forwarded = req.headers.get('x-forwarded-for')
    const real = req.headers.get('x-real-ip')
    const ip = forwarded?.split(',')[0] || real || 'unknown'

    return `rate-limit:${ip}`
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, data] of store.entries()) {
      if (data.resetTime < now) {
        store.delete(key)
      }
    }
  }

  async check(req: NextRequest): Promise<NextResponse | null> {
    const key = this.options.keyGenerator(req)
    const now = Date.now()

    // Get or create rate limit data
    let data = store.get(key)
    if (!data || data.resetTime < now) {
      data = {
        hits: 0,
        resetTime: now + this.options.windowMs
      }
      store.set(key, data)
    }

    // Increment hit count
    data.hits++

    // Calculate rate limit headers
    const remaining = Math.max(0, this.options.max - data.hits)
    const reset = new Date(data.resetTime).toISOString()
    const retryAfter = Math.ceil((data.resetTime - now) / 1000)

    // Check if limit exceeded
    if (data.hits > this.options.max) {
      const headers: Record<string, string> = {
        'Retry-After': retryAfter.toString(),
      }

      if (this.options.standardHeaders) {
        headers['RateLimit-Limit'] = this.options.max.toString()
        headers['RateLimit-Remaining'] = '0'
        headers['RateLimit-Reset'] = reset
      }

      if (this.options.legacyHeaders) {
        headers['X-RateLimit-Limit'] = this.options.max.toString()
        headers['X-RateLimit-Remaining'] = '0'
        headers['X-RateLimit-Reset'] = data.resetTime.toString()
      }

      return NextResponse.json(
        { error: this.options.message },
        { status: 429, headers }
      )
    }

    // Add rate limit headers to successful responses
    if (this.options.standardHeaders || this.options.legacyHeaders) {
      // Store headers in request for middleware to add to response
      ;(req as any).rateLimitHeaders = {}

      if (this.options.standardHeaders) {
        ;(req as any).rateLimitHeaders['RateLimit-Limit'] = this.options.max.toString()
        ;(req as any).rateLimitHeaders['RateLimit-Remaining'] = remaining.toString()
        ;(req as any).rateLimitHeaders['RateLimit-Reset'] = reset
      }

      if (this.options.legacyHeaders) {
        ;(req as any).rateLimitHeaders['X-RateLimit-Limit'] = this.options.max.toString()
        ;(req as any).rateLimitHeaders['X-RateLimit-Remaining'] = remaining.toString()
        ;(req as any).rateLimitHeaders['X-RateLimit-Reset'] = data.resetTime.toString()
      }
    }

    return null // Request allowed
  }

  // Method to reset rate limit for a key
  reset(key: string) {
    store.delete(key)
  }

  // Method to get current status
  status(key: string): { hits: number; remaining: number; resetTime: Date } | null {
    const data = store.get(key)
    if (!data) return null

    return {
      hits: data.hits,
      remaining: Math.max(0, this.options.max - data.hits),
      resetTime: new Date(data.resetTime)
    }
  }
}

// Pre-configured rate limiters for common use cases
export const rateLimiters = {
  // API generation endpoints (AI, exports, etc)
  generation: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute
    message: 'Too many generation requests. Please wait a moment before trying again.',
  }),

  // Authentication endpoints
  auth: new RateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5, // 5 attempts per 5 minutes
    message: 'Too many authentication attempts. Please try again later.',
    skipSuccessfulRequests: true,
  }),

  // Stripe webhooks (be generous)
  webhook: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Webhook rate limit exceeded.',
  }),

  // General API protection
  api: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: 'API rate limit exceeded. Please slow down.',
  }),
}

// Helper to apply rate limit headers to response
export function applyRateLimitHeaders(req: NextRequest, res: NextResponse): NextResponse {
  const headers = (req as any).rateLimitHeaders
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      res.headers.set(key, value as string)
    })
  }
  return res
}
