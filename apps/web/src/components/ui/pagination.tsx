'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useRouter, usePathname } from '@/i18n/routing'
import { useSearchParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'

interface PaginationProps {
  currentPage: number
  totalItems: number
  itemsPerPage: number
  hasMore?: boolean
  className?: string
}

export function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  hasMore = false,
  className
}: PaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('pagination')
  const locale = useLocale()
  
  // Check if current locale is RTL
  const isRTL = locale.startsWith('ar')

  // Calculate pagination values
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const hasNext = hasMore || currentPage < totalPages
  const hasPrevious = currentPage > 1

  // Generate page numbers to show
  const getVisiblePages = () => {
    const delta = 2 // Number of pages to show on each side of current page
    const range = []
    const rangeWithDots = []

    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      range.push(i)
    }

    if (currentPage - delta > 2) {
      rangeWithDots.push(1, '...')
    } else {
      rangeWithDots.push(1)
    }

    rangeWithDots.push(...range)

    if (currentPage + delta < totalPages - 1) {
      rangeWithDots.push('...', totalPages)
    } else if (totalPages > 1) {
      rangeWithDots.push(totalPages)
    }

    return rangeWithDots
  }

  // Navigate to specific page
  const navigateToPage = (page: number) => {
    if (page < 1 || (totalPages > 0 && page > totalPages)) return

    const params = new URLSearchParams(searchParams.toString())
    if (page === 1) {
      params.delete('page')
    } else {
      params.set('page', page.toString())
    }

    const query = params.toString()
    const url = query ? `${pathname}?${query}` : pathname
    router.push(url)
  }

  // Don't render if there's only one page or no data
  if (totalPages <= 1 && !hasMore) return null

  const visiblePages = getVisiblePages()

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      {/* Previous Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigateToPage(currentPage - 1)}
        disabled={!hasPrevious}
        className="gap-1"
      >
        <Icon name={isRTL ? "chevron-right" : "chevron-left"} className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only">{t('previous') || 'Previous'}</span>
      </Button>

      {/* Page Numbers */}
      <div className="hidden sm:flex items-center gap-1">
        {visiblePages.map((page, index) => {
          if (page === '...') {
            return (
              <span key={`dots-${index}`} className="px-2 py-1 text-muted-foreground">
                ...
              </span>
            )
          }

          const pageNum = page as number
          const isActive = pageNum === currentPage

          return (
            <Button
              key={pageNum}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => navigateToPage(pageNum)}
              disabled={isActive}
              className={cn(
                "min-w-[2.5rem]",
                isActive && "pointer-events-none"
              )}
            >
              {pageNum}
            </Button>
          )
        })}
      </div>

      {/* Mobile: Current page indicator */}
      <div className="sm:hidden flex items-center gap-2 px-2 text-sm text-muted-foreground">
        {t('page') || 'Page'} {currentPage} {totalPages > 0 && `${t('of') || 'of'} ${totalPages}`}
      </div>

      {/* Next Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigateToPage(currentPage + 1)}
        disabled={!hasNext}
        className="gap-1"
      >
        <span className="sr-only sm:not-sr-only">{t('next') || 'Next'}</span>
        <Icon name={isRTL ? "chevron-left" : "chevron-right"} className="h-4 w-4" />
      </Button>
    </div>
  )
}

interface PaginationInfoProps {
  currentPage: number
  itemsPerPage: number
  totalItems: number
  className?: string
}

export function PaginationInfo({
  currentPage,
  itemsPerPage,
  totalItems,
  className
}: PaginationInfoProps) {
  const t = useTranslations('pagination')
  const locale = useLocale()
  
  // Check if current locale is RTL (though PaginationInfo doesn't use arrows, keep consistent)
  const isRTL = locale.startsWith('ar')
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  return (
    <div className={cn('text-sm text-muted-foreground', className)}>
      {t('showing', { start: startItem, end: endItem, total: totalItems }) || `Showing ${startItem}-${endItem} of ${totalItems} items`}
    </div>
  )
}