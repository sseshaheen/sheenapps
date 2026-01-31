/**
 * Feedback System Types (Client-Side)
 *
 * Shared type definitions for feedback collection.
 * See FEEDBACK-COLLECTION-PLAN.md
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

export interface EligibilityCheckResponse {
  eligible: boolean;
  reason?: string;
  cooldownEnds?: string; // ISO timestamp
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
// Session State (Client-Side Tracking)
// ============================================================================

export interface FeedbackSessionState {
  sessionId: string;
  anonymousId: string;
  sawFrustrationPrompt: boolean;
  feedbackCountThisSession: number;
  lastPromptShownAt: string | null;
}

// ============================================================================
// Queue Priority (for orchestration)
// ============================================================================

export type PromptPriority = 'frustration' | 'success' | 'nps' | 'exit_intent';

/**
 * Priority order - higher number = higher priority
 * Only one prompt per session (except user-initiated via tab)
 */
export const PROMPT_PRIORITY: Record<PromptPriority, number> = {
  frustration: 4, // Highest - help users who are struggling
  success: 3, // After task completion
  nps: 2, // Relationship health check
  exit_intent: 1, // Last resort (optional/experimental)
};

/**
 * Map PromptType to PromptPriority for queue enforcement
 * Used by FeedbackProvider to track which priority level has been shown
 */
export const PROMPT_TYPE_TO_PRIORITY: Record<PromptType, PromptPriority> = {
  frustration_help: 'frustration',
  micro_survey: 'success', // Completion-triggered surveys
  feature_helpful: 'success',
  onboarding_ease: 'success',
  csat: 'success', // Post-interaction
  nps: 'nps',
  exit_intent: 'exit_intent',
};
