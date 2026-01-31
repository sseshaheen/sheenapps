/**
 * Vertical Packs Configuration
 *
 * Phase 3 Implementation: Industry-specific dashboards
 *
 * Each vertical pack defines:
 * - KPI cards to display (and which data field to use)
 * - Suggested actions for the industry
 * - Alert types relevant to the industry
 * - Display configuration (icons, labels)
 *
 * Principle: Industry = configuration, not schema.
 * Packs extend the core without forking the data model.
 */

import type { IconName } from '@/components/ui/icon'
import type { ActionId } from '@/lib/run/action-handlers'

// ============================================================================
// Types
// ============================================================================

export type IndustryTag =
  | 'generic'
  | 'ecommerce'
  | 'saas'
  | 'restaurant'
  | 'services'
  | 'fitness'
  | 'realestate'   // P2.2: Arabic market addition
  | 'healthcare'   // P2.2: Arabic market addition
  | 'retail'       // P2.2: Arabic market addition

export type KpiField =
  | 'revenueCents'
  | 'payments'
  | 'signups'
  | 'leads'
  | 'sessions'
  | 'refunds'

export type AlertType =
  | 'payment_failed'
  | 'build_failed'
  | 'abandoned_checkout'
  | 'low_bookings'      // New: For service industries
  | 'refund_spike'      // New: For e-commerce
  | 'churn_risk'        // New: For SaaS

export interface KpiCardConfig {
  id: string
  icon: IconName
  titleKey: string  // Translation key under 'kpis.*'
  field: KpiField
  formatAs: 'currency' | 'number' | 'percentage'
  /** If true, show "—" when value is 0 instead of 0 */
  hideWhenZero?: boolean
}

export interface ActionConfig {
  id: ActionId           // Must be a valid action from ACTION_HANDLERS
  icon: IconName
  labelKey: string       // Translation key under 'actions.*'
  descriptionKey: string // Translation key under 'actions.*Desc'
  // Handler behavior is looked up from ACTION_HANDLERS (single source of truth)
}

export interface AlertTypeConfig {
  type: AlertType
  icon: IconName
  colorClass: string
  /** Whether this alert type applies to this industry */
  enabled: boolean
}

export interface VerticalPackConfig {
  id: IndustryTag
  icon: IconName
  /** Primary KPI - always shown first (usually revenue) */
  primaryKpi: KpiCardConfig
  /** Secondary KPIs - industry-specific cards */
  secondaryKpis: KpiCardConfig[]
  /** Whether to show conversion rate card */
  showConversion: boolean
  /** Conversion calculation: what to divide by sessions */
  conversionNumerator: 'leads' | 'signups' | 'payments'
  /** Suggested actions for this industry */
  actions: ActionConfig[]
  /** Alert types relevant to this industry */
  alerts: AlertTypeConfig[]
}

// ============================================================================
// Alert Configuration (shared across packs)
// ============================================================================

export const ALERT_ICONS: Record<AlertType, { icon: IconName; colorClass: string }> = {
  payment_failed: { icon: 'alert-triangle', colorClass: 'text-red-500' },
  build_failed: { icon: 'x-circle', colorClass: 'text-orange-500' },
  abandoned_checkout: { icon: 'credit-card', colorClass: 'text-yellow-500' },
  low_bookings: { icon: 'calendar-off', colorClass: 'text-yellow-500' },
  refund_spike: { icon: 'trending-down', colorClass: 'text-red-500' },
  churn_risk: { icon: 'user-x', colorClass: 'text-orange-500' },
}

// ============================================================================
// Vertical Pack Definitions
// ============================================================================

