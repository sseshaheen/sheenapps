/**
 * Sanity Connection Management Hook
 * Provides React Query integration for Sanity connections
 * Follows existing hook patterns in the codebase
 */

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SanityConnection,
  CreateSanityConnectionRequest,
  TestSanityConnectionRequest,
  TestSanityConnectionResponse,
  HealthCheckResponse,
  UseSanityConnectionOptions,
  SanityIntegrationError
} from '@/types/sanity-integration';

// Query keys for React Query
export const SANITY_QUERY_KEYS = {
  connections: ['sanity-connections'] as const,
  connection: (id: string) => ['sanity-connection', id] as const,
  connectionHealth: (id: string) => ['sanity-connection-health', id] as const,
} as const;

/**
 * Hook for managing individual Sanity connection
 */
export function useSanityConnection(
  connectionId?: string,
  options: UseSanityConnectionOptions = {}
) {
  const queryClient = useQueryClient();

  // Get connection details
  const {
    data: connection,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: SANITY_QUERY_KEYS.connection(connectionId!),
    queryFn: async () => {
      if (!connectionId) return null;
      
      const response = await fetch(`/api/sanity/connections/${connectionId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch connection');
      }

      return response.json();
    },
    enabled: !!connectionId && (options.enabled !== false),
    refetchInterval: options.refetchInterval,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (params: TestSanityConnectionRequest) => {
      const response = await fetch('/api/sanity/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Connection test failed');
      }

      return response.json();
    },
  });

  // Create connection mutation
  const createConnectionMutation = useMutation({
    mutationFn: async (params: CreateSanityConnectionRequest) => {
      const response = await fetch('/api/sanity/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create connection');
      }

      return response.json();
    },
    onSuccess: (newConnection: SanityConnection) => {
      // Invalidate connections list
      queryClient.invalidateQueries({ queryKey: SANITY_QUERY_KEYS.connections });
      
      // Set new connection in cache
      queryClient.setQueryData(
        SANITY_QUERY_KEYS.connection(newConnection.id), 
        newConnection
      );
    },
  });

  // Update connection mutation
  const updateConnectionMutation = useMutation({
    mutationFn: async (updates: Partial<CreateSanityConnectionRequest>) => {
      if (!connectionId) throw new Error('Connection ID required for update');
      
      const response = await fetch(`/api/sanity/connections/${connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update connection');
      }

      return response.json();
    },
    onSuccess: (updatedConnection: SanityConnection) => {
      // Update connection in cache
      queryClient.setQueryData(
        SANITY_QUERY_KEYS.connection(connectionId!), 
        updatedConnection
      );
      
      // Invalidate connections list
      queryClient.invalidateQueries({ queryKey: SANITY_QUERY_KEYS.connections });
    },
  });

  // Delete connection mutation
  const deleteConnectionMutation = useMutation({
    mutationFn: async () => {
      if (!connectionId) throw new Error('Connection ID required for deletion');
      
      const response = await fetch(`/api/sanity/connections/${connectionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete connection');
      }

      return response.json();
    },
    onSuccess: () => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: SANITY_QUERY_KEYS.connection(connectionId!) });
      
      // Invalidate connections list
      queryClient.invalidateQueries({ queryKey: SANITY_QUERY_KEYS.connections });
    },
  });

  // Health check mutation
  const healthCheckMutation = useMutation({
    mutationFn: async () => {
      if (!connectionId) throw new Error('Connection ID required for health check');
      
      const response = await fetch(`/api/sanity/connections/${connectionId}/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Health check failed');
      }

      return response.json();
    },
    onSuccess: (healthData: HealthCheckResponse) => {
      // Update health check cache
      queryClient.setQueryData(
        SANITY_QUERY_KEYS.connectionHealth(connectionId!),
        healthData
      );
      
      // If health check affected connection status, refetch connection
      if (!healthData.success) {
        queryClient.invalidateQueries({ 
          queryKey: SANITY_QUERY_KEYS.connection(connectionId!) 
        });
      }
    },
  });

  return {
    // Data
    connection,
    isLoading,
    error,
    
    // Actions
    testConnection: testConnectionMutation.mutate,
    createConnection: createConnectionMutation.mutate,
    updateConnection: updateConnectionMutation.mutate,
    deleteConnection: deleteConnectionMutation.mutate,
    checkHealth: healthCheckMutation.mutate,
    refetch,
    
    // States
    isTestingConnection: testConnectionMutation.isPending,
    isCreatingConnection: createConnectionMutation.isPending,
    isUpdatingConnection: updateConnectionMutation.isPending,
    isDeletingConnection: deleteConnectionMutation.isPending,
    isCheckingHealth: healthCheckMutation.isPending,
    
    // Results
    testResult: testConnectionMutation.data,
    testError: testConnectionMutation.error,
    createError: createConnectionMutation.error,
    updateError: updateConnectionMutation.error,
    deleteError: deleteConnectionMutation.error,
    healthError: healthCheckMutation.error,
  };
}

/**
 * Hook for managing multiple Sanity connections
 */
export function useSanityConnections(projectId?: string) {
  const queryClient = useQueryClient();

  const {
    data: connections = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [...SANITY_QUERY_KEYS.connections, projectId],
    queryFn: async () => {
      const url = new URL('/api/sanity/connections', window.location.origin);
      if (projectId) {
        url.searchParams.set('project_id', projectId);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch connections');
      }

      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  return {
    connections,
    isLoading,
    error,
    refetch,
    
    // Helper functions
    getConnectionById: (id: string) => connections.find(conn => conn.id === id),
    getActiveConnections: () => connections.filter(conn => conn.status === 'connected'),
    getConnectionsByProject: (projectId: string) => connections.filter(conn => conn.project_id === projectId),
  };
}