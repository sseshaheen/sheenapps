/**
 * Project Recommendations Hook
 * Fetches post-deployment recommendations for enhancing the user's project
 */

'use client'

import { useQuery } from '@tanstack/react-query'
import type { 
  ProjectRecommendation, 
  ProjectRecommendationsResponse 
} from '@/types/project-recommendations'
import { logger } from '@/utils/logger'

interface UseProjectRecommendationsOptions {
  /** Enable automatic fetching */
  enabled?: boolean
  /** Stale time in milliseconds (recommendations don't change often) */
  staleTime?: number
}

interface UseProjectRecommendationsReturn {
  /** Array of recommendations */
  recommendations: ProjectRecommendation[]
  /** Whether recommendations are currently loading */
  isLoading: boolean
  /** Whether the request was successful */
  isSuccess: boolean
  /** Error object if request failed */
  error: Error | null
  /** Whether there are any recommendations available */
  hasRecommendations: boolean
  /** Manually refetch recommendations */
  refetch: () => void
}

/**
 * Hook for fetching project recommendations after build completion
 * Provides intelligent caching and error handling for recommendation data
 */
export function useProjectRecommendations(
  projectId: string | null,
  userId: string | null,
  options: UseProjectRecommendationsOptions = {}
): UseProjectRecommendationsReturn {
  const {
    enabled = true,
    staleTime = 5 * 60 * 1000 // 5 minutes - recommendations don't change often
  } = options

  const { 
    data, 
    isSuccess, 
    isLoading, 
    error,
    refetch
  } = useQuery({
    queryKey: ['project-recommendations', projectId, userId],
    queryFn: async (): Promise<ProjectRecommendationsResponse> => {
      if (!projectId || !userId) {
        throw new Error('Missing projectId or userId')
      }

      logger.info('🎯 Fetching project recommendations:', {
        projectId: projectId.slice(0, 8),
        userId: userId.slice(0, 8)
      })

      const response = await fetch(
        `/api/projects/${projectId}/recommendations?userId=${userId}`,
        {
          credentials: 'include', // Include authentication cookies
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('❌ Failed to fetch recommendations:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          projectId: projectId.slice(0, 8)
        })
        throw new Error(`Failed to fetch recommendations: ${response.status} ${response.statusText}`)
      }

      const data: ProjectRecommendationsResponse = await response.json()
      
      if (!data.success) {
        logger.error('❌ Recommendations API returned error:', {
          error: data.error,
          projectId: projectId.slice(0, 8)
        })
        throw new Error(data.error || 'Unknown error fetching recommendations')
      }

      logger.info('✅ Successfully fetched recommendations:', {
        projectId: projectId.slice(0, 8),
        count: data.recommendations.length,
        categories: [...new Set(data.recommendations.map(r => r.category))]
      })

      return data
    },
    enabled: enabled && Boolean(projectId && userId),
    staleTime,
    refetchInterval: false, // Disable auto-polling
    refetchOnWindowFocus: false, // Disable auto-refetch on focus
    refetchOnReconnect: false, // Disable auto-refetch on reconnect
    retry: (failureCount, error) => {
      // Don't retry on 404 (no recommendations) or auth errors
      if (error instanceof Error && error.message.includes('404')) {
        return false
      }
      if (error instanceof Error && error.message.includes('401')) {
        return false
      }
      // Retry up to 2 times for other errors
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  })

  const recommendations = data?.recommendations || []
  
  return {
    recommendations,
    isLoading,
    isSuccess,
    error: error as Error | null,
    hasRecommendations: recommendations.length > 0,
    refetch
  }
}

/**
 * Hook for fetching recommendations when build is complete
 * Automatically enables fetching when build completion is detected
 *
 * @param projectId - Project ID to fetch recommendations for
 * @param userId - User ID
 * @param buildComplete - Whether the build is complete
 * @param options.enabled - Optional override to disable fetching (for feature flags)
 */
export function usePostBuildRecommendations(
  projectId: string | null,
  userId: string | null,
  buildComplete: boolean,
  options?: { enabled?: boolean }
): UseProjectRecommendationsReturn {
  // EXPERT FIX ROUND 16: Accept enabled option to allow feature flagging
  // while maintaining consistent hook call order (Rules of Hooks)
  const featureEnabled = options?.enabled ?? true
  return useProjectRecommendations(projectId, userId, {
    enabled: featureEnabled && buildComplete && Boolean(projectId && userId),
    staleTime: 10 * 60 * 1000 // 10 minutes for post-build recommendations
  })
}