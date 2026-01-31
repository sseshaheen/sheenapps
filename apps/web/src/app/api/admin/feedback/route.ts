/**
 * Admin Feedback API
 * List feedback submissions with filtering, search, and stats
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { getServiceClient } from '@/lib/server/supabase-clients'

// Use service client for server-side database operations
const supabase = getServiceClient()

// Force Node.js runtime for service role key usage
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Verify admin auth
    const adminSession = await AdminAuthService.getAdminSession()
    if (!adminSession) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check permissions
    const hasPermission =
      (await AdminAuthService.hasPermission('feedback.view')) ||
      (await AdminAuthService.hasPermission('feedback.admin')) ||
      adminSession.user.role === 'super_admin'

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100)
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const priority = searchParams.get('priority')
    const dateRange = searchParams.get('dateRange') || '7d'
    const search = searchParams.get('search')

    const offset = (page - 1) * limit

    // Build query
    let query = supabase
      .from('feedback_submissions')
      .select('*', { count: 'exact' })

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (type && type !== 'all') {
      query = query.eq('type', type)
    }

    if (priority && priority !== 'all') {
      query = query.eq('priority', priority)
    }

    // Date range filter
    if (dateRange !== 'all') {
      const now = new Date()
      let startDate: Date

      switch (dateRange) {
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      }

      query = query.gte('created_at', startDate.toISOString())
    }

    // Search filter (search in text_comment and page_url)
    if (search) {
      const q = search.trim()

      // Cap search length to prevent expensive queries
      if (q.length > 80) {
        return NextResponse.json(
          { success: false, error: 'Search query too long (max 80 characters)' },
          { status: 400 }
        )
      }

      // Escape LIKE wildcards to prevent unexpected pattern matching
      const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&')
      const safe = escapeLike(q)

      query = query.or(
        `text_comment.ilike.%${safe}%,page_url.ilike.%${safe}%,feature_id.ilike.%${safe}%`
      )
    }

    // Order and paginate
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: submissions, count, error } = await query

    if (error) {
      console.error('Failed to fetch feedback:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch feedback' },
        { status: 500 }
      )
    }

    // Fetch stats
    const stats = await getTriageStats()

    return NextResponse.json({
      success: true,
      submissions: submissions || [],
      total: count || 0,
      page,
      limit,
      stats,
    })
  } catch (error) {
    console.error('Feedback API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function getTriageStats() {
  try {
    // Get triage stats
    const { data: triageData } = await supabase.rpc('get_feedback_triage_stats')

    // Get NPS stats (30-day window)
    const { data: npsData } = await supabase.rpc('get_nps_detractor_rate', {
      p_days: 30,
    })

    // Get frustration stats (7-day window)
    const { data: frustrationData } = await supabase.rpc(
      'get_frustration_signal_rate',
      { p_days: 7 }
    )

    // Process triage stats
    const triage: Record<string, number> = {
      unprocessed: 0,
      acknowledged: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
      critical_count: 0,
      oldest_hours: 0,
    }

    if (triageData) {
      for (const row of triageData) {
        triage[row.status] = row.count
        triage.critical_count += row.critical_count || 0
        if (row.oldest_unprocessed) {
          const hours =
            (Date.now() - new Date(row.oldest_unprocessed).getTime()) /
            (1000 * 60 * 60)
          if (hours > triage.oldest_hours) {
            triage.oldest_hours = Math.round(hours)
          }
        }
      }
    }

    // Process frustration stats
    const frustration = {
      rage_clicks: 0,
      dead_clicks: 0,
      errors: 0,
      unique_sessions: 0,
    }

    if (frustrationData) {
      for (const row of frustrationData) {
        if (row.signal_type === 'rage_click') {
          frustration.rage_clicks = row.count
          frustration.unique_sessions += row.unique_sessions
        } else if (row.signal_type === 'dead_click') {
          frustration.dead_clicks = row.count
        } else if (row.signal_type === 'error') {
          frustration.errors = row.count
        }
      }
    }

    return {
      triage,
      nps: npsData?.[0] || null,
      frustration,
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error)
    return null
  }
}
