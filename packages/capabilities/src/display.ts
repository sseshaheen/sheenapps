/**
 * Display Utilities
 *
 * UI helpers for rendering entitlements.
 * These are DISPLAY utilities, not enforcement logic.
 */

import type { Entitlements, Feature, FeatureEntitlement } from './features.js';

/**
 * Usage threshold for showing upgrade prompts (80%).
 * When a feature's usage reaches this percentage, we suggest upgrading.
 */
export const UPGRADE_THRESHOLD = 0.8;

// =============================================================================
// Limit Formatting
// =============================================================================

/**
 * Format a limit value for display.
 *
 * @example
 * formatLimit(10)         // "10"
 * formatLimit('unlimited') // "∞"
 * formatLimit(undefined)  // "—"
 */
export function formatLimit(limit: number | 'unlimited' | undefined): string {
  if (limit === undefined) {
    return '—';
  }
  if (limit === 'unlimited') {
    return '∞';
  }
  return limit.toLocaleString();
}

/**
 * Format usage as "X / Y" or "X / ∞".
 *
 * @example
 * formatUsage(5, 10)           // "5 / 10"
 * formatUsage(5, 'unlimited')  // "5 / ∞"
 * formatUsage(5, undefined)    // "5"
 */
export function formatUsage(
  used: number | undefined,
  limit: number | 'unlimited' | undefined
): string {
  const usedStr = used?.toLocaleString() ?? '0';

  if (limit === undefined) {
    return usedStr;
  }

  return `${usedStr} / ${formatLimit(limit)}`;
}

// =============================================================================
// Usage Calculations
// =============================================================================

/**
 * Calculate usage percentage (0-100).
 * Returns 0 for unlimited features.
 *
 * @example
 * getUsagePercent({ enabled: true, limit: 10, used: 5 }) // 50
 * getUsagePercent({ enabled: true, limit: 'unlimited', used: 100 }) // 0
 */
export function getUsagePercent(entitlement: FeatureEntitlement): number {
  if (!entitlement.enabled) {
    return 0;
  }

  if (entitlement.limit === 'unlimited' || entitlement.limit === undefined) {
    return 0;
  }

  const used = entitlement.used ?? 0;
  return Math.min(100, Math.round((used / entitlement.limit) * 100));
}

/**
 * Get usage percentage for a specific feature from entitlements.
 */
export function getFeatureUsagePercent(
  entitlements: Entitlements,
  feature: Feature
): number {
  const ent = entitlements.features[feature];
  if (!ent) {
    return 0;
  }
  return getUsagePercent(ent);
}

// =============================================================================
// Upgrade Prompts
// =============================================================================

/**
 * Determine if an upgrade prompt should be shown for a feature.
 *
 * Shows upgrade when:
 * - Feature is not enabled
 * - Feature is at or near limit (>= UPGRADE_THRESHOLD)
 */
export function shouldShowUpgrade(
  entitlements: Entitlements,
  feature: Feature
): boolean {
  const ent = entitlements.features[feature];

  // Feature not available at all
  if (!ent || !ent.enabled) {
    return true;
  }

  // Feature has no limit
  if (ent.limit === 'unlimited' || ent.limit === undefined) {
    return false;
  }

  // Check if near or at limit
  const used = ent.used ?? 0;
  return used >= ent.limit * UPGRADE_THRESHOLD;
}

/**
 * Check if a feature is completely blocked (not just limited).
 */
export function isFeatureBlocked(
  entitlements: Entitlements,
  feature: Feature
): boolean {
  const ent = entitlements.features[feature];
  return !ent || !ent.enabled;
}

/**
 * Check if a feature is at its limit.
 * Returns false for blocked features - use isFeatureBlocked() for that.
 */
export function isAtLimit(
  entitlements: Entitlements,
  feature: Feature
): boolean {
  const ent = entitlements.features[feature];

  // Blocked features are not "at limit" - they're blocked
  if (!ent || !ent.enabled) {
    return false;
  }

  if (ent.limit === 'unlimited' || ent.limit === undefined) {
    return false;
  }

  const used = ent.used ?? 0;
  return used >= ent.limit;
}

// =============================================================================
// Status Helpers
// =============================================================================

/**
 * Get a simple status for a feature: 'available', 'limited', 'blocked'.
 */
export function getFeatureStatus(
  entitlements: Entitlements,
  feature: Feature
): 'available' | 'limited' | 'blocked' {
  const ent = entitlements.features[feature];

  if (!ent || !ent.enabled) {
    return 'blocked';
  }

  if (ent.limit !== 'unlimited' && ent.limit !== undefined) {
    const used = ent.used ?? 0;
    if (used >= ent.limit) {
      return 'blocked';
    }
    if (used >= ent.limit * UPGRADE_THRESHOLD) {
      return 'limited';
    }
  }

  return 'available';
}
