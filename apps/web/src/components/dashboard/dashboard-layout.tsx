'use client'

import { ToastContainer, useToastWithUndo } from '@/components/ui/toast-with-undo'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { dashboardEventCoordinator } from '@/services/events/dashboard-coordinator'
import { ReactNode, useEffect } from 'react'
import { DashboardProvider } from './dashboard-context'
import { DashboardStateProvider } from './dashboard-state-context'

interface DashboardLayoutProps {
  children: ReactNode
  translations: any
  locale: string
}

export function DashboardLayout({ children, translations, locale }: DashboardLayoutProps) {
  const { toasts, removeToast, success, error, info, warning } = useToastWithUndo()

  // Initialize dashboard event system once when dashboard mounts
  useEffect(() => {
    if (FEATURE_FLAGS.ENABLE_DASHBOARD_ANALYTICS && FEATURE_FLAGS.ENABLE_EVENT_SYSTEM) {
      // Check if already initialized to prevent duplicates
      const status = dashboardEventCoordinator.getStatus()
      if (!status.initialized) {
        dashboardEventCoordinator.initialize()
      }
    }

    // Cleanup on unmount
    return () => {
      if (FEATURE_FLAGS.ENABLE_DASHBOARD_ANALYTICS && FEATURE_FLAGS.ENABLE_EVENT_SYSTEM) {
        dashboardEventCoordinator.cleanup()
      }
    }
  }, []) // Empty deps - only run once on mount/unmount

  return (
    <DashboardStateProvider>
      <DashboardProvider
        translations={translations}
        locale={locale}
        toastHandlers={{ success, error, info, warning }}
      >
        <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-0 pt-fixed-header">
          {children}
        </main>

        {/* Toast Container - Mounted once at dashboard root */}
        <ToastContainer
          toasts={toasts}
          onDismiss={removeToast}
          className="z-50"
        />
      </DashboardProvider>
    </DashboardStateProvider>
  )
}
