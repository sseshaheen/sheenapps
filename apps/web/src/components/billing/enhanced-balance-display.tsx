'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { EnhancedBalance } from '@/types/billing'

interface EnhancedBalanceDisplayProps {
  balance: EnhancedBalance
  translations: any
  onPurchase?: () => void
  onManageSubscription?: () => void
  className?: string
}

export function EnhancedBalanceDisplay({ 
  balance, 
  translations, 
  onPurchase, 
  onManageSubscription, 
  className 
}: EnhancedBalanceDisplayProps) {
  const totalMinutes = Math.floor(balance.totals.total_seconds / 60)
  const paidMinutes = Math.floor(balance.totals.paid_seconds / 60)
  const bonusMinutes = Math.floor(balance.totals.bonus_seconds / 60)
  const dailyBonusMinutes = balance.bonus?.daily_minutes || 0
  
  // Calculate usage percentage for daily bonus
  const dailyBonusUsage = balance.bonus ? 
    (balance.bonus.used_this_month_minutes / balance.bonus.monthly_cap_minutes) * 100 : 0

  // Get plan info
  const planKey = balance.plan_key || 'free'
  const subscriptionStatus = balance.subscription_status
  const hasActiveSubscription = subscriptionStatus && ['active', 'trialing'].includes(subscriptionStatus)

  // Calculate warning levels
  const isLowBalance = totalMinutes < 60  // Less than 1 hour
  const isCriticalBalance = totalMinutes < 15  // Less than 15 minutes

  // Get next expiry info
  const nextExpiryAt = balance.totals.next_expiry_at ? new Date(balance.totals.next_expiry_at) : null
  const nextExpiryHours = nextExpiryAt ? 
    Math.floor((nextExpiryAt.getTime() - Date.now()) / (1000 * 60 * 60)) : null

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Icon name="clock" className="h-5 w-5" />
            {translations.billing.aiTimeBalance}
          </CardTitle>
          {hasActiveSubscription ? (
            <Button 
              variant="outline" 
              size="sm"
              onClick={onManageSubscription}
            >
              <Icon name="settings" className="h-4 w-4 mr-2" />
              {translations.billing.manage}
            </Button>
          ) : (
            <Button 
              size="sm"
              onClick={onPurchase}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Icon name="plus" className="h-4 w-4 mr-2" />
              {translations.billing.addTime}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Balance Display */}
        <div className="text-center">
          <div 
            className={cn(
              "text-4xl font-bold transition-colors",
              isCriticalBalance && "text-red-600",
              isLowBalance && !isCriticalBalance && "text-amber-600",
              !isLowBalance && "text-foreground"
            )}
          >
            {totalMinutes}
          </div>
          <div className="text-sm text-muted-foreground">
            {translations.billing.minutesRemaining}
          </div>
          {(isLowBalance || isCriticalBalance) && (
            <Badge 
              variant={isCriticalBalance ? "destructive" : "secondary"}
              className="mt-2"
            >
              <Icon name="alert-triangle" className="h-3 w-3 mr-1" />
              {isCriticalBalance ? 
                translations.billing.criticalBalance : 
                translations.billing.lowBalance}
            </Badge>
          )}
        </div>

        {/* Balance Breakdown */}
        <div className="space-y-4">
          {/* Bonus Minutes */}
          {bonusMinutes > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-600" />
                  <span className="text-sm font-medium">{translations.billing.bonusMinutes}</span>
                </div>
                <span className="text-sm font-semibold text-blue-600">{bonusMinutes}m</span>
              </div>
              
              {/* Daily Bonus Progress */}
              {balance.bonus && (
                <div className="ml-5 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{translations.billing.dailyEarned}: {dailyBonusMinutes}m</span>
                    <span>{balance.bonus.used_this_month_minutes}m / {balance.bonus.monthly_cap_minutes}m</span>
                  </div>
                  <Progress 
                    value={Math.min(dailyBonusUsage, 100)} 
                    className="h-1.5"
                  />
                </div>
              )}
            </div>
          )}

          {/* Paid Minutes */}
          {paidMinutes > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-600" />
                <span className="text-sm font-medium">{translations.billing.paidMinutes}</span>
              </div>
              <span className="text-sm font-semibold text-purple-600">{paidMinutes}m</span>
            </div>
          )}
        </div>

        {/* Plan Information */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">{translations.billing.currentPlan}</span>
            <Badge variant="outline" className="capitalize">
              {translations.billing[planKey] || planKey}
            </Badge>
          </div>
          {subscriptionStatus && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{translations.billing.status}</span>
              <Badge 
                variant={hasActiveSubscription ? "default" : "secondary"}
                className="capitalize"
              >
                {translations.billing[subscriptionStatus] || subscriptionStatus}
              </Badge>
            </div>
          )}
        </div>

        {/* Expiry Warning */}
        {nextExpiryAt && nextExpiryHours !== null && nextExpiryHours <= 168 && ( // 7 days
          <div 
            className={cn(
              "rounded-lg p-3",
              nextExpiryHours <= 24 ? 
                "bg-red-50 dark:bg-red-950/20" : 
                "bg-amber-50 dark:bg-amber-950/20"
            )}
          >
            <div className="flex items-center gap-2">
              <Icon 
                name="clock" 
                className={cn(
                  "h-4 w-4",
                  nextExpiryHours <= 24 ? "text-red-600" : "text-amber-600"
                )}
              />
              <span 
                className={cn(
                  "text-sm font-medium",
                  nextExpiryHours <= 24 ? 
                    "text-red-700 dark:text-red-300" : 
                    "text-amber-700 dark:text-amber-300"
                )}
              >
                {nextExpiryHours <= 24 ? 
                  translations.billing.expiringToday : 
                  translations.billing.expiringSoon}
              </span>
            </div>
            <div 
              className={cn(
                "text-xs mt-1",
                nextExpiryHours <= 24 ? 
                  "text-red-600 dark:text-red-400" : 
                  "text-amber-600 dark:text-amber-400"
              )}
            >
              {nextExpiryHours <= 1 ? 
                translations.billing.expiresIn1Hour :
                nextExpiryHours <= 24 ?
                  `${translations.billing.expiresIn} ${nextExpiryHours}h` :
                  `${translations.billing.expiresIn} ${Math.floor(nextExpiryHours / 24)}d`
              }
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2">
          {!hasActiveSubscription && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={onPurchase}
            >
              <Icon name="zap" className="h-4 w-4 mr-2" />
              {translations.billing.upgrade}
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={onPurchase}
          >
            <Icon name="plus" className="h-4 w-4 mr-2" />
            {translations.billing.buyMinutes}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}