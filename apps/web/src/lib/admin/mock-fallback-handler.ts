/**
 * Admin Mock Fallback Handler
 * Controls whether admin endpoints can fall back to mock data
 * CRITICAL: Defaults to false for production safety
 */

import { FEATURE_FLAGS } from '@/config/feature-flags'
import { noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'

export interface MockFallbackOptions {
  mockReason: string
  workerStatus: number
  correlationId: string
  endpoint: string
}

/**
 * Check if mock fallback is allowed for admin endpoints
 * Returns an error response if mock fallback is disabled
 */
export function handleMockFallback(options: MockFallbackOptions) {
  const { mockReason, workerStatus, correlationId, endpoint } = options

  if (!FEATURE_FLAGS.ENABLE_ADMIN_MOCK_FALLBACK) {
    // Log the attempted fallback for monitoring
    logger.warn('Admin endpoint failed - mock fallback disabled', {
      endpoint,
      mockReason,
      workerStatus,
      correlationId,
      mockFallbackEnabled: false
    })

    // Return appropriate error based on worker status
    if (workerStatus === 404) {
      return noCacheErrorResponse(
        { 
          error: 'Endpoint not implemented',
          message: `The admin endpoint ${endpoint} is not available on the worker API`,
          correlation_id: correlationId
        },
        503 // Service Unavailable
      )
    }

    if (workerStatus === 401 || workerStatus === 403) {
      return noCacheErrorResponse(
        { 
          error: 'Authentication failed',
          message: 'Unable to authenticate with admin backend service',
          correlation_id: correlationId
        },
        503
      )
    }

    // Generic error for other cases
    return noCacheErrorResponse(
      { 
        error: 'Admin service unavailable',
        message: `Admin backend service is currently unavailable (${mockReason})`,
        correlation_id: correlationId
      },
      503
    )
  }

  // Mock fallback is enabled - log warning but allow it
  logger.warn('Admin endpoint using mock fallback', {
    endpoint,
    mockReason,
    workerStatus,
    correlationId,
    mockFallbackEnabled: true
  })

  return null // Allow mock data to be returned
}