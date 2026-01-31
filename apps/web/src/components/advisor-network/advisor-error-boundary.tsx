'use client'

import React from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useRouter } from '@/i18n/routing'
import { logger } from '@/utils/logger'
import { isLocalDevelopment } from '@/utils/client-env'

interface AdvisorErrorFallbackProps {
  error: unknown
  resetErrorBoundary: () => void
  translations: {
    title: string
    description: string
    actions: {
      retry: string
      goHome: string
      applyToAdvisor: string
    }
  }
}

// Type guard to check if error is an Error object
function isError(error: unknown): error is Error {
  return error instanceof Error
}

function AdvisorErrorFallback({ error, resetErrorBoundary, translations }: AdvisorErrorFallbackProps) {
  const router = useRouter()

  // Safely extract error properties
  const errorMessage = isError(error) ? error.message : String(error)
  const errorStack = isError(error) ? error.stack : undefined
  const errorName = isError(error) ? error.name : 'Unknown'

  // Log error details for debugging
  React.useEffect(() => {
    logger.error('🚨 Advisor Error Boundary triggered:', {
      errorMessage,
      errorStack,
      errorName,
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'unknown',
      pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
    })
  }, [errorMessage, errorStack, errorName])

  const isProfileError = errorMessage.includes('profile') || errorMessage.includes('advisor')
  const isAuthError = errorMessage.includes('auth') || errorMessage.includes('unauthorized')
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Icon 
            name="alert-triangle" 
            className="h-16 w-16 text-destructive mb-6" 
          />
          
          <h1 className="text-2xl font-bold mb-4">
            {translations.title}
          </h1>
          
          <p className="text-muted-foreground mb-8 max-w-md">
            {translations.description}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
            <Button 
              onClick={resetErrorBoundary}
              className="flex-1"
            >
              <Icon name="refresh-cw" className="h-4 w-4 mr-2" />
              {translations.actions.retry}
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => router.push('/dashboard')}
              className="flex-1"
            >
              <Icon name="activity" className="h-4 w-4 mr-2" />
              {translations.actions.goHome}
            </Button>
          </div>
          
          {isProfileError && (
            <Button 
              variant="ghost"
              onClick={() => router.push('/advisor/apply')}
              className="mt-4"
            >
              <Icon name="user-plus" className="h-4 w-4 mr-2" />
              {translations.actions.applyToAdvisor}
            </Button>
          )}
          
          {/* Debug info in development */}
          {isLocalDevelopment() && (
            <details className="mt-8 w-full">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Debug Info (Dev Mode)
              </summary>
              <pre className="mt-2 text-xs text-start bg-muted p-4 rounded overflow-auto max-h-32">
                {errorStack}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface AdvisorErrorBoundaryProps {
  children: React.ReactNode
  translations?: {
    title?: string
    description?: string
    actions?: {
      retry?: string
      goHome?: string
      applyToAdvisor?: string
    }
  }
}

export function AdvisorErrorBoundary({ children, translations }: AdvisorErrorBoundaryProps) {
  const defaultTranslations = {
    title: translations?.title || 'Advisor System Error',
    description: translations?.description || 'Something went wrong with the advisor system. This might be a temporary issue.',
    actions: {
      retry: translations?.actions?.retry || 'Try Again',
      goHome: translations?.actions?.goHome || 'Go to Dashboard',
      applyToAdvisor: translations?.actions?.applyToAdvisor || 'Apply to Become Advisor'
    }
  }

  return (
    <ErrorBoundary
      FallbackComponent={(props) => (
        <AdvisorErrorFallback 
          {...props} 
          translations={defaultTranslations} 
        />
      )}
      onError={(error: unknown, errorInfo) => {
        logger.error('🚨 AdvisorErrorBoundary caught error:', {
          error: isError(error) ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : { message: String(error) },
          errorInfo,
          timestamp: new Date().toISOString(),
          component: 'AdvisorErrorBoundary'
        })
      }}
    >
      {children}
    </ErrorBoundary>
  )
}
