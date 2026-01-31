/**
 * Client-side pagination hook for admin data tables
 * Manages page state and provides computed values for slicing data
 */

'use client'

import { useState, useMemo, useCallback } from 'react'

interface UsePaginationOptions {
  /** Items per page (default: 25) */
  pageSize?: number
  /** Initial page (default: 1) */
  initialPage?: number
}

interface UsePaginationReturn<T> {
  /** Current page number (1-indexed) */
  page: number
  /** Items per page */
  pageSize: number
  /** Total number of pages */
  totalPages: number
  /** Total number of items */
  totalItems: number
  /** Start index for current page (0-indexed, for slice) */
  startIndex: number
  /** End index for current page (for slice) */
  endIndex: number
  /** Whether there's a previous page */
  hasPrevious: boolean
  /** Whether there's a next page */
  hasNext: boolean
  /** Items for current page (sliced from data) */
  pageItems: T[]
  /** Go to specific page */
  goToPage: (page: number) => void
  /** Go to next page */
  nextPage: () => void
  /** Go to previous page */
  previousPage: () => void
  /** Go to first page */
  firstPage: () => void
  /** Go to last page */
  lastPage: () => void
  /** Reset to first page (useful when data changes) */
  reset: () => void
  /** Change page size (resets to page 1) */
  setPageSize: (size: number) => void
}

/**
 * Hook for client-side pagination of data arrays
 *
 * @example
 * const { pageItems, page, totalPages, goToPage, hasNext, hasPrevious } = usePagination(data)
 *
 * // Render pageItems instead of full data
 * // Use hasNext/hasPrevious for navigation buttons
 */
export function usePagination<T>(
  data: T[],
  options: UsePaginationOptions = {}
): UsePaginationReturn<T> {
  const { pageSize: initialPageSize = 25, initialPage = 1 } = options

  const [page, setPage] = useState(initialPage)
  const [pageSize, setPageSizeState] = useState(initialPageSize)

  const totalItems = data.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  // Clamp page to valid range when data changes
  const clampedPage = Math.min(Math.max(1, page), totalPages)

  // Reset page if it's out of bounds
  if (clampedPage !== page) {
    setPage(clampedPage)
  }

  const startIndex = (clampedPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalItems)

  const hasPrevious = clampedPage > 1
  const hasNext = clampedPage < totalPages

  const pageItems = useMemo(
    () => data.slice(startIndex, endIndex),
    [data, startIndex, endIndex]
  )

  const goToPage = useCallback(
    (newPage: number) => {
      const clamped = Math.min(Math.max(1, newPage), totalPages)
      setPage(clamped)
    },
    [totalPages]
  )

  const nextPage = useCallback(() => {
    if (hasNext) setPage((p) => p + 1)
  }, [hasNext])

  const previousPage = useCallback(() => {
    if (hasPrevious) setPage((p) => p - 1)
  }, [hasPrevious])

  const firstPage = useCallback(() => setPage(1), [])
  const lastPage = useCallback(() => setPage(totalPages), [totalPages])
  const reset = useCallback(() => setPage(1), [])

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(Math.max(1, size))
    setPage(1) // Reset to first page when changing size
  }, [])

  return {
    page: clampedPage,
    pageSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    hasPrevious,
    hasNext,
    pageItems,
    goToPage,
    nextPage,
    previousPage,
    firstPage,
    lastPage,
    reset,
    setPageSize,
  }
}

/**
 * Hook for server-side pagination (offset/limit based)
 * Use when fetching paginated data from API
 */
interface UseServerPaginationOptions {
  /** Items per page (default: 25) */
  pageSize?: number
  /** Initial page (default: 1) */
  initialPage?: number
}

interface UseServerPaginationReturn {
  /** Current page number (1-indexed) */
  page: number
  /** Items per page */
  pageSize: number
  /** Offset for API calls */
  offset: number
  /** Limit for API calls */
  limit: number
  /** Go to specific page */
  goToPage: (page: number) => void
  /** Go to next page */
  nextPage: () => void
  /** Go to previous page */
  previousPage: () => void
  /** Reset to first page */
  reset: () => void
  /** Change page size (resets to page 1) */
  setPageSize: (size: number) => void
  /** Whether there's a previous page */
  hasPrevious: boolean
  /** Calculate hasNext from total (call after fetch) */
  hasNextFromTotal: (total: number) => boolean
  /** Calculate total pages from total (call after fetch) */
  totalPagesFromTotal: (total: number) => number
}

/**
 * Hook for server-side pagination
 * Returns offset/limit for API calls
 *
 * @example
 * const { offset, limit, page, goToPage, hasPrevious } = useServerPagination()
 *
 * const { data, total } = await fetchData({ offset, limit })
 * const hasNext = hasNextFromTotal(total)
 * const totalPages = totalPagesFromTotal(total)
 */
export function useServerPagination(
  options: UseServerPaginationOptions = {}
): UseServerPaginationReturn {
  const { pageSize: initialPageSize = 25, initialPage = 1 } = options

  const [page, setPage] = useState(initialPage)
  const [pageSize, setPageSizeState] = useState(initialPageSize)

  const offset = (page - 1) * pageSize
  const limit = pageSize
  const hasPrevious = page > 1

  const goToPage = useCallback((newPage: number) => {
    setPage(Math.max(1, newPage))
  }, [])

  const nextPage = useCallback(() => setPage((p) => p + 1), [])
  const previousPage = useCallback(() => {
    if (hasPrevious) setPage((p) => p - 1)
  }, [hasPrevious])

  const reset = useCallback(() => setPage(1), [])

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(Math.max(1, size))
    setPage(1)
  }, [])

  const hasNextFromTotal = useCallback(
    (total: number) => page < Math.ceil(total / pageSize),
    [page, pageSize]
  )

  const totalPagesFromTotal = useCallback(
    (total: number) => Math.max(1, Math.ceil(total / pageSize)),
    [pageSize]
  )

  return {
    page,
    pageSize,
    offset,
    limit,
    goToPage,
    nextPage,
    previousPage,
    reset,
    setPageSize,
    hasPrevious,
    hasNextFromTotal,
    totalPagesFromTotal,
  }
}
