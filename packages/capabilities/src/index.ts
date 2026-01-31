/**
 * @sheenapps/capabilities
 *
 * Feature and plan vocabulary with UI display helpers.
 * Defines the shape of entitlements returned by the worker.
 *
 * IMPORTANT: This is vocabulary, not enforcement.
 * Worker is always authoritative for actual entitlements.
 */

// Feature and plan definitions
export {
  FEATURES,
  PLANS,
  PLAN_META,
  isFeature,
  isPlan,
  type Feature,
  type Plan,
  type PlanMeta,
  type FeatureEntitlement,
  type Entitlements,
} from './features.js';

// Display utilities
export {
  UPGRADE_THRESHOLD,
  formatLimit,
  formatUsage,
  getUsagePercent,
  getFeatureUsagePercent,
  shouldShowUpgrade,
  isFeatureBlocked,
  isAtLimit,
  getFeatureStatus,
} from './display.js';
