/**
 * Workspace Historical Logs API
 *
 * Paginated historical log retrieval with time range filtering
 * Part of Phase 2 enhanced features
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

// Expert pattern: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface LogEvent {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  tier: 'system' | 'application' | 'build' | 'deploy'
  message: string
  metadata?: Record<string, any>
}

interface HistoricalLogsResponse {
  logs: LogEvent[]
  pagination: {
    page: number
    limit: number
    total: number
    has_next: boolean
    has_previous: boolean
  }
  filters: {
    start_time?: string
    end_time?: string
    levels: string[]
    tiers: string[]
    search?: string
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const advisorId = searchParams.get('advisor_id')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100) // Max 100 logs per page
    const startTime = searchParams.get('start_time')
    const endTime = searchParams.get('end_time')
    const levels = searchParams.get('levels')?.split(',').filter(Boolean) || []
    const tiers = searchParams.get('tiers')?.split(',').filter(Boolean) || []
    const search = searchParams.get('search')

    if (!projectId || !advisorId) {
      return noCacheErrorResponse(
        { error: 'Missing required parameters: project_id and advisor_id' },
        400
      )
    }

    if (page < 1 || limit < 1) {
      return noCacheErrorResponse(
        { error: 'Page and limit must be positive integers' },
        400
      )
    }

    logger.info('Fetching historical logs', {
      projectId,
      advisorId,
      page,
      limit,
      startTime,
      endTime,
      levels,
      tiers,
      search
    }, 'workspace-log-history')

    // Get user context using RLS pattern
    const userCtx = await makeUserCtx()

    // Verify workspace access
    const hasAccess = await userCtx.client
      .from('project_advisors')
      .select(`
        status,
        workspace_permissions (view_logs)
      `)
      .eq('project_id', projectId)
      .eq('advisor_id', advisorId)
      .eq('status', 'active')
      .maybeSingle()

    if (!hasAccess?.workspace_permissions?.view_logs) {
      return noCacheErrorResponse(
        { error: 'Access denied: No log viewing permissions for this project' },
        403
      )
    }

    // Mock historical log data (in real implementation, this would query the log storage)
    const mockHistoricalLogs: LogEvent[] = [
      {
        id: 'hist_log_001',
        timestamp: '2024-09-16T08:00:00Z',
        level: 'info',
        tier: 'build',
        message: 'Build process completed successfully',
        metadata: { build_id: 'build_789', duration: '2m 45s' }
      },
      {
        id: 'hist_log_002',
        timestamp: '2024-09-16T07:58:15Z',
        level: 'warn',
        tier: 'build',
        message: 'Deprecated dependency detected: @old/package@1.0.0',
        metadata: { build_id: 'build_789', package: '@old/package' }
      },
      {
        id: 'hist_log_003',
        timestamp: '2024-09-16T07:55:30Z',
        level: 'info',
        tier: 'system',
        message: 'Container resources allocated',
        metadata: { cpu: '2 cores', memory: '4GB', build_id: 'build_789' }
      },
      {
        id: 'hist_log_004',
        timestamp: '2024-09-16T07:55:00Z',
        level: 'info',
        tier: 'build',
        message: 'Build process started',
        metadata: { build_id: 'build_789', trigger: 'manual' }
      },
      {
        id: 'hist_log_005',
        timestamp: '2024-09-16T06:30:00Z',
        level: 'error',
        tier: 'application',
        message: 'Database connection timeout during user authentication',
        metadata: { error_code: 'DB_TIMEOUT', retry_count: 3 }
      }
    ]

    // Apply filters
    let filteredLogs = mockHistoricalLogs

    // Time range filtering
    if (startTime) {
      const startDate = new Date(startTime)
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= startDate)
    }

    if (endTime) {
      const endDate = new Date(endTime)
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= endDate)
    }

    // Level filtering
    if (levels.length > 0) {
      filteredLogs = filteredLogs.filter(log => levels.includes(log.level))
    }

    // Tier filtering
    if (tiers.length > 0) {
      filteredLogs = filteredLogs.filter(log => tiers.includes(log.tier))
    }

    // Search filtering
    if (search) {
      const searchTerm = search.toLowerCase()
      filteredLogs = filteredLogs.filter(log =>
        log.message.toLowerCase().includes(searchTerm) ||
        log.id.toLowerCase().includes(searchTerm) ||
        JSON.stringify(log.metadata || {}).toLowerCase().includes(searchTerm)
      )
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Pagination
    const total = filteredLogs.length
    const offset = (page - 1) * limit
    const paginatedLogs = filteredLogs.slice(offset, offset + limit)

    const response: HistoricalLogsResponse = {
      logs: paginatedLogs,
      pagination: {
        page,
        limit,
        total,
        has_next: offset + limit < total,
        has_previous: page > 1
      },
      filters: {
        start_time: startTime || undefined,
        end_time: endTime || undefined,
        levels: levels.length > 0 ? levels : ['debug', 'info', 'warn', 'error'],
        tiers: tiers.length > 0 ? tiers : ['system', 'application', 'build', 'deploy'],
        search: search || undefined
      }
    }

    logger.info('Historical logs retrieved', {
      projectId,
      advisorId,
      totalLogs: total,
      returnedLogs: paginatedLogs.length,
      page,
      hasFilters: !!(startTime || endTime || levels.length || tiers.length || search)
    }, 'workspace-log-history')

    return noCacheResponse(response)

  } catch (error) {
    logger.error('Historical log retrieval failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, 'workspace-log-history')

    return noCacheErrorResponse(
      { error: 'Internal server error during historical log retrieval' },
      500
    )
  }
}