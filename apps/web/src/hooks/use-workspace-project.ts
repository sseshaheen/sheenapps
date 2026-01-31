'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { logger } from '@/utils/logger'
import { fetchAuthJSON, AuthError } from '@/lib/fetch-auth'

export interface Project {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
  archived_at?: string | null
  owner_id?: string
  // Build information for real-time tracking
  buildId?: string | null
  status?: string
  buildStatus?: string
  businessIdea?: string | null
  // Preview URL from worker microservice
  previewUrl?: string | null
  // Template data for preview (sanitized from config)
  templateData?: any | null
  hasTemplate?: boolean
  // Version information
  currentBuildId?: string | null
  currentVersionId?: string | null
  currentVersionName?: string | null
  framework?: string | null
  subdomain?: string | null
  lastBuildStarted?: string | null
  lastBuildCompleted?: string | null
  // Infrastructure mode (Easy Mode vs Pro Mode)
  infraMode?: 'easy' | 'pro' | null
}

interface UseWorkspaceProjectReturn {
  project: Project | null
  isLoading: boolean
  error: {
    code?: string
    message: string
  } | null
  refetch: () => Promise<void>
}

/**
 * Fetches project data with cache-busting headers
 */
async function fetchProjectData(projectId: string): Promise<Project> {
  if (!projectId) {
    throw new Error('Project ID is required')
  }

  // Add cache-busting headers and timestamp to prevent stale data
  const timestamp = Date.now()
  const data = await fetchAuthJSON<{ success: boolean; project: any; timestamp?: string }>(
    `/api/projects/${projectId}?t=${timestamp}`,
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      cache: 'no-store' as RequestCache
    }
  )

  if (!data.success || !data.project) {
    throw new Error('Invalid server response')
  }

  // Log timestamp to verify freshness
  if (data.timestamp) {
    logger.info('📊 Project data freshness check:', {
      serverTimestamp: data.timestamp,
      projectId: projectId.slice(0, 8),
      buildStatus: data.project.buildStatus,
      previewUrl: data.project.previewUrl
    })
  }

  // Convert date strings to Date objects
  return {
    ...data.project,
    createdAt: new Date(data.project.created_at || data.project.createdAt),
    updatedAt: new Date(data.project.updated_at || data.project.updatedAt),
  }
}

/**
 * Hook that fetches projects using React Query for proper cache management
 * Includes automatic refetching and cache invalidation
 */
export function useWorkspaceProject(projectId: string): UseWorkspaceProjectReturn {
  const queryClient = useQueryClient()

  const {
    data: project,
    isLoading,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ['workspace-project', projectId],
    queryFn: () => fetchProjectData(projectId),
    enabled: !!projectId,
    staleTime: 0, // Consider data stale immediately
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes (renamed from cacheTime)
    // Disable auto-polling - build events handle updates during builds
    refetchInterval: false,
    refetchOnWindowFocus: false, // Disable auto-refetch on focus
    refetchOnReconnect: false, // Disable auto-refetch on reconnect
    retry: (failureCount, error) => {
      // Don't retry auth errors
      if (error instanceof AuthError) return false
      // Retry up to 3 times for other errors
      return failureCount < 3
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  })

  // Transform error for consistent interface
  let error: { code?: string; message: string } | null = null
  if (queryError) {
    if (queryError instanceof AuthError) {
      if (queryError.code === 'AUTH_REQUIRED' || queryError.code === 'AUTH_EXPIRED') {
        error = { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      } else if (queryError.code === 'PERMISSION_DENIED') {
        error = { code: 'ACCESS_DENIED', message: 'Access denied' }
      }
    } else if (queryError instanceof Error) {
      if (queryError.message.includes('404')) {
        error = { code: 'PROJECT_NOT_FOUND', message: 'Project not found' }
      } else {
        error = { code: 'NETWORK_ERROR', message: queryError.message }
      }
    }
  }

  // Manual refetch with cache invalidation
  const refetchWithInvalidation = async () => {
    // Invalidate the cache first to ensure fresh data
    await queryClient.invalidateQueries({ queryKey: ['workspace-project', projectId] })
    await refetch()
  }

  return {
    project: project || null,
    isLoading,
    error,
    refetch: refetchWithInvalidation
  }
}

/**
 * Hook to manually invalidate project cache
 * Use this when you know the project has been updated
 */
export function useInvalidateProject() {
  const queryClient = useQueryClient()
  
  return (projectId: string) => {
    logger.info('🔄 Invalidating project cache:', projectId)
    queryClient.invalidateQueries({ queryKey: ['workspace-project', projectId] })
  }
}