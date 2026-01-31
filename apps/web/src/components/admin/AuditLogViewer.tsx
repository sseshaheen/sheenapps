'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { 
  Shield, 
  Calendar, 
  User, 
  Activity, 
  AlertCircle,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  Download,
  Eye,
  Clock,
  Globe,
  Key,
  CreditCard,
  UserCheck,
  Settings,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface Props {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
}

interface AuditLog {
  id: string
  timestamp: string
  actor_id: string
  actor_email: string
  actor_role: string
  action: string
  resource_type: string
  resource_id: string
  details: any
  ip_address: string
  user_agent: string
  correlation_id: string
  status: 'success' | 'failure' | 'partial'
  risk_level: 'low' | 'medium' | 'high' | 'critical'
}

interface AuditStats {
  total_events: number
  unique_actors: number
  failed_actions: number
  high_risk_events: number
  most_active_user: string
  most_common_action: string
}

interface SecurityAlert {
  id: string
  type: 'login_failure' | 'unusual_activity' | 'new_location' | 'security_breach' | 'rate_limit'
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  timestamp: string
  metadata?: {
    ip_address?: string
    user_email?: string
    location?: string
    attempt_count?: number
    action_count?: number
  }
  resolved: boolean
}


export function AuditLogViewer({
  adminId,
  adminEmail,
  adminRole,
  permissions
}: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [stats, setStats] = useState<AuditStats | null>({
    total_events: 0,
    unique_actors: 0,
    failed_actions: 0,
    high_risk_events: 0,
    most_active_user: 'N/A',
    most_common_action: 'N/A'
  })
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [alerts, setAlerts] = useState<SecurityAlert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    actor: '',
    action: 'all',
    resource_type: '',
    status: 'all',
    risk_level: 'all',
    date_from: '',
    date_to: ''
  })
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch logs on mount
  useEffect(() => {
    fetchLogs()
  }, [filters])

  // Fetch alerts on mount
  useEffect(() => {
    fetchAlerts()
  }, [])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value)
      })
      
      const response = await fetch(`/api/admin/audit/logs?${params}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch audit logs: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.success) {
        setLogs(data.logs || [])
        
        // Create stats from the logs data
        if (data.logs && data.logs.length > 0) {
          const uniqueActors = new Set(data.logs.map((log: AuditLog) => log.actor_email)).size
          const failedActions = data.logs.filter((log: AuditLog) => log.status === 'failure').length
          const highRiskEvents = data.logs.filter((log: AuditLog) => log.risk_level === 'high').length
          
          const statsData: AuditStats = {
            total_events: data.total_count || data.logs.length,
            unique_actors: uniqueActors,
            failed_actions: failedActions,
            high_risk_events: highRiskEvents,
            most_active_user: data.most_active_user || 'N/A',
            most_common_action: data.most_common_action || 'N/A'
          }
          
          setStats(statsData)
        } else {
          setStats(null)
        }
      } else {
        setError(data.error || 'Failed to load audit logs')
        setLogs([])
        setStats(null)
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error)
      setError(error instanceof Error ? error.message : 'Failed to connect to admin service')
      setLogs([])
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  const fetchAlerts = async () => {
    try {
      setAlertsLoading(true)
      
      const response = await fetch('/api/admin/audit/alerts')
      if (!response.ok) {
        console.error('Failed to fetch alerts:', response.status)
        return
      }
      
      const data = await response.json()
      
      if (data.success && data.alerts) {
        setAlerts(data.alerts)
      }
    } catch (error) {
      console.error('Failed to fetch security alerts:', error)
    } finally {
      setAlertsLoading(false)
    }
  }

  const getActionIcon = (action: string) => {
    if (action.startsWith('auth')) return <Key className="h-4 w-4" />
    if (action.startsWith('user')) return <UserCheck className="h-4 w-4" />
    if (action.startsWith('refund')) return <CreditCard className="h-4 w-4" />
    if (action.startsWith('ticket')) return <Activity className="h-4 w-4" />
    return <Settings className="h-4 w-4" />
  }

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'critical': return <Badge variant="destructive">Critical</Badge>
      case 'high': return <Badge variant="destructive" className="bg-orange-500">High</Badge>
      case 'medium': return <Badge variant="secondary">Medium</Badge>
      case 'low': return <Badge variant="outline">Low</Badge>
      default: return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'failure': return <XCircle className="h-4 w-4 text-red-600" />
      case 'partial': return <AlertCircle className="h-4 w-4 text-yellow-600" />
      default: return null
    }
  }

  const exportLogs = () => {
    // Export functionality
    const csv = logs.map(log => 
      `${log.timestamp},${log.actor_email},${log.action},${log.resource_type},${log.status}`
    ).join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'audit-logs.csv'
    a.click()
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="logs" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="logs">
            <Shield className="h-4 w-4 mr-2" />
            Audit Logs
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <Activity className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Security Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4">
          {/* Search and Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Search & Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by email, action, or resource ID..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button variant="outline">
                  <Filter className="h-4 w-4 mr-2" />
                  Advanced
                </Button>
                <Button variant="outline" onClick={exportLogs}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Action Type</Label>
                  <Select value={filters.action} onValueChange={(v) => setFilters({...filters, action: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All actions</SelectItem>
                      <SelectItem value="auth">Authentication</SelectItem>
                      <SelectItem value="user">User Management</SelectItem>
                      <SelectItem value="refund">Financial</SelectItem>
                      <SelectItem value="ticket">Support</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Status</Label>
                  <Select value={filters.status} onValueChange={(v) => setFilters({...filters, status: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="failure">Failure</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Risk Level</Label>
                  <Select value={filters.risk_level} onValueChange={(v) => setFilters({...filters, risk_level: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="All levels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All levels</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Date Range</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Last 24 hours" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">Last 24 hours</SelectItem>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                      <SelectItem value="30d">Last 30 days</SelectItem>
                      <SelectItem value="custom">Custom range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logs Table */}
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>
                Complete audit trail of all administrative actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{log.actor_email}</p>
                          <p className="text-xs text-muted-foreground">{log.actor_role}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getActionIcon(log.action)}
                          <span className="font-mono text-sm">{log.action}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{log.resource_type}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {log.resource_id}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusIcon(log.status)}</TableCell>
                      <TableCell>{getRiskBadge(log.risk_level)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Events</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats?.total_events?.toLocaleString() || '0'}</p>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Unique Actors</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats?.unique_actors || 0}</p>
                <p className="text-xs text-muted-foreground">Active admins</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Failed Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">{stats?.failed_actions || 0}</p>
                <p className="text-xs text-muted-foreground">Requires review</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">High Risk</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-orange-600">{stats?.high_risk_events || 0}</p>
                <p className="text-xs text-muted-foreground">Events flagged</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity Patterns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats && stats.total_events > 0 ? (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Most Active User</p>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{stats.most_active_user || 'No data'}</span>
                      {stats.most_active_user !== 'N/A' && stats.most_active_user !== 'No data' && (
                        <Badge variant="outline">Admin</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Most Common Action</p>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{stats.most_common_action || 'No data'}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Activity Summary</p>
                    <div className="text-sm space-y-1">
                      <p>Total events: {stats.total_events}</p>
                      <p>Unique actors: {stats.unique_actors}</p>
                      <p>Failed actions: {stats.failed_actions}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">
                    No activity data available. Activity patterns will appear here as audit logs are generated.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {alertsLoading ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading security alerts...
                </div>
              </CardContent>
            </Card>
          ) : alerts.length > 0 ? (
            alerts.map((alert) => (
              <Alert 
                key={alert.id}
                className={cn(
                  alert.severity === 'critical' && 'border-red-200 dark:border-red-800',
                  alert.severity === 'high' && 'border-orange-200 dark:border-orange-800',
                  alert.severity === 'medium' && 'border-yellow-200 dark:border-yellow-800',
                  alert.severity === 'low' && 'border-blue-200 dark:border-blue-800'
                )}
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium mb-1">{alert.title}</p>
                      <p className="text-sm text-muted-foreground">{alert.description}</p>
                      {alert.metadata && (
                        <div className="mt-2 text-xs text-muted-foreground space-y-1">
                          {alert.metadata.ip_address && (
                            <p>IP: {alert.metadata.ip_address}</p>
                          )}
                          {alert.metadata.user_email && (
                            <p>User: {alert.metadata.user_email}</p>
                          )}
                          {alert.metadata.location && (
                            <p>Location: {alert.metadata.location}</p>
                          )}
                          {alert.metadata.attempt_count && (
                            <p>Attempts: {alert.metadata.attempt_count}</p>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <Badge 
                        variant={
                          alert.severity === 'critical' ? 'destructive' :
                          alert.severity === 'high' ? 'default' :
                          alert.severity === 'medium' ? 'secondary' :
                          'outline'
                        }
                      >
                        {alert.severity}
                      </Badge>
                      {alert.resolved && (
                        <Badge variant="outline" className="text-green-600">
                          Resolved
                        </Badge>
                      )}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            ))
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-center space-y-4">
                  <div className="p-3 bg-muted rounded-full">
                    <Shield className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-foreground">No Active Security Alerts</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md">
                      Security alerts will appear here when suspicious activity is detected. The system monitors for failed logins, unusual patterns, and new access locations.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>
              Complete information about this administrative action
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Timestamp</Label>
                  <p className="text-sm">{new Date(selectedLog.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <Label>Correlation ID</Label>
                  <p className="text-sm font-mono">{selectedLog.correlation_id}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Actor</Label>
                  <p className="text-sm">{selectedLog.actor_email}</p>
                  <p className="text-xs text-muted-foreground">{selectedLog.actor_role}</p>
                </div>
                <div>
                  <Label>IP Address</Label>
                  <p className="text-sm font-mono">{selectedLog.ip_address}</p>
                </div>
              </div>

              <div>
                <Label>Action Details</Label>
                <pre className="text-sm bg-muted p-3 rounded-lg overflow-auto">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>

              <div>
                <Label>User Agent</Label>
                <p className="text-sm text-muted-foreground">{selectedLog.user_agent}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}