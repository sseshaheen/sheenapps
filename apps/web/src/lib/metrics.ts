/**
 * Build Metrics
 *
 * Encapsulated performance tracking for build sessions using the Performance API.
 * All marks are namespaced to avoid clearing marks from other libraries (e.g., Faro).
 *
 * Metric Definitions:
 * - TTFT (Time To First Token): Time from submit to first assistant_text chunk RECEIVED (network level)
 * - TTFI (Time To First Iteration): Time from submit to first assistant_text RENDERED in DOM (user-visible)
 * - tt_preview: Time from submit to preview URL populated
 * - tt_recs: Time from submit to first recommendation card rendered
 * - sse_connect: Time from SSE request to connection event received
 *
 * Source of Truth:
 * - Latency distributions (TTFT/TTFI/etc): Grafana via Faro
 * - Funnels and user behavior: PostHog
 */

'use client'

import { posthog } from '@/lib/posthog'
import { logger } from '@/utils/logger'

/**
 * Namespace prefix for all build metrics marks.
 * This prevents accidentally clearing marks from other libraries.
 */
const BS_NAMESPACE = 'bs:'

/**
 * Get the current locale for metric context.
 * Returns 'unknown' if not in browser or locale not available.
 */
function getCurrentLocale(): string {
  if (typeof window === 'undefined') return 'unknown'
  // Try to get locale from HTML lang attribute or navigator
  return document.documentElement.lang || navigator.language || 'unknown'
}

/**
 * BuildMetrics class for tracking performance metrics during build sessions.
 *
 * Usage:
 * ```typescript
 * // On build submit
 * buildMetrics.start(buildSessionId)
 *
 * // On first assistant_text chunk RECEIVED (network level)
 * buildMetrics.markFirstTokenReceived()
 *
 * // On first assistant_text RENDERED in DOM (user-visible)
 * buildMetrics.markFirstTokenRendered()
 *
 * // On preview URL ready
 * buildMetrics.markPreviewReady()
 *
 * // On recommendations visible
 * buildMetrics.markRecommendationsVisible()
 *
 * // On build complete
 * buildMetrics.reset()
 * ```
 */
class BuildMetrics {
  private buildSessionId: string | null = null
  private prefix: string = ''
  private hasMarkedTTFT: boolean = false
  private hasMarkedTTFI: boolean = false
  private hasMarkedSSE: boolean = false
  private hasMarkedPreview: boolean = false
  private hasMarkedRecs: boolean = false

  /**
   * Generate a namespaced mark name.
   */
  private mark(name: string): string {
    return `${this.prefix}${name}`
  }

  /**
   * Start tracking metrics for a new build session.
   * Clears any previous marks and sets the submit timestamp.
   *
   * @param buildSessionId - The build session ID to track
   */
  start(buildSessionId: string): void {
    // Clear any previous marks from our namespace
    this.clearOwnMarks()

    this.buildSessionId = buildSessionId
    this.prefix = `${BS_NAMESPACE}${buildSessionId}:`
    this.hasMarkedTTFT = false
    this.hasMarkedTTFI = false
    this.hasMarkedSSE = false
    this.hasMarkedPreview = false
    this.hasMarkedRecs = false

    // Mark the submit time
    performance.mark(this.mark('submit'))
    logger.debug('metrics', `Started tracking metrics for session: ${buildSessionId.slice(0, 20)}`)
  }

  /**
   * Mark when the first assistant_text chunk is RECEIVED from the network.
   * This is the Time To First Token (TTFT) metric.
   *
   * Call this in the SSE handler when the first assistant_text event arrives.
   */
  markFirstTokenReceived(): void {
    if (!this.buildSessionId || this.hasMarkedTTFT) return
    this.hasMarkedTTFT = true

    performance.mark(this.mark('ttft'))
    this.measureAndCapture('ttft', 'submit', 'ttft')
  }

  /**
   * Mark when the first assistant_text is RENDERED in the DOM.
   * This is the Time To First Iteration (TTFI) metric - what the user actually sees.
   *
   * Call this in a useEffect that detects when streaming content first appears.
   */
  markFirstTokenRendered(): void {
    if (!this.buildSessionId || this.hasMarkedTTFI) return
    this.hasMarkedTTFI = true

    performance.mark(this.mark('ttfi'))
    this.measureAndCapture('ttfi', 'submit', 'ttfi')
  }

