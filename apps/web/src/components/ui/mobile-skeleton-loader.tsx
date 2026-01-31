'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface MobileSkeletonLoaderProps {
  type: 'question' | 'preview' | 'chat' | 'header' | 'tabs' | 'panel'
  className?: string
  count?: number
}

/**
 * Mobile-optimized skeleton loading components
 * Provides smooth loading states for different UI sections
 */
export function MobileSkeletonLoader({ 
  type, 
  className,
  count = 3 
}: MobileSkeletonLoaderProps) {
  const skeletons = {
    question: (
      <div className={cn("p-4 space-y-6", className)}>
        {/* Progress bar skeleton */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-700 rounded-full animate-pulse" />
              <div className="space-y-1">
                <div className="h-4 bg-gray-700 rounded w-24 animate-pulse" />
                <div className="h-3 bg-gray-700 rounded w-16 animate-pulse" />
              </div>
            </div>
            <div className="w-6 h-6 bg-gray-700 rounded animate-pulse" />
          </div>
          <div className="w-full h-2 bg-gray-700 rounded-full animate-pulse" />
        </div>

        {/* Question text skeleton */}
        <div className="space-y-3">
          <div className="h-6 bg-gray-700 rounded-lg animate-pulse" />
          <div className="h-4 bg-gray-700 rounded-lg w-3/4 animate-pulse" />
        </div>

        {/* Options skeleton */}
        <div className="space-y-3">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="p-4 border-2 border-gray-700 rounded-xl animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-gray-600 rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-600 rounded animate-pulse" />
                  <div className="h-3 bg-gray-600 rounded w-2/3 animate-pulse" />
                </div>
                <div className="w-8 h-8 bg-gray-600 rounded-full animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),

    preview: (
      <div className={cn("p-4 space-y-4", className)}>
        {/* Preview controls skeleton */}
        <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="h-4 bg-gray-700 rounded w-16 animate-pulse" />
            <div className="flex gap-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-6 h-6 bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          </div>
          <div className="w-6 h-6 bg-gray-700 rounded animate-pulse" />
        </div>

        {/* Preview content skeleton */}
        <div className="bg-gray-700 rounded-lg h-96 animate-pulse flex items-center justify-center">
          <div className="space-y-3 text-center">
            <div className="w-12 h-12 bg-gray-600 rounded-lg mx-auto animate-pulse" />
            <div className="h-4 bg-gray-600 rounded w-32 mx-auto animate-pulse" />
            <div className="h-3 bg-gray-600 rounded w-24 mx-auto animate-pulse" />
          </div>
        </div>
      </div>
    ),

    chat: (
      <div className={cn("p-4 space-y-4", className)}>
        {/* Chat header skeleton */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-700 rounded-full animate-pulse" />
            <div className="space-y-1">
              <div className="h-4 bg-gray-700 rounded w-20 animate-pulse" />
              <div className="h-3 bg-gray-700 rounded w-24 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Chat messages skeleton */}
        <div className="space-y-4">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className={cn(
              "flex gap-3",
              i % 2 === 0 ? "justify-start" : "justify-end"
            )}>
              {i % 2 === 0 && (
                <div className="w-8 h-8 bg-gray-700 rounded-full animate-pulse" />
              )}
              <div className={cn(
                "max-w-[80%] p-3 rounded-2xl space-y-2",
                i % 2 === 0 ? "bg-gray-800" : "bg-gray-700"
              )}>
                <div className="h-4 bg-gray-600 rounded animate-pulse" />
                <div className="h-4 bg-gray-600 rounded w-2/3 animate-pulse" />
                <div className="h-3 bg-gray-600 rounded w-12 animate-pulse" />
              </div>
              {i % 2 === 1 && (
                <div className="w-8 h-8 bg-gray-700 rounded-full animate-pulse" />
              )}
            </div>
          ))}
        </div>

        {/* Input skeleton */}
        <div className="p-4 border-t border-gray-700">
          <div className="flex gap-3">
            <div className="flex-1 h-12 bg-gray-800 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    ),

    header: (
      <div className={cn("bg-gray-800 border-b border-gray-700", className)}>
        <div className="px-4 py-3 flex items-center justify-between h-14">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-8 h-8 bg-gray-700 rounded animate-pulse" />
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-32 bg-gray-700 rounded animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-700 rounded animate-pulse" />
            <div className="w-8 h-8 bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
      </div>
    ),

    tabs: (
      <div className={cn("fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700", className)}>
        <div className="flex h-16">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-center gap-1">
              <div className="w-5 h-5 bg-gray-700 rounded animate-pulse" />
              <div className="h-3 w-8 bg-gray-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    ),

    panel: (
      <div className={cn("h-full space-y-4 p-4", className)}>
        {/* Panel header */}
        <div className="flex items-center justify-between">
          <div className="h-6 bg-gray-700 rounded w-24 animate-pulse" />
          <div className="w-6 h-6 bg-gray-700 rounded animate-pulse" />
        </div>

        {/* Panel content */}
        <div className="space-y-3">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="p-3 bg-gray-800 rounded-lg animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-700 rounded animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-700 rounded animate-pulse" />
                  <div className="h-3 bg-gray-700 rounded w-3/4 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-pulse-slow">
      {skeletons[type]}
    </div>
  )
}

/**
 * Specialized skeleton loader for the full mobile workspace
 */
export function MobileWorkspaceSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("h-screen flex flex-col bg-gray-900", className)}>
      {/* Header skeleton */}
      <MobileSkeletonLoader type="header" />
      
      {/* Main content skeleton */}
      <div className="flex-1 overflow-hidden">
        <MobileSkeletonLoader type="question" />
      </div>
      
      {/* Tab bar skeleton */}
      <MobileSkeletonLoader type="tabs" />
    </div>
  )
}

/**
 * Skeleton for mobile sheets
 */
export function MobileSheetSkeleton({ 
  title, 
  className 
}: { 
  title?: string
  className?: string 
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Sheet header */}
      <div className="flex items-center justify-between px-4 pb-4 border-b border-gray-700">
        <div className="h-6 bg-gray-700 rounded w-32 animate-pulse">
          {title && <span className="sr-only">{title}</span>}
        </div>
        <div className="w-6 h-6 bg-gray-700 rounded animate-pulse" />
      </div>
      
      {/* Sheet content */}
      <div className="px-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-700 rounded animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-700 rounded animate-pulse" />
              <div className="h-3 bg-gray-700 rounded w-2/3 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}