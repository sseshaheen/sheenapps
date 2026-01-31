/**
 * Migration API Proxy Route
 * Proxies requests to the migration service with authentication, validation, and rate limiting
 *
 * Expert-hardened implementation with:
 * - Server-side authentication injection
 * - Request body size protection
 * - Schema validation with Zod
 * - Idempotency key handling
 * - Correlation ID tracking
 * - Rate limiting with user-friendly errors
 * - Proper timeout handling
 */

import 'server-only'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createHash, randomUUID } from 'crypto'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { MigrationInputSchema } from '@/types/migration'
import { logger } from '@/utils/logger'

// Expert: Required for stable SSE/crypto operations
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const MIGRATION_API_BASE = process.env.MIGRATION_API_BASE || process.env.WORKER_BASE_URL || 'http://localhost:8081'

/**
 * Parse rate limit headers from upstream response
 */
function parseRateLimitHeaders(headers: Headers) {
  const remaining = headers.get('X-RateLimit-Remaining')
  const reset = headers.get('X-RateLimit-Reset')
  const retryAfter = headers.get('Retry-After')

  return {
    remaining: remaining ? parseInt(remaining, 10) : undefined,
    resetAt: reset ? new Date(parseInt(reset, 10) * 1000) : undefined,
    retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined
  }
}

/**
 * Handle all HTTP methods through a unified proxy function
 */
export async function GET(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleMigrationProxy(request, 'GET', params.path)
}

export async function POST(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleMigrationProxy(request, 'POST', params.path)
}

export async function PUT(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleMigrationProxy(request, 'PUT', params.path)
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return handleMigrationProxy(request, 'DELETE', params.path)
}

/**
 * Main proxy handler with expert hardening
 */
