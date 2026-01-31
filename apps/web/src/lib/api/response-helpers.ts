/**
 * API Response Helpers
 * Standardized response utilities with proper cache prevention
 */

import { NextResponse } from 'next/server'

/**
 * Standard no-cache headers for dynamic API responses
 * Implements the "triple-layer cache busting" pattern
 */
export const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'Surrogate-Control': 'no-store',
  'X-Timestamp': new Date().toISOString() // For debugging cache issues
} as const

/**
 * Headers for private cached content (user-specific)
 */
export const PRIVATE_CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=0, must-revalidate',
  'X-Timestamp': new Date().toISOString()
} as const

/**
 * Create a JSON response with no-cache headers
 * Use for all dynamic data that should never be cached
 */
export function noCacheResponse<T = any>(
  data: T,
  init?: ResponseInit
): NextResponse<T> {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...NO_CACHE_HEADERS,
      ...init?.headers
    }
  })
}

/**
 * Create an error response with no-cache headers
 */
export function noCacheErrorResponse(
  error: string | { error: string; [key: string]: any },
  status: number = 500,
  additionalHeaders?: Record<string, string>
): NextResponse {
  // Extract headers if they were included in the error object
  const { headers: errorHeaders, ...errorData } = typeof error === 'string' 
    ? { error } 
    : error
  
  const finalErrorData = typeof error === 'string' ? { error } : errorData
  
  return NextResponse.json(finalErrorData, {
    status,
    headers: {
      ...NO_CACHE_HEADERS,
      ...additionalHeaders,
      ...errorHeaders
    }
  })
}

/**
 * Create a private cache response (user-specific data)
 */
export function privateCacheResponse<T = any>(
  data: T,
  init?: ResponseInit
): NextResponse<T> {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...PRIVATE_CACHE_HEADERS,
      ...init?.headers
    }
  })
}

/**
 * Route configuration exports for dynamic routes
 * Add these to the top of your route files:
 * 
 * export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG
 */
export const DYNAMIC_ROUTE_CONFIG = {
  dynamic: 'force-dynamic' as const,
  revalidate: 0,
  fetchCache: 'force-no-store' as const
}