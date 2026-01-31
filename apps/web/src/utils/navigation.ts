'use client'

import { useRouter, redirect as intlRedirect } from '@/i18n/routing'
import { getPathname } from '@/i18n/routing'
import { useLocale } from 'next-intl'
import { ROUTES } from '@/i18n/routes'

/**
 * Server-side locale-aware redirect helper
 * Converts string URLs to next-intl redirect format
 * Use this when you have a string URL and need to redirect with locale
 */
export function redirectWithLocale(href: string, locale: string): never {
  return intlRedirect({ href, locale })
}

/**
 * Hook for locale-aware programmatic navigation
 * Hides getPathname/router juggling; drops straight into any component
 */
export function useNavigationHelpers() {
  const router = useRouter()
  const locale = useLocale()

  const navigateToBilling = () => {
    router.push(ROUTES.BILLING)
  }

  const openBillingInNewTab = () => {
    const billingPath = getPathname({ 
      href: ROUTES.BILLING,
      locale: locale as any
    })
    
    // IMPORTANT: New tabs don't inherit auth state reliably
    // User may get redirected to login (especially in incognito)
    // This is expected behavior for security reasons
    const newWindow = window.open(billingPath, '_blank')
    
    // Fallback: if popup blocked, use same-tab navigation
    if (!newWindow) {
      router.push(ROUTES.BILLING)
    }
  }

  const navigateToBillingSameTab = () => {
    // Recommended: same-tab navigation (preserves auth context)
    router.push(ROUTES.BILLING)
  }

  const navigateToIntegrations = () => {
    router.push('/integrations')
  }

  const navigateToBillingPreferred = () => {
    // Smart default: same-tab for better UX
    // Users can use middle-click or Ctrl+click for new tab if desired
    router.push(ROUTES.BILLING)
  }

  return {
    navigateToBilling,
    openBillingInNewTab,
    navigateToBillingSameTab,
    navigateToBillingPreferred,
    navigateToIntegrations,
    router // Expose for other navigation needs
  }
}

/**
 * Utility for getting locale-aware paths (server-safe)
 * For worker/service code - returns relative path, client resolves locale
 */
export function getBillingPath(locale?: string): string {
  if (!locale) return ROUTES.BILLING // Server-safe: return relative path
  
  return getPathname({ 
    href: ROUTES.BILLING,
    locale: locale as any
  })
}