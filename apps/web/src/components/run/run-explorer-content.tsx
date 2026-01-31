"use client"

import { useEffect, useState, useCallback, useRef } from 'react'
import { LoadingSpinner } from '@/components/ui/loading'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import Icon, { type IconName } from '@/components/ui/icon'
import { useTranslations, useLocale } from 'next-intl'
import { format, formatDistanceToNow, subDays } from 'date-fns'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from './empty-state-ctas'
import { EventDetailsDrawer } from './event-details-drawer'
import { toast } from '@/components/ui/toast'

// Format money using Intl for proper locale + currency support
const formatMoney = (locale: string, currency: string, cents: number): string => {
  const value = cents / 100
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
  } catch {
    // Fallback if currency code is invalid
    return `${currency} ${value.toFixed(2)}`
  }
}

interface BusinessEvent {
  id: number
  publicId: string
  projectId: string
  eventType: string
  occurredAt: string
  receivedAt: string
  source: string
  actorType: string | null
  actorId: string | null
  entityType: string | null
  entityId: string | null
  sessionId: string | null
  anonymousId: string | null
  correlationId: string | null
  payload: Record<string, unknown>
}

interface RunExplorerContentProps {
  projectId: string
}

const EVENT_TYPE_ICONS: Record<string, { icon: IconName; color: string }> = {
  'page_view': { icon: 'eye', color: 'text-blue-500' },
  'session_start': { icon: 'globe', color: 'text-blue-600' },
  'lead_created': { icon: 'user-plus', color: 'text-blue-600' },
  'signup': { icon: 'user-check', color: 'text-green-600' },
  'subscription_started': { icon: 'credit-card', color: 'text-purple-600' },
  'payment_succeeded': { icon: 'dollar-sign', color: 'text-emerald-600' },
  'payment_failed': { icon: 'x-circle', color: 'text-red-600' },
  'checkout_started': { icon: 'credit-card', color: 'text-amber-600' },
  'checkout_abandoned': { icon: 'credit-card', color: 'text-orange-600' },
  'charge.refunded': { icon: 'rotate-ccw', color: 'text-red-500' },
  'track': { icon: 'activity', color: 'text-blue-400' },
  'identify': { icon: 'user', color: 'text-indigo-500' },
}

const getEventIcon = (eventType: string): { icon: IconName; color: string } => {
  return EVENT_TYPE_ICONS[eventType] ?? { icon: 'zap', color: 'text-muted-foreground' }
}