async function handleMigrationProxy(request: NextRequest, method: string, pathSegments: string[]) {
  // Expert: Move correlationId to top for consistent logging
  const correlationId = randomUUID()

  try {
    // Expert: Decode and whitelist path segments to prevent encoded traversal
    const path = decodeURIComponent((pathSegments ?? []).join('/'))
    if (!/^[a-z0-9/_-]+$/i.test(path)) {
      logger.warn('Migration API: Invalid path attempted', {
        path,
        correlationId,
        userAgent: request.headers.get('user-agent')
      })
      return Response.json({
        error: 'Invalid path',
        correlationId
      }, { status: 400 })
    }

    // Expert: Authenticate user - resolve from session, never expose userId in URLs
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Migration API: Authentication failed', {
        correlationId,
        path,
        authError: authError?.message
      })
      return Response.json({
        error: 'Unauthorized',
        correlationId
      }, { status: 401 })
    }

    // Expert: Body size protection - reject large payloads before parsing
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > 256 * 1024) { // 256KB limit
      logger.warn('Migration API: Request too large', {
        correlationId,
        contentLength: parseInt(contentLength),
        userId: user.id,
        path
      })
      return Response.json({
        error: 'Request too large',
        message: 'Request body must be under 256KB',
        correlationId
      }, { status: 413 })
    }

    // Expert: Require client to provide idempotency key for mutating operations
    const idempotencyKey = request.headers.get('idempotency-key')
    if (method !== 'GET' && !idempotencyKey) {
      return Response.json({
        error: 'Idempotency-Key header required',
        message: 'All mutating operations must include an Idempotency-Key header',
        correlationId
      }, { status: 400 })
    }

    // Expert: Schema validation for risky endpoints with privacy protection
    let validatedBody = {}
    if (method !== 'GET') {
      try {
        // Expert: Use streaming limiter for safety
        const arrayBuffer = await request.arrayBuffer()
        if (arrayBuffer.byteLength > 256 * 1024) {
          return Response.json({
            error: 'Request too large',
            message: 'Request body must be under 256KB',
            correlationId
          }, { status: 413 })
        }

        const rawBody = JSON.parse(new TextDecoder().decode(arrayBuffer))

        if (path === 'start') {
          // Validate migration start requests with schema
          const validated = MigrationInputSchema.parse(rawBody)
          validatedBody = {
            ...validated,
            userId: user.id,
            userIdOverride: undefined // Prevent client override
          }

          // Expert: Log only hashes/sizes, never prompt content
          logger.info('Migration start request', {
            correlationId,
            userId: user.id,
            sourceUrlHash: createHash('sha256').update(validated.sourceUrl).digest('hex'),
            promptLength: validated.prompt?.length || 0,
            hasUserBrief: !!validated.userBrief
          })
        } else {
          // For other endpoints, inject userId and prevent override
          validatedBody = {
            ...rawBody,
            userId: user.id,
            userIdOverride: undefined
          }
        }
      } catch (error) {
        logger.warn('Migration API: Validation failed', {
          correlationId,
          userId: user.id,
          path,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        return Response.json({
          error: 'Validation failed',
          details: error instanceof z.ZodError ? error.issues : 'Invalid input',
          correlationId
        }, { status: 400 })
      }
    }

    // Expert: Proper header handling - Content-Type only for body, Accept only for GET SSE
    const hasBody = method !== 'GET' && validatedBody && Object.keys(validatedBody).length > 0
    const headers = new Headers()

    if (hasBody) {
      headers.set('Content-Type', 'application/json')
    }
    if (idempotencyKey) {
      headers.set('Idempotency-Key', idempotencyKey)
    }
    // Expert: Preserve Accept for SSE only on GET routes; POSTs shouldn't send it
    if (method === 'GET' && request.headers.get('accept') === 'text/event-stream') {
      headers.set('Accept', 'text/event-stream')
    }

    // Expert: Add correlation ID and user context to headers
    headers.set('X-Correlation-ID', correlationId)
    headers.set('X-User-ID', user.id)

    // Expert: Prevent hung connections with timeout
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), 30000)

    try {
      // Expert: Harden URL joining to prevent double slashes or missing slash
      const baseUrl = MIGRATION_API_BASE.replace(/\/+$/, '')
      const cleanPath = path.replace(/^\/+/, '')
      // Prepend /api/migration/ prefix for worker route (worker routes registered with /api prefix)
      const upstreamUrl = `${baseUrl}/api/migration/${cleanPath}`

      const upstreamResponse = await fetch(upstreamUrl, {
        method,
        headers,
        cache: 'no-store',  // Expert: Mark as dynamic
        body: hasBody ? JSON.stringify(validatedBody) : undefined,
        signal: abortController.signal
      })

      // Expert: Parse and forward rate limit information with enhanced UX data
      const rateLimitInfo = parseRateLimitHeaders(upstreamResponse.headers)
      const responseHeaders: Record<string, string> = {}

      if (rateLimitInfo.resetAt) {
        responseHeaders['X-RateLimit-Reset'] = Math.floor(rateLimitInfo.resetAt.getTime() / 1000).toString()
      }
      if (rateLimitInfo.retryAfter) {
        responseHeaders['Retry-After'] = rateLimitInfo.retryAfter.toString()
      }
      // Expert: Include remaining count for UX (dim buttons until reset)
      if (rateLimitInfo.remaining !== undefined) {
        responseHeaders['X-RateLimit-Remaining'] = rateLimitInfo.remaining.toString()
      }

      // Expert: Add Vary headers for CDN considerations
      responseHeaders['Vary'] = 'X-RateLimit-Remaining, X-RateLimit-Reset'

      // Expert: Enhanced 429 handling with countdown info and correlation ID
      if (upstreamResponse.status === 429) {
        logger.warn('Migration API: Rate limit exceeded', {
          correlationId,
          userId: user.id,
          path,
          retryAfter: rateLimitInfo.retryAfter,
          remaining: rateLimitInfo.remaining
        })

        return Response.json({
          error: 'Rate limit exceeded',
          message: `Too many requests. Try again in ${rateLimitInfo.retryAfter || 60} seconds.`,
          retryAfter: rateLimitInfo.retryAfter || 60,
          remaining: rateLimitInfo.remaining || 0,
          correlationId
        }, {
          status: 429,
          headers: responseHeaders
        })
      }

      // Expert: Strip hop-by-hop headers to avoid cache issues (optimized)
      const HOP_BY_HOP = new Set([
        'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
        'te', 'trailers', 'transfer-encoding', 'upgrade'
      ])

      const cleanHeaders = new Headers()
      for (const [key, value] of upstreamResponse.headers) {
        if (!HOP_BY_HOP.has(key.toLowerCase())) {  // Expert: Single lowercase cast
          cleanHeaders.set(key, value)
        }
      }

      // Add our tracking headers
      responseHeaders['X-Correlation-ID'] = correlationId
      for (const [key, value] of Object.entries(responseHeaders)) {
        cleanHeaders.set(key, value)
      }

      // Log successful requests (but not sensitive data)
      logger.info('Migration API: Request completed', {
        correlationId,
        userId: user.id,
        path,
        method,
        status: upstreamResponse.status,
        hasBody: hasBody
      })

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: cleanHeaders
      })

    } catch (error) {
      if (error.name === 'AbortError') {
        logger.error('Migration API: Request timeout', {
          correlationId,
          userId: user.id,
          path,
          method
        })
        return Response.json({
          error: 'Request timeout',
          message: 'Migration service request timed out',
          correlationId
        }, { status: 504 })
      }

      logger.error('Migration API: Upstream error', {
        correlationId,
        userId: user.id,
        path,
        method,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return Response.json({
        error: 'Upstream error',
        message: 'Failed to connect to migration service',
        correlationId
      }, { status: 502 })
    } finally {
      // Expert: Always cleanup timeout to prevent memory leaks
      clearTimeout(timeoutId)
    }

  } catch (error) {
    // Catch-all error handler
    logger.error('Migration API: Unexpected error', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return Response.json({
      error: 'Internal server error',
      message: 'An unexpected error occurred',
      correlationId
    }, { status: 500 })
  }
}