/**
 * Minimal PostHog setup for MVP preview tracking
 * Full implementation will follow the guide in docs/monitoring-setup/posthog-setup.md
 */

interface PostHogLike {
  capture: (event: string, properties?: Record<string, any>) => void;
}

// Minimal mock for development/MVP
class MockPostHog implements PostHogLike {
  capture(event: string, properties?: Record<string, any>) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PostHog Mock]', event, properties);
    }
  }
}

// Export a minimal interface that can be replaced with real PostHog later
export const posthog: PostHogLike = new MockPostHog();

// For now, we'll track preview metrics locally
export function trackPreviewMetric(
  stage: string,
  duration: number,
  metadata?: Record<string, any>
) {
  posthog.capture('preview_metrics', {
    stage,
    duration_ms: duration,
    timestamp: new Date().toISOString(),
    ...metadata
  });
}