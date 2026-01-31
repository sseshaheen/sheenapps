/**
 * Feedback Service
 *
 * Core business logic for feedback collection system.
 * See FEEDBACK-COLLECTION-PLAN.md
 */

import { SupabaseClient } from '@supabase/supabase-js';
// PII scrubber available but disabled for now
// import { scrubPII, getPIISummary } from './piiScrubber';
import {
  FeedbackSubmission,
  FeedbackType,
  FeedbackPlacement,
  FeedbackGoal,
  EligibilityCheckRequest,
  EligibilityCheckResponse,
  EligibilityRecordRequest,
  ImplicitSignal,
  PromptType,
  COOLDOWN_DAYS,
  buildIdentifier,
} from './types';

export class FeedbackService {
  constructor(private supabase: SupabaseClient) {}

  // ==========================================================================
  // Feedback Submission
  // ==========================================================================

  /**
   * Submit explicit feedback
   * - Enforces idempotency via client-generated UUID
   * - Returns 409 on duplicate
   * - PII scrubbing available but disabled for now (see piiScrubber.ts)
   */
  async submitFeedback(
    submission: FeedbackSubmission
  ): Promise<{ success: boolean; id: string; error?: string; duplicate?: boolean }> {
    // PII scrubbing disabled for now - can be enabled later if needed
    // const scrubbedComment = scrubPII(submission.textComment);
    const textComment = submission.textComment || null;

    // Prepare row for insert
    const row = {
      id: submission.id,
      type: submission.type,
      value: submission.value,
      text_comment: textComment,
      user_id: submission.userId || null,
      anonymous_id: submission.anonymousId,
      session_id: submission.sessionId,
      page_url: submission.pageUrl, // Keep full URL for debugging context (can enable sanitization later)
      feature_id: submission.featureId || null,
      trigger_point: submission.triggerPoint,
      prompt_id: submission.promptId,
      placement: submission.placement,
      goal: submission.goal,
      user_agent: submission.userAgent || null,
      viewport_width: submission.viewport?.width || null,
      viewport_height: submission.viewport?.height || null,
      locale: submission.locale || null,
      device_type: submission.deviceType || null,
      build_version: submission.buildVersion || null,
    };

    // Attempt insert (unique index enforces idempotency)
    const { error } = await this.supabase.from('feedback_submissions').insert(row);

    if (error) {
      // Check for duplicate (unique constraint violation)
      if (error.code === '23505' || error.message?.includes('duplicate')) {
        return { success: true, id: submission.id, duplicate: true };
      }

      console.error('[FeedbackService] Failed to submit feedback', {
        submissionId: submission.id,
        error: error.message,
      });

      return { success: false, id: submission.id, error: error.message };
    }

    return { success: true, id: submission.id };
  }

  // ==========================================================================
  // Eligibility (Server-Side Caps)
  // ==========================================================================

  /**
   * Check if user is eligible to see a prompt
   * Server is source of truth for cross-device enforcement
   */
  async checkEligibility(req: EligibilityCheckRequest): Promise<EligibilityCheckResponse> {
    const identifier = buildIdentifier(req.userId, req.anonymousId);
    const cooldownDays = COOLDOWN_DAYS[req.promptType] || 90;

    // Call database function
    const { data, error } = await this.supabase.rpc('check_feedback_eligibility', {
      p_identifier: identifier,
      p_prompt_type: req.promptType,
      p_feature_id: req.featureId || null,
      p_cooldown_days: cooldownDays,
    });

    if (error) {
      console.error('[FeedbackService] Eligibility check failed', {
        identifier,
        promptType: req.promptType,
        error: error.message,
      });

      // Fail closed: if we can't check, don't show prompt
      return { eligible: false, reason: 'check_failed' };
    }

    // Function returns table with single row
    const result = data?.[0];
    if (!result) {
      return { eligible: false, reason: 'no_result' };
    }

    return {
      eligible: result.eligible,
      reason: result.reason || undefined,
      cooldownEnds: result.cooldown_ends || undefined,
    };
  }

  /**
   * Record that a prompt was shown/dismissed/responded
   * - 'shown' starts the cooldown
   * - 'responded' updates response tracking for metrics
   */
  async recordEligibility(req: EligibilityRecordRequest): Promise<{ success: boolean }> {
    const identifier = buildIdentifier(req.userId, req.anonymousId);

    // Note: Supabase RPC doesn't throw on failure - it returns { error }
    // Must explicitly check the error field

    if (req.action === 'shown' || req.action === 'dismissed') {
      // Record shown (starts cooldown)
      const { error } = await this.supabase.rpc('record_feedback_shown', {
        p_identifier: identifier,
        p_prompt_type: req.promptType,
        p_feature_id: req.featureId || null,
      });

      if (error) {
        console.error('[FeedbackService] record_feedback_shown failed', {
          identifier,
          promptType: req.promptType,
          action: req.action,
          error: error.message,
        });
        return { success: false };
      }

      return { success: true };
    }

    if (req.action === 'responded') {
      // Record responded (for metrics)
      const { error } = await this.supabase.rpc('record_feedback_responded', {
        p_identifier: identifier,
        p_prompt_type: req.promptType,
        p_feature_id: req.featureId || null,
      });

      if (error) {
        console.error('[FeedbackService] record_feedback_responded failed', {
          identifier,
          promptType: req.promptType,
          action: req.action,
          error: error.message,
        });
        return { success: false };
      }

      return { success: true };
    }

    return { success: true };
  }

  // ==========================================================================
  // Implicit Signals (Batch)
  // ==========================================================================

  /**
   * Record batch of implicit signals
   * - Validates derived values only (no raw coordinates)
   * - Rate limited at API layer
   */
  async recordImplicitSignals(
    signals: ImplicitSignal[]
  ): Promise<{ received: number; errors: number }> {
    let received = 0;
    let errors = 0;

    // Validate and insert each signal
    const rows = signals.map((signal) => ({
      type: signal.type,
      value: signal.value,
      page_url: this.sanitizePageUrl(signal.pageUrl),
      element_id: signal.elementId || null,
      session_id: signal.sessionId,
      build_version: signal.buildVersion || null,
    }));

    const { error } = await this.supabase.from('feedback_implicit_signals').insert(rows);

    if (error) {
      console.error('[FeedbackService] Failed to record implicit signals', {
        count: signals.length,
        error: error.message,
      });
      errors = signals.length;
    } else {
      received = signals.length;
    }

    return { received, errors };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Sanitize page URL to remove query params (may contain PII)
   * Keep only the pathname
   */
  private sanitizePageUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Keep only pathname, strip query params and hash
      return parsed.pathname;
    } catch {
      // If URL parsing fails, truncate and return
      return url.slice(0, 512);
    }
  }
}
