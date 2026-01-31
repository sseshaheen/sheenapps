'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Icon, { type IconName } from '@/components/ui/icon'
import { useTranslations, useLocale } from 'next-intl'
import { formatDistanceToNow } from 'date-fns'
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

interface EventDetails {
  id: string
  publicId?: string
  eventType: string
  occurredAt: string
  source: string
  // Actor info
  actorType?: string | null
  actorId?: string | null
  // Entity info
  entityType?: string | null
  entityId?: string | null
  // Session/tracking
  sessionId?: string | null
  anonymousId?: string | null
  correlationId?: string | null
  // Raw payload
  payload?: Record<string, unknown>
  // For payment events
  status?: string
  customerId?: string | null
  subscriptionId?: string | null
}

interface EventDetailsDrawerProps {
  event: EventDetails | null
  onClose: () => void
  variant?: 'lead' | 'order'
  eventTypeConfig?: {
    icon: IconName
    label: string
    color: string
  }
}

/**
 * Copy text to clipboard with toast feedback
 */
function useCopyToClipboard() {
  const t = useTranslations('run.eventDetails')

  return async (text: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('copied', { label: label || 'Value' }))
    } catch {
      toast.error(t('copyFailed'))
    }
  }
}

/**
 * A single key-value row with optional copy button
 */
function DetailRow({
  label,
  value,
  copyable = false,
  onCopy,
  icon,
  mono = false,
}: {
  label: string
  value: string | null | undefined
  copyable?: boolean
  onCopy?: () => void
  icon?: IconName
  mono?: boolean
}) {
  if (!value) return null

  return (
    <div className="flex items-start justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon && <Icon name={icon} className="w-4 h-4" />}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm text-foreground ${mono ? 'font-mono text-xs' : ''}`}>
          {value}
        </span>
        {copyable && onCopy && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onCopy}
          >
            <Icon name="copy" className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

export function EventDetailsDrawer({
  event,
  onClose,
  variant = 'lead',
  eventTypeConfig,
}: EventDetailsDrawerProps) {
  const t = useTranslations('run.eventDetails')
  const locale = useLocale()
  const [payloadOpen, setPayloadOpen] = useState(false)
  const copyToClipboard = useCopyToClipboard()

  // RTL-aware drawer side
  const isRTL = locale?.startsWith('ar')

  if (!event) return null

  // Extract useful info from payload
  const payload = event.payload || {}
  const email = (payload.email || payload.customer_email || payload.recipient_email) as string | undefined
  const name = (payload.name || payload.customer_name) as string | undefined
  const phone = payload.phone as string | undefined
  const amount = payload.amount as number | undefined
  const currency = (payload.currency as string)?.toUpperCase() || 'USD'

  // Format dates using Intl for proper locale support
  const occurredDate = new Date(event.occurredAt)
  const formattedDate = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(occurredDate)
  const relativeTime = formatDistanceToNow(occurredDate, { addSuffix: true })

  // Get display name for the event
  const displayName = email || name || event.actorId ||
    (event.anonymousId ? `Anonymous ${event.anonymousId.slice(0, 8)}...` : t('unknownVisitor'))

  return (
    <Sheet open={!!event} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={isRTL ? "left" : "right"}
        className="w-full sm:max-w-md overflow-y-auto pb-[env(safe-area-inset-bottom,16px)]"
      >
        <SheetHeader>
          <div className="flex items-center gap-3">
            {eventTypeConfig && (
              <div className={`p-2 rounded-full bg-muted ${eventTypeConfig.color}`}>
                <Icon name={eventTypeConfig.icon} className="w-5 h-5" />
              </div>
            )}
            <div>
              <SheetTitle className="text-lg">{t('title')}</SheetTitle>
              <SheetDescription className="text-sm">
                {eventTypeConfig?.label || event.eventType}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Primary Info Card */}
          <div className="rounded-lg border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg font-semibold truncate">{displayName}</span>
              {event.status && (
                <Badge variant={event.status === 'processed' ? 'default' : 'secondary'}>
                  {event.status}
                </Badge>
              )}
            </div>
            {amount != null && (
              <div className="text-2xl font-bold text-emerald-600">
                {formatMoney(locale, currency, amount)}
              </div>
            )}
            <div className="text-sm text-muted-foreground">
              {relativeTime}
            </div>
          </div>

          {/* Contact Details */}
          {(email || phone || name) && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {t('contactInfo')}
              </h3>
              <div className="rounded-lg border bg-card p-3">
                <DetailRow
                  label={t('email')}
                  value={email}
                  icon="mail"
                  copyable
                  onCopy={() => email && copyToClipboard(email, t('email'))}
                />
                {name && name !== email && (
                  <DetailRow
                    label={t('name')}
                    value={name}
                    icon="user"
                  />
                )}
                <DetailRow
                  label={t('phone')}
                  value={phone}
                  icon="phone"
                  copyable
                  onCopy={() => phone && copyToClipboard(phone, t('phone'))}
                />
              </div>
            </div>
          )}

          {/* Event Details */}
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              {t('eventInfo')}
            </h3>
            <div className="rounded-lg border bg-card p-3">
              <DetailRow
                label={t('type')}
                value={event.eventType}
                icon="tag"
              />
              <DetailRow
                label={t('source')}
                value={event.source}
                icon="globe"
              />
              <DetailRow
                label={t('occurred')}
                value={formattedDate}
                icon="clock"
              />
            </div>
          </div>

          {/* Tracking IDs */}
          {(event.sessionId || event.correlationId || event.publicId) && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {t('trackingIds')}
              </h3>
              <div className="rounded-lg border bg-card p-3">
                <DetailRow
                  label={t('eventId')}
                  value={event.publicId}
                  mono
                  copyable
                  onCopy={() => event.publicId && copyToClipboard(event.publicId, t('eventId'))}
                />
                <DetailRow
                  label={t('sessionId')}
                  value={event.sessionId}
                  mono
                  copyable
                  onCopy={() => event.sessionId && copyToClipboard(event.sessionId, t('sessionId'))}
                />
                <DetailRow
                  label={t('correlationId')}
                  value={event.correlationId}
                  mono
                  copyable
                  onCopy={() => event.correlationId && copyToClipboard(event.correlationId, t('correlationId'))}
                />
                {event.customerId && (
                  <DetailRow
                    label={t('customerId')}
                    value={event.customerId}
                    mono
                    copyable
                    onCopy={() => event.customerId && copyToClipboard(event.customerId, t('customerId'))}
                  />
                )}
              </div>
            </div>
          )}

          {/* Raw Payload (Collapsible) */}
          {Object.keys(payload).length > 0 && (
            <div className="space-y-1">
              <button
                onClick={() => setPayloadOpen(!payloadOpen)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <Icon
                  name={payloadOpen ? 'chevron-down' : 'chevron-right'}
                  className="w-4 h-4"
                />
                {t('rawPayload')}
                <Badge variant="outline" className="ml-auto text-xs">
                  {Object.keys(payload).length} {t('fields')}
                </Badge>
              </button>
              {payloadOpen && (
                <div className="rounded-lg border bg-muted/50 p-3 mt-2">
                  <div className="flex justify-end mb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-[44px] sm:min-h-[32px] text-xs"
                      onClick={() => copyToClipboard(JSON.stringify(payload, null, 2), t('payload'))}
                    >
                      <Icon name="copy" className="w-3 h-3 mr-1" />
                      {t('copyPayload')}
                    </Button>
                  </div>
                  <pre className="text-xs overflow-auto max-h-[300px] whitespace-pre-wrap break-all">
                    {JSON.stringify(payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
