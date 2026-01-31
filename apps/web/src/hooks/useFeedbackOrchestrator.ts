'use client';

/**
 * Feedback Orchestrator Hook
 *
 * Central arbiter for all feedback events. Components emit events,
 * the orchestrator decides what (if anything) to show.
 *
 * Key principles:
 *   - Single source of truth for feedback decisions
 *   - Idempotency: seenEvents set prevents double prompts from React re-renders
 *   - Priority ranking: first_build > export > build_success > nps
 *   - Server-side eligibility is source of truth (client caches briefly)
 *   - Max 1 prompt per session (includes help offers)
 *
 * See FEEDBACK-INTEGRATION-PLAN.md
 */

import { useCallback, useRef, useState } from 'react';
import { useFeedbackSafe } from '@/components/feedback/FeedbackProvider';
import type { PromptType } from '@/lib/feedback';

// ============================================================================
// Types
// ============================================================================

/**
 * Event types that can trigger feedback
 */
export type FeedbackEventType =
  | 'first_build_ever'   // Highest priority - once per user lifetime
  | 'export_success'     // User achieved deployment goal
  | 'build_success'      // General build completion
  | 'build_failure'      // Show help offer, NOT survey
  | 'rage_clicks'        // Frustration detected
  | 'nps_due';           // 90-day relationship check

/**
 * Feedback event payload
 */
export interface FeedbackEvent {
  type: FeedbackEventType;
  /** Project ID for context */
  projectId?: string;
  /** Build ID for deduplication */
  buildId?: string;
  /** Export ID for deduplication */
  exportId?: string;
  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Feedback action to show
 */
export type FeedbackAction =
  | { type: 'csat'; question: string; featureId: string; promptType: PromptType }
  | { type: 'onboarding_ease'; featureId: string }
  | { type: 'export_satisfaction'; featureId: string }
  | { type: 'help_offer'; title: string; actions: HelpAction[] }
  | { type: 'nps' }
  | null;

export interface HelpAction {
  label: string;
  action: 'report_issue' | 'show_logs' | 'dismiss';
}

/**
 * Map event types to prompt types for eligibility checking
 */
const EVENT_TO_PROMPT_TYPE: Partial<Record<FeedbackEventType, PromptType>> = {
  first_build_ever: 'onboarding_ease',
  export_success: 'feature_helpful',
  build_success: 'csat',
  nps_due: 'nps',
  rage_clicks: 'frustration_help',
};

/**
 * Get stable cooldown key for eligibility tracking
 * CRITICAL: Cooldown keys must be stable, not per-build/per-export
 * Otherwise users get unlimited prompts across builds/projects
 */
function getStableCooldownKey(eventType: FeedbackEventType): string {
  switch (eventType) {
    case 'first_build_ever':
      return 'first_build_ever'; // Lifetime - once per user (global)
    case 'nps_due':
      return 'nps_90d'; // Stable 90-day cycle key
    case 'build_success':
      return 'build_success_csat'; // Stable cooldown across all builds
    case 'export_success':
      return 'export_success_satisfaction'; // Stable cooldown across all exports
    default:
      return eventType; // Fallback
  }
}

// ============================================================================
// Hook
// ============================================================================

interface UseFeedbackOrchestratorOptions {
  /** Disable orchestrator entirely */
  disabled?: boolean;
}

interface UseFeedbackOrchestratorReturn {
  /**
   * Emit a feedback event. Orchestrator decides what to show.
   * Safe to call multiple times - idempotent by event key.
   */
  emitEvent: (event: FeedbackEvent) => Promise<void>;

  /**
   * Current feedback action to display (null if none)
   */
  currentAction: FeedbackAction;

  /**
   * Dismiss the current feedback action
   */
  dismissAction: () => void;

  /**
   * Check if an event has already been processed this session
   */
  hasSeenEvent: (type: FeedbackEventType, id?: string) => boolean;

