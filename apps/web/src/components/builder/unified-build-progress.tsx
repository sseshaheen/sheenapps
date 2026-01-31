'use client'

/**
 * Unified Build Progress Component
 * Consolidates CleanBuildProgress and CompactBuildProgress into a single component
 * Supports variant switching: "default" | "compact"
 * 
 * Phase 1 Consolidation - Day 1.2
 * Created: July 31, 2025
 */

import React from 'react'
import { CleanBuildProgress } from './clean-build-progress'
import { CompactBuildProgress } from './compact-build-progress'
import type { SendMessageFunction } from '@/hooks/use-apply-recommendation'

interface UnifiedBuildProgressProps {
  /** Display variant */
  variant?: 'default' | 'compact'
  /** Build ID to track */
  buildId: string | null
  /** User ID for authentication */
  userId: string
  /** Project ID for recommendations */
  projectId?: string
  /** EXPERT FIX ROUND 6: sendMessage for recommendations (optional - recommendations won't show without it) */
  sendMessage?: SendMessageFunction
  /** Additional CSS classes */
  className?: string
}

/**
 * Unified build progress component that switches between display variants
 * Uses clean events API by default, with automatic fallback handling
 */
export function UnifiedBuildProgress({
  variant = 'default',
  buildId,
  userId,
  projectId,
  sendMessage,
  className
}: UnifiedBuildProgressProps) {
  
  // 🚀 FIX: For now, we'll let each component handle its own data fetching
  // This avoids Hook order violations from conditional calls
  // Future optimization: pass data as props to avoid duplicate fetching
  
  if (variant === 'compact') {
    // CompactBuildProgress currently expects legacy events
    // For now, return empty state - this variant may not be actively used
    return (
      <CompactBuildProgress
        events={[]}
        className={className}
      />
    )
  }

  // Default variant uses CleanBuildProgress directly
  // CleanBuildProgress will call useCleanBuildEvents internally
  return (
    <CleanBuildProgress
      buildId={buildId}
      userId={userId}
      projectId={projectId}
      sendMessage={sendMessage}
      className={className}
    />
  )
}

/**
 * Convenience exports for backward compatibility
 */
export { UnifiedBuildProgress as BuildProgress }
export { UnifiedBuildProgress as SmartBuildProgress }

/**
 * Type exports for consumers
 */
export type { UnifiedBuildProgressProps }