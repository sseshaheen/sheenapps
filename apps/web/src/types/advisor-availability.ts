/**
 * Advisor Availability Types
 *
 * Complete TypeScript definitions for advisor availability management
 * Following CLAUDE.md patterns for clean type definitions
 */

// Core availability types
export interface AvailabilityWindow {
  id: string
  advisor_id: string
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6 // Sunday = 0
  start_time: string // HH:mm format (24-hour)
  end_time: string   // HH:mm format (24-hour)
  timezone: string   // IANA timezone identifier
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AvailabilityException {
  id: string
  advisor_id: string
  date: string       // YYYY-MM-DD format
  type: 'unavailable' | 'available' // Override regular schedule
  start_time?: string // If type='available', custom hours
  end_time?: string
  reason?: string
  created_at: string
  updated_at: string
}

export interface AdvisorCapacity {
  id: string
  advisor_id: string
  max_concurrent_projects: number
  current_active_projects: number
  max_weekly_hours: number
  current_weekly_hours: number
  is_accepting_new_projects: boolean
  auto_pause_threshold?: number // Pause when reaching this % of capacity
  updated_at: string
}

// UI state types
export interface AvailabilityFormData {
  windows: Omit<AvailabilityWindow, 'id' | 'advisor_id' | 'created_at' | 'updated_at'>[]
  exceptions: Omit<AvailabilityException, 'id' | 'advisor_id' | 'created_at' | 'updated_at'>[]
  capacity: Omit<AdvisorCapacity, 'id' | 'advisor_id' | 'updated_at'>
}

export interface AvailabilityStatus {
  is_available: boolean
  status_reason: 'available' | 'at_capacity' | 'unavailable_schedule' | 'manual_pause'
  current_projects: number
  max_concurrent_projects: number
  capacity_utilization?: {  // Added for dashboard UI
    projects: number
    hours: number
    overall: number
  }
  next_available_at: string | null
  next_available_slot?: string | null  // Added for dashboard UI (alias of next_available_at)
  last_updated: string
}

// API response types
export interface AvailabilityApiResponse {
  windows: AvailabilityWindow[]
  exceptions: AvailabilityException[]
  capacity: AdvisorCapacity
  status?: AvailabilityStatus  // Added for dashboard UI
  is_available: boolean
  status_reason: string
  current_projects: number
  next_available_at: string | null
  last_updated: string
}

export interface AvailabilityUpdateRequest {
  windows?: Partial<AvailabilityWindow>[]
  exceptions?: Partial<AvailabilityException>[]
  capacity?: Partial<AdvisorCapacity>
}

// Validation helpers
export const TIME_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const DAYS_OF_WEEK = [
  { value: 0, label: 'sunday' },
  { value: 1, label: 'monday' },
  { value: 2, label: 'tuesday' },
  { value: 3, label: 'wednesday' },
  { value: 4, label: 'thursday' },
  { value: 5, label: 'friday' },
  { value: 6, label: 'saturday' }
] as const

export const DEFAULT_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney'
] as const

// Utility functions
export function isValidTimeRange(startTime: string, endTime: string): boolean {
  if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
    return false
  }

  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)

  const startMinutes = startHour * 60 + startMin
  const endMinutes = endHour * 60 + endMin

  return startMinutes < endMinutes
}

export function isValidDate(date: string): boolean {
  return DATE_REGEX.test(date) && !isNaN(new Date(date).getTime())
}

export function getCapacityUtilization(capacity: AdvisorCapacity): {
  projects: number
  hours: number
  overall: number
} {
  const projectUtil = capacity.current_active_projects / capacity.max_concurrent_projects
  const hourUtil = capacity.current_weekly_hours / capacity.max_weekly_hours

  return {
    projects: Math.round(projectUtil * 100),
    hours: Math.round(hourUtil * 100),
    overall: Math.round(Math.max(projectUtil, hourUtil) * 100)
  }
}