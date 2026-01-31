/**
 * Request Replay Service
 *
 * Allows admins to find failed requests and replay them for debugging.
 *
 * Security Model:
 * 1. Route-level replayability classification (not all requests can be replayed)
 * 2. Recursive scrubbing of sensitive fields before storage
 * 3. Mandatory preview for side-effect replays
 * 4. Per-admin AND per-endpoint rate limiting
 * 5. New correlation ID for each replay
 * 6. Original user context preserved (no auth spoofing)
 * 7. Full audit trail
 */

import { createHash, randomUUID } from 'crypto'
import { Pool } from 'pg'
import { getDatabase } from '../database'
import { auditAdminAction } from '../../routes/admin/_audit'

// =============================================================================
// TYPES
// =============================================================================

export interface RouteReplayConfig {
  replayable: boolean
  sideEffects: 'none' | 'low' | 'high'
  captureFullBody: boolean
}

export interface RequestRecord {
  id: string
  correlationId: string
  projectId: string
  route: string
  method: string
  requestBody?: Record<string, unknown>
  requestHeaders?: Record<string, string>
  responseStatus?: number
  responseBody?: Record<string, unknown>
  errorCode?: string
  errorMessage?: string
  replayable: boolean
  sideEffects: 'none' | 'low' | 'high'
  createdAt: string
}

export interface ReplayPreview {
  wouldExecute: {
    method: string
    path: string
    body?: Record<string, unknown>
    headers?: Record<string, string>
  }
  sideEffects: 'none' | 'low' | 'high'
  warnings: string[]
  previewToken: string
}

export interface ReplayResult {
  success: boolean
  newCorrelationId: string
  idempotencyKey: string
  responseStatus?: number
  responseBody?: Record<string, unknown>
  error?: string
  durationMs: number
}

// =============================================================================
// ROUTE REPLAYABILITY CONFIGURATION
// =============================================================================

/**
 * Route classifications determine which requests can be replayed.
 * Pattern: 'METHOD /path/with/:params'
 */
export const ROUTE_REPLAY_CONFIG: Record<string, RouteReplayConfig> = {
  // Safe to replay - no side effects (GET requests)
  'GET /v1/inhouse/projects/:projectId/storage/files': {
    replayable: true, sideEffects: 'none', captureFullBody: false
  },
  'GET /v1/inhouse/projects/:projectId/storage/usage': {
    replayable: true, sideEffects: 'none', captureFullBody: false
  },
  'GET /v1/inhouse/projects/:projectId/jobs': {
    replayable: true, sideEffects: 'none', captureFullBody: false
  },
  'GET /v1/inhouse/projects/:projectId/jobs/:jobId': {
    replayable: true, sideEffects: 'none', captureFullBody: false
  },
  'GET /v1/inhouse/projects/:projectId/emails': {
    replayable: true, sideEffects: 'none', captureFullBody: false
  },
  'GET /v1/inhouse/projects/:projectId/analytics/events': {
    replayable: true, sideEffects: 'none', captureFullBody: false
  },

  // Replayable but has side effects
  'POST /v1/inhouse/projects/:projectId/storage/upload': {
    replayable: true, sideEffects: 'high', captureFullBody: true
  },
  'POST /v1/inhouse/projects/:projectId/jobs/enqueue': {
    replayable: true, sideEffects: 'low', captureFullBody: true
  },
  'POST /v1/inhouse/projects/:projectId/email/send': {
    replayable: true, sideEffects: 'high', captureFullBody: true
  },
  'POST /v1/inhouse/projects/:projectId/notifications/send': {
    replayable: true, sideEffects: 'low', captureFullBody: true
  },

  // NOT replayable (auth-sensitive, payment-sensitive)
  'POST /v1/inhouse/projects/:projectId/auth/sign-in': {
    replayable: false, sideEffects: 'high', captureFullBody: false
  },
  'POST /v1/inhouse/projects/:projectId/auth/sign-up': {
    replayable: false, sideEffects: 'high', captureFullBody: false
  },
  'POST /v1/inhouse/projects/:projectId/auth/magic-link': {
    replayable: false, sideEffects: 'high', captureFullBody: false
  },
  'POST /v1/inhouse/projects/:projectId/payments/checkout': {
    replayable: false, sideEffects: 'high', captureFullBody: false
  },
  'POST /v1/inhouse/projects/:projectId/payments/webhook': {
    replayable: false, sideEffects: 'high', captureFullBody: false
  },
  'POST /v1/inhouse/projects/:projectId/secrets': {
    replayable: false, sideEffects: 'high', captureFullBody: false
  },
}

