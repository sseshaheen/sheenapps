/**
 * In-House KPI Health Admin Dashboard
 *
 * Monitor KPI rollup health and data freshness across projects.
 * Part of Run Hub admin visibility.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  RefreshCw,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Database,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow, differenceInMinutes } from 'date-fns'

interface ProjectKpiHealth {
  projectId: string
  projectName?: string
  lastRollupAt?: string
  lastEventAt?: string
  todayRevenueCents: number
  todayLeads: number
  todayPayments: number
  currencyCode: string
  status: 'healthy' | 'stale' | 'no_data'
}

interface KpiHealthSummary {
  totalProjects: number
  healthyProjects: number
  staleProjects: number
  noDataProjects: number
  lastGlobalRollupAt?: string
  rollupJobStatus: 'running' | 'idle' | 'unknown'
  rollupIntervalMinutes: number
  avgRollupDurationMs?: number
}

interface RollupJobInfo {
  lastRunAt?: string
  lastDurationMs?: number
  status: 'running' | 'idle' | 'unknown'
  nextScheduledAt?: string
  recentErrors: Array<{ occurredAt: string; message: string }>
}

export function InhouseKpiHealthAdmin() {
  const [summary, setSummary] = useState<KpiHealthSummary | null>(null)
  const [projects, setProjects] = useState<ProjectKpiHealth[]>([])
  const [rollupInfo, setRollupInfo] = useState<RollupJobInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)

  // Filter
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'healthy' | 'stale' | 'no_data'>('all')

  const abortRef = useRef<AbortController | null>(null)

  const fetchHealth = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const [summaryRes, projectsRes, rollupRes] = await Promise.all([
        fetch('/api/admin/inhouse/kpi-health/summary', { signal: controller.signal }),
        fetch('/api/admin/inhouse/kpi-health/projects', { signal: controller.signal }),
        fetch('/api/admin/inhouse/kpi-health/rollup-job', { signal: controller.signal }),
      ])

      if (summaryRes.ok) {
        const data = await summaryRes.json()
        setSummary(data.data || null)
      }

      if (projectsRes.ok) {
        const data = await projectsRes.json()
        setProjects(data.data?.projects || [])
      }

      if (rollupRes.ok) {
        const data = await rollupRes.json()
        setRollupInfo(data.data || null)
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch KPI health:', error)
        toast.error('Failed to load KPI health data')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    return () => abortRef.current?.abort()
  }, [fetchHealth])

  const handleTriggerRollup = async (projectId?: string) => {
    const target = projectId ? `project ${projectId}` : 'all projects'
    const reason = window.prompt(`Reason for triggering rollup on ${target} (required):`)
    if (!reason) return

    setTriggering(true)
    try {
      const response = await fetch('/api/admin/inhouse/kpi-health/trigger-rollup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, reason }),
      })
      if (!response.ok) throw new Error('Failed to trigger rollup')
      toast.success(`Rollup triggered for ${target}`)
      // Refresh after a short delay
      setTimeout(fetchHealth, 2000)
    } catch (error) {
      console.error('Failed to trigger rollup:', error)
      toast.error('Failed to trigger rollup')
    } finally {
      setTriggering(false)
    }
  }

  // Filter projects
  const filteredProjects = projects.filter((p) => {
    if (projectFilter && !p.projectId.includes(projectFilter) && !p.projectName?.toLowerCase().includes(projectFilter.toLowerCase())) {
      return false
    }
    if (statusFilter !== 'all' && p.status !== statusFilter) {
      return false
    }
    return true
  })

  // Status badge helper
  const getStatusBadge = (status: ProjectKpiHealth['status']) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="bg-emerald-500"><CheckCircle className="h-3 w-3 mr-1" />Healthy</Badge>
      case 'stale':
        return <Badge variant="secondary" className="bg-amber-500 text-white"><Clock className="h-3 w-3 mr-1" />Stale</Badge>
      case 'no_data':
        return <Badge variant="outline"><AlertTriangle className="h-3 w-3 mr-1" />No Data</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Calculate freshness for a project
  const getFreshness = (lastRollupAt?: string): { label: string; isStale: boolean } => {
    if (!lastRollupAt) return { label: 'Never', isStale: true }
    const minutes = differenceInMinutes(new Date(), new Date(lastRollupAt))
    if (minutes < 20) return { label: `${minutes}m ago`, isStale: false }
    if (minutes < 60) return { label: `${minutes}m ago`, isStale: true }
    return { label: formatDistanceToNow(new Date(lastRollupAt), { addSuffix: true }), isStale: true }
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalProjects ?? '—'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle className="h-4 w-4" />
              Healthy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{summary?.healthyProjects ?? '—'}</div>
            {summary && summary.totalProjects > 0 && (
              <Progress value={(summary.healthyProjects / summary.totalProjects) * 100} className="mt-2 h-1" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Stale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{summary?.staleProjects ?? '—'}</div>
            <div className="text-xs text-muted-foreground mt-1">No rollup in &gt;20 minutes</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              No Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.noDataProjects ?? '—'}</div>
            <div className="text-xs text-muted-foreground mt-1">No events received</div>
          </CardContent>
        </Card>
      </div>

      {/* Rollup Job Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            KPI Rollup Job
          </CardTitle>
          <CardDescription>Background job that aggregates business events into daily KPIs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <Badge variant={rollupInfo?.status === 'running' ? 'default' : 'outline'} className="mt-1">
                {rollupInfo?.status || 'Unknown'}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Last Run</div>
              <div className="text-sm font-medium">
                {rollupInfo?.lastRunAt ? formatDistanceToNow(new Date(rollupInfo.lastRunAt), { addSuffix: true }) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Interval</div>
              <div className="text-sm font-medium">{summary?.rollupIntervalMinutes ?? 15} minutes</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Avg Duration</div>
              <div className="text-sm font-medium">
                {summary?.avgRollupDurationMs ? `${(summary.avgRollupDurationMs / 1000).toFixed(1)}s` : '—'}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={fetchHealth}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => handleTriggerRollup()} disabled={triggering}>
              <BarChart3 className="h-4 w-4 mr-2" />
              {triggering ? 'Triggering...' : 'Trigger Global Rollup'}
            </Button>
          </div>

          {/* Recent Errors */}
          {rollupInfo?.recentErrors && rollupInfo.recentErrors.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <div className="text-sm font-medium text-red-600 mb-2">Recent Errors</div>
              <div className="space-y-2">
                {rollupInfo.recentErrors.slice(0, 3).map((err, idx) => (
                  <div key={idx} className="text-xs bg-red-50 dark:bg-red-950/30 p-2 rounded">
                    <div className="text-muted-foreground">{format(new Date(err.occurredAt), 'PPp')}</div>
                    <div className="text-red-700 dark:text-red-400">{err.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Projects Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Project KPI Health
          </CardTitle>
          <CardDescription>Per-project data freshness and today&apos;s metrics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Filter by project ID or name"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="w-[300px]"
            />
            <div className="flex gap-1">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all')}
              >
                All
              </Button>
              <Button
                variant={statusFilter === 'healthy' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('healthy')}
              >
                Healthy
              </Button>
              <Button
                variant={statusFilter === 'stale' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('stale')}
              >
                Stale
              </Button>
              <Button
                variant={statusFilter === 'no_data' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('no_data')}
              >
                No Data
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-sm text-muted-foreground">No projects found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Rollup</TableHead>
                  <TableHead>Last Event</TableHead>
                  <TableHead>Today&apos;s Revenue</TableHead>
                  <TableHead>Today&apos;s Leads</TableHead>
                  <TableHead>Today&apos;s Payments</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => {
                  const freshness = getFreshness(project.lastRollupAt)
                  return (
                    <TableRow key={project.projectId}>
                      <TableCell>
                        <div className="font-medium">{project.projectName || project.projectId}</div>
                        <div className="text-xs text-muted-foreground">{project.projectId.slice(0, 8)}...</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(project.status)}</TableCell>
                      <TableCell className={freshness.isStale ? 'text-amber-600' : ''}>
                        {freshness.label}
                      </TableCell>
                      <TableCell>
                        {project.lastEventAt
                          ? formatDistanceToNow(new Date(project.lastEventAt), { addSuffix: true })
                          : '—'}
                      </TableCell>
                      <TableCell className="font-medium">
                        {project.currencyCode} {(project.todayRevenueCents / 100).toFixed(2)}
                      </TableCell>
                      <TableCell>{project.todayLeads}</TableCell>
                      <TableCell>{project.todayPayments}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTriggerRollup(project.projectId)}
                          disabled={triggering}
                        >
                          <BarChart3 className="h-4 w-4 mr-1" />
                          Rollup
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
