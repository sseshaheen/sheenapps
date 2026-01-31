/**
 * Workspace File Content API
 *
 * Provides file content with ETag caching optimization
 * Implements expert-validated caching patterns from implementation plan
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { createHash } from 'crypto'

// Expert pattern: Triple-layer cache prevention for dynamic parts
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface FileContentResponse {
  content: string
  path: string
  size: number
  modified: string
  extension?: string
  is_binary: boolean
  etag: string
}

interface FileDownloadResponse {
  download_url: string
  filename: string
  size: number
  reason: 'too_large' | 'binary_file'
}

// Large file threshold (5MB as per implementation plan)
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024

// Binary file detection patterns
const BINARY_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
  '.mp3', '.mp4', '.avi', '.mov', '.pdf', '.zip', '.tar', '.gz',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat'
])

function isBinaryFile(filename: string, contentType?: string): boolean {
  // Check by extension
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
  if (BINARY_EXTENSIONS.has(ext)) return true

  // Check by content type
  if (contentType && !contentType.startsWith('text/')) return true

  return false
}

function generateETag(content: string, modified: string): string {
  return createHash('md5')
    .update(content + modified)
    .digest('hex')
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const advisorId = searchParams.get('advisor_id')
    const filePath = searchParams.get('file_path')

    if (!projectId || !advisorId || !filePath) {
      return noCacheErrorResponse(
        { error: 'Missing required parameters: project_id, advisor_id, and file_path' },
        400
      )
    }

    // Validate path is safe (project-relative only)
    if (filePath.includes('..') || !filePath.startsWith('/')) {
      return noCacheErrorResponse(
        { error: 'Invalid file path' },
        400
      )
    }

    logger.info('Fetching file content', {
      projectId,
      advisorId,
      filePath
    }, 'workspace-file-content')

    // Get user context using RLS pattern
    const userCtx = await makeUserCtx()

    // Verify workspace access
    const hasAccess = await userCtx.client
      .from('project_advisors')
      .select(`
        status,
        workspace_permissions (view_code)
      `)
      .eq('project_id', projectId)
      .eq('advisor_id', advisorId)
      .eq('status', 'active')
      .maybeSingle()

    if (!hasAccess?.workspace_permissions?.view_code) {
      return noCacheErrorResponse(
        { error: 'Access denied: No workspace permissions for this project' },
        403
      )
    }

    // Mock file data (in real implementation, this would fetch from file system)
    const mockFileData = {
      content: `// Example TypeScript file
export interface User {
  id: string
  name: string
  email: string
}

export function createUser(data: Partial<User>): User {
  return {
    id: Math.random().toString(36),
    name: data.name || 'Anonymous',
    email: data.email || 'user@example.com'
  }
}`,
      size: 1024,
      modified: '2024-09-16T10:30:00Z',
      contentType: 'text/typescript'
    }

    const filename = filePath.split('/').pop() || 'unknown'
    const extension = filename.includes('.')
      ? filename.substring(filename.lastIndexOf('.'))
      : undefined

    // Check if file is binary
    if (isBinaryFile(filename, mockFileData.contentType)) {
      return noCacheResponse<FileDownloadResponse>({
        download_url: `/api/workspace/files/download?project_id=${projectId}&file_path=${encodeURIComponent(filePath)}`,
        filename,
        size: mockFileData.size,
        reason: 'binary_file'
      })
    }

    // Check if file is too large
    if (mockFileData.size > LARGE_FILE_THRESHOLD) {
      return noCacheResponse<FileDownloadResponse>({
        download_url: `/api/workspace/files/download?project_id=${projectId}&file_path=${encodeURIComponent(filePath)}`,
        filename,
        size: mockFileData.size,
        reason: 'too_large'
      })
    }

    // Generate ETag for caching
    const etag = generateETag(mockFileData.content, mockFileData.modified)

    // Check If-None-Match header for ETag caching
    const clientETag = request.headers.get('if-none-match')
    if (clientETag === etag) {
      logger.debug('workspace-file-content', 'ETag match - returning 304', {
        projectId,
        filePath,
        etag
      })

      return new NextResponse(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Last-Modified': mockFileData.modified,
          'Cache-Control': 'private, max-age=300, must-revalidate', // 5 minutes cache
        }
      })
    }

    const response: FileContentResponse = {
      content: mockFileData.content,
      path: filePath,
      size: mockFileData.size,
      modified: mockFileData.modified,
      extension,
      is_binary: false,
      etag
    }

    logger.info('File content retrieved', {
      projectId,
      advisorId,
      filePath,
      size: mockFileData.size,
      etag
    }, 'workspace-file-content')

    return NextResponse.json(response, {
      headers: {
        'ETag': etag,
        'Last-Modified': mockFileData.modified,
        'Cache-Control': 'private, max-age=300, must-revalidate', // 5 minutes cache
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    logger.error('File content retrieval failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-file-content')

    return noCacheErrorResponse(
      { error: 'Internal server error during file content retrieval' },
      500
    )
  }
}