export function RunExplorerContent({ projectId }: RunExplorerContentProps) {
  const t = useTranslations('run')
  const locale = useLocale()
  const [events, setEvents] = useState<BusinessEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<BusinessEvent | null>(null)
  const [exporting, setExporting] = useState(false)
  const limit = 50

  const abortRef = useRef<AbortController | null>(null)

  // Collect unique event types for filter dropdown
  const [knownEventTypes, setKnownEventTypes] = useState<string[]>([])

  const fetchEvents = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      if (eventTypeFilter !== 'all') {
        params.set('eventTypes', eventTypeFilter)
      }
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      params.set('_t', Date.now().toString())

      const res = await fetch(
        `/api/inhouse/projects/${projectId}/business-events?${params}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        }
      )

      if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error?.message || 'Failed to fetch events')

      const fetchedEvents = json.data.events || []
      setEvents(fetchedEvents)
      setTotal(json.data.total || fetchedEvents.length)
      setNextCursor(json.data.nextCursor ?? null)
      setHasMore(json.data.hasMore ?? false)

      // Collect unique event types using functional update to avoid refetch loop
      setKnownEventTypes(prev => {
        const types = new Set(prev)
        for (const evt of fetchedEvents) {
          types.add(evt.eventType)
        }
        return Array.from(types).sort()
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }, [projectId, eventTypeFilter, startDate, endDate, limit])

  // Separate abort controller for fetchMore to prevent race conditions
  const fetchMoreAbortRef = useRef<AbortController | null>(null)

  const fetchMore = useCallback(async () => {
    // Use == null to handle nextCursor === 0 correctly (0 is a valid cursor)
    if (nextCursor == null || loadingMore) return

    // Abort any in-flight fetchMore request
    fetchMoreAbortRef.current?.abort()
    const controller = new AbortController()
    fetchMoreAbortRef.current = controller

    setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('cursor', String(nextCursor))
      if (eventTypeFilter !== 'all') {
        params.set('eventTypes', eventTypeFilter)
      }
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      params.set('_t', Date.now().toString())

      const res = await fetch(
        `/api/inhouse/projects/${projectId}/business-events?${params}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        }
      )

      if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error?.message || 'Failed to fetch events')

      const fetchedEvents = json.data.events || []
      setEvents(prev => [...prev, ...fetchedEvents])
      setNextCursor(json.data.nextCursor ?? null)
      setHasMore(json.data.hasMore ?? false)

      // Functional update to avoid stale closure
      setKnownEventTypes(prev => {
        const types = new Set(prev)
        for (const evt of fetchedEvents) {
          types.add(evt.eventType)
        }
        return Array.from(types).sort()
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      // Show error toast for pagination failures
      toast.error(t('explorer.loadMoreError') || 'Could not load more events')
    } finally {
      setLoadingMore(false)
    }
  }, [projectId, eventTypeFilter, startDate, endDate, nextCursor, loadingMore, limit])

  // Reset on filter change
  useEffect(() => {
    fetchEvents()
    return () => { abortRef.current?.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTypeFilter, startDate, endDate])

  // CSV export
  const handleExportCSV = useCallback(async () => {
    setExporting(true)
    try {
      // Fetch events for the date range (up to 1000 - single request export)
      const params = new URLSearchParams()
      params.set('limit', '1000')
      if (eventTypeFilter !== 'all') {
        params.set('eventTypes', eventTypeFilter)
      }
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      params.set('_t', Date.now().toString())

      const res = await fetch(
        `/api/inhouse/projects/${projectId}/business-events?${params}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' }, cache: 'no-store' }
      )

      if (!res.ok) throw new Error('Failed to export')
      const json = await res.json()
      if (!json.ok) throw new Error(json.error?.message || 'Failed to export')

      const exportEvents: BusinessEvent[] = json.data.events || []
      if (exportEvents.length === 0) {
        toast.error(t('explorer.exportEmpty'))
        return
      }

      // CSV injection hardening - prefix cells starting with formula chars
      const sanitizeCsvCell = (value: unknown): string => {
        let str = String(value ?? '').replace(/"/g, '""')
        // Prefix with apostrophe to prevent spreadsheet formula injection
        if (/^[=+\-@]/.test(str)) {
          str = `'${str}`
        }
        return `"${str}"`
      }

      // Build CSV
      const headers = ['Date', 'Event Type', 'Source', 'Actor', 'Entity', 'Amount', 'Currency', 'Email']
      const rows = exportEvents.map((evt) => {
        const payload = evt.payload || {}
        // Amount in cents, divide by 100 for display
        const amount = payload.amount || payload.value
        return [
          evt.occurredAt,
          evt.eventType,
          evt.source || '',
          evt.actorId || evt.anonymousId || '',
          evt.entityId || '',
          amount ? (Number(amount) / 100).toFixed(2) : '',
          payload.currency || '',
          payload.email || payload.customer_email || '',
        ].map(sanitizeCsvCell)
        .join(',')
      })

      const csv = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `events-${startDate}-to-${endDate}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success(t('explorer.exportSuccess'))
    } catch {
      toast.error(t('explorer.exportError'))
    } finally {
      setExporting(false)
    }
  }, [projectId, eventTypeFilter, startDate, endDate, t])

  // Extract display info from event
  const getEventDisplay = (evt: BusinessEvent) => {
    const payload = evt.payload || {}
    const email = (payload.email || payload.customer_email || '') as string
    const name = (payload.name || payload.customer_name || '') as string
    const amount = payload.amount || payload.value
    const currency = ((payload.currency || 'USD') as string).toUpperCase()

    return {
      label: name || email || evt.actorId || evt.anonymousId?.slice(0, 8) || evt.eventType,
      sublabel: email && name ? email : evt.source || '',
      // Amount stored in cents, format using Intl for proper locale support
      amount: amount != null ? formatMoney(locale, currency, Number(amount)) : null,
    }
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Icon name="alert-circle" className="w-8 h-8 mx-auto text-destructive mb-2" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3 min-h-[44px]" onClick={fetchEvents}>
            {t('explorer.retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Event type filter */}
        <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
          <SelectTrigger className="w-[180px] min-h-[44px] sm:min-h-[36px] text-xs">
            <SelectValue placeholder={t('explorer.allEvents')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">{t('explorer.allEvents')}</SelectItem>
            {knownEventTypes.map((type) => {
              const config = getEventIcon(type)
              return (
                <SelectItem key={type} value={type} className="text-xs">
                  <div className="flex items-center gap-2">
                    <Icon name={config.icon} className={`w-3.5 h-3.5 ${config.color}`} />
                    <span>{type.replace(/_/g, ' ')}</span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        {/* Date range - stacks on mobile */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="min-h-[44px] sm:min-h-[36px] w-full sm:w-[140px] text-xs"
            />
            <span className="text-xs text-muted-foreground text-center hidden sm:inline">–</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              max={format(new Date(), 'yyyy-MM-dd')}
              className="min-h-[44px] sm:min-h-[36px] w-full sm:w-[140px] text-xs"
            />
          </div>
          {/* P2.1: Locale-formatted date range display */}
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(startDate + 'T00:00:00'))}
            {' – '}
            {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(endDate + 'T00:00:00'))}
          </span>
        </div>

        {/* CSV export */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] sm:min-h-[36px] text-xs gap-1.5 ms-auto"
          onClick={handleExportCSV}
          disabled={exporting || loading || events.length === 0}
        >
          {exporting ? (
            <LoadingSpinner size="sm" />
          ) : (
            <Icon name="download" className="w-3.5 h-3.5" />
          )}
          {t('explorer.exportCSV')}
        </Button>
      </div>

      {/* Results count */}
      {!loading && (
        <div className="text-xs text-muted-foreground">
          {t('explorer.showing', { count: events.length, total })}
        </div>
      )}

      {/* Events list */}
      <Card>
        <CardContent className="p-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="md" />
            </div>
          )}

          {!loading && events.length === 0 && (
            <div className="py-12">
              <EmptyState
                stateKey="no_analytics"
                icon="search"
                title={t('explorer.emptyTitle')}
                description={t('explorer.emptyDescription')}
              />
            </div>
          )}

          {!loading && events.length > 0 && (
            <div className="divide-y">
              {events.map((evt) => {
                const config = getEventIcon(evt.eventType)
                const display = getEventDisplay(evt)

                return (
                  <button
                    key={evt.id}
                    type="button"
                    onClick={() => setSelectedEvent(evt)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <Icon name={config.icon} className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{display.label}</span>
                        <Badge variant="outline" className="text-[10px] flex-shrink-0">
                          {evt.eventType.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      {display.sublabel && (
                        <div className="text-xs text-muted-foreground truncate">{display.sublabel}</div>
                      )}
                    </div>
                    {display.amount && (
                      <span className="text-sm font-medium flex-shrink-0">{display.amount}</span>
                    )}
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatDistanceToNow(new Date(evt.occurredAt), { addSuffix: true })}
                    </span>
                    <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMore}
            disabled={loadingMore}
            className="min-h-[44px] sm:min-h-[32px]"
          >
            {loadingMore && <LoadingSpinner size="sm" className="mr-2" />}
            {t('explorer.loadMore')}
          </Button>
        </div>
      )}

      {/* Event Details Drawer */}
      {selectedEvent && (
        <EventDetailsDrawer
          event={{
            id: String(selectedEvent.id),
            publicId: selectedEvent.publicId,
            eventType: selectedEvent.eventType,
            occurredAt: selectedEvent.occurredAt,
            source: selectedEvent.source,
            actorType: selectedEvent.actorType,
            actorId: selectedEvent.actorId,
            entityType: selectedEvent.entityType,
            entityId: selectedEvent.entityId,
            sessionId: selectedEvent.sessionId,
            anonymousId: selectedEvent.anonymousId,
            correlationId: selectedEvent.correlationId,
            payload: selectedEvent.payload,
          }}
          onClose={() => setSelectedEvent(null)}
          eventTypeConfig={(() => {
            const config = getEventIcon(selectedEvent.eventType)
            return {
              icon: config.icon,
              label: selectedEvent.eventType.replace(/_/g, ' '),
              color: config.color,
            }
          })()}
        />
      )}
    </div>
  )
}
