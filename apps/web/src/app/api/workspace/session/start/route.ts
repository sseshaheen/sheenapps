/**
 * Workspace Session Start API
 *
 * Starts a new workspace session for an advisor
 * Includes billing tracking and session management
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

// Expert pattern: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface StartSessionRequest {
  project_id: string
  advisor_id: string
}

interface StartSessionResponse {
  session_id: string
  started_at: string
  heartbeat_interval: number // 15 seconds as per backend spec
  project_id: string
}

export async function POST(request: NextRequest) {
  try {
    const body: StartSessionRequest = await request.json()
    const { project_id, advisor_id } = body

    if (!project_id || !advisor_id) {
      return noCacheErrorResponse(
        { error: 'Missing required fields: project_id, advisor_id' },
        400
      )
    }

    logger.info('Starting workspace session', {
      projectId: project_id,
      advisorId: advisor_id,
      userAgent: request.headers.get('user-agent')
    }, 'workspace-session')

    // Get user context using RLS pattern
    const userCtx = await makeUserCtx()

    // Verify advisor has workspace access
    const hasAccess = await userCtx.client
      .from('project_advisors')
      .select(`
        status,
        workspace_permissions (view_code)
      `)
      .eq('project_id', project_id)
      .eq('advisor_id', advisor_id)
      .eq('status', 'active')
      .maybeSingle()

    if (!hasAccess?.workspace_permissions?.view_code) {
      return noCacheErrorResponse(
        { error: 'Access denied: No workspace permissions for this project' },
        403
      )
    }

    // Check for existing active session
    const existingSession = await userCtx.client
      .from('workspace_sessions')
      .select('id, started_at')
      .eq('project_id', project_id)
      .eq('advisor_id', advisor_id)
      .eq('status', 'active')
      .maybeSingle()

    if (existingSession) {
      logger.info('Returning existing active session', {
        sessionId: existingSession.id,
        projectId: project_id,
        advisorId: advisor_id
      }, 'workspace-session')

      return noCacheResponse<StartSessionResponse>({
        session_id: existingSession.id,
        started_at: existingSession.started_at,
        heartbeat_interval: 15,
        project_id
      })
    }

    // Create new session
    const { data: session, error } = await userCtx.client
      .from('workspace_sessions')
      .insert({
        project_id,
        advisor_id,
        status: 'active',
        started_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString()
      })
      .select('id, started_at')
      .single()

    if (error || !session) {
      logger.error('Failed to create session', {
        error: error?.message,
        projectId: project_id,
        advisorId: advisor_id
      }, 'workspace-session')

      return noCacheErrorResponse(
        { error: 'Failed to create workspace session' },
        500
      )
    }

    logger.info('Session started successfully', {
      sessionId: session.id,
      projectId: project_id,
      advisorId: advisor_id
    }, 'workspace-session')

    return noCacheResponse<StartSessionResponse>({
      session_id: session.id,
      started_at: session.started_at,
      heartbeat_interval: 15,
      project_id
    })

  } catch (error) {
    logger.error('Session start failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-session')

    return noCacheErrorResponse(
      { error: 'Internal server error during session start' },
      500
    )
  }
}