export const VERTICAL_PACKS: Record<IndustryTag, VerticalPackConfig> = {
  // ---------------------------------------------------------------------------
  // Generic (Default)
  // ---------------------------------------------------------------------------
  generic: {
    id: 'generic',
    icon: 'globe',
    primaryKpi: {
      id: 'revenue',
      icon: 'dollar-sign',
      titleKey: 'revenue',
      field: 'revenueCents',
      formatAs: 'currency',
    },
    secondaryKpis: [
      {
        id: 'leads',
        icon: 'users',
        titleKey: 'leads',
        field: 'leads',
        formatAs: 'number',
      },
    ],
    showConversion: true,
    conversionNumerator: 'leads',
    actions: [
      { id: 'send_promo', icon: 'send', labelKey: 'sendPromo', descriptionKey: 'sendPromoDesc' },
      { id: 'follow_up_leads', icon: 'users', labelKey: 'followUpLeads', descriptionKey: 'followUpLeadsDesc' },
      { id: 'post_update', icon: 'sparkles', labelKey: 'postUpdate', descriptionKey: 'postUpdateDesc' },
    ],
    alerts: [
      { type: 'payment_failed', ...ALERT_ICONS.payment_failed, enabled: true },
      { type: 'build_failed', ...ALERT_ICONS.build_failed, enabled: true },
      { type: 'abandoned_checkout', ...ALERT_ICONS.abandoned_checkout, enabled: true },
    ],
  },

  // ---------------------------------------------------------------------------
  // E-commerce
  // ---------------------------------------------------------------------------
  ecommerce: {
    id: 'ecommerce',
    icon: 'credit-card',
    primaryKpi: {
      id: 'revenue',
      icon: 'dollar-sign',
      titleKey: 'revenue',
      field: 'revenueCents',
      formatAs: 'currency',
    },
    secondaryKpis: [
      {
        id: 'orders',
        icon: 'credit-card',
        titleKey: 'orders',
        field: 'payments',
        formatAs: 'number',
      },
      {
        id: 'refunds',
        icon: 'rotate-ccw',
        titleKey: 'refunds',
        field: 'refunds',
        formatAs: 'number',
        hideWhenZero: true,
      },
    ],
    showConversion: true,
    conversionNumerator: 'payments',
    actions: [
      { id: 'send_promo', icon: 'send', labelKey: 'sendPromo', descriptionKey: 'sendPromoDesc' },
      { id: 'follow_up_orders', icon: 'credit-card', labelKey: 'followUpOrders', descriptionKey: 'followUpOrdersDesc' },
      { id: 'recover_abandoned', icon: 'mail', labelKey: 'recoverAbandoned', descriptionKey: 'recoverAbandonedDesc' },
      { id: 'post_update', icon: 'sparkles', labelKey: 'postUpdate', descriptionKey: 'postUpdateDesc' },
    ],
    alerts: [
      { type: 'payment_failed', ...ALERT_ICONS.payment_failed, enabled: true },
      { type: 'abandoned_checkout', ...ALERT_ICONS.abandoned_checkout, enabled: true },
      { type: 'refund_spike', ...ALERT_ICONS.refund_spike, enabled: true },
      { type: 'build_failed', ...ALERT_ICONS.build_failed, enabled: true },
    ],
  },

  // ---------------------------------------------------------------------------
  // SaaS
  // ---------------------------------------------------------------------------
  saas: {
    id: 'saas',
    icon: 'code',
    primaryKpi: {
      id: 'revenue',
      icon: 'dollar-sign',
      titleKey: 'revenue',
      field: 'revenueCents',
      formatAs: 'currency',
    },
    secondaryKpis: [
      {
        id: 'signups',
        icon: 'user-plus',
        titleKey: 'signups',
        field: 'signups',
        formatAs: 'number',
      },
      {
        id: 'leads',
        icon: 'users',
        titleKey: 'trials',
        field: 'leads',
        formatAs: 'number',
      },
    ],
    showConversion: true,
    conversionNumerator: 'signups',
    actions: [
      { id: 'send_promo', icon: 'mail', labelKey: 'reachOut', descriptionKey: 'reachOutDesc' },
      { id: 'follow_up_leads', icon: 'bar-chart', labelKey: 'reviewDropoffs', descriptionKey: 'reviewDropoffsDesc' },
      { id: 'onboard_users', icon: 'user-check', labelKey: 'onboardUsers', descriptionKey: 'onboardUsersDesc' },
      { id: 'ship_update', icon: 'rocket', labelKey: 'shipUpdate', descriptionKey: 'shipUpdateDesc' },
    ],
    alerts: [
      { type: 'payment_failed', ...ALERT_ICONS.payment_failed, enabled: true },
      { type: 'churn_risk', ...ALERT_ICONS.churn_risk, enabled: true },
      { type: 'build_failed', ...ALERT_ICONS.build_failed, enabled: true },
    ],
  },

  // ---------------------------------------------------------------------------
  // Restaurant
  // ---------------------------------------------------------------------------
  restaurant: {
    id: 'restaurant',
    icon: 'building',
    primaryKpi: {
      id: 'revenue',
      icon: 'dollar-sign',
      titleKey: 'revenue',
      field: 'revenueCents',
      formatAs: 'currency',
    },
    secondaryKpis: [
      {
        id: 'bookings',
        icon: 'calendar',
        titleKey: 'bookings',
        field: 'leads',
        formatAs: 'number',
      },
      {
        id: 'orders',
        icon: 'credit-card',
        titleKey: 'orders',
        field: 'payments',
        formatAs: 'number',
      },
    ],
    showConversion: true,
    conversionNumerator: 'leads',
    actions: [
      { id: 'confirm_bookings', icon: 'check-circle', labelKey: 'confirmBookings', descriptionKey: 'confirmBookingsDesc' },
      { id: 'follow_up_inquiries', icon: 'message-circle', labelKey: 'followUpInquiries', descriptionKey: 'followUpInquiriesDesc' },
      { id: 'post_update', icon: 'calendar', labelKey: 'fillSlots', descriptionKey: 'fillSlotsDesc' },
      { id: 'send_promo', icon: 'send', labelKey: 'sendPromo', descriptionKey: 'sendPromoDesc' },
    ],
    alerts: [
      { type: 'payment_failed', ...ALERT_ICONS.payment_failed, enabled: true },
      { type: 'low_bookings', ...ALERT_ICONS.low_bookings, enabled: true },
      { type: 'build_failed', ...ALERT_ICONS.build_failed, enabled: true },
    ],
  },

  // ---------------------------------------------------------------------------
  // Services (Salon, Consulting, etc.)
  // ---------------------------------------------------------------------------
  services: {
    id: 'services',
    icon: 'calendar',
    primaryKpi: {
      id: 'revenue',
      icon: 'dollar-sign',
      titleKey: 'revenue',
      field: 'revenueCents',
      formatAs: 'currency',
    },
    secondaryKpis: [
      {
        id: 'bookings',
        icon: 'calendar',
        titleKey: 'bookings',
        field: 'leads',
        formatAs: 'number',
      },
      {
        id: 'clients',
        icon: 'users',
        titleKey: 'newClients',
        field: 'signups',
        formatAs: 'number',
      },
    ],
    showConversion: true,
    conversionNumerator: 'leads',
    actions: [
      { id: 'confirm_bookings', icon: 'check-circle', labelKey: 'confirmBookings', descriptionKey: 'confirmBookingsDesc' },
      { id: 'follow_up_inquiries', icon: 'message-circle', labelKey: 'followUpInquiries', descriptionKey: 'followUpInquiriesDesc' },
      { id: 'post_update', icon: 'calendar', labelKey: 'fillSlots', descriptionKey: 'fillSlotsDesc' },
      { id: 'send_reminders', icon: 'bell', labelKey: 'sendReminders', descriptionKey: 'sendRemindersDesc' },
    ],
    alerts: [
      { type: 'payment_failed', ...ALERT_ICONS.payment_failed, enabled: true },
      { type: 'low_bookings', ...ALERT_ICONS.low_bookings, enabled: true },
      { type: 'abandoned_checkout', ...ALERT_ICONS.abandoned_checkout, enabled: true },
      { type: 'build_failed', ...ALERT_ICONS.build_failed, enabled: true },
    ],
  },

  // ---------------------------------------------------------------------------
  // Fitness (Gym, Personal Training, etc.)
  // ---------------------------------------------------------------------------
  fitness: {
    id: 'fitness',
    icon: 'heart',
    primaryKpi: {
      id: 'revenue',
      icon: 'dollar-sign',
      titleKey: 'revenue',
      field: 'revenueCents',
      formatAs: 'currency',
    },
    secondaryKpis: [
      {
        id: 'bookings',
        icon: 'calendar',
        titleKey: 'bookings',
        field: 'leads',
        formatAs: 'number',
      },
      {
        id: 'members',
        icon: 'users',
        titleKey: 'newMembers',
        field: 'signups',
        formatAs: 'number',
      },
    ],
    showConversion: true,
    conversionNumerator: 'signups',
    actions: [
      { id: 'confirm_bookings', icon: 'check-circle', labelKey: 'confirmBookings', descriptionKey: 'confirmBookingsDesc' },
      { id: 'post_update', icon: 'calendar', labelKey: 'fillSlots', descriptionKey: 'fillSlotsDesc' },
      { id: 'send_motivation', icon: 'zap', labelKey: 'sendMotivation', descriptionKey: 'sendMotivationDesc' },
      { id: 'send_promo', icon: 'send', labelKey: 'sendPromo', descriptionKey: 'sendPromoDesc' },
    ],
    alerts: [
      { type: 'payment_failed', ...ALERT_ICONS.payment_failed, enabled: true },
      { type: 'low_bookings', ...ALERT_ICONS.low_bookings, enabled: true },
      { type: 'churn_risk', ...ALERT_ICONS.churn_risk, enabled: true },
      { type: 'build_failed', ...ALERT_ICONS.build_failed, enabled: true },
    ],
  },

  // ---------------------------------------------------------------------------
  // Real Estate (P2.2: Arabic market addition)
  // ---------------------------------------------------------------------------
  realestate: {
    id: 'realestate',
    icon: 'map-pin',
    primaryKpi: {
      id: 'revenue',
      icon: 'dollar-sign',
      titleKey: 'revenue',
      field: 'revenueCents',
      formatAs: 'currency',
    },
    secondaryKpis: [
      {
        id: 'leads',
        icon: 'users',
        titleKey: 'leads',
        field: 'leads',
        formatAs: 'number',
      },
      {
        id: 'bookings',
        icon: 'calendar',
        titleKey: 'bookings',
        field: 'signups',
        formatAs: 'number',
      },
    ],
    showConversion: true,
    conversionNumerator: 'leads',
    actions: [
      { id: 'follow_up_leads', icon: 'users', labelKey: 'followUpLeads', descriptionKey: 'followUpLeadsDesc' },
      { id: 'follow_up_inquiries', icon: 'message-circle', labelKey: 'followUpInquiries', descriptionKey: 'followUpInquiriesDesc' },
      { id: 'post_update', icon: 'sparkles', labelKey: 'postUpdate', descriptionKey: 'postUpdateDesc' },
      { id: 'send_promo', icon: 'send', labelKey: 'sendPromo', descriptionKey: 'sendPromoDesc' },
    ],
    alerts: [
      { type: 'payment_failed', ...ALERT_ICONS.payment_failed, enabled: true },
      { type: 'build_failed', ...ALERT_ICONS.build_failed, enabled: true },
    ],
  },

  // ---------------------------------------------------------------------------
  // Healthcare / Clinics (P2.2: Arabic market addition)
  // ---------------------------------------------------------------------------
  healthcare: {
    id: 'healthcare',
    icon: 'activity',
    primaryKpi: {
      id: 'revenue',
      icon: 'dollar-sign',
      titleKey: 'revenue',
      field: 'revenueCents',
      formatAs: 'currency',
    },
    secondaryKpis: [
      {
        id: 'bookings',
        icon: 'calendar',
        titleKey: 'bookings',
        field: 'leads',
        formatAs: 'number',
      },
      {
        id: 'clients',
        icon: 'users',
        titleKey: 'newClients',
        field: 'signups',
        formatAs: 'number',
      },
    ],
    showConversion: true,
    conversionNumerator: 'leads',
    actions: [
      { id: 'confirm_bookings', icon: 'check-circle', labelKey: 'confirmBookings', descriptionKey: 'confirmBookingsDesc' },
      { id: 'send_reminders', icon: 'bell', labelKey: 'sendReminders', descriptionKey: 'sendRemindersDesc' },
      { id: 'follow_up_inquiries', icon: 'message-circle', labelKey: 'followUpInquiries', descriptionKey: 'followUpInquiriesDesc' },
      { id: 'post_update', icon: 'sparkles', labelKey: 'postUpdate', descriptionKey: 'postUpdateDesc' },
    ],
    alerts: [
      { type: 'payment_failed', ...ALERT_ICONS.payment_failed, enabled: true },
      { type: 'low_bookings', ...ALERT_ICONS.low_bookings, enabled: true },
      { type: 'build_failed', ...ALERT_ICONS.build_failed, enabled: true },
    ],
  },

  // ---------------------------------------------------------------------------
  // Retail (P2.2: Arabic market addition)
  // ---------------------------------------------------------------------------
  retail: {
    id: 'retail',
    icon: 'package',
    primaryKpi: {
      id: 'revenue',
      icon: 'dollar-sign',
      titleKey: 'revenue',
      field: 'revenueCents',
      formatAs: 'currency',
    },
    secondaryKpis: [
      {
        id: 'orders',
        icon: 'credit-card',
        titleKey: 'orders',
        field: 'payments',
        formatAs: 'number',
      },
      {
        id: 'leads',
        icon: 'users',
        titleKey: 'leads',
        field: 'leads',
        formatAs: 'number',
      },
    ],
    showConversion: true,
    conversionNumerator: 'payments',
    actions: [
      { id: 'send_promo', icon: 'send', labelKey: 'sendPromo', descriptionKey: 'sendPromoDesc' },
      { id: 'follow_up_leads', icon: 'users', labelKey: 'followUpLeads', descriptionKey: 'followUpLeadsDesc' },
      { id: 'recover_abandoned', icon: 'mail', labelKey: 'recoverAbandoned', descriptionKey: 'recoverAbandonedDesc' },
      { id: 'post_update', icon: 'sparkles', labelKey: 'postUpdate', descriptionKey: 'postUpdateDesc' },
    ],
    alerts: [
      { type: 'payment_failed', ...ALERT_ICONS.payment_failed, enabled: true },
      { type: 'abandoned_checkout', ...ALERT_ICONS.abandoned_checkout, enabled: true },
      { type: 'build_failed', ...ALERT_ICONS.build_failed, enabled: true },
    ],
  },
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the vertical pack config for an industry
 */
export function getVerticalPack(industryTag: string): VerticalPackConfig {
  return VERTICAL_PACKS[industryTag as IndustryTag] || VERTICAL_PACKS.generic
}

/**
 * Get all industry options for the selector
 */
export function getIndustryOptions(): { value: IndustryTag; icon: IconName }[] {
  return Object.values(VERTICAL_PACKS).map(pack => ({
    value: pack.id,
    icon: pack.icon,
  }))
}

/**
 * Get all KPI cards for a vertical (primary + secondary + conversion)
 */
export function getKpiCardsForVertical(pack: VerticalPackConfig): KpiCardConfig[] {
  const cards = [pack.primaryKpi, ...pack.secondaryKpis]

  if (pack.showConversion) {
    cards.push({
      id: 'conversion',
      icon: 'trending-up',
      titleKey: 'conversion',
      field: 'sessions', // Special handling in component
      formatAs: 'percentage',
    })
  }

  return cards
}
