/**
 * Feedback Client Library
 *
 * Client-side API for the feedback collection system.
 * All calls go through Next.js API routes which proxy to the worker.
 *
 * See FEEDBACK-COLLECTION-PLAN.md
 */

import type {
  FeedbackSubmission,
  EligibilityCheckResponse,
  PromptType,
  EligibilityAction,
  ImplicitSignal,
} from './types';

// ============================================================================
// Feedback Submission
// ============================================================================

export interface SubmitFeedbackResult {
  success: boolean;
  id?: string;
  error?: string;
  duplicate?: boolean;
}

/**
 * Submit explicit feedback
 * Uses idempotency - safe to retry on network errors
 */
export async function submitFeedback(
  submission: Omit<FeedbackSubmission, 'userId'>
): Promise<SubmitFeedbackResult> {
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to submit feedback',
      };
    }

    return {
      success: true,
      id: data.id,
      duplicate: response.status === 200, // 200 = duplicate, 201 = new
    };
  } catch (error) {
    console.error('[Feedback Client] Submit error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// ============================================================================
// Eligibility Check
// ============================================================================

/**
 * Check if user is eligible to see a prompt
 * Server is source of truth for cross-device enforcement
 */
export async function checkEligibility(params: {
  promptType: PromptType;
  anonymousId: string;
  featureId?: string;
}): Promise<EligibilityCheckResponse> {
  try {
    const queryParams = new URLSearchParams({
      promptType: params.promptType,
      anonymousId: params.anonymousId,
    });
    if (params.featureId) {
      queryParams.set('featureId', params.featureId);
    }

    const response = await fetch(`/api/feedback/eligibility?${queryParams.toString()}`);
    const data = await response.json();

    return data;
  } catch (error) {
    console.error('[Feedback Client] Eligibility check error:', error);
    // Fail closed - don't show prompt if we can't check
    return { eligible: false, reason: 'check_failed' };
  }
}

// ============================================================================
// Eligibility Recording
// ============================================================================

/**
 * Record that a prompt was shown/dismissed/responded
 * - 'shown' starts the cooldown (prevents re-prompting)
 * - 'responded' tracks for metrics only
 */
export async function recordEligibility(params: {
  promptType: PromptType;
  anonymousId: string;
  action: EligibilityAction;
  featureId?: string;
}): Promise<boolean> {
  try {
    const response = await fetch('/api/feedback/eligibility/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json();
    return data.recorded ?? false;
  } catch (error) {
    console.error('[Feedback Client] Record eligibility error:', error);
    // Non-critical - don't block UX
    return false;
  }
}

// ============================================================================
// Implicit Signals (Batch)
// ============================================================================

/**
 * Submit batch of implicit signals
 * Non-blocking - failures are logged but don't affect UX
 *
 * Uses sendBeacon for reliability on page unload, with fetch+keepalive as fallback.
 * Modern browsers often kill async requests during beforeunload, so sendBeacon
 * is the only reliable way to deliver telemetry on page close.
 */
export async function submitImplicitSignals(
  signals: ImplicitSignal[],
  options: { useBeacon?: boolean } = {}
): Promise<{ received: number; errors: number }> {
  if (signals.length === 0) {
    return { received: 0, errors: 0 };
  }

  const payload = JSON.stringify({ events: signals });
  const endpoint = '/api/feedback/analytics/batch';

  // Use sendBeacon for page unload scenarios (best effort, fire-and-forget)
  if (options.useBeacon && typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([payload], { type: 'application/json' });
    const ok = navigator.sendBeacon(endpoint, blob);
    // sendBeacon returns true if queued, but we can't know if it succeeded
    return ok
      ? { received: signals.length, errors: 0 }
      : { received: 0, errors: signals.length };
  }

  // Standard fetch with keepalive for better reliability
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true, // Allows request to outlive the page
    });

    const data = await response.json();
    return { received: data.received ?? 0, errors: data.errors ?? 0 };
  } catch (error) {
    console.error('[Feedback Client] Submit signals error:', error);
    return { received: 0, errors: signals.length };
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a UUID for feedback submission idempotency
 */
export function generateFeedbackId(): string {
  return crypto.randomUUID();
}

/**
 * Get or create anonymous ID (stored in localStorage)
 */
export function getAnonymousId(): string {
  if (typeof window === 'undefined') {
    return ''; // SSR - will be set on client
  }

  const STORAGE_KEY = 'sheen_anon_id';

  // Try localStorage first
  let id = localStorage.getItem(STORAGE_KEY);

  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage might be unavailable
    }
  }

  return id;
}

/**
 * Get session ID (stored in sessionStorage)
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') {
    return ''; // SSR - will be set on client
  }

  const STORAGE_KEY = 'sheen_session_id';

  // Try sessionStorage first
  let id = sessionStorage.getItem(STORAGE_KEY);

  if (!id) {
    id = crypto.randomUUID();
    try {
      sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      // sessionStorage might be unavailable
    }
  }

  return id;
}

/**
 * Detect device type from viewport
 */
export function getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  if (typeof window === 'undefined') {
    return 'desktop';
  }

  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Get current viewport dimensions
 */
export function getViewport(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}
