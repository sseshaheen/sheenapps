/**
 * Resizable Panes Component
 *
 *
 * Flexible split-pane layout with resize handles and keyboard shortcuts
 * Enhanced with accessibility features (Ctrl+1, Ctrl+2 for pane switching)
 */

'use client'

import { cn } from '@/lib/utils'
import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react'

interface Pane {
  id: string
  title: string
  size: number // Percentage
  minSize?: number // Pixels
  maxSize?: number // Pixels
  content: ReactNode
}

interface ResizablePanesProps {
  panes: Pane[]
  direction?: 'horizontal' | 'vertical'
  onResize?: (sizes: number[]) => void
  className?: string
}

export function ResizablePanes({
  panes,
  direction = 'horizontal',
  onResize,
  className = ''
}: ResizablePanesProps) {
  const [sizes, setSizes] = useState<number[]>(panes.map(pane => pane.size))
  const [isDragging, setIsDragging] = useState<number | null>(null)
  const [focusedPane, setFocusedPane] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const paneRefs = useRef<(HTMLDivElement | null)[]>([])

  // Initialize pane refs array
  useEffect(() => {
    paneRefs.current = paneRefs.current.slice(0, panes.length)
  }, [panes.length])

  const handleMouseDown = useCallback((index: number) => {
    setIsDragging(index)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging === null || !containerRef.current) return

    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    const total = direction === 'horizontal' ? rect.width : rect.height
    const position = direction === 'horizontal'
      ? e.clientX - rect.left
      : e.clientY - rect.top

    // Calculate new sizes based on mouse position
    const newSizes = [...sizes]
    const currentPosition = sizes.slice(0, isDragging + 1).reduce((sum, size) => sum + (size / 100) * total, 0)
    const delta = position - currentPosition

    // Apply constraints
    const leftPane = panes[isDragging]
    const rightPane = panes[isDragging + 1]

    const leftMinSize = leftPane.minSize || 50
    const leftMaxSize = leftPane.maxSize || total * 0.8
    const rightMinSize = rightPane.minSize || 50
    const rightMaxSize = rightPane.maxSize || total * 0.8

    const leftNewSize = Math.max(leftMinSize, Math.min(leftMaxSize, (sizes[isDragging] / 100) * total + delta))
    const rightNewSize = Math.max(rightMinSize, Math.min(rightMaxSize, (sizes[isDragging + 1] / 100) * total - delta))

    newSizes[isDragging] = (leftNewSize / total) * 100
    newSizes[isDragging + 1] = (rightNewSize / total) * 100

    setSizes(newSizes)
    onResize?.(newSizes)
  }, [isDragging, sizes, direction, panes, onResize])

  const handleMouseUp = useCallback(() => {
    setIsDragging(null)
  }, [])

  // Mouse event listeners
  React.useEffect(() => {
    if (isDragging !== null) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Keyboard shortcuts for pane switching (Ctrl+1, Ctrl+2, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return

      const key = e.key
      if (key >= '1' && key <= '9') {
        const paneIndex = parseInt(key) - 1
        if (paneIndex < panes.length) {
          e.preventDefault()
          setFocusedPane(paneIndex)
          paneRefs.current[paneIndex]?.focus()
        }
      }

      // Ctrl+[ and Ctrl+] for resizing panes
      if (key === '[' || key === ']') {
        e.preventDefault()
        const currentPane = focusedPane
        const nextPane = currentPane + 1

        if (nextPane < panes.length) {
          const increment = key === '[' ? -5 : 5 // 5% increment
          const newSizes = [...sizes]

          // Adjust current and next pane sizes
          const newCurrentSize = Math.max(10, Math.min(80, newSizes[currentPane] + increment))
          const newNextSize = Math.max(10, Math.min(80, newSizes[nextPane] - increment))

          newSizes[currentPane] = newCurrentSize
          newSizes[nextPane] = newNextSize

          setSizes(newSizes)
          onResize?.(newSizes)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [focusedPane, sizes, panes.length, onResize])

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full',
        isHorizontal ? 'flex-row' : 'flex-col',
        className
      )}
    >
      {panes.map((pane, index) => (
        <React.Fragment key={pane.id}>
          <div
            ref={(el) => { paneRefs.current[index] = el }}
            className={cn(
              'flex flex-col overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset',
              isHorizontal ? 'h-full' : 'w-full',
              focusedPane === index && 'ring-2 ring-primary ring-inset'
            )}
            style={{
              [isHorizontal ? 'width' : 'height']: `${sizes[index]}%`
            }}
            tabIndex={0}
            role="region"
            aria-label={`${pane.title} pane`}
            onFocus={() => setFocusedPane(index)}
          >
            {/* Pane Header */}
            <div className="flex-shrink-0 px-3 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">
                  {pane.title}
                </h3>
                <div className="text-xs text-muted-foreground">
                  Ctrl+{index + 1}
                </div>
              </div>
            </div>

            {/* Pane Content */}
            <div className="flex-1 overflow-hidden">
              {pane.content}
            </div>
          </div>

          {/* Resize Handle */}
          {index < panes.length - 1 && (
            <div
              className={cn(
                'flex-shrink-0 bg-border hover:bg-primary/50 cursor-col-resize group',
                'transition-colors duration-150 relative',
                isHorizontal
                  ? 'w-1 h-full cursor-col-resize hover:w-2'
                  : 'h-1 w-full cursor-row-resize hover:h-2',
                isDragging === index && 'bg-primary w-2'
              )}
              onMouseDown={() => handleMouseDown(index)}
              role="separator"
              aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
              aria-label={`Resize between ${pane.title} and ${panes[index + 1]?.title}`}
              title={`Drag to resize • Ctrl+[ / Ctrl+] when focused`}
            >
              {/* Visual indicator on hover */}
              <div
                className={cn(
                  'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity',
                  'bg-primary/20 flex items-center justify-center',
                  isHorizontal ? 'flex-col' : 'flex-row'
                )}
              >
                <div className="w-0.5 h-4 bg-primary rounded-full" />
                <div className="w-0.5 h-4 bg-primary rounded-full mt-1" />
              </div>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
