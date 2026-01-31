/**
 * Workspace Sessions API
 *
 * Display active workspace sessions for monitoring
 * Part of Phase 2 enhanced monitoring features
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

// Expert pattern: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface ActiveSession {
  session_id: string
  advisor_id: string
  advisor_name?: string
  started_at: string
  last_heartbeat: string
  duration_seconds: number
  is_stale: boolean
}

interface ActiveSessionsResponse {
  sessions: ActiveSession[]
  total_active: number
  project_id: string
  checked_at: string
  stale_threshold_seconds: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const requestorId = searchParams.get('requestor_id')

    if (!projectId || !requestorId) {
      return noCacheErrorResponse(
        { error: 'Missing required parameters: project_id and requestor_id' },
        400
      )
    }

    logger.info('Fetching active sessions', {
      projectId,
      requestorId
    }, 'workspace-sessions')

    // Get user context using RLS pattern
    const userCtx = await makeUserCtx()

    // Verify the requestor has permission to view sessions
    // Either they're an advisor with manage_sessions permission, or they're the project owner
    const hasAccess = await userCtx.client
      .from('project_advisors')
      .select(`
        status,
        workspace_permissions (manage_sessions)
      `)
      .eq('project_id', projectId)
      .eq('advisor_id', requestorId)
      .eq('status', 'active')
      .maybeSingle()

    // Also check if they're the project owner
    const isProjectOwner = await userCtx.client
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .eq('owner_id', requestorId)
      .maybeSingle()

    if (!hasAccess?.workspace_permissions?.manage_sessions && !isProjectOwner) {
      return noCacheErrorResponse(
        { error: 'Access denied: No session management permissions for this project' },
        403
      )
    }

    // Mock active session data (in real implementation, this would query workspace_sessions table)
    const now = new Date()
    const staleThresholdSeconds = 300 // 5 minutes without heartbeat = stale

    const mockActiveSessions: ActiveSession[] = [
      {
        session_id: 'sess_abc123',
        advisor_id: 'advisor_001',
        advisor_name: 'Sarah Wilson',
        started_at: '2024-09-16T09:30:00Z',
        last_heartbeat: '2024-09-16T10:28:45Z',
        duration_seconds: 3525, // ~58 minutes
        is_stale: false
      },
      {
        session_id: 'sess_def456',
        advisor_id: 'advisor_002',
        advisor_name: 'Mike Chen',
        started_at: '2024-09-16T10:15:00Z',
        last_heartbeat: '2024-09-16T10:20:30Z',
        duration_seconds: 825, // ~13 minutes
        is_stale: true // Last heartbeat was 8+ minutes ago
      }
    ]

    // Calculate stale status and durations
    const processedSessions = mockActiveSessions.map(session => {
      const startTime = new Date(session.started_at)
      const lastHeartbeat = new Date(session.last_heartbeat)
      const durationMs = now.getTime() - startTime.getTime()
      const timeSinceHeartbeat = (now.getTime() - lastHeartbeat.getTime()) / 1000

      return {
        ...session,
        duration_seconds: Math.floor(durationMs / 1000),
        is_stale: timeSinceHeartbeat > staleThresholdSeconds
      }
    })

    const response: ActiveSessionsResponse = {
      sessions: processedSessions,
      total_active: processedSessions.length,
      project_id: projectId,
      checked_at: now.toISOString(),
      stale_threshold_seconds: staleThresholdSeconds
    }

    logger.info('Active sessions retrieved', {
      projectId,
      requestorId,
      totalSessions: processedSessions.length,
      staleSessions: processedSessions.filter(s => s.is_stale).length
    }, 'workspace-sessions')

    return noCacheResponse(response)

  } catch (error) {
    logger.error('Active sessions retrieval failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-sessions')

    return noCacheErrorResponse(
      { error: 'Internal server error during active sessions retrieval' },
      500
    )
  }
}