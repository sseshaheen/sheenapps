'use client'

import { createContext, useContext, ReactNode } from 'react'
import { useToastWithUndo } from '@/components/ui/toast-with-undo'

interface DashboardContextType {
  // Toast functions
  showSuccess: (title: string, description?: string, undoAction?: () => Promise<void> | void, actionId?: string, projectIds?: string[]) => string
  showError: (title: string, description?: string) => string
  showInfo: (title: string, description?: string) => string
  showWarning: (title: string, description?: string) => string
  
  // Translations
  translations: any
  locale: string
}

const DashboardContext = createContext<DashboardContextType | null>(null)

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error('useDashboard must be used within DashboardProvider')
  }
  return context
}

interface DashboardProviderProps {
  children: ReactNode
  translations: any
  locale: string
  toastHandlers: {
    success: (title: string, description?: string, undoAction?: () => Promise<void> | void, actionId?: string, projectIds?: string[]) => string
    error: (title: string, description?: string) => string
    info: (title: string, description?: string) => string
    warning: (title: string, description?: string) => string
  }
}

export function DashboardProvider({ 
  children, 
  translations, 
  locale,
  toastHandlers 
}: DashboardProviderProps) {
  const value: DashboardContextType = {
    showSuccess: toastHandlers.success,
    showError: toastHandlers.error,
    showInfo: toastHandlers.info,
    showWarning: toastHandlers.warning,
    translations,
    locale
  }

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  )
}