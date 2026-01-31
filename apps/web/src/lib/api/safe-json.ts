/**
 * Safe JSON Parsing Helper
 *
 * Milestone C - Expert Review Round 2 (Jan 2026)
 *
 * Provides consistent error handling for JSON parsing across the app.
 * Prevents "Unexpected token <" errors when APIs return HTML error pages.
 *
 * Usage:
 * ```typescript
 * const data = await safeJson<MyType>(response)
 * if (!data) {
 *   // Handle parse error
 * }
 * ```
 */

/**
 * Safely parse JSON from a Response object
 *
 * Returns null if parsing fails (e.g., HTML error page instead of JSON).
 * This prevents crashes when worker/proxy returns 502/504 HTML pages.
 *
 * @param res - Response object to parse
 * @returns Parsed JSON data or null if parsing fails
 *
 * @example
 * ```typescript
 * const errorData = await safeJson<ApiResponse<never>>(response)
 * const message = errorData?.error?.message || 'Unknown error'
 * ```
 */
export async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    // Response wasn't JSON (likely HTML error page from proxy)
    return null
  }
}

/**
 * Safely parse JSON with a fallback value
 *
 * Similar to safeJson but returns a fallback value instead of null.
 *
 * @param res - Response object to parse
 * @param fallback - Value to return if parsing fails
 * @returns Parsed JSON data or fallback value
 *
 * @example
 * ```typescript
 * const data = await safeJsonWithFallback(response, { ok: false, data: null })
 * ```
 */
export async function safeJsonWithFallback<T>(
  res: Response,
  fallback: T
): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    return fallback
  }
}
