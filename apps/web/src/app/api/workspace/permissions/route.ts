/**
 * Workspace Permissions Management API
 *
 * Update workspace permissions for advisors (project owners only)
 * Part of Phase 2 enhanced admin features
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

// Expert pattern: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface UpdatePermissionsRequest {
  project_id: string
  advisor_id: string
  permissions: {
    view_code: boolean
    view_logs: boolean
    manage_sessions: boolean
  }
}

interface UpdatePermissionsResponse {
  success: boolean
  updated_permissions: {
    view_code: boolean
    view_logs: boolean
    manage_sessions: boolean
  }
  updated_at: string
}

export async function PUT(request: NextRequest) {
  try {
    const body: UpdatePermissionsRequest = await request.json()
    const { project_id, advisor_id, permissions } = body

    if (!project_id || !advisor_id || !permissions) {
      return noCacheErrorResponse(
        { error: 'Missing required fields: project_id, advisor_id, permissions' },
        400
      )
    }

    // Validate permission structure
    const requiredPermissions = ['view_code', 'view_logs', 'manage_sessions']
    for (const perm of requiredPermissions) {
      if (typeof permissions[perm as keyof typeof permissions] !== 'boolean') {
        return noCacheErrorResponse(
          { error: `Invalid permission value for ${perm}. Must be boolean.` },
          400
        )
      }
    }

    logger.info('Updating workspace permissions', {
      projectId: project_id,
      advisorId: advisor_id,
      permissions
    }, 'workspace-permissions')

    // Get user context using RLS pattern
    const userCtx = await makeUserCtx()

    // Get current user (must be project owner)
    const { data: { user } } = await userCtx.client.auth.getUser()
    if (!user) {
      return noCacheErrorResponse(
        { error: 'Authentication required' },
        401
      )
    }

    // Verify project ownership
    const project = await userCtx.client
      .from('projects')
      .select('owner_id, advisor_code_access')
      .eq('id', project_id)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!project) {
      return noCacheErrorResponse(
        { error: 'Access denied: Only project owners can manage workspace permissions' },
        403
      )
    }

    // Verify the advisor is assigned to this project
    const advisorAssignment = await userCtx.client
      .from('project_advisors')
      .select('id, status')
      .eq('project_id', project_id)
      .eq('advisor_id', advisor_id)
      .maybeSingle()

    if (!advisorAssignment) {
      return noCacheErrorResponse(
        { error: 'Advisor not assigned to this project' },
        404
      )
    }

    if (advisorAssignment.status !== 'active') {
      return noCacheErrorResponse(
        { error: 'Cannot update permissions for inactive advisor assignment' },
        400
      )
    }

    // Check if view_code permission is being granted but project has disabled advisor code access
    if (permissions.view_code && !project.advisor_code_access) {
      return noCacheErrorResponse(
        {
          error: 'Cannot grant code viewing permissions: Project has disabled advisor code access',
          suggestion: 'Enable advisor code access in project settings first'
        },
        400
      )
    }

    // Update permissions in workspace_permissions table
    const now = new Date().toISOString()
    const { error: updateError } = await userCtx.client
      .from('workspace_permissions')
      .upsert({
        project_id,
        advisor_id,
        view_code: permissions.view_code,
        view_logs: permissions.view_logs,
        manage_sessions: permissions.manage_sessions,
        updated_at: now,
        updated_by: user.id
      })

    if (updateError) {
      logger.error('Failed to update permissions', {
        projectId: project_id,
        advisorId: advisor_id,
        error: updateError.message
      }, 'workspace-permissions')

      return noCacheErrorResponse(
        { error: 'Failed to update workspace permissions' },
        500
      )
    }

    // Log the permission change for audit
    await userCtx.client
      .from('workspace_permission_audit')
      .insert({
        project_id,
        advisor_id,
        changed_by: user.id,
        old_permissions: {}, // In real implementation, fetch old permissions first
        new_permissions: permissions,
        change_reason: 'Manual update via workspace management',
        changed_at: now
      })
      .select()

    const response: UpdatePermissionsResponse = {
      success: true,
      updated_permissions: permissions,
      updated_at: now
    }

    logger.info('Workspace permissions updated successfully', {
      projectId: project_id,
      advisorId: advisor_id,
      updatedBy: user.id,
      newPermissions: permissions
    }, 'workspace-permissions')

    return noCacheResponse(response)

  } catch (error) {
    logger.error('Permission update failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-permissions')

    return noCacheErrorResponse(
      { error: 'Internal server error during permission update' },
      500
    )
  }
}