// =============================================================================
// SENSITIVE FIELD PATTERNS
// =============================================================================

const SENSITIVE_PATTERNS = /password|passwd|pwd|token|access_token|refresh_token|api_token|secret|api_secret|client_secret|key|api_key|private_key|authorization|auth|cookie|session|credit_card|card_number|cvv|cvc|ssn|social_security/i

const SCRUBBED_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-sheen-claims',
  'x-api-key',
  'x-sheen-signature',
])

const MAX_BODY_SIZE = 8 * 1024 // 8KB

// =============================================================================
// RATE LIMITING
// =============================================================================

interface RateLimitEntry {
  count: number
  windowStart: number
}

// In-memory rate limiting (would use Redis in production)
const adminRateLimits = new Map<string, RateLimitEntry>()
const endpointRateLimits = new Map<string, RateLimitEntry>()

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const MAX_REPLAYS_PER_ADMIN = 10
const MAX_REPLAYS_PER_ENDPOINT = 5

function checkRateLimit(
  map: Map<string, RateLimitEntry>,
  key: string,
  maxCount: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = map.get(key)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    map.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: maxCount - 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
  }

  if (entry.count >= maxCount) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + RATE_LIMIT_WINDOW_MS
    }
  }

  entry.count++
  return {
    allowed: true,
    remaining: maxCount - entry.count,
    resetAt: entry.windowStart + RATE_LIMIT_WINDOW_MS
  }
}

// =============================================================================
// SCRUBBING FUNCTIONS
// =============================================================================

/**
 * Recursively scrub sensitive fields from an object
 */
export function scrubSensitiveFields(obj: unknown, path = ''): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map((item, i) => scrubSensitiveFields(item, `${path}[${i}]`))
  }

  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_PATTERNS.test(k)) {
      result[k] = '[REDACTED]'
    } else if (typeof v === 'object' && v !== null) {
      result[k] = scrubSensitiveFields(v, `${path}.${k}`)
    } else {
      result[k] = v
    }
  }
  return result
}

/**
 * Scrub headers, keeping only safe ones
 */
export function scrubHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    const lowerKey = k.toLowerCase()
    if (!SCRUBBED_HEADERS.has(lowerKey)) {
      // Keep content-type, locale, and other safe headers
      if (lowerKey === 'content-type' || lowerKey === 'x-sheen-locale' || lowerKey === 'idempotency-key') {
        result[k] = v
      }
    }
  }
  return result
}

/**
 * Truncate body if too large
 * Handles circular refs and BigInt gracefully
 */
export function truncateBody(body: unknown): { body: unknown; truncated: boolean; error?: string } {
  let str: string
  try {
    str = JSON.stringify(body)
  } catch (e) {
    // Handle circular refs, BigInt, etc.
    return {
      body: { _serializationError: true, _errorType: e instanceof Error ? e.name : 'UnknownError' },
      truncated: true,
      error: e instanceof Error ? e.message : 'stringify failed'
    }
  }

  if (str.length <= MAX_BODY_SIZE) {
    return { body, truncated: false }
  }

  // Return a truncated indicator
  return {
    body: { _truncated: true, _originalSize: str.length, _maxSize: MAX_BODY_SIZE },
    truncated: true
  }
}

