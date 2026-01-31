'use client';

/**
 * Frustration Detection Hook
 *
 * Detects user frustration signals without storing PII:
 *   - Rage clicks: 3+ clicks in 2 seconds on same area
 *   - Dead clicks: clicks on non-interactive elements with data-track
 *
 * Best Practices Applied:
 *   - ONE event per incident (not per click)
 *   - Uses data-track attributes only (no CSS selectors)
 *   - Stores only element IDs, not DOM content
 *   - Debounces to prevent event flooding
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Strategy 6 & Hard Requirements
 */

import { useEffect, useRef, useCallback } from 'react';
import { useFeedbackSafe } from '@/components/feedback/FeedbackProvider';

// ============================================================================
// Types
// ============================================================================

interface ClickRecord {
  timestamp: number;
  elementId: string | null; // data-track attribute value
  x: number;
  y: number;
}

interface FrustrationDetectionOptions {
  /**
   * Enable rage click detection
   * @default true
   */
  detectRageClicks?: boolean;
  /**
   * Enable dead click detection
   * @default true
   */
  detectDeadClicks?: boolean;
  /**
   * Number of clicks to consider a rage click
   * @default 3
   */
  rageClickThreshold?: number;
  /**
   * Time window for rage click detection (ms)
   * @default 2000
   */
  rageClickWindow?: number;
  /**
   * Minimum distance (px) between clicks to be considered same area
   * @default 50
   */
  proximityThreshold?: number;
  /**
   * Cooldown between reporting rage clicks (ms) to prevent flooding
   * @default 5000
   */
  reportCooldown?: number;
  /**
   * Callback when frustration is detected (for triggering help prompts)
   */
  onFrustrationDetected?: (type: 'rage_click' | 'dead_click', elementId: string | null) => void;
}

// ============================================================================
// Constants
// ============================================================================

// Elements that are naturally clickable
const INTERACTIVE_ELEMENTS = new Set([
  'A',
  'BUTTON',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'LABEL',
  'SUMMARY',
]);

// Roles that indicate interactivity
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'menuitem',
  'tab',
  'switch',
  'option',
  'combobox',
  'listbox',
  'textbox',
  'slider',
  'spinbutton',
]);

// ============================================================================
// Hook
// ============================================================================

export function useFrustrationDetection(options: FrustrationDetectionOptions = {}) {
  const {
    detectRageClicks = true,
    detectDeadClicks = true,
    rageClickThreshold = 3,
    rageClickWindow = 2000,
    proximityThreshold = 50,
    reportCooldown = 5000,
    onFrustrationDetected,
  } = options;

  const feedback = useFeedbackSafe();

  // Click history for rage click detection
  const clickHistoryRef = useRef<ClickRecord[]>([]);
  const lastRageClickReportRef = useRef<number>(0);
  const lastDeadClickReportRef = useRef<number>(0);

  // Get data-track attribute from element or ancestors
  const getTrackId = useCallback((element: Element | null): string | null => {
    let current = element;
    while (current && current !== document.body) {
      const trackId = current.getAttribute('data-track');
      if (trackId) return trackId;
      current = current.parentElement;
    }
    return null;
  }, []);

  // Check if element is interactive
  const isInteractiveElement = useCallback((element: Element): boolean => {
    // Check tag name
    if (INTERACTIVE_ELEMENTS.has(element.tagName)) return true;

    // Check role attribute
    const role = element.getAttribute('role');
    if (role && INTERACTIVE_ROLES.has(role)) return true;

    // Check for click handlers (indicated by cursor style or tabindex)
    const style = window.getComputedStyle(element);
    if (style.cursor === 'pointer') return true;

    // Check tabindex (interactive elements often have tabindex)
    if (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') {
      return true;
    }

    // Check for contenteditable
    if (element.getAttribute('contenteditable') === 'true') return true;

    return false;
  }, []);

  // Check if clicks are in same area
  const areClicksInSameArea = useCallback(
    (clicks: ClickRecord[]): boolean => {
      if (clicks.length < 2) return true;

      const first = clicks[0];
      return clicks.every((click) => {
        const dx = Math.abs(click.x - first.x);
        const dy = Math.abs(click.y - first.y);
        return dx <= proximityThreshold && dy <= proximityThreshold;
      });
    },
    [proximityThreshold]
  );

  // Report signal to feedback system
  const reportSignal = useCallback(
    (type: 'rage_click' | 'dead_click', elementId: string | null, clickCount?: number) => {
      if (!feedback) return;

      const now = Date.now();
      const lastReport = type === 'rage_click' ? lastRageClickReportRef : lastDeadClickReportRef;

      // Check cooldown
      if (now - lastReport.current < reportCooldown) return;
      lastReport.current = now;

      // Record the signal
      feedback.recordImplicitSignal({
        type,
        value: type === 'rage_click' ? { clickCount: clickCount || 0 } : {},
        pageUrl: typeof window !== 'undefined' ? window.location.pathname : '',
        elementId: elementId || undefined,
      });

      // Trigger callback
      onFrustrationDetected?.(type, elementId);

      // Mark frustration for queue priority
      if (type === 'rage_click') {
        feedback.markFrustrationPromptShown();
      }
    },
    [feedback, reportCooldown, onFrustrationDetected]
  );

  // Handle click events
  const handleClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target as Element;
      const now = Date.now();
      const elementId = getTrackId(target);

      // Dead click detection
      if (detectDeadClicks && elementId?.startsWith('dead-click-')) {
        // Element marked as should-be-interactive but isn't
        if (!isInteractiveElement(target)) {
          reportSignal('dead_click', elementId);
        }
      }

      // Rage click detection
      if (detectRageClicks) {
        const clickRecord: ClickRecord = {
          timestamp: now,
          elementId,
          x: event.clientX,
          y: event.clientY,
        };

        // Add to history
        clickHistoryRef.current.push(clickRecord);

        // Remove old clicks outside the window
        clickHistoryRef.current = clickHistoryRef.current.filter(
          (click) => now - click.timestamp <= rageClickWindow
        );

        // Check for rage click
        const recentClicks = clickHistoryRef.current;
        if (recentClicks.length >= rageClickThreshold && areClicksInSameArea(recentClicks)) {
          // Get the most common elementId from recent clicks
          const commonElementId =
            recentClicks.find((c) => c.elementId)?.elementId || null;
          reportSignal('rage_click', commonElementId, recentClicks.length);

          // Clear history to prevent multiple reports for same incident
          clickHistoryRef.current = [];
        }
      }
    },
    [
      detectRageClicks,
      detectDeadClicks,
      rageClickThreshold,
      rageClickWindow,
      getTrackId,
      isInteractiveElement,
      areClicksInSameArea,
      reportSignal,
    ]
  );

  // Set up event listener
  useEffect(() => {
    if (!detectRageClicks && !detectDeadClicks) return;

    document.addEventListener('click', handleClick, { passive: true, capture: true });

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
    };
  }, [handleClick, detectRageClicks, detectDeadClicks]);

  // Return nothing - this hook is fire-and-forget
  return null;
}
