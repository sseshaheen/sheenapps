'use client';

/**
 * Scroll Depth Tracking Hook
 *
 * Tracks how far users scroll down a page using Intersection Observer.
 * Records percentage buckets (25%, 50%, 75%, 100%) - each fired only once per page.
 *
 * Best Practices Applied:
 *   - Uses Intersection Observer (not scroll events) for performance
 *   - Fires each threshold only once per page load
 *   - Stores percentage buckets, not raw scroll positions
 *   - Debounces rapid threshold crossings
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Passive/Implicit Feedback
 */

import { useEffect, useRef, useCallback } from 'react';
import { useFeedbackSafe } from '@/components/feedback/FeedbackProvider';

// ============================================================================
// Types
// ============================================================================

type ScrollDepthThreshold = 25 | 50 | 75 | 100;

interface ScrollDepthOptions {
  /**
   * Thresholds to track (percentages)
   * @default [25, 50, 75, 100]
   */
  thresholds?: ScrollDepthThreshold[];
  /**
   * Callback when a threshold is reached
   */
  onThresholdReached?: (threshold: ScrollDepthThreshold) => void;
  /**
   * Debounce delay before recording (ms)
   * Prevents recording if user immediately scrolls back up
   * @default 1000
   */
  debounceDelay?: number;
  /**
   * Disable tracking
   * @default false
   */
  disabled?: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useScrollDepth(options: ScrollDepthOptions = {}) {
  const {
    thresholds = [25, 50, 75, 100],
    onThresholdReached,
    debounceDelay = 1000,
    disabled = false,
  } = options;

  const feedback = useFeedbackSafe();

  // Track which thresholds have been recorded
  const recordedThresholdsRef = useRef<Set<ScrollDepthThreshold>>(new Set());
  const pendingThresholdRef = useRef<ScrollDepthThreshold | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sentinel elements for each threshold
  const sentinelsRef = useRef<Map<ScrollDepthThreshold, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Record a threshold
  const recordThreshold = useCallback(
    (threshold: ScrollDepthThreshold) => {
      if (recordedThresholdsRef.current.has(threshold)) return;

      recordedThresholdsRef.current.add(threshold);

      // Record to feedback system
      if (feedback) {
        feedback.recordImplicitSignal({
          type: 'scroll_depth',
          value: threshold,
          pageUrl: typeof window !== 'undefined' ? window.location.pathname : '',
        });
      }

      // Trigger callback
      onThresholdReached?.(threshold);
    },
    [feedback, onThresholdReached]
  );

  // Handle threshold intersection with debounce
  const handleThresholdReached = useCallback(
    (threshold: ScrollDepthThreshold) => {
      // Clear any pending timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // If this threshold is already recorded, skip
      if (recordedThresholdsRef.current.has(threshold)) return;

      // Set pending and start debounce timer
      pendingThresholdRef.current = threshold;
      debounceTimerRef.current = setTimeout(() => {
        if (pendingThresholdRef.current === threshold) {
          recordThreshold(threshold);
        }
        pendingThresholdRef.current = null;
      }, debounceDelay);
    },
    [debounceDelay, recordThreshold]
  );

  // Set up Intersection Observer
  useEffect(() => {
    if (disabled || typeof window === 'undefined') return;

    // Create sentinel elements at each threshold position
    const createSentinels = () => {
      const documentHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );

      thresholds.forEach((threshold) => {
        // Skip if already recorded
        if (recordedThresholdsRef.current.has(threshold)) return;

        // Create or reuse sentinel
        let sentinel = sentinelsRef.current.get(threshold);
        if (!sentinel) {
          sentinel = document.createElement('div');
          sentinel.setAttribute('data-scroll-depth', threshold.toString());
          sentinel.style.cssText = `
            position: absolute;
            left: 0;
            width: 1px;
            height: 1px;
            pointer-events: none;
            visibility: hidden;
          `;
          document.body.appendChild(sentinel);
          sentinelsRef.current.set(threshold, sentinel);
        }

        // Position at threshold percentage of document height
        const position = (threshold / 100) * documentHeight;
        sentinel.style.top = `${position}px`;
      });
    };

    // Create observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const threshold = parseInt(
              entry.target.getAttribute('data-scroll-depth') || '0',
              10
            ) as ScrollDepthThreshold;

            if (thresholds.includes(threshold)) {
              handleThresholdReached(threshold);
            }
          }
        });
      },
      {
        root: null, // viewport
        rootMargin: '0px',
        threshold: 0, // Trigger as soon as any part is visible
      }
    );

    // Initial setup
    createSentinels();

    // Observe all sentinels
    sentinelsRef.current.forEach((sentinel) => {
      observerRef.current?.observe(sentinel);
    });

    // Update sentinel positions on resize
    const handleResize = () => {
      createSentinels();
    };
    window.addEventListener('resize', handleResize, { passive: true });

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      observerRef.current?.disconnect();

      // Remove sentinels
      sentinelsRef.current.forEach((sentinel) => {
        sentinel.remove();
      });
      sentinelsRef.current.clear();

      // Clear timers
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [disabled, thresholds, handleThresholdReached]);

  // Reset tracking (useful for SPA route changes)
  const reset = useCallback(() => {
    recordedThresholdsRef.current.clear();
    pendingThresholdRef.current = null;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return {
    /** Manually reset tracking (e.g., on route change) */
    reset,
    /** Currently recorded thresholds */
    recordedThresholds: recordedThresholdsRef.current,
  };
}
