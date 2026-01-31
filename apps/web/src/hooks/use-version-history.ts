/**
 * Version History Hook
 * Fetches and manages project version history with enhanced Worker API v2.4 data
 * 
 * CLIENT-SAFE: Uses API routes instead of direct server service calls
 * 
 * IMPORTANT: About includePatches parameter:
 * - Set to TRUE when you need the actual/complete version list (current version, search, stats, modals)
 * - Set to FALSE only when you want to show major/minor versions for simplified UI views
 * - Default is FALSE for backward compatibility, but most use cases should explicitly set it
 */

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/lib/client/api-fetch';
import { logger } from '@/utils/logger';
import type { EnhancedVersion, VersionHistoryResponse } from '@/types/version-management';

interface UseVersionHistoryOptions {
  state?: 'all' | 'published' | 'unpublished';
  limit?: number;
  offset?: number;
  includePatches?: boolean;
  showDeleted?: boolean;
  enabled?: boolean;
}

/**
 * Hook to fetch version history with enhanced metadata
 * Uses Worker API v2.4 for complete version data with smart action flags
 */
export function useVersionHistory(projectId: string, options: UseVersionHistoryOptions = {}) {
  const {
    state = 'all',
    limit = 20,
    offset = 0,
    includePatches = false,
    showDeleted = false,
    enabled = true
  } = options;

  return useQuery({
    queryKey: ['version-history', projectId, { state, limit, offset, includePatches, showDeleted }],
    queryFn: async (): Promise<VersionHistoryResponse> => {
      logger.info(`Fetching version history for project ${projectId}`);
      
      try {
        // Build query parameters with cache-busting
        const params = new URLSearchParams({
          state,
          limit: limit.toString(),
          offset: offset.toString(),
          includePatches: includePatches.toString(),
          showDeleted: showDeleted.toString(),
          _t: Date.now().toString() // Cache-busting timestamp
        });

        // Use API route instead of direct service call
        // Add no-cache headers to fetch request
        const response = await apiGet<VersionHistoryResponse>(
          `/api/worker/versions/${projectId}?${params}`,
          {
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          }
        );

        logger.info(`✅ Retrieved ${response.versions.length} versions for project ${projectId}`);
        return response;
      } catch (error) {
        logger.error(`❌ Failed to fetch version history for project ${projectId}:`, error);
        throw error;
      }
    },
    enabled: enabled && !!projectId,
    staleTime: 0, // Always consider data stale to force fresh fetches
    gcTime: 0, // Don't cache in React Query (was cacheTime in v4)
    refetchInterval: false, // Disable auto-polling
    refetchOnWindowFocus: true, // Enable refetch on focus to get latest data
    refetchOnReconnect: true, // Enable refetch on reconnect
    retry: (failureCount, error) => {
      // Retry up to 2 times for API errors
      if (failureCount < 2) {
        logger.warn(`Version history fetch failed, retrying (${failureCount + 1}/2):`, error);
        return true;
      }
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
  });
}

/**
 * Hook to get the current/latest version from version history
 * Useful for getting enhanced version data for the current project state
 * 
 * IMPORTANT: Always includes patches since the current version could be a patch release
 * We want to show the actual current version, not skip it if it's a patch
 */
export function useCurrentVersion(projectId: string) {
  const { data: versionHistory, ...rest } = useVersionHistory(projectId, {
    limit: 1,
    state: 'all',
    includePatches: true  // Always include patches for current version
  });

  const currentVersion = versionHistory?.versions?.[0] || null;

  return {
    data: currentVersion,
    ...rest
  };
}

/**
 * Hook to get published versions only
 * Includes patches since published versions should show all releases
 */
export function usePublishedVersions(projectId: string, limit: number = 10) {
  return useVersionHistory(projectId, {
    state: 'published',
    limit,
    includePatches: true // Include patches for complete published history
  });
}

/**
 * Hook to get unpublished (deployed but not published) versions
 * Includes patches to show all unpublished versions
 */
export function useUnpublishedVersions(projectId: string, limit: number = 10) {
  return useVersionHistory(projectId, {
    state: 'unpublished',
    limit,
    includePatches: true // Include patches for complete unpublished history
  });
}

/**
 * Helper to find a specific version by ID from version history
 * Includes patches since we're looking for a specific version that could be a patch
 */
export function useFindVersion(projectId: string, versionId: string | null) {
  const { data: versionHistory, isLoading, error } = useVersionHistory(projectId, {
    includePatches: true // Include patches when searching for specific version
  });
  
  const version = versionHistory?.versions?.find(v => v.id === versionId) || null;
  
  return {
    data: version,
    isLoading,
    error,
    found: !!version
  };
}

/**
 * Helper to get version statistics
 * Includes patches to get accurate counts
 */
export function useVersionStats(projectId: string) {
  const { data: versionHistory, isLoading, error } = useVersionHistory(projectId, {
    includePatches: true // Include patches for accurate statistics
  });
  
  const stats = versionHistory ? {
    total: versionHistory.pagination.total,
    published: versionHistory.versions.filter(v => v.isPublished).length,
    unpublished: versionHistory.versions.filter(v => !v.isPublished).length,
    withArtifacts: versionHistory.versions.filter(v => v.hasArtifact).length,
    canRollback: versionHistory.versions.filter(v => v.canRollback).length,
    latestVersion: versionHistory.versions[0] || null
  } : null;
  
  return {
    data: stats,
    isLoading,
    error
  };
}

/**
 * Helper to check if a project has any published versions
 */
export function useHasPublishedVersions(projectId: string) {
  const { data: publishedVersions, isLoading } = usePublishedVersions(projectId, 1);
  
  return {
    hasPublished: (publishedVersions?.versions.length || 0) > 0,
    isLoading
  };
}

/**
 * Helper to invalidate version history cache
 * Useful after operations that change version state (publish, unpublish, rollback)
 */
export function useInvalidateVersionHistory() {
  const queryClient = useQueryClient();
  
  return {
    invalidate: (projectId?: string) => {
      if (projectId) {
        // Invalidate specific project's version history
        queryClient.invalidateQueries({ queryKey: ['version-history', projectId] });
      } else {
        // Invalidate all version history queries
        queryClient.invalidateQueries({ queryKey: ['version-history'] });
      }
    },
    remove: (projectId?: string) => {
      if (projectId) {
        // Remove specific project's version history from cache entirely
        queryClient.removeQueries({ queryKey: ['version-history', projectId] });
      } else {
        // Remove all version history queries from cache
        queryClient.removeQueries({ queryKey: ['version-history'] });
      }
    }
  };
}

/**
 * Hook for version history with search and filtering
 * Includes patches since search results should be comprehensive
 */
export function useVersionSearch(projectId: string, searchTerm?: string) {
  const { data: versionHistory, ...rest } = useVersionHistory(projectId, {
    includePatches: true // Include patches in search results
  });
  
  const filteredVersions = versionHistory?.versions?.filter(version => {
    if (!searchTerm) return true;
    
    const term = searchTerm.toLowerCase();
    return (
      version.name.toLowerCase().includes(term) ||
      version.description.toLowerCase().includes(term) ||
      version.semver.toLowerCase().includes(term)
    );
  }) || [];
  
  return {
    data: {
      ...versionHistory,
      versions: filteredVersions
    },
    filteredCount: filteredVersions.length,
    totalCount: versionHistory?.versions.length || 0,
    ...rest
  };
}