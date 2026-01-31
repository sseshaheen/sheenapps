'use client'

import React from 'react'
import { AlertCircle, RefreshCw, MessageCircle } from 'lucide-react'
import { buildWhatsAppLink, SUPPORT_SOURCES } from '@/config/support'

// Fallback labels that don't require hooks - used when intl provider is unavailable
const FALLBACK_LABELS = {
  en: {
    title: 'Something went wrong',
    retry: 'Try again',
    support: 'Contact support',
    whatHappened: 'What happened',
    suggestion: 'Suggestion',
    errorMessage: 'There was an issue loading the build status.',
    errorAction: 'Try again or use a simpler request.',
  },
  ar: {
    title: 'حدث خطأ ما',
    retry: 'جرب مرة أخرى',
    support: 'تواصل مع الدعم',
    whatHappened: 'ماذا حدث',
    suggestion: 'اقتراح',
    errorMessage: 'حدثت مشكلة في تحميل حالة البناء.',
    errorAction: 'جرب مرة أخرى أو استخدم طلبًا أبسط.',
  },
}

interface BuildProgressErrorBoundaryProps {
  children: React.ReactNode
  locale?: string
}

interface BuildProgressErrorBoundaryState {
  hasError: boolean
  error?: Error
}

/**
 * Error boundary specifically for build progress polling
 * Wraps only the polling subtree to keep rest of chat usable
 */
export class BuildProgressErrorBoundary extends React.Component<
  BuildProgressErrorBoundaryProps,
  BuildProgressErrorBoundaryState
> {
  constructor(props: BuildProgressErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): BuildProgressErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error for debugging in development
    // eslint-disable-next-line no-restricted-globals
    if (process.env.NODE_ENV === 'development') {
      console.error('Build progress error boundary caught an error:', error, errorInfo)
    }

    // In production, you might want to send this to an error reporting service
    // errorReportingService.captureException(error, { extra: errorInfo })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      return (
        <BuildProgressFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          locale={this.props.locale}
        />
      )
    }

    return this.props.children
  }
}

/**
 * Fallback component when build progress fails
 * Keeps the error scoped and doesn't break the rest of the chat
 * Features one-button recovery with WhatsApp support escape hatch
 *
 * IMPORTANT: This component does NOT use next-intl hooks (useLocale, useTranslations)
 * because if the intl provider is what's broken, this fallback would also fail.
 * Uses static fallback labels instead for reliability.
 */
function BuildProgressFallback({
  error,
  onRetry,
  locale: propLocale
}: {
  error?: Error
  onRetry?: () => void
  locale?: string
}) {
  // Determine locale from prop or detect from URL/document (no hooks!)
  const locale = propLocale || (typeof window !== 'undefined'
    ? window.location.pathname.split('/')[1] || 'en'
    : 'en')

  const isArabic = locale.startsWith('ar')
  const whatsappLink = buildWhatsAppLink(locale, SUPPORT_SOURCES.BUILD_FAILED)

  // Use static fallback labels - no hooks that could fail if provider is broken
  const labels = isArabic ? FALLBACK_LABELS.ar : FALLBACK_LABELS.en

  return (
    <div
      className="build-progress-error bg-red-900/20 border border-red-700/50 rounded-lg p-4"
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          {/* Title with reassurance */}
          <h4 className="font-medium text-red-200 mb-2">
            {labels.title}
          </h4>

          {/* What happened section */}
          <div className="mb-3">
            <p className="text-xs text-red-400/70 mb-1">{labels.whatHappened}</p>
            <p className="text-sm text-red-300/80">
              {labels.errorMessage}
            </p>
          </div>

          {/* Suggestion section */}
          <div className="mb-4">
            <p className="text-xs text-red-400/70 mb-1">{labels.suggestion}</p>
            <p className="text-sm text-red-300/80">
              {labels.errorAction}
            </p>
          </div>

          {/* eslint-disable-next-line no-restricted-globals */}
          {process.env.NODE_ENV === 'development' && error && (
            <details className="mt-2 mb-3">
              <summary className="text-xs text-red-400/60 cursor-pointer hover:text-red-400/80">
                Error details (dev only)
              </summary>
              <pre className="text-xs text-red-400/60 mt-1 overflow-x-auto">
                {error.stack || error.message}
              </pre>
            </details>
          )}

          {/* One-button recovery with support escape hatch */}
          <div className="flex flex-wrap gap-2">
            {/* Primary: Retry button */}
            <button
              onClick={onRetry || (() => window.location.reload())}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {labels.retry}
            </button>

            {/* Secondary: WhatsApp support (only for Arabic locales) */}
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                {labels.support}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Higher-order component to wrap components with build progress error boundary
 */
export function withBuildProgressErrorBoundary<P extends object>(
  Component: React.ComponentType<P>
) {
  const WrappedComponent = (props: P) => (
    <BuildProgressErrorBoundary>
      <Component {...props} />
    </BuildProgressErrorBoundary>
  )
  
  WrappedComponent.displayName = `withBuildProgressErrorBoundary(${Component.displayName || Component.name})`
  
  return WrappedComponent
}