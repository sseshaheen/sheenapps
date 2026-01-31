'use client'

import { useTranslations } from 'next-intl'
import { useNavigationHelpers } from '@/utils/navigation'
import type { MultiProviderError } from '@/types/billing'
import { isMultiProviderError } from '@/types/billing'

// Error codes that we support for localization
const SUPPORTED_ERROR_CODES = [
  'AI_LIMIT_REACHED',
  'NETWORK_TIMEOUT',
  'RATE_LIMITED',
  'AUTH_FAILED',
  'PROVIDER_UNAVAILABLE',
  'INSUFFICIENT_BALANCE',
  'INTERNAL',
  // Multi-provider error codes
  'NOT_SUPPORTED',
  'MISSING_PHONE',
  'MISSING_LOCALE',
  'PROVIDER_TIMEOUT'
] as const

export function useErrorHandler() {
  const t = useTranslations('errors')
  const { navigateToBilling } = useNavigationHelpers()
  
  const formatError = (error: any): string => {
    // Handle error codes from Worker
    if (error?.code && SUPPORTED_ERROR_CODES.includes(error.code)) {
      return t(error.code, error.params || {})
    }
    
    // Legacy error handling
    if (error?.message) {
      return error.message
    }
    
    // Fallback
    return t('INTERNAL_ERROR')
  }
  
  const handleError = (error: any) => {
    // Handle multi-provider errors with enhanced context
    if (isMultiProviderError(error)) {
      return handleMultiProviderError(error)
    }
    
    const message = formatError(error)
    
    // Special handling for balance errors
    if (error?.code === 'INSUFFICIENT_BALANCE') {
      return {
        message,
        action: () => navigateToBilling(),
        actionLabel: t('PURCHASE_CREDITS')
      }
    }
    
    // Special handling for rate limiting
    if (error?.code === 'RATE_LIMITED') {
      return {
        message,
        retryAfter: error.params?.waitTime,
        actionLabel: t('RETRY')
      }
    }
    
    // Special handling for AI limit
    if (error?.code === 'AI_LIMIT_REACHED') {
      return {
        message,
        retryAfter: error.params?.resetMinutes * 60,
        actionLabel: t('RETRY_LATER')
      }
    }
    
    return { message }
  }

  // Handle multi-provider specific errors with appropriate actions
  const handleMultiProviderError = (error: MultiProviderError) => {
    const message = formatError(error)
    
    switch (error.error) {
      case 'MISSING_PHONE':
        return {
          message,
          action: () => openPhoneCollectionDialog(error),
          actionLabel: t('COLLECT_PHONE'),
          severity: 'blocker' as const
        }
      
      case 'MISSING_LOCALE':
        return {
          message,
          action: () => switchToArabicLocale(),
          actionLabel: t('SWITCH_TO_ARABIC'),
          severity: 'blocker' as const
        }
      
      case 'NOT_SUPPORTED':
        return {
          message,
          action: error.params?.suggestedCurrency ? () => switchCurrency(error.params.suggestedCurrency) : undefined,
          actionLabel: error.params?.suggestedCurrency ? t('TRY_DIFFERENT_CURRENCY') : t('CONTACT_SUPPORT'),
          severity: 'info' as const
        }
      
      case 'PROVIDER_UNAVAILABLE':
        return {
          message,
          action: error.params?.suggestedProvider ? () => suggestAlternateProvider(error.params.suggestedProvider) : undefined,
          actionLabel: t('TRY_DIFFERENT_METHOD'),
          severity: 'info' as const
        }
      
      case 'PROVIDER_TIMEOUT':
      case 'RATE_LIMITED':
        return {
          message,
          retryAfter: error.params?.retryAfterSeconds,
          actionLabel: t('RETRY_AFTER_DELAY'),
          severity: 'warning' as const
        }
      
      default:
        return { message }
    }
  }

  // ✅ BACKEND CONFIRMED: Connect to existing error handling infrastructure
  // Enhanced actions for multi-provider payment errors
  const openPhoneCollectionDialog = (error: MultiProviderError) => {
    // ✅ Use existing error handling system
    const errorConfig = {
      code: error.error,
      title: t('billing.errors.missingPhone.title'),
      message: error.message,
      actions: [
        {
          type: 'primary' as const,
          label: t('billing.errors.missingPhone.addPhone'),
          onClick: () => {
            // Trigger phone collection modal
            window.dispatchEvent(new CustomEvent('sheen:show-phone-collection', {
              detail: { provider: error.provider, error }
            }))
          }
        },
        {
          type: 'secondary' as const,
          label: t('billing.errors.tryDifferentMethod'),
          onClick: () => {
            // Switch to alternate payment provider
            window.dispatchEvent(new CustomEvent('sheen:switch-payment-provider', {
              detail: { currentProvider: error.provider }
            }))
          }
        }
      ]
    }

    // Trigger error dialog with call-to-action buttons
    window.dispatchEvent(new CustomEvent('sheen:show-error-dialog', {
      detail: errorConfig
    }))
  }

  const switchToArabicLocale = () => {
    // ✅ Trigger locale switch using browser navigation
    const currentPath = window.location.pathname
    const currentLocale = currentPath.split('/')[1] || 'en'
    const newPath = currentPath.replace(`/${currentLocale}`, '/ar')
    window.location.href = newPath
  }

  const switchCurrency = (suggestedCurrency?: string) => {
    // ✅ Trigger currency change event
    if (suggestedCurrency) {
      window.dispatchEvent(new CustomEvent('sheen:currency-change', {
        detail: { currency: suggestedCurrency }
      }))
    }
  }

  const suggestAlternateProvider = (suggestedProvider?: string) => {
    // ✅ Show provider selection dialog
    window.dispatchEvent(new CustomEvent('sheen:show-provider-selection', {
      detail: {
        suggestedProvider,
        reason: 'provider_unavailable'
      }
    }))
  }
  
  return { formatError, handleError }
}