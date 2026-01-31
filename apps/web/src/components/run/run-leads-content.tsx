"use client"

import { useEffect, useState, useCallback, useRef } from 'react'
import { LoadingSpinner } from '@/components/ui/loading'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Icon, { type IconName } from '@/components/ui/icon'
import { useTranslations } from 'next-intl'
import { formatDistanceToNow } from 'date-fns'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from './empty-state-ctas'
import { EventDetailsDrawer } from './event-details-drawer'

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

interface Integrations {
  tracking: boolean
  payments: boolean
  forms: boolean
}

interface RunLeadsContentProps {
  projectId: string
  integrations?: Integrations | null
}

// Lead-related event types
const LEAD_EVENT_TYPES = ['lead_created', 'signup', 'subscription_started']

const EVENT_TYPE_CONFIG: Record<string, { icon: IconName; label: string; color: string }> = {
  'lead_created': { icon: 'user-plus', label: 'Lead', color: 'text-blue-600' },
  'signup': { icon: 'user-check', label: 'Signup', color: 'text-green-600' },
  'subscription_started': { icon: 'credit-card', label: 'Subscriber', color: 'text-purple-600' },
}

export function RunLeadsContent({ projectId, integrations }: RunLeadsContentProps) {
  const t = useTranslations('run')
  const [events, setEvents] = useState<BusinessEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all')
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<BusinessEvent | null>(null)
  const limit = 20

  // AbortController to prevent stale overwrites on fast filter changes
  const abortRef = useRef<AbortController | null>(null)

  // Initial fetch (no cursor)
  const fetchEvents = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))

      // Filter by lead-related event types
      if (eventTypeFilter === 'all') {
        params.set('eventTypes', LEAD_EVENT_TYPES.join(','))
      } else {
        params.set('eventTypes', eventTypeFilter)
      }

      const res = await fetch(`/api/inhouse/projects/${projectId}/business-events?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: controller.signal
      })
      const json = await res.json()

      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || 'Failed to load leads')
      }

      setEvents(json.data?.events || [])
      setTotal(json.data?.total || 0)
      setNextCursor(json.data?.nextCursor ?? null)
      setHasMore(json.data?.hasMore ?? false)
    } catch (err) {
      // Ignore aborted requests
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [projectId, eventTypeFilter, limit])

  // Load more (with cursor)
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return

    setLoadingMore(true)

    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('cursor', String(nextCursor))

      // Filter by lead-related event types
      if (eventTypeFilter === 'all') {
        params.set('eventTypes', LEAD_EVENT_TYPES.join(','))
      } else {
        params.set('eventTypes', eventTypeFilter)
      }

      const res = await fetch(`/api/inhouse/projects/${projectId}/business-events?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })
      const json = await res.json()

      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || 'Failed to load more')
      }

      // Append new events
      setEvents(prev => [...prev, ...(json.data?.events || [])])
      setNextCursor(json.data?.nextCursor ?? null)
      setHasMore(json.data?.hasMore ?? false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more')
    } finally {
      setLoadingMore(false)
    }
  }, [projectId, eventTypeFilter, limit, nextCursor, loadingMore])

  useEffect(() => {
    fetchEvents()
    // Cleanup: abort on unmount
    return () => abortRef.current?.abort()
  }, [fetchEvents])

  const handleFilterChange = (value: string) => {
    setEventTypeFilter(value)
    // Reset state for new filter
    setEvents([])
    setNextCursor(null)
    setHasMore(false)
  }

  const getEventConfig = (eventType: string) => {
    return EVENT_TYPE_CONFIG[eventType] || { icon: 'user', label: eventType, color: 'text-gray-600' }
  }

  const getDisplayName = (event: BusinessEvent): string => {
    // Try to get name/email from payload
    const payload = event.payload || {}
    if (payload.email) return payload.email as string
    if (payload.name) return payload.name as string
    if (payload.customer_email) return payload.customer_email as string
    if (event.actorId) return event.actorId
    if (event.anonymousId) return `Anonymous ${event.anonymousId.slice(0, 8)}...`
    return t('leads.unknown')
  }

  const getSource = (event: BusinessEvent): string => {
    const payload = event.payload || {}
    if (payload.source) return payload.source as string
    if (event.source === 'webhook') return 'Stripe'
    if (event.source === 'sdk') return 'Website'
    return event.source
  }

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error && events.length === 0) {
    return (
      <div className="min-h-[200px] flex flex-col items-center justify-center gap-3">
        <div className="flex items-center text-sm text-muted-foreground">
          <Icon name="alert-circle" className="w-4 h-4 mr-2 text-red-500" />
          {error}
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchEvents()} className="min-h-[44px]">
          <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
          {t('leads.retry') || 'Try again'}
        </Button>
      </div>
    )
  }

  const hasEvents = events.length > 0

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('leads.filter')}</span>
          <Select value={eventTypeFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-[160px] min-h-[44px] sm:min-h-[36px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('leads.allLeads')}</SelectItem>
              <SelectItem value="lead_created">{t('leads.leads')}</SelectItem>
              <SelectItem value="signup">{t('leads.signups')}</SelectItem>
              <SelectItem value="subscription_started">{t('leads.subscribers')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="ghost" size="sm" onClick={() => fetchEvents()} disabled={loading} className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px]">
          <Icon name="refresh-cw" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Leads List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="users" className="w-4 h-4" />
            {t('leads.title')}
            {total > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {total}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasEvents ? (
            <EmptyState
              stateKey="no_leads"
              title={t('leads.empty')}
              description={integrations?.forms === false ? t('leads.emptyHintNoForms') : t('leads.emptyHint')}
              icon="users"
              context={{ hasForm: integrations?.forms }}
            />
          ) : (
            <div className="space-y-2">
              {events.map((event) => {
                const config = getEventConfig(event.eventType)
                const displayName = getDisplayName(event)
                const source = getSource(event)

                return (
                  <button
                    key={event.publicId}
                    onClick={() => setSelectedEvent(event)}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full bg-muted ${config.color}`}>
                        <Icon name={config.icon} className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{displayName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{formatDistanceToNow(new Date(event.occurredAt), { addSuffix: true })}</span>
                          <span className="text-muted-foreground/50">•</span>
                          <span>{source}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${config.color}`}>
                        {config.label}
                      </Badge>
                      <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Load More */}
      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full max-w-xs"
          >
            {loadingMore ? (
              <>
                <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                {t('leads.loading')}
              </>
            ) : (
              <>
                <Icon name="chevron-down" className="w-4 h-4 mr-2" />
                {t('leads.loadMore')}
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t('leads.showing', { count: events.length, total })}
          </span>
        </div>
      )}

      {/* Event Details Drawer */}
      <EventDetailsDrawer
        event={selectedEvent ? {
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
        } : null}
        onClose={() => setSelectedEvent(null)}
        variant="lead"
        eventTypeConfig={selectedEvent ? getEventConfig(selectedEvent.eventType) : undefined}
      />
    </div>
  )
}
