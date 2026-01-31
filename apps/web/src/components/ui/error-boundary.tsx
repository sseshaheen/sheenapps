/**
 * Error Boundary Component
 * Catches and handles React errors with Sentry reporting
 */

'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  context?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    })

    // Log error to Sentry (when available)
    this.logErrorToSentry(error, errorInfo)

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  private logErrorToSentry(error: Error, errorInfo: ErrorInfo) {
    // Check if Sentry is available
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      const Sentry = (window as any).Sentry

      // Set context for the error
      Sentry.withScope((scope: any) => {
        scope.setTag('errorBoundary', true)
        scope.setTag('component', this.props.context || 'unknown')
        scope.setContext('componentStack', {
          stack: errorInfo.componentStack
        })
        scope.setContext('errorInfo', errorInfo)
        
        // Capture the error
        Sentry.captureException(error)
      })
    } else {
      // Fallback console logging
      console.error('[ErrorBoundary] Error caught:', error)
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
      
      // Log to analytics if available
      if (typeof window !== 'undefined' && (window as any).analytics) {
        (window as any).analytics.track('error_boundary_triggered', {
          error: error.message,
          stack: error.stack,
          component: this.props.context || 'unknown',
          componentStack: errorInfo.componentStack
        })
      }
    }
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback component
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="error-boundary-container flex flex-col items-center justify-center p-8 bg-red-50 border border-red-200 rounded-lg">
          <Icon name="alert-triangle" className="w-12 h-12 text-red-500 mb-4" />
          
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            Something went wrong
          </h2>
          
          <p className="text-sm text-red-600 mb-4 text-center max-w-md">
            {this.props.context 
              ? `An error occurred in ${this.props.context}. Please try again.`
              : 'An unexpected error occurred. Please try again.'
            }
          </p>

          <div className="flex gap-3">
            <Button 
              onClick={this.handleRetry}
              variant="outline"
              size="sm"
            >
              <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            
            <Button 
              onClick={() => window.location.reload()}
              variant="outline"
              size="sm"
            >
              <Icon name="rotate-ccw" className="w-4 h-4 mr-2" />
              Refresh Page
            </Button>
          </div>

          {/* Show error details in development */}
          {/* eslint-disable-next-line no-restricted-globals */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-6 w-full max-w-2xl">
              <summary className="cursor-pointer text-sm text-red-700 font-medium">
                Error Details (Development Only)
              </summary>
              <div className="mt-2 p-4 bg-red-100 rounded border text-xs font-mono">
                <div className="mb-2">
                  <strong>Error:</strong> {this.state.error.message}
                </div>
                <div className="mb-2">
                  <strong>Stack:</strong>
                  <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
                </div>
                {this.state.errorInfo && (
                  <div>
                    <strong>Component Stack:</strong>
                    <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Higher-order component to wrap components with error boundary
 */
export function withErrorBoundary<T extends object>(
  Component: React.ComponentType<T>,
  context?: string
): React.ComponentType<T> {
  const WrappedComponent = (props: T) => (
    <ErrorBoundary context={context || Component.displayName || Component.name}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`
  return WrappedComponent
}

/**
 * Hook to manually report errors to Sentry
 */
export function useErrorReporting() {
  const reportError = (error: Error, context?: string) => {
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      const Sentry = (window as any).Sentry
      
      Sentry.withScope((scope: any) => {
        scope.setTag('manualReport', true)
        if (context) {
          scope.setTag('context', context)
        }
        Sentry.captureException(error)
      })
    } else {
      console.error('[Manual Error Report]:', error)
      
      // Fallback analytics
      if (typeof window !== 'undefined' && (window as any).analytics) {
        (window as any).analytics.track('manual_error_report', {
          error: error.message,
          stack: error.stack,
          context: context || 'unknown'
        })
      }
    }
  }

  return { reportError }
}
