/**
 * Simple pagination component for admin data tables
 * No i18n, no URL navigation - just client-side state
 */

'use client'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminPaginationProps {
  /** Current page (1-indexed) */
  page: number
  /** Total number of pages */
  totalPages: number
  /** Total number of items */
  totalItems: number
  /** Items per page */
  pageSize: number
  /** Whether there's a previous page */
  hasPrevious: boolean
  /** Whether there's a next page */
  hasNext: boolean
  /** Go to specific page */
  onPageChange: (page: number) => void
  /** Change page size */
  onPageSizeChange?: (size: number) => void
  /** Available page sizes */
  pageSizeOptions?: number[]
  /** Show first/last buttons */
  showFirstLast?: boolean
  /** Show page size selector */
  showPageSize?: boolean
  /** Show item count info */
  showInfo?: boolean
  /** Custom class name */
  className?: string
}

export function AdminPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  hasPrevious,
  hasNext,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  showFirstLast = true,
  showPageSize = true,
  showInfo = true,
  className,
}: AdminPaginationProps) {
  // Don't render if there's nothing to paginate
  if (totalItems === 0) return null

  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, totalItems)

  // Generate page numbers to show (with ellipsis)
  const getVisiblePages = () => {
    const delta = 1 // Pages on each side of current
    const range: (number | '...')[] = []

    // Always show first page
    range.push(1)

    // Calculate start and end of middle range
    const start = Math.max(2, page - delta)
    const end = Math.min(totalPages - 1, page + delta)

    // Add ellipsis before middle range if needed
    if (start > 2) {
      range.push('...')
    }

    // Add middle range
    for (let i = start; i <= end; i++) {
      range.push(i)
    }

    // Add ellipsis after middle range if needed
    if (end < totalPages - 1) {
      range.push('...')
    }

    // Always show last page (if more than 1 page)
    if (totalPages > 1) {
      range.push(totalPages)
    }

    return range
  }

  const visiblePages = getVisiblePages()

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      {/* Info section */}
      {showInfo && (
        <div className="text-sm text-muted-foreground">
          Showing {startItem}-{endItem} of {totalItems.toLocaleString()} items
        </div>
      )}

      {/* Controls section */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Page size selector */}
        {showPageSize && onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Per page:
            </span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center gap-1">
          {/* First page */}
          {showFirstLast && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(1)}
              disabled={!hasPrevious}
              aria-label="Go to first page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
          )}

          {/* Previous page */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPrevious}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Page numbers (hidden on mobile) */}
          <div className="hidden sm:flex items-center gap-1">
            {visiblePages.map((p, index) => {
              if (p === '...') {
                return (
                  <span
                    key={`ellipsis-${index}`}
                    className="px-2 text-muted-foreground"
                  >
                    ...
                  </span>
                )
              }

              const isActive = p === page
              return (
                <Button
                  key={p}
                  variant={isActive ? 'default' : 'outline'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onPageChange(p)}
                  disabled={isActive}
                  aria-label={`Go to page ${p}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {p}
                </Button>
              )
            })}
          </div>

          {/* Mobile page indicator */}
          <div className="sm:hidden px-2 text-sm text-muted-foreground whitespace-nowrap">
            {page} / {totalPages}
          </div>

          {/* Next page */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNext}
            aria-label="Go to next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Last page */}
          {showFirstLast && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(totalPages)}
              disabled={!hasNext}
              aria-label="Go to last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Minimal pagination controls (just prev/next)
 * Useful for smaller tables or inline pagination
 */
interface AdminPaginationMinimalProps {
  page: number
  totalPages: number
  hasPrevious: boolean
  hasNext: boolean
  onPageChange: (page: number) => void
  className?: string
}

export function AdminPaginationMinimal({
  page,
  totalPages,
  hasPrevious,
  hasNext,
  onPageChange,
  className,
}: AdminPaginationMinimalProps) {
  if (totalPages <= 1) return null

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={!hasPrevious}
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNext}
      >
        Next
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  )
}
