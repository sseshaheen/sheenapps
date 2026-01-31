'use client'

import { useState, Suspense } from 'react'
import { m } from '@/components/ui/motion-provider'
import { LoadingSpinner } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { usePricingCatalog, useCurrencyPreference, useCurrencyFallbackNotification } from '@/hooks/use-pricing-catalog'
import { SubscriptionPlans } from './subscription-plans'
import { OneOffPackages } from './one-off-packages' 
import { BillingToggle } from './billing-toggle'
import { CurrencySelector } from './currency-selector'

interface PricingPageContentProps {
  translations: any
  locale: string
  message?: string // Expert: Support for UX messaging
}

export function PricingPageContent({ translations, locale, message }: PricingPageContentProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const { currency } = useCurrencyPreference() // Use reactive currency state directly
  
  const { data: catalog, isLoading, error, refetch } = usePricingCatalog(currency)
  const fallbackNotification = useCurrencyFallbackNotification(catalog)

  const handleRetry = () => {
    refetch()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-pink-600/20 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10 py-16 sm:py-20 md:py-24">
        {/* Header Section */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12 sm:mb-16"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4 sm:mb-6">
            <Icon name="check-circle" className="w-4 h-4 text-purple-400" />
            <span className="text-xs sm:text-sm text-purple-300">
              {translations.pricingPage.badge}
            </span>
          </div>
          
          {/* Title */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 sm:mb-6 leading-tight">
            {translations.pricingPage.title}
          </h1>
          
          {/* Subtitle */}
          <p className="text-base sm:text-lg md:text-xl text-gray-300 max-w-3xl mx-auto mb-8 leading-relaxed px-2">
            {translations.pricingPage.subtitle}
          </p>

          {/* Expert: Neutral message banner for entitlements feedback */}
          {message === 'no_active_subscription' && (
            <m.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto mb-8"
            >
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Icon name="info" className="w-5 h-5 text-blue-400" />
                  <span className="text-sm font-medium text-blue-300">
                    Payment Processing
                  </span>
                </div>
                <p className="text-sm text-blue-200">
                  We couldn't find an active subscription yet. If you just paid, this can take a moment to process.
                </p>
              </div>
            </m.div>
          )}

          {/* Controls Row */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mb-8">
            {/* Billing Toggle */}
            <BillingToggle
              billingCycle={billingCycle}
              onBillingCycleChange={setBillingCycle}
              translations={translations.pricingPage}
              locale={locale}
            />
            
            {/* Currency Selector */}
            <CurrencySelector 
              translations={translations.pricingPage}
            />
          </div>

          {/* Currency Fallback Notification */}
          {fallbackNotification && (
            <m.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm mb-6"
            >
              <Icon name="info" className="w-4 h-4" />
              <span>{fallbackNotification.message}</span>
            </m.div>
          )}
        </m.div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <LoadingSpinner size="lg" className="text-purple-400" />
              <p className="mt-4 text-sm text-gray-400">
                {translations.pricingPage.loadingPlans}
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center py-20"
          >
            <Card className="bg-red-900/20 border-red-500/20">
              <CardContent className="text-center p-8">
                <Icon name="alert-triangle" className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-red-300 mb-2">
                  {translations.pricingPage.errorLoading}
                </h3>
                <Button 
                  onClick={handleRetry}
                  variant="outline"
                  className="border-red-500/20 text-red-300 hover:bg-red-500/10"
                >
                  <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
                  {translations.pricingPage.retryButton}
                </Button>
              </CardContent>
            </Card>
          </m.div>
        )}

        {/* Content Sections */}
        {catalog && !isLoading && (
          <div className="space-y-16 sm:space-y-20">
            {/* Subscription Plans Section */}
            {catalog.subscriptions && catalog.subscriptions.length > 0 && (
              <m.section
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                    {translations.pricingPage?.subscriptions?.title || 'Subscription Plans'}
                  </h2>
                  <p className="text-gray-400 max-w-2xl mx-auto">
                    {translations.pricingPage?.subscriptions?.description || 'Monthly or yearly billing with full platform access'}
                  </p>
                </div>
                
                <Suspense fallback={<LoadingSpinner size="lg" />}>
                  <SubscriptionPlans
                    subscriptions={catalog.subscriptions}
                    billingCycle={billingCycle}
                    currency={currency}
                    translations={translations}
                    locale={locale}
                  />
                </Suspense>
              </m.section>
            )}

            {/* One-Off Packages Section */}
            {catalog.packages && catalog.packages.length > 0 && (
              <m.section
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
              >
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                    {translations.pricingPage?.packages?.title || 'One-Time Top-Ups'}
                  </h2>
                  <p className="text-gray-400 max-w-2xl mx-auto">
                    {translations.pricingPage?.packages?.description || 'Purchase additional credits anytime. Credits never expire.'}
                  </p>
                </div>
                
                <Suspense fallback={<LoadingSpinner size="lg" />}>
                  <OneOffPackages
                    packages={catalog.packages}
                    currency={currency}
                    translations={translations}
                    locale={locale}
                  />
                </Suspense>
              </m.section>
            )}

            {/* Trust Guarantees Section */}
            <m.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 rounded-3xl p-8 border border-purple-500/20"
            >
              <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-8">
                {translations.pricingPage?.guarantees?.title || 'Our Promise to You'}
              </h2>
              
              <div className="grid md:grid-cols-3 gap-8">
                {/* Money Back Guarantee */}
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 flex items-center justify-center mx-auto mb-4">
                    <Icon name="shield-check" className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {translations.pricingPage?.guarantees?.moneyBack?.title || '30-Day Money Back'}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {translations.pricingPage?.guarantees?.moneyBack?.description || 'Full refund if you\'re not satisfied'}
                  </p>
                </div>

                {/* Cancel Anytime */}
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 flex items-center justify-center mx-auto mb-4">
                    <Icon name="x-circle" className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {translations.pricingPage?.guarantees?.cancelAnytime?.title || 'Cancel Anytime'}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {translations.pricingPage?.guarantees?.cancelAnytime?.description || 'No contracts or cancellation fees'}
                  </p>
                </div>

                {/* Data Export */}
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center mx-auto mb-4">
                    <Icon name="download" className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {translations.pricingPage?.guarantees?.dataExport?.title || 'Own Your Data'}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {translations.pricingPage?.guarantees?.dataExport?.description || 'Export everything, anytime'}
                  </p>
                </div>
              </div>
            </m.section>
          </div>
        )}
      </div>
    </div>
  )
}