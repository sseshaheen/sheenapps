/**
 * Safe pagination utilities for Next.js API routes
 *
 * Prevents NaN from being passed to worker when limit/offset are non-numeric.
 * Applies reasonable clamping to prevent performance issues from unbounded queries.
 */

/**
 * Safely parse an integer from a string with default and bounds
 *
 * @param value - String value to parse (from query params)
 * @param defaultValue - Default value if parsing fails
 * @param min - Minimum allowed value (optional)
 * @param max - Maximum allowed value (optional)
 * @returns Parsed, clamped integer
 */
function parseIntSafe(
  value: string | null | undefined,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN
  let result = Number.isFinite(parsed) ? parsed : defaultValue

  if (min !== undefined) {
    result = Math.max(result, min)
  }

  if (max !== undefined) {
    result = Math.min(result, max)
  }

  return result
}

/**
 * Parse limit parameter with safe defaults and bounds
 *
 * @param value - Limit value from query params
 * @param defaultLimit - Default limit (default: 50)
 * @param maxLimit - Maximum allowed limit (default: 200)
 * @returns Safe limit value
 */
export function parseLimit(
  value: string | null | undefined,
  defaultLimit: number = 50,
  maxLimit: number = 200
): number {
  return parseIntSafe(value, defaultLimit, 1, maxLimit)
}

/**
 * Parse offset parameter with safe defaults and bounds
 *
 * @param value - Offset value from query params
 * @param defaultOffset - Default offset (default: 0)
 * @returns Safe offset value (minimum 0)
 */
export function parseOffset(
  value: string | null | undefined,
  defaultOffset: number = 0
): number {
  return parseIntSafe(value, defaultOffset, 0)
}
