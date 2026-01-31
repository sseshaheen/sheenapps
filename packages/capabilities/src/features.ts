/**
 * Feature and Plan Definitions
 *
 * Typed vocabulary for platform features and subscription plans.
 * This is the single source of truth for feature keys and plan tiers.
 *
 * IMPORTANT: This package defines VOCABULARY, not enforcement.
 * The worker is always authoritative for actual entitlements.
 */

// =============================================================================
// Feature Keys
// =============================================================================

/**
 * All platform features that can be gated or limited.
 */
export const FEATURES = [
  // Core limits
  'projects',           // Number of projects
  'builds_per_month',   // Monthly build quota
  'ai_generations',     // AI generation credits

  // Storage
  'storage_gb',         // Storage in GB
  'file_uploads',       // File upload capability

  // Collaboration
  'collaborators',      // Team members per project
  'custom_domain',      // Custom domain support

  // Advanced features
  'analytics',          // Analytics dashboard
  'workflows',          // Workflow automation
  'api_access',         // API access
  'webhooks',           // Webhook integrations
  'priority_support',   // Priority support

  // Enterprise
  'sso',               // Single sign-on
  'audit_logs',        // Audit logging
  'custom_branding',   // White-label/branding
] as const;

export type Feature = (typeof FEATURES)[number];

// =============================================================================
// Plan Definitions
// =============================================================================

/**
 * Subscription plan tiers.
 */
export const PLANS = ['free', 'starter', 'pro', 'enterprise'] as const;

export type Plan = (typeof PLANS)[number];

/**
 * Plan display metadata.
 * Used for UI rendering, not enforcement.
 */
export interface PlanMeta {
  name: string;
  description: string;
  recommended?: boolean;
}

export const PLAN_META: Record<Plan, PlanMeta> = {
  free: {
    name: 'Free',
    description: 'For trying out the platform',
  },
  starter: {
    name: 'Starter',
    description: 'For individuals and small projects',
  },
  pro: {
    name: 'Pro',
    description: 'For growing teams',
    recommended: true,
  },
  enterprise: {
    name: 'Enterprise',
    description: 'For large organizations',
  },
} as const;

// =============================================================================
// Entitlements Shape
// =============================================================================

/**
 * Feature entitlement state.
 */
export interface FeatureEntitlement {
  /** Whether the feature is available on this plan */
  enabled: boolean;
  /** Usage limit (undefined = enabled but no numeric limit) */
  limit?: number | 'unlimited';
  /** Current usage (worker provides this) */
  used?: number;
}

/**
 * Complete entitlements object returned by worker.
 * This is what the worker computes and returns to clients.
 */
export interface Entitlements {
  /** Current subscription plan */
  plan: Plan;
  /** Per-feature entitlements */
  features: Partial<Record<Feature, FeatureEntitlement>>;
  /** When entitlements were computed */
  computedAt?: string;
  /** Subscription status */
  status?: 'active' | 'trialing' | 'past_due' | 'canceled';
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a string is a valid feature key.
 */
export function isFeature(key: string): key is Feature {
  return (FEATURES as readonly string[]).includes(key);
}

/**
 * Check if a string is a valid plan key.
 */
export function isPlan(key: string): key is Plan {
  return (PLANS as readonly string[]).includes(key);
}