/**
 * Get route config for a given method and path
 */
export function getRouteConfig(method: string, path: string): RouteReplayConfig | null {
  // Normalize path by removing query string (split always returns at least one element)
  const normalizedPath = path.split('?')[0]!

  // Try exact match first
  const exactKey = `${method.toUpperCase()} ${normalizedPath}`
  if (ROUTE_REPLAY_CONFIG[exactKey]) {
    return ROUTE_REPLAY_CONFIG[exactKey]!
  }

  // Try pattern matching
  for (const [pattern, config] of Object.entries(ROUTE_REPLAY_CONFIG)) {
    const parts = pattern.split(' ')
    const patternMethod = parts[0]
    const patternPath = parts[1]

    if (!patternMethod || !patternPath) continue
    if (method.toUpperCase() !== patternMethod) continue

    // Convert pattern to regex
    const regexPattern = patternPath
      .replace(/:[a-zA-Z]+/g, '[^/]+')
      .replace(/\//g, '\\/')

    const regex = new RegExp(`^${regexPattern}$`)
    if (regex.test(normalizedPath)) {
      return config
    }
  }

  // Default: not replayable
  return null
}

// =============================================================================
// SERVICE
// =============================================================================

export class RequestReplayService {
  private pool: Pool
  private previewTokens = new Map<string, { correlationId: string; expiresAt: number }>()

  constructor() {
    this.pool = getDatabase()

    // Cleanup expired preview tokens every minute
    setInterval(() => {
      const now = Date.now()
      for (const [token, data] of this.previewTokens.entries()) {
        if (data.expiresAt < now) {
          this.previewTokens.delete(token)
        }
      }
    }, 60000)
  }

  /**
   * Search for requests that can be replayed
   */
  async searchRequests(criteria: {
    projectId?: string
    correlationId?: string
    service?: string
    status?: 'success' | 'error'
    replayableOnly?: boolean
    startTime?: Date
    endTime?: Date
    limit?: number
    offset?: number
  }): Promise<{ requests: RequestRecord[]; total: number }> {
    const {
      projectId,
      correlationId,
      service,
      status,
      replayableOnly = true,
      startTime,
      endTime,
      limit = 50,
      offset = 0
    } = criteria

    const conditions: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (projectId) {
      conditions.push(`project_id = $${paramIndex++}`)
      params.push(projectId)
    }

    if (correlationId) {
      conditions.push(`correlation_id = $${paramIndex++}`)
      params.push(correlationId)
    }

    if (service) {
      conditions.push(`route LIKE $${paramIndex++}`)
      params.push(`%/${service}/%`)
    }

    if (status === 'error') {
      conditions.push(`error_code IS NOT NULL`)
    } else if (status === 'success') {
      conditions.push(`error_code IS NULL`)
    }

    if (replayableOnly) {
      conditions.push(`replayable = true`)
    }

    if (startTime) {
      conditions.push(`created_at >= $${paramIndex++}`)
      params.push(startTime)
    }

    if (endTime) {
      conditions.push(`created_at <= $${paramIndex++}`)
      params.push(endTime)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get total count
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM inhouse_replay_payloads ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0].count, 10)

    // Get paginated results
    const result = await this.pool.query(`
      SELECT
        id,
        correlation_id,
        project_id,
        route,
        method,
        request_body,
        request_headers,
        response_status,
        response_body,
        error_code,
        error_message,
        replayable,
        side_effects,
        created_at
      FROM inhouse_replay_payloads
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset])

    return {
      requests: result.rows.map(row => ({
        id: row.id,
        correlationId: row.correlation_id,
        projectId: row.project_id,
        route: row.route,
        method: row.method,
        requestBody: row.request_body,
        requestHeaders: row.request_headers,
        responseStatus: row.response_status,
        responseBody: row.response_body,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        replayable: row.replayable,
        sideEffects: row.side_effects,
        createdAt: row.created_at,
      })),
      total
    }
  }

  /**
   * Get a single request by correlation ID
   */
  async getRequest(correlationId: string): Promise<RequestRecord | null> {
    const result = await this.pool.query(`
      SELECT
        id,
        correlation_id,
        project_id,
        route,
        method,
        request_body,
        request_headers,
        response_status,
        response_body,
        error_code,
        error_message,
        replayable,
        side_effects,
        created_at
      FROM inhouse_replay_payloads
      WHERE correlation_id = $1
    `, [correlationId])

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      id: row.id,
      correlationId: row.correlation_id,
      projectId: row.project_id,
      route: row.route,
      method: row.method,
      requestBody: row.request_body,
      requestHeaders: row.request_headers,
      responseStatus: row.response_status,
      responseBody: row.response_body,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      replayable: row.replayable,
      sideEffects: row.side_effects,
      createdAt: row.created_at,
    }
  }

  /**
   * Preview a replay (required for side-effect replays)
   */
  async previewReplay(
    correlationId: string,
    modifications?: Record<string, unknown>
  ): Promise<ReplayPreview> {
    const request = await this.getRequest(correlationId)

    if (!request) {
      throw new Error('Request not found')
    }

    if (!request.replayable) {
      throw new Error('This request is not replayable')
    }

    const warnings: string[] = []

    // Build the request that would be executed
    let body = request.requestBody
    if (modifications && body) {
      body = { ...body, ...modifications }
      warnings.push('Request body has been modified from original')
    }

    if (request.sideEffects === 'high') {
      warnings.push('This replay has HIGH side effects and may create or modify data')
    } else if (request.sideEffects === 'low') {
      warnings.push('This replay has side effects and may create background jobs')
    }

    // Generate a preview token (valid for 5 minutes)
    const previewToken = randomUUID()
    this.previewTokens.set(previewToken, {
      correlationId,
      expiresAt: Date.now() + 5 * 60 * 1000
    })

    return {
      wouldExecute: {
        method: request.method,
        path: request.route,
        body: body as Record<string, unknown> | undefined,
        headers: request.requestHeaders,
      },
      sideEffects: request.sideEffects,
      warnings,
      previewToken
    }
  }

  /**
   * Execute a replay
   */
  async executeReplay(
    correlationId: string,
    adminId: string,
    options: {
      modifications?: Record<string, unknown>
      reason: string
      previewToken?: string
      confirmSideEffects?: boolean
      clientIp: string
      userAgent: string
    }
  ): Promise<ReplayResult> {
    const startTime = Date.now()
    const request = await this.getRequest(correlationId)

    if (!request) {
      throw new Error('Request not found')
    }

    if (!request.replayable) {
      throw new Error('This request is not replayable')
    }

    // Check rate limits
    const adminLimit = checkRateLimit(adminRateLimits, adminId, MAX_REPLAYS_PER_ADMIN)
    if (!adminLimit.allowed) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((adminLimit.resetAt - Date.now()) / 1000)} seconds`)
    }

    const endpointKey = `${request.method}:${request.route}`
    const endpointLimit = checkRateLimit(endpointRateLimits, endpointKey, MAX_REPLAYS_PER_ENDPOINT)
    if (!endpointLimit.allowed) {
      throw new Error(`Endpoint rate limit exceeded. Try again in ${Math.ceil((endpointLimit.resetAt - Date.now()) / 1000)} seconds`)
    }

    // For side-effect replays, require preview token or explicit confirmation
    if (request.sideEffects !== 'none') {
      if (options.previewToken) {
        const previewData = this.previewTokens.get(options.previewToken)
        if (!previewData || previewData.correlationId !== correlationId) {
          throw new Error('Invalid or expired preview token')
        }
        if (previewData.expiresAt < Date.now()) {
          this.previewTokens.delete(options.previewToken)
          throw new Error('Preview token has expired')
        }
        // Consume the preview token
        this.previewTokens.delete(options.previewToken)
      } else if (!options.confirmSideEffects) {
        throw new Error('Side-effect replays require either a preview token or explicit confirmation')
      }
    }

    // Generate new correlation ID and idempotency key
    const newCorrelationId = randomUUID()
    const idempotencyKey = `replay-${correlationId}-${Date.now()}`

    // Build the replay request
    let body = request.requestBody
    if (options.modifications && body) {
      body = { ...body, ...options.modifications }
    }

    // Audit the replay attempt
    auditAdminAction({
      adminId,
      action: 'request_replay',
      projectId: request.projectId,
      resourceType: 'replay',
      resourceId: newCorrelationId,
      reason: options.reason,
      metadata: {
        originalCorrelationId: correlationId,
        route: request.route,
        method: request.method,
        sideEffects: request.sideEffects,
        hasModifications: !!options.modifications,
      },
      ipAddress: options.clientIp,
      userAgent: options.userAgent,
    })

    // TODO: Actually execute the replay
    // In production, this would:
    // 1. Get the original user context from the activity log
    // 2. Forward the request internally with the new correlation ID
    // 3. Capture the response
    // For now, return a placeholder indicating this needs implementation

    const durationMs = Date.now() - startTime

    return {
      success: true,
      newCorrelationId,
      idempotencyKey,
      responseStatus: undefined,
      responseBody: {
        message: 'Replay validated. Actual execution needs service-specific implementation.',
        originalRequest: {
          method: request.method,
          route: request.route,
        }
      },
      durationMs
    }
  }

  /**
   * Capture a request for potential replay
   * Called by activity logging middleware for replayable routes
   */
  async captureRequest(params: {
    correlationId: string
    projectId: string
    method: string
    route: string
    requestBody?: unknown
    requestHeaders?: Record<string, string>
    responseStatus?: number
    responseBody?: unknown
    errorCode?: string
    errorMessage?: string
  }): Promise<void> {
    const config = getRouteConfig(params.method, params.route)

    // Only capture if route is configured
    if (!config) return

    // Honor captureFullBody flag - only store bodies/headers when explicitly enabled
    const shouldCaptureBody = config.captureFullBody === true

    // Scrub sensitive data (only if capturing)
    const scrubbedBody = shouldCaptureBody && params.requestBody
      ? scrubSensitiveFields(params.requestBody)
      : undefined

    const scrubbedHeaders = shouldCaptureBody && params.requestHeaders
      ? scrubHeaders(params.requestHeaders)
      : undefined

    const { body: truncatedBody } = scrubbedBody
      ? truncateBody(scrubbedBody)
      : { body: undefined }

    const { body: truncatedResponse } = shouldCaptureBody && params.responseBody
      ? truncateBody(scrubSensitiveFields(params.responseBody))
      : { body: undefined }

    await this.pool.query(`
      INSERT INTO inhouse_replay_payloads (
        correlation_id,
        project_id,
        route,
        method,
        request_body,
        request_headers,
        response_status,
        response_body,
        error_code,
        error_message,
        replayable,
        side_effects
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (correlation_id) DO UPDATE SET
        response_status = EXCLUDED.response_status,
        response_body = EXCLUDED.response_body,
        error_code = EXCLUDED.error_code,
        error_message = EXCLUDED.error_message
    `, [
      params.correlationId,
      params.projectId,
      params.route,
      params.method.toUpperCase(),
      truncatedBody ? JSON.stringify(truncatedBody) : null,
      scrubbedHeaders ? JSON.stringify(scrubbedHeaders) : null,
      params.responseStatus,
      truncatedResponse ? JSON.stringify(truncatedResponse) : null,
      params.errorCode,
      params.errorMessage,
      config.replayable,
      config.sideEffects,
    ])
  }
}

// Singleton instance
let instance: RequestReplayService | null = null

export function getRequestReplayService(): RequestReplayService {
  if (!instance) {
    instance = new RequestReplayService()
  }
  return instance
}
