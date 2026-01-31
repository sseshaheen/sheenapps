'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import type { SupportedCurrency } from '@/types/billing'

interface CurrencyFallbackNoticeProps {
  requestedCurrency: SupportedCurrency
  fallbackCurrency: SupportedCurrency
  translations: any
  variant?: 'default' | 'destructive' | 'inline'
  className?: string
}

export function CurrencyFallbackNotice({
  requestedCurrency,
  fallbackCurrency,
  translations,
  variant = 'default',
  className
}: CurrencyFallbackNoticeProps) {
  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-2 text-sm ${className}`}>
        <Icon name="info" className="h-4 w-4 text-amber-500" />
        <span className="text-muted-foreground">
          {translations.billing.chargedIn} {fallbackCurrency} • {requestedCurrency} {translations.billing.unavailable}
        </span>
      </div>
    )
  }

  return (
    <Alert variant={variant === 'destructive' ? 'destructive' : 'default'} className={className}>
      <Icon name="info" className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        {translations.billing.currencyNotAvailable}
        <Badge variant="outline" className="text-xs">
          {requestedCurrency}
        </Badge>
      </AlertTitle>
      <AlertDescription>
        {translations.billing.currencyFallbackMessage?.replace('{requested}', requestedCurrency).replace('{fallback}', fallbackCurrency) ||
          `${requestedCurrency} pricing is not available. Showing prices in ${fallbackCurrency} instead.`
        }
        {' '}
        <span className="font-medium">
          {translations.billing.chargedInFallback?.replace('{currency}', fallbackCurrency) ||
            `You will be charged in ${fallbackCurrency}.`
          }
        </span>
      </AlertDescription>
    </Alert>
  )
}
