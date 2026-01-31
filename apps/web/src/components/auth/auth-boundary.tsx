'use client'

import React, { ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { useRouter } from '@/i18n/routing'
import Icon from '@/components/ui/icon'
import { AuthError } from '@/lib/fetch-auth'

interface CenteredCardProps {
  title: string
  message?: string
  actionLabel?: string
  onAction?: () => void
}

function CenteredCard({ title, message, actionLabel, onAction }: CenteredCardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
          <Icon name="alert-circle" className="w-8 h-8 text-red-600" />
        </div>
        
        {/* Content */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{title}</h1>
        {message && <p className="text-gray-600 mb-8">{message}</p>}
        
        {/* Action */}
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

interface AuthBoundaryProps {
  children: ReactNode
}

export function AuthBoundary({ children }: AuthBoundaryProps) {
  const router = useRouter()

  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => {
        // Handle auth-specific errors
        if (error instanceof AuthError) {
          if (error.code === 'PERMISSION_DENIED') {
            return (
              <CenteredCard
                title="Access Denied"
                message="You don't have permission to access this project."
                actionLabel="Back to Dashboard"
                onAction={() => router.push('/dashboard')}
              />
            )
          }
          
          // AUTH_EXPIRED or AUTH_REQUIRED
          return (
            <CenteredCard
              title="Session Expired"
              message="Your session has expired. Please sign in again to continue."
              actionLabel="Sign In"
              onAction={() => router.push('/auth/login')}
            />
          )
        }
        
        // Generic error fallback
        return (
          <CenteredCard
            title="Something went wrong"
            message="We encountered an unexpected error. Please try again."
            actionLabel="Retry"
            onAction={resetErrorBoundary}
          />
        )
      }}
      onError={(error, errorInfo) => {
        console.error('Auth boundary caught error:', { error, errorInfo })
      }}
    >
      {children}
    </ErrorBoundary>
  )
}