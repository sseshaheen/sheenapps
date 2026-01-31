/**
 * Workspace Rate Limits API
 *
 * Monitor rate limiting status for workspace operations
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

interface RateLimitInfo {
  operation: string
  limit: number
  remaining: number
  reset_time: string
  window_seconds: number
  is_limited: boolean
}

interface RateLimitsResponse {
  rate_limits: RateLimitInfo[]
  overall_status: 'healthy' | 'warning' | 'limited'
  project_id: string
  advisor_id: string
  checked_at: string
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

    logger.info('Checking rate limits', {
      projectId,
      advisorId
    }, 'workspace-rate-limits')

    // Get user context using RLS pattern
    const userCtx = await makeUserCtx()

    // Verify workspace access
    const hasAccess = await userCtx.client
      .from('project_advisors')
      .select(`
        status,
        workspace_permissions (view_logs, view_code, manage_sessions)
      `)
      .eq('project_id', projectId)
      .eq('advisor_id', advisorId)
      .eq('status', 'active')
      .maybeSingle()

    if (!hasAccess) {
      return noCacheErrorResponse(
        { error: 'Access denied: No workspace permissions for this project' },
        403
      )
    }

    // Mock rate limit data (in real implementation, this would check Redis/token bucket)
    const now = new Date()
    const resetTime = new Date(now.getTime() + 60000) // Reset in 1 minute

    const rateLimits: RateLimitInfo[] = [
      {
        operation: 'file_access',
        limit: 100,
        remaining: 87,
        reset_time: resetTime.toISOString(),
        window_seconds: 60,
        is_limited: false
      },
      {
        operation: 'log_stream',
        limit: 10,
        remaining: 8,
        reset_time: resetTime.toISOString(),
        window_seconds: 60,
        is_limited: false
      },
      {
        operation: 'session_management',
        limit: 20,
        remaining: 18,
        reset_time: resetTime.toISOString(),
        window_seconds: 60,
        is_limited: false
      },
      {
        operation: 'historical_logs',
        limit: 50,
        remaining: 35,
        reset_time: resetTime.toISOString(),
        window_seconds: 60,
        is_limited: false
      }
    ]

    // Determine overall status
    let overallStatus: 'healthy' | 'warning' | 'limited' = 'healthy'

    for (const rateLimit of rateLimits) {
      const usagePercent = ((rateLimit.limit - rateLimit.remaining) / rateLimit.limit) * 100

      if (rateLimit.is_limited) {
        overallStatus = 'limited'
        break
      } else if (usagePercent > 80) {
        overallStatus = 'warning'
      }
    }

    const response: RateLimitsResponse = {
      rate_limits: rateLimits,
      overall_status: overallStatus,
      project_id: projectId,
      advisor_id: advisorId,
      checked_at: now.toISOString()
    }

    logger.info('Rate limits checked', {
      projectId,
      advisorId,
      overallStatus,
      limitCount: rateLimits.length
    }, 'workspace-rate-limits')

    return noCacheResponse(response)

  } catch (error) {
    logger.error('Rate limit check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-rate-limits')

    return noCacheErrorResponse(
      { error: 'Internal server error during rate limit check' },
      500
    )
  }
}