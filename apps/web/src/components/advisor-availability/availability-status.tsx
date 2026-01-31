/**
 * Availability Status Component
 *
 * Following CLAUDE.md patterns:
 * - Semantic theme classes for consistent styling
 * - Real-time polling for status updates
 * - Accessibility with ARIA live regions
 * - Mobile-optimized responsive layout
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useAvailabilityStatus } from '@/hooks/use-advisor-availability'
import type { AvailabilityStatus } from '@/types/advisor-availability'

interface AvailabilityStatusProps {
  advisorId: string
  enablePolling?: boolean
  compact?: boolean
  translations: {
    title: string
    available: string
    unavailable: string
    nextAvailableSlot: string
    capacity: string
    projects: string
    hours: string
    refreshStatus: string
    lastUpdated: string
    noUpcomingSlots: string
    status: {
      available: string
      at_capacity: string
      unavailable_schedule: string
      manual_pause: string
    }
    statusDescriptions: {
      available: string
      at_capacity: string
      unavailable_schedule: string
      manual_pause: string
    }
  }
}

export function AvailabilityStatus({
  advisorId,
  enablePolling = false,
  compact = false,
  translations
}: AvailabilityStatusProps) {
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Fetch status with optional polling
  const { data: status, isLoading, refetch, error } = useAvailabilityStatus(
    advisorId,
    enablePolling
  )

  // Update last refresh timestamp when data changes
  useEffect(() => {
    if (status) {
      setLastRefresh(new Date())
    }
  }, [status])

  const handleRefresh = async () => {
    await refetch()
    setLastRefresh(new Date())
  }

  // Get status display configuration
  const getStatusConfig = (statusReason: string, isAvailable: boolean) => {
    if (!isAvailable) {
      switch (statusReason) {
        case 'at_capacity':
          return {
            variant: 'destructive' as const,
            icon: 'users' as const,
            bgColor: 'bg-destructive/10',
            text: translations.status.at_capacity,
            description: translations.statusDescriptions.at_capacity
          }
        case 'unavailable_schedule':
          return {
            variant: 'secondary' as const,
            icon: 'clock' as const,
            bgColor: 'bg-secondary/50',
            text: translations.status.unavailable_schedule,
            description: translations.statusDescriptions.unavailable_schedule
          }
        case 'manual_pause':
          return {
            variant: 'outline' as const,
            icon: 'pause-circle' as const,
            bgColor: 'bg-muted',
            text: translations.status.manual_pause,
            description: translations.statusDescriptions.manual_pause
          }
        default:
          return {
            variant: 'secondary' as const,
            icon: 'x-circle' as const,
            bgColor: 'bg-muted',
            text: translations.unavailable,
            description: statusReason
          }
      }
    }

    return {
      variant: 'default' as const,
      icon: 'check-circle' as const,
      bgColor: 'bg-green-50 dark:bg-green-950',
      text: translations.status.available,
      description: translations.statusDescriptions.available
    }
  }

  // Format next available slot
  const formatNextSlot = (nextSlot: NonNullable<AvailabilityStatus['next_available_slot']>) => {
    // nextSlot is a string (ISO timestamp), convert to readable format
    const date = new Date(nextSlot)
    return date.toLocaleString()
  }

  // Format last updated time
  const formatLastUpdated = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / 60000)

    if (diffMinutes < 1) return 'just now'
    if (diffMinutes === 1) return '1 minute ago'
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours === 1) return '1 hour ago'
    if (diffHours < 24) return `${diffHours} hours ago`

    return date.toLocaleString()
  }

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className={compact ? 'p-4' : 'p-6'}>
          <div className="flex items-center gap-3">
            <Icon name="loader-2" className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading status...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !status) {
    return (
      <Card className="bg-card border-border border-destructive/50">
        <CardContent className={compact ? 'p-4' : 'p-6'}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icon name="alert-triangle" className="h-5 w-5 text-destructive" />
              <span className="text-sm text-destructive">Failed to load status</span>
            </div>
            <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2">
              <Icon name="refresh-cw" className="h-4 w-4" />
              {translations.refreshStatus}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const statusConfig = getStatusConfig(status.status_reason, status.is_available)

  if (compact) {
    return (
      <div
        className={`rounded-lg p-3 ${statusConfig.bgColor} border border-border`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between">
          <Badge variant={statusConfig.variant} className="gap-1">
            <Icon name={statusConfig.icon} className="h-3 w-3" />
            {statusConfig.text}
          </Badge>
          {!enablePolling && (
            <Button onClick={handleRefresh} variant="ghost" size="sm" className="h-6 w-6 p-0">
              <Icon name="refresh-cw" className="h-3 w-3" />
              <span className="sr-only">{translations.refreshStatus}</span>
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card className={`bg-card border-border ${statusConfig.bgColor}`}>
      <CardContent className="p-6 space-y-4">
        {/* Status Header */}
        <div className="flex items-center justify-between">
          <Badge variant={statusConfig.variant} className="gap-2">
            <Icon name={statusConfig.icon} className="h-4 w-4" />
            {statusConfig.text}
          </Badge>
          {!enablePolling && (
            <Button onClick={handleRefresh} variant="ghost" size="sm" className="gap-2">
              <Icon name="refresh-cw" className="h-4 w-4" />
              {translations.refreshStatus}
            </Button>
          )}
        </div>

        {/* Status Description */}
        <p className="text-sm text-muted-foreground">
          {statusConfig.description}
        </p>

        {/* Capacity Information */}
        {status.capacity_utilization && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <Icon name="folder" className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{translations.projects}:</span>
              <Badge variant="outline" >
                {status.capacity_utilization.projects}%
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Icon name="clock" className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{translations.hours}:</span>
              <Badge variant="outline" >
                {status.capacity_utilization.hours}%
              </Badge>
            </div>
          </div>
        )}

        {/* Next Available Slot */}
        {!status.is_available && status.next_available_slot && (
          <div className="p-3 rounded-lg bg-background border border-border">
            <div className="flex items-start gap-2">
              <Icon name="calendar" className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {translations.nextAvailableSlot}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatNextSlot(status.next_available_slot)}
                </p>
              </div>
            </div>
          </div>
        )}

        {!status.is_available && !status.next_available_slot && (
          <div className="p-3 rounded-lg bg-background border border-border">
            <div className="flex items-center gap-2">
              <Icon name="calendar-x" className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {translations.noUpcomingSlots}
              </p>
            </div>
          </div>
        )}

        {/* Last Updated */}
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Icon name="clock" className="h-3 w-3" />
          {translations.lastUpdated}: {formatLastUpdated(lastRefresh)}
        </div>

        {/* Live Update Indicator */}
        <div
          className="sr-only"
          aria-live="polite"
          aria-atomic="true"
          role="status"
        >
          Advisor status: {statusConfig.text}
        </div>
      </CardContent>
    </Card>
  )
}