/**
 * Customer Health Dashboard Component
 * Displays health score summary, at-risk customers, and score changes
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Minus,
  MessageSquare,
  Phone,
  RefreshCw,
  Tag,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'

// Types
type HealthStatus = 'healthy' | 'monitor' | 'at_risk' | 'critical' | 'onboarding'

interface HealthSummary {
  healthy: number
  monitor: number
  atRisk: number
  critical: number
  onboarding: number
  total: number
}

interface AtRiskCustomer {
  userId: string
  email: string
  score: number
  status: HealthStatus
  trend: 'up' | 'down' | 'stable'
  topReason: string
  subscriptionPlan?: string
  renewalDate?: string
  daysUntilRenewal?: number
  tags: string[]
}

interface ScoreChange {
  userId: string
  email: string
  previousScore: number
  currentScore: number
  change: number
  topReason: string
  changedAt: string
}

interface WorkerStatus {
  running: boolean
  lastRun: string | null
  lastDuration: number | null
  lastStats: {
    total: number
    success: number
    failed: number
    skipped: number
  } | null
  consecutiveErrors: number
  scheduled: boolean
}

interface CustomerHealthDashboardProps {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
}

// Status configuration
const statusConfig: Record<HealthStatus, { label: string; color: string; bgColor: string; icon: any }> = {
  healthy: { label: 'Healthy', color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle2 },
  monitor: { label: 'Monitor', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Eye },
  at_risk: { label: 'At Risk', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: AlertCircle },
  critical: { label: 'Critical', color: 'text-red-600', bgColor: 'bg-red-100', icon: AlertCircle },
  onboarding: { label: 'Onboarding', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: User },
}

export function CustomerHealthDashboard({
  adminId,
  adminEmail,
  adminRole,
  permissions,
}: CustomerHealthDashboardProps) {
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [atRiskCustomers, setAtRiskCustomers] = useState<AtRiskCustomer[]>([])
  const [droppedScores, setDroppedScores] = useState<ScoreChange[]>([])
  const [recoveredScores, setRecoveredScores] = useState<ScoreChange[]>([])
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'at-risk' | 'dropped' | 'recovered'>('at-risk')

  // Filters
  const [renewalFilter, setRenewalFilter] = useState<string>('')
  const [tagFilter, setTagFilter] = useState<string>('')

  // Dialog states
  const [selectedCustomer, setSelectedCustomer] = useState<AtRiskCustomer | null>(null)
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false)
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false)
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [contactSummary, setContactSummary] = useState('')
  const [contactType, setContactType] = useState<'email' | 'call' | 'meeting' | 'chat' | 'other'>('email')
  const [newTag, setNewTag] = useState('')

  const canWrite = permissions.includes('customer_health.write') || adminRole === 'super_admin'

  // Fetch all dashboard data in a single call
  const fetchDashboardData = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/customer-health/dashboard', {
        cache: 'no-store',
        credentials: 'include',
      })

      if (response.ok) {
        const result = await response.json()
        if (result.summary) setSummary(result.summary)
        if (result.atRisk) setAtRiskCustomers(result.atRisk)
        if (result.changes?.dropped) setDroppedScores(result.changes.dropped)
        if (result.changes?.recovered) setRecoveredScores(result.changes.recovered)
        if (result.workerStatus) setWorkerStatus(result.workerStatus)
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }
  }, [])

  // Fetch at-risk customers with filters (separate call when filters change)
  const fetchAtRiskCustomers = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (renewalFilter) params.set('renewalDays', renewalFilter)
      if (tagFilter) params.set('tag', tagFilter)

      const response = await fetch(`/api/admin/customer-health/at-risk?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'include',
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setAtRiskCustomers(result.data.customers)
        }
      }
    } catch (error) {
      console.error('Error fetching at-risk customers:', error)
    }
  }, [renewalFilter, tagFilter])

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await fetchDashboardData()
      setIsLoading(false)
    }
    loadData()
  }, [fetchDashboardData])

  // Reload when filters change
  useEffect(() => {
    if (renewalFilter || tagFilter) {
      fetchAtRiskCustomers()
    } else {
      fetchDashboardData()
    }
  }, [renewalFilter, tagFilter, fetchAtRiskCustomers, fetchDashboardData])

  // Force worker run
  const handleForceRun = async () => {
    try {
      const response = await fetch('/api/admin/customer-health/worker/force-run', {
        method: 'POST',
        credentials: 'include',
      })

      if (response.ok) {
        toast.success('Health score calculation triggered')
        setTimeout(fetchDashboardData, 3000)
      }
    } catch (error) {
      toast.error('Failed to trigger calculation')
    }
  }

  // Export CSV
  const handleExport = async () => {
    try {
      const response = await fetch('/api/admin/customer-health/export?format=csv', {
        credentials: 'include',
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `customer-health-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      toast.error('Failed to export data')
    }
  }

  // Add note
  const handleAddNote = async () => {
    if (!selectedCustomer || !noteText.trim()) return

    try {
      const response = await fetch(`/api/admin/customer-health/user/${selectedCustomer.userId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: noteText, adminId }),
      })

      if (response.ok) {
        toast.success('Note added')
        setIsNoteDialogOpen(false)
        setNoteText('')
      }
    } catch (error) {
      toast.error('Failed to add note')
    }
  }

  // Log contact
  const handleLogContact = async () => {
    if (!selectedCustomer || !contactSummary.trim()) return

    try {
      const response = await fetch(`/api/admin/customer-health/user/${selectedCustomer.userId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contactType, summary: contactSummary, adminId }),
      })

      if (response.ok) {
        toast.success('Contact logged')
        setIsContactDialogOpen(false)
        setContactSummary('')
      }
    } catch (error) {
      toast.error('Failed to log contact')
    }
  }

  // Add tag
  const handleAddTag = async () => {
    if (!selectedCustomer || !newTag.trim()) return

    try {
      const response = await fetch(`/api/admin/customer-health/user/${selectedCustomer.userId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tag: newTag.trim(), adminId }),
      })

      if (response.ok) {
        toast.success('Tag added')
        setIsTagDialogOpen(false)
        setNewTag('')
        fetchAtRiskCustomers()
      }
    } catch (error) {
      toast.error('Failed to add tag')
    }
  }

  // Get trend icon
  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />
    return <Minus className="h-4 w-4 text-gray-400" />
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
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {summary && (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Healthy</p>
                    <p className="text-2xl font-bold text-green-600">{summary.healthy}</p>
                    <p className="text-xs text-muted-foreground">
                      {summary.total > 0 ? Math.round((summary.healthy / summary.total) * 100) : 0}%
                    </p>
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-green-200" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Monitor</p>
                    <p className="text-2xl font-bold text-yellow-600">{summary.monitor}</p>
                    <p className="text-xs text-muted-foreground">
                      {summary.total > 0 ? Math.round((summary.monitor / summary.total) * 100) : 0}%
                    </p>
                  </div>
                  <Eye className="h-8 w-8 text-yellow-200" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">At Risk</p>
                    <p className="text-2xl font-bold text-orange-600">{summary.atRisk}</p>
                    <p className="text-xs text-muted-foreground">
                      {summary.total > 0 ? Math.round((summary.atRisk / summary.total) * 100) : 0}%
                    </p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-orange-200" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Critical</p>
                    <p className="text-2xl font-bold text-red-600">{summary.critical}</p>
                    <p className="text-xs text-muted-foreground">
                      {summary.total > 0 ? Math.round((summary.critical / summary.total) * 100) : 0}%
                    </p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-red-200" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Onboarding</p>
                    <p className="text-2xl font-bold text-blue-600">{summary.onboarding}</p>
                    <p className="text-xs text-muted-foreground">
                      {summary.total > 0 ? Math.round((summary.onboarding / summary.total) * 100) : 0}%
                    </p>
                  </div>
                  <User className="h-8 w-8 text-blue-200" />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Worker Status & Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {workerStatus && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${workerStatus.scheduled ? 'bg-green-500' : 'bg-gray-400'}`} />
              {workerStatus.lastRun && (
                <span>Last run: {formatDistanceToNow(new Date(workerStatus.lastRun), { addSuffix: true })}</span>
              )}
              {workerStatus.lastStats && (
                <Badge variant="outline" className="text-xs">
                  {workerStatus.lastStats.success} calculated
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <Button variant="outline" size="sm" onClick={handleForceRun}>
              <Zap className="h-4 w-4 mr-2" />
              Recalculate All
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="at-risk">
            <AlertCircle className="h-4 w-4 mr-2" />
            At Risk ({atRiskCustomers.length})
          </TabsTrigger>
          <TabsTrigger value="dropped">
            <ArrowDown className="h-4 w-4 mr-2" />
            Dropped ({droppedScores.length})
          </TabsTrigger>
          <TabsTrigger value="recovered">
            <ArrowUp className="h-4 w-4 mr-2" />
            Recovered ({recoveredScores.length})
          </TabsTrigger>
        </TabsList>

        {/* At Risk Tab */}
        <TabsContent value="at-risk">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>At-Risk Customers</CardTitle>
                  <CardDescription>Customers with health score below 60</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={renewalFilter} onValueChange={setRenewalFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Renewal window" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Filter by tag"
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="w-[150px]"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {atRiskCustomers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  No at-risk customers
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Trend</TableHead>
                      <TableHead>Renewal</TableHead>
                      <TableHead>Top Reason</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atRiskCustomers.map((customer) => {
                      const statConfig = statusConfig[customer.status]
                      return (
                        <TableRow key={customer.userId}>
                          <TableCell>
                            <div className="font-medium">{customer.email}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {customer.userId.slice(0, 8)}...
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xl font-bold">{customer.score}</div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${statConfig.bgColor} ${statConfig.color}`}>
                              {statConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell>{getTrendIcon(customer.trend)}</TableCell>
                          <TableCell>
                            {customer.daysUntilRenewal !== undefined ? (
                              <div>
                                <div className="font-medium">{customer.daysUntilRenewal} days</div>
                                <div className="text-xs text-muted-foreground">{customer.subscriptionPlan}</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{customer.topReason}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {customer.tags.slice(0, 2).map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                              {customer.tags.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{customer.tags.length - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {canWrite && (
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedCustomer(customer)
                                    setIsNoteDialogOpen(true)
                                  }}
                                  title="Add Note"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedCustomer(customer)
                                    setIsContactDialogOpen(true)
                                  }}
                                  title="Log Contact"
                                >
                                  <Phone className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedCustomer(customer)
                                    setIsTagDialogOpen(true)
                                  }}
                                  title="Add Tag"
                                >
                                  <Tag className="h-4 w-4" />
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
        </TabsContent>

        {/* Dropped Scores Tab */}
        <TabsContent value="dropped">
          <Card>
            <CardHeader>
              <CardTitle>Score Drops (Last 7 Days)</CardTitle>
              <CardDescription>Customers whose score dropped 20+ points</CardDescription>
            </CardHeader>
            <CardContent>
              {droppedScores.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No significant score drops</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Previous</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {droppedScores.map((change) => (
                      <TableRow key={change.userId}>
                        <TableCell>
                          <div className="font-medium">{change.email}</div>
                        </TableCell>
                        <TableCell>{change.previousScore}</TableCell>
                        <TableCell>{change.currentScore}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">{change.change}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[250px] truncate">{change.topReason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recovered Scores Tab */}
        <TabsContent value="recovered">
          <Card>
            <CardHeader>
              <CardTitle>Score Recoveries (Last 7 Days)</CardTitle>
              <CardDescription>Customers whose score improved 20+ points</CardDescription>
            </CardHeader>
            <CardContent>
              {recoveredScores.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No significant recoveries</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Previous</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recoveredScores.map((change) => (
                      <TableRow key={change.userId}>
                        <TableCell>
                          <div className="font-medium">{change.email}</div>
                        </TableCell>
                        <TableCell>{change.previousScore}</TableCell>
                        <TableCell>{change.currentScore}</TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-600">+{change.change}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[250px] truncate">{change.topReason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Note Dialog */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>Add an internal note about {selectedCustomer?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Enter your note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddNote}>Add Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Contact Dialog */}
      <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Contact</DialogTitle>
            <DialogDescription>Record a contact with {selectedCustomer?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Contact Type</Label>
              <Select value={contactType} onValueChange={(v) => setContactType(v as typeof contactType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="call">Phone Call</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Summary</Label>
              <Textarea
                placeholder="Brief summary of the contact..."
                value={contactSummary}
                onChange={(e) => setContactSummary(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogContact}>Log Contact</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Tag Dialog */}
      <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tag</DialogTitle>
            <DialogDescription>Add a tag to {selectedCustomer?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tag</Label>
              <Input
                placeholder="e.g., VIP, High-touch, Enterprise"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
              />
            </div>
            {selectedCustomer && selectedCustomer.tags.length > 0 && (
              <div>
                <Label>Existing Tags</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedCustomer.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTagDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTag}>Add Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
