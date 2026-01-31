/**
 * Advisor Availability Hooks
 *
 * Following CLAUDE.md patterns:
 * - React Query for data fetching with caching
 * - Auth store integration
 * - Network-aware polling
 * - Proper error handling
 */

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store' // CLAUDE.md: Always import from /store
import { advisorAvailabilityApi, AvailabilityError } from '@/services/advisor-availability-api'
import type {
  AvailabilityApiResponse,
  AvailabilityUpdateRequest,
  AvailabilityWindow,
  AvailabilityStatus,
  AdvisorCapacity
} from '@/types/advisor-availability'
import { logger } from '@/utils/logger'
import { useCallback, useEffect, useState } from 'react'

/**
 * Hook to fetch advisor availability data
 */
export function useAdvisorAvailability(userId?: string) {
  const { user, isAuthenticated } = useAuthStore()

  // Use provided userId or current user's ID
  const targetUserId = userId || user?.id

  return useQuery({
    queryKey: ['advisor-availability', targetUserId],
    queryFn: () => advisorAvailabilityApi.getAdvisorAvailability(targetUserId!),
    enabled: isAuthenticated && !!targetUserId && !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes - availability changes less frequently
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => {
      // Don't retry on client errors
      if (error instanceof AvailabilityError && error.statusCode && error.statusCode < 500) {
        return false
      }
      return failureCount < 3
    }
  })
}

/**
 * Hook to update advisor availability
 */
export function useUpdateAdvisorAvailability(userId?: string) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  // Use provided userId or current user's ID
  const targetUserId = userId || user?.id

  return useMutation({
    mutationFn: (updates: AvailabilityUpdateRequest) =>
      advisorAvailabilityApi.updateAdvisorAvailability(targetUserId!, updates),
    onSuccess: (data) => {
      logger.info('Availability updated successfully', {
        userId: targetUserId,
        correlationId: data.correlationId,
        currentUserId: user?.id
      })

      // Invalidate and refetch availability data
      queryClient.invalidateQueries({
        queryKey: ['advisor-availability', targetUserId]
      })

      // Also invalidate availability status
      queryClient.invalidateQueries({
        queryKey: ['advisor-availability-status', targetUserId]
      })
    },
    onError: (error: AvailabilityError) => {
      logger.error('Failed to update availability', {
        userId: targetUserId,
        error: error.message,
        code: error.code,
        correlationId: error.correlationId,
        currentUserId: user?.id
      })
    }
  })
}

/**
 * Hook to add availability window
 */
export function useAddAvailabilityWindow(advisorId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  return useMutation({
    mutationFn: (window: Omit<AvailabilityWindow, 'id' | 'advisor_id' | 'created_at' | 'updated_at'>) =>
      advisorAvailabilityApi.addAvailabilityWindow(advisorId, window),
    onSuccess: (data) => {
      logger.info('Availability window added successfully', {
        advisorId,
        windowId: data.windowId,
        correlationId: data.correlationId,
        userId: user?.id
      })

      // Invalidate availability data to trigger refetch
      queryClient.invalidateQueries({
        queryKey: ['advisor-availability', advisorId]
      })
    },
    onError: (error: AvailabilityError) => {
      logger.error('Failed to add availability window', {
        advisorId,
        error: error.message,
        code: error.code,
        correlationId: error.correlationId,
        userId: user?.id
      })
    }
  })
}

/**
 * Hook to remove availability window
 */
export function useRemoveAvailabilityWindow(advisorId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  return useMutation({
    mutationFn: (windowId: string) =>
      advisorAvailabilityApi.removeAvailabilityWindow(advisorId, windowId),
    onSuccess: (data, windowId) => {
      logger.info('Availability window removed successfully', {
        advisorId,
        windowId,
        correlationId: data.correlationId,
        userId: user?.id
      })

      // Invalidate availability data to trigger refetch
      queryClient.invalidateQueries({
        queryKey: ['advisor-availability', advisorId]
      })
    },
    onError: (error: AvailabilityError, windowId) => {
      logger.error('Failed to remove availability window', {
        advisorId,
        windowId,
        error: error.message,
        code: error.code,
        correlationId: error.correlationId,
        userId: user?.id
      })
    }
  })
}

