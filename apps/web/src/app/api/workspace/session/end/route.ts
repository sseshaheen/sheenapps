/**
 * Workspace Session End API
 *
 * Ends an active workspace session for billing tracking
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

// Expert pattern: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface EndSessionRequest {
  session_id: string
  advisor_id: string
}

interface EndSessionResponse {
  success: boolean
  session_duration_seconds: number
  ended_at: string
}

export async function POST(request: NextRequest) {
  try {
    const body: EndSessionRequest = await request.json()
    const { session_id, advisor_id } = body

    if (!session_id || !advisor_id) {
      return noCacheErrorResponse(
        { error: 'Missing required fields: session_id, advisor_id' },
        400
      )
    }

    logger.info('Ending workspace session', {
      sessionId: session_id,
      advisorId: advisor_id
    }, 'workspace-session')

    // Get user context using RLS pattern
    const userCtx = await makeUserCtx()

    // Find and verify session ownership
    const session = await userCtx.client
      .from('workspace_sessions')
      .select('id, started_at, advisor_id, status')
      .eq('id', session_id)
      .eq('advisor_id', advisor_id)
      .eq('status', 'active')
      .maybeSingle()

    if (!session) {
      return noCacheErrorResponse(
        { error: 'Session not found or already ended' },
        404
      )
    }

    const endedAt = new Date().toISOString()
    const sessionDurationMs = new Date(endedAt).getTime() - new Date(session.started_at).getTime()
    const sessionDurationSeconds = Math.floor(sessionDurationMs / 1000)

    // End the session
    const { error } = await userCtx.client
      .from('workspace_sessions')
      .update({
        status: 'ended',
        ended_at: endedAt,
        duration_seconds: sessionDurationSeconds
      })
      .eq('id', session_id)

    if (error) {
      logger.error('Failed to end session', {
        error: error.message,
        sessionId: session_id
      }, 'workspace-session')

      return noCacheErrorResponse(
        { error: 'Failed to end workspace session' },
        500
      )
    }

    logger.info('Session ended successfully', {
      sessionId: session_id,
      advisorId: advisor_id,
      durationSeconds: sessionDurationSeconds
    }, 'workspace-session')

    return noCacheResponse<EndSessionResponse>({
      success: true,
      session_duration_seconds: sessionDurationSeconds,
      ended_at: endedAt
    })

  } catch (error) {
    logger.error('Session end failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-session')

    return noCacheErrorResponse(
      { error: 'Internal server error during session end' },
      500
    )
  }
}