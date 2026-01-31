/**
 * Business Event Types Registry
 *
 * Single source of truth for event type naming conventions.
 * Used for:
 * - SDK documentation
 * - Type safety in application code
 * - Reference for SQL query aliases (see EventTypeAliases)
 *
 * NOTE: The actual aliasing happens in SQL queries (IN clauses) for simplicity.
 * This file documents the canonical types and their aliases for reference.
 */

// =============================================================================
// Canonical Event Types
// =============================================================================

/**
 * Canonical business event types used in KPI rollups and workflows.
 * These are the "official" names that appear in dashboards and analytics.
 */
export const CanonicalBusinessEventTypes = [
  // Session & Engagement
  'session_started',

  // Funnel Events
  'checkout_started',
  'lead_created',
  'signup',

  // Payment Events
  'payment_succeeded',
  'payment_failed',
  'refund_issued',

  // Form Events
  'form_submitted',
] as const

export type CanonicalBusinessEventType = (typeof CanonicalBusinessEventTypes)[number]

// =============================================================================
// Event Type Aliases
// =============================================================================

/**
 * Maps canonical event types to their accepted aliases.
 * SQL queries use IN clauses with these aliases for backward compatibility.
 *
 * Example SQL usage:
 *   WHERE event_type IN ('signup', 'user_signed_up', 'account_created')
 *
 * This allows different emitters to use different names while
 * producing consistent KPI rollups.
 */
export const EventTypeAliases: Record<CanonicalBusinessEventType, readonly string[]> = {
  // Session: Only true session starts count as sessions (not pageviews)
  session_started: ['session_started'],

  // Checkout: Stripe/payment integrations emit this
  checkout_started: ['checkout_started'],

  // Lead: Forms or explicit lead capture
  lead_created: ['lead_created'],

  // Signup: Various naming conventions from different integrations
  signup: ['signup', 'user_signed_up', 'account_created'],

  // Payment events: Typically from Stripe webhooks
  payment_succeeded: ['payment_succeeded'],
  payment_failed: ['payment_failed'],
  refund_issued: ['refund_issued'],

  // Form events: From @sheenapps/forms SDK
  form_submitted: ['form_submitted'],
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the canonical event type for a raw event type string.
 * Returns the raw type if no mapping exists.
 *
 * NOTE: This performs a linear scan over aliases. For high-volume ingestion
 * paths, consider building a precomputed reverse lookup map instead.
 */
export function getCanonicalEventType(rawType: string): CanonicalBusinessEventType | string {
  for (const [canonical, aliases] of Object.entries(EventTypeAliases)) {
    if (aliases.includes(rawType)) {
      return canonical as CanonicalBusinessEventType
    }
  }
  return rawType
}

/**
 * Get all aliases for a canonical event type.
 * Useful for building SQL IN clauses.
 */
export function getEventTypeAliases(canonical: CanonicalBusinessEventType): readonly string[] {
  return EventTypeAliases[canonical] || [canonical]
}

/**
 * Check if a raw event type is a known canonical or alias.
 */
export function isKnownEventType(rawType: string): boolean {
  return Object.values(EventTypeAliases).some((aliases) => aliases.includes(rawType))
}

// =============================================================================
// KPI Mapping Reference
// =============================================================================

/**
 * Documents which event types feed into which KPIs.
 * This is for reference - the actual aggregation happens in businessKpiRollupJob.ts
 */
export const KpiEventMapping = {
  sessions: ['session_started'], // Only true sessions, not pageviews
  leads: ['lead_created'],
  signups: ['signup', 'user_signed_up', 'account_created'],
  payments: ['payment_succeeded'],
  refunds: ['refund_issued'],
  revenue_cents: ['payment_succeeded'], // Uses payload.amount_cents
  refunds_cents: ['refund_issued'], // Uses payload.amount_cents
} as const
