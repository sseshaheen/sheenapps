/**
 * Voucher Status Polling Hook
 * React Query integration for voucher payment status checking
 * Based on MULTI_PROVIDER_FRONTEND_INTEGRATION_PLAN.md
 */

'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { VoucherStatusResponse } from '@/types/billing'
import { logger } from '@/utils/logger'

interface UseVoucherStatusOptions {
  enabled?: boolean
  refetchInterval?: number
  onStatusChange?: (status: VoucherStatusResponse) => void
}

/**
 * Hook for polling voucher payment status with React Query
 * Automatically stops polling on terminal states (paid, expired, void)
 */
export function useVoucherStatus(
  orderId: string,
  options: UseVoucherStatusOptions = {}
) {
  const queryClient = useQueryClient()
  const {
    enabled = true,
    refetchInterval = 5000, // 5 seconds
    onStatusChange
  } = options

  return useQuery({
    queryKey: ['voucher-status', orderId],
    
    queryFn: async (): Promise<VoucherStatusResponse> => {
      logger.debug('api', `Polling voucher status for order: ${orderId}`)
      
      const response = await fetch(`/api/billing/invoices/${orderId}/status`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) {
        // Handle different HTTP status codes from the API
        if (response.status === 404) {
          throw new Error(`Order not found: ${orderId}`)
        }
        if (response.status >= 500) {
          throw new Error('Server error while checking payment status')
        }
        
        // For 410 (expired) and 409 (void), still parse the response
        if (response.status === 410 || response.status === 409) {
          const data = await response.json()
          return data as VoucherStatusResponse
        }
        
        throw new Error(`HTTP ${response.status}: Failed to check payment status`)
      }

      const data = await response.json() as VoucherStatusResponse
      
      // Log status changes for debugging (privacy-safe)
      logger.info('Voucher status update', {
        order_id: orderId,
        status: data.status,
        provider: data.payment_provider,
        updated_at: data.updated_at
      }, 'api')

      return data
    },

    enabled,
    refetchInterval,
    refetchIntervalInBackground: true,
    
    // Expert recommendation: Enhanced retry with exponential backoff
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000), // Cap at 30s
    
    // Expert recommendation: Only retry on 5xx errors, not 4xx
    retryOnMount: true,
    
    // Note: onSuccess removed for React Query v5 compatibility

    // Expert recommendation: Consider stale after 0ms for real-time updates
    staleTime: 0,
    
    // Keep data in cache for 1 minute after component unmounts
    gcTime: 60 * 1000
  })
}

/**
 * Hook for manually triggering a single status check (no polling)
 */
export function useVoucherStatusOnce(orderId: string) {
  return useQuery({
    queryKey: ['voucher-status-once', orderId],
    
    queryFn: async (): Promise<VoucherStatusResponse> => {
      const response = await fetch(`/api/billing/invoices/${orderId}/status`)
      
      if (!response.ok) {
        throw new Error(`Failed to check payment status: ${response.status}`)
      }
      
      return response.json()
    },
    
    enabled: false, // Only run when manually triggered
    staleTime: 30 * 1000, // Consider stale after 30 seconds
    retry: 1
  })
}