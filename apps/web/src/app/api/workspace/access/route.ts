/**
 * Workspace Access Checking API
 *
 * Validates if an advisor has permission to access a project's workspace
 * Following expert-validated patterns from implementation plan
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import { ProjectRepository } from '@/lib/server/repositories/project-repository'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

// Expert pattern: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface WorkspaceAccessResponse {
  hasAccess: boolean
  permissions: {
    view_code: boolean
    view_logs: boolean
    manage_sessions: boolean
  }
  projectStatus: 'active' | 'archived' | 'not_found'
  advisorStatus: 'active' | 'inactive' | 'not_assigned'
  restrictions?: string[]
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const advisorId = searchParams.get('advisor_id')

    if (!projectId || !advisorId) {
      return noCacheErrorResponse(
        { error: 'Missing required parameters: project_id and advisor_id' },
        400
      )
    }

    logger.info('Checking workspace access', {
      projectId,
      advisorId,
      userAgent: request.headers.get('user-agent')
    }, 'workspace-access')

    // Get user context using RLS pattern
    const userCtx = await makeUserCtx()

    // Verify project exists and advisor has access
    const project = await ProjectRepository.findById(projectId)
    if (!project) {
      return noCacheResponse<WorkspaceAccessResponse>({
        hasAccess: false,
        permissions: {
          view_code: false,
          view_logs: false,
          manage_sessions: false
        },
        projectStatus: 'not_found',
        advisorStatus: 'not_assigned'
      })
    }

    // Check advisor assignment using RLS-based query
    const advisorAssignment = await userCtx.client
      .from('project_advisors')
      .select(`
        status,
        workspace_permissions (
          view_code,
          view_logs,
          manage_sessions
        )
      `)
      .eq('project_id', projectId)
      .eq('advisor_id', advisorId)
      .eq('status', 'active')
      .maybeSingle()

    if (!advisorAssignment) {
      return noCacheResponse<WorkspaceAccessResponse>({
        hasAccess: false,
        permissions: {
          view_code: false,
          view_logs: false,
          manage_sessions: false
        },
        projectStatus: 'active',
        advisorStatus: 'not_assigned'
      })
    }

    // Check project-level workspace settings
    const projectSettings = await userCtx.client
      .from('projects')
      .select('advisor_code_access, restricted_paths')
      .eq('id', projectId)
      .single()

    if (!projectSettings?.advisor_code_access) {
      return noCacheResponse<WorkspaceAccessResponse>({
        hasAccess: false,
        permissions: {
          view_code: false,
          view_logs: false,
          manage_sessions: false
        },
        projectStatus: 'active',
        advisorStatus: 'active',
        restrictions: ['Project has disabled advisor code access']
      })
    }

    // Extract permissions with defaults
    const permissions = advisorAssignment.workspace_permissions || {
      view_code: false,
      view_logs: false,
      manage_sessions: false
    }

    // Final access decision (three-layer permission resolution)
    const hasAccess = permissions.view_code && projectSettings.advisor_code_access

    const response: WorkspaceAccessResponse = {
      hasAccess,
      permissions,
      projectStatus: 'active',
      advisorStatus: 'active',
      restrictions: projectSettings.restricted_paths || []
    }

    logger.info('Access check completed', {
      projectId,
      advisorId,
      hasAccess,
      permissions
    }, 'workspace-access')

    return noCacheResponse(response)

  } catch (error) {
    logger.error('Access check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-access')

    return noCacheErrorResponse(
      { error: 'Internal server error during access check' },
      500
    )
  }
}