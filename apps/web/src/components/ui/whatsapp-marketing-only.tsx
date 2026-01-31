'use client'

import { usePathname } from 'next/navigation'
import { WhatsAppSupport } from './whatsapp-support'

// App routes where WhatsApp button should NOT appear
const APP_ROUTE_PREFIXES = [
  '/admin',
  '/advisor',
  '/advisors',
  '/auth',
  '/billing',
  '/builder',
  '/dashboard',
  '/onboarding',
  '/workspace',
]

interface WhatsAppMarketingOnlyProps {
  locale: string
  showHours?: boolean
}

/**
 * WhatsApp support button that only shows on marketing pages.
 * Excludes app pages like dashboard, builder, workspace, etc.
 */
export function WhatsAppMarketingOnly({ locale, showHours = false }: WhatsAppMarketingOnlyProps) {
  const pathname = usePathname()

  // Remove locale prefix to check the route
  // pathname is like /ar-eg/dashboard or /en/pricing
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(-[a-z]{2})?/, '') || '/'

  // Check if current path starts with any app route prefix
  const isAppRoute = APP_ROUTE_PREFIXES.some(prefix =>
    pathWithoutLocale === prefix || pathWithoutLocale.startsWith(`${prefix}/`)
  )

  // Don't show on app routes
  if (isAppRoute) {
    return null
  }

  return <WhatsAppSupport locale={locale} showHours={showHours} />
}
