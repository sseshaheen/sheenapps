/**
 * In-House Monitoring Admin Dashboard
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

interface ServiceHealth {
  name: string
  status: 'healthy' | 'warning' | 'critical'
  errorRate: number
  actionUrl: string
}

interface HealthResponse {
  services: ServiceHealth[]
  queues: { dlqTotal: number }
  needsAttention: Array<{ type: string; message: string; actionUrl: string; severity: string }>
}

interface SummaryResponse {
  jobFailureRate: number
  emailBounceRate: number
  backupFailures: number
  projectsNearQuota: number
  activeAlerts: number
}

export function InhouseMonitoringAdmin() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const [healthRes, summaryRes] = await Promise.all([
        fetch('/api/admin/inhouse/monitoring/health', { signal: controller.signal }),
        fetch('/api/admin/inhouse/monitoring/summary', { signal: controller.signal }),
      ])

      if (healthRes.ok) {
        const data = await healthRes.json()
        setHealth(data.data || null)
      }
      if (summaryRes.ok) {
        const data = await summaryRes.json()
        setSummary(data.data || null)
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to load monitoring data:', error)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    return () => abortRef.current?.abort()
  }, [fetchData])

  const statusColor = (status: ServiceHealth['status']) => {
    if (status === 'critical') return 'destructive'
    if (status === 'warning') return 'secondary'
    return 'default'
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Service Health</CardTitle>
          <CardDescription>High-level service health indicators</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end">
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !health ? (
            <div className="text-sm text-muted-foreground">No health data</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {health.services.map((service) => (
                <Card key={service.name}>
                  <CardHeader>
                    <CardTitle className="text-sm capitalize">{service.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Badge variant={statusColor(service.status)}>{service.status}</Badge>
                    <div className="text-xs text-muted-foreground">Error rate: {(service.errorRate * 100).toFixed(2)}%</div>
                    <a href={service.actionUrl} className="text-xs text-blue-600 hover:underline">View details →</a>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Summary (Last 24h)</CardTitle>
            <CardDescription>Key signals and counts</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Job failure rate</div>
              <div className="text-lg font-semibold">{(summary.jobFailureRate * 100).toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Email bounce rate</div>
              <div className="text-lg font-semibold">{(summary.emailBounceRate * 100).toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Backup failures</div>
              <div className="text-lg font-semibold">{summary.backupFailures}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Projects near quota</div>
              <div className="text-lg font-semibold">{summary.projectsNearQuota}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Active alerts</div>
              <div className="text-lg font-semibold">{summary.activeAlerts}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {health && health.needsAttention.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Needs Attention</CardTitle>
            <CardDescription>Immediate issues requiring action</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {health.needsAttention.map((item) => (
              <div key={`${item.type}-${item.message}`} className="flex items-center justify-between">
                <div className="text-sm">{item.message}</div>
                <a href={item.actionUrl} className="text-xs text-blue-600 hover:underline">View →</a>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
