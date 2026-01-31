/**
 * Alert Management Dashboard Component
 * Configure alert rules and manage active alerts
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Edit2,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Zap,
  FileWarning,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'

// Types
type AlertCondition = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'
type AlertSeverity = 'critical' | 'warning' | 'info'
type AlertChannel = 'email' | 'slack' | 'pagerduty' | 'webhook'
type AlertStatus = 'firing' | 'acknowledged' | 'resolved'

interface AlertRule {
  id: string
  name: string
  description?: string
  metric_name: string
  dimensions?: Record<string, string>
  condition: AlertCondition
  threshold: number
  duration_minutes: number
  severity: AlertSeverity
  channels: AlertChannel[]
  enabled: boolean
  created_at: string
  updated_at: string
  created_by?: string
}

interface FiredAlert {
  id: string
  rule_id: string
  fingerprint: string
  status: AlertStatus
  metric_value: number
  dimensions?: Record<string, string>
  fired_at: string
  acknowledged_at?: string
  acknowledged_by?: string
  resolved_at?: string
  incident_id?: string
  rule_name?: string
  rule_severity?: AlertSeverity
}

interface EvaluatorStatus {
  running: boolean
  lastRun?: string
  lastDuration?: number
  consecutiveErrors: number
  rulesEvaluated: number
  alertsFired: number
}

interface AlertManagementDashboardProps {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
}

// Condition configuration
const conditionConfig: Record<AlertCondition, string> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: '=',
  neq: '!=',
}

// Severity configuration
const severityConfig = {
  critical: { label: 'Critical', color: 'bg-red-500', badgeVariant: 'destructive' },
  warning: { label: 'Warning', color: 'bg-yellow-500', badgeVariant: 'warning' },
  info: { label: 'Info', color: 'bg-blue-500', badgeVariant: 'secondary' },
}

// Status configuration
const statusConfig = {
  firing: { label: 'Firing', icon: AlertCircle, color: 'destructive' },
  acknowledged: { label: 'Acknowledged', icon: Clock, color: 'warning' },
  resolved: { label: 'Resolved', icon: CheckCircle2, color: 'default' },
}

// Available metrics (matches backend)
const AVAILABLE_METRICS = [
  'api_latency_p99',
  'api_latency_p95',
  'api_latency_p50',
  'api_error_rate',
  'api_request_count',
  'db_query_latency_p99',
  'db_query_error_rate',
  'build_failure_rate',
  'build_queue_depth',
]

// Available channels
const AVAILABLE_CHANNELS: AlertChannel[] = ['email', 'slack', 'pagerduty', 'webhook']

export function AlertManagementDashboard({
  adminId,
  adminEmail,
  adminRole,
  permissions,
}: AlertManagementDashboardProps) {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [activeAlerts, setActiveAlerts] = useState<FiredAlert[]>([])
  const [alertHistory, setAlertHistory] = useState<FiredAlert[]>([])
  const [evaluatorStatus, setEvaluatorStatus] = useState<EvaluatorStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'rules' | 'active' | 'history'>('rules')

  // Dialogs
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null)

  // Form state
  const [ruleForm, setRuleForm] = useState({
    name: '',
    description: '',
    metric_name: 'api_error_rate',
    condition: 'gt' as AlertCondition,
    threshold: 0,
    duration_minutes: 5,
    severity: 'warning' as AlertSeverity,
    channels: ['email'] as AlertChannel[],
  })

  const canWriteAlerts = permissions.includes('alerts.write') || adminRole === 'super_admin'
  const canAcknowledgeAlerts = permissions.includes('alerts.acknowledge') || adminRole === 'super_admin'
  const canCreateIncidents = permissions.includes('incidents.create') || adminRole === 'super_admin'

  // Fetch alert rules
  const fetchRules = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/alerts/rules', {
        cache: 'no-store',
        credentials: 'include',
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setRules(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching rules:', error)
      toast.error('Failed to load alert rules')
    }
  }, [])

  // Fetch active alerts
  const fetchActiveAlerts = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/alerts/active', {
        cache: 'no-store',
        credentials: 'include',
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setActiveAlerts(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching active alerts:', error)
    }
  }, [])

  // Fetch alert history
  const fetchAlertHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/alerts/history?limit=50', {
        cache: 'no-store',
        credentials: 'include',
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setAlertHistory(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching alert history:', error)
    }
  }, [])

  // Fetch evaluator status
  const fetchEvaluatorStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/alerts/evaluator/status', {
        cache: 'no-store',
        credentials: 'include',
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setEvaluatorStatus(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching evaluator status:', error)
    }
  }, [])

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await Promise.all([
        fetchRules(),
        fetchActiveAlerts(),
        fetchAlertHistory(),
        fetchEvaluatorStatus(),
      ])
      setIsLoading(false)
    }
    loadData()
  }, [fetchRules, fetchActiveAlerts, fetchAlertHistory, fetchEvaluatorStatus])

  // Refresh based on active tab
  useEffect(() => {
    if (activeTab === 'active') {
      fetchActiveAlerts()
    } else if (activeTab === 'history') {
      fetchAlertHistory()
    }
  }, [activeTab, fetchActiveAlerts, fetchAlertHistory])

  // Create/update rule
  const handleSaveRule = async () => {
    if (!ruleForm.name || !ruleForm.metric_name) {
      toast.error('Name and metric are required')
      return
    }

    try {
      const url = editingRule
        ? `/api/admin/alerts/rules/${editingRule.id}`
        : '/api/admin/alerts/rules'

      const response = await fetch(url, {
        method: editingRule ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(ruleForm),
      })

      if (response.ok) {
        toast.success(editingRule ? 'Rule updated' : 'Rule created')
        setIsRuleDialogOpen(false)
        resetRuleForm()
        fetchRules()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save rule')
      }
    } catch (error) {
      toast.error('Failed to save rule')
    }
  }

  // Toggle rule enabled
  const handleToggleRule = async (rule: AlertRule) => {
    try {
      const response = await fetch(`/api/admin/alerts/rules/${rule.id}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ enabled: !rule.enabled }),
      })

      if (response.ok) {
        toast.success(`Rule ${!rule.enabled ? 'enabled' : 'disabled'}`)
        fetchRules()
      }
    } catch (error) {
      toast.error('Failed to toggle rule')
    }
  }

  // Delete rule
  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return

    try {
      const response = await fetch(`/api/admin/alerts/rules/${ruleId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (response.ok) {
        toast.success('Rule deleted')
        fetchRules()
      }
    } catch (error) {
      toast.error('Failed to delete rule')
    }
  }

  // Acknowledge alert
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/admin/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        credentials: 'include',
      })

      if (response.ok) {
        toast.success('Alert acknowledged')
        fetchActiveAlerts()
      }
    } catch (error) {
      toast.error('Failed to acknowledge alert')
    }
  }

  // Resolve alert
  const handleResolveAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/admin/alerts/${alertId}/resolve`, {
        method: 'POST',
        credentials: 'include',
      })

      if (response.ok) {
        toast.success('Alert resolved')
        fetchActiveAlerts()
        fetchAlertHistory()
      }
    } catch (error) {
      toast.error('Failed to resolve alert')
    }
  }

  // Create incident from alert
  const handleCreateIncident = async (alertId: string) => {
    try {
      const response = await fetch(`/api/admin/alerts/${alertId}/create-incident`, {
        method: 'POST',
        credentials: 'include',
      })

      if (response.ok) {
        const result = await response.json()
        toast.success('Incident created')
        fetchActiveAlerts()
      }
    } catch (error) {
      toast.error('Failed to create incident')
    }
  }

  // Force evaluation
  const handleForceEvaluation = async () => {
    try {
      const response = await fetch('/api/admin/alerts/evaluator/force-run', {
        method: 'POST',
        credentials: 'include',
      })

      if (response.ok) {
        toast.success('Evaluation triggered')
        setTimeout(() => {
          fetchEvaluatorStatus()
          fetchActiveAlerts()
        }, 2000)
      }
    } catch (error) {
      toast.error('Failed to trigger evaluation')
    }
  }

  // Reset rule form
  const resetRuleForm = () => {
    setEditingRule(null)
    setRuleForm({
      name: '',
      description: '',
      metric_name: 'api_error_rate',
      condition: 'gt',
      threshold: 0,
      duration_minutes: 5,
      severity: 'warning',
      channels: ['email'],
    })
  }

  // Open edit dialog
  const openEditDialog = (rule: AlertRule) => {
    setEditingRule(rule)
    setRuleForm({
      name: rule.name,
      description: rule.description || '',
      metric_name: rule.metric_name,
      condition: rule.condition,
      threshold: rule.threshold,
      duration_minutes: rule.duration_minutes,
      severity: rule.severity,
      channels: rule.channels,
    })
    setIsRuleDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with evaluator status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="rules">
                <Settings className="h-4 w-4 mr-2" />
                Rules ({rules.length})
              </TabsTrigger>
              <TabsTrigger value="active">
                <Bell className="h-4 w-4 mr-2" />
                Active ({activeAlerts.length})
              </TabsTrigger>
              <TabsTrigger value="history">
                <Clock className="h-4 w-4 mr-2" />
                History
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-2">
          {evaluatorStatus && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${evaluatorStatus.running ? 'bg-green-500' : 'bg-gray-400'}`} />
              {evaluatorStatus.lastRun && (
                <span>Last run: {formatDistanceToNow(new Date(evaluatorStatus.lastRun), { addSuffix: true })}</span>
              )}
              {evaluatorStatus.consecutiveErrors > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {evaluatorStatus.consecutiveErrors} errors
                </Badge>
              )}
            </div>
          )}
          {canWriteAlerts && (
            <>
              <Button variant="outline" size="sm" onClick={handleForceEvaluation}>
                <Zap className="h-4 w-4 mr-2" />
                Force Run
              </Button>
              <Button onClick={() => { resetRuleForm(); setIsRuleDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                New Rule
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <Card>
          <CardHeader>
            <CardTitle>Alert Rules</CardTitle>
            <CardDescription>
              Configure conditions that trigger alerts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No alert rules configured
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => {
                    const sevConfig = severityConfig[rule.severity]
                    return (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{rule.name}</div>
                            {rule.description && (
                              <div className="text-xs text-muted-foreground">{rule.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{rule.metric_name}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {conditionConfig[rule.condition]} {rule.threshold}
                          {rule.duration_minutes > 0 && (
                            <span className="text-muted-foreground ml-1">
                              for {rule.duration_minutes}m
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sevConfig.badgeVariant as any}>
                            {sevConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {rule.channels.map((ch) => (
                              <Badge key={ch} variant="outline" className="text-xs">
                                {ch}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={() => handleToggleRule(rule)}
                            disabled={!canWriteAlerts}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {canWriteAlerts && (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(rule)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteRule(rule.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active Alerts Tab */}
      {activeTab === 'active' && (
        <Card>
          <CardHeader>
            <CardTitle>Active Alerts</CardTitle>
            <CardDescription>
              Currently firing alerts that need attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                No active alerts
              </div>
            ) : (
              <div className="space-y-3">
                {activeAlerts.map((alert) => {
                  const statConfig = statusConfig[alert.status]
                  const StatusIcon = statConfig.icon
                  const rule = rules.find((r) => r.id === alert.rule_id)
                  const sevConfig = rule ? severityConfig[rule.severity] : severityConfig.warning

                  return (
                    <div
                      key={alert.id}
                      className="p-4 rounded-lg border bg-card"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-2 h-2 rounded-full ${sevConfig.color}`} />
                            <span className="font-medium">
                              {alert.rule_name || rule?.name || 'Unknown Rule'}
                            </span>
                            <Badge variant={statConfig.color as any} className="text-xs">
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statConfig.label}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Value: <span className="font-mono">{alert.metric_value}</span>
                            {rule && (
                              <span className="ml-2">
                                Threshold: <span className="font-mono">{conditionConfig[rule.condition]} {rule.threshold}</span>
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Fired {formatDistanceToNow(new Date(alert.fired_at), { addSuffix: true })}
                            {alert.acknowledged_at && (
                              <span className="ml-2">
                                | Acknowledged {formatDistanceToNow(new Date(alert.acknowledged_at), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {alert.status === 'firing' && canAcknowledgeAlerts && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAcknowledgeAlert(alert.id)}
                            >
                              <BellOff className="h-4 w-4 mr-1" />
                              Acknowledge
                            </Button>
                          )}
                          {canWriteAlerts && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResolveAlert(alert.id)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Resolve
                            </Button>
                          )}
                          {canCreateIncidents && !alert.incident_id && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleCreateIncident(alert.id)}
                            >
                              <FileWarning className="h-4 w-4 mr-1" />
                              Create Incident
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Alert History Tab */}
      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle>Alert History</CardTitle>
            <CardDescription>
              Recent alert activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alertHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No alert history
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Fired</TableHead>
                    <TableHead>Resolved</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertHistory.map((alert) => {
                    const statConfig = statusConfig[alert.status]
                    const StatusIcon = statConfig.icon
                    const rule = rules.find((r) => r.id === alert.rule_id)
                    const duration = alert.resolved_at
                      ? Math.round((new Date(alert.resolved_at).getTime() - new Date(alert.fired_at).getTime()) / 60000)
                      : null

                    return (
                      <TableRow key={alert.id}>
                        <TableCell className="font-medium">
                          {alert.rule_name || rule?.name || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statConfig.color as any} className="text-xs">
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {alert.metric_value}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(alert.fired_at), 'PPp')}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {alert.resolved_at ? format(new Date(alert.resolved_at), 'PPp') : '-'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {duration !== null ? `${duration} min` : '-'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Rule Dialog */}
      <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}</DialogTitle>
            <DialogDescription>
              Configure when alerts should fire
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label>Name</Label>
              <Input
                value={ruleForm.name}
                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                placeholder="High API Error Rate"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={ruleForm.description}
                onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                placeholder="Alert when API error rate exceeds threshold"
                rows={2}
              />
            </div>
            <div>
              <Label>Metric</Label>
              <Select
                value={ruleForm.metric_name}
                onValueChange={(v) => setRuleForm({ ...ruleForm, metric_name: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_METRICS.map((metric) => (
                    <SelectItem key={metric} value={metric}>
                      {metric}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Condition</Label>
                <Select
                  value={ruleForm.condition}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, condition: v as AlertCondition })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">Greater than (&gt;)</SelectItem>
                    <SelectItem value="gte">Greater or equal (&gt;=)</SelectItem>
                    <SelectItem value="lt">Less than (&lt;)</SelectItem>
                    <SelectItem value="lte">Less or equal (&lt;=)</SelectItem>
                    <SelectItem value="eq">Equal (=)</SelectItem>
                    <SelectItem value="neq">Not equal (!=)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Threshold</Label>
                <Input
                  type="number"
                  step="any"
                  value={ruleForm.threshold}
                  onChange={(e) => setRuleForm({ ...ruleForm, threshold: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min="0"
                value={ruleForm.duration_minutes}
                onChange={(e) => setRuleForm({ ...ruleForm, duration_minutes: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Condition must be true for this many minutes before firing. Set to 0 for immediate alerts.
              </p>
            </div>
            <div>
              <Label>Severity</Label>
              <Select
                value={ruleForm.severity}
                onValueChange={(v) => setRuleForm({ ...ruleForm, severity: v as AlertSeverity })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notification Channels</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {AVAILABLE_CHANNELS.map((ch) => (
                  <Badge
                    key={ch}
                    variant={ruleForm.channels.includes(ch) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => {
                      const channels = ruleForm.channels.includes(ch)
                        ? ruleForm.channels.filter((c) => c !== ch)
                        : [...ruleForm.channels, ch]
                      setRuleForm({ ...ruleForm, channels })
                    }}
                  >
                    {ch}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRuleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRule}>
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
