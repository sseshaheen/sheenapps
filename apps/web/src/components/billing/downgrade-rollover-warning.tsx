'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

interface ScheduledPlanChange {
  id: string
  current_plan: string
  new_plan: string
  effective_date: string
  will_discard_rollover: boolean
  current_rollover_minutes: number
  new_plan_rollover_cap: number
  minutes_to_discard: number
}

interface DowngradeRolloverWarningProps {
  userId: string
  translations: any
  className?: string
  variant?: 'banner' | 'card' | 'inline'
}

export function DowngradeRolloverWarning({ 
  userId, 
  translations, 
  className,
  variant = 'banner'
}: DowngradeRolloverWarningProps) {
  const queryClient = useQueryClient()

  // Fetch scheduled plan changes that affect rollover
  const { data: scheduledChange, isLoading } = useQuery({
    queryKey: ['scheduled-plan-changes', userId],
    queryFn: async (): Promise<ScheduledPlanChange | null> => {
      const params = new URLSearchParams({
        _t: Date.now().toString()
      })
      
      const response = await fetch(`/api/v1/billing/scheduled-changes/${userId}?${params}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      
      if (!response.ok) {
        if (response.status === 404) {
          return null // No scheduled changes
        }
        throw new Error(`Failed to fetch scheduled changes: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Only return if it will discard rollover minutes
      if (data.will_discard_rollover && data.minutes_to_discard > 0) {
        return data
      }
      
      return null
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: false
  })

  // Cancel scheduled downgrade
  const handleCancelDowngrade = async () => {
    if (!scheduledChange) return

    try {
      const response = await fetch(`/api/v1/billing/cancel-scheduled-change/${scheduledChange.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to cancel downgrade: ${response.status}`)
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['scheduled-plan-changes', userId] })
      queryClient.invalidateQueries({ queryKey: ['enhanced-balance', userId] })
      
    } catch (error) {
      console.error('Failed to cancel downgrade:', error)
      // Could show error toast here
    }
  }

  // Format effective date
  const formatEffectiveDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays <= 1) return translations.billing.tomorrow
    if (diffDays <= 7) return `${diffDays} ${translations.billing.daysFromNow}`
    
    return date.toLocaleDateString()
  }

  if (isLoading || !scheduledChange) {
    return null
  }

  const content = (
    <>
      <div className="flex items-start gap-3">
        <Icon name="alert-triangle" className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">
              {translations.billing.rolloverMinutesAtRisk}
            </span>
            <Badge variant="destructive" className="text-xs">
              -{scheduledChange.minutes_to_discard}m
            </Badge>
          </div>
          
          <p className="text-sm mt-1 text-muted-foreground">
            {translations.billing.downgradeWillDiscard
              ?.replace('{newPlan}', scheduledChange.new_plan)
              ?.replace('{minutes}', scheduledChange.minutes_to_discard.toString())
              ?.replace('{date}', formatEffectiveDate(scheduledChange.effective_date)) ||
              `Your scheduled downgrade to ${scheduledChange.new_plan} will discard ${scheduledChange.minutes_to_discard} rollover minutes on ${formatEffectiveDate(scheduledChange.effective_date)}.`
            }
          </p>
          
          <div className="flex items-center gap-4 mt-3">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">{translations.billing.current}:</span> {scheduledChange.current_rollover_minutes}m • 
              <span className="font-medium ml-1">{translations.billing.newLimit}:</span> {scheduledChange.new_plan_rollover_cap}m
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-end mt-4">
        <Button
          onClick={handleCancelDowngrade}
          variant="outline"
          size="sm"
          className="text-amber-600 border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
        >
          <Icon name="x" className="h-4 w-4 mr-2" />
          {translations.billing.cancelDowngrade}
        </Button>
      </div>
    </>
  )

  if (variant === 'inline') {
    return (
      <div className={cn("bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4", className)}>
        {content}
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className={cn("border border-amber-200 dark:border-amber-800 bg-background rounded-lg p-4", className)}>
        {content}
      </div>
    )
  }

  // Banner variant (default)
  return (
    <Alert variant="default" className={cn("border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800", className)}>
      <AlertTitle className="flex items-center gap-2">
        <Icon name="alert-triangle" className="h-4 w-4" />
        {translations.billing.rolloverMinutesAtRisk}
        <Badge variant="destructive" className="text-xs">
          -{scheduledChange.minutes_to_discard}m
        </Badge>
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-3">
          <p>
            {translations.billing.downgradeWillDiscard
              ?.replace('{newPlan}', scheduledChange.new_plan)
              ?.replace('{minutes}', scheduledChange.minutes_to_discard.toString())
              ?.replace('{date}', formatEffectiveDate(scheduledChange.effective_date)) ||
              `Your scheduled downgrade to ${scheduledChange.new_plan} will discard ${scheduledChange.minutes_to_discard} rollover minutes on ${formatEffectiveDate(scheduledChange.effective_date)}.`
            }
          </p>
          
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">{translations.billing.current}:</span> {scheduledChange.current_rollover_minutes}m • 
              <span className="font-medium ml-1">{translations.billing.newLimit}:</span> {scheduledChange.new_plan_rollover_cap}m
            </div>
            
            <Button
              onClick={handleCancelDowngrade}
              variant="outline"
              size="sm"
              className="text-amber-600 border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
            >
              {translations.billing.cancelDowngrade}
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  )
}

/**
 * Hook to check for rollover warnings across the app
 * Can be used in headers, sidebars, or other global locations
 */
export function useRolloverWarning(userId: string) {
  const { data: hasWarning, isLoading } = useQuery({
    queryKey: ['rollover-warning-check', userId],
    queryFn: async (): Promise<boolean> => {
      if (!userId) return false
      
      const params = new URLSearchParams({
        _t: Date.now().toString()
      })
      
      const response = await fetch(`/api/v1/billing/scheduled-changes/${userId}?${params}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      
      if (!response.ok) {
        if (response.status === 404) return false
        throw new Error(`Failed to check rollover warning: ${response.status}`)
      }
      
      const data = await response.json()
      return data.will_discard_rollover && data.minutes_to_discard > 0
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: false
  })

  return {
    hasRolloverWarning: hasWarning || false,
    isLoading
  }
}