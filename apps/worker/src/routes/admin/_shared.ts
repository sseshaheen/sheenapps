/**
 * Shared Admin Route Utilities
 *
 * Common helpers for admin API routes to ensure consistent
 * error responses and validation patterns.
 */

import type { FastifyReply } from 'fastify'

// =============================================================================
// ERROR CODES
// =============================================================================

export type AdminErrorCode =
  | 'VALIDATION_ERROR'    // 400 - Bad request, invalid input
  | 'UNAUTHORIZED'        // 401 - Not authenticated
  | 'FORBIDDEN'           // 403 - Not authorized
  | 'NOT_FOUND'           // 404 - Resource not found
  | 'CONFLICT'            // 409 - Resource conflict
  | 'INTERNAL_ERROR'      // 500 - Server error

// =============================================================================
// ERROR RESPONSE HELPER
// =============================================================================

/**
 * Send a standardized admin error response.
 *
 * @param reply - Fastify reply object
 * @param status - HTTP status code
 * @param code - Error code for programmatic handling
 * @param message - Human-readable error message
 * @param details - Optional additional error details
 *
 * @example
 * return sendAdminError(reply, 404, 'NOT_FOUND', 'User not found')
 * return sendAdminError(reply, 400, 'VALIDATION_ERROR', 'Invalid email', { field: 'email' })
 */
export function sendAdminError(
  reply: FastifyReply,
  status: number,
  code: AdminErrorCode,
  message: string,
  details?: unknown
) {
  return reply.status(status).send({
    success: false,
    error: { code, message, ...(details !== undefined && { details }) },
  })
}

/**
 * Infer appropriate error code from HTTP status.
 * Used when migrating from string-only errors.
 */
export function inferErrorCode(status: number): AdminErrorCode {
  switch (status) {
    case 400: return 'VALIDATION_ERROR'
    case 401: return 'UNAUTHORIZED'
    case 403: return 'FORBIDDEN'
    case 404: return 'NOT_FOUND'
    case 409: return 'CONFLICT'
    default: return 'INTERNAL_ERROR'
  }
}
