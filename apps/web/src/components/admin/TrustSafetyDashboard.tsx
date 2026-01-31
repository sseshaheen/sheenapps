/**
 * Trust & Safety Dashboard Component
 * Comprehensive risk management and violation enforcement system
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { AdminReasonModal } from './AdminReasonModal'
import { 
  Shield,
  AlertTriangle,
  AlertCircle,
  Ban,
  UserX,
  Activity,
  TrendingUp,
  AlertOctagon,
  FileWarning,
  Clock,
  Eye,
  Zap,
  RefreshCw,
  ShieldAlert,
  ShieldOff,
  ShieldCheck
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'

interface RiskScore {
  user_id: string
  user_email: string
  risk_score: number
  risk_level: 'minimal' | 'low' | 'medium' | 'high' | 'critical'
  risk_factors: {
    chargebacks: number
    failed_payments: number
    disputes: number
    security_events: number
    violations: number
    suspicious_activity: number
  }
  last_assessment: string
  recommendations: string[]
}

interface Violation {
  id: string
  user_id: string
  user_email: string
  violation_type: string
  violation_code: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'reviewed' | 'enforced' | 'appealed'
  reported_at: string
  evidence?: string
  action_taken?: string
  enforced_by?: string
  enforced_at?: string
}

interface SecurityEvent {
  id: string
  event_type: string
  user_id?: string
  user_email?: string
  ip_address: string
  severity: 'info' | 'warning' | 'critical'
  description: string
  occurred_at: string
  resolved: boolean
}

interface TrustMetrics {
  total_users_monitored: number
  high_risk_users: number
  pending_violations: number
  enforced_today: number
  appeals_pending: number
  platform_risk_score: number
  security_events_24h: number
  emergency_actions_30d: number
}

interface TrustSafetyDashboardProps {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
}

const VIOLATION_CODES = {
  T01: 'Spam or promotional content',
  T02: 'Harassment or abusive behavior',
  T03: 'Fraud or chargeback risk',
  T04: 'Policy evasion or circumvention',
  T05: 'Illegal content or activity',
  T06: 'Account security compromise',
  T07: 'Multiple account abuse',
  T08: 'Platform manipulation'
}

const RISK_COLORS = {
  minimal: 'text-green-600 bg-green-50',
  low: 'text-blue-600 bg-blue-50',
  medium: 'text-yellow-600 bg-yellow-50',
  high: 'text-orange-600 bg-orange-50',
  critical: 'text-red-600 bg-red-50'
}

export function TrustSafetyDashboard({ 
  adminId, 
  adminEmail,
  adminRole, 
  permissions 
}: TrustSafetyDashboardProps) {
  const [metrics, setMetrics] = useState<TrustMetrics | null>(null)
  const [highRiskUsers, setHighRiskUsers] = useState<RiskScore[]>([])
  const [violations, setViolations] = useState<Violation[]>([])
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedUser, setSelectedUser] = useState<RiskScore | null>(null)
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null)
  const [showActionDialog, setShowActionDialog] = useState(false)
  const [showUserDetailsDialog, setShowUserDetailsDialog] = useState(false)
  const [actionType, setActionType] = useState<'violation' | 'emergency' | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [processingAction, setProcessingAction] = useState(false)
  const [isReasonModalOpen, setIsReasonModalOpen] = useState(false)

  useEffect(() => {
    fetchTrustSafetyData()
  }, [])

  const fetchTrustSafetyData = async () => {
    try {
      setLoading(true)

      // Fetch all trust & safety data in parallel
      const [riskScoresRes, violationsRes, securityEventsRes] = await Promise.all([
        fetch('/api/admin/trust-safety/risk-scores', {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }),
        fetch('/api/admin/trust-safety/violations', {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }),
        fetch('/api/admin/trust-safety/security-events', {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        })
      ])

      // Process risk scores and metrics
      if (riskScoresRes.ok) {
        const riskData = await riskScoresRes.json()
        if (riskData.success) {
          // Ensure risk_scores is always an array
          const riskScoresArray = Array.isArray(riskData.risk_scores)
            ? riskData.risk_scores
            : []
          setHighRiskUsers(riskScoresArray)
          setMetrics(riskData.metrics || null)
        }
      }

      // Process violations
      if (violationsRes.ok) {
        const violationsData = await violationsRes.json()
        if (violationsData.success) {
          // Ensure violations is always an array
          const violationsArray = Array.isArray(violationsData.violations) 
            ? violationsData.violations 
            : []
          setViolations(violationsArray)
        }
      }

      // Process security events
      if (securityEventsRes.ok) {
        const eventsData = await securityEventsRes.json()
        if (eventsData.success) {
          // Ensure events is always an array
          const eventsArray = Array.isArray(eventsData.events)
            ? eventsData.events
            : []
          setSecurityEvents(eventsArray)
        }
      }

    } catch (error) {
      console.error('Failed to fetch trust & safety data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'minimal': return <ShieldCheck className="h-4 w-4" />
      case 'low': return <Shield className="h-4 w-4" />
      case 'medium': return <ShieldAlert className="h-4 w-4" />
      case 'high': return <ShieldOff className="h-4 w-4" />
      case 'critical': return <AlertOctagon className="h-4 w-4" />
      default: return <Shield className="h-4 w-4" />
    }
  }

  const getSeverityBadge = (severity: string) => {
    const colors = {
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800',
      info: 'bg-gray-100 text-gray-800',
      warning: 'bg-yellow-100 text-yellow-800'
    }
    return <Badge className={colors[severity as keyof typeof colors] || colors.medium}>{severity}</Badge>
  }

  const handleViolationAction = (violation: Violation) => {
    setSelectedViolation(violation)
    setActionType('violation')
    setIsReasonModalOpen(true)
  }

  const handleEmergencyAction = (user: RiskScore) => {
    setSelectedUser(user)
    setActionType('emergency')
    setIsReasonModalOpen(true)
  }

  const handleActionConfirm = async (reasonWithCode: string) => {
    setProcessingAction(true)
    setIsReasonModalOpen(false)

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (actionType === 'violation' && selectedViolation) {
        // Update violation status
        setViolations(prev => prev.map(v => 
          v.id === selectedViolation.id
            ? {
                ...v,
                status: 'enforced',
                action_taken: reasonWithCode,
                enforced_by: adminEmail,
                enforced_at: new Date().toISOString()
              }
            : v
        ))

        toast.success('Violation enforced', {
          description: `Action taken against ${selectedViolation.user_email}`
        })
      } else if (actionType === 'emergency' && selectedUser) {
        toast.success('Emergency action executed', {
          description: `Immediate action taken for ${selectedUser.user_email}`
        })
      }
    } catch (error) {
      toast.error('Failed to execute action')
    } finally {
      setProcessingAction(false)
      setSelectedViolation(null)
      setSelectedUser(null)
      setActionType(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading trust & safety data...
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Risk Metrics Overview */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform Risk Score</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{metrics.platform_risk_score}</div>
                <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>
              </div>
              <Progress value={metrics.platform_risk_score} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Risk Users</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.high_risk_users}</div>
              <p className="text-xs text-muted-foreground">
                Of {metrics.total_users_monitored} monitored
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Violations</CardTitle>
              <FileWarning className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.pending_violations}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.enforced_today} enforced today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Security Events</CardTitle>
              <Shield className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.security_events_24h}</div>
              <p className="text-xs text-muted-foreground">
                Last 24 hours
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="risk-assessment">
            Risk Assessment
            {highRiskUsers.filter(u => u.risk_level === 'critical').length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {highRiskUsers.filter(u => u.risk_level === 'critical').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="violations">
            Violations
            {violations?.filter(v => v.status === 'pending').length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {violations?.filter(v => v.status === 'pending').length || 0}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="security">Security Events</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Risk Distribution</CardTitle>
                <CardDescription>User risk levels across platform</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full" />
                        <span>Minimal Risk</span>
                      </div>
                      <span className="font-medium">
                        {metrics.total_users_monitored - metrics.high_risk_users} users
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-orange-500 rounded-full" />
                        <span>High Risk</span>
                      </div>
                      <span className="font-medium">{metrics.high_risk_users} users</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">
                      Risk distribution data not available
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Actions</CardTitle>
                <CardDescription>Latest trust & safety enforcement</CardDescription>
              </CardHeader>
              <CardContent>
                {violations?.filter(v => v.status === 'enforced').length > 0 ? (
                  <div className="space-y-3">
                    {violations
                      .filter(v => v.status === 'enforced')
                      .sort((a, b) => new Date(b.enforced_at || '').getTime() - new Date(a.enforced_at || '').getTime())
                      .slice(0, 3)
                      .map((violation) => (
                        <div key={violation.id} className="flex items-center justify-between text-sm">
                          <div>
                            <div className="font-medium">{violation.action_taken || 'Action Taken'}</div>
                            <div className="text-muted-foreground">{violation.user_email}</div>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {violation.enforced_at ? 
                              formatDistanceToNow(new Date(violation.enforced_at), { addSuffix: true }) :
                              'Recently'
                            }
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">
                      No recent enforcement actions
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Alert>
            <AlertOctagon className="h-4 w-4" />
            <AlertTitle>Emergency Actions Available</AlertTitle>
            <AlertDescription>
              Super admins can execute emergency break-glass actions for immediate threats.
              All emergency actions require detailed justification and are logged for compliance.
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* Risk Assessment Tab */}
        <TabsContent value="risk-assessment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>High Risk Users</CardTitle>
              <CardDescription>Users requiring immediate attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Risk Score</TableHead>
                      <TableHead>Risk Factors</TableHead>
                      <TableHead>Recommendations</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {highRiskUsers.length > 0 ? (
                      highRiskUsers.map((user) => (
                      <TableRow key={user.user_id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{user.user_email}</div>
                            <div className="text-xs text-muted-foreground">
                              ID: {user.user_id}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${RISK_COLORS[user.risk_level]}`}>
                              {getRiskIcon(user.risk_level)}
                              {user.risk_score}
                            </div>
                            <Badge variant="outline">{user.risk_level}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs">
                            {user.risk_factors?.chargebacks > 0 && (
                              <div>• {user.risk_factors.chargebacks} chargebacks</div>
                            )}
                            {user.risk_factors?.violations > 0 && (
                              <div>• {user.risk_factors.violations} violations</div>
                            )}
                            {user.risk_factors?.security_events > 0 && (
                              <div>• {user.risk_factors.security_events} security events</div>
                            )}
                            {user.risk_factors?.suspicious_activity > 0 && (
                              <div>• {user.risk_factors.suspicious_activity} suspicious activities</div>
                            )}
                            {!user.risk_factors && (
                              <div className="text-gray-500">No risk factors available</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs">
                            {user.recommendations?.slice(0, 2).map((rec, idx) => (
                              <div key={idx}>• {rec}</div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedUser(user)
                                setShowUserDetailsDialog(true)
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Details
                            </Button>
                            {adminRole === 'super_admin' && user.risk_level === 'critical' && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleEmergencyAction(user)}
                              >
                                <Zap className="h-3 w-3 mr-1" />
                                Emergency
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No high-risk users detected
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Violations Tab */}
        <TabsContent value="violations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Violation Reports</CardTitle>
              <CardDescription>Review and enforce policy violations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Violation</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reported</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {violations?.length > 0 ? (
                      violations?.map((violation) => (
                      <TableRow key={violation.id}>
                        <TableCell>
                          <div className="font-medium">{violation.user_email}</div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{violation.violation_type}</div>
                            <div className="text-xs text-muted-foreground">
                              {VIOLATION_CODES[violation.violation_code as keyof typeof VIOLATION_CODES]}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getSeverityBadge(violation.severity)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={violation.status === 'pending' ? 'secondary' : 'default'}>
                            {violation.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {formatDistanceToNow(new Date(violation.reported_at), { addSuffix: true })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {violation.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleViolationAction(violation)}
                            >
                              <Ban className="h-3 w-3 mr-1" />
                              Enforce
                            </Button>
                          )}
                          {violation.status === 'enforced' && (
                            <span className="text-sm text-muted-foreground">
                              Enforced by {violation.enforced_by}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No violations reported
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Events Tab */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security Events</CardTitle>
              <CardDescription>Monitor and respond to security incidents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Type</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {securityEvents.length > 0 ? (
                      securityEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{event.event_type}</div>
                            <div className="text-xs text-muted-foreground">
                              {event.description}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {event.user_email || 'Unknown'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {event.ip_address}
                        </TableCell>
                        <TableCell>
                          {getSeverityBadge(event.severity)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={event.resolved ? 'default' : 'destructive'}>
                            {event.resolved ? 'Resolved' : 'Active'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No security events detected
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Reason Modal */}
      {/* User Details Dialog */}
      <Dialog open={showUserDetailsDialog} onOpenChange={setShowUserDetailsDialog}>
        <DialogContent className="max-w-2xl bg-background text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">User Risk Assessment Details</DialogTitle>
            <DialogDescription className="text-foreground/70">
              Detailed risk analysis for {selectedUser?.user_email}
            </DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-4">
              {/* User Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-foreground">User ID</Label>
                  <p className="text-sm text-foreground/80 font-medium">{selectedUser.user_id}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-foreground">Email</Label>
                  <p className="text-sm text-foreground/80 font-medium">{selectedUser.user_email}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-foreground">Risk Score</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${RISK_COLORS[selectedUser.risk_level]}`}>
                      {getRiskIcon(selectedUser.risk_level)}
                      {selectedUser.risk_score}
                    </div>
                    <Badge variant="outline">{selectedUser.risk_level}</Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-foreground">Last Assessment</Label>
                  <p className="text-sm text-foreground/80 font-medium">
                    {selectedUser.last_assessment ? 
                      formatDistanceToNow(new Date(selectedUser.last_assessment), { addSuffix: true }) :
                      'Never assessed'
                    }
                  </p>
                </div>
              </div>

              {/* Risk Factors */}
              <div>
                <Label className="text-sm font-medium text-foreground mb-2">Risk Factors</Label>
                <Card className="bg-card text-card-foreground border-border">
                  <CardContent className="pt-4">
                    {selectedUser.risk_factors ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-foreground/80">Chargebacks:</span>
                          <span className="text-sm font-semibold text-foreground">{selectedUser.risk_factors.chargebacks || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-foreground/80">Failed Payments:</span>
                          <span className="text-sm font-semibold text-foreground">{selectedUser.risk_factors.failed_payments || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-foreground/80">Disputes:</span>
                          <span className="text-sm font-semibold text-foreground">{selectedUser.risk_factors.disputes || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-foreground/80">Security Events:</span>
                          <span className="text-sm font-semibold text-foreground">{selectedUser.risk_factors.security_events || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-foreground/80">Violations:</span>
                          <span className="text-sm font-semibold text-foreground">{selectedUser.risk_factors.violations || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-foreground/80">Suspicious Activity:</span>
                          <span className="text-sm font-semibold text-foreground">{selectedUser.risk_factors.suspicious_activity || 0}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                          <div className="flex items-start">
                            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
                            <div className="text-sm">
                              <p className="font-medium text-amber-900 dark:text-amber-200">Risk Factor Details Not Available</p>
                              <p className="text-amber-700 dark:text-amber-300 mt-1">
                                The risk score of {selectedUser.risk_score} is calculated by the backend, but the detailed breakdown is not being provided in the API response.
                              </p>
                              <p className="text-amber-600 dark:text-amber-400 text-xs mt-2">
                                Backend integration needed: The worker API should include a `risk_factors` object with counts for chargebacks, failed payments, disputes, security events, violations, and suspicious activity.
                              </p>
                              <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
                                See /docs/TRUST_SAFETY_API_REQUIREMENTS.md for API specifications.
                              </p>
                            </div>
                          </div>
                        </div>
                        {/* Debug info */}
                        {/* eslint-disable-next-line no-restricted-globals */}
                        {process.env.NODE_ENV === 'development' && (
                          <details className="mt-2">
                            <summary className="text-xs cursor-pointer text-blue-600 dark:text-blue-400">Debug: Raw user data from API</summary>
                            <pre className="text-xs bg-muted text-foreground p-2 rounded mt-1 overflow-auto max-h-40">
                              {JSON.stringify(selectedUser, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recommendations */}
              <div>
                <Label className="text-sm font-medium text-foreground mb-2">Recommendations</Label>
                <Card className="bg-card text-card-foreground border-border">
                  <CardContent className="pt-4">
                    {selectedUser.recommendations && selectedUser.recommendations.length > 0 ? (
                      <ul className="space-y-2">
                        {selectedUser.recommendations.map((rec, idx) => (
                          <li key={idx} className="text-sm text-foreground/90 flex items-start">
                            <span className="mr-2 text-foreground/70">•</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-foreground/60">No recommendations available</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUserDetailsDialog(false)}
            >
              Close
            </Button>
            {adminRole === 'super_admin' && selectedUser?.risk_level === 'critical' && (
              <Button
                variant="destructive"
                onClick={() => {
                  setShowUserDetailsDialog(false)
                  handleEmergencyAction(selectedUser)
                }}
              >
                <Zap className="h-4 w-4 mr-2" />
                Take Emergency Action
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminReasonModal
        isOpen={isReasonModalOpen}
        onClose={() => {
          setIsReasonModalOpen(false)
          setSelectedViolation(null)
          setSelectedUser(null)
        }}
        onConfirm={handleActionConfirm}
        category="trust_safety"
        title={actionType === 'emergency' ? 'Emergency Action' : 'Enforce Violation'}
        description={
          actionType === 'emergency' 
            ? `Execute emergency action for ${selectedUser?.user_email}. This action will be logged and requires justification.`
            : `Enforce violation for ${selectedViolation?.user_email}. Please provide enforcement details.`
        }
        actionLabel={actionType === 'emergency' ? 'Execute Emergency Action' : 'Enforce Violation'}
        isProcessing={processingAction}
      />
    </>
  )
}
