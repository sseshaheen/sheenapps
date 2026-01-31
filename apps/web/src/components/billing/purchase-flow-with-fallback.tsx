'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/routing'
import { useAuthStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CurrencyAwarePurchaseButton } from './currency-aware-purchase-button'
import { CurrencyFallbackNotice } from './currency-fallback-notice'
import { VoucherPaymentDialog } from './voucher-payment-dialog'
import { PhoneCollectionDialog } from './phone-collection-dialog'
import Icon from '@/components/ui/icon'
import { usePricingCatalog, useCurrencyPreference } from '@/hooks/use-pricing-catalog'
import { useEnhancedBalance } from '@/hooks/use-ai-time-balance'
import { useErrorHandler } from '@/hooks/use-error-handler'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { multiProviderBilling } from '@/services/multi-provider-billing'
import type { 
  SupportedCurrency, 
  Currency,
  SubscriptionPlan, 
  Package,
  MultiProviderCheckoutResult,
  VoucherStatusResponse,
  MultiProviderError
} from '@/types/billing'
import { 
  isVoucherResult, 
  isRedirectResult, 
  isMultiProviderError,
  getRegionForCurrency 
} from '@/types/billing'

interface PurchaseFlowWithFallbackProps {
  translations: any
  className?: string
  defaultTab?: 'subscriptions' | 'packages'
  onPurchaseSuccess?: (item: SubscriptionPlan | Package, currency: SupportedCurrency) => void
}

