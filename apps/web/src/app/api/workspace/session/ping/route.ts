/**
 * Workspace Session Heartbeat API
 *
 * Updates session activity for billing tracking
 * Called every 15 seconds from client
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

// Expert pattern: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface PingSessionRequest {
  session_id: string
  advisor_id: string
}

interface PingSessionResponse {
  success: boolean
  last_heartbeat: string
  session_active: boolean
}

export async function PATCH(request: NextRequest) {
  try {
    const body: PingSessionRequest = await request.json()
    const { session_id, advisor_id } = body

    if (!session_id || !advisor_id) {
      return noCacheErrorResponse(
        { error: 'Missing required fields: session_id, advisor_id' },
        400
      )
    }

    // Light logging for heartbeats (avoid spam)
    logger.debug('workspace-session', 'Session heartbeat', {
      sessionId: session_id,
      advisorId: advisor_id
    })

    // Get user context using RLS pattern
    const userCtx = await makeUserCtx()

    // Verify session exists and is active
    const session = await userCtx.client
      .from('workspace_sessions')
      .select('id, status')
      .eq('id', session_id)
      .eq('advisor_id', advisor_id)
      .eq('status', 'active')
      .maybeSingle()

    if (!session) {
      return noCacheResponse<PingSessionResponse>({
        success: false,
        last_heartbeat: new Date().toISOString(),
        session_active: false
      })
    }

    const now = new Date().toISOString()

    // Update heartbeat timestamp
    const { error } = await userCtx.client
      .from('workspace_sessions')
      .update({
        last_heartbeat: now
      })
      .eq('id', session_id)

    if (error) {
      logger.error('Failed to update heartbeat', {
        error: error.message,
        sessionId: session_id
      }, 'workspace-session')

      return noCacheErrorResponse(
        { error: 'Failed to update session heartbeat' },
        500
      )
    }

    return noCacheResponse<PingSessionResponse>({
      success: true,
      last_heartbeat: now,
      session_active: true
    })

  } catch (error) {
    logger.error('Session ping failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-session')

    return noCacheErrorResponse(
      { error: 'Internal server error during session ping' },
      500
    )
  }
}