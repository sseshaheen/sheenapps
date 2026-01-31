'use client'

/* eslint-disable no-restricted-globals */

import React from 'react'
import { logger } from '@/utils/logger'

interface IntlErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface IntlErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error }>
}

/**
 * Error boundary specifically for next-intl context errors
 * Prevents "No intl context found" errors from breaking the entire app
 */
export class IntlErrorBoundary extends React.Component<
  IntlErrorBoundaryProps,
  IntlErrorBoundaryState
> {
  constructor(props: IntlErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): IntlErrorBoundaryState {
    // Check if this is an intl context error
    const isIntlError = error.message?.includes('No intl context found') ||
                       error.message?.includes('next-intl') ||
                       error.message?.includes('intl context') ||
                       error.stack?.includes('next-intl')

    if (isIntlError) {
      logger.warn('🌍 IntlErrorBoundary caught next-intl context error (likely Fast Refresh):', {
        message: error.message,
        stack: error.stack?.slice(0, 500),
        isDevelopment: process.env.NODE_ENV === 'development',
        timestamp: new Date().toISOString()
      })
    }

    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error for debugging
    logger.error('🌍 IntlErrorBoundary componentDidCatch:', {
      error: error.message,
      componentStack: errorInfo.componentStack?.slice(0, 500),
      isDevelopment: process.env.NODE_ENV === 'development'
    })

    // In development, auto-retry intl context errors after a delay (Fast Refresh scenarios)
    if (process.env.NODE_ENV === 'development') {
      const isIntlError = error.message?.includes('No intl context found') ||
                         error.message?.includes('next-intl') ||
                         error.message?.includes('intl context')

      if (isIntlError) {
        logger.info('🌍 Scheduling auto-retry for intl context error (Fast Refresh recovery)...')
        
        setTimeout(() => {
          this.setState({ hasError: false, error: undefined })
        }, 1000) // 1 second delay to allow context to re-initialize
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback } = this.props
      
      if (Fallback && this.state.error) {
        return <Fallback error={this.state.error} />
      }

      // Default fallback for intl errors
      const isDevelopment = process.env.NODE_ENV === 'development'
      const isIntlError = this.state.error?.message?.includes('No intl context found') ||
                         this.state.error?.message?.includes('next-intl')

      return (
        <div className={`p-4 border rounded-md ${
          isDevelopment 
            ? 'border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800' 
            : 'border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800'
        }`}>
          <div className="flex items-start">
            <div className={`${isDevelopment ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className={`text-sm font-medium ${
                isDevelopment 
                  ? 'text-blue-800 dark:text-blue-200' 
                  : 'text-amber-800 dark:text-amber-200'
              }`}>
                {isDevelopment && isIntlError ? 'Fast Refresh Translation Error' : 'Translation Context Error'}
              </h3>
              <div className={`mt-2 text-sm ${
                isDevelopment 
                  ? 'text-blue-700 dark:text-blue-300' 
                  : 'text-amber-700 dark:text-amber-300'
              }`}>
                {isDevelopment && isIntlError ? (
                  <div className="space-y-2">
                    <p>
                      This error typically occurs during Fast Refresh when webpack hot reload 
                      executes component code before the next-intl context is available.
                    </p>
                    <p className="text-xs font-mono bg-blue-100 dark:bg-blue-900/20 p-2 rounded">
                      Auto-retry in progress... Component will recover automatically.
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors"
                    >
                      Manual Reload
                    </button>
                  </div>
                ) : (
                  <p>
                    This component requires internationalization context that is not available.
                    Please ensure the component is properly wrapped with NextIntlClientProvider.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Simple HOC to wrap components with IntlErrorBoundary
 */
export function withIntlErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ComponentType<{ error: Error }>
) {
  const WrappedComponent = (props: P) => (
    <IntlErrorBoundary fallback={fallback}>
      <Component {...props} />
    </IntlErrorBoundary>
  )

  WrappedComponent.displayName = `withIntlErrorBoundary(${Component.displayName || Component.name})`
  
  return WrappedComponent
}
