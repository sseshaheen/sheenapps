/**
 * Advisor Matching System Types
 * 
 * Production-ready types for intelligent advisor-client matching with:
 * - Type-safe matching criteria and scoring
 * - PostgreSQL range types for work hours and time-off
 * - Idempotency patterns for reliable matching
 * - Explainability features for ML readiness
 */

// Database Enums
export type AdvisorStatus = 'available' | 'busy' | 'offline';
export type MatchStatus = 
  | 'pending' 
  | 'matched' 
  | 'client_approved' 
  | 'client_declined' 
  | 'advisor_accepted' 
  | 'advisor_declined' 
  | 'finalized' 
  | 'expired';
export type NotificationStatus = 'pending' | 'queued' | 'delivered' | 'failed';
export type ProjectComplexity = 'simple' | 'medium' | 'complex';
export type ApproverType = 'client' | 'advisor';
export type Decision = 'approved' | 'declined';

// Core Entities
export interface AdvisorAvailability {
  advisor_id: string;
  status: AdvisorStatus;
  max_concurrent_projects: number;
  last_active: string; // ISO timestamp
  availability_preferences: Record<string, any>;
  updated_at: string; // ISO timestamp
}

export interface AdvisorWorkHours {
  advisor_id: string;
  tz: string; // Timezone like 'America/Los_Angeles'
  dow: number; // Day of week: 0=Sunday, 6=Saturday
  minutes: string; // PostgreSQL int4range: '[start,end)'
}

export interface AdvisorTimeOff {
  advisor_id: string;
  period: string; // PostgreSQL tstzrange: '[start,end)'
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  reason?: string | undefined; // 'vacation', 'sick', 'conference', etc.
}

export interface AdvisorSkill {
  advisor_id: string;
  skill_category: string; // 'framework', 'language', 'specialty'
  skill_name: string; // 'react', 'typescript', 'ecommerce'
  proficiency_level: number; // 1-5
  years_experience: number;
  verified: boolean;
  created_at: string; // ISO timestamp
}

export interface AdvisorPreference {
  id: string;
  advisor_id: string;
  preference_type: string; // 'preferred', 'priority', 'specialized'
  criteria: Record<string, any>; // {"framework": "react", "project_type": "ecommerce"}
  priority_score: number;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  created_by?: string | undefined;
  created_at: string; // ISO timestamp
}

