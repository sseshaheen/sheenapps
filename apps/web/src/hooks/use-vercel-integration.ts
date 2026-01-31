/**
 * React Query hooks for Vercel Integration
 * Provides caching and real-time updates for Vercel connection status, projects, and deployments
 */

'use client';

/* eslint-disable no-restricted-globals */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getVercelConnectionStatus,
  listVercelProjects,
  listVercelDeployments,
  linkVercelProject,
  unlinkVercelProject,
  deployToVercel,
  promoteToProduction,
  disconnectVercel
} from '@/lib/actions/vercel-integration-actions';
import { logger } from '@/utils/logger';
import type {
  VercelConnectionStatusResponse,
  VercelProjectListResponse,
  VercelDeploymentListResponse,
  UseVercelConnectionOptions,
  UseVercelProjectsOptions,
  UseVercelDeploymentsOptions
} from '@/types/vercel-integration';

// Query keys
const VERCEL_QUERY_KEYS = {
  connection: ['vercel', 'connection'] as const,
  projects: ['vercel', 'projects'] as const,
  deployments: (projectId: string) => ['vercel', 'deployments', projectId] as const,
  autoDeploy: (projectId: string) => ['vercel', 'auto-deploy', projectId] as const,
} as const;

/**
 * Hook to manage Vercel connection status
 */
export function useVercelConnection(options: UseVercelConnectionOptions = {}) {
  const {
    enabled = true,
    refetchInterval = 30000, // Refetch every 30 seconds
  } = options;

  return useQuery({
    queryKey: VERCEL_QUERY_KEYS.connection,
    queryFn: async (): Promise<VercelConnectionStatusResponse> => {
      try {
        const result = await getVercelConnectionStatus();
        return result;
      } catch (error) {
        logger.error('Failed to fetch Vercel connection status:', error);
        // Return default state on error
        return { connected: false, connections: [] };
      }
    },
    enabled,
    refetchInterval,
    refetchOnWindowFocus: true,
    staleTime: 15000, // Consider stale after 15 seconds
  });
}

/**
 * Hook to list available Vercel projects
 */
export function useVercelProjects(options: UseVercelProjectsOptions = {}) {
  const {
    enabled = true,
    limit = 20,
  } = options;

  return useQuery({
    queryKey: [...VERCEL_QUERY_KEYS.projects, limit],
    queryFn: async (): Promise<VercelProjectListResponse> => {
      const result = await listVercelProjects(limit, 0);
      return result;
    },
    enabled,
    staleTime: 60000, // Consider stale after 1 minute
    refetchOnWindowFocus: false, // Don't refetch on focus (projects don't change often)
  });
}

/**
 * Hook to list deployments for a project
 */
export function useVercelDeployments(
  projectId: string,
  options: UseVercelDeploymentsOptions = {}
) {
  const {
    enabled = true,
    limit = 10,
    refetchInterval = 10000, // Refetch every 10 seconds during active deployments
  } = options;

  const query = useQuery({
    queryKey: [...VERCEL_QUERY_KEYS.deployments(projectId), limit],
    queryFn: async (): Promise<VercelDeploymentListResponse> => {
      const result = await listVercelDeployments(projectId, limit, 0);
      return result;
    },
    enabled: enabled && !!projectId,
    refetchInterval: (query) => {
      // Only poll if there are active deployments
      const hasActiveDeployments = query.state.data?.deployments?.some(d => 
        ['QUEUED', 'INITIALIZING', 'BUILDING'].includes(d.state)
      );
      return hasActiveDeployments ? refetchInterval : false;
    },
    refetchOnWindowFocus: true,
    staleTime: 5000, // Consider stale after 5 seconds
  });

  return query;
}

/**
 * Mutation hook for disconnecting Vercel
 */
export function useDisconnectVercel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectVercel,
    onSuccess: () => {
      // Invalidate connection status
      queryClient.invalidateQueries({ queryKey: VERCEL_QUERY_KEYS.connection });
      logger.info('Vercel integration disconnected successfully');
    },
    onError: (error) => {
      logger.error('Failed to disconnect Vercel integration:', error);
    },
  });
}

/**
 * Mutation hook for linking a Vercel project
 */
export function useLinkVercelProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sheenProjectId,
      vercelProjectId,
      options = {}
    }: {
      sheenProjectId: string;
      vercelProjectId: string;
      options?: {
        autoDeployEnabled?: boolean;
        deploymentBranchPatterns?: string[];
        environmentTargets?: ('production' | 'preview' | 'development')[];
      };
    }) => linkVercelProject(sheenProjectId, vercelProjectId, options),
    onSuccess: (data, variables) => {
      // Invalidate deployments for this project
      queryClient.invalidateQueries({
        queryKey: VERCEL_QUERY_KEYS.deployments(variables.sheenProjectId)
      });
      logger.info('Vercel project linked successfully', {
        sheenProjectId: variables.sheenProjectId,
        vercelProjectId: variables.vercelProjectId,
        mappingId: data.mapping?.id
      });
    },
    onError: (error, variables) => {
      logger.error('Failed to link Vercel project:', {
        error,
        sheenProjectId: variables.sheenProjectId,
        vercelProjectId: variables.vercelProjectId
      });
    },
  });
}

/**
 * Mutation hook for unlinking a Vercel project
 */
export function useUnlinkVercelProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unlinkVercelProject,
    onSuccess: (data, projectId) => {
      // Invalidate deployments for this project
      queryClient.invalidateQueries({
        queryKey: VERCEL_QUERY_KEYS.deployments(projectId)
      });
      logger.info('Vercel project unlinked successfully', { projectId });
    },
    onError: (error, projectId) => {
      logger.error('Failed to unlink Vercel project:', { error, projectId });
    },
  });
}

/**
 * Mutation hook for deploying to Vercel
 */
export function useDeployToVercel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      deploymentType,
      gitSource
    }: {
      projectId: string;
      deploymentType: 'production' | 'preview';
      gitSource?: {
        branch: string;
        commitSha?: string;
      };
    }) => deployToVercel(projectId, deploymentType, gitSource),
    onSuccess: (data, variables) => {
      // Invalidate deployments to show new deployment
      queryClient.invalidateQueries({
        queryKey: VERCEL_QUERY_KEYS.deployments(variables.projectId)
      });
      logger.info('Deployment to Vercel initiated successfully', {
        projectId: variables.projectId,
        deploymentType: variables.deploymentType,
        deploymentId: data.deployment?.deployment_id
      });
    },
    onError: (error, variables) => {
      logger.error('Failed to deploy to Vercel:', {
        error,
        projectId: variables.projectId,
        deploymentType: variables.deploymentType
      });
    },
  });
}

/**
 * Mutation hook for promoting deployment to production
 */
export function usePromoteToProduction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      deploymentId
    }: {
      projectId: string;
      deploymentId: string;
    }) => promoteToProduction(projectId, deploymentId),
    onSuccess: (data, variables) => {
      // Invalidate deployments to show updated status
      queryClient.invalidateQueries({
        queryKey: VERCEL_QUERY_KEYS.deployments(variables.projectId)
      });
      logger.info('Deployment promoted to production successfully', {
        projectId: variables.projectId,
        deploymentId: variables.deploymentId,
        productionUrl: data.productionUrl
      });
    },
    onError: (error, variables) => {
      logger.error('Failed to promote deployment to production:', {
        error,
        projectId: variables.projectId,
        deploymentId: variables.deploymentId
      });
    },
  });
}

/**
 * Utility hook to check if Vercel integration is enabled
 */
export function useVercelIntegrationEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_VERCEL_INTEGRATION === 'true';
}
