/**
 * In-House Usage Admin Dashboard
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RefreshCw } from 'lucide-react'

interface UsageOverview {
  totals: Record<string, number>
  byProject: Array<{ projectId: string; projectName: string | null; metrics: Record<string, number> }>
}

interface UsageProject {
  totals: Record<string, number>
  trends: Array<{ metric: string; day: string; total: number }>
}

interface ApproachingLimitRow {
  projectId: string
  projectName: string
  metric: string
  usage: number
  limit: number
  percentUsed: number
}

export function InhouseUsageAdmin() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month')
  const [overview, setOverview] = useState<UsageOverview | null>(null)
  const [approaching, setApproaching] = useState<ApproachingLimitRow[]>([])
  const [projectId, setProjectId] = useState('')
  const [projectUsage, setProjectUsage] = useState<UsageProject | null>(null)
  const [loading, setLoading] = useState(true)

  const abortRef = useRef<AbortController | null>(null)

  const fetchOverview = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const overviewRes = await fetch(`/api/admin/inhouse/usage/overview?period=${period}`, { signal: controller.signal })
      const approachingRes = await fetch('/api/admin/inhouse/usage/approaching-limits', { signal: controller.signal })

      if (overviewRes.ok) {
        const data = await overviewRes.json()
        setOverview(data.data || null)
      }
      if (approachingRes.ok) {
        const data = await approachingRes.json()
        setApproaching(data.data?.projects || [])
      }
    } finally {
      setLoading(false)
    }
  }, [period])

  const fetchProjectUsage = useCallback(async () => {
    if (!projectId) return
    const response = await fetch(`/api/admin/inhouse/usage/projects/${projectId}?period=${period}`)
    if (response.ok) {
      const data = await response.json()
      setProjectUsage(data.data || null)
    }
  }, [projectId, period])

  useEffect(() => {
    fetchOverview()
    return () => abortRef.current?.abort()
  }, [fetchOverview])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Usage Overview</CardTitle>
          <CardDescription>Totals across projects for the selected period</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Last 24h</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">This month</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchOverview}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : overview ? (
            <div className="flex flex-wrap gap-4 text-sm">
              {Object.entries(overview.totals).map(([metric, total]) => (
                <div key={metric}>
                  <div className="text-xs text-muted-foreground">{metric}</div>
                  <div className="font-semibold">{total}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No usage data</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage by Project</CardTitle>
          <CardDescription>Breakdown of usage metrics per project</CardDescription>
        </CardHeader>
        <CardContent>
          {overview?.byProject?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Metrics</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.byProject.map((row) => (
                  <TableRow key={row.projectId}>
                    <TableCell>
                      <div className="font-medium">{row.projectName || row.projectId}</div>
                      <div className="text-xs text-muted-foreground">{row.projectId}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {Object.entries(row.metrics)
                        .map(([metric, value]) => `${metric}: ${value}`)
                        .join(' • ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No projects tracked</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project Usage Drilldown</CardTitle>
          <CardDescription>Inspect metrics and trends for a specific project</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Project ID"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-[260px]"
          />
          <Button variant="outline" onClick={fetchProjectUsage}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Load
          </Button>
        </CardContent>
        <CardContent>
          {projectUsage ? (
            <div className="space-y-3">
              <div className="text-sm">Totals: {Object.entries(projectUsage.totals).map(([k, v]) => `${k}: ${v}`).join(' • ')}</div>
              {projectUsage.trends.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Metric</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectUsage.trends.map((row, idx) => (
                      <TableRow key={`${row.metric}-${idx}`}>
                        <TableCell>{new Date(row.day).toLocaleDateString()}</TableCell>
                        <TableCell>{row.metric}</TableCell>
                        <TableCell>{row.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-sm text-muted-foreground">No trend data</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Enter a project ID to view details</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approaching Limits</CardTitle>
          <CardDescription>Projects above the 90% threshold</CardDescription>
        </CardHeader>
        <CardContent>
          {approaching.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead>% Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approaching.map((row) => (
                  <TableRow key={`${row.projectId}-${row.metric}`}>
                    <TableCell>
                      <div className="font-medium">{row.projectName}</div>
                      <div className="text-xs text-muted-foreground">{row.projectId}</div>
                    </TableCell>
                    <TableCell>{row.metric}</TableCell>
                    <TableCell>{row.usage}</TableCell>
                    <TableCell>{row.limit}</TableCell>
                    <TableCell>{(row.percentUsed * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No projects near limits</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
