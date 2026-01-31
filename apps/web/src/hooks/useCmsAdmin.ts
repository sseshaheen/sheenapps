'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiResponse } from '@/types/inhouse-api'
import type { CmsContentEntry, CmsContentType, CmsEntryStatus, CmsMediaItem } from '@/types/inhouse-cms'
import { safeJson } from '@/lib/api/safe-json'

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

async function parseError(response: Response): Promise<Error> {
  const errorData = await safeJson<ApiResponse<never>>(response)
  const message =
    errorData?.ok === false && errorData.error?.message
      ? errorData.error.message
      : `Server error (${response.status})`
  return new Error(message)
}

export function useCmsContentTypes(projectId: string, enabled = true) {
  return useQuery<CmsContentType[], Error>({
    queryKey: ['cms-types', projectId],
    enabled: enabled && !!projectId,
    queryFn: async () => {
      const response = await fetch(`/api/inhouse/projects/${projectId}/cms/types`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })

      if (!response.ok) {
        throw await parseError(response)
      }

      const data = await response.json() as ApiResponse<{ types: CmsContentType[] }>
      if (data.ok === false) {
        throw new Error(data.error.message || 'Failed to load content types')
      }

      return data.data.types
    }
  })
}

export function useCreateCmsContentType(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation<CmsContentType, Error, { name: string; slug: string; schema: Record<string, unknown> }>({
    mutationFn: async (payload) => {
      const response = await fetch(`/api/inhouse/projects/${projectId}/cms/types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw await parseError(response)
      }

      const data = await response.json() as ApiResponse<{ type: CmsContentType }>
      if (data.ok === false) {
        throw new Error(data.error.message || 'Failed to create content type')
      }

      return data.data.type
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-types', projectId] })
    }
  })
}

interface CmsEntriesParams {
  contentTypeId?: string
  contentType?: string
  status?: CmsEntryStatus
  locale?: string
  limit?: number
  offset?: number
}

export function useCmsEntries(projectId: string, params: CmsEntriesParams, enabled = true) {
  return useQuery<CmsContentEntry[], Error>({
    queryKey: ['cms-entries', projectId, params],
    enabled: enabled && !!projectId,
    queryFn: async () => {
      const query = buildQuery({
        contentTypeId: params.contentTypeId,
        contentType: params.contentType,
        status: params.status,
        locale: params.locale,
        limit: params.limit,
        offset: params.offset
      })

      const response = await fetch(`/api/inhouse/projects/${projectId}/cms/entries${query}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })

      if (!response.ok) {
        throw await parseError(response)
      }

      const data = await response.json() as ApiResponse<{ entries: CmsContentEntry[] }>
      if (data.ok === false) {
        throw new Error(data.error.message || 'Failed to load entries')
      }

      return data.data.entries
    }
  })
}

export function useCreateCmsEntry(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation<
    CmsContentEntry,
    Error,
    { contentTypeId: string; slug?: string; data: Record<string, unknown>; status?: CmsEntryStatus; locale?: string }
  >({
    mutationFn: async (payload) => {
      const response = await fetch(`/api/inhouse/projects/${projectId}/cms/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw await parseError(response)
      }

      const data = await response.json() as ApiResponse<{ entry: CmsContentEntry }>
      if (data.ok === false) {
        throw new Error(data.error.message || 'Failed to create entry')
      }

      return data.data.entry
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-entries', projectId] })
    }
  })
}

export function useUpdateCmsEntry(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation<
    CmsContentEntry,
    Error,
    { entryId: string; data?: Record<string, unknown>; status?: CmsEntryStatus; slug?: string | null; locale?: string }
  >({
    mutationFn: async ({ entryId, ...payload }) => {
      const response = await fetch(`/api/inhouse/projects/${projectId}/cms/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw await parseError(response)
      }

      const data = await response.json() as ApiResponse<{ entry: CmsContentEntry }>
      if (data.ok === false) {
        throw new Error(data.error.message || 'Failed to update entry')
      }

      return data.data.entry
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-entries', projectId] })
    }
  })
}

export function useCmsMedia(projectId: string, params: { limit?: number; offset?: number } = {}, enabled = true) {
  return useQuery<CmsMediaItem[], Error>({
    queryKey: ['cms-media', projectId, params],
    enabled: enabled && !!projectId,
    queryFn: async () => {
      const query = buildQuery({ limit: params.limit, offset: params.offset })
      const response = await fetch(`/api/inhouse/projects/${projectId}/cms/media${query}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })

      if (!response.ok) {
        throw await parseError(response)
      }

      const data = await response.json() as ApiResponse<{ media: CmsMediaItem[] }>
      if (data.ok === false) {
        throw new Error(data.error.message || 'Failed to load media')
      }

      return data.data.media
    }
  })
}

export function useUploadCmsMedia(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation<
    CmsMediaItem,
    Error,
    { filename: string; contentBase64: string; contentType?: string; altText?: string; metadata?: Record<string, unknown> }
  >({
    mutationFn: async (payload) => {
      const response = await fetch(`/api/inhouse/projects/${projectId}/cms/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw await parseError(response)
      }

      const data = await response.json() as ApiResponse<{ media: CmsMediaItem }>
      if (data.ok === false) {
        throw new Error(data.error.message || 'Failed to upload media')
      }

      return data.data.media
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-media', projectId] })
    }
  })
}