export interface AdvisorMatchRequest {
  id: string;
  project_id: string;
  requested_by: string; // Project owner
  match_criteria: Record<string, any>;
  status: MatchStatus;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  matched_advisor_id?: string | undefined;
  match_score?: number | undefined;
  match_reason?: string | undefined;
  expires_at: string; // ISO timestamp
  scoring_features?: Record<string, any> | undefined; // {availability:1, skills:0.78, tz:0.6, preference:0.1}
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

export interface NotificationOutbox {
  id: string;
  match_request_id: string;
  recipient_id: string;
  notification_type: string; // 'advisor_matched', 'client_approval', 'advisor_accepted'
  delivery_method: string; // 'email', 'sms', 'push', 'in_app'
  payload: Record<string, any>; // Minimal data: project name, stack tags (no secrets)
  status: NotificationStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string; // ISO timestamp
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  delivered_at?: string | undefined; // ISO timestamp
  dead_letter: boolean;
  created_at: string; // ISO timestamp
}

export interface AdvisorMatchNotification {
  id: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  outbox_id?: string | undefined;
  match_request_id: string;
  recipient_id: string;
  notification_type: string;
  delivery_method: string;
  delivered_at: string; // ISO timestamp
  response_data?: Record<string, any> | undefined; // Email provider response, etc.
}

export interface AdvisorMatchApproval {
  id: string;
  match_request_id: string;
  approver_id: string;
  approver_type: ApproverType;
  decision: Decision;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  reason?: string | undefined;
  decided_at: string; // ISO timestamp
}

// Matching Algorithm Types
export interface MatchingCriteria {
  status: 'available'; // Required status
  capacity: boolean; // active_count < max_concurrent_projects
  skill_match: boolean; // At least one skill matches project stack
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  timezone_overlap?: boolean | undefined; // Optional timezone overlap requirement
  minimum_score?: number | undefined; // Minimum matching score threshold
}

export interface ScoringWeights {
  availability: number; // Weight for availability (typically 40)
  skills: number; // Weight for skill matching (typically 35)
  timezone: number; // Weight for timezone overlap (typically 15)
  preference: number; // Weight for admin preferences (typically 10)
}

export interface ScoringFeatures {
  availability: number; // 1 or 0
  skills: number; // 0-1 based on proficiency and experience
  timezone: number; // 0-1 based on overlap fraction
  preference: number; // 0-1 based on admin preferences
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  notes?: string | undefined; // Human-readable explanation
}

export interface CandidateAdvisor {
  advisor_id: string;
  score: number;
  scoring_features: ScoringFeatures;
  active_count: number; // Current active projects
  salt: number; // Deterministic randomization
}

// Technology Stack Detection
export interface TechnologyStack {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  framework?: string | undefined; // 'react', 'nextjs', 'vue', 'svelte'
  languages: string[]; // ['typescript', 'javascript', 'css']
  dependencies: string[]; // ['tailwind', 'prisma', 'stripe']
  deployment_target?: string | undefined; // 'vercel', 'netlify', 'cloudflare'
  complexity_factors: string[]; // ['authentication', 'payments', 'realtime']
}

export interface ProjectTechMetadata {
  project_id: string;
  technology_stack: TechnologyStack;
  project_complexity: ProjectComplexity;
  estimated_advisor_hours: number;
  detected_at: string; // ISO timestamp
}

// Service Interface Types
export interface CreateMatchRequestParams {
  projectId: string;
  requestedBy: string; // User ID of project owner
  matchCriteria: Record<string, any>;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  expiresInHours?: number | undefined; // Default: 2 hours
}

export interface UpdateMatchRequestParams {
  matchId: string;
  status: MatchStatus;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  matchedAdvisorId?: string | undefined;
  matchScore?: number | undefined;
  matchReason?: string | undefined;
  scoringFeatures?: ScoringFeatures | undefined;
}

export interface FindBestAdvisorParams {
  projectId: string;
  techStack: TechnologyStack;
  projectComplexity: ProjectComplexity;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  scoringWeights?: Partial<ScoringWeights> | undefined;
  excludeAdvisors?: string[] | undefined; // Advisor IDs to exclude
}

export interface NotificationParams {
  matchRequestId: string;
  recipientId: string;
  notificationType: string;
  deliveryMethod: string;
  payload: Record<string, any>;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  maxAttempts?: number | undefined; // Default: 3
}

// Response Types
export interface MatchingResult {
  success: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  matchRequest?: AdvisorMatchRequest | undefined;
  candidateAdvisor?: CandidateAdvisor | undefined;
  error?: string | undefined;
}

export interface AdvisorActiveProjects {
  advisor_id: string;
  active_count: number;
}

export interface AvailabilityCheckResult {
  advisor_id: string;
  is_available: boolean;
  status: AdvisorStatus;
  current_capacity: number;
  max_capacity: number;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  reason?: string | undefined; // Why not available
}

// API Request/Response Types
export interface CreateMatchRequestBody {
  projectId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  matchCriteria?: Record<string, any> | undefined;
  expiresInHours?: number | undefined;
}

export interface ApproveMatchBody {
  decision: Decision;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  reason?: string | undefined;
}

export interface UpdateAvailabilityBody {
  status: AdvisorStatus;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  maxConcurrentProjects?: number | undefined;
  availabilityPreferences?: Record<string, any> | undefined;
}

export interface AddWorkHoursBody {
  timezone: string;
  dayOfWeek: number; // 0-6
  startMinutes: number; // Minutes from midnight
  endMinutes: number; // Minutes from midnight
}

export interface AddTimeOffBody {
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  reason?: string | undefined;
}

export interface MatchRequestResponse {
  id: string;
  projectId: string;
  status: MatchStatus;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  matchedAdvisor?: {
    id: string;
    displayName: string;
    skills: string[];
    specialties: string[];
    rating: number;
  } | undefined;
  score?: number | undefined;
  expiresAt: string;
  createdAt: string;
}

// Error Types
export class AdvisorMatchingError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AdvisorMatchingError';
  }
}

// Constants
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  availability: 40,
  skills: 35,
  timezone: 15,
  preference: 10
};

export const MATCH_EXPIRY_HOURS = 2;
export const MAX_NOTIFICATION_ATTEMPTS = 3;
export const ADVISOR_COOLDOWN_HOURS = 24; // After decline/no-response
export const FAIRNESS_BOOST_DAYS = 7; // Boost advisors not matched in last 7 days

// Skill Categories
export const SKILL_CATEGORIES = {
  FRAMEWORK: 'framework',
  LANGUAGE: 'language',
  SPECIALTY: 'specialty',
  TOOL: 'tool',
  DATABASE: 'database'
} as const;

export const NOTIFICATION_TYPES = {
  ADVISOR_MATCHED: 'advisor_matched',
  CLIENT_APPROVAL: 'client_approval', 
  ADVISOR_ACCEPTED: 'advisor_accepted',
  ADVISOR_DECLINED: 'advisor_declined',
  MATCH_EXPIRED: 'match_expired'
} as const;

export const DELIVERY_METHODS = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  IN_APP: 'in_app'
} as const;