/**
 * Hook to get availability status with real-time updates
 */
export function useAvailabilityStatus(advisorId: string, polling = false) {
  const { user, isAuthenticated } = useAuthStore()

  return useQuery({
    queryKey: ['advisor-availability-status', advisorId],
    queryFn: () => advisorAvailabilityApi.getAvailabilityStatus(advisorId),
    enabled: isAuthenticated && !!advisorId && !!user,
    staleTime: 0, // Status can change quickly
    refetchOnWindowFocus: true,
    refetchInterval: polling ? 30 * 1000 : false, // Poll every 30 seconds if enabled
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => {
      if (error instanceof AvailabilityError && error.statusCode && error.statusCode < 500) {
        return false
      }
      return failureCount < 2 // Less aggressive retry for status checks
    }
  })
}

/**
 * Hook for managing availability form state
 */
export function useAvailabilityForm(advisorId: string, initialData?: AvailabilityApiResponse) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [formData, setFormData] = useState<AvailabilityApiResponse | null>(initialData || null)

  // Update form data when initial data changes
  useEffect(() => {
    if (initialData) {
      setFormData(initialData)
      setHasUnsavedChanges(false)
    }
  }, [initialData])

  const updateFormData = useCallback((updates: Partial<AvailabilityApiResponse>) => {
    setFormData(current => current ? { ...current, ...updates } : null)
    setHasUnsavedChanges(true)
  }, [])

  const resetForm = useCallback(() => {
    if (initialData) {
      setFormData(initialData)
    }
    setHasUnsavedChanges(false)
  }, [initialData])

  const markAsSaved = useCallback(() => {
    setHasUnsavedChanges(false)
  }, [])

  return {
    formData,
    hasUnsavedChanges,
    updateFormData,
    resetForm,
    markAsSaved
  }
}

/**
 * Hook to validate availability changes before saving
 */
export function useAvailabilityValidation() {
  const validateTimeRange = useCallback((startTime: string, endTime: string): boolean => {
    const TIME_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/

    if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
      return false
    }

    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)

    const startMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin

    return startMinutes < endMinutes
  }, [])

  const validateWindow = useCallback((window: Partial<AvailabilityWindow>): {
    isValid: boolean
    errors: string[]
  } => {
    const errors: string[] = []

    if (typeof window.day_of_week !== 'number' || window.day_of_week < 0 || window.day_of_week > 6) {
      errors.push('Invalid day of week')
    }

    if (!window.start_time || !window.end_time) {
      errors.push('Start and end times are required')
    } else if (!validateTimeRange(window.start_time, window.end_time)) {
      errors.push('Invalid time range - start time must be before end time')
    }

    if (!window.timezone) {
      errors.push('Timezone is required')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }, [validateTimeRange])

  const validateCapacity = useCallback((capacity: Partial<AdvisorCapacity>): {
    isValid: boolean
    errors: string[]
  } => {
    const errors: string[] = []

    if (typeof capacity.max_concurrent_projects !== 'number' || capacity.max_concurrent_projects < 1) {
      errors.push('Maximum concurrent projects must be at least 1')
    }

    if (typeof capacity.max_weekly_hours !== 'number' || capacity.max_weekly_hours < 1) {
      errors.push('Maximum weekly hours must be at least 1')
    }

    if (capacity.auto_pause_threshold &&
        (capacity.auto_pause_threshold < 50 || capacity.auto_pause_threshold > 100)) {
      errors.push('Auto-pause threshold must be between 50% and 100%')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }, [])

  return {
    validateTimeRange,
    validateWindow,
    validateCapacity
  }
}