/**
 * Project Status Hook with Smart Polling
 * Provides project status updates via server-side API route
 *
 * Best Practices Applied:
 * - Compatible with server auth architecture
 * - Uses React Query for caching and background refetching
 * - Adaptive polling intervals based on project state
 * - Proper error handling and retry logic
 * - Performance optimized with stale-while-revalidate
 * 
 * CLIENT-SAFE: Uses API routes instead of direct server service calls
 */

'use client';

/* eslint-disable no-restricted-globals */

import type { ProjectStatus } from '@/types/version-management';
import { logger } from '@/utils/logger';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/client/api-fetch';

// ✅ PHASE 3: Updated interface to match mapping utility
export interface ProjectStatusData {
  id: string;
  buildStatus: string;
  currentVersionId: string | null;
  currentVersionName: string | null;
  previewUrl: string | null;
  subdomain: string | null;
  lastBuildStarted: string | null;
  lastBuildCompleted: string | null;
  updatedAt: string;
}

/**
 * Get project status from API endpoint
 */
async function getProjectStatusFromAPI(projectId: string): Promise<ProjectStatusData> {
  logger.info(`📊 Fetching project status for project: ${projectId}`);

  try {
    // Use our API route to fetch status from database
    const data = await apiGet<ProjectStatusData>(
      `/api/projects/${projectId}/status`
    );

    logger.info(`✅ Retrieved project status for ${projectId}`);
    return data;
  } catch (error) {
    logger.error(`❌ Failed to fetch project status:`, error);
    throw error;
  }
}

/**
 * Smart polling hook with adaptive intervals
 * Default strategy: React Query polling (proven pattern)
 */
export function useProjectStatus(projectId: string) {
  const useRealtime = process.env.NEXT_PUBLIC_USE_REALTIME_STATUS === 'true';
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);

  // Always call both hooks to satisfy Rules of Hooks
  const queryResult = useQuery({
    queryKey: ['project-status', projectId],
    queryFn: () => getProjectStatusFromAPI(projectId),
    // Enable polling during rollback operations for faster updates
    refetchInterval: (query) => {
      // Poll every 2 seconds during rollback
      if (query.state.data?.buildStatus === 'rollingBack') {
        return 2000;
      }
      // No polling for stable states
      return false;
    },
    refetchIntervalInBackground: false, // Pause when tab not visible
    staleTime: 1000, // Consider data stale after 1s
    retry: (failureCount, error) => {
      // Retry up to 3 times for network errors
      if (failureCount < 3) {
        logger.warn(`Project status fetch failed, retrying (${failureCount + 1}/3):`, error);
        return true;
      }
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    enabled: !useRealtime, // Disable when using Realtime
  });

  const realtimeResult = useRealtimeProjectStatus(projectId, !useRealtime); // Disable when using query
  
  // Track status transitions to force refresh on rollback completion
  useEffect(() => {
    const currentStatus = queryResult.data?.buildStatus;
    if (previousStatus === 'rollingBack' && currentStatus === 'deployed') {
      logger.info(`🎆 Rollback completed! Status changed from rollingBack to deployed`);
      // Force a complete refresh of the data
      queryResult.refetch();
    }
    setPreviousStatus(currentStatus || null);
  }, [queryResult.data?.buildStatus, queryResult, previousStatus]);

  // Return the appropriate result based on the feature flag
  if (useRealtime) {
    return realtimeResult;
  }

  return queryResult;
}

/**
 * Optional Realtime implementation (feature-flagged)
 * Uses Supabase Realtime subscription for active tabs
 */
function useRealtimeProjectStatus(projectId: string, disabled: boolean = false) {
  const [status, setStatus] = useState<ProjectStatusData>();
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (disabled) return;

    let mounted = true;

    // Initial fetch using API route (works with server auth)
    getProjectStatusFromAPI(projectId)
      .then(data => {
        if (mounted) {
          setStatus(data);
          setIsLoading(false);
          setError(null);
        }
      })
      .catch(err => {
        if (mounted) {
          setError(err);
          setIsLoading(false);
        }
      });

    // Note: Realtime subscriptions are disabled when server auth is enabled
    // since client-side Supabase access is blocked. The API polling approach
    // provides reliable updates without requiring direct database access.
    logger.info(`📊 Using API polling for project ${projectId} (server auth enabled)`);

    // No automatic polling - updates handled by build events
    return () => {
      mounted = false;
      logger.info(`🔌 Cleaned up project status for ${projectId}`);
    };
  }, [projectId, queryClient, disabled]);

  return {
    data: status,
    error,
    isLoading,
    refetch: () => getProjectStatusFromAPI(projectId).then(setStatus).catch(setError)
  };
}

/**
 * Hook to get current project status value without subscription
 * Useful for one-time checks or server components
 */
export function useProjectStatusValue(projectId: string): ProjectStatusData | undefined {
  const queryClient = useQueryClient();
  return queryClient.getQueryData(['project-status', projectId]);
}

/**
 * Manual refresh helper for user-triggered updates
 */
export function useRefreshProjectStatus() {
  const queryClient = useQueryClient();

  return (projectId: string) => {
    queryClient.invalidateQueries({ queryKey: ['project-status', projectId] });
  };
}

/**
 * Helper to determine if project is in active operation state
 */
export function isActiveOperation(status: string): boolean {
  return ['building', 'rollingBack', 'queued'].includes(status);
}

/**
 * Helper to determine if project is in error state
 */
export function isErrorState(status: string): boolean {
  return ['failed', 'rollbackFailed'].includes(status);
}

/**
 * Helper to determine if project is stable
 */
export function isStableState(status: string): boolean {
  return status === 'deployed';
}

/**
 * Get user-friendly status message
 */
export function getStatusMessage(status: string): string {
  switch (status) {
    case 'building':
      return 'Building your project...';
    case 'rollingBack':
      return 'Rolling back to previous version...';
    case 'queued':
      return 'Build queued - waiting for current operation to complete';
    case 'deployed':
      return 'Project deployed successfully';
    case 'failed':
      return 'Build failed - check logs for details';
    case 'rollbackFailed':
      return 'Rollback failed - please contact support';
    default:
      return 'Unknown status';
  }
}

/**
 * Get appropriate polling interval for manual overrides
 */
export function getPollingInterval(status: string): number {
  switch (status) {
    case 'building':
    case 'rollingBack':
      return 2000; // 2s for active operations
    case 'queued':
      return 5000; // 5s for queued state
    case 'deployed':
    case 'failed':
    case 'rollbackFailed':
      return 30000; // 30s for stable/error states
    default:
      return 10000; // 10s default
  }
}
