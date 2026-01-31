'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface ContainerSize {
  width: number
  height: number
  containerType: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

/**
 * Maps container width to size categories
 */
const getContainerType = (width: number): ContainerSize['containerType'] => {
  if (width < 384) return 'xs'
  if (width < 640) return 'sm'
  if (width < 768) return 'md' 
  if (width < 1024) return 'lg'
  if (width < 1280) return 'xl'
  return '2xl'
}

/**
 * Hook for container query based responsive behavior
 * Provides container dimensions and responsive utilities
 */
export const useContainerQueries = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
    containerType: 'md'
  })

  const updateSize = useCallback(() => {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const containerType = getContainerType(width)

    setContainerSize({
      width,
      height,
      containerType
    })
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    // Create ResizeObserver to watch container size
    const resizeObserver = new ResizeObserver(() => {
      updateSize()
    })

    resizeObserver.observe(containerRef.current)
    
    // Initial measurement
    updateSize()

    return () => {
      resizeObserver.disconnect()
    }
  }, [updateSize])

  return {
    containerRef,
    ...containerSize
  }
}

/**
 * Hook for container-based conditional classes
 */
export const useContainerClasses = (classMap: {
  xs?: string
  sm?: string
  md?: string
  lg?: string
  xl?: string
  '2xl'?: string
  default?: string
}) => {
  const { containerType } = useContainerQueries()
  
  return classMap[containerType] || classMap.default || ''
}

/**
 * Container query responsive patterns
 */
export const containerPatterns = {
  // Chat message bubbles
  chatMessage: {
    xs: 'px-2 py-1 text-xs max-w-[90%]',
    sm: 'px-3 py-2 text-sm max-w-[85%]', 
    md: 'px-4 py-3 text-base max-w-[80%]',
    lg: 'px-5 py-4 text-base max-w-[75%]',
    xl: 'px-6 py-4 text-lg max-w-[70%]',
    '2xl': 'px-6 py-5 text-lg max-w-[65%]'
  },
  
  // Button sizing
  button: {
    xs: 'px-2 py-1 text-xs min-h-[32px]',
    sm: 'px-3 py-1.5 text-xs min-h-[36px]',
    md: 'px-3 py-2 text-sm min-h-[44px]', 
    lg: 'px-4 py-2.5 text-base min-h-[48px]',
    xl: 'px-5 py-3 text-base min-h-[52px]',
    '2xl': 'px-6 py-3.5 text-lg min-h-[56px]'
  },
  
  // Form input sizing  
  input: {
    xs: 'px-2 py-1 text-xs min-h-[32px]',
    sm: 'px-3 py-1.5 text-sm min-h-[36px]',
    md: 'px-3 py-2 text-base min-h-[44px]',
    lg: 'px-4 py-2.5 text-base min-h-[48px]',
    xl: 'px-5 py-3 text-lg min-h-[52px]',
    '2xl': 'px-6 py-3.5 text-lg min-h-[56px]'
  },

  // Sidebar width based on container
  sidebar: {
    xs: 'w-0 hidden',
    sm: 'w-16 collapsed-only',
    md: 'w-64',
    lg: 'w-80', 
    xl: 'w-96',
    '2xl': 'w-[400px]'
  }
}

/**
 * Container query component wrapper
 * TODO: Fix TypeScript compilation issue
 */
export interface ContainerQueryWrapperProps {
  children: (containerSize: ContainerSize) => React.ReactNode
  className?: string
}

// TODO: Temporarily commented out due to TypeScript compilation issue
// Will be fixed in a follow-up commit
/*
export const ContainerQueryWrapper: React.FC<ContainerQueryWrapperProps> = ({
  children,
  className = ''
}) => {
  const { containerRef, ...containerSize } = useContainerQueries()

  return (
    <div ref={containerRef} className={cn('@container', className)}>
      {children(containerSize)}
    </div>
  )
}
*/