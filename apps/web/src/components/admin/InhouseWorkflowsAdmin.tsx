/**
 * In-House Workflows Admin Dashboard
 *
 * Monitor and manage workflow runs across all projects.
 * Part of Run Hub admin visibility.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { RefreshCw, AlertTriangle, RotateCw, XCircle, Eye, TrendingUp, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'

interface WorkflowRun {
  id: string
  projectId: string
  projectName?: string
  actionId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  idempotencyKey?: string
  requestedAt: string
  startedAt?: string
  completedAt?: string
  leaseExpiresAt?: string
  attempts: number
  maxAttempts: number
  params?: Record<string, unknown>
  result?: {
    totalRecipients: number
    successful: number
    failed: number
  }
  outcome?: {
    model: string
    windowHours: number
    conversions: number
    revenueCents: number
    currency: string
    confidence: 'high' | 'medium' | 'low'
    matchedBy: string
  }
  error?: string
}

interface WorkflowSend {
  id: string
  projectId: string
  projectName?: string
  runId: string
  actionId: string
  recipientEmail: string
  status: 'sent' | 'failed'
  sentAt: string
  error?: string
}

interface StuckRun {
  id: string
  projectId: string
  projectName?: string
  actionId: string
  requestedAt: string
  leaseExpiresAt: string
  attempts: number
}

const ACTION_LABELS: Record<string, string> = {
  recover_abandoned: 'Recover Abandoned',
  send_promo: 'Send Promo',
  post_update: 'Post Update',
  onboard_users: 'Onboard Users',
  follow_up_orders: 'Follow Up Orders',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  queued: 'secondary',
  running: 'outline',
  succeeded: 'default',
  failed: 'destructive',
}

export function InhouseWorkflowsAdmin() {
  // Filters
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('all')
  const [actionId, setActionId] = useState('all')

  // Data
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [stuckRuns, setStuckRuns] = useState<StuckRun[]>([])
  const [sends, setSends] = useState<WorkflowSend[]>([])
  const [loading, setLoading] = useState(true)
  const [stuckLoading, setStuckLoading] = useState(false)
  const [sendsLoading, setSendsLoading] = useState(false)

  // Detail modal
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Sends filter
  const [sendsEmail, setSendsEmail] = useState('')

  const abortRef = useRef<AbortController | null>(null)

  const fetchRuns = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (projectId) params.set('projectId', projectId)
      if (status !== 'all') params.set('status', status)
      if (actionId !== 'all') params.set('actionId', actionId)

      const response = await fetch(`/api/admin/inhouse/workflow-runs?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch workflow runs')

      const data = await response.json()
      setRuns(data.data?.runs || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch workflow runs:', error)
        toast.error('Failed to load workflow runs')
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, status, actionId])

  const fetchStuckRuns = useCallback(async () => {
    setStuckLoading(true)
    try {
      const params = new URLSearchParams()
      if (projectId) params.set('projectId', projectId)

      const response = await fetch(`/api/admin/inhouse/workflow-runs/stuck?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch stuck runs')

      const data = await response.json()
      setStuckRuns(data.data?.runs || [])
    } catch (error) {
      console.error('Failed to fetch stuck runs:', error)
    } finally {
      setStuckLoading(false)
    }
  }, [projectId])

  const fetchSends = useCallback(async () => {
    setSendsLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (projectId) params.set('projectId', projectId)
      if (sendsEmail) params.set('email', sendsEmail)

      const response = await fetch(`/api/admin/inhouse/workflow-sends?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch workflow sends')

      const data = await response.json()
      setSends(data.data?.sends || [])
    } catch (error) {
      console.error('Failed to fetch workflow sends:', error)
      toast.error('Failed to load workflow sends')
    } finally {
      setSendsLoading(false)
    }
  }, [projectId, sendsEmail])

  useEffect(() => {
    fetchRuns()
    fetchStuckRuns()
    return () => abortRef.current?.abort()
  }, [fetchRuns, fetchStuckRuns])

  const handleRetry = async (runId: string) => {
    const reason = window.prompt('Reason for retry (required):')
    if (!reason) return

    try {
      const response = await fetch(`/api/admin/inhouse/workflow-runs/${runId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!response.ok) throw new Error('Failed to retry workflow')
      toast.success('Workflow retry initiated')
      fetchRuns()
      fetchStuckRuns()
    } catch (error) {
      console.error('Failed to retry workflow:', error)
      toast.error('Failed to retry workflow')
    }
  }

  const handleCancel = async (runId: string) => {
    const reason = window.prompt('Reason for cancellation (required):')
    if (!reason) return

    try {
      const response = await fetch(`/api/admin/inhouse/workflow-runs/${runId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!response.ok) throw new Error('Failed to cancel workflow')
      toast.success('Workflow cancelled')
      fetchRuns()
      fetchStuckRuns()
    } catch (error) {
      console.error('Failed to cancel workflow:', error)
      toast.error('Failed to cancel workflow')
    }
  }

  const handleViewDetails = (run: WorkflowRun) => {
    setSelectedRun(run)
    setDetailOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow Runs</CardTitle>
          <CardDescription>Monitor and manage workflow executions across projects</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Project ID (optional)"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-[260px]"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="succeeded">Succeeded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actionId} onValueChange={setActionId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="recover_abandoned">Recover Abandoned</SelectItem>
              <SelectItem value="send_promo">Send Promo</SelectItem>
              <SelectItem value="onboard_users">Onboard Users</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { fetchRuns(); fetchStuckRuns() }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Stuck Workflows Alert */}
      {stuckRuns.length > 0 && (
        <Card className="border-amber-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Stuck Workflows ({stuckRuns.length})
            </CardTitle>
            <CardDescription>
              Workflows running longer than expected with expired leases
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Lease Expired</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stuckRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div className="font-medium">{run.projectName || run.projectId}</div>
                      <div className="text-xs text-muted-foreground">{run.projectId}</div>
                    </TableCell>
                    <TableCell>{ACTION_LABELS[run.actionId] || run.actionId}</TableCell>
                    <TableCell>{formatDistanceToNow(new Date(run.requestedAt), { addSuffix: true })}</TableCell>
                    <TableCell className="text-amber-600">
                      {formatDistanceToNow(new Date(run.leaseExpiresAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>{run.attempts}</TableCell>
                    <TableCell className="space-x-2">
                      <Button size="sm" variant="outline" onClick={() => handleRetry(run.id)}>
                        <RotateCw className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleCancel(run.id)}>
                        <XCircle className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Workflow Runs</TabsTrigger>
          <TabsTrigger value="sends">Email Sends</TabsTrigger>
        </TabsList>

        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle>Recent Runs</CardTitle>
              <CardDescription>Showing latest 50 workflow runs</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : runs.length === 0 ? (
                <div className="text-sm text-muted-foreground">No workflow runs found</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell>
                          <div className="font-medium">{run.projectName || run.projectId}</div>
                          <div className="text-xs text-muted-foreground">{run.projectId.slice(0, 8)}...</div>
                        </TableCell>
                        <TableCell>{ACTION_LABELS[run.actionId] || run.actionId}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[run.status] || 'outline'}>
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {run.result ? (
                            <span className="text-sm">
                              {run.result.successful}/{run.result.totalRecipients}
                              {run.result.failed > 0 && (
                                <span className="text-red-500 ml-1">({run.result.failed} failed)</span>
                              )}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {run.outcome && run.outcome.conversions > 0 ? (
                            <span className="flex items-center gap-1 text-emerald-600 text-sm">
                              <TrendingUp className="h-3 w-3" />
                              {run.outcome.currency} {(run.outcome.revenueCents / 100).toFixed(0)}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{format(new Date(run.requestedAt), 'PPp')}</TableCell>
                        <TableCell className="space-x-2">
                          <Button size="sm" variant="outline" onClick={() => handleViewDetails(run)}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          {(run.status === 'failed' || run.status === 'queued') && (
                            <Button size="sm" variant="outline" onClick={() => handleRetry(run.id)}>
                              <RotateCw className="h-4 w-4 mr-1" />
                              Retry
                            </Button>
                          )}
                          {(run.status === 'queued' || run.status === 'running') && (
                            <Button size="sm" variant="destructive" onClick={() => handleCancel(run.id)}>
                              <XCircle className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sends">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Workflow Email Sends
              </CardTitle>
              <CardDescription>Track individual email sends from workflows (for cooldown debugging)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Input
                  placeholder="Filter by email address"
                  value={sendsEmail}
                  onChange={(e) => setSendsEmail(e.target.value)}
                  className="w-[300px]"
                />
                <Button variant="outline" onClick={fetchSends}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>

              {sendsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : sends.length === 0 ? (
                <div className="text-sm text-muted-foreground">No sends found. Enter an email to search.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sends.map((send) => (
                      <TableRow key={send.id}>
                        <TableCell className="font-mono text-sm">{send.recipientEmail}</TableCell>
                        <TableCell>
                          <div className="font-medium">{send.projectName || send.projectId}</div>
                        </TableCell>
                        <TableCell>{ACTION_LABELS[send.actionId] || send.actionId}</TableCell>
                        <TableCell>
                          <Badge variant={send.status === 'sent' ? 'default' : 'destructive'}>
                            {send.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(send.sentAt), 'PPp')}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-red-500">
                          {send.error || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Run Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Workflow Run Details</DialogTitle>
            <DialogDescription>
              {selectedRun && (ACTION_LABELS[selectedRun.actionId] || selectedRun.actionId)}
            </DialogDescription>
          </DialogHeader>
          {selectedRun && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Run ID</div>
                  <div className="font-mono">{selectedRun.id}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Project</div>
                  <div>{selectedRun.projectName || selectedRun.projectId}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <Badge variant={STATUS_VARIANTS[selectedRun.status]}>{selectedRun.status}</Badge>
                </div>
                <div>
                  <div className="text-muted-foreground">Attempts</div>
                  <div>{selectedRun.attempts}/{selectedRun.maxAttempts}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Requested</div>
                  <div>{format(new Date(selectedRun.requestedAt), 'PPpp')}</div>
                </div>
                {selectedRun.completedAt && (
                  <div>
                    <div className="text-muted-foreground">Completed</div>
                    <div>{format(new Date(selectedRun.completedAt), 'PPpp')}</div>
                  </div>
                )}
              </div>

              {selectedRun.result && (
                <div className="border rounded-md p-3 space-y-2">
                  <div className="font-medium">Result</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total: </span>
                      <span className="font-medium">{selectedRun.result.totalRecipients}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sent: </span>
                      <span className="font-medium text-emerald-600">{selectedRun.result.successful}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Failed: </span>
                      <span className="font-medium text-red-500">{selectedRun.result.failed}</span>
                    </div>
                  </div>
                </div>
              )}

              {selectedRun.outcome && selectedRun.outcome.conversions > 0 && (
                <div className="border rounded-md p-3 bg-emerald-50 dark:bg-emerald-950/30 space-y-2">
                  <div className="font-medium flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <TrendingUp className="h-4 w-4" />
                    Attribution Outcome
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Conversions: </span>
                      <span className="font-medium">{selectedRun.outcome.conversions}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Revenue: </span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {selectedRun.outcome.currency} {(selectedRun.outcome.revenueCents / 100).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Confidence: </span>
                      <span className="font-medium">{selectedRun.outcome.confidence}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Matched by: </span>
                      <span className="font-medium">{selectedRun.outcome.matchedBy}</span>
                    </div>
                  </div>
                </div>
              )}

              {selectedRun.error && (
                <div className="border border-red-200 rounded-md p-3 bg-red-50 dark:bg-red-950/30">
                  <div className="font-medium text-red-700 dark:text-red-400">Error</div>
                  <pre className="text-xs mt-1 whitespace-pre-wrap">{selectedRun.error}</pre>
                </div>
              )}

              {selectedRun.params && Object.keys(selectedRun.params).length > 0 && (
                <div className="border rounded-md p-3">
                  <div className="font-medium mb-2">Parameters</div>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-[200px]">
                    {JSON.stringify(selectedRun.params, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
