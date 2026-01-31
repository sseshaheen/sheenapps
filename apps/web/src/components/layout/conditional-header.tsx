'use client'

import { usePathname } from '@/i18n/routing'
import Header from './header'

interface ConditionalHeaderProps {
  locale: string
}

export default function ConditionalHeader({ locale }: ConditionalHeaderProps) {
  const pathname = usePathname()
  
  // Define routes that should NOT show the main header (they have their own layouts)
  const routesWithOwnHeaders = [
    '/builder/workspace',  // Builder has workspace-specific header
    '/builder/new',        // New project flow has its own navigation
    '/advisor/dashboard',  // Advisor dashboard and all sub-pages have AdvisorLayoutClient
    '/advisor/application-status' // Application status has AdvisorWorkflowHeader
  ]
  
  // Check if current pathname matches any route that has its own header
  const shouldHideHeader = routesWithOwnHeaders.some(route => {
    // Exact match or starts with (for sub-routes like /dashboard/billing)
    return pathname === route || pathname.startsWith(route + '/')
  })
  
  // Return null (no header) if this route has its own header
  if (shouldHideHeader) {
    return null
  }
  
  // Render the main header for all other routes
  return <Header locale={locale} />
}