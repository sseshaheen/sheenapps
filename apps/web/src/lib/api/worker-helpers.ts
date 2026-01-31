/**
 * Worker API Helper Utilities
 *
 * Provides safe, consistent patterns for calling worker endpoints:
 * - Safe JSON parsing (handles non-JSON responses)
 * - Canonical query string building
 * - Proper headers with Content-Type
 * - Safe integer parsing for pagination
 *
 * EXPERT-VALIDATED: Prevents common worker call pitfalls
 */

import { logger } from '@/utils/logger';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';

/**
 * Safely parse an integer from a query parameter string.
 * Returns undefined if the value is null, empty, or not a valid finite number.
 * Optionally clamps the result to min/max bounds.
 *
 * EXPERT FIX: Prevents NaN from parseInt('abc') being forwarded to worker
 */
export function intParam(
  value: string | null,
  opts: { min?: number; max?: number; defaultValue?: number } = {}
): number | undefined {
  if (!value) return opts.defaultValue
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return opts.defaultValue

  // Apply bounds
  const min = opts.min ?? Number.NEGATIVE_INFINITY
  const max = opts.max ?? Number.POSITIVE_INFINITY
  return Math.max(min, Math.min(max, n))
}

/**
 * Safe JSON parsing result
 */
type SafeJsonResult =
  | { ok: true; json: any }
  | { ok: false; text: string }

/**
 * Safely parse response as JSON, falling back to text if parsing fails.
 * Prevents crashes when worker returns HTML/plain text errors.
 *
 * EXPERT FIX: Handles non-JSON worker responses gracefully
 */
export async function safeParseJson(response: Response): Promise<SafeJsonResult> {
  const text = await response.text()

  try {
    const json = JSON.parse(text)
    return { ok: true, json }
  } catch {
    return { ok: false, text }
  }
}

/**
 * Build canonical query string from params object.
 * URLSearchParams ensures consistent ordering and encoding.
 *
 * EXPERT FIX: Prevents HMAC signature mismatches from query string variations
 */
export function buildCanonicalQueryString(params: Record<string, string | number>): string {
  const searchParams = new URLSearchParams()

  // Sort keys for consistency
  Object.keys(params).sort().forEach(key => {
    searchParams.set(key, String(params[key]))
  })

  const qs = searchParams.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Create headers for worker API calls with proper Content-Type.
 *
 * EXPERT FIX: Explicitly sets Content-Type to prevent parsing issues
 */
export function createWorkerHeaders(
  method: string,
  path: string,
  body: string | null,
  claims?: Record<string, string>
): Record<string, string> {
  const authHeaders = createWorkerAuthHeaders(method, path, body || '', claims)

  // Always set Content-Type for POST/PUT requests
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    return {
      ...authHeaders,
      'Content-Type': 'application/json'
    }
  }

  return authHeaders
}

/**
 * Worker API call configuration
 */
interface WorkerCallConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  queryParams?: Record<string, string | number>
  body?: any
  claims?: Record<string, string>
  extraHeaders?: Record<string, string> // Additional headers (e.g., x-project-id)
  timeout?: number // Optional timeout in milliseconds
}

/**
 * Worker API call result
 */
export interface WorkerCallResult {
  ok: boolean
  status: number
  data?: any
  error?: {
    code: string
    message: string
    rawBody?: string
  }
}

/**
 * Make a worker API call with all best practices applied:
 * - Canonical query strings
 * - Proper Content-Type
 * - Safe JSON parsing
 * - Comprehensive error logging
 *
 * EXPERT-VALIDATED: Production-ready worker call pattern
 */
export async function callWorker(config: WorkerCallConfig): Promise<WorkerCallResult> {
  const { method, path, queryParams, body, claims, extraHeaders, timeout } = config

  // Build canonical query string
  const queryString = queryParams ? buildCanonicalQueryString(queryParams) : ''
  const fullPath = `${path}${queryString}`

  // Prepare body
  const bodyString = body ? JSON.stringify(body) : null

  // Create headers with auth + content-type + extra headers
  const headers = {
    ...createWorkerHeaders(method, fullPath, bodyString, claims),
    ...extraHeaders
  }

  // Build full URL
  const workerUrl = process.env.WORKER_BASE_URL || 'http://localhost:8081'
  const fullUrl = `${workerUrl}${fullPath}`

  logger.info('Calling worker endpoint', {
    method,
    path: fullPath,
    hasBody: !!bodyString,
    bodyLength: bodyString?.length || 0,
    timeout: timeout || 'default'
  })

  try {
    // Make request with optional timeout
    const response = await fetch(fullUrl, {
      method,
      headers,
      body: bodyString,
      ...(timeout ? { signal: AbortSignal.timeout(timeout) } : {})
    })

    // Parse response safely
    const parsed = await safeParseJson(response)
    const rawBody = 'text' in parsed ? parsed.text : undefined
    const errorData = parsed.ok ? parsed.json : null

    if (!response.ok) {
      // Log detailed error information
      logger.error('Worker endpoint failed', {
        status: response.status,
        statusText: response.statusText,
        body: parsed.ok ? parsed.json : rawBody
      })

      return {
        ok: false,
        status: response.status,
        error: {
          code: errorData?.error?.code || 'WORKER_ERROR',
          message: errorData?.error?.message || 'Worker request failed',
          rawBody
        }
      }
    }

    // Success
    logger.info('Worker endpoint succeeded', {
      status: response.status,
      hasData: parsed.ok && !!parsed.json?.data
    })

    return {
      ok: true,
      status: response.status,
      data: parsed.ok ? parsed.json?.data : null
    }

  } catch (error) {
    // Check if it's a timeout error
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('Worker call timed out', {
        timeout,
        error: error.message
      })

      return {
        ok: false,
        status: 504,
        error: {
          code: 'TIMEOUT',
          message: `Request timed out after ${timeout}ms`
        }
      }
    }

    logger.error('Worker call exception', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return {
      ok: false,
      status: 500,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to communicate with worker service'
      }
    }
  }
}
