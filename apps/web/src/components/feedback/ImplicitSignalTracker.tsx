'use client';

/**
 * Implicit Signal Tracker Component
 *
 * Wrapper component that enables passive signal tracking for a section of the app.
 * Combines frustration detection and scroll depth tracking into one easy-to-use wrapper.
 *
 * Usage:
 *   <ImplicitSignalTracker>
 *     <YourPageContent />
 *   </ImplicitSignalTracker>
 *
 * For scroll depth tracking on specific content sections:
 *   <ImplicitSignalTracker trackScrollDepth>
 *     <LongArticle />
 *   </ImplicitSignalTracker>
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Phase 3: Passive Signals
 */

import React, { useEffect, useRef, ReactNode } from 'react';
import { useFeedbackSafe } from './FeedbackProvider';
import { useFrustrationDetection } from '@/hooks/useFrustrationDetection';
import { useScrollDepth } from '@/hooks/useScrollDepth';
import type { PromptPriority } from '@/lib/feedback';

// ============================================================================
// Types
// ============================================================================

interface ImplicitSignalTrackerProps {
  children: ReactNode;
  /**
   * Enable frustration detection (rage clicks, dead clicks)
   * @default true
   */
  trackFrustration?: boolean;
  /**
   * Enable scroll depth tracking
   * @default false (enable for long-form content)
   */
  trackScrollDepth?: boolean;
  /**
   * Callback when frustration is detected
   * Can be used to show help prompts
   */
  onFrustrationDetected?: (type: 'rage_click' | 'dead_click', elementId: string | null) => void;
  /**
   * Callback when scroll threshold is reached
   */
  onScrollThreshold?: (threshold: 25 | 50 | 75 | 100) => void;
  /**
   * Disable all tracking
   * @default false
   */
  disabled?: boolean;
  /**
   * Reset scroll depth tracking on route change
   * Pass the current pathname or route key
   */
  routeKey?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ImplicitSignalTracker({
  children,
  trackFrustration = true,
  trackScrollDepth = false,
  onFrustrationDetected,
  onScrollThreshold,
  disabled = false,
  routeKey,
}: ImplicitSignalTrackerProps) {
  const feedback = useFeedbackSafe();

  // Skip tracking if feedback system not available or disabled
  const shouldTrack = !disabled && !!feedback;

  // Frustration detection
  useFrustrationDetection({
    detectRageClicks: shouldTrack && trackFrustration,
    detectDeadClicks: shouldTrack && trackFrustration,
    onFrustrationDetected,
  });

  // Scroll depth tracking
  const { reset: resetScrollDepth } = useScrollDepth({
    disabled: !shouldTrack || !trackScrollDepth,
    onThresholdReached: onScrollThreshold,
  });

  // Reset scroll depth on route change
  const prevRouteKeyRef = useRef(routeKey);
  useEffect(() => {
    if (routeKey && routeKey !== prevRouteKeyRef.current) {
      prevRouteKeyRef.current = routeKey;
      resetScrollDepth();
    }
  }, [routeKey, resetScrollDepth]);

  // Just render children - hooks handle the tracking
  return <>{children}</>;
}

// ============================================================================
// Convenience Components
// ============================================================================

/**
 * Pre-configured tracker for article/documentation pages
 * Enables scroll depth tracking by default
 */
export function ArticleSignalTracker({
  children,
  onScrollThreshold,
  disabled = false,
  routeKey,
}: {
  children: ReactNode;
  onScrollThreshold?: (threshold: 25 | 50 | 75 | 100) => void;
  disabled?: boolean;
  routeKey?: string;
}) {
  return (
    <ImplicitSignalTracker
      trackFrustration={true}
      trackScrollDepth={true}
      onScrollThreshold={onScrollThreshold}
      disabled={disabled}
      routeKey={routeKey}
    >
      {children}
    </ImplicitSignalTracker>
  );
}

/**
 * Pre-configured tracker for interactive features (forms, builders)
 * Frustration detection only (scroll depth usually not relevant)
 */
export function FeatureSignalTracker({
  children,
  onFrustrationDetected,
  disabled = false,
}: {
  children: ReactNode;
  onFrustrationDetected?: (type: 'rage_click' | 'dead_click', elementId: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <ImplicitSignalTracker
      trackFrustration={true}
      trackScrollDepth={false}
      onFrustrationDetected={onFrustrationDetected}
      disabled={disabled}
    >
      {children}
    </ImplicitSignalTracker>
  );
}