export function PurchaseFlowWithFallback({ 
  translations, 
  className,
  defaultTab = 'subscriptions',
  onPurchaseSuccess
}: PurchaseFlowWithFallbackProps) {
  const router = useRouter()
  const { user } = useAuthStore()
  const { getCurrencyPreference, setCurrencyPreference, supportedCurrencies } = useCurrencyPreference()
  const currency = getCurrencyPreference()
  const { data: catalog, isLoading: catalogLoading, error: catalogError } = usePricingCatalog(currency)
  const { data: balance } = useEnhancedBalance(user?.id || '')
  
  const [selectedTab, setSelectedTab] = useState(defaultTab)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [voucherResult, setVoucherResult] = useState<MultiProviderCheckoutResult | null>(null)
  const [phoneCollectionNeeded, setPhoneCollectionNeeded] = useState<{
    error: MultiProviderError
    retry: () => void
  } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  
  const { handleError } = useErrorHandler()

  // Handle currency change
  const handleCurrencyChange = (newCurrency: SupportedCurrency) => {
    // Filter to only supported currencies by the hook
    const supportedCurrenciesForHook = ["USD", "EGP", "SAR", "AED", "EUR", "GBP"] as const;
    if (supportedCurrenciesForHook.includes(newCurrency as any)) {
      setCurrencyPreference(newCurrency as "USD" | "EGP" | "SAR" | "AED" | "EUR" | "GBP")
    }
    setPurchaseError(null) // Clear any previous errors
  }

  // Handle purchase - supports both subscriptions (old) and packages (new multi-provider)
  const handlePurchase = async (item: SubscriptionPlan | Package, currency: SupportedCurrency) => {
    if (!user) {
      router.push('/auth/login')
      return
    }

    setPurchaseError(null)
    setIsProcessing(true)
    
    try {
      const itemType = selectedTab === 'subscriptions' ? 'subscription' : 'package'
      
      if (itemType === 'package') {
        // NEW: Multi-provider package purchase
        await handlePackagePurchase(item as Package, currency)
      } else {
        // EXISTING: Subscription purchase (keep current logic)
        await handleSubscriptionPurchase(item as SubscriptionPlan, currency)
      }
      
    } catch (error) {
      logger.error('Purchase failed', {
        item_key: item.key,
        item_type: selectedTab,
        currency,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'billing')
      
      setPurchaseError(error instanceof Error ? error.message : 'Purchase failed')
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle package purchase with multi-provider support
  const handlePackagePurchase = async (item: Package, currency: SupportedCurrency) => {
    const region = getRegionForCurrency(currency)
    const locale = (document.documentElement.lang as 'en' | 'ar') || 'en'
    
    logger.info('Multi-provider package purchase initiated', {
      package_key: item.key,
      currency,
      region,
      locale
    }, 'billing')

    try {
      const result = await multiProviderBilling.createCheckout({
        packageKey: item.key,
        currency,
        userId: user!.id,
        region,
        locale
      })

      // Handle multi-provider checkout result
      if (isRedirectResult(result)) {
        // Redirect-based payment (Stripe, PayTabs, STC Pay)
        logger.info('Redirecting to payment provider', {
          provider: result.payment_provider,
          checkout_url: result.checkout_url
        }, 'billing')
        
        window.location.assign(result.checkout_url)
        
      } else if (isVoucherResult(result)) {
        // Voucher-based payment (Fawry, Paymob)
        logger.info('Opening voucher payment dialog', {
          provider: result.payment_provider,
          voucher_reference: result.voucher_reference
        }, 'billing')
        
        setVoucherResult(result)
      }

      // Call success callback
      if (onPurchaseSuccess) {
        onPurchaseSuccess(item, currency)
      }

    } catch (error) {
      // Handle multi-provider specific errors
      if (isMultiProviderError(error)) {
        const errorResult = handleError(error)
        
        // Handle phone collection requirement
        if (error.error === 'MISSING_PHONE') {
          setPhoneCollectionNeeded({
            error,
            retry: () => handlePackagePurchaseWithPhone(item, currency, error.provider!)
          })
          return
        }
        
        // Handle other multi-provider errors
        setPurchaseError(errorResult.message)
        
        // Execute error actions if available
        if (errorResult.action) {
          errorResult.action()
        }
        
        return
      }
      
      // Re-throw for general error handling
      throw error
    }
  }

  // Handle subscription purchase (existing logic)
  const handleSubscriptionPurchase = async (item: SubscriptionPlan, currency: SupportedCurrency) => {
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sheen-locale': document.documentElement.lang || 'en'
      },
      body: JSON.stringify({
        planId: item.key === 'starter' ? 'starter' : 
                item.key === 'growth' ? 'growth' : 
                item.key === 'scale' ? 'scale' : 'starter',
        trial: false
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Subscription checkout failed: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.success || !data.url) {
      throw new Error(data.error || 'Failed to create subscription checkout session')
    }

    // Redirect to Stripe checkout
    window.location.assign(data.url)
    
    // Call success callback
    if (onPurchaseSuccess) {
      onPurchaseSuccess(item, currency)
    }
  }

  // Retry package purchase with collected phone number
  const handlePackagePurchaseWithPhone = async (item: Package, currency: SupportedCurrency, provider: string) => {
    // Phone will be stored in sessionStorage by the phone collection dialog
    setPhoneCollectionNeeded(null)
    
    // Retry the purchase - phone will be automatically picked up from session
    await handlePackagePurchase(item, currency)
  }

  // Handle phone collection completion
  const handlePhoneCollected = (phone: string) => {
    if (phoneCollectionNeeded) {
      multiProviderBilling.storePhoneForSession(phone, getRegionForCurrency(currency))
      phoneCollectionNeeded.retry()
    }
  }

  // Handle voucher payment completion
  const handleVoucherPaymentComplete = (result: VoucherStatusResponse) => {
    logger.info('Voucher payment completed', {
      order_id: result.order_id,
      status: result.status,
      provider: result.payment_provider
    }, 'billing')
    
    setVoucherResult(null)
    
    // Refresh balance after successful payment
    // The enhanced balance hook should automatically refresh
    
    // Show success message or redirect as needed
    if (onPurchaseSuccess && voucherResult) {
      // Find the original item from the voucher result
      const originalItem = catalog?.packages.find(pkg => 
        pkg.key === voucherResult.session_id.split('_')[1] // Extract package key from session_id
      )
      if (originalItem) {
        onPurchaseSuccess(originalItem, currency)
      }
    }
  }

  if (catalogLoading) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <div className="text-center">
          <Icon name="loader-2" className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">{translations.billing.loadingCatalog}</p>
        </div>
      </div>
    )
  }

  if (catalogError || !catalog) {
    return (
      <div className={cn("p-4", className)}>
        <Alert variant="destructive">
          <Icon name="alert-circle" className="h-4 w-4" />
          <AlertTitle>{translations.billing.errorTitle}</AlertTitle>
          <AlertDescription>
            {translations.billing.catalogLoadError}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const hasFallback = !!catalog.currency_fallback_from
  const subscriptions = catalog.subscriptions || []
  const packages = catalog.packages || []

  return (
    <div className={cn("space-y-6", className)}>
      {/* Currency selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{translations.billing.choosePlan}</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{translations.billing.currency}:</span>
          <div className="flex gap-1">
            {supportedCurrencies.slice(0, 4).map((curr) => (
              <Button
                key={curr}
                variant={curr === currency ? "default" : "outline"}
                size="sm"
                onClick={() => handleCurrencyChange(curr)}
                className="text-xs"
              >
                {curr}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Currency fallback notice */}
      {hasFallback && (
        <CurrencyFallbackNotice
          requestedCurrency={catalog.currency_fallback_from! as Currency}
          fallbackCurrency={currency}
          translations={translations}
        />
      )}

      {/* Purchase error */}
      {purchaseError && (
        <Alert variant="destructive">
          <Icon name="alert-circle" className="h-4 w-4" />
          <AlertTitle>{translations.billing.purchaseError}</AlertTitle>
          <AlertDescription>{purchaseError}</AlertDescription>
        </Alert>
      )}

      {/* Current balance info */}
      {balance && (
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{translations.billing.currentBalance}</p>
              <p className="text-2xl font-bold text-foreground">
                {Math.floor(balance.totals.total_seconds / 60)}m
              </p>
            </div>
            <Badge variant="outline">
              {balance.plan_key || 'free'}
            </Badge>
          </div>
        </div>
      )}

      {/* Subscription and Package tabs */}
      <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as 'subscriptions' | 'packages')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="subscriptions">
            <Icon name="calendar" className="h-4 w-4 mr-2" />
            {translations.billing.subscriptions}
          </TabsTrigger>
          <TabsTrigger value="packages">
            <Icon name="package" className="h-4 w-4 mr-2" />
            {translations.billing.packages}
          </TabsTrigger>
        </TabsList>

        {/* Subscriptions */}
        <TabsContent value="subscriptions" className="space-y-4">
          {subscriptions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Icon name="calendar" className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{translations.billing.noSubscriptions}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subscriptions.map((subscription) => (
                <Card key={subscription.key} className={cn(
                  "relative",
                  subscription.popular && "border-primary border-2"
                )}>
                  {subscription.popular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-primary">{translations.billing.popular}</Badge>
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {subscription.name}
                      {subscription.trial_days && (
                        <Badge variant="secondary" className="text-xs">
                          {subscription.trial_days}d {translations.billing.trial}
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="text-2xl font-bold">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: subscription.currency,
                        minimumFractionDigits: subscription.price % 1 === 0 ? 0 : 2
                      }).format(subscription.price)}
                      <span className="text-sm font-normal text-muted-foreground ml-1">
                        /{translations.billing.month}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 mb-4">
                      {subscription.features?.map((feature, index) => (
                        <li key={index} className="flex items-center gap-2 text-sm">
                          <Icon name="check" className="h-4 w-4 text-green-500 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <CurrencyAwarePurchaseButton
                      item={subscription}
                      itemType="subscription"
                      onPurchase={handlePurchase}
                      translations={translations}
                      variant={subscription.popular ? "default" : "outline"}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Packages */}
        <TabsContent value="packages" className="space-y-4">
          {packages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Icon name="package" className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{translations.billing.noPackages}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {packages.map((pkg) => (
                <Card key={pkg.key} className={cn(
                  "text-center",
                  pkg.popular && "border-primary border-2"
                )}>
                  {pkg.popular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-primary">{translations.billing.popular}</Badge>
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle>{pkg.name}</CardTitle>
                    <div className="text-xl font-bold">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: pkg.currency,
                        minimumFractionDigits: pkg.price % 1 === 0 ? 0 : 2
                      }).format(pkg.price)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {pkg.minutes} {translations.billing.minutes}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {pkg.bonus_minutes && (
                      <div className="mb-4">
                        <Badge variant="secondary" className="text-xs">
                          +{pkg.bonus_minutes}m {translations.billing.bonus}
                        </Badge>
                      </div>
                    )}
                    <CurrencyAwarePurchaseButton
                      item={pkg}
                      itemType="package"
                      onPurchase={handlePurchase}
                      translations={translations}
                      variant={pkg.popular ? "default" : "outline"}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Multi-Provider Modals */}
      {voucherResult && isVoucherResult(voucherResult) && (
        <VoucherPaymentDialog
          isOpen={true}
          onClose={() => setVoucherResult(null)}
          result={voucherResult}
          onPaymentComplete={handleVoucherPaymentComplete}
          translations={{
            title: translations.billing?.voucherPayment || 'Complete Payment',
            paymentReference: translations.billing?.paymentReference || 'Payment Reference',
            paymentInstructions: translations.billing?.paymentInstructions || 'Payment Instructions',
            timeRemaining: translations.billing?.timeRemaining || 'Time Remaining',
            voucherExpired: translations.billing?.voucherExpired || 'Payment voucher has expired',
            copyReference: translations.billing?.copyReference || 'Copy Reference',
            referenceCopied: translations.billing?.referenceCopied || 'Reference copied!',
            generateNewVoucher: translations.billing?.generateNewVoucher || 'Generate New Voucher',
            payWith: translations.billing?.payWith || 'Pay with {provider}',
            close: translations.common?.close || 'Close'
          }}
        />
      )}

      {phoneCollectionNeeded && (
        <PhoneCollectionDialog
          isOpen={true}
          onClose={() => setPhoneCollectionNeeded(null)}
          onPhoneCollected={handlePhoneCollected}
          region={getRegionForCurrency(currency)}
          provider={phoneCollectionNeeded.error.provider!}
          translations={{
            title: translations.billing?.collectPhone || 'Phone Number Required',
            description: translations.billing?.phoneDescription || '{provider} requires a phone number for payment processing.',
            phoneLabel: translations.billing?.phoneLabel || 'Phone Number',
            phoneHelp: translations.billing?.phoneHelp || 'Enter your phone number in international format',
            submit: translations.common?.submit || 'Continue',
            cancel: translations.common?.cancel || 'Cancel',
            invalidPhone: translations.billing?.invalidPhone || 'Invalid phone number format',
            phoneRequired: translations.billing?.phoneRequired || 'Phone number is required'
          }}
        />
      )}
    </div>
  )
}