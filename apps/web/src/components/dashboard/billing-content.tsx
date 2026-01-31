'use client'

import { useState } from 'react'
import { useRouter, Link } from '@/i18n/routing'
import { useAuthStore } from '@/store'
import { DashboardLayout } from './dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading'
import { useBillingOverview } from '@/hooks/use-billing-overview'
import { useCurrencyPreference } from '@/hooks/use-pricing-catalog'
import { BucketBreakdown } from '@/components/billing/bucket-breakdown'
import { EnhancedBalanceDisplay } from '@/components/billing/enhanced-balance-display'
import { UsageAnalyticsChart } from '@/components/billing/usage-analytics-chart'
import { ROUTES } from '@/i18n/routes'
import Icon from '@/components/ui/icon'

interface BillingContentProps {
  translations: any
  locale: string
}

export function BillingContent({ translations, locale }: BillingContentProps) {
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore()
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  
  // Consolidated billing overview - single API call for balance + usage + catalog
  const { getCurrencyPreference } = useCurrencyPreference()
  const currency = getCurrencyPreference()
  const { data: overview, isLoading, error, refetch: refetchBalance } = useBillingOverview(user?.id || '', currency)

  const balance = overview?.balance ? { version: 'overview', ...overview.balance } : null
  // overview.usage has shape { total_seconds, by_operation } which doesn't match
  // UsageAnalyticsChart's expected { daily?, weekly?, monthly? } time-series format.
  // Pass undefined until the overview API returns time-series usage data.
  const usageData = undefined

  const handlePurchase = () => {
    // Navigate to pricing page where one-time packages are available
    router.push(ROUTES.PRICING_PAGE)
  }

  const handleManageSubscription = () => {
    // Navigate to subscription management
    router.push('/billing/manage')
  }

  const handleUpgrade = () => {
    // Navigate to pricing page for plan selection
    router.push(ROUTES.PRICING_PAGE)
  }

  // Helper function to handle error retry
  const handleRetry = () => {
    refetchBalance()
  }

  // Handle authentication states
  if (authLoading) {
    return (
      <DashboardLayout translations={translations} locale={locale}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <DashboardLayout translations={translations} locale={locale}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Icon name="lock" className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Authentication Required</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Please sign in to view your billing information.
            </p>
            <Button onClick={() => router.push('/auth/login')} size="sm">
              Sign In
            </Button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (isLoading) {
    return (
      <DashboardLayout translations={translations} locale={locale}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-sm text-muted-foreground">{translations.billing.loading}</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !balance) {
    return (
      <DashboardLayout translations={translations} locale={locale}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Icon name="alert-circle" className="w-12 h-12 text-destructive mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">{translations.billing.error}</p>
            <Button onClick={handleRetry} variant="outline" size="sm">
              <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
              {translations.billing.retry}
            </Button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout translations={translations} locale={locale}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{translations.billing.title}</h1>
            <p className="text-muted-foreground mt-2">{translations.billing.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Period selector for analytics */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {(['daily', 'weekly', 'monthly'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-3 py-1 text-sm rounded-md transition-all ${
                    selectedPeriod === period
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {translations.billing.periods?.[period] || period}
                </button>
              ))}
            </div>
            <Button onClick={handlePurchase} size="sm">
              <Icon name="plus" className="h-4 w-4 mr-2" />
              {translations.billing.addTime}
            </Button>
          </div>
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Enhanced Balance Display */}
          <div className="xl:col-span-1">
            <EnhancedBalanceDisplay
              balance={balance}
              translations={translations}
              onPurchase={handlePurchase}
              onManageSubscription={handleManageSubscription}
            />
          </div>
          
          {/* Bucket Breakdown */}
          <div className="xl:col-span-1">
            <BucketBreakdown
              balance={balance}
              translations={translations}
            />
          </div>
          
          {/* Usage Analytics */}
          <div className="xl:col-span-1 lg:col-span-2 xl:col-span-1">
            <UsageAnalyticsChart
              usageData={usageData}
              translations={translations}
              period={selectedPeriod}
            />
          </div>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>{translations.billing.quickActions}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button 
                variant="outline" 
                className="h-20 flex-col gap-2"
                onClick={handlePurchase}
              >
                <Icon name="plus" className="h-6 w-6" />
                <span className="text-sm">{translations.billing.buyMinutes}</span>
              </Button>
              
              <Button 
                variant="outline" 
                className="h-20 flex-col gap-2"
                onClick={handleUpgrade}
              >
                <Icon name="zap" className="h-6 w-6" />
                <span className="text-sm">{translations.billing.upgrade}</span>
              </Button>
              
              <Button 
                variant="outline" 
                className="h-20 flex-col gap-2"
                onClick={handleManageSubscription}
              >
                <Icon name="settings" className="h-6 w-6" />
                <span className="text-sm">{translations.billing.manage}</span>
              </Button>
              
              <Button 
                variant="outline" 
                className="h-20 flex-col gap-2"
                onClick={() => router.push('/billing/history')}
              >
                <Icon name="clock" className="h-6 w-6" />
                <span className="text-sm">{translations.billing.history}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}