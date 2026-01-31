'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'

interface BillingEvent {
  id: string
  type: 'credit.applied' | 'balance.depleted' | 'package.fulfilled' | 'subscription.created' | 'subscription.cancelled' | 'bucket.created' | 'bucket.expired' | 'rollover.created' | 'rollover.expired'
  amount_seconds?: number
  amount_minutes?: number
  source?: string
  description: string
  metadata?: Record<string, any>
  created_at: string
}

interface BillingEventHistoryProps {
  userId: string
  translations: any
  className?: string
  limit?: number
}

export function BillingEventHistory({ 
  userId, 
  translations, 
  className,
  limit = 50 
}: BillingEventHistoryProps) {
  const [showAll, setShowAll] = useState(false)
  const [filter, setFilter] = useState<'all' | 'credits' | 'subscriptions' | 'buckets'>('all')

  // Fetch billing events
  const { data: events, isLoading, error, refetch } = useQuery({
    queryKey: ['billing-events', userId, limit],
    queryFn: async (): Promise<BillingEvent[]> => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        _t: Date.now().toString() // Cache-busting
      })
      
      const response = await fetch(`/api/v1/billing/events/${userId}?${params}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch billing events: ${response.status}`)
      }
      
      const data = await response.json()
      return data.events || []
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: false // Only manual refetch
  })

  // Filter events based on selected filter
  const filteredEvents = useMemo(() => {
    if (!events) return []
    
    let filtered = events
    
    // Apply type filter
    if (filter !== 'all') {
      filtered = events.filter(event => {
        switch (filter) {
          case 'credits':
            return ['credit.applied', 'package.fulfilled'].includes(event.type)
          case 'subscriptions':
            return ['subscription.created', 'subscription.cancelled'].includes(event.type)
          case 'buckets':
            return ['bucket.created', 'bucket.expired', 'rollover.created', 'rollover.expired'].includes(event.type)
          default:
            return true
        }
      })
    }
    
    // Limit display if not showing all
    if (!showAll) {
      filtered = filtered.slice(0, 10)
    }
    
    return filtered
  }, [events, filter, showAll])

  // Get event display info
  const getEventDisplay = (event: BillingEvent) => {
    const displays: Record<BillingEvent['type'], { 
      icon: 'plus' | 'minus' | 'credit-card' | 'x' | 'archive' | 'clock' | 'rotate-cw' | 'calendar'; 
      color: string; 
      bgColor: string 
    }> = {
      'credit.applied': { icon: 'plus', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-950' },
      'package.fulfilled': { icon: 'plus', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-950' },
      'subscription.created': { icon: 'credit-card', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-950' },
      'subscription.cancelled': { icon: 'x', color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-950' },
      'bucket.created': { icon: 'archive', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-950' },
      'bucket.expired': { icon: 'clock', color: 'text-amber-600', bgColor: 'bg-amber-100 dark:bg-amber-950' },
      'balance.depleted': { icon: 'minus', color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-950' },
      'rollover.created': { icon: 'rotate-cw', color: 'text-indigo-600', bgColor: 'bg-indigo-100 dark:bg-indigo-950' },
      'rollover.expired': { icon: 'calendar', color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-950' }
    }
    
    return displays[event.type] || { icon: 'archive', color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-950' }
  }

  // Format event description
  const formatEventDescription = (event: BillingEvent) => {
    const baseDescription = translations.billing.events?.[event.type] || event.description
    
    // Add amount if available
    if (event.amount_minutes || event.amount_seconds) {
      const minutes = event.amount_minutes || Math.floor((event.amount_seconds || 0) / 60)
      return `${baseDescription} (${minutes}m)`
    }
    
    return baseDescription
  }

  const formatEventTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffHours < 1) return translations.billing.justNow
    if (diffHours < 24) return `${diffHours}h ${translations.billing.ago}`
    if (diffDays < 7) return `${diffDays}d ${translations.billing.ago}`
    
    return date.toLocaleDateString()
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{translations.billing.eventHistory}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Icon name="loader-2" className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{translations.billing.eventHistory}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Icon name="alert-circle" className="h-8 w-8 text-destructive mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              {translations.billing.eventHistoryError}
            </p>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <Icon name="refresh-cw" className="h-4 w-4 mr-2" />
              {translations.billing.retry}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{translations.billing.eventHistory}</CardTitle>
          <Button
            onClick={() => refetch()}
            variant="ghost"
            size="sm"
          >
            <Icon name="refresh-cw" className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Filter buttons */}
        <div className="flex gap-2 mt-4">
          {(['all', 'credits', 'subscriptions', 'buckets'] as const).map((filterType) => (
            <Button
              key={filterType}
              variant={filter === filterType ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(filterType)}
              className="text-xs"
            >
              {translations.billing.filters?.[filterType] || filterType}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {filteredEvents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Icon name="calendar" className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">{translations.billing.noEvents}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEvents.map((event) => {
              const display = getEventDisplay(event)
              
              return (
                <div key={event.id} className="flex items-start gap-3">
                  <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0",
                    display.bgColor
                  )}>
                    <Icon name={display.icon} className={cn("h-4 w-4", display.color)} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {formatEventDescription(event)}
                      </p>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatEventTime(event.created_at)}
                      </span>
                    </div>
                    
                    {/* Event metadata */}
                    {event.source && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {translations.billing.source}: {event.source}
                      </p>
                    )}
                    
                    {/* Additional metadata */}
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {Object.entries(event.metadata).slice(0, 3).map(([key, value]) => (
                          <Badge key={key} variant="secondary" className="text-xs">
                            {key}: {String(value).slice(0, 20)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            
            {/* Show more/less button */}
            {events && events.length > 10 && (
              <div className="text-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? (
                    <>
                      <Icon name="chevron-up" className="h-4 w-4 mr-2" />
                      {translations.billing.showLess}
                    </>
                  ) : (
                    <>
                      <Icon name="chevron-down" className="h-4 w-4 mr-2" />
                      {translations.billing.showMore} ({events.length - 10} {translations.billing.more})
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}