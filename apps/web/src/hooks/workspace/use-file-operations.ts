/**
 * File Operations Hook
 *
 * File system operations with ETag caching
 * Follows expert patterns from implementation plan
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/utils/logger'

interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
  extension?: string
}

interface CurrentFile {
  path: string
  content: string
  extension?: string
  size: number
  modified: string
  etag: string
}

interface UseFileOperationsOptions {
  readOnly: boolean
}

interface UseFileOperationsReturn {
  files: FileItem[]
  currentFile: CurrentFile | null
  loading: boolean
  error: string | null
  loadDirectory: (path: string) => Promise<void>
  loadFile: (filePath: string) => Promise<void>
  refreshDirectory: () => Promise<void>
  clearError: () => void
}

// ETag cache for file content
const etagCache = new Map<string, string>()

export function useFileOperations(
  projectId: string,
  currentPath: string,
  options: UseFileOperationsOptions
): UseFileOperationsReturn {
  const [files, setFiles] = useState<FileItem[]>([])
  const [currentFile, setCurrentFile] = useState<CurrentFile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get current user (for advisor ID)
  const getCurrentUser = useCallback(async () => {
    // This would normally come from auth context
    // For now, we'll implement a basic version
    try {
      const response = await fetch('/api/auth/me', {
        cache: 'no-store'
      })
      if (!response.ok) throw new Error('Not authenticated')
      const data = await response.json()
      return data.user?.id
    } catch (error) {
      throw new Error('Authentication required')
    }
  }, [])

  // Load directory files
  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)

    try {
      const advisorId = await getCurrentUser()
      const params = new URLSearchParams({
        project_id: projectId,
        advisor_id: advisorId,
        path,
        _t: Date.now().toString() // Cache busting
      })

      logger.info('Loading directory', { projectId, path }, 'workspace-files')

      const response = await fetch(`/api/workspace/files/list?${params}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setFiles(data.files || [])

      logger.info('Directory loaded', {
        projectId,
        path,
        fileCount: data.files?.length || 0
      }, 'workspace-files')

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load directory'
      setError(message)
      logger.error('Failed to load directory', {
        projectId,
        path,
        error: message
      }, 'workspace-files')
    } finally {
      setLoading(false)
    }
  }, [projectId, getCurrentUser])

  // Load file content with ETag caching
  const loadFile = useCallback(async (filePath: string) => {
    if (options.readOnly === false) {
      setError('File editing not supported in read-only mode')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const advisorId = await getCurrentUser()
      const params = new URLSearchParams({
        project_id: projectId,
        advisor_id: advisorId,
        file_path: filePath,
        _t: Date.now().toString() // Cache busting
      })

      // Get cached ETag for If-None-Match header
      const cachedETag = etagCache.get(filePath)
      const headers: Record<string, string> = {
        'Cache-Control': 'no-cache'
      }
      if (cachedETag) {
        headers['If-None-Match'] = cachedETag
      }

      logger.info('Loading file', {
        projectId,
        filePath,
        hasCachedETag: !!cachedETag
      }, 'workspace-file-content')

      const response = await fetch(`/api/workspace/files/content?${params}`, {
        cache: 'no-store',
        headers
      })

      if (response.status === 304) {
        logger.debug('workspace-file-content', 'File not modified (304)', { filePath })
        return // Content unchanged, keep current file
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()

      // Check if it's a download response (binary or too large)
      if ('download_url' in data) {
        setError(`File too large or binary - use download link: ${data.filename}`)
        return
      }

      // Cache the ETag for future requests
      if (data.etag) {
        etagCache.set(filePath, data.etag)
      }

      setCurrentFile({
        path: data.path,
        content: data.content,
        extension: data.extension,
        size: data.size,
        modified: data.modified,
        etag: data.etag
      })

      logger.info('File loaded', {
        projectId,
        filePath,
        size: data.size,
        etag: data.etag
      }, 'workspace-file-content')

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load file'
      setError(message)
      logger.error('Failed to load file', {
        projectId,
        filePath,
        error: message
      }, 'workspace-file-content')
    } finally {
      setLoading(false)
    }
  }, [projectId, options.readOnly, getCurrentUser])

  // Refresh current directory
  const refreshDirectory = useCallback(async () => {
    await loadDirectory(currentPath)
  }, [loadDirectory, currentPath])

  // Clear error
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Load directory on path change
  useEffect(() => {
    loadDirectory(currentPath)
  }, [loadDirectory, currentPath])

  return {
    files,
    currentFile,
    loading,
    error,
    loadDirectory,
    loadFile,
    refreshDirectory,
    clearError
  }
}