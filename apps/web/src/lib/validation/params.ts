import { z } from 'zod'

/**
 * Type guard for HTTP-like errors with status code
 * More defensive than `error instanceof Error && 'status' in error`
 * Works with plain objects, custom errors, etc.
 */
export function isHttpError(err: unknown): err is { status: number; code?: string; message?: string } {
  if (!err || typeof err !== 'object') return false
  const maybeStatus = (err as any).status
  return typeof maybeStatus === 'number' && maybeStatus >= 100 && maybeStatus < 600
}

/**
 * UUID v4 validation schema
 * Use for projectId, entryId, and other UUID fields
 */
export const UuidSchema = z.string().uuid()

/**
 * Domain name validation schema
 * Basic validation - detailed validation happens in worker
 */
export const DomainSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(\.[a-z]{2,})+$/i)

/**
 * Safe parameter parsing with validation
 * Throws error with attached status/code for easy error handling
 */
export function parseUuid(value: string, fieldName: string = 'id'): string {
  const result = UuidSchema.safeParse(value)
  if (!result.success) {
    const error = new Error(`Invalid ${fieldName}: must be a valid UUID`)
    ;(error as any).status = 400
    ;(error as any).code = 'VALIDATION_ERROR'
    throw error
  }
  return result.data
}

/**
 * Normalize and validate a domain name
 * - Lowercases
 * - Trims whitespace
 * - Strips protocol if present
 * - Validates format
 * Throws error with attached status/code for easy error handling
 */
export function parseDomain(value: string): string {
  // Normalize: trim, lowercase, strip protocol
  let normalized = value.trim().toLowerCase()
  normalized = normalized.replace(/^https?:\/\//, '')
  // Strip trailing path/query
  normalized = normalized.split('/')[0].split('?')[0]

  const result = DomainSchema.safeParse(normalized)
  if (!result.success) {
    const error = new Error('Invalid domain: must be a valid hostname (e.g., example.com)')
    ;(error as any).status = 400
    ;(error as any).code = 'VALIDATION_ERROR'
    throw error
  }
  return result.data
}
