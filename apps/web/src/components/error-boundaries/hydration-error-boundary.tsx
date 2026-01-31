'use client';

import React from 'react';
import { logger } from '@/utils/logger';

interface HydrationErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>;
}

interface HydrationErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary specifically designed to handle React hydration errors
 * commonly caused by Cloudflare Bot Fight Mode and JavaScript Detection
 */
export class HydrationErrorBoundary extends React.Component<
  HydrationErrorBoundaryProps,
  HydrationErrorBoundaryState
> {
  private retryCount = 0;
  private maxRetries = 2;

  constructor(props: HydrationErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): HydrationErrorBoundaryState {
    // Check if this is a hydration error (React Error #418 or #423)
    const isHydrationError = 
      error.message.includes('Hydration') ||
      error.message.includes('#418') ||
      error.message.includes('#423') ||
      error.message.includes('server rendered') ||
      error.message.includes('client render');

    return {
      hasError: true,
      error: isHydrationError ? error : error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const isHydrationError = 
      error.message.includes('Hydration') ||
      error.message.includes('#418') ||
      error.message.includes('#423');

    if (isHydrationError) {
      // Enhanced Cloudflare detection
      const cloudflareScripts = typeof window !== 'undefined' ? 
        Array.from(document.querySelectorAll('script[src*="challenges.cloudflare.com"], script[src*="cdn-cgi"]')) : [];
      
      const cloudflareDetection = {
        hasCloudflareScripts: cloudflareScripts.length > 0,
        scriptCount: cloudflareScripts.length,
        scriptSources: cloudflareScripts.map(script => (script as HTMLScriptElement).src).slice(0, 3), // First 3 sources
        challengePlatformDetected: cloudflareScripts.some(script => 
          (script as HTMLScriptElement).src.includes('challenges.cloudflare.com')
        )
      };

      logger.warn('🌊 Hydration error detected (likely Cloudflare interference)', {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 5), // First 5 lines only
        componentStack: errorInfo.componentStack?.split('\n').slice(0, 3),
        retryCount: this.retryCount,
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'SSR',
        cloudflare: cloudflareDetection,
        timestamp: new Date().toISOString()
      });

      // Log Cloudflare script injection for debugging
      if (cloudflareDetection.hasCloudflareScripts) {
        logger.info('🔍 Cloudflare script injection detected during hydration error', {
          scriptCount: cloudflareDetection.scriptCount,
          challengePlatform: cloudflareDetection.challengePlatformDetected,
          sources: cloudflareDetection.scriptSources
        });
      }

      // Auto-retry hydration errors (likely Cloudflare timing issues)
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        setTimeout(() => {
          this.setState({ hasError: false, error: undefined });
        }, 100 * this.retryCount); // Exponential backoff
        return;
      }
    } else {
      // Log non-hydration errors normally
      logger.error('🚫 React error boundary caught non-hydration error', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      });
    }
  }

  retry = () => {
    this.retryCount = 0;
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback } = this.props;
      
      if (Fallback && this.state.error) {
        return <Fallback error={this.state.error} retry={this.retry} />;
      }

      // Default fallback for hydration errors
      return (
        <div className="p-4 border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Content Loading Issue
              </h3>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                There was a temporary issue loading this section. This can happen due to security checks.
              </p>
              <div className="mt-3">
                <button
                  onClick={this.retry}
                  className="text-sm bg-yellow-100 dark:bg-yellow-800 hover:bg-yellow-200 dark:hover:bg-yellow-700 text-yellow-800 dark:text-yellow-200 px-3 py-1 rounded transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook to detect hydration mismatches and provide recovery options
 */
export function useHydrationErrorDetection() {
  const [hydrationError, setHydrationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Client-side detection of hydration issues with enhanced Cloudflare detection
    const detectHydrationMismatch = () => {
      if (typeof window === 'undefined') return;

      // Enhanced Cloudflare challenge platform detection
      const detectCloudflareScripts = () => {
        const cloudflareScripts = Array.from(document.querySelectorAll('script[src*="challenges.cloudflare.com"], script[src*="cdn-cgi"]'));
        return {
          hasCloudflareScripts: cloudflareScripts.length > 0,
          scriptCount: cloudflareScripts.length,
          challengePlatformDetected: cloudflareScripts.some(script => 
            (script as HTMLScriptElement).src.includes('challenges.cloudflare.com')
          ),
          sources: cloudflareScripts.map(script => (script as HTMLScriptElement).src).slice(0, 2)
        };
      };

      const cloudflareDetection = detectCloudflareScripts();

      // Check for React hydration warnings in console
      const originalError = window.console.error;
      window.console.error = (...args) => {
        const errorMessage = args.join(' ');
        if (errorMessage.includes('Hydration') || errorMessage.includes('#418') || errorMessage.includes('#423')) {
          setHydrationError(errorMessage);
          logger.warn('🌊 Client-side hydration error detected', {
            error: errorMessage,
            cloudflare: cloudflareDetection,
            timestamp: new Date().toISOString(),
            url: window.location.href
          });

          // Additional logging if Cloudflare scripts are detected
          if (cloudflareDetection.hasCloudflareScripts) {
            logger.info('🔍 Cloudflare scripts present during client-side hydration error', {
              scriptCount: cloudflareDetection.scriptCount,
              challengePlatform: cloudflareDetection.challengePlatformDetected,
              sources: cloudflareDetection.sources
            });
          }
        }
        originalError.apply(window.console, args);
      };

      return () => {
        window.console.error = originalError;
      };
    };

    const cleanup = detectHydrationMismatch();
    return cleanup;
  }, []);

  const clearError = React.useCallback(() => {
    setHydrationError(null);
  }, []);

  return { hydrationError, clearError };
}

/**
 * Higher-order component to wrap components that might experience hydration issues
 */
export function withHydrationErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallbackComponent?: React.ComponentType<{ error: Error; retry: () => void }>
) {
  const ComponentWithHydrationBoundary = (props: P) => (
    <HydrationErrorBoundary fallback={fallbackComponent}>
      <WrappedComponent {...props} />
    </HydrationErrorBoundary>
  );

  ComponentWithHydrationBoundary.displayName = 
    `withHydrationErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name})`;

  return ComponentWithHydrationBoundary;
}