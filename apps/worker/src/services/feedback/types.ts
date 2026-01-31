/**
 * Feedback System Types
 *
 * Shared type definitions for the feedback collection system.
 * See FEEDBACK-COLLECTION-PLAN.md - Data Model section
 */

// ============================================================================
// Feedback Submission Types
// ============================================================================

export type FeedbackType =
  | 'nps'
  | 'csat'
  | 'binary'
  | 'emoji'
  | 'text'
  | 'feature_request'
  | 'bug_report';

export type FeedbackPlacement = 'inline' | 'toast' | 'modal' | 'tab' | 'banner';

export type FeedbackGoal =
  | 'onboarding'
  | 'helpfulness'
  | 'satisfaction'
  | 'nps'
  | 'bug'
  | 'feature';

export type DeviceType = 'desktop' | 'mobile' | 'tablet';

export interface FeedbackSubmission {
  id: string; // Client-generated UUID for idempotency
  type: FeedbackType;
  value: number | string | boolean;
  textComment?: string;

  // Identity
  userId?: string;
  anonymousId: string;
  sessionId: string;

  // Context
  pageUrl: string;
  featureId?: string;
  triggerPoint: string;

  // Prompt metadata
  promptId: string;
  placement: FeedbackPlacement;
  goal: FeedbackGoal;

  // Environment
  userAgent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  deviceType?: DeviceType;
  buildVersion?: string;
}

// ============================================================================
// Eligibility Types
// ============================================================================

export type PromptType =
  | 'nps'
  | 'csat'
  | 'micro_survey'
  | 'feature_helpful'
  | 'onboarding_ease'
  | 'exit_intent'
  | 'frustration_help';

export type EligibilityAction = 'shown' | 'dismissed' | 'responded';

export interface EligibilityCheckRequest {
  promptType: PromptType;
  userId?: string;
  anonymousId: string;
  featureId?: string;
}

export interface EligibilityCheckResponse {
  eligible: boolean;
  reason?: string;
  cooldownEnds?: string; // ISO timestamp
}

export interface EligibilityRecordRequest {
  promptType: PromptType;
  userId?: string;
  anonymousId: string;
  featureId?: string;
  action: EligibilityAction;
}

// ============================================================================
// Implicit Signal Types
// ============================================================================

export type ImplicitSignalType =
  | 'rage_click'
  | 'dead_click'
  | 'scroll_depth'
  | 'time_on_page'
  | 'error'
  | 'drop_off'
  | 'thrashing_score';

export interface ImplicitSignal {
  type: ImplicitSignalType;
  value: number | string | Record<string, unknown>;
  pageUrl: string;
  elementId?: string; // data-track attribute, NOT CSS selector
  sessionId: string;
  buildVersion?: string;
}

// ============================================================================
// Cooldown Configuration
// ============================================================================

/**
 * Default cooldown periods per prompt type (in days)
 * See FEEDBACK-COLLECTION-PLAN.md - Touchpoint Matrix
 */
export const COOLDOWN_DAYS: Record<PromptType, number> = {
  nps: 90, // Every 90 days
  csat: 7, // Once per ticket, roughly weekly cap
  micro_survey: 1, // Max 1 per day (session limit is more strict)
  feature_helpful: 30, // Once per feature per 30 days
  onboarding_ease: 365, // Only once ever (practically)
  exit_intent: 30, // Once per 30 days
  frustration_help: 1, // Once per day (session limit is more strict)
};

// ============================================================================
// Identity Helpers
// ============================================================================

/**
 * Build the identifier string for eligibility records
 * See FEEDBACK-COLLECTION-PLAN.md - User Identity Strategy
 */
export function buildIdentifier(
  userId: string | undefined,
  anonymousId: string | undefined,
  sessionId?: string
): string {
  if (userId) return `user:${userId}`;
  if (anonymousId) return `anon:${anonymousId}`;
  if (sessionId) return `session:${sessionId}`;
  throw new Error('No identifier available');
}

/**
 * Parse an identifier string back to its components
 */
export function parseIdentifier(identifier: string): {
  type: 'user' | 'anon' | 'session';
  id: string;
} {
  const [type, id] = identifier.split(':');
  if (!type || !id) {
    throw new Error(`Invalid identifier format: ${identifier}`);
  }
  return { type: type as 'user' | 'anon' | 'session', id };
}
