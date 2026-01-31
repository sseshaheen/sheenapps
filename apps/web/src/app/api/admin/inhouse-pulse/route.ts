/**
 * In-House Mode Pulse Dashboard API Route
 * Provides a simple overview of build activity, auth usage, and user behavior
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user has admin permissions
    const hasPermission =
      await AdminAuthService.hasPermission('admin.read') ||
      await AdminAuthService.hasPermission('analytics.read')

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view In-House pulse data' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()
    const supabase = await createServerSupabaseClientNew()

    logger.info('Fetching In-House Mode pulse data', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    // Calculate time ranges
    const now = new Date()
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const last14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000)

    // 1. BUILD ACTIVITY (This Week)
    const { data: deploymentsThisWeek } = await supabase
      .from('inhouse_deployments')
      .select('id, status, created_at, project_id')
      .gte('created_at', last7Days.toISOString())

    const { data: deploymentsLastWeek } = await supabase
      .from('inhouse_deployments')
      .select('id, status')
      .gte('created_at', last14Days.toISOString())
      .lt('created_at', last7Days.toISOString())

    const totalBuildsThisWeek = deploymentsThisWeek?.length || 0
    const totalBuildsLastWeek = deploymentsLastWeek?.length || 0
    const successfulBuilds = deploymentsThisWeek?.filter(d => d.status === 'deployed').length || 0
    const failedBuilds = deploymentsThisWeek?.filter(d => d.status === 'failed').length || 0
    const successRate = totalBuildsThisWeek > 0
      ? ((successfulBuilds / totalBuildsThisWeek) * 100).toFixed(1)
      : '0'

    // Calculate growth with proper handling for 0→positive transition
    const growthVsLastWeekRaw =
      totalBuildsLastWeek > 0
        ? ((totalBuildsThisWeek - totalBuildsLastWeek) / totalBuildsLastWeek) * 100
        : (totalBuildsThisWeek > 0 ? 100 : 0) // 0→something = +100%, 0→0 = 0%

    const growthVsLastWeek = `${growthVsLastWeekRaw > 0 ? '+' : ''}${growthVsLastWeekRaw.toFixed(0)}%`

    // Active projects (built in last 7 days)
    const activeProjectIds = new Set(deploymentsThisWeek?.map(d => d.project_id) || [])
    const activeProjectsCount = activeProjectIds.size

    // Failed builds today
    const { data: failedToday } = await supabase
      .from('inhouse_deployments')
      .select('id, project_id, error_message')
      .eq('status', 'failed')
      .gte('created_at', todayStart.toISOString())

    const failedTodayCount = failedToday?.length || 0

    // 2. AUTH USAGE (Live)
    const { data: inhouseProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('infra_mode', 'easy')

    const totalInhouseProjects = inhouseProjects?.length || 0

    // Get API keys with usage
    const { data: apiKeys } = await supabase
      .from('inhouse_api_keys')
      .select('id, project_id, last_used_at, usage_count, status')
      .eq('status', 'active')

    // Active API keys (keys used in last 24 hours)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const activeApiKeysLast24h = apiKeys?.filter(key => {
      if (!key.last_used_at) return false
      return new Date(key.last_used_at) > oneDayAgo
    }).length || 0

    // Projects using auth (have active API keys)
    const projectsWithAuth = new Set(apiKeys?.map(k => k.project_id) || [])
    const projectsUsingAuth = projectsWithAuth.size

    // New API keys created today
    const { data: newKeysToday } = await supabase
      .from('inhouse_api_keys')
      .select('id')
      .gte('created_at', todayStart.toISOString())

    const newApiKeysCreatedToday = newKeysToday?.length || 0

    // Top project by actual usage (sum of usage_count)
    let topProject = { name: 'N/A', usage: 0 }
    if (apiKeys && apiKeys.length > 0) {
      const projectUsage = new Map<string, number>()

      for (const key of apiKeys) {
        const prev = projectUsage.get(key.project_id) || 0
        projectUsage.set(key.project_id, prev + (key.usage_count || 0))
      }

      // Find project with highest total usage
      let maxUsage = 0
      let topProjectId = ''
      for (const [projectId, usage] of projectUsage.entries()) {
        if (usage > maxUsage) {
          maxUsage = usage
          topProjectId = projectId
        }
      }

      if (topProjectId) {
        const { data: project } = await supabase
          .from('projects')
          .select('name')
          .eq('id', topProjectId)
          .single()

        if (project) {
          topProject = { name: project.name, usage: maxUsage }
        }
      }
    }

    // 3. USER BEHAVIOR SNAPSHOT
    // Active builders + power users (from build events in last 7 days)
    const { data: recentEvents } = await supabase
      .from('project_build_events')
      .select('user_id')
      .gte('created_at', last7Days.toISOString())
      .not('user_id', 'is', null)

    const userBuildCounts = new Map<string, number>()
    for (const e of recentEvents || []) {
      userBuildCounts.set(e.user_id, (userBuildCounts.get(e.user_id) || 0) + 1)
    }

    const activeBuildersCount = userBuildCounts.size
    const powerUsersCount = Array.from(userBuildCounts.values()).filter(c => c > 10).length

    // Average builds per user
    const avgBuildsPerUser = activeBuildersCount > 0
      ? (totalBuildsThisWeek / activeBuildersCount).toFixed(1)
      : '0'

    // Dormant projects (no builds in last 30 days)
    const { data: allProjects } = await supabase
      .from('projects')
      .select('id, updated_at')
      .eq('infra_mode', 'easy')

    const { data: recentDeployments } = await supabase
      .from('inhouse_deployments')
      .select('project_id')
      .gte('created_at', last30Days.toISOString())

    const recentProjectIds = new Set(recentDeployments?.map(d => d.project_id) || [])
    const dormantProjects = allProjects?.filter(p => !recentProjectIds.has(p.id)).length || 0

    // 4. QUICK ISSUES
    const issues = []

    // Failed builds in last hour
    const { data: failedLastHour } = await supabase
      .from('inhouse_deployments')
      .select('id')
      .eq('status', 'failed')
      .gte('created_at', lastHour.toISOString())

    if (failedLastHour && failedLastHour.length > 0) {
      issues.push({
        type: 'error',
        message: `${failedLastHour.length} builds failed in last hour`
      })
    }

    // Project with many failures
    if (deploymentsThisWeek) {
      const projectFailures = new Map<string, number>()
      deploymentsThisWeek
        .filter(d => d.status === 'failed')
        .forEach(d => {
          const count = projectFailures.get(d.project_id) || 0
          projectFailures.set(d.project_id, count + 1)
        })

      const projectFailureEntries = Array.from(projectFailures.entries())
      for (let i = 0; i < projectFailureEntries.length; i++) {
        const [projectId, count] = projectFailureEntries[i]
        if (count >= 10) {
          const { data: project } = await supabase
            .from('projects')
            .select('name')
            .eq('id', projectId)
            .single()

          issues.push({
            type: 'warning',
            message: `Project "${project?.name || 'Unknown'}" has ${count} failed builds this week`
          })
        }
      }
    }

    // Check quota usage
    const { data: quotas } = await supabase
      .from('inhouse_quotas')
      .select('db_size_used_bytes, db_size_limit_bytes, storage_size_used_bytes, storage_size_limit_bytes')

    const totalDbUsed = quotas?.reduce((sum, q) => sum + (q.db_size_used_bytes || 0), 0) || 0
    const totalDbLimit = quotas?.reduce((sum, q) => sum + (q.db_size_limit_bytes || 0), 0) || 1
    const dbUsagePercent = (totalDbUsed / totalDbLimit) * 100

    if (dbUsagePercent > 85) {
      issues.push({
        type: 'warning',
        message: `High DB usage: ${dbUsagePercent.toFixed(0)}% of quota`
      })
    }

    const response = {
      success: true,
      buildActivity: {
        totalBuilds: totalBuildsThisWeek,
        growthVsLastWeek, // Already includes +/- and %
        successRate: `${successRate}%`,
        activeProjects: activeProjectsCount,
        failedToday: failedTodayCount
      },
      authUsage: {
        activeApiKeysLast24h,
        newApiKeysCreatedToday,
        projectsUsingAuth,
        totalProjects: totalInhouseProjects,
        topProject: topProject.name,
        topProjectUsage: topProject.usage
      },
      userBehavior: {
        activeBuilders: activeBuildersCount,
        avgBuildsPerUser,
        powerUsers: powerUsersCount,
        dormantProjects
      },
      issues,
      correlationId
    }

    return NextResponse.json(response)

  } catch (error) {
    const correlationId = uuidv4()

    logger.error('Error in In-House pulse endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch In-House pulse data',
      correlationId
    }, {
      status: 500,
      headers: { 'X-Correlation-Id': correlationId }
    })
  }
}

// Disable caching for this endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
