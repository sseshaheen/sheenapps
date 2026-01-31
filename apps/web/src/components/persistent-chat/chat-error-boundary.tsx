/**
 * Chat Error Boundary Component
 * Specialized error boundary for persistent chat with transport vs UI error separation
 * 
 * Expert Recommendation: Transport errors update connection state, UI errors trigger boundaries
 */

'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { logger } from '@/utils/logger'

interface Props {
  children: ReactNode
  onTransportError?: (error: TransportError) => void
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  isTransportError: boolean
}

// Transport error types that should not trigger UI error boundaries
export interface TransportError extends Error {
  type: 'sse-connection' | 'network' | 'timeout' | 'auth-failed'
  statusCode?: number
  retryAfter?: number
}

// Check if an error is a transport-related error that should not crash the UI
function isTransportError(error: Error): error is TransportError {
  const message = error.message.toLowerCase()
  
  // SSE connection errors
  if (message.includes('eventsource') || 
      message.includes('sse') ||
      message.includes('event-stream')) {
    return true
  }
  
  // Network errors
  if (message.includes('network') || 
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout')) {
    return true
  }
  
  // Authentication errors
  if (message.includes('unauthorized') ||
      message.includes('403') ||
      message.includes('401')) {
    return true
  }
  
  // Check for transport error type property
  if ('type' in error && typeof (error as any).type === 'string') {
    const transportTypes = ['sse-connection', 'network', 'timeout', 'auth-failed']
    return transportTypes.includes((error as any).type)
  }
  
  return false
}

/**
 * Chat-specific error boundary that separates transport and UI errors
 */
export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, isTransportError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    const isTransport = isTransportError(error)
    
    return {
      hasError: !isTransport, // Only set hasError for UI errors
      error,
      isTransportError: isTransport
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const isTransport = isTransportError(error)

    if (isTransport) {
      // Transport error: Don't crash UI, just notify parent and log
      logger.debug('persistent-chat', 'Transport error handled gracefully', {
        error: error.message,
        type: (error as any).type || 'unknown-transport',
        statusCode: (error as any).statusCode,
        stack: error.stack
      })

      // Notify parent component to update connection state
      if (this.props.onTransportError) {
        this.props.onTransportError(error as TransportError)
      }
      
      // Reset state since we're not showing error UI
      this.setState({ 
        hasError: false, 
        error: null, 
        isTransportError: false 
      })
    } else {
      // UI error: Log and let error boundary handle normally
      logger.error('Persistent chat UI error:', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      })
      
      this.setState({
        error,
        isTransportError: false
      })
    }
  }

  render() {
    if (this.state.hasError && !this.state.isTransportError) {
      // Use existing ErrorBoundary for UI errors with custom fallback
      const fallback = this.props.fallback || (
        <div className="flex flex-col items-center justify-center p-6 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-600 mb-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-red-800 mb-2">Chat Error</h3>
          <p className="text-sm text-red-600 text-center mb-4">
            Something went wrong with the chat interface. Try refreshing or contact support if the problem persists.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
          >
            Refresh Chat
          </button>
        </div>
      )
      
      return fallback
    }

    return this.props.children
  }
}

/**
 * Higher-order component to wrap chat components with transport-aware error boundary
 */
export function withChatErrorBoundary<T extends object>(
  Component: React.ComponentType<T>,
  options?: {
    onTransportError?: (error: TransportError) => void
    fallback?: ReactNode
  }
): React.ComponentType<T> {
  const WrappedComponent = (props: T) => (
    <ChatErrorBoundary 
      onTransportError={options?.onTransportError}
      fallback={options?.fallback}
    >
      <Component {...props} />
    </ChatErrorBoundary>
  )

  WrappedComponent.displayName = `withChatErrorBoundary(${Component.displayName || Component.name})`
  return WrappedComponent
}

/**
 * Utility to create transport errors with proper typing
 */
export function createTransportError(
  message: string,
  type: TransportError['type'],
  options?: {
    statusCode?: number
    retryAfter?: number
    cause?: Error
  }
): TransportError {
  const error = new Error(message) as TransportError
  error.type = type
  error.statusCode = options?.statusCode
  error.retryAfter = options?.retryAfter
  
  if (options?.cause) {
    error.cause = options.cause
  }
  
  return error
}