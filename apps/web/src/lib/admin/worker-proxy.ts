/**
 * Worker Proxy Helper
 *
 * Centralized helper for admin API routes to proxy requests to the worker.
 * Includes: auth headers, timeout, consistent error handling.
 */

import 'server-only'

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'

const WORKER_BASE_URL = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'
const DEFAULT_TIMEOUT_MS = 12_000 // 12 seconds

interface WorkerFetchOptions extends Omit<RequestInit, 'headers'> {
  /** Additional headers to send */
  headers?: Record<string, string>
  /** Request timeout in milliseconds (default: 12000) */
  timeout?: number
  /** Admin reason header for audit trail */
  adminReason?: string
}

interface WorkerResponse<T = unknown> {
  ok: boolean
  status: number
  data?: T
  error?: string
  correlationId?: string
}

/**
 * Safely parse response body, handling 204, empty body, and non-JSON responses.
 * Also handles cases where JSON comes back with wrong content-type (misconfigured proxies).
 */
async function safeParseBody(response: Response): Promise<unknown> {
  // 204/205: no content by definition
  if (response.status === 204 || response.status === 205) return null

  const text = await response.text()
  if (!text) return null

  const contentType = response.headers.get('content-type') ?? ''

  // If content-type says JSON, parse as JSON
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  // Best-effort: sometimes JSON comes back as text/plain or text/html (misconfigured proxies)
  try {
    return JSON.parse(text)
  } catch {
    // Not JSON, return as text
    return text
  }
}

/**
 * Extract error message from various response payload shapes.
 */
function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload) return fallback
  if (typeof payload === 'string') return payload
  if (typeof payload === 'object' && payload !== null) {
    const p = payload as Record<string, unknown>
    if (typeof p.error === 'string') return p.error
    if (typeof p.message === 'string') return p.message
  }
  return fallback
}

/**
 * Get user-friendly error message based on HTTP status code.
 * Falls back to the original message if status doesn't have a specific mapping.
 */
function getUserFriendlyError(status: number, originalMessage: string): string {
  switch (status) {
    case 401:
      return 'Authentication required. Please log in again.'
    case 403:
      return 'You don\'t have permission to perform this action.'
    case 404:
      return 'The requested resource was not found.'
    case 409:
      return 'Conflict - this resource was modified. Please refresh and try again.'
    case 429:
      return 'Too many requests. Please wait a moment and try again.'
    case 502:
      return 'Service temporarily unavailable. Please try again.'
    case 503:
      return 'Service temporarily unavailable. Please try again.'
    case 504:
      return 'Request timed out. Please try again.'
    default:
      return originalMessage
  }
}

/**
 * Fetch from worker with auth headers, timeout, and consistent error handling.
 *
 * @param path - Worker API path (e.g., '/v1/admin/feature-flags')
 * @param options - Fetch options
 * @returns Normalized response with ok, status, data/error
 *
 * @example
 * // Simple GET
 * const result = await workerFetch('/v1/admin/feature-flags')
 * if (!result.ok) return noCacheErrorResponse({ error: result.error }, result.status)
 * return noCacheResponse(result.data)
 *
 * @example
 * // POST with body
 * const result = await workerFetch('/v1/admin/feature-flags', {
 *   method: 'POST',
 *   body: JSON.stringify(data),
 * })
 */
export async function workerFetch<T = unknown>(
  path: string,
  options: WorkerFetchOptions = {}
): Promise<WorkerResponse<T>> {
  const { timeout = DEFAULT_TIMEOUT_MS, adminReason, headers: customHeaders, ...fetchOptions } = options

  // Generate correlation ID for request tracing
  const correlationId = customHeaders?.['x-correlation-id'] ?? crypto.randomUUID()

  // Get auth headers
  let authHeaders: Record<string, string>
  try {
    authHeaders = await AdminAuthService.getAuthHeaders(adminReason)
  } catch {
    return {
      ok: false,
      status: 401,
      error: 'Authentication required',
      correlationId,
    }
  }

  // Setup abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${WORKER_BASE_URL}${path}`, {
      ...fetchOptions,
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'x-correlation-id': correlationId,
        ...authHeaders,
        ...customHeaders,
      },
      signal: controller.signal,
    })

    // Safe parse handles 204, empty body, non-JSON
    const payload = await safeParseBody(response)

    if (!response.ok) {
      const rawError = extractErrorMessage(payload, `Worker request failed with status ${response.status}`)

      // Log worker errors with full details for debugging
      logger.warn('Worker responded with error', {
        path,
        method: fetchOptions.method || 'GET',
        status: response.status,
        correlationId,
        rawError,
        payload: typeof payload === 'object' ? payload : { text: payload },
      })

      return {
        ok: false,
        status: response.status,
        error: getUserFriendlyError(response.status, rawError),
        correlationId,
      }
    }

    return {
      ok: true,
      status: response.status,
      data: payload as T,
      correlationId,
    }
  } catch (error) {
    // Handle abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('Worker request timeout', { path, timeout, correlationId })
      return {
        ok: false,
        status: 504,
        error: 'Worker request timeout',
        correlationId,
      }
    }

    // Handle network errors
    logger.error('Worker request failed', { path, error, correlationId })
    return {
      ok: false,
      status: 502,
      error: 'Failed to connect to worker',
      correlationId,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Proxy a GET request to the worker and return a Next.js response.
 * Convenience wrapper for simple GET proxies.
 */
export async function proxyGet<T = unknown>(path: string) {
  const result = await workerFetch<T>(path, { method: 'GET' })
  if (!result.ok) {
    return noCacheErrorResponse(
      { error: result.error, correlationId: result.correlationId },
      result.status
    )
  }
  return noCacheResponse(result.data, {
    headers: { 'x-correlation-id': result.correlationId ?? '' },
  })
}

/**
 * Proxy a POST request to the worker and return a Next.js response.
 * Convenience wrapper for simple POST proxies.
 */
export async function proxyPost<T = unknown>(path: string, body: unknown, statusCode = 200) {
  const result = await workerFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!result.ok) {
    return noCacheErrorResponse(
      { error: result.error, correlationId: result.correlationId },
      result.status
    )
  }
  return noCacheResponse(result.data, {
    status: statusCode,
    headers: { 'x-correlation-id': result.correlationId ?? '' },
  })
}

/**
 * Proxy a PUT request to the worker and return a Next.js response.
 */
export async function proxyPut<T = unknown>(path: string, body: unknown) {
  const result = await workerFetch<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!result.ok) {
    return noCacheErrorResponse(
      { error: result.error, correlationId: result.correlationId },
      result.status
    )
  }
  return noCacheResponse(result.data, {
    headers: { 'x-correlation-id': result.correlationId ?? '' },
  })
}

/**
 * Proxy a DELETE request to the worker and return a Next.js response.
 */
export async function proxyDelete<T = unknown>(path: string, body?: unknown) {
  const result = await workerFetch<T>(path, {
    method: 'DELETE',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!result.ok) {
    return noCacheErrorResponse(
      { error: result.error, correlationId: result.correlationId },
      result.status
    )
  }
  return noCacheResponse(result.data, {
    headers: { 'x-correlation-id': result.correlationId ?? '' },
  })
}

/**
 * Proxy a PATCH request to the worker and return a Next.js response.
 */
export async function proxyPatch<T = unknown>(path: string, body: unknown) {
  const result = await workerFetch<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!result.ok) {
    return noCacheErrorResponse(
      { error: result.error, correlationId: result.correlationId },
      result.status
    )
  }
  return noCacheResponse(result.data, {
    headers: { 'x-correlation-id': result.correlationId ?? '' },
  })
}
