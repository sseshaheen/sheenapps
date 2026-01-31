'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { EnhancedBalance } from '@/types/billing'

interface BucketBreakdownProps {
  balance: EnhancedBalance
  translations: any
  className?: string
}

interface BucketWithDisplay {
  id: string
  seconds: number
  minutes: number
  type: 'daily' | 'paid'
  source?: string
  expiresAt: Date
  priority: number
  status: 'active' | 'expiring' | 'expired'
}

export function BucketBreakdown({ balance, translations, className }: BucketBreakdownProps) {
  const [showDetails, setShowDetails] = useState(false)

  // Convert buckets to display format with priority ordering
  const allBuckets: BucketWithDisplay[] = [
    // Daily buckets (highest priority)
    ...balance.buckets.daily.map((bucket, index) => ({
      id: `daily-${index}`,
      seconds: bucket.seconds,
      minutes: Math.floor(bucket.seconds / 60),
      type: 'daily' as const,
      expiresAt: new Date(bucket.expires_at),
      priority: 1,
      status: getBucketStatus(new Date(bucket.expires_at))
    })),
    // Paid buckets (lower priority, ordered by expiry)
    ...balance.buckets.paid.map((bucket, index) => ({
      id: `paid-${index}`,
      seconds: bucket.seconds,
      minutes: Math.floor(bucket.seconds / 60),
      type: 'paid' as const,
      source: bucket.source,
      expiresAt: new Date(bucket.expires_at),
      priority: 2,
      status: getBucketStatus(new Date(bucket.expires_at))
    }))
  ].sort((a, b) => {
    // Sort by priority first, then by expiry date
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.expiresAt.getTime() - b.expiresAt.getTime()
  })

  const totalMinutes = Math.floor(balance.totals.total_seconds / 60)
  const paidMinutes = Math.floor(balance.totals.paid_seconds / 60)
  const bonusMinutes = Math.floor(balance.totals.bonus_seconds / 60)

  // Calculate next expiring bucket
  const nextExpiring = allBuckets
    .filter(bucket => bucket.status === 'active')
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())[0]

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{translations.billing.aiTimeBalance}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="h-8 w-8 p-0"
          >
            <Icon 
              name={showDetails ? "chevron-up" : "chevron-down"} 
              className="h-4 w-4" 
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Balance Display */}
        <div className="text-center">
          <div className="text-3xl font-bold text-foreground">
            {totalMinutes}
          </div>
          <div className="text-sm text-muted-foreground">
            {translations.billing.totalMinutes}
          </div>
        </div>

        {/* Balance Breakdown */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-xl font-semibold text-blue-600">
              {bonusMinutes}
            </div>
            <div className="text-xs text-muted-foreground">
              {translations.billing.bonusMinutes}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-semibold text-purple-600">
              {paidMinutes}
            </div>
            <div className="text-xs text-muted-foreground">
              {translations.billing.paidMinutes}
            </div>
          </div>
        </div>

        {/* Daily Bonus Status */}
        {balance.bonus && (
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {translations.billing.dailyBonus}
              </span>
              <Badge variant="secondary" className="text-blue-700 bg-blue-100 dark:bg-blue-900">
                {balance.bonus.daily_minutes}m
              </Badge>
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400">
              {translations.billing.usedThisMonth}: {balance.bonus.used_this_month_minutes}m / {balance.bonus.monthly_cap_minutes}m
            </div>
            <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1.5 mt-2">
              <div 
                className="bg-blue-600 h-1.5 rounded-full transition-all"
                style={{ 
                  width: `${Math.min((balance.bonus.used_this_month_minutes / balance.bonus.monthly_cap_minutes) * 100, 100)}%` 
                }}
              />
            </div>
          </div>
        )}

        {/* Next Expiry Warning */}
        {nextExpiring && (
          <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Icon name="clock" className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {translations.billing.nextExpiry}
              </span>
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {nextExpiring.minutes}m expires {formatRelativeTime(nextExpiring.expiresAt, translations)}
            </div>
          </div>
        )}

        {/* Detailed Bucket View */}
        {showDetails && (
          <div className="space-y-2 border-t pt-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              {translations.billing.bucketDetails}
            </h4>
            {allBuckets.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <Icon name="folder" className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm">{translations.billing.noBuckets}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allBuckets.map((bucket) => (
                  <div
                    key={bucket.id}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg border",
                      bucket.status === 'expired' && "opacity-50",
                      bucket.status === 'expiring' && "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20",
                      bucket.status === 'active' && "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/20"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon 
                        name={bucket.type === 'daily' ? 'star' : 'credit-card'} 
                        className={cn(
                          "h-3 w-3",
                          bucket.type === 'daily' ? 'text-blue-600' : 'text-purple-600'
                        )}
                      />
                      <div>
                        <div className="text-sm font-medium">
                          {bucket.minutes}m
                        </div>
                        {bucket.source && (
                          <div className="text-xs text-muted-foreground">
                            {bucket.source}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        {formatRelativeTime(bucket.expiresAt, translations)}
                      </div>
                      <Badge
                        variant={bucket.status === 'active' ? 'default' : bucket.status === 'expiring' ? 'secondary' : 'outline'}
                        className="text-xs"
                      >
                        {translations.billing[bucket.status] || bucket.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function getBucketStatus(expiresAt: Date): 'active' | 'expiring' | 'expired' {
  const now = new Date()
  const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)
  
  if (hoursUntilExpiry <= 0) return 'expired'
  if (hoursUntilExpiry <= 24) return 'expiring'
  return 'active'
}

function formatRelativeTime(date: Date, translations: any): string {
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMs <= 0) return translations.billing.expired
  if (diffHours < 1) return translations.billing.lessThanHour
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  
  return date.toLocaleDateString()
}