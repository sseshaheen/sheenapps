'use client';

/**
 * NPS Trigger Hook
 *
 * Determines when to show the NPS survey based on:
 *   - User has been active for 30+ days
 *   - User recently completed a success event (build, milestone)
 *   - Server eligibility (90-day cooldown)
 *
 * Best Practices Applied:
 *   - Never shows too early (users need enough experience)
 *   - Triggers after success moments (positive context)
 *   - Respects server-side frequency caps
 *   - Stores first-seen date locally for day calculation
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Phase 4: Relationship Metrics
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useFeedbackSafe } from '@/components/feedback/FeedbackProvider';

// ============================================================================
// Types
// ============================================================================

interface NPSTriggerOptions {
  /**
   * Minimum days since first activity before showing NPS
   * @default 30
   */
  minDaysActive?: number;
  /**
   * Delay (ms) after success event before checking NPS eligibility
   * @default 2000
   */
  successEventDelay?: number;
  /**
   * Disable the trigger entirely
   * @default false
   */
  disabled?: boolean;
}

interface NPSTriggerResult {
  /**
   * Whether to show the NPS survey now
   */
  shouldShowNPS: boolean;
  /**
   * Call this when user completes a success event (build, milestone, etc.)
   * This primes the trigger to potentially show NPS
   */
  recordSuccessEvent: () => void;
  /**
   * Manually trigger NPS check (e.g., on login after 30 days)
   */
  checkNPSEligibility: () => Promise<void>;
  /**
   * Days since user's first activity
   */
  daysActive: number;
  /**
   * Whether user meets the minimum days requirement
   */
  meetsMinDays: boolean;
  /**
   * Dismiss the NPS trigger (user said no or completed survey)
   */
  dismiss: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'sheen_nps_first_seen';
const SESSION_DISMISSED_KEY = 'sheen_nps_dismissed';

// ============================================================================
// Hook
// ============================================================================

export function useNPSTrigger(options: NPSTriggerOptions = {}): NPSTriggerResult {
  const {
    minDaysActive = 30,
    successEventDelay = 2000,
    disabled = false,
  } = options;

  const feedback = useFeedbackSafe();

  const [shouldShowNPS, setShouldShowNPS] = useState(false);
  const [daysActive, setDaysActive] = useState(0);
  const [meetsMinDays, setMeetsMinDays] = useState(false);

  const isCheckingRef = useRef(false);
  const successEventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize first-seen date
  useEffect(() => {
    if (typeof window === 'undefined' || disabled) return;

    let firstSeen = localStorage.getItem(STORAGE_KEY);

    if (!firstSeen) {
      // First time user - record today
      firstSeen = new Date().toISOString();
      try {
        localStorage.setItem(STORAGE_KEY, firstSeen);
      } catch {
        // localStorage might be unavailable
      }
    }

    // Calculate days since first seen
    const firstSeenDate = new Date(firstSeen);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - firstSeenDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    setDaysActive(diffDays);
    setMeetsMinDays(diffDays >= minDaysActive);
  }, [disabled, minDaysActive]);

  // Check NPS eligibility
  const checkNPSEligibility = useCallback(async () => {
    if (disabled || !feedback || isCheckingRef.current) return;
    if (!meetsMinDays) return;

    // Check if dismissed this session
    if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_DISMISSED_KEY)) {
      return;
    }

    isCheckingRef.current = true;

    try {
      // Check queue priority (client-side)
      if (!feedback.canShowPrompt('nps')) {
        return;
      }

      // Check server eligibility (90-day cooldown)
      const result = await feedback.checkPromptEligibility('nps');
      if (result.eligible) {
        setShouldShowNPS(true);
      }
    } finally {
      isCheckingRef.current = false;
    }
  }, [disabled, feedback, meetsMinDays]);

  // Record success event - triggers NPS check after delay
  const recordSuccessEvent = useCallback(() => {
    if (disabled || !meetsMinDays) return;

    // Clear any existing timer
    if (successEventTimerRef.current) {
      clearTimeout(successEventTimerRef.current);
    }

    // Delay before checking NPS (let user enjoy the success moment)
    successEventTimerRef.current = setTimeout(() => {
      checkNPSEligibility();
    }, successEventDelay);
  }, [disabled, meetsMinDays, successEventDelay, checkNPSEligibility]);

  // Dismiss NPS for this session
  const dismiss = useCallback(() => {
    setShouldShowNPS(false);

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
      } catch {
        // sessionStorage might be unavailable
      }
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (successEventTimerRef.current) {
        clearTimeout(successEventTimerRef.current);
      }
    };
  }, []);

  return {
    shouldShowNPS,
    recordSuccessEvent,
    checkNPSEligibility,
    daysActive,
    meetsMinDays,
    dismiss,
  };
}

// ============================================================================
// Helper: NPS Trigger Provider for App-wide Use
// ============================================================================

/**
 * Convenience function to check NPS on page load for returning users
 * Call this in your main layout/dashboard after confirming user is logged in
 */
export function useNPSOnLogin(options: NPSTriggerOptions = {}) {
  const trigger = useNPSTrigger(options);

  // Check on mount (simulates "login" trigger)
  useEffect(() => {
    if (trigger.meetsMinDays) {
      trigger.checkNPSEligibility();
    }
  }, [trigger.meetsMinDays]); // eslint-disable-line react-hooks/exhaustive-deps

  return trigger;
}
