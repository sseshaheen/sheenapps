'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import { usePricingCatalog, useCurrencyPreference } from '@/hooks/use-pricing-catalog'
import { cn } from '@/lib/utils'
import type { SupportedCurrency, SubscriptionPlan, Package } from '@/types/billing'

interface CurrencyAwarePurchaseButtonProps {
  item: SubscriptionPlan | Package
  itemType: 'subscription' | 'package'
  onPurchase: (item: SubscriptionPlan | Package, currency: SupportedCurrency) => void
  translations: any
  className?: string
  size?: 'sm' | 'default' | 'lg'
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  disabled?: boolean
}

export function CurrencyAwarePurchaseButton({
  item,
  itemType,
  onPurchase,
  translations,
  className,
  size = 'default',
  variant = 'default',
  disabled
}: CurrencyAwarePurchaseButtonProps) {
  const { getCurrencyPreference } = useCurrencyPreference()
  const currency = getCurrencyPreference()
  const { data: catalog, isLoading: catalogLoading } = usePricingCatalog(currency)
  
  const [isProcessing, setIsProcessing] = useState(false)

  // Find the current item in the catalog to get accurate pricing
  const currentItem = catalog ? (
    itemType === 'subscription' 
      ? catalog.subscriptions.find(sub => sub.key === item.key)
      : catalog.packages.find(pkg => pkg.key === item.key)
  ) : item

  const handlePurchase = async () => {
    if (!currentItem || isProcessing) return
    
    setIsProcessing(true)
    try {
      await onPurchase(currentItem, currency)
    } finally {
      setIsProcessing(false)
    }
  }

  // Get pricing information
  const price = currentItem?.price || item.price
  const originalCurrency = currentItem?.currency || item.currency
  const fallbackFrom = catalog?.currency_fallback_from

  // Determine if this is a fallback currency situation
  const isFallback = fallbackFrom && fallbackFrom !== originalCurrency

  // Format price display
  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: price % 1 === 0 ? 0 : 2
    }).format(price)
  }

  const isLoading = catalogLoading || isProcessing

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        onClick={handlePurchase}
        disabled={disabled || isLoading}
        size={size}
        variant={variant}
        className={cn(
          "w-full relative",
          isProcessing && "cursor-not-allowed"
        )}
      >
        {isLoading ? (
          <>
            <Icon name="loader-2" className="h-4 w-4 mr-2 animate-spin" />
            {translations.billing.processing}
          </>
        ) : (
          <>
            <Icon name="credit-card" className="h-4 w-4 mr-2" />
            {itemType === 'subscription' ? translations.billing.subscribe : translations.billing.purchase} 
            {' '}
            {formatPrice(price, originalCurrency)}
          </>
        )}
      </Button>

      {/* Currency fallback notification */}
      {isFallback && !isLoading && (
        <div className="flex items-center justify-center gap-2">
          <Badge variant="secondary" className="text-xs">
            <Icon name="info" className="h-3 w-3 mr-1" />
            {translations.billing.chargedIn} {originalCurrency}
          </Badge>
          <span className="text-xs text-muted-foreground">
            ({currency} {translations.billing.unavailable})
          </span>
        </div>
      )}

      {/* Tax inclusive indicator */}
      {currentItem?.tax_inclusive && !isLoading && (
        <div className="text-center">
          <span className="text-xs text-muted-foreground">
            {translations.billing.taxInclusive}
          </span>
        </div>
      )}

      {/* Trial indicator for subscriptions */}
      {itemType === 'subscription' && (currentItem as SubscriptionPlan)?.trial_days && !isLoading && (
        <div className="text-center">
          <Badge variant="outline" className="text-xs">
            <Icon name="calendar" className="h-3 w-3 mr-1" />
            {(currentItem as SubscriptionPlan).trial_days} {translations.billing.dayTrial}
          </Badge>
        </div>
      )}
    </div>
  )
}