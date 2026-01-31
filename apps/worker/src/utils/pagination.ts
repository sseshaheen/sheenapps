/**
 * Pagination utilities for consistent limit/offset clamping across endpoints
 *
 * Prevents performance issues from unbounded limit values (e.g., limit=100000).
 * Ensures all pagination endpoints follow the same constraints.
 *
 * Usage:
 *   const { limit, offset } = parsePage(request.query)
 *   // Use limit and offset in SQL queries
 */

export interface PageParams {
  limit: number
  offset: number
}

export interface ParsePageOptions {
  /**
   * Default limit if not specified in request
   * @default 50
   */
  defaultLimit?: number

  /**
   * Default offset if not specified in request
   * @default 0
   */
  defaultOffset?: number

  /**
   * Maximum allowed limit (hard cap)
   * @default 200
   */
  maxLimit?: number

  /**
   * Minimum allowed limit
   * @default 1
   */
  minLimit?: number
}

/**
 * Parse and clamp pagination parameters from request query/body
 *
 * @param input - Request query or body object containing optional limit/offset
 * @param options - Configuration for defaults and limits
 * @returns Validated and clamped limit and offset values
 *
 * @example
 * // In a route handler
 * const { limit, offset } = parsePage(request.query)
 * const result = await db.query('SELECT * FROM users LIMIT $1 OFFSET $2', [limit, offset])
 *
 * @example
 * // With custom defaults
 * const { limit, offset } = parsePage(request.query, { defaultLimit: 25, maxLimit: 100 })
 */
export function parsePage(
  input: any,
  options: ParsePageOptions = {}
): PageParams {
  const {
    defaultLimit = 50,
    defaultOffset = 0,
    maxLimit = 200,
    minLimit = 1
  } = options

  // Parse limit from input
  const limitRaw = Number(input?.limit ?? defaultLimit)
  const limit = Math.min(
    Math.max(
      Number.isFinite(limitRaw) ? limitRaw : defaultLimit,
      minLimit
    ),
    maxLimit
  )

  // Parse offset from input
  const offsetRaw = Number(input?.offset ?? defaultOffset)
  const offset = Math.max(
    Number.isFinite(offsetRaw) ? offsetRaw : defaultOffset,
    0
  )

  return { limit, offset }
}

/**
 * Calculate total pages based on total count and limit
 *
 * @param totalCount - Total number of items
 * @param limit - Items per page
 * @returns Total number of pages
 */
export function getTotalPages(totalCount: number, limit: number): number {
  return Math.ceil(totalCount / limit)
}

/**
 * Calculate current page number based on offset and limit
 *
 * @param offset - Current offset
 * @param limit - Items per page
 * @returns Current page number (1-indexed)
 */
export function getCurrentPage(offset: number, limit: number): number {
  return Math.floor(offset / limit) + 1
}

/**
 * Check if there are more pages after the current one
 *
 * @param offset - Current offset
 * @param limit - Items per page
 * @param totalCount - Total number of items
 * @returns true if more pages exist
 */
export function hasNextPage(offset: number, limit: number, totalCount: number): boolean {
  return offset + limit < totalCount
}

/**
 * Get pagination metadata for API responses
 *
 * @param offset - Current offset
 * @param limit - Items per page
 * @param totalCount - Total number of items
 * @returns Pagination metadata object
 *
 * @example
 * const pagination = getPaginationMeta(0, 25, 100)
 * // Returns: { page: 1, limit: 25, totalPages: 4, totalCount: 100, hasNext: true, hasPrev: false }
 */
export function getPaginationMeta(
  offset: number,
  limit: number,
  totalCount: number
) {
  const currentPage = getCurrentPage(offset, limit)
  const totalPages = getTotalPages(totalCount, limit)

  return {
    page: currentPage,
    limit,
    totalPages,
    totalCount,
    hasNext: hasNextPage(offset, limit, totalCount),
    hasPrev: offset > 0
  }
}
