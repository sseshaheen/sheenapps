"use client"

import { useEffect, useState, useCallback, useRef } from 'react'
import { LoadingSpinner } from '@/components/ui/loading'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Icon, { type IconName } from '@/components/ui/icon'
import { useTranslations } from 'next-intl'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from './empty-state-ctas'
import { EventDetailsDrawer } from './event-details-drawer'

interface PaymentEvent {
  id: string
  projectId: string
  stripeEventId: string
  eventType: string
  eventData: Record<string, unknown>
  customerId: string | null
  subscriptionId: string | null
  status: 'pending' | 'processed' | 'failed'
  processedAt: string | null
  createdAt: string
}

interface Integrations {
  tracking: boolean
  payments: boolean
  forms: boolean
}

interface RunOrdersContentProps {
  projectId: string
  integrations?: Integrations | null
}

const EVENT_TYPE_CONFIG: Record<string, { icon: IconName; label: string; color: string }> = {
  'payment_intent.succeeded': { icon: 'check-circle', label: 'Payment', color: 'text-green-600' },
  'invoice.payment_succeeded': { icon: 'check-circle', label: 'Invoice Paid', color: 'text-green-600' },
  'charge.refunded': { icon: 'rotate-ccw', label: 'Refund', color: 'text-orange-600' },
  'customer.subscription.created': { icon: 'user-plus', label: 'Subscription', color: 'text-blue-600' },
  'customer.subscription.deleted': { icon: 'user-x', label: 'Canceled', color: 'text-red-600' },
  'invoice.payment_failed': { icon: 'x-circle', label: 'Failed', color: 'text-red-600' },
  'checkout.session.completed': { icon: 'credit-card', label: 'Checkout', color: 'text-purple-600' },
}

const STATUS_CONFIG: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
  pending: { variant: 'secondary', label: 'Pending' },
  processed: { variant: 'default', label: 'Processed' },
  failed: { variant: 'destructive', label: 'Failed' },
}

export function RunOrdersContent({ projectId, integrations }: RunOrdersContentProps) {
  const t = useTranslations('run')
  const [events, setEvents] = useState<PaymentEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all')
  const [offset, setOffset] = useState(0)
  const [selectedEvent, setSelectedEvent] = useState<PaymentEvent | null>(null)
  const limit = 20

  // AbortController to prevent stale overwrites on fast filter changes
  const abortRef = useRef<AbortController | null>(null)

  const fetchEvents = useCallback(async (currentOffset = 0) => {
    // Abort any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('offset', String(currentOffset))
      if (eventTypeFilter !== 'all') {
        params.set('eventType', eventTypeFilter)
      }

      const res = await fetch(`/api/inhouse/projects/${projectId}/payments/events?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: controller.signal
      })
      const json = await res.json()

      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || 'Failed to load orders')
      }

      setEvents(json.data?.events || [])
      setTotal(json.data?.total || 0)
    } catch (err) {
      // Ignore aborted requests
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [projectId, eventTypeFilter, limit])

  useEffect(() => {
    fetchEvents(offset)
    // Cleanup: abort on unmount
    return () => abortRef.current?.abort()
  }, [fetchEvents, offset])

  const handleFilterChange = (value: string) => {
    setEventTypeFilter(value)
    setOffset(0) // Reset to first page
  }

  const handlePrevPage = () => {
    setOffset(Math.max(0, offset - limit))
  }

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(offset + limit)
    }
  }

  const formatAmount = (eventData: Record<string, unknown>): string | null => {
    const amount = (eventData.amount as number) || (eventData.amount_paid as number) || (eventData.amount_refunded as number)
    if (!amount) return null
    const currency = ((eventData.currency as string) || 'usd').toUpperCase()
    return `${currency} ${(amount / 100).toFixed(2)}`
  }

  const getEventConfig = (eventType: string) => {
    return EVENT_TYPE_CONFIG[eventType] || { icon: 'circle', label: eventType.split('.').pop() || eventType, color: 'text-gray-600' }
  }

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[200px] flex flex-col items-center justify-center gap-3">
        <div className="flex items-center text-sm text-muted-foreground">
          <Icon name="alert-circle" className="w-4 h-4 mr-2 text-red-500" />
          {error}
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchEvents(offset)} className="min-h-[44px]">
          <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
          {t('orders.retry') || 'Try again'}
        </Button>
      </div>
    )
  }

  const hasEvents = events.length > 0
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('orders.filter')}</span>
          <Select value={eventTypeFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-[180px] min-h-[44px] sm:min-h-[36px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('orders.allEvents')}</SelectItem>
              <SelectItem value="payment_intent.succeeded">{t('orders.payments')}</SelectItem>
              <SelectItem value="charge.refunded">{t('orders.refunds')}</SelectItem>
              <SelectItem value="customer.subscription.created">{t('orders.subscriptions')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="ghost" size="sm" onClick={() => fetchEvents(offset)} disabled={loading} className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px]">
          <Icon name="refresh-cw" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Events List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="credit-card" className="w-4 h-4" />
            {t('orders.title')}
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
              stateKey="no_orders"
              title={t('orders.empty')}
              description={integrations?.payments === false ? t('orders.emptyHintNoStripe') : t('orders.emptyHint')}
              icon="credit-card"
              context={{ hasStripe: integrations?.payments }}
            />
          ) : (
            <div className="space-y-2">
              {events.map((event) => {
                const config = getEventConfig(event.eventType)
                const amount = formatAmount(event.eventData)
                const statusConfig = STATUS_CONFIG[event.status]

                return (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full bg-muted ${config.color}`}>
                        <Icon name={config.icon} className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{config.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {amount && (
                        <span className="font-medium text-sm">{amount}</span>
                      )}
                      <Badge variant={statusConfig.variant} className="text-xs">
                        {statusConfig.label}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('orders.page', { current: currentPage, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={offset === 0}
              className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px]"
            >
              <Icon name="chevron-left" className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={offset + limit >= total}
              className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px]"
            >
              <Icon name="chevron-right" className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Event Details Drawer */}
      <EventDetailsDrawer
        event={selectedEvent ? {
          id: selectedEvent.id,
          publicId: selectedEvent.stripeEventId,
          eventType: selectedEvent.eventType,
          occurredAt: selectedEvent.createdAt,
          source: 'Stripe',
          customerId: selectedEvent.customerId,
          subscriptionId: selectedEvent.subscriptionId,
          status: selectedEvent.status,
          payload: selectedEvent.eventData,
        } : null}
        onClose={() => setSelectedEvent(null)}
        variant="order"
        eventTypeConfig={selectedEvent ? getEventConfig(selectedEvent.eventType) : undefined}
      />
    </div>
  )
}