  /**
   * Mark when the SSE connection is established.
   */
  markSSEConnected(): void {
    if (!this.buildSessionId || this.hasMarkedSSE) return
    this.hasMarkedSSE = true

    performance.mark(this.mark('sse'))
    this.measureAndCapture('sse_connect', 'submit', 'sse')
  }

  /**
   * Mark when the preview URL is ready.
   */
  markPreviewReady(): void {
    if (!this.buildSessionId || this.hasMarkedPreview) return
    this.hasMarkedPreview = true

    performance.mark(this.mark('preview'))
    this.measureAndCapture('tt_preview', 'submit', 'preview')
  }

  /**
   * Mark when recommendations become visible to the user.
   */
  markRecommendationsVisible(): void {
    if (!this.buildSessionId || this.hasMarkedRecs) return
    this.hasMarkedRecs = true

    performance.mark(this.mark('recs'))
    this.measureAndCapture('tt_recs', 'submit', 'recs')
  }

  /**
   * Measure between two marks and capture the metric.
   */
  private measureAndCapture(metricName: string, startMark: string, endMark: string): void {
    const startMarkName = this.mark(startMark)
    const endMarkName = this.mark(endMark)
    const measureName = this.mark(`${metricName}_measure`)

    try {
      performance.measure(measureName, startMarkName, endMarkName)
      const entries = performance.getEntriesByName(measureName, 'measure')
      const duration = entries[entries.length - 1]?.duration

      if (duration !== undefined) {
        this.captureMetric(metricName, Math.round(duration))
      }

      // Clean up the measure (not the marks - we may need them for other measurements)
      performance.clearMeasures(measureName)
    } catch (error) {
      // Start mark may not exist if start() wasn't called
      logger.warn('metrics', `Failed to measure ${metricName}: ${error}`)
    }
  }

  /**
   * Capture a metric to PostHog.
   */
  private captureMetric(metricName: string, durationMs: number): void {
    logger.info('metrics', `${metricName}: ${durationMs}ms`)

    posthog.capture('build_metric', {
      metric: metricName,
      duration_ms: durationMs,
      buildSessionId: this.buildSessionId,
      locale: getCurrentLocale(),
      p_timestamp: Date.now(), // For percentile bucketing
    })
  }

  /**
   * Clear all marks and measures in our namespace.
   * We clear the entire bs: namespace (not just current prefix) because:
   * 1. On first call, this.prefix may be empty
   * 2. We want to clean up any orphaned marks from crashed/abandoned builds
   */
  private clearOwnMarks(): void {
    // Clear marks with our namespace
    const allMarks = performance.getEntriesByType('mark')
    allMarks
      .filter(m => m.name.startsWith(BS_NAMESPACE))
      .forEach(m => performance.clearMarks(m.name))

    // Clear measures with our namespace
    const allMeasures = performance.getEntriesByType('measure')
    allMeasures
      .filter(m => m.name.startsWith(BS_NAMESPACE))
      .forEach(m => performance.clearMeasures(m.name))
  }

  /**
   * Reset the metrics tracker.
   * Call this when a build completes or fails.
   */
  reset(): void {
    this.clearOwnMarks()
    this.buildSessionId = null
    this.prefix = ''
    this.hasMarkedTTFT = false
    this.hasMarkedTTFI = false
    this.hasMarkedSSE = false
    this.hasMarkedPreview = false
    this.hasMarkedRecs = false
  }

  /**
   * Get the current build session ID being tracked.
   */
  getCurrentSessionId(): string | null {
    return this.buildSessionId
  }

  /**
   * Check if metrics tracking is active.
   */
  isActive(): boolean {
    return this.buildSessionId !== null
  }
}

/**
 * Singleton instance for global metrics tracking.
 * Use this instance throughout the app for consistent metric capture.
 */
export const buildMetrics = new BuildMetrics()

/**
 * Hook-friendly wrapper for using buildMetrics in React components.
 * Returns the singleton instance.
 */
export function useBuildMetrics(): BuildMetrics {
  return buildMetrics
}

// Expose for testing in non-production environments
if (typeof window !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.NEXT_PUBLIC_ENABLE_TEST_HOOKS === 'true')) {
  (window as unknown as { __BUILD_METRICS__: BuildMetrics }).__BUILD_METRICS__ = buildMetrics
}
