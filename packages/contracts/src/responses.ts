import { z } from 'zod'

/**
 * Standard error codes used across the API.
 * Stable codes — UI can map these to user-friendly messages.
 */
export const ErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMIT',
  'QUOTA_EXCEEDED',
  'INTERNAL_ERROR',
  'CREATE_FAILED',
  'FETCH_FAILED',
  'INVALID_REQUEST',
  'INVALID_API_KEY',
  'EASY_MODE_ERROR',
  // Platform auth error codes
  'INVALID_EMAIL',
  'INVALID_CODE',
  'CODE_EXPIRED',
  'TOO_MANY_ATTEMPTS',
  'USER_NOT_FOUND',
  'INVALID_TOKEN',
  'TOKEN_REVOKED',
])

export type ErrorCode = z.infer<typeof ErrorCodeSchema>

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
}).strict()

export type ApiError = z.infer<typeof ApiErrorSchema>

/**
 * Generic API response wrapper.
 * Every endpoint returns { ok: true, data } or { ok: false, error }.
 */
export function apiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('ok', [
    z.object({
      ok: z.literal(true),
      data: dataSchema,
    }).strict(),
    z.object({
      ok: z.literal(false),
      error: ApiErrorSchema,
    }).strict(),
  ])
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }
