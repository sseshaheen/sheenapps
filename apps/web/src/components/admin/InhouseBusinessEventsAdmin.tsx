/**
 * In-House Business Events Admin Dashboard
 *
 * Explore and debug business events across all projects.
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
import { RefreshCw, Eye, Download, Zap, CreditCard, User, ShoppingCart, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { format, subDays } from 'date-fns'

interface BusinessEvent {
  id: number
  publicId: string
  projectId: string
  projectName?: string
  eventType: string
  occurredAt: string
  receivedAt: string
  source: string
  actorType?: string
  actorId?: string
  entityType?: string
  entityId?: string
  sessionId?: string
  anonymousId?: string
  correlationId?: string
  payload: Record<string, unknown>
}

interface EventStats {
  byType: Array<{ eventType: string; count: number }>
  totalEvents: number
  startDate: string
  endDate: string
}

const EVENT_TYPE_ICONS: Record<string, typeof Zap> = {
  lead_created: User,
  signup: User,
  subscription_started: CreditCard,
  payment_succeeded: CreditCard,
  payment_failed: CreditCard,
  checkout_started: ShoppingCart,
  checkout_abandoned: ShoppingCart,
  form_submitted: FileText,
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  lead_created: 'text-blue-600',
  signup: 'text-green-600',
  subscription_started: 'text-purple-600',
  payment_succeeded: 'text-emerald-600',
  payment_failed: 'text-red-600',
  checkout_started: 'text-amber-600',
  checkout_abandoned: 'text-orange-600',
  form_submitted: 'text-indigo-600',
}

export function InhouseBusinessEventsAdmin() {
  // Filters
  const [projectId, setProjectId] = useState('')
  const [eventType, setEventType] = useState('all')
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  // Data
  const [events, setEvents] = useState<BusinessEvent[]>([])
  const [stats, setStats] = useState<EventStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Pagination
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Detail modal
  const [selectedEvent, setSelectedEvent] = useState<BusinessEvent | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Known event types for filter
  const [knownEventTypes, setKnownEventTypes] = useState<string[]>([])

  const abortRef = useRef<AbortController | null>(null)

  const fetchEvents = useCallback(async (nextCursor?: string) => {
    if (!nextCursor) {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
    }

    if (!nextCursor) setLoading(true)
    if (nextCursor) setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (projectId) params.set('projectId', projectId)
      if (eventType !== 'all') params.set('eventType', eventType)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (nextCursor) params.set('cursor', nextCursor)

      const response = await fetch(`/api/admin/inhouse/business-events?${params.toString()}`, {
        signal: nextCursor ? undefined : abortRef.current?.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch events')

      const data = await response.json()
      const fetchedEvents = data.data?.events || []

      if (nextCursor) {
        setEvents(prev => [...prev, ...fetchedEvents])
      } else {
        setEvents(fetchedEvents)
      }

      setCursor(data.data?.nextCursor || null)
      setHasMore(!!data.data?.nextCursor)

      // Collect unique event types using functional update to avoid dependency loop
      setKnownEventTypes(prev => {
        const types = new Set(prev)
        for (const evt of fetchedEvents) {
          types.add(evt.eventType)
        }
        return Array.from(types).sort()
      })
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch events:', error)
        toast.error('Failed to load events')
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [projectId, eventType, startDate, endDate])

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (projectId) params.set('projectId', projectId)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const response = await fetch(`/api/admin/inhouse/business-events/stats?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch stats')

      const data = await response.json()
      setStats(data.data || null)
    } catch (error) {
      console.error('Failed to fetch event stats:', error)
    }
  }, [projectId, startDate, endDate])

  useEffect(() => {
    fetchEvents()
    fetchStats()
    return () => abortRef.current?.abort()
  }, [fetchEvents, fetchStats])

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ limit: '1000' })
      if (projectId) params.set('projectId', projectId)
      if (eventType !== 'all') params.set('eventType', eventType)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const response = await fetch(`/api/admin/inhouse/business-events?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to export')

      const data = await response.json()
      const exportEvents: BusinessEvent[] = data.data?.events || []

      if (exportEvents.length === 0) {
        toast.error('No events to export')
        return
      }

      // Build CSV with injection hardening
      // Prefix cells starting with =, +, -, @, tab, carriage return with single quote
      const sanitizeCsvCell = (value: string): string => {
        const str = String(value).replace(/"/g, '""')
        // Harden against CSV injection (Excel formula execution)
        if (/^[=+\-@\t\r]/.test(str)) {
          return `"'${str}"`
        }
        return `"${str}"`
      }

      const headers = ['ID', 'Project', 'Event Type', 'Occurred At', 'Source', 'Actor', 'Entity', 'Email', 'Amount', 'Currency']
      const rows = exportEvents.map((evt) => {
        const payload = evt.payload || {}
        return [
          evt.publicId,
          evt.projectId,
          evt.eventType,
          evt.occurredAt,
          evt.source || '',
          evt.actorId || evt.anonymousId || '',
          evt.entityId || '',
          (payload.email || payload.customer_email || '') as string,
          (payload.amount || payload.value || '') as string,
          (payload.currency || '') as string,
        ].map(sanitizeCsvCell)
          .join(',')
      })

      const csv = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `business-events-${startDate}-to-${endDate}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success(`Exported ${exportEvents.length} events`)
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Failed to export events')
    } finally {
      setExporting(false)
    }
  }

  const handleViewDetails = (event: BusinessEvent) => {
    setSelectedEvent(event)
    setDetailOpen(true)
  }

  const getEventIcon = (type: string) => {
    return EVENT_TYPE_ICONS[type] || Zap
  }

  const getEventColor = (type: string) => {
    return EVENT_TYPE_COLORS[type] || 'text-muted-foreground'
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Business Events
          </CardTitle>
          <CardDescription>Explore transactional events used for KPI computation</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Project ID (optional)"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-[260px]"
          />
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All event types</SelectItem>
              {knownEventTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[150px]"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
              className="w-[150px]"
            />
          </div>
          <Button variant="outline" onClick={() => { fetchEvents(); fetchStats() }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting || loading}>
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Event Summary</CardTitle>
            <CardDescription>{stats.startDate} → {stats.endDate}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Badge variant="outline" className="text-base">
                Total: {stats.totalEvents.toLocaleString()}
              </Badge>
              {stats.byType.map((row) => {
                const Icon = getEventIcon(row.eventType)
                const color = getEventColor(row.eventType)
                return (
                  <Badge key={row.eventType} variant="outline" className="flex items-center gap-1.5">
                    <Icon className={`h-3.5 w-3.5 ${color}`} />
                    {row.eventType.replace(/_/g, ' ')}: {row.count.toLocaleString()}
                  </Badge>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>Showing {events.length} events</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-sm text-muted-foreground">No events found for the selected filters</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Occurred</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const Icon = getEventIcon(event.eventType)
                    const color = getEventColor(event.eventType)
                    const displayActor = event.actorId ||
                      (event.anonymousId ? `anon:${event.anonymousId.slice(0, 8)}...` : '—')

                    return (
                      <TableRow key={event.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${color}`} />
                            <span className="text-sm">{event.eventType.replace(/_/g, ' ')}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {event.projectName || `${event.projectId.slice(0, 8)}...`}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{event.source}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{displayActor}</TableCell>
                        <TableCell>{format(new Date(event.occurredAt), 'PPp')}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => handleViewDetails(event)}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {hasMore && (
                <div className="flex justify-center mt-4">
                  <Button
                    variant="outline"
                    onClick={() => cursor && fetchEvents(cursor)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Event Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
            <DialogDescription>
              {selectedEvent && selectedEvent.eventType.replace(/_/g, ' ')}
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Event ID</div>
                  <div className="font-mono text-xs">{selectedEvent.publicId}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Project</div>
                  <div>{selectedEvent.projectName || selectedEvent.projectId}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Event Type</div>
                  <div>{selectedEvent.eventType}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Source</div>
                  <Badge variant="outline">{selectedEvent.source}</Badge>
                </div>
                <div>
                  <div className="text-muted-foreground">Occurred At</div>
                  <div>{format(new Date(selectedEvent.occurredAt), 'PPpp')}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Received At</div>
                  <div>{format(new Date(selectedEvent.receivedAt), 'PPpp')}</div>
                </div>
              </div>

              {/* Actor/Entity Info */}
              <div className="border rounded-md p-3 space-y-2">
                <div className="font-medium">Identity</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Actor: </span>
                    <span className="font-mono">{selectedEvent.actorId || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Anonymous ID: </span>
                    <span className="font-mono text-xs">{selectedEvent.anonymousId || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Session: </span>
                    <span className="font-mono text-xs">{selectedEvent.sessionId || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Correlation: </span>
                    <span className="font-mono text-xs">{selectedEvent.correlationId || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Payload */}
              <div className="border rounded-md p-3">
                <div className="font-medium mb-2">Payload</div>
                <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-[300px]">
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
