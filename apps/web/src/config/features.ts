/**
 * Feature Flags Configuration
 *
 * Centralized feature flag definitions for runtime toggles.
 * P1 FIX: Moved from inline checks to central config for maintainability.
 *
 * Usage:
 * ```typescript
 * import { FEATURES } from '@/config/features'
 * if (FEATURES.VOICE_INPUT) { ... }
 * ```
 */

/**
 * Feature flags object
 * All flags default to false for safety
 */
export const FEATURES = {
  /**
   * Voice Input (Jan 2026)
   * Enables microphone recording + transcription in chat input
   * Requires: Worker service /v1/transcribe endpoint
   * Default: true (enabled by default, set to 'false' to disable)
   */
  VOICE_INPUT: process.env.NEXT_PUBLIC_ENABLE_VOICE_INPUT !== 'false',

  /**
   * Voice Input Level Meter (Jan 2026)
   * Shows audio level bars during recording to indicate mic is working
   * Uses Web Audio API AnalyserNode - lightweight, ~15fps
   * Default: true (enabled by default, set to 'false' to disable)
   */
  VOICE_LEVEL_METER: process.env.NEXT_PUBLIC_ENABLE_VOICE_LEVEL_METER !== 'false',
} as const;

/**
 * Type-safe feature flag keys
 */
export type FeatureFlag = keyof typeof FEATURES;
