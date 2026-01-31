/**
 * Workspace Settings Management API
 *
 * Manage workspace settings for project owners
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

interface WorkspaceSettings {
  project_id: string
  advisor_code_access: boolean
  restricted_paths: string[]
  log_retention_days: number
  session_timeout_minutes: number
  max_concurrent_sessions: number
  auto_cleanup_sessions: boolean
}

interface UpdateSettingsRequest {
  project_id: string
  settings: Partial<Omit<WorkspaceSettings, 'project_id'>>
}

interface UpdateSettingsResponse {
  success: boolean
  updated_settings: WorkspaceSettings
  updated_at: string
}

// GET - Retrieve workspace settings
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')

    if (!projectId) {
      return noCacheErrorResponse(
        { error: 'Missing required parameter: project_id' },
        400
      )
    }

    logger.info('Fetching workspace settings', {
      projectId
    }, 'workspace-settings')

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
      .select(`
        id,
        owner_id,
        advisor_code_access,
        restricted_paths
      `)
      .eq('id', projectId)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!project) {
      return noCacheErrorResponse(
        { error: 'Access denied: Only project owners can view workspace settings' },
        403
      )
    }

    // Get workspace settings (or defaults)
    const workspaceSettings = await userCtx.client
      .from('workspace_settings')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle()

    const settings: WorkspaceSettings = {
      project_id: projectId,
      advisor_code_access: project.advisor_code_access || false,
      restricted_paths: project.restricted_paths || [],
      log_retention_days: workspaceSettings?.log_retention_days || 30,
      session_timeout_minutes: workspaceSettings?.session_timeout_minutes || 60,
      max_concurrent_sessions: workspaceSettings?.max_concurrent_sessions || 5,
      auto_cleanup_sessions: workspaceSettings?.auto_cleanup_sessions || true
    }

    logger.info('Workspace settings retrieved', {
      projectId,
      ownerId: user.id
    }, 'workspace-settings')

    return noCacheResponse(settings)

  } catch (error) {
    logger.error('Settings retrieval failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-settings')

    return noCacheErrorResponse(
      { error: 'Internal server error during settings retrieval' },
      500
    )
  }
}

// PUT - Update workspace settings
export async function PUT(request: NextRequest) {
  try {
    const body: UpdateSettingsRequest = await request.json()
    const { project_id, settings } = body

    if (!project_id || !settings) {
      return noCacheErrorResponse(
        { error: 'Missing required fields: project_id, settings' },
        400
      )
    }

    logger.info('Updating workspace settings', {
      projectId: project_id,
      settingsKeys: Object.keys(settings)
    }, 'workspace-settings')

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
      .select('id, owner_id')
      .eq('id', project_id)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!project) {
      return noCacheErrorResponse(
        { error: 'Access denied: Only project owners can modify workspace settings' },
        403
      )
    }

    const now = new Date().toISOString()

    // Update project-level settings
    if (settings.advisor_code_access !== undefined || settings.restricted_paths !== undefined) {
      const projectUpdates: any = { updated_at: now }
      if (settings.advisor_code_access !== undefined) {
        projectUpdates.advisor_code_access = settings.advisor_code_access
      }
      if (settings.restricted_paths !== undefined) {
        projectUpdates.restricted_paths = settings.restricted_paths
      }

      const { error: projectError } = await userCtx.client
        .from('projects')
        .update(projectUpdates)
        .eq('id', project_id)

      if (projectError) {
        logger.error('Failed to update project settings', {
          projectId: project_id,
          error: projectError.message
        }, 'workspace-settings')

        return noCacheErrorResponse(
          { error: 'Failed to update project settings' },
          500
        )
      }
    }

    // Update workspace-specific settings
    const workspaceUpdates: any = {
      project_id,
      updated_at: now,
      updated_by: user.id
    }

    if (settings.log_retention_days !== undefined) {
      workspaceUpdates.log_retention_days = Math.max(1, Math.min(365, settings.log_retention_days))
    }
    if (settings.session_timeout_minutes !== undefined) {
      workspaceUpdates.session_timeout_minutes = Math.max(5, Math.min(480, settings.session_timeout_minutes))
    }
    if (settings.max_concurrent_sessions !== undefined) {
      workspaceUpdates.max_concurrent_sessions = Math.max(1, Math.min(20, settings.max_concurrent_sessions))
    }
    if (settings.auto_cleanup_sessions !== undefined) {
      workspaceUpdates.auto_cleanup_sessions = settings.auto_cleanup_sessions
    }

    const { error: workspaceError } = await userCtx.client
      .from('workspace_settings')
      .upsert(workspaceUpdates)

    if (workspaceError) {
      logger.error('Failed to update workspace settings', {
        projectId: project_id,
        error: workspaceError.message
      }, 'workspace-settings')

      return noCacheErrorResponse(
        { error: 'Failed to update workspace settings' },
        500
      )
    }

    // Get updated settings to return
    const updatedProject = await userCtx.client
      .from('projects')
      .select('advisor_code_access, restricted_paths')
      .eq('id', project_id)
      .single()

    const updatedWorkspace = await userCtx.client
      .from('workspace_settings')
      .select('*')
      .eq('project_id', project_id)
      .single()

    const updatedSettings: WorkspaceSettings = {
      project_id,
      advisor_code_access: updatedProject.advisor_code_access || false,
      restricted_paths: updatedProject.restricted_paths || [],
      log_retention_days: updatedWorkspace.log_retention_days || 30,
      session_timeout_minutes: updatedWorkspace.session_timeout_minutes || 60,
      max_concurrent_sessions: updatedWorkspace.max_concurrent_sessions || 5,
      auto_cleanup_sessions: updatedWorkspace.auto_cleanup_sessions || true
    }

    const response: UpdateSettingsResponse = {
      success: true,
      updated_settings: updatedSettings,
      updated_at: now
    }

    logger.info('Workspace settings updated successfully', {
      projectId: project_id,
      updatedBy: user.id,
      settingsChanged: Object.keys(settings)
    }, 'workspace-settings')

    return noCacheResponse(response)

  } catch (error) {
    logger.error('Settings update failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-settings')

    return noCacheErrorResponse(
      { error: 'Internal server error during settings update' },
      500
    )
  }
}