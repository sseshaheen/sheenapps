import { NextRequest, NextResponse } from 'next/server'
import { rateLimiters } from '@/lib/rate-limiter'

// Define which paths need rate limiting and their corresponding limiters
const rateLimitConfig: Record<string, keyof typeof rateLimiters> = {
  '/api/ai/chat': 'generation',
  '/api/ai/generate': 'generation',
  '/api/export': 'generation',
  '/api/auth/login': 'auth',
  '/api/auth/signup': 'auth',
  '/api/auth/reset-password': 'auth',
  '/api/stripe-webhook': 'webhook',
  '/api/cashier-webhook': 'webhook',
}

export async function rateLimitMiddleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Find matching rate limiter
  const limiterKey = Object.entries(rateLimitConfig).find(([path]) => 
    pathname.startsWith(path)
  )?.[1]

  if (!limiterKey) {
    // No rate limiting for this path
    return NextResponse.next()
  }

  // Apply rate limiting
  const limiter = rateLimiters[limiterKey]
  const rateLimitResult = await limiter.check(request)

  if (rateLimitResult) {
    // Rate limit exceeded
    return rateLimitResult
  }

  // Continue with request
  const response = NextResponse.next()

  // Add rate limit headers to response
  const headers = (request as any).rateLimitHeaders
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value as string)
    })
  }

  return response
}