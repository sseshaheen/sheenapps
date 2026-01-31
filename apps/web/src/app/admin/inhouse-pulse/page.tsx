'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, Activity, Users, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

interface PulseData {
  buildActivity: {
    totalBuilds: number
    growthVsLastWeek: string
    successRate: string
    activeProjects: number
    failedToday: number
  }
  authUsage: {
    activeApiKeysLast24h: number
    newApiKeysCreatedToday: number
    projectsUsingAuth: number
    totalProjects: number
    topProject: string
    topProjectUsage: number
  }
  userBehavior: {
    activeBuilders: number
    avgBuildsPerUser: string
    powerUsers: number
    dormantProjects: number
  }
  issues: Array<{
    type: 'error' | 'warning'
    message: string
  }>
}

export default function InHousePulsePage() {
  const [data, setData] = useState<PulseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/admin/inhouse-pulse', { signal })
      if (!response.ok) {
        throw new Error('Failed to fetch pulse data')
      }
      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      // Don't set error state if request was aborted (component unmounted)
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Track current abort controller for cleanup
    let currentAbortController: AbortController | null = null

    const fetchWithAbort = () => {
      // Cancel previous request if still in flight
      if (currentAbortController) {
        currentAbortController.abort()
      }

      // Create new controller for this request
      currentAbortController = new AbortController()
      fetchData(currentAbortController.signal)
    }

    // Initial fetch
    fetchWithAbort()

    // Auto-refresh every 30 seconds, but only when tab is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchWithAbort()
      }
    }, 30000)

    // Also refresh when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchWithAbort()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      // Abort any in-flight request when component unmounts
      if (currentAbortController) {
        currentAbortController.abort()
      }
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="mb-6">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Failed to load pulse data'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Parse growth to determine state (up/down/flat)
  const growthStr = data.buildActivity.growthVsLastWeek // e.g. "+12%", "-5%", "0%"
  const growthNum = Number(growthStr.replace('%', '')) || 0

  const growthState: 'up' | 'down' | 'flat' =
    growthNum > 0 ? 'up' : growthNum < 0 ? 'down' : 'flat'

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">In-House Mode Pulse</h1>
        <p className="text-muted-foreground mt-1">
          Quick overview of build activity, auth usage, and user behavior
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Auto-refreshes every 30 seconds
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Build Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              Build Activity
            </CardTitle>
            <CardDescription>This Week</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold">{data.buildActivity.totalBuilds}</span>
              <div className="flex items-center gap-1 text-sm">
                {growthState === 'up' && (
                  <>
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-green-500 font-medium">{growthStr}</span>
                  </>
                )}
                {growthState === 'down' && (
                  <>
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <span className="text-red-500 font-medium">{growthStr}</span>
                  </>
                )}
                {growthState === 'flat' && (
                  <span className="text-muted-foreground font-medium">{growthStr}</span>
                )}
                <span className="text-muted-foreground">vs last week</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-xl font-semibold text-green-600">
                  {data.buildActivity.successRate}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Projects</p>
                <p className="text-xl font-semibold">{data.buildActivity.activeProjects}</p>
              </div>
            </div>

            {data.buildActivity.failedToday > 0 && (
              <div className="pt-3 border-t">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium">
                    Failed Today: {data.buildActivity.failedToday}
                  </span>
                  <button
                    onClick={() => window.location.href = '/admin/build-logs'}
                    className="ml-auto text-xs text-blue-500 hover:underline"
                  >
                    View logs →
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Auth Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              API Key Activity
            </CardTitle>
            <CardDescription>Last 24 hours</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active API Keys</p>
                <p className="text-3xl font-bold">{data.authUsage.activeApiKeysLast24h}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Created Today</p>
                <p className="text-2xl font-semibold text-blue-600">
                  +{data.authUsage.newApiKeysCreatedToday}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Projects Using Auth</p>
                <p className="text-xl font-semibold">
                  {data.authUsage.projectsUsingAuth}/{data.authUsage.totalProjects}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Top Project</p>
                <p className="text-sm font-medium truncate" title={data.authUsage.topProject}>
                  {data.authUsage.topProject}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.authUsage.topProjectUsage} API calls
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. User Behavior */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              User Activity
            </CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Builders</p>
                <p className="text-3xl font-bold">{data.userBehavior.activeBuilders}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Avg Builds/User</p>
                <p className="text-2xl font-semibold text-purple-600">
                  {data.userBehavior.avgBuildsPerUser}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Power Users</p>
                <p className="text-sm text-muted-foreground text-xs">(&gt;10 builds)</p>
                <p className="text-xl font-semibold text-orange-600">
                  {data.userBehavior.powerUsers}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dormant Projects</p>
                <p className="text-sm text-muted-foreground text-xs">(&gt;30 days)</p>
                <p className="text-xl font-semibold text-gray-500">
                  {data.userBehavior.dormantProjects}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Issues */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Needs Attention
            </CardTitle>
            <CardDescription>
              {data.issues.length === 0 ? 'All systems healthy' : `${data.issues.length} issues`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.issues.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 py-4">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">No issues detected</span>
              </div>
            ) : (
              <div className="space-y-2">
                {data.issues.map((issue, idx) => (
                  <Alert
                    key={idx}
                    variant={issue.type === 'error' ? 'destructive' : 'default'}
                    className={issue.type === 'warning' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950' : ''}
                  >
                    {issue.type === 'error' ? (
                      <XCircle className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <AlertDescription className="text-sm">
                      {issue.message}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className="cursor-pointer hover:bg-accent"
            onClick={() => window.location.href = '/admin/build-logs'}
          >
            View Build Logs →
          </Badge>
          <Badge
            variant="outline"
            className="cursor-pointer hover:bg-accent"
            onClick={() => window.location.href = '/admin/analytics'}
          >
            Full Analytics →
          </Badge>
          <Badge
            variant="outline"
            className="cursor-pointer hover:bg-accent"
            onClick={() => fetchData()}
          >
            Refresh Now ↻
          </Badge>
        </CardContent>
      </Card>
    </div>
  )
}
