'use client'

import React from 'react'
import { MobileSkeletonLoader, MobileWorkspaceSkeleton } from '@/components/ui/mobile-skeleton-loader'

interface MobileWorkspaceLoadingProps {
  loadingType?: 'full' | 'question' | 'preview' | 'chat' | 'panel'
  isInitialLoad?: boolean
}

/**
 * Loading states for different mobile workspace scenarios
 * Used during app initialization, question loading, and panel transitions
 */
export function MobileWorkspaceLoading({ 
  loadingType = 'full', 
  isInitialLoad = false 
}: MobileWorkspaceLoadingProps) {
  
  // Full workspace skeleton for initial app load
  if (loadingType === 'full' || isInitialLoad) {
    return <MobileWorkspaceSkeleton />
  }

  // Individual component skeletons
  const componentSkeletons = {
    question: <MobileSkeletonLoader type="question" count={4} />,
    preview: <MobileSkeletonLoader type="preview" />,
    chat: <MobileSkeletonLoader type="chat" count={5} />,
    panel: <MobileSkeletonLoader type="panel" count={6} />
  }

  return (
    <div className="h-full bg-gray-900">
      {componentSkeletons[loadingType]}
    </div>
  )
}

/**
 * Loading overlay that can be used over existing content
 */
export function MobileLoadingOverlay({ 
  isVisible, 
  message = 'Loading...',
  children 
}: { 
  isVisible: boolean
  message?: string
  children?: React.ReactNode 
}) {
  if (!isVisible) return null

  return (
    <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white font-medium">{message}</p>
        {children}
      </div>
    </div>
  )
}

/**
 * Progressive loading component that shows skeleton then content
 */
export function MobileProgressiveLoader<T>({
  data,
  isLoading,
  skeletonType,
  children,
  fallback
}: {
  data: T | null
  isLoading: boolean
  skeletonType: 'question' | 'preview' | 'chat' | 'panel'
  children: (data: T) => React.ReactNode
  fallback?: React.ReactNode
}) {
  if (isLoading || !data) {
    return <MobileSkeletonLoader type={skeletonType} />
  }

  if (data) {
    return <>{children(data)}</>
  }

  return fallback || <div className="text-center text-gray-400 p-8">No data available</div>
}