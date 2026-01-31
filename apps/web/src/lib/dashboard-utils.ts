/**
 * Client-Safe Dashboard Utilities
 * Standardized utilities for advisor dashboard implementation
 * 
 * Features:
 * - Stable query key generation (prevents cache misses)
 * - Infinite pagination deduplication  
 * - Safe Zod parsing with fallbacks
 * - Abortable fetch utilities
 * - Timezone validation helpers
 * - Currency/date formatting with locale support
 */

import { z } from 'zod'
import { logger } from '@/utils/logger'

// ==========================================
// Query Key Utilities
// ==========================================

/**
 * Stable JSON stringify that sorts keys to prevent cache misses
 * Fixes issue where JSON.stringify can reorder object keys
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj !== 'object') return String(obj)
  
  const sortedKeys = Object.keys(obj as Record<string, any>).sort()
  const sortedObj = sortedKeys.reduce((acc, key) => {
    acc[key] = (obj as any)[key]
    return acc
  }, {} as Record<string, any>)
  
  return JSON.stringify(sortedObj)
}

// ==========================================
// Pagination Utilities  
// ==========================================

/**
 * Deduplicate items across infinite query pages
 * Guards against duplicate IDs at page boundaries
 */
export function dedupePages<T extends { id: string }>(pages: T[][]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  
  for (const page of pages) {
    for (const item of page) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        result.push(item)
      }
    }
  }
  
  return result
}

/**
 * Parse base64 cursor for pagination (client-safe)
 * Format: base64(scheduled_at|id)
 */
export function parseCursor(cursor?: string): { scheduledAt?: string; id?: string } {
  if (!cursor) return {}
  
  try {
    const decoded = atob(cursor)
    const [scheduledAt, id] = decoded.split('|')
    return { scheduledAt, id }
  } catch (error) {
    logger.warn('Failed to parse cursor', { cursor, error })
    return {}
  }
}

/**
 * Generate base64 cursor for pagination (client-safe)
 * Format: base64(scheduled_at|id)  
 */
export function generateCursor(scheduledAt: string, id: string): string {
  const raw = `${scheduledAt}|${id}`
  return btoa(raw)
}

// ==========================================
// Safe Parsing Utilities
// ==========================================

/**
 * Parse data with Zod schema, providing fallback on validation failure
 * Logs errors but doesn't crash the application
 */
export function parseWithFallback<T>(
  schema: z.ZodSchema<T>, 
  data: unknown, 
  fallback: T,
  context?: string
): T {
  const result = schema.safeParse(data)
  
  if (!result.success) {
    logger.warn('Schema validation failed - using fallback', {
      context,
      error: result.error.issues,
      fallbackUsed: true
    })
    return fallback
  }
  
  return result.data
}

/**
 * Parse API response with graceful degradation
 * Returns both parsed data and validation success status
 */
export function parseApiResponse<T>(
  schema: z.ZodSchema<T>,
  response: unknown,
  endpoint: string
): { data: T | null; success: boolean; error?: string } {
  const result = schema.safeParse(response)
  
  if (!result.success) {
    const errorMessage = `API response validation failed for ${endpoint}`
    logger.error(errorMessage, {
      endpoint,
      errors: result.error.issues,
      response: typeof response === 'object' ? JSON.stringify(response) : response
    })
    
    return { 
      data: null, 
      success: false, 
      error: errorMessage 
    }
  }
  
  return { 
    data: result.data, 
    success: true 
  }
}

// ==========================================
// Abortable Fetch Utilities
// ==========================================

/**
 * Create an abortable fetch function with cleanup
 * Prevents stale requests from overwriting fresh data
 */
