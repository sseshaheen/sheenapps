'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  RefreshCw,
  Webhook,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  RotateCcw,
  Eye,
  Activity,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import { CopyButton } from '@/components/admin/shared/CopyButton'

// =============================================================================
// TYPES
// =============================================================================

interface WebhookEvent {
  id: string
  source: string
  endpoint: string
  status: string
  received_at: string
  processed_at?: string
  last_error?: string
  retry_count: number
  next_retry_at?: string
  parsed_event_type?: string
  idempotency_key?: string
  sender_ip?: string
}

interface WebhookEventDetail extends WebhookEvent {
  raw_headers: Record<string, string>
  raw_body: string
  parsed_data?: Record<string, unknown>
}

interface WebhookStats {
  total: number
  byStatus: Record<string, number>
  bySource: Record<string, Record<string, number>>
  recentFailures: number
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  message: string
  details?: Record<string, unknown>
}

// =============================================================================
// HELPERS
// =============================================================================

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default'
    case 'pending':
    case 'processing':
    case 'retrying':
      return 'secondary'
    case 'failed':
      return 'destructive'
    default:
      return 'outline'
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'pending':
      return <Clock className="h-4 w-4 text-gray-500" />
    case 'processing':
      return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />
    case 'retrying':
      return <RotateCcw className="h-4 w-4 text-yellow-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <Webhook className="h-4 w-4" />
  }
}

function getHealthBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'healthy':
      return 'default'
    case 'degraded':
      return 'secondary'
    case 'unhealthy':
      return 'destructive'
    default:
      return 'secondary'
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function InhouseWebhookEventsAdmin() {
  // State
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [stats, setStats] = useState<WebhookStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [webhookHealth, setWebhookHealth] = useState<HealthStatus | null>(null)
  const [pricingHealth, setPricingHealth] = useState<HealthStatus | null>(null)
  const [transferHealth, setTransferHealth] = useState<HealthStatus | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('events')

  // Detail dialog
  const [selectedEvent, setSelectedEvent] = useState<WebhookEventDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  // Pagination
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const limit = 50

  // Refs for cleanup
  const eventsAbortRef = useRef<AbortController | null>(null)
  const statsAbortRef = useRef<AbortController | null>(null)

  // ===========================================================================
  // DATA FETCHING
  // ===========================================================================

  const fetchEvents = useCallback(async () => {
    eventsAbortRef.current?.abort()
    const controller = new AbortController()
    eventsAbortRef.current = controller

    setEventsLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (sourceFilter !== 'all') params.set('source', sourceFilter)

      const response = await fetch(`/api/admin/inhouse/webhook-events?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch events')
      const data = await response.json()
      setEvents(data.data?.events || [])
      setTotal(data.data?.total || 0)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('Failed to load webhook events')
      }
    } finally {
      setEventsLoading(false)
    }
  }, [statusFilter, sourceFilter, offset])

  const fetchStats = useCallback(async () => {
    statsAbortRef.current?.abort()
    const controller = new AbortController()
    statsAbortRef.current = controller

    setStatsLoading(true)
    try {
      const response = await fetch('/api/admin/inhouse/webhook-events/stats', {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch stats')
      const data = await response.json()
      setStats(data.data || null)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to load stats:', error)
      }
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const fetchHealth = useCallback(async () => {
    try {
      const [webhookRes, pricingRes, transferRes] = await Promise.all([
        fetch('/api/admin/inhouse/health/webhooks'),
        fetch('/api/admin/inhouse/health/pricing'),
        fetch('/api/admin/inhouse/health/transfers'),
      ])

      if (webhookRes.ok) {
        const data = await webhookRes.json()
        setWebhookHealth(data.data || null)
      }
      if (pricingRes.ok) {
        const data = await pricingRes.json()
        setPricingHealth(data.data || null)
      }
      if (transferRes.ok) {
        const data = await transferRes.json()
        setTransferHealth(data.data || null)
      }
    } catch (error) {
      console.error('Failed to load health status:', error)
    }
  }, [])

  const fetchEventDetail = useCallback(async (eventId: string) => {
    setDetailLoading(true)
    try {
      const response = await fetch(`/api/admin/inhouse/webhook-events/${eventId}`)
      if (!response.ok) throw new Error('Failed to fetch event details')
      const data = await response.json()
      setSelectedEvent(data.data || null)
      setDetailOpen(true)
    } catch (error) {
      toast.error('Failed to load event details')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const reprocessEvent = useCallback(async (eventId: string) => {
    try {
      const response = await fetch(`/api/admin/inhouse/webhook-events/${eventId}/reprocess`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to reprocess event')
      toast.success('Event queued for reprocessing')
      fetchEvents()
      fetchStats()
    } catch (error) {
      toast.error('Failed to reprocess event')
    }
  }, [fetchEvents, fetchStats])

  // ===========================================================================
  // EFFECTS
  // ===========================================================================

  useEffect(() => {
    fetchEvents()
    fetchStats()
    fetchHealth()
  }, [fetchEvents, fetchStats, fetchHealth])

  useEffect(() => {
    return () => {
      eventsAbortRef.current?.abort()
      statsAbortRef.current?.abort()
    }
  }, [])

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
  }, [statusFilter, sourceFilter])

  // ===========================================================================
  // RENDER
  // ===========================================================================

  const hasMore = offset + events.length < total

  return (
    <div className="space-y-6">
      {/* Health Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Webhook Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            {webhookHealth ? (
              <div className="flex items-center gap-2">
                <Badge variant={getHealthBadgeVariant(webhookHealth.status)}>
                  {webhookHealth.status}
                </Badge>
                <span className="text-sm text-muted-foreground">{webhookHealth.message}</span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Loading...</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Pricing Cache
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pricingHealth ? (
              <div className="flex items-center gap-2">
                <Badge variant={getHealthBadgeVariant(pricingHealth.status)}>
                  {pricingHealth.status}
                </Badge>
                <span className="text-sm text-muted-foreground">{pricingHealth.message}</span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Loading...</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Domain Transfers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transferHealth ? (
              <div className="flex items-center gap-2">
                <Badge variant={getHealthBadgeVariant(transferHealth.status)}>
                  {transferHealth.status}
                </Badge>
                <span className="text-sm text-muted-foreground">{transferHealth.message}</span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Loading...</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {(stats.byStatus?.completed || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Processing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {((stats.byStatus?.pending || 0) + (stats.byStatus?.processing || 0)).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Retrying</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {(stats.byStatus?.retrying || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {(stats.byStatus?.failed || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Webhook Events</CardTitle>
              <CardDescription>
                Monitor and manage webhook events from OpenSRS, Stripe, and other sources
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchEvents()
                fetchStats()
                fetchHealth()
              }}
              disabled={eventsLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${eventsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="events">All Events</TabsTrigger>
              <TabsTrigger value="failed">
                Failed
                {(stats?.byStatus?.failed || 0) > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {stats?.byStatus?.failed}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="events" className="space-y-4">
              {/* Filters */}
              <div className="flex items-center gap-4">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="retrying">Retrying</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="opensrs">OpenSRS</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="resend">Resend</SelectItem>
                  </SelectContent>
                </Select>

                <span className="text-sm text-muted-foreground">
                  {total.toLocaleString()} events
                </span>
              </div>

              {/* Events Table */}
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Retries</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : events.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No webhook events found
                        </TableCell>
                      </TableRow>
                    ) : (
                      events.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(event.status)}
                              <Badge variant={getStatusBadgeVariant(event.status)}>
                                {event.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{event.source}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-sm">
                              {event.parsed_event_type || '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span title={format(new Date(event.received_at), 'PPpp')}>
                              {formatDistanceToNow(new Date(event.received_at), { addSuffix: true })}
                            </span>
                          </TableCell>
                          <TableCell>
                            {event.retry_count > 0 ? (
                              <Badge variant="secondary">{event.retry_count}</Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {event.last_error ? (
                              <span className="text-sm text-red-600 truncate block" title={event.last_error}>
                                {event.last_error}
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => fetchEventDetail(event.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {(event.status === 'failed' || event.status === 'retrying') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => reprocessEvent(event.id)}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {total > limit && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Showing {offset + 1}-{Math.min(offset + events.length, total)} of {total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                      disabled={offset === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOffset(offset + limit)}
                      disabled={!hasMore}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="failed" className="space-y-4">
              <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950 rounded-md">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="text-sm">
                  Failed events have exceeded maximum retry attempts and require manual investigation.
                </span>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Retries</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.filter(e => e.status === 'failed').length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
                          No failed events
                        </TableCell>
                      </TableRow>
                    ) : (
                      events
                        .filter(e => e.status === 'failed')
                        .map((event) => (
                          <TableRow key={event.id}>
                            <TableCell>
                              <Badge variant="outline">{event.source}</Badge>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-sm">
                                {event.parsed_event_type || '-'}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[300px]">
                              <span className="text-sm text-red-600 truncate block" title={event.last_error}>
                                {event.last_error || 'Unknown error'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{event.retry_count}</Badge>
                            </TableCell>
                            <TableCell>
                              {formatDistanceToNow(new Date(event.received_at), { addSuffix: true })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => fetchEventDetail(event.id)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => reprocessEvent(event.id)}
                                >
                                  <RotateCcw className="h-4 w-4 mr-1" />
                                  Retry
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Event Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Webhook Event Details</DialogTitle>
            <DialogDescription>
              {selectedEvent?.source} - {selectedEvent?.parsed_event_type || 'Unknown event'}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : selectedEvent ? (
            <div className="space-y-4">
              {/* Status & Metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusIcon(selectedEvent.status)}
                    <Badge variant={getStatusBadgeVariant(selectedEvent.status)}>
                      {selectedEvent.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Source</label>
                  <div className="mt-1">
                    <Badge variant="outline">{selectedEvent.source}</Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Received</label>
                  <p className="text-sm mt-1">
                    {format(new Date(selectedEvent.received_at), 'PPpp')}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Processed</label>
                  <p className="text-sm mt-1">
                    {selectedEvent.processed_at
                      ? format(new Date(selectedEvent.processed_at), 'PPpp')
                      : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Retry Count</label>
                  <p className="text-sm mt-1">{selectedEvent.retry_count}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Sender IP</label>
                  <p className="text-sm mt-1">{selectedEvent.sender_ip || '-'}</p>
                </div>
              </div>

              {/* Idempotency Key */}
              {selectedEvent.idempotency_key && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Idempotency Key</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                      {selectedEvent.idempotency_key}
                    </code>
                    <CopyButton value={selectedEvent.idempotency_key} />
                  </div>
                </div>
              )}

              {/* Error */}
              {selectedEvent.last_error && (
                <div>
                  <label className="text-sm font-medium text-red-600">Last Error</label>
                  <pre className="text-sm mt-1 p-3 bg-red-50 dark:bg-red-950 rounded-md whitespace-pre-wrap text-red-700 dark:text-red-300">
                    {selectedEvent.last_error}
                  </pre>
                </div>
              )}

              {/* Parsed Data */}
              {selectedEvent.parsed_data && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Parsed Data</label>
                  <pre className="text-xs mt-1 p-3 bg-muted rounded-md overflow-auto max-h-[200px]">
                    {JSON.stringify(selectedEvent.parsed_data, null, 2)}
                  </pre>
                </div>
              )}

              {/* Raw Headers */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Raw Headers</label>
                <pre className="text-xs mt-1 p-3 bg-muted rounded-md overflow-auto max-h-[150px]">
                  {JSON.stringify(selectedEvent.raw_headers, null, 2)}
                </pre>
              </div>

              {/* Raw Body */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Raw Body</label>
                <pre className="text-xs mt-1 p-3 bg-muted rounded-md overflow-auto max-h-[200px] whitespace-pre-wrap">
                  {selectedEvent.raw_body}
                </pre>
              </div>

              {/* Actions */}
              {(selectedEvent.status === 'failed' || selectedEvent.status === 'retrying') && (
                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={() => reprocessEvent(selectedEvent.id)}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reprocess Event
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
