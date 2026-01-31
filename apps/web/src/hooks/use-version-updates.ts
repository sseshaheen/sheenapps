/**
 * Version Updates Hook - MIGRATED TO SERVER-ONLY ARCHITECTURE
 * 
 * Migration: Phase 1.1 - Critical Security Fix
 * Replaced client-side database calls with React Query + server actions
 * Maintains all original functionality with improved security and caching
 */

'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

interface VersionInfo {
  versionId: string | null
  versionName: string | null
  isProcessing: boolean
}

/**
 * Fetch version status from server API route
 * Replaces direct client-side database calls
 */
async function fetchVersionStatus(projectId: string): Promise<VersionInfo> {
  // Add cache-busting timestamp to prevent browser caching issues
  const params = new URLSearchParams({
    t: Date.now().toString()
  })

  const response = await fetch(`/api/projects/${projectId}/version-status?${params}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache'
    }
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Project not found or access denied')
    }
    throw new Error('Failed to fetch version status')
  }

  const result = await response.json()
  
  if (!result.ok) {
    throw new Error(result.message || 'Failed to fetch version status')
  }

  return result.data
}

/**
 * Version Updates Hook with React Query
 * 
 * Maintains original API but uses server-only architecture:
 * - Automatic polling with React Query refetchInterval
 * - Built-in caching and error handling
 * - Access control handled server-side
 * - Cache invalidation on window focus
 */
export function useVersionUpdates(projectId: string) {
  // Manual state for build event updates (preserves original API)
  const [manualVersionInfo, setManualVersionInfo] = useState<VersionInfo | null>(null)

  // React Query for server-side data fetching with polling
  const { 
    data: serverVersionInfo, 
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['project-version-status', projectId],
    queryFn: () => fetchVersionStatus(projectId),
    enabled: !!projectId,
    refetchInterval: 10000, // Poll every 10 seconds (same as original)
    refetchIntervalInBackground: false, // Only poll when tab is active
    refetchOnWindowFocus: true, // Refresh when user returns to tab
    staleTime: 0, // Always consider data stale for real-time updates
    retry: (failureCount, error) => {
      // Don't retry on 404 (access denied)
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return false
      }
      return failureCount < 3
    }
  })

  // Use manual version info if available (from build events), otherwise server data
  const versionInfo = manualVersionInfo || serverVersionInfo || {
    versionId: null,
    versionName: null,
    isProcessing: false
  }

  /**
   * Update version info from build events
   * Preserves original API for backward compatibility
   */
  const updateFromBuildEvent = (event: {
    finished: boolean
    event_type: string
    versionId?: string
    versionName?: string
  }) => {
    if (event.finished && event.event_type === 'completed' && event.versionId) {
      const newVersionInfo = {
        versionId: event.versionId,
        versionName: event.versionName || null,
        isProcessing: !event.versionName
      }
      
      setManualVersionInfo(newVersionInfo)
      
      // Invalidate React Query cache to get fresh data from server
      refetch()
    }
  }

  return {
    versionInfo,
    updateFromBuildEvent,
    isPolling: !error && !isLoading, // Consider polling active when query is running
    isLoading,
    error: error ? String(error) : null
  }
}

/**
 * Simple version display hook without polling
 * Uses React Query for caching but no automatic refetch
 */
export function useProjectVersion(projectId: string) {
  const { data: versionInfo, isLoading, error } = useQuery({
    queryKey: ['project-version-simple', projectId],
    queryFn: () => fetchVersionStatus(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false, // No automatic refresh for simple usage
    retry: false // Don't retry for simple usage
  })

  if (error || isLoading || !versionInfo) {
    return {
      versionId: null,
      versionName: null
    }
  }

  return {
    versionId: versionInfo.versionId,
    versionName: versionInfo.versionName
  }
}