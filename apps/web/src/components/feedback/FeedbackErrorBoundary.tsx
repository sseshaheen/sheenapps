'use client';

/**
 * Feedback Error Boundary Component
 *
 * Enhanced error boundary that:
 *   - Catches React errors
 *   - Records error as implicit signal
 *   - Offers inline bug report submission
 *   - Falls back to standard error UI
 *
 * Best Practices Applied:
 *   - Auto-records error signal (for routing to engineering)
 *   - Optional bug report (user-initiated, higher quality)
 *   - Stores error type/component, NOT full stack traces with PII
 *   - Integrates with existing Sentry reporting
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Passive/Implicit Feedback & Governance
 */

import React, { Component, ErrorInfo, ReactNode, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { submitFeedback, generateFeedbackId, getAnonymousId, getSessionId, getDeviceType, getViewport } from '@/lib/feedback';
import { isLocalDevelopment } from '@/utils/client-env';

// ============================================================================
// Types
// ============================================================================

interface FeedbackErrorBoundaryProps {
  children: ReactNode;
  /**
   * Context name for error grouping (e.g., "ProjectBuilder", "Dashboard")
   */
  context?: string;
  /**
   * Feature ID for analytics
   */
  featureId?: string;
  /**
   * Custom fallback component (receives error info and feedback UI)
   */
  fallback?: (props: FallbackProps) => ReactNode;
  /**
   * Called when error is caught
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /**
   * Show bug report form?
   * @default true
   */
  showBugReport?: boolean;
  /**
   * Custom class for the container
   */
  className?: string;
}

interface FallbackProps {
  error: Error;
  errorInfo: ErrorInfo | null;
  context?: string;
  onRetry: () => void;
  onReload: () => void;
  bugReportForm: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorReported: boolean;
}

// ============================================================================
// Bug Report Form Component (Function Component for Hooks)
// ============================================================================

interface BugReportFormProps {
  error: Error;
  context?: string;
  featureId?: string;
  onSubmitted?: () => void;
}

function BugReportForm({ error, context, featureId, onSubmitted }: BugReportFormProps) {
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submitFeedback({
        id: generateFeedbackId(),
        type: 'bug_report',
        value: error.message,
        textComment: `Context: ${context || 'Unknown'}\n\nUser description:\n${description.trim()}`,
        anonymousId: getAnonymousId(),
        sessionId: getSessionId(),
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        featureId,
        triggerPoint: 'error_boundary',
        promptId: 'error_boundary_bug_report',
        placement: 'inline',
        goal: 'bug',
        viewport: getViewport(),
        deviceType: getDeviceType(),
      });

      if (result.success) {
        setSubmitted(true);
        onSubmitted?.();
      } else {
        setSubmitError(result.error || 'Failed to submit report');
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [description, error.message, context, featureId, onSubmitted]);

  if (submitted) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <Icon name="check-circle" className="w-4 h-4 text-green-600 dark:text-green-400" />
        <span className="text-sm text-green-700 dark:text-green-300">
          Thanks! We&apos;ll look into this.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-border">
      <p className="text-sm font-medium mb-2">Help us fix this</p>
      <p className="text-xs text-muted-foreground mb-3">
        What were you trying to do when this happened?
      </p>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="I was trying to..."
        className={cn(
          'w-full min-h-[80px] p-3 text-sm rounded-md resize-none',
          'bg-background border border-border',
          'focus:outline-none focus:ring-2 focus:ring-primary/50'
        )}
        maxLength={1000}
      />
      {submitError && (
        <p className="mt-2 text-xs text-destructive">{submitError}</p>
      )}
      <div className="flex justify-end mt-3">
        <Button
          onClick={handleSubmit}
          disabled={!description.trim() || isSubmitting}
          size="sm"
        >
          {isSubmitting ? 'Sending...' : 'Send Report'}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Error Boundary Component
// ============================================================================

export class FeedbackErrorBoundary extends Component<FeedbackErrorBoundaryProps, State> {
  constructor(props: FeedbackErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorReported: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Record error as implicit signal (auto-routes to engineering queue)
    this.recordErrorSignal(error, errorInfo);

    // Call custom error handler
    this.props.onError?.(error, errorInfo);

    // Report to Sentry if available
    this.reportToSentry(error, errorInfo);
  }

  private recordErrorSignal(error: Error, errorInfo: ErrorInfo) {
    if (this.state.errorReported) return;

    // Record via fetch (can't use hooks in class component)
    // We store error type and context, NOT full stack traces (privacy)
    const signal = {
      type: 'error' as const,
      value: {
        errorType: error.name,
        errorMessage: error.message.slice(0, 100), // Truncate to avoid PII
        context: this.props.context || 'unknown',
        componentName: this.extractComponentName(errorInfo),
      },
      pageUrl: typeof window !== 'undefined' ? window.location.pathname : '',
      elementId: this.props.featureId,
      sessionId: typeof window !== 'undefined' ? getSessionId() : '',
    };

    // Fire and forget - don't block UI
    fetch('/api/feedback/analytics/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [signal] }),
    }).catch(() => {
      // Silently fail - error reporting shouldn't cause more errors
    });

    this.setState({ errorReported: true });
  }

  private extractComponentName(errorInfo: ErrorInfo): string {
    // Extract first component name from stack (without full path)
    const stack = errorInfo.componentStack || '';
    const match = stack.match(/at (\w+)/);
    return match?.[1] || 'Unknown';
  }

  private reportToSentry(error: Error, errorInfo: ErrorInfo) {
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      const Sentry = (window as any).Sentry;

      Sentry.withScope((scope: any) => {
        scope.setTag('errorBoundary', true);
        scope.setTag('feedbackErrorBoundary', true);
        scope.setTag('component', this.props.context || 'unknown');
        scope.setContext('componentStack', {
          stack: errorInfo.componentStack,
        });
        Sentry.captureException(error);
      });
    }
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorReported: false,
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { children, context, featureId, fallback, showBugReport = true, className } = this.props;
    const { hasError, error, errorInfo } = this.state;

    if (!hasError || !error) {
      return children;
    }

    const bugReportForm = showBugReport ? (
      <BugReportForm error={error} context={context} featureId={featureId} />
    ) : null;

    // Custom fallback
    if (fallback) {
      return fallback({
        error,
        errorInfo,
        context,
        onRetry: this.handleRetry,
        onReload: this.handleReload,
        bugReportForm,
      });
    }

    // Default error UI
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8',
          'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg',
          className
        )}
      >
        <Icon name="alert-triangle" className="w-12 h-12 text-red-500 mb-4" />

        <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
          Something went wrong
        </h2>

        <p className="text-sm text-red-600 dark:text-red-300 mb-4 text-center max-w-md">
          {context
            ? `An error occurred in ${context}. We've been notified.`
            : "An unexpected error occurred. We've been notified."}
        </p>

        <div className="flex gap-3">
          <Button onClick={this.handleRetry} variant="outline" size="sm">
            <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
            Try Again
          </Button>

          <Button onClick={this.handleReload} variant="outline" size="sm">
            <Icon name="rotate-ccw" className="w-4 h-4 mr-2" />
            Refresh Page
          </Button>
        </div>

        {/* Bug report form */}
        {bugReportForm && <div className="w-full max-w-md mt-6">{bugReportForm}</div>}

        {/* Error details in development */}
        {isLocalDevelopment() && (
          <details className="mt-6 w-full max-w-2xl">
            <summary className="cursor-pointer text-sm text-red-700 dark:text-red-300 font-medium">
              Error Details (Development Only)
            </summary>
            <div className="mt-2 p-4 bg-red-100 dark:bg-red-900/30 rounded border text-xs font-mono overflow-auto">
              <div className="mb-2">
                <strong>Error:</strong> {error.message}
              </div>
              <div className="mb-2">
                <strong>Stack:</strong>
                <pre className="whitespace-pre-wrap">{error.stack}</pre>
              </div>
              {errorInfo && (
                <div>
                  <strong>Component Stack:</strong>
                  <pre className="whitespace-pre-wrap">{errorInfo.componentStack}</pre>
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    );
  }
}