  /**
   * Whether any feedback has been shown this session
   */
  hasShownFeedbackThisSession: boolean;
}

export function useFeedbackOrchestrator(
  options: UseFeedbackOrchestratorOptions = {}
): UseFeedbackOrchestratorReturn {
  const { disabled = false } = options;

  const feedback = useFeedbackSafe();

  // Track seen events for idempotency (survives re-renders, resets on page reload)
  const seenEventsRef = useRef<Set<string>>(new Set());

  // Track if any feedback has been shown this session
  const [hasShownFeedbackThisSession, setHasShownFeedbackThisSession] = useState(false);

  // Current action to display
  const [currentAction, setCurrentAction] = useState<FeedbackAction>(null);

  // Processing lock to prevent race conditions
  const isProcessingRef = useRef(false);

  /**
   * Generate a stable key for event deduplication
   * Key format: {type}:{id}
   * CRITICAL: Global events (first_build_ever, nps_due) MUST use 'global' key
   * regardless of buildId/exportId to ensure proper deduplication
   */
  const getEventKey = useCallback((event: FeedbackEvent): string => {
    // Global events always use 'global' key - they are lifetime/cycle events
    if (event.type === 'first_build_ever' || event.type === 'nps_due') {
      return `${event.type}:global`;
    }
    const id = event.buildId || event.exportId || event.projectId || 'global';
    return `${event.type}:${id}`;
  }, []);

  /**
   * Check if an event has been seen
   * CRITICAL: Must match getEventKey() logic for consistency
   */
  const hasSeenEvent = useCallback(
    (type: FeedbackEventType, id?: string): boolean => {
      // Global events always check 'global' key
      if (type === 'first_build_ever' || type === 'nps_due') {
        return seenEventsRef.current.has(`${type}:global`);
      }
      const key = `${type}:${id || 'global'}`;
      return seenEventsRef.current.has(key);
    },
    []
  );

  /**
   * Dismiss the current feedback action
   */
  const dismissAction = useCallback(() => {
    setCurrentAction(null);
  }, []);

  /**
   * Process a feedback event and decide what to show
   */
  const emitEvent = useCallback(
    async (event: FeedbackEvent): Promise<void> => {
      // Guard: disabled or no feedback system
      if (disabled || !feedback) return;

      // Guard: already shown feedback this session (except help offers can interrupt)
      // Per plan: "Max 1 prompt per session" - help offers count too
      if (hasShownFeedbackThisSession && event.type !== 'build_failure' && event.type !== 'rage_clicks') {
        return;
      }

      // CRITICAL: Acquire processing lock FIRST to prevent race conditions
      // If we mark as "seen" before acquiring lock, concurrent events get lost
      if (isProcessingRef.current) {
        return;
      }
      isProcessingRef.current = true;

      try {
        // Idempotency: check if we've already processed this exact event
        // Done AFTER acquiring lock to avoid marking events as seen but never processing them
        const eventKey = getEventKey(event);
        if (seenEventsRef.current.has(eventKey)) {
          return;
        }

        // Mark as seen only after we have the lock and confirmed it's new
        seenEventsRef.current.add(eventKey);
        // Get prompt type for this event
        const promptType = EVENT_TO_PROMPT_TYPE[event.type];

        // Check server-side eligibility for survey-type events
        // CRITICAL: Use stable cooldown keys, not per-build/per-export keys
        // Otherwise users get unlimited prompts across builds/projects
        if (promptType) {
          const featureId = getStableCooldownKey(event.type);

          const eligibility = await feedback.checkPromptEligibility(promptType, featureId);

          if (!eligibility.eligible) {
            // Not eligible (cooldown active, etc.)
            return;
          }
        }

        // Check client-side queue priority
        const priority = event.type === 'build_failure' || event.type === 'rage_clicks'
          ? 'frustration'
          : event.type === 'nps_due'
          ? 'nps'
          : 'success';

        if (!feedback.canShowPrompt(priority)) {
          return;
        }

        // Decide what action to take based on event type
        let action: FeedbackAction = null;

        switch (event.type) {
          case 'first_build_ever':
            action = {
              type: 'onboarding_ease',
              featureId: 'first_build_ever',
            };
            break;

          case 'export_success':
            action = {
              type: 'export_satisfaction',
              featureId: event.exportId || event.projectId || 'export',
            };
            break;

          case 'build_success':
            action = {
              type: 'csat',
              question: 'Did this build come out the way you expected?',
              featureId: event.buildId || event.projectId || 'build',
              promptType: 'csat',
            };
            break;

          case 'build_failure':
            // Help offer, NOT survey
            action = {
              type: 'help_offer',
              title: 'Build failed',
              actions: [
                { label: 'Report issue', action: 'report_issue' },
                { label: 'Show what went wrong', action: 'show_logs' },
              ],
            };
            break;

          case 'rage_clicks':
            // Help offer, NOT survey
            action = {
              type: 'help_offer',
              title: 'Need help with something?',
              actions: [
                { label: 'Report issue', action: 'report_issue' },
                { label: 'Dismiss', action: 'dismiss' },
              ],
            };
            break;

          case 'nps_due':
            action = { type: 'nps' };
            break;
        }

        if (action) {
          setCurrentAction(action);
          setHasShownFeedbackThisSession(true);

          // Record that we showed a prompt (for eligibility tracking)
          // Use same stable cooldown key for consistency
          if (promptType) {
            const featureId = getStableCooldownKey(event.type);
            await feedback.recordPromptShown(promptType, featureId);
          }

          // If it's a frustration prompt, mark it
          if (event.type === 'build_failure' || event.type === 'rage_clicks') {
            feedback.markFrustrationPromptShown();
          }
        }
      } finally {
        isProcessingRef.current = false;
      }
    },
    [disabled, feedback, hasShownFeedbackThisSession, getEventKey]
  );

  return {
    emitEvent,
    currentAction,
    dismissAction,
    hasSeenEvent,
    hasShownFeedbackThisSession,
  };
}

export default useFeedbackOrchestrator;
