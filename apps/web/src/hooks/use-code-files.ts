/**
 * Code Files Hooks
 *
 * React Query hooks for fetching project code files.
 */

'use client'

import { normalizeContent, useCodeViewerStore, type FileState } from '@/store/code-viewer-store'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

// ============================================================================
// Types
// ============================================================================

interface GetFilesResponse {
  files: {
    path: string
    type: 'file' | 'directory'
    size?: number
    language?: string
    hash?: string
    children?: GetFilesResponse['files']
  }[]
  totalFiles: number
  totalSize: number
  buildId?: string
}

interface GetFileResponse {
  path: string
  content: string
  language: string
  size: number
  lastModified: string
  hash: string
}

interface AcceptChangesRequest {
  files: string[]
  baseHashes?: Record<string, string>
}

interface AcceptChangesResponse {
  accepted: string[]
  conflicts: string[]
  projectId: string
  newBuildId: string
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchFiles(
  projectId: string,
  buildId?: string
): Promise<GetFilesResponse> {
  const params = new URLSearchParams()
  if (buildId) params.set('buildId', buildId)

  const response = await fetch(`/api/v1/projects/${projectId}/files?${params}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch files: ${response.statusText}`)
  }

  return response.json()
}

async function fetchFile(
  projectId: string,
  path: string,
  buildId?: string
): Promise<GetFileResponse> {
  const params = new URLSearchParams({ path })
  if (buildId) params.set('buildId', buildId)

  const response = await fetch(`/api/v1/projects/${projectId}/files?${params}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`)
  }

  return response.json()
}

async function acceptChanges(
  buildId: string,
  files: string[],
  baseHashes?: Record<string, string>
): Promise<AcceptChangesResponse> {
  const response = await fetch(`/api/v1/builds/${buildId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files, baseHashes }),
  })

  if (!response.ok) {
    throw new Error(`Failed to accept changes: ${response.statusText}`)
  }

  return response.json()
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch list of files in a project
 */
export function useCodeFiles(projectId: string, buildId?: string) {
  const setFiles = useCodeViewerStore((state) => state.setFiles)

  const query = useQuery({
    queryKey: ['code-files', projectId, buildId ?? 'latest'],
    queryFn: async () => {
      console.log('[useCodeFiles] Fetching files...', { projectId: projectId.slice(0, 8), buildId })
      const data = await fetchFiles(projectId, buildId)
      // Debug logging to help diagnose empty files issue
      console.log('[useCodeFiles] API response:', {
        hasFiles: !!data?.files,
        filesLength: data?.files?.length,
        keys: Object.keys(data || {}),
        buildId,
        projectId: projectId.slice(0, 8)
      })
      return data
    },
    // Only fetch when we have a valid projectId AND buildId
    // Without buildId, the worker may return empty/stale files
    enabled: !!projectId && !!buildId,
    // Don't cache empty responses forever - allow refetch
    staleTime: 0,
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    select: (data) => {
      // Flatten file tree to list
      const flatFiles: FileState[] = []

      // Handle different response shapes from worker
      // Worker might return: { files: [...] }, { tree: [...] }, or { data: [...] }
      const fileTree = data?.files || (data as any)?.tree || (data as any)?.data || []

      if (!Array.isArray(fileTree)) {
        console.warn('[useCodeFiles] Unexpected response shape:', Object.keys(data || {}))
        return { ...data, flatFiles: [] }
      }

      const flattenTree = (
        items: GetFilesResponse['files'],
        parentPath = ''
      ) => {
        for (const item of items) {
          if (item.type === 'file') {
            flatFiles.push({
              path: item.path,
              content: '', // Content loaded separately
              language: item.language || 'text',
              size: item.size || 0,
              isModified: false,
              isNew: false,
              status: 'idle',
              currentHash: item.hash,
            })
          } else if (item.children) {
            flattenTree(item.children, item.path)
          }
        }
      }

      flattenTree(fileTree)
      // console.log('[useCodeFiles] Flattened files:', flatFiles.length)
      return { ...data, flatFiles }
    },
  })

  // Update store when data changes (replaces onSuccess)
  useEffect(() => {
    if (query.data?.flatFiles) {
      setFiles(query.data.flatFiles)
    }
  }, [query.data?.flatFiles, setFiles])

  return query
}

/**
 * Fetch content of a single file
 */
export function useCodeFile(projectId: string, path: string, buildId?: string) {
  const updateFileContent = useCodeViewerStore((state) => state.updateFileContent)

  const query = useQuery({
    queryKey: ['code-file', projectId, path, buildId],
    queryFn: () => fetchFile(projectId, path, buildId),
    enabled: !!path,
    staleTime: buildId ? Infinity : 0,
    select: (data) => ({
      ...data,
      content: normalizeContent(data.content), // Normalize line endings
    }),
  })

  // Update store when data changes (replaces onSuccess)
  useEffect(() => {
    if (query.data) {
      updateFileContent(query.data.path, query.data.content)
    }
  }, [query.data, updateFileContent])

  return query
}

/**
 * Accept generated changes
 */
export function useAcceptChanges() {
  const queryClient = useQueryClient()
  const filesByPath = useCodeViewerStore((state) => state.filesByPath)

  return useMutation({
    mutationFn: ({
      buildId,
      files,
    }: {
      buildId: string
      files: string[]
    }) => {
      // Collect base hashes for conflict detection
      const baseHashes: Record<string, string> = {}
      for (const path of files) {
        const file = filesByPath[path]
        if (file?.baseHash) {
          baseHashes[path] = file.baseHash
        }
      }

      return acceptChanges(buildId, files, baseHashes)
    },
    onSuccess: (data) => {
      // Invalidate file queries to refetch
      queryClient.invalidateQueries({
        queryKey: ['code-files', data.projectId],
      })
    },
  })
}

/**
 * Prefetch file content (for hovering over files in tree)
 */
export function usePrefetchFile() {
  const queryClient = useQueryClient()

  return (projectId: string, path: string, buildId?: string) => {
    queryClient.prefetchQuery({
      queryKey: ['code-file', projectId, path, buildId],
      queryFn: () => fetchFile(projectId, path, buildId),
      staleTime: 60 * 1000, // 1 minute
    })
  }
}
