/**
 * Admin Approvals Hook with React Query
 * Provides robust error handling, retry logic, and auth integration
 */

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { toast } from 'sonner'
import { fetchJSONWithErrorHandling, isAuthError } from '@/utils/api-client'

interface PendingApproval {
  id: string
  action: string
  resource_type: string
  resource_id: string
  payload: {
    amount?: number
    reason: string
    notify_user?: boolean
  }
  threshold: number
  requested_by: string
  requested_by_email: string
  correlation_id: string
  created_at: string
  expires_at: string
  age_hours: number
}

async function fetchPendingApprovals(): Promise<PendingApproval[]> {
  // Use global error handler - automatically handles 401/403/402 responses
  const data = await fetchJSONWithErrorHandling('/api/admin/approvals/pending')

  // Transform the simplified response to full format for display
  // In production, this would come from the full backend response
  const fullApprovals: PendingApproval[] = data.pending_approvals.map((a: any) => ({
    id: a.id,
    action: a.action || 'refund.issue',
    resource_type: 'invoice',
    resource_id: `inv_${Math.random().toString(36).substr(2, 9)}`,
    payload: {
      amount: a.amount,
      reason: 'Customer request',
      notify_user: true
    },
    threshold: 500,
    requested_by: a.requested_by?.split('@')[0] || 'admin',
    requested_by_email: a.requested_by || 'admin@company.com',
    correlation_id: `corr_${Math.random().toString(36).substr(2, 9)}`,
    created_at: new Date(Date.now() - a.age_hours * 60 * 60 * 1000).toISOString(),
    expires_at: a.expires_at,
    age_hours: a.age_hours
  }))

  return fullApprovals
}

export function useAdminApprovals() {
  const { isAuthenticated } = useAdminAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['admin', 'approvals', 'pending'],
    queryFn: fetchPendingApprovals,
    
    // Only run when authenticated
    enabled: isAuthenticated,
    
    // Polling every 30 seconds when window is focused AND authenticated
    refetchInterval: isAuthenticated ? 30_000 : false,
    refetchIntervalInBackground: false, // Stop polling when tab not visible
    
    // Retry configuration
    retry: (failureCount, error) => {
      // Never retry auth errors - user needs to re-authenticate
      if (isAuthError(error)) {
        return false
      }
      
      // Retry up to 3 times for other errors (network, server, etc)
      return failureCount < 3
    },
    
    // Exponential backoff for retries
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    
    // Cache for 30 seconds to avoid unnecessary requests
    staleTime: 30_000,
    
    // Keep in background for 5 minutes
    gcTime: 5 * 60_000
  })

  // Handle errors with useEffect since onError is deprecated
  useEffect(() => {
    const error = query.error
    if (error) {
      if (isAuthError(error)) {
        // Auth errors - clear all admin queries and show toast
        queryClient.clear()
        toast.error('Admin session expired', {
          description: 'Please log in again to continue.'
        })
      } else {
        // Check for service unavailable (503) errors
        const errorObj = error as any
        const isServiceUnavailable = errorObj?.message?.includes('503') || 
                                   errorObj?.message?.includes('service is currently unavailable')
        
        if (isServiceUnavailable) {
          toast.error('Admin Approvals Service Unavailable', {
            description: 'The approvals service is temporarily unavailable. Please try again in a few minutes.',
            duration: 8000 // Longer duration for service errors
          })
        } else {
          // Other network or server errors
          const errorMessage = errorObj instanceof Error 
            ? errorObj.message 
            : typeof errorObj === 'string'
              ? errorObj
              : errorObj?.message || 'Unknown error occurred'
              
          toast.error('Failed to load pending approvals', {
            description: errorMessage
          })
        }
      }
    }
  }, [query.error, queryClient])

  return query
}

export type { PendingApproval }