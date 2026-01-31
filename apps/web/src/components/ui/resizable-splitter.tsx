'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ResizableSplitterProps {
  children: [React.ReactNode, React.ReactNode]
  defaultLeftWidth?: number
  minLeftWidth?: number
  maxLeftWidth?: number
  className?: string
  onResize?: (leftWidth: number) => void
}

export function ResizableSplitter({
  children,
  defaultLeftWidth = 384, // 24rem (w-96)
  minLeftWidth = 320, // 20rem
  maxLeftWidth = 600, // 37.5rem
  className,
  onResize
}: ResizableSplitterProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    startXRef.current = e.clientX
    startWidthRef.current = leftWidth
    
    // Add cursor style to body
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [leftWidth])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    
    const deltaX = e.clientX - startXRef.current
    const newWidth = startWidthRef.current + deltaX
    
    // Clamp the width between min and max
    const clampedWidth = Math.min(Math.max(newWidth, minLeftWidth), maxLeftWidth)
    
    setLeftWidth(clampedWidth)
    onResize?.(clampedWidth)
  }, [isDragging, minLeftWidth, maxLeftWidth, onResize])

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return
    
    setIsDragging(false)
    
    // Remove cursor style from body
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [isDragging])

  // Add global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Update width when container resizes
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return
      
      const containerWidth = containerRef.current.offsetWidth
      const maxAllowed = Math.min(maxLeftWidth, containerWidth * 0.7) // Max 70% of container
      const minAllowed = Math.max(minLeftWidth, containerWidth * 0.2) // Min 20% of container
      
      if (leftWidth > maxAllowed) {
        setLeftWidth(maxAllowed)
        onResize?.(maxAllowed)
      } else if (leftWidth < minAllowed) {
        setLeftWidth(minAllowed)
        onResize?.(minAllowed)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [leftWidth, minLeftWidth, maxLeftWidth, onResize])

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-1 min-h-0 relative", className)}
    >
      {/* Left Panel */}
      <div
        style={{ width: leftWidth }}
        className="flex-shrink-0 overflow-hidden h-full"
      >
        {children[0]}
      </div>

      {/* Resizable Handle */}
      <div
        className={cn(
          "relative group cursor-col-resize flex items-center justify-center bg-gray-200 hover:bg-gray-300 transition-colors",
          "w-1 hover:w-2",
          isDragging && "bg-purple-400 w-2"
        )}
        onMouseDown={handleMouseDown}
      >
        {/* Visual indicator */}
        <div className={cn(
          "absolute inset-y-0 left-1/2 transform -translate-x-1/2",
          "w-0.5 bg-gray-400 group-hover:bg-gray-600 transition-colors",
          isDragging && "bg-purple-600"
        )} />
        
        {/* Hover area for better UX */}
        <div className="absolute inset-y-0 -left-2 -right-2 cursor-col-resize" />
        
        {/* Visual dots on hover */}
        <div className={cn(
          "absolute inset-y-0 left-1/2 transform -translate-x-1/2 flex flex-col justify-center space-y-1 opacity-0 group-hover:opacity-100 transition-opacity",
          isDragging && "opacity-100"
        )}>
          <div className="w-1 h-1 bg-gray-600 rounded-full" />
          <div className="w-1 h-1 bg-gray-600 rounded-full" />
          <div className="w-1 h-1 bg-gray-600 rounded-full" />
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 min-w-0 overflow-hidden h-full">
        {children[1]}
      </div>
    </div>
  )
}