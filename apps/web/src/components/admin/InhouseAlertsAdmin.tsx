/**
 * In-House Alerts Admin
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface AlertRule {
  id: string
  name: string
  service: string
  metric: string
  condition: string
  threshold: number
  window_minutes: number
  channels: string[]
  enabled: boolean
  created_at: string
}

interface AlertItem {
  id: string
  rule_id: string | null
  project_id: string | null
  severity: string
  message: string
  triggered_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  rule_name?: string | null
  service?: string | null
}

export function InhouseAlertsAdmin() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [activeAlerts, setActiveAlerts] = useState<AlertItem[]>([])
  const [historyAlerts, setHistoryAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(false)
  const [historyStatus, setHistoryStatus] = useState('')

  // Fetch all dashboard data in a single call
  const fetchDashboardData = useCallback(async () => {
    const params = new URLSearchParams()
    if (historyStatus) params.set('status', historyStatus)
    const response = await fetch(`/api/admin/inhouse/alerts/dashboard?${params.toString()}`)
    if (!response.ok) throw new Error('Failed to fetch alerts dashboard')
    const result = await response.json()
    const data = result.data || result
    setRules(data.rules || [])
    setActiveAlerts(data.active || [])
    const history = data.history || {}
    setHistoryAlerts(history.alerts || [])
  }, [historyStatus])

  // Keep individual fetchers for targeted refreshes after mutations
  const fetchRules = useCallback(async () => {
    const response = await fetch('/api/admin/inhouse/alerts/rules')
    if (!response.ok) throw new Error('Failed to fetch rules')
    const result = await response.json()
    setRules(result.data?.rules || [])
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      await fetchDashboardData()
    } catch (error) {
      console.error('Failed to load alerts:', error)
      toast.error('Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [fetchDashboardData])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleCreateRule = async () => {
    const name = window.prompt('Rule name')
    if (!name) return
    const service = window.prompt('Service (jobs, email, storage, backups, payments, analytics)')
    if (!service) return
    const metric = window.prompt('Metric (error_rate, queue_depth, bounce_rate, failures, usage_pct)')
    if (!metric) return
    const condition = window.prompt('Condition (gt, lt, eq)', 'gt')
    if (!condition) return
    const thresholdRaw = window.prompt('Threshold (number)')
    if (!thresholdRaw) return
    const threshold = Number(thresholdRaw)
    if (!Number.isFinite(threshold)) return
    const windowMinutesRaw = window.prompt('Window minutes (default 5)', '5')
    const windowMinutes = windowMinutesRaw ? Number(windowMinutesRaw) : 5
    const channelsRaw = window.prompt('Channels (comma separated, e.g. email,slack)', 'email')
    const channels = channelsRaw ? channelsRaw.split(',').map((c) => c.trim()).filter(Boolean) : []

    try {
      const response = await fetch('/api/admin/inhouse/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          service,
          metric,
          condition,
          threshold,
          windowMinutes,
          channels,
          enabled: true,
        }),
      })
      if (!response.ok) throw new Error('Failed to create rule')
      toast.success('Rule created')
      fetchRules()
    } catch (error) {
      console.error('Failed to create rule:', error)
      toast.error('Failed to create rule')
    }
  }

  const handleToggleRule = async (rule: AlertRule) => {
    try {
      const response = await fetch(`/api/admin/inhouse/alerts/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      })
      if (!response.ok) throw new Error('Failed to update rule')
      fetchRules()
    } catch (error) {
      console.error('Failed to update rule:', error)
      toast.error('Failed to update rule')
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('Delete this rule?')) return
    const reason = window.prompt('Reason for deleting this rule (required):')
    if (!reason) return
    try {
      const response = await fetch(`/api/admin/inhouse/alerts/rules/${ruleId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!response.ok) throw new Error('Failed to delete rule')
      toast.success('Rule deleted')
      fetchRules()
    } catch (error) {
      console.error('Failed to delete rule:', error)
      toast.error('Failed to delete rule')
    }
  }

  const handleAcknowledge = async (alertId: string) => {
    const reason = window.prompt('Reason for acknowledgement (optional)')
    try {
      const response = await fetch(`/api/admin/inhouse/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!response.ok) throw new Error('Failed to acknowledge alert')
      toast.success('Alert acknowledged')
      fetchAll()
    } catch (error) {
      console.error('Failed to acknowledge alert:', error)
      toast.error('Failed to acknowledge alert')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Alert Rules</CardTitle>
          <CardDescription>Create and manage in-house alert rules</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleCreateRule}>Create rule</Button>
        </CardContent>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : rules.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>{rule.name}</TableCell>
                    <TableCell>{rule.service}</TableCell>
                    <TableCell>{rule.metric}</TableCell>
                    <TableCell>{rule.condition}</TableCell>
                    <TableCell>{rule.threshold}</TableCell>
                    <TableCell>{(rule.channels || []).join(', ') || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                        {rule.enabled ? 'enabled' : 'disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2">
                      <Button size="sm" variant="outline" onClick={() => handleToggleRule(rule)}>
                        {rule.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeleteRule(rule.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No rules configured</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Alerts</CardTitle>
          <CardDescription>Alerts currently firing</CardDescription>
        </CardHeader>
        <CardContent>
          {activeAlerts.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Triggered</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAlerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>{alert.rule_name || alert.rule_id || 'Rule'}</TableCell>
                    <TableCell className="truncate max-w-[160px]">{alert.project_id || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate">{alert.message}</TableCell>
                    <TableCell>{new Date(alert.triggered_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => handleAcknowledge(alert.id)}>
                        Acknowledge
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No active alerts</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert History</CardTitle>
          <CardDescription>Recent alerts and acknowledgements</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Input
            placeholder="Filter status (active, resolved, acknowledged)"
            value={historyStatus}
            onChange={(event) => setHistoryStatus(event.target.value)}
            className="w-[240px]"
          />
          <Button variant="outline" onClick={fetchAll}>Apply</Button>
        </CardContent>
        <CardContent>
          {historyAlerts.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Triggered</TableHead>
                  <TableHead>Ack</TableHead>
                  <TableHead>Resolved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyAlerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>{alert.rule_name || alert.rule_id || 'Rule'}</TableCell>
                    <TableCell>{alert.severity}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{alert.message}</TableCell>
                    <TableCell>{new Date(alert.triggered_at).toLocaleString()}</TableCell>
                    <TableCell>{alert.acknowledged_at ? new Date(alert.acknowledged_at).toLocaleString() : '-'}</TableCell>
                    <TableCell>{alert.resolved_at ? new Date(alert.resolved_at).toLocaleString() : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No history available</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
