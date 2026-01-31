/**
 * Run Hub Action Handlers - Declarative action configuration
 *
 * Part of Run Hub Phase 1: Real Action Handlers
 *
 * Uses discriminated union types so handlers carry their own destination/config.
 * This eliminates `if(actionId===...)` sprawl and scales cleanly across vertical packs.
 */

// User roles for permission checks
export type UserRole = 'owner' | 'admin' | 'member'

// Requirements that can disable an action
export type ActionRequirement =
  | { type: 'hasEvents'; minCount?: number }           // Has tracking data
  | { type: 'hasIntegration'; integration: string }    // e.g., 'payments', 'email'
  | { type: 'hasRecipients'; source: string }          // Has leads/customers to target
  | { type: 'hasPermission'; role: UserRole }          // Role-based access

// Base fields shared by all handlers
type ActionBase = {
  id: string
  requires?: ActionRequirement[]  // Conditions that must be met
  disabledReasonKey?: string      // i18n key explaining why unavailable
}

// Action handler types with discriminated union
// Parenthesized to ensure proper type narrowing (& binds tighter than |)
export type ActionHandler =
  | (ActionBase & { type: 'navigate'; to: string; query?: Record<string, string> })
  | (ActionBase & { type: 'modal'; modal: 'send_promo' | 'post_update' | 'recover_abandoned' })
  | (ActionBase & { type: 'workflow'; endpoint: string; confirmRequired?: boolean })
  | (ActionBase & { type: 'external'; href: string })

// Context for checking action availability
export interface ActionContext {
  eventCount: number
  integrations: string[]
  recipientCounts: Record<string, number>
  userRoles: UserRole[]
}

// Result of availability check - always returns reasonKey + reasonParams for consistent i18n
export interface ActionAvailabilityResult {
  available: boolean
  reasonKey?: string
  reasonParams?: Record<string, unknown>
}

/**
 * Declarative action handlers registry
 *
 * Navigate actions are wired up first (Phase 1 Quick Win).
 * Modal and workflow actions will be implemented in later phases.
 */
export const ACTION_HANDLERS = {
  // Navigate actions (Phase 1)
  follow_up_leads: {
    id: 'follow_up_leads',
    type: 'navigate',
    to: 'run',
    query: { tab: 'leads', filter: 'recent' },
    requires: [{ type: 'hasRecipients', source: 'leads_7d' }],
    disabledReasonKey: 'actions.disabled.noLeads',
  },
  follow_up_orders: {
    id: 'follow_up_orders',
    type: 'navigate',
    to: 'run',
    query: { tab: 'transactions', filter: 'pending' },
  },
  confirm_bookings: {
    id: 'confirm_bookings',
    type: 'navigate',
    to: 'run',
    query: { tab: 'leads', filter: 'booking_requested' },
  },
  ship_update: {
    id: 'ship_update',
    type: 'navigate',
    to: 'builder',
    query: { focus: 'deploy' },
  },
  follow_up_inquiries: {
    id: 'follow_up_inquiries',
    type: 'navigate',
    to: 'run',
    query: { tab: 'leads', filter: 'inquiry' },
  },

  // Modal actions (Phase 4 - Coming Soon for now)
  send_promo: {
    id: 'send_promo',
    type: 'modal',
    modal: 'send_promo',
    requires: [
      { type: 'hasIntegration', integration: 'email' },
      { type: 'hasRecipients', source: 'customers_30d' },
    ],
    disabledReasonKey: 'actions.disabled.noRecipients',
  },
  post_update: {
    id: 'post_update',
    type: 'modal',
    modal: 'post_update',
  },

  // Workflow actions (Phase 4 - Implemented)
  // All workflows use POST /api/projects/:projectId/run/workflow-runs with actionId in body
  recover_abandoned: {
    id: 'recover_abandoned',
    type: 'workflow',
    endpoint: '/api/projects/:projectId/run/workflow-runs',
    confirmRequired: true,
    requires: [
      { type: 'hasIntegration', integration: 'payments' },
      { type: 'hasEvents', minCount: 1 },
    ],
    disabledReasonKey: 'actions.disabled.noAbandonedCarts',
  },
  send_promo_workflow: {
    id: 'send_promo_workflow',
    type: 'workflow',
    endpoint: '/api/projects/:projectId/run/workflow-runs',
    confirmRequired: true,
    requires: [
      { type: 'hasIntegration', integration: 'email' },
      { type: 'hasRecipients', source: 'customers_30d' },
    ],
    disabledReasonKey: 'actions.disabled.noRecipients',
  },
  onboard_users: {
    id: 'onboard_users',
    type: 'workflow',
    endpoint: '/api/projects/:projectId/run/workflow-runs',
    confirmRequired: true,
    requires: [{ type: 'hasRecipients', source: 'signups_7d' }],
  },
  send_reminders: {
    id: 'send_reminders',
    type: 'workflow',
    endpoint: '/api/projects/:projectId/run/workflow-runs',
    confirmRequired: true,
  },
  send_motivation: {
    id: 'send_motivation',
    type: 'workflow',
    endpoint: '/api/projects/:projectId/run/workflow-runs',
    confirmRequired: true,
  },
} as const satisfies Record<string, ActionHandler>

// Export ActionId type for compile-time safety
export type ActionId = keyof typeof ACTION_HANDLERS

/**
 * Check if an action is available based on context
 *
 * Always returns reasonKey + reasonParams for consistent i18n across 9 locales.
 */
export function getActionAvailability(
  handler: ActionHandler,
  context: ActionContext
): ActionAvailabilityResult {
  if (!handler.requires) return { available: true }

  for (const req of handler.requires) {
    switch (req.type) {
      case 'hasEvents':
        if (context.eventCount < (req.minCount ?? 1)) {
          return {
            available: false,
            reasonKey: handler.disabledReasonKey ?? 'actions.disabled.noEvents',
            reasonParams: { minCount: req.minCount ?? 1 },
          }
        }
        break
      case 'hasIntegration':
        if (!context.integrations.includes(req.integration)) {
          return {
            available: false,
            reasonKey: handler.disabledReasonKey ?? 'actions.disabled.needsIntegration',
            reasonParams: { integration: req.integration },
          }
        }
        break
      case 'hasRecipients':
        if ((context.recipientCounts[req.source] ?? 0) === 0) {
          return {
            available: false,
            reasonKey: handler.disabledReasonKey ?? 'actions.disabled.noRecipients',
            reasonParams: { source: req.source },
          }
        }
        break
      case 'hasPermission':
        if (!context.userRoles.includes(req.role)) {
          return {
            available: false,
            reasonKey: 'actions.disabled.insufficientPermissions',
            reasonParams: { requiredRole: req.role },
          }
        }
        break
    }
  }
  return { available: true }
}

/**
 * Check if the frontend has a client-side handler for this action.
 * This does NOT mean the worker can execute it end-to-end —
 * use the /run/actions endpoint for worker-side capability.
 */
export function hasClientHandler(actionId: string): actionId is ActionId {
  return actionId in ACTION_HANDLERS
}

/**
 * Workflow action IDs - derived from registry to prevent drift
 */
export const WORKFLOW_ACTION_IDS = Object.keys(ACTION_HANDLERS).filter(
  (id) => ACTION_HANDLERS[id as ActionId]?.type === 'workflow'
) as ActionId[]

export type WorkflowActionId = (typeof WORKFLOW_ACTION_IDS)[number]

/**
 * Check if an action is a workflow type
 */
export function isWorkflowAction(actionId: string): actionId is WorkflowActionId {
  return (WORKFLOW_ACTION_IDS as readonly string[]).includes(actionId)
}
