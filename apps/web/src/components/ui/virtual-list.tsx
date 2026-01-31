/**
 * Virtual List Component
 * 
 * High-performance virtualized list component using TanStack Virtual
 * Renders only visible items for optimal performance with large datasets
 */

'use client'

import React, { useRef, forwardRef, ReactElement } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'

export interface VirtualListProps<T> {
  items: T[]
  height: number
  itemHeight: number | ((index: number) => number)
  renderItem: (item: T, index: number) => ReactElement
  className?: string
  scrollElementProps?: React.HTMLAttributes<HTMLDivElement>
  gap?: number
  overscan?: number
  estimateSize?: (index: number) => number
  onScroll?: (scrollTop: number) => void
  scrollToIndex?: number
  scrollBehavior?: 'auto' | 'smooth'
}

/**
 * Generic virtual list component with performance optimizations
 */
export function VirtualList<T>({
  items,
  height,
  itemHeight,
  renderItem,
  className,
  scrollElementProps,
  gap = 0,
  overscan = 5,
  estimateSize,
  onScroll,
  scrollToIndex,
  scrollBehavior = 'auto'
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: estimateSize || ((index: number) => {
      if (typeof itemHeight === 'function') {
        return itemHeight(index) + gap
      }
      return itemHeight + gap
    }),
    overscan,
    scrollMargin: gap,
  })

  // Handle scroll to index
  React.useEffect(() => {
    if (scrollToIndex !== undefined && scrollToIndex >= 0 && scrollToIndex < items.length) {
      virtualizer.scrollToIndex(scrollToIndex, {
        align: 'auto',
        behavior: scrollBehavior,
      })
    }
  }, [scrollToIndex, scrollBehavior, virtualizer, items.length])

  // Handle scroll callback
  React.useEffect(() => {
    if (!onScroll) return

    const element = parentRef.current
    if (!element) return

    const handleScroll = () => {
      onScroll(element.scrollTop)
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [onScroll])

  return (
    <div
      ref={parentRef}
      className={cn(
        "overflow-auto",
        className
      )}
      style={{ height }}
      {...scrollElementProps}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index]
          if (!item) return null

          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Virtual chat messages list optimized for chat interfaces
 */
export interface VirtualChatListProps<T> {
  messages: T[]
  height: number
  renderMessage: (message: T, index: number) => ReactElement
  className?: string
  autoScrollToBottom?: boolean
  estimateMessageHeight?: (index: number) => number
  onScroll?: (scrollTop: number, isAtBottom: boolean) => void
}

export function VirtualChatList<T>({
  messages,
  height,
  renderMessage,
  className,
  autoScrollToBottom = true,
  estimateMessageHeight = () => 80, // Default estimate
  onScroll
}: VirtualChatListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(true)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: estimateMessageHeight,
    overscan: 3,
  })

  // Auto-scroll to bottom for new messages
  React.useEffect(() => {
    if (autoScrollToBottom && wasAtBottomRef.current && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, {
        align: 'end',
        behavior: 'smooth',
      })
    }
  }, [messages.length, autoScrollToBottom, virtualizer])

  // Handle scroll with bottom detection
  React.useEffect(() => {
    if (!onScroll) return

    const element = parentRef.current
    if (!element) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10 // 10px threshold
      
      wasAtBottomRef.current = isAtBottom
      onScroll(scrollTop, isAtBottom)
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [onScroll])

  return (
    <div
      ref={parentRef}
      className={cn(
        "overflow-auto",
        className
      )}
      style={{ height }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const message = messages[virtualItem.index]
          if (!message) return null

          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderMessage(message, virtualItem.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Virtual table/grid component for structured data
 */
export interface VirtualTableProps<T> {
  items: T[]
  height: number
  rowHeight: number
  columns: Array<{
    key: string
    label: string
    width?: number | string
    render: (item: T, index: number) => ReactElement
  }>
  className?: string
  headerClassName?: string
  rowClassName?: string | ((item: T, index: number) => string)
  onRowClick?: (item: T, index: number) => void
}

export function VirtualTable<T>({
  items,
  height,
  rowHeight,
  columns,
  className,
  headerClassName,
  rowClassName,
  onRowClick
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  })

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Header */}
      <div className={cn(
        "flex border-b border-gray-700 bg-gray-800 sticky top-0 z-10",
        headerClassName
      )}>
        {columns.map((column) => (
          <div
            key={column.key}
            className="px-3 py-2 text-sm font-medium text-gray-300"
            style={{ width: column.width || 'auto', flex: column.width ? undefined : 1 }}
          >
            {column.label}
          </div>
        ))}
      </div>

      {/* Virtual rows */}
      <div
        ref={parentRef}
        className="overflow-auto flex-1"
        style={{ height: height - 40 }} // Subtract header height
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = items[virtualItem.index]
            if (!item) return null

            const rowClass = typeof rowClassName === 'function' 
              ? rowClassName(item, virtualItem.index)
              : rowClassName

            return (
              <div
                key={virtualItem.key}
                className={cn(
                  "flex border-b border-gray-800 hover:bg-gray-800/50 transition-colors",
                  rowClass,
                  onRowClick && "cursor-pointer"
                )}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                onClick={() => onRowClick?.(item, virtualItem.index)}
              >
                {columns.map((column) => (
                  <div
                    key={column.key}
                    className="px-3 py-2 text-sm text-gray-100 flex items-center"
                    style={{ width: column.width || 'auto', flex: column.width ? undefined : 1 }}
                  >
                    {column.render(item, virtualItem.index)}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Performance monitoring for virtual lists
 */
export const VirtualListPerformance = {
  /**
   * Estimate optimal item height based on content
   */
  estimateItemHeight: (
    content: string,
    baseHeight: number = 40,
    charsPerLine: number = 50
  ): number => {
    const lines = Math.ceil(content.length / charsPerLine)
    return Math.max(baseHeight, lines * 20) // 20px per line
  },

  /**
   * Calculate overscan based on viewport and item size
   */
  calculateOverscan: (
    viewportHeight: number,
    itemHeight: number,
    multiplier: number = 2
  ): number => {
    const visibleItems = Math.ceil(viewportHeight / itemHeight)
    return Math.max(3, Math.min(20, visibleItems * multiplier))
  },

  /**
   * Monitor virtual list performance
   */
  createPerformanceMonitor: (name: string) => {
    let renderCount = 0
    let lastRenderTime = performance.now()

    return {
      onRender: () => {
        renderCount++
        const now = performance.now()
        const timeSinceLastRender = now - lastRenderTime
        
        if (timeSinceLastRender < 16) {
          console.warn(`${name}: Rendering too frequently (${timeSinceLastRender.toFixed(2)}ms)`)
        }
        
        lastRenderTime = now
      },
      getRenderStats: () => ({
        totalRenders: renderCount,
        avgFrameTime: lastRenderTime / renderCount
      })
    }
  }
}