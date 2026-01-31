/**
 * Request ID Utilities (Client-Safe)
 *
 * Provides functions for generating trace request IDs for observability.
 *
 * IMPORTANT: This file is client-safe and contains NO secrets.
 * The trace request ID is for observability/logging only, NOT authentication.
 *
 * Security Note:
 * - HMAC signing happens server-side only (in API routes)
 * - The browser only sends trace IDs for logging correlation
 * - Authentication uses server-generated auth request IDs (see worker-auth-server.ts)
 */

'use client'

/**
 * Generate a trace request ID for observability.
 *
 * This ID is sent with requests for logging and tracing purposes.
 * It is NOT used for authentication or replay protection.
 *
 * Format: trace_{timestamp}_{randomSuffix}
 *
 * @returns A unique trace request ID
 */
export function generateTraceRequestId(): string {
  const timestamp = Date.now()
  const randomSuffix = crypto.randomUUID().slice(0, 8)
  return `trace_${timestamp}_${randomSuffix}`
}

/**
 * Parse a trace request ID to extract its components.
 * Useful for logging analysis.
 *
 * @param traceRequestId - The trace request ID to parse
 * @returns Parsed components or null if invalid format
 */
export function parseTraceRequestId(traceRequestId: string): {
  timestamp: number
  randomSuffix: string
} | null {
  const match = traceRequestId.match(/^trace_(\d+)_([a-f0-9]{8})$/)
  if (!match) return null

  return {
    timestamp: parseInt(match[1], 10),
    randomSuffix: match[2]
  }
}

/**
 * Check if a trace request ID is valid format.
 *
 * @param traceRequestId - The ID to validate
 * @returns True if valid format
 */
export function isValidTraceRequestId(traceRequestId: string | null | undefined): traceRequestId is string {
  if (!traceRequestId) return false
  return /^trace_\d+_[a-f0-9]{8}$/.test(traceRequestId)
}

/**
 * Get a shortened version of the trace request ID for logging.
 *
 * @param traceRequestId - The full trace request ID
 * @returns Shortened version
 */
export function shortenTraceRequestId(traceRequestId: string | null | undefined): string {
  if (!traceRequestId) return 'null'
  if (traceRequestId.length <= 20) return traceRequestId
  return `${traceRequestId.slice(0, 12)}...${traceRequestId.slice(-8)}`
}
