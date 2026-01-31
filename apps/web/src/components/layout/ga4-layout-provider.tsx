'use client'

/**
 * 📊 GA4 Layout Provider
 * Provides GA4 tracking throughout the application via layout
 */

import React from 'react'
import { useGA4AppIntegration } from '@/hooks/use-ga4-page-tracking-layout'

interface GA4LayoutProviderProps {
  children: React.ReactNode
}

export function GA4LayoutProvider({ children }: GA4LayoutProviderProps) {
  // Initialize app-wide GA4 tracking
  useGA4AppIntegration()
  
  // Provider doesn't render anything - just enables tracking
  return <>{children}</>
}