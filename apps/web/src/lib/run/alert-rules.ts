/**
 * Run Hub Alert Rules Engine - Rule-based anomaly detection
 *
 * Part of Run Hub Phase 2: Core Dashboard Value
 *
 * Not AI/ML forecasting - just practical rules that catch 80% of important anomalies.
 * Every alert should have a default action attached. Alerts without actions become noise.
 */

import type { IconName } from '@/components/ui/icon'

// KPI data shape from the API
export interface KpiData {
  sessions: number
  leads: number
  signups: number
  payments: number
  refunds: number
  revenueCents: number
  refundsCents: number
}

// Alert severity levels
export type AlertSeverity = 'high' | 'medium' | 'low'

// Alert result returned by rules
export interface AlertResult {
  type: string
  titleKey: string           // i18n key for title
  titleParams?: Record<string, unknown>
  severity: AlertSeverity
  icon: IconName
  colorClass: string
  action?: {
    actionId?: string        // Links to ACTION_HANDLERS
    labelKey: string         // i18n key for button
    navigateTo?: string      // Direct navigation if no action handler
  }
}

// Alert rule definition
export interface AlertRule {
  id: string
  severity: AlertSeverity
  check: (
    current: KpiData,
    previous: KpiData,
    context: AlertContext
  ) => AlertResult | null
}

// Context for checking alerts
export interface AlertContext {
  lastEventAt: string | null
  paymentFailedCount: number  // Count of payment_failed events in last 24h
  checkoutStartedCount: number
  paymentSucceededCount: number
}

/**
 * Alert rules registry
 *
 * Rules are checked in order - return first matching alert of each type.
 * Each rule returns null if condition not met.
 */
export const ALERT_RULES: AlertRule[] = [
  // Stale tracking - no events in >24h
  {
    id: 'stale_tracking',
    severity: 'high',
    check: (_, __, context) => {
      if (!context.lastEventAt) return null
      const hoursSince = (Date.now() - new Date(context.lastEventAt).getTime()) / (1000 * 60 * 60)
      if (hoursSince > 24) {
        return {
          type: 'stale_tracking',
          titleKey: 'alerts.staleTracking',
          titleParams: { hours: Math.round(hoursSince) },
          severity: 'high',
          icon: 'alert-triangle',
          colorClass: 'text-amber-500',
          action: {
            labelKey: 'alerts.actions.checkTracking',
            navigateTo: 'builder?focus=tracking',
          },
        }
      }
      return null
    },
  },

  // Lead drop >50% vs previous period
  {
    id: 'lead_drop',
    severity: 'high',
    check: (current, previous) => {
      if (!previous.leads || previous.leads < 5) return null // Need baseline
      const drop = ((previous.leads - current.leads) / previous.leads) * 100
      if (drop > 50) {
        return {
          type: 'lead_drop',
          titleKey: 'alerts.leadDrop',
          titleParams: { percent: Math.round(drop) },
          severity: 'high',
          icon: 'trending-down',
          colorClass: 'text-red-500',
          action: {
            actionId: 'send_promo',
            labelKey: 'alerts.actions.sendPromo',
          },
        }
      }
      return null
    },
  },

  // Revenue drop >40% vs previous period
  {
    id: 'revenue_drop',
    severity: 'high',
    check: (current, previous) => {
      if (!previous.revenueCents || previous.revenueCents < 1000) return null // Need $10+ baseline
      const drop = ((previous.revenueCents - current.revenueCents) / previous.revenueCents) * 100
      if (drop > 40) {
        return {
          type: 'revenue_drop',
          titleKey: 'alerts.revenueDrop',
          titleParams: { percent: Math.round(drop) },
          severity: 'high',
          icon: 'trending-down',
          colorClass: 'text-red-500',
          action: {
            actionId: 'follow_up_orders',
            labelKey: 'alerts.actions.reviewOrders',
          },
        }
      }
      return null
    },
  },

  // Payment failures >3 in 24h
  {
    id: 'payment_failures',
    severity: 'high',
    check: (_, __, context) => {
      if (context.paymentFailedCount >= 3) {
        return {
          type: 'payment_failures',
          titleKey: 'alerts.paymentFailures',
          titleParams: { count: context.paymentFailedCount },
          severity: 'high',
          icon: 'credit-card',
          colorClass: 'text-red-500',
          action: {
            labelKey: 'alerts.actions.viewFailedPayments',
            navigateTo: 'run?tab=transactions&filter=failed',
          },
        }
      }
      return null
    },
  },

  // Checkout issues - checkouts up but payments flat
  {
    id: 'checkout_issues',
    severity: 'high',
    check: (_, __, context) => {
      const { checkoutStartedCount, paymentSucceededCount } = context
      // Need at least 5 checkouts and less than 30% converting
      if (checkoutStartedCount >= 5 && paymentSucceededCount < checkoutStartedCount * 0.3) {
        return {
          type: 'checkout_issues',
          titleKey: 'alerts.checkoutIssues',
          severity: 'high',
          icon: 'credit-card',
          colorClass: 'text-amber-500',
          action: {
            labelKey: 'alerts.actions.checkPayments',
            navigateTo: 'builder?focus=payments',
          },
        }
      }
      return null
    },
  },

  // Conversion drop >30%
  {
    id: 'conversion_drop',
    severity: 'medium',
    check: (current, previous) => {
      // Calculate conversion rates
      const currentConversion = current.sessions > 0
        ? (current.payments / current.sessions) * 100
        : 0
      const previousConversion = previous.sessions > 0
        ? (previous.payments / previous.sessions) * 100
        : 0

      if (previousConversion < 1) return null // Need 1%+ baseline
      const drop = ((previousConversion - currentConversion) / previousConversion) * 100
      if (drop > 30) {
        return {
          type: 'conversion_drop',
          titleKey: 'alerts.conversionDrop',
          titleParams: { percent: Math.round(drop) },
          severity: 'medium',
          icon: 'bar-chart',
          colorClass: 'text-amber-500',
          action: {
            labelKey: 'alerts.actions.reviewFunnel',
            navigateTo: 'run?tab=overview',
          },
        }
      }
      return null
    },
  },
]

/**
 * Run all alert rules and return matching alerts
 */
export function computeAlerts(
  current: KpiData,
  previous: KpiData,
  context: AlertContext
): AlertResult[] {
  const alerts: AlertResult[] = []

  for (const rule of ALERT_RULES) {
    const result = rule.check(current, previous, context)
    if (result) {
      alerts.push(result)
    }
  }

  // Sort by severity (high first)
  const severityOrder: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 }
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return alerts
}

/**
 * Check if alerts should be computed (has enough data)
 */
export function canComputeAlerts(previous: KpiData): boolean {
  // Need at least some activity in previous period
  return previous.sessions > 0 || previous.leads > 0 || previous.payments > 0
}
