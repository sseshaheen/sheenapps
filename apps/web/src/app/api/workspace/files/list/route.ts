/**
 * Workspace Files List API
 *
 * Provides directory listing for advisor workspace
 * Implements security filtering and project-relative paths
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

// Expert pattern: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
  extension?: string
}

interface FilesListResponse {
  files: FileItem[]
  current_path: string
  parent_path?: string
  total_count: number
  restricted_paths: string[]
}

// Security filter patterns from backend docs
const SECURITY_FILTERS = [
  // Environment files
  /^\.env/,
  /secrets/,
  /credentials/,
  /\.key$/,
  /\.pem$/,

  // Build artifacts
  /node_modules/,
  /dist\//,
  /build\//,
  /\.next\//,
  /target\//,

  // VCS directories
  /\.git\//,
  /\.svn\//,

  // System files
  /\.DS_Store/,
  /Thumbs\.db/,

  // Temporary files
  /\.tmp$/,
  /\.temp$/,
  /\.log$/
]

function isPathSecurityFiltered(path: string): boolean {
  return SECURITY_FILTERS.some(pattern => pattern.test(path))
}

function getFileExtension(filename: string): string | undefined {
  const lastDot = filename.lastIndexOf('.')
  return lastDot > 0 ? filename.slice(lastDot) : undefined
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const advisorId = searchParams.get('advisor_id')
    const path = searchParams.get('path') || '/'

    if (!projectId || !advisorId) {
      return noCacheErrorResponse(
        { error: 'Missing required parameters: project_id and advisor_id' },
        400
      )
    }

    // Validate path is relative and safe
    if (path.includes('..') || path.startsWith('/') === false) {
      return noCacheErrorResponse(
        { error: 'Invalid path parameter' },
        400
      )
    }

    logger.info('Listing directory', {
      projectId,
      advisorId,
      path
    }, 'workspace-files')

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

    // Get project settings for additional restrictions
    const projectSettings = await userCtx.client
      .from('projects')
      .select('advisor_code_access, restricted_paths')
      .eq('id', projectId)
      .single()

    if (!projectSettings?.advisor_code_access) {
      return noCacheErrorResponse(
        { error: 'Access denied: Project has disabled advisor code access' },
        403
      )
    }

    // Mock file system data (in real implementation, this would fetch from file system)
    // This demonstrates the security filtering and response format
    const mockFiles: FileItem[] = [
      {
        name: 'src',
        path: '/src',
        type: 'directory',
        modified: '2024-09-16T10:00:00Z'
      },
      {
        name: 'package.json',
        path: '/package.json',
        type: 'file',
        size: 1024,
        modified: '2024-09-16T09:30:00Z',
        extension: '.json'
      },
      {
        name: 'README.md',
        path: '/README.md',
        type: 'file',
        size: 2048,
        modified: '2024-09-16T09:00:00Z',
        extension: '.md'
      },
      {
        name: '.env.local',
        path: '/.env.local',
        type: 'file',
        size: 256,
        modified: '2024-09-16T08:00:00Z',
        extension: '.local'
      },
      {
        name: 'node_modules',
        path: '/node_modules',
        type: 'directory',
        modified: '2024-09-16T07:00:00Z'
      }
    ]

    // Apply security filtering
    const filteredFiles = mockFiles.filter(file => {
      // Apply global security filters
      if (isPathSecurityFiltered(file.path)) {
        return false
      }

      // Apply project-specific restrictions
      const restrictedPaths = projectSettings.restricted_paths || []
      if (restrictedPaths.some(restricted => file.path.includes(restricted))) {
        return false
      }

      return true
    })

    // Calculate parent path
    const parentPath = path === '/' ? undefined :
      path.split('/').slice(0, -1).join('/') || '/'

    const response: FilesListResponse = {
      files: filteredFiles,
      current_path: path,
      parent_path: parentPath,
      total_count: filteredFiles.length,
      restricted_paths: projectSettings.restricted_paths || []
    }

    logger.info('Directory listing completed', {
      projectId,
      advisorId,
      path,
      fileCount: filteredFiles.length,
      filteredCount: mockFiles.length - filteredFiles.length
    }, 'workspace-files')

    return noCacheResponse(response)

  } catch (error) {
    logger.error('Directory listing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-files')

    return noCacheErrorResponse(
      { error: 'Internal server error during file listing' },
      500
    )
  }
}