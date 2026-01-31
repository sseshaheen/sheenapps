/**
 * Sanity Content Management Hook
 * Provides React Query integration for Sanity content operations
 * Handles documents, GROQ queries, and real-time updates
 */

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SanityDocument,
  GetDocumentsFilters,
  GroqQueryRequest,
  GroqQueryResponse,
  SyncDocumentsRequest,
  SyncDocumentsResponse,
  CreatePreviewRequest,
  CreatePreviewResponse,
  UseSanityQueryOptions
} from '@/types/sanity-integration';

// Query keys for content operations
export const SANITY_CONTENT_QUERY_KEYS = {
  documents: (connectionId: string, filters?: GetDocumentsFilters) => 
    ['sanity-documents', connectionId, filters] as const,
  groqQuery: (connectionId: string, query: string, params?: Record<string, any>) => 
    ['sanity-groq-query', connectionId, query, params] as const,
  preview: (previewId: string) => ['sanity-preview', previewId] as const,
  sync: (connectionId: string) => ['sanity-sync', connectionId] as const,
} as const;

/**
 * Hook for fetching and managing Sanity documents
 */
export function useSanityDocuments(
  connectionId: string,
  filters: GetDocumentsFilters = {},
  options: { enabled?: boolean } = {}
) {
  const queryClient = useQueryClient();

  const {
    data: documents = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: SANITY_CONTENT_QUERY_KEYS.documents(connectionId, filters),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.set(key, value.toString());
        }
      });

      const queryString = queryParams.toString();
      const url = `/api/sanity/connections/${connectionId}/documents${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch documents');
      }

      return response.json();
    },
    enabled: !!connectionId && (options.enabled !== false),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Sync documents mutation
  const syncDocumentsMutation = useMutation({
    mutationFn: async (syncOptions: SyncDocumentsRequest = {}) => {
      const queryParams = syncOptions.force ? '?force=true' : '';
      
      const response = await fetch(
        `/api/sanity/connections/${connectionId}/sync${queryParams}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to sync documents');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate documents cache after sync
      queryClient.invalidateQueries({ 
        queryKey: ['sanity-documents', connectionId]
      });
    },
  });

  return {
    documents,
    isLoading,
    error,
    refetch,
    
    // Sync operations
    syncDocuments: syncDocumentsMutation.mutate,
    isSyncing: syncDocumentsMutation.isPending,
    syncError: syncDocumentsMutation.error,
    syncResult: syncDocumentsMutation.data,
    
    // Helper functions
    getDocumentsByType: (type: string) => documents.filter(doc => doc.document_type === type),
    getDocumentsByLanguage: (language: string) => documents.filter(doc => doc.language === language),
    getDraftDocuments: () => documents.filter(doc => doc.version_type === 'draft'),
    getPublishedDocuments: () => documents.filter(doc => doc.version_type === 'published'),
  };
}

/**
 * Hook for executing GROQ queries
 */
export function useSanityQuery<T = any>(
  connectionId: string,
  query: string,
  params?: Record<string, any>,
  options: UseSanityQueryOptions = {}
) {
  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: SANITY_CONTENT_QUERY_KEYS.groqQuery(connectionId, query, params),
    queryFn: async (): Promise<GroqQueryResponse<T>> => {
      const requestBody: GroqQueryRequest = {
        groq_query: query,
        params,
        cache: options.cache,
        cache_ttl_seconds: options.cache_ttl_seconds
      };

      const response = await fetch(
        `/api/sanity/connections/${connectionId}/query`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'GROQ query failed');
      }

      return response.json();
    },
    enabled: !!connectionId && !!query && (options.enabled !== false),
    staleTime: options.cache_ttl_seconds ? options.cache_ttl_seconds * 1000 : 5 * 60 * 1000,
    refetchInterval: options.refetchInterval,
  });

  return {
    // Raw response data
    response: data,
    
    // Convenience accessors
    data: data?.data,
    queryTime: data?.query_time_ms,
    cached: data?.cached,
    dependencies: data?.document_dependencies,
    
    // Query state
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook for managing Sanity previews
 */
export function useSanityPreview(
  connectionId: string,
  previewParams?: CreatePreviewRequest
) {
  const queryClient = useQueryClient();

  // Create preview mutation
  const createPreviewMutation = useMutation({
    mutationFn: async (params: CreatePreviewRequest) => {
      const response = await fetch(
        `/api/sanity/connections/${connectionId}/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create preview');
      }

      return response.json();
    },
    onSuccess: (previewData: CreatePreviewResponse) => {
      // Cache preview data
      queryClient.setQueryData(
        SANITY_CONTENT_QUERY_KEYS.preview(previewData.preview_id),
        previewData
      );
    },
  });

  // Validate preview mutation
  const validatePreviewMutation = useMutation({
    mutationFn: async ({ previewId, secret }: { previewId: string; secret: string }) => {
      const response = await fetch(
        `/api/sanity/preview/${previewId}/validate?secret=${encodeURIComponent(secret)}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Preview validation failed');
      }

      return response.json();
    },
  });

  return {
    // Actions
    createPreview: createPreviewMutation.mutate,
    validatePreview: validatePreviewMutation.mutate,
    
    // States
    isCreatingPreview: createPreviewMutation.isPending,
    isValidatingPreview: validatePreviewMutation.isPending,
    
    // Data
    previewData: createPreviewMutation.data,
    validationResult: validatePreviewMutation.data,
    
    // Errors
    createError: createPreviewMutation.error,
    validationError: validatePreviewMutation.error,
  };
}

/**
 * Hook for real-time content updates via webhook polling
 */
export function useSanityRealtime(
  connectionId: string,
  options: { interval?: number; enabled?: boolean } = {}
) {
  const { interval = 5000, enabled = true } = options;
  const queryClient = useQueryClient();

  const { data: lastUpdate } = useQuery({
    queryKey: ['sanity-realtime', connectionId],
    queryFn: async () => {
      const response = await fetch(
        `/api/sanity/connections/${connectionId}/webhooks?limit=1`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch webhook events');
      }

      const data = await response.json();
      return data.events?.[0]?.created_at ? new Date(data.events[0].created_at) : null;
    },
    enabled: !!connectionId && enabled,
    refetchInterval: interval,
    refetchOnWindowFocus: true,
  });

  // Function to trigger content refresh
  const refreshContent = () => {
    // Invalidate all document queries for this connection
    queryClient.invalidateQueries({
      predicate: (query) => {
        const queryKey = query.queryKey;
        return (
          Array.isArray(queryKey) &&
          queryKey.includes('sanity-documents') &&
          queryKey.includes(connectionId)
        );
      }
    });

    // Invalidate GROQ queries for this connection
    queryClient.invalidateQueries({
      predicate: (query) => {
        const queryKey = query.queryKey;
        return (
          Array.isArray(queryKey) &&
          queryKey.includes('sanity-groq-query') &&
          queryKey.includes(connectionId)
        );
      }
    });
  };

  return {
    lastUpdate,
    refreshContent,
  };
}