export function createAbortableFetch() {
  let controller: AbortController | null = null
  
  const fetch = async <T>(
    url: string, 
    options: RequestInit = {}
  ): Promise<T> => {
    // Abort previous request if still pending
    if (controller) {
      controller.abort()
    }
    
    // Create new controller for this request
    controller = new AbortController()
    
    const response = await globalThis.fetch(url, {
      ...options,
      signal: controller.signal
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    controller = null // Clear on success
    return data
  }
  
  const abort = () => {
    if (controller) {
      controller.abort()
      controller = null
    }
  }
  
  return { fetch, abort }
}

// ==========================================
// Timezone & Date Utilities
// ==========================================

/**
 * Validate IANA timezone string
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/**
 * Validate time slot for availability management
 */
export function validateTimeSlot(
  start: string,
  end: string,
  timezone: string
): { valid: boolean; error?: string } {
  // Validate timezone
  if (!isValidTimezone(timezone)) {
    return { valid: false, error: 'Invalid timezone' }
  }
  
  // Parse times (expecting HH:MM format)
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  if (!timeRegex.test(start) || !timeRegex.test(end)) {
    return { valid: false, error: 'Invalid time format (expected HH:MM)' }
  }
  
  // Convert to minutes for comparison
  const startMinutes = timeToMinutes(start)
  const endMinutes = timeToMinutes(end)
  
  if (startMinutes >= endMinutes) {
    return { valid: false, error: 'Start time must be before end time' }
  }
  
  // Check for valid durations (15, 30, 60 minute slots)
  const duration = endMinutes - startMinutes
  const allowedDurations = [15, 30, 60, 90, 120, 180, 240, 300, 360, 420, 480] // Up to 8 hours
  
  if (!allowedDurations.includes(duration)) {
    return { valid: false, error: 'Invalid duration (must be 15, 30, 60+ minute slots)' }
  }
  
  return { valid: true }
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Check for overlapping time slots
 */
export function hasTimeSlotOverlap(
  slots: Array<{ start: string; end: string }>
): boolean {
  const sortedSlots = [...slots].sort((a, b) => 
    timeToMinutes(a.start) - timeToMinutes(b.start)
  )
  
  for (let i = 1; i < sortedSlots.length; i++) {
    const prev = sortedSlots[i - 1]
    const curr = sortedSlots[i]
    
    if (timeToMinutes(prev.end) > timeToMinutes(curr.start)) {
      return true // Overlap detected
    }
  }
  
  return false
}

// ==========================================
// Locale-Aware Formatting
// ==========================================

/**
 * Format currency amount with locale support
 */
export function formatCurrency(
  cents: number, 
  locale: string, 
  currency = 'USD'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(cents / 100)
}

/**
 * Format date with locale support
 */
export function formatDate(
  date: string | Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  }).format(dateObj)
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(
  date: string | Date,
  locale: string
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - dateObj.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  
  // Use Intl.RelativeTimeFormat for proper localization
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  
  if (diffMinutes < 1) return rtf.format(0, 'minute')
  if (diffMinutes < 60) return rtf.format(-diffMinutes, 'minute')
  
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return rtf.format(-diffHours, 'hour')
  
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return rtf.format(-diffDays, 'day')
  
  const diffWeeks = Math.floor(diffDays / 7)
  return rtf.format(-diffWeeks, 'week')
}

// ==========================================
// React Query Defaults
// ==========================================

/**
 * Standard React Query options for dashboard queries
 */
export const dashboardQueryDefaults = {
  staleTime: 30_000, // 30 seconds
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  retry: (failureCount: number, error: any) => {
    // Don't retry auth errors or client errors (4xx)
    if (error?.status >= 400 && error?.status < 500) return false
    return failureCount < 2
  }
} as const

/**
 * Enhanced error handling for React Query
 */
export function handleQueryError(error: any, context: string) {
  logger.error(`Query error in ${context}`, {
    error: error?.message || error,
    status: error?.status,
    context
  })
  
  // Handle specific error types
  if (error?.status === 401) {
    // Could trigger reauth here if needed
    return 'Authentication required - please log in'
  }
  
  if (error?.status === 429) {
    return 'Too many requests - please wait a moment'
  }
  
  if (error?.status >= 500) {
    return 'Server error - please try again later'
  }
  
  return error?.message || 'An unexpected error occurred'
}

// ==========================================
// Advisor Query Keys
// ==========================================

export const advisorKeys = {
  all: ['advisor'] as const,
  overview: (userId: string, locale: string) => [...advisorKeys.all, 'overview', userId, locale] as const,
  consultations: (userId: string, locale: string, filters?: any) => [...advisorKeys.all, 'consultations', userId, locale, filters] as const,
  analytics: (userId: string, locale: string, period: string) => [...advisorKeys.all, 'analytics', userId, locale, period] as const,
  availability: (userId: string, locale: string) => [...advisorKeys.all, 'availability', userId, locale] as const,
  settings: (userId: string, locale: string) => [...advisorKeys.all, 'settings', userId, locale] as const,
} as const

// ==========================================
// Type Exports
// ==========================================

export type AdvisorQueryKey =
  | typeof advisorKeys.all
  | ReturnType<typeof advisorKeys.overview>
  | ReturnType<typeof advisorKeys.consultations>
  | ReturnType<typeof advisorKeys.analytics>
  | ReturnType<typeof advisorKeys.availability>
  | ReturnType<typeof advisorKeys.settings>
export type TimeSlot = { start: string; end: string }
export type ValidationResult = { valid: boolean; error?: string }