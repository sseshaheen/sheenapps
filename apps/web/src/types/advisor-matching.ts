/**
 * Advisor Matching System Types
 * Contract types for intelligent advisor matching system
 *
 * Following CLAUDE.md patterns:
 * - TypeScript contract generation from backend OpenAPI
 * - State machine pattern for match status
 * - PII masking for security
 */

export type MatchStatus =
  | 'pending'           // Match request created, searching for advisor
  | 'matched'           // Advisor found, awaiting dual approval
  | 'client_approved'   // Client approved, awaiting advisor
  | 'client_declined'   // Client declined, can retry
  | 'advisor_accepted'  // Advisor accepted, awaiting client
  | 'advisor_declined'  // Advisor declined, can retry
  | 'finalized'         // Both approved, workspace active
  | 'expired'           // Request expired, needs new match

export interface MatchCriteria {
  framework?: string
  complexity_level?: 'beginner' | 'intermediate' | 'advanced'
  estimated_hours?: number
  timezone?: string
  specializations?: string[]
  budget_range?: {
    min: number
    max: number
    currency: string
  }
}

export interface MatchRequest {
  id: string
  project_id: string
  user_id?: string  // Added for admin dashboard use
  status: MatchStatus
  suggested_advisor_id?: string
  client_decision?: 'approved' | 'declined'
  advisor_decision?: 'accepted' | 'declined'
  match_score?: number  // Added for notification UI (0-100)
  expires_at: string
  created_at: string
  updated_at: string
  correlation_id?: string
  match_criteria: MatchCriteria
}

// Masked project data for advisor preview (before acceptance)
export interface MaskedProjectData {
  id: string
  framework: string
  complexity_level: 'beginner' | 'intermediate' | 'advanced'
  estimated_hours?: number

  // Masked until advisor accepts
  title?: string
  description?: string
  repository_url?: string
  client_company?: string
}

export interface AdvisorProfile {
  id: string
  display_name: string
  avatar_url?: string
  bio?: string
  skills: string[]
  specialties: string[]
  years_experience: number
  rating: number
  review_count: number
  availability_status: 'available' | 'busy' | 'offline' | 'time_off'
  next_available_time?: string
  available_capacity: number
  max_concurrent: number
  active_projects: number
}

export interface AvailabilityStatus {
  status: 'available' | 'busy' | 'offline' | 'time_off'
  max_concurrent_projects: number
  current_capacity: number
  work_hours: WeeklySchedule
  time_off: TimeOffPeriod[]
  timezone: string
  last_updated: string
}

export interface WeeklySchedule {
  schedule: Array<{
    dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
    startMinutes: number // Minutes from midnight
    endMinutes: number   // Minutes from midnight
    timezone: string
  }>
}

export interface TimeOffPeriod {
  startDate: string // ISO date
  endDate: string   // ISO date (inclusive)
  reason?: string
  type: 'vacation' | 'sick' | 'personal' | 'training'
}

export interface PoolStatus {
  total_advisors: number
  available_advisors: number
  active_advisors?: number  // Added for admin dashboard
  busy_advisors: number
  offline_advisors: number
  advisors_at_capacity?: number  // Added for admin dashboard
  advisors_on_break?: number  // Added for admin dashboard
  average_response_time: number
  active_matches: number
  pending_matches: number
  success_rate_24h: number
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down'
  response_time_p95: number
  average_response_time?: number  // Added for admin dashboard (alias of p95)
  error_rate_5min: number
  error_rate?: number  // Added for admin dashboard (alias of 5min)
  queue_depth: number
  uptime?: number  // Added for admin dashboard
  last_checked: string
}

export interface MatchingNotification {
  id: string
  type: 'match_suggested' | 'approval_needed' | 'match_finalized' | 'match_expired'
  match_id: string
  title: string
  message: string
  created_at: string
  read: boolean
}

// Error taxonomy for user-friendly messages
export interface MatchingError {
  code: MatchingErrorCode
  message: string
  correlationId: string
  details?: any
}

export type MatchingErrorCode =
  | 'NO_ELIGIBLE_ADVISORS'
  | 'ADVISOR_COOLDOWN'
  | 'CAPACITY_REACHED'
  | 'MATCH_CONFLICT'
  | 'MATCH_EXPIRED'
  | 'RLS_DENIED'
  | 'STATE_CHANGED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'

// State machine validation
export const VALID_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  'pending': ['matched', 'expired'],
  'matched': ['client_approved', 'client_declined', 'advisor_accepted', 'advisor_declined', 'expired'],
  'client_approved': ['finalized', 'advisor_declined', 'expired'],
  'client_declined': ['pending', 'expired'],
  'advisor_accepted': ['finalized', 'client_declined', 'expired'],
  'advisor_declined': ['pending', 'expired'],
  'finalized': [], // Terminal state
  'expired': ['pending'] // Can restart
}

export function isValidTransition(from: MatchStatus, to: MatchStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// Terminal states that should stop polling
export const TERMINAL_MATCH_STATES: readonly MatchStatus[] = ['finalized', 'expired'] as const

export function isTerminalState(status: MatchStatus): boolean {
  return TERMINAL_MATCH_STATES.includes(status)
}

// Analytics types
export interface MatchingAnalytics {
  period: string
  total_matches: number
  successful_matches: number
  success_rate: number
  average_response_time: number
  client_approval_rate: number
  advisor_acceptance_rate: number
  capacity_utilization: number
  trending_skills: string[]
  peak_demand_hours: number[]
  advisor_performance: {
    advisor_id: string
    name: string
    matches_completed: number
    average_rating: number
    response_time: number
  }[]
  match_distribution: {
    skill_category: string
    count: number
    success_rate: number
  }[]
}