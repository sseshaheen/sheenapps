import { authPresets } from '@/lib/auth-middleware'
import { ProjectRepository } from '@/lib/server/repositories/project-repository'
import { logger } from '@/utils/logger'
import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering and use Node.js runtime for database operations
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * Version Status API Route
 * 
 * Replaces client-side database calls in use-version-updates.ts
 * Returns version information with proper access control
 * 
 * Migration: Phase 1.1 - Critical Security Fix
 * Expert feedback: Runtime annotation added
 */

async function handleGetVersionStatus(
  request: NextRequest,
  { user, params }: { user: any; params: { id: string } }
) {
  try {
    const { id: projectId } = params

    logger.info('🔍 Fetching version status', {
      projectId: projectId.slice(0, 8),
      userId: user?.id?.slice(0, 8) || 'anonymous'
    })

    // Use repository pattern with built-in access control
    const versionInfo = await ProjectRepository.getVersionStatus(projectId, user.id)

    if (!versionInfo) {
      return NextResponse.json(
        {
          ok: false,
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or access denied'
        },
        { 
          status: 404,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }

    logger.info('✅ Version status fetched successfully', {
      projectId: projectId.slice(0, 8),
      hasVersionId: !!versionInfo.versionId,
      hasVersionName: !!versionInfo.versionName,
      isProcessing: versionInfo.isProcessing
    })

    // Standardized success response format (expert recommendation)
    return NextResponse.json(
      {
        ok: true,
        data: versionInfo
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )

  } catch (error) {
    logger.error('Version status fetch failed', {
      projectId: params.id.slice(0, 8),
      userId: user?.id?.slice(0, 8),
      error: error instanceof Error ? error.message : String(error)
    })

    // Standardized error response format (expert recommendation)
    return NextResponse.json(
      {
        ok: false,
        code: 'VERSION_STATUS_ERROR',
        message: 'Failed to fetch version status'
      },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  }
}

export const GET = authPresets.authenticated(handleGetVersionStatus)