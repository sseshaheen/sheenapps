/**
 * Run Hub Phase 4 Contracts
 *
 * These types are the source of truth for Run Hub workflows.
 * They prevent drift across UI, worker, and future services.
 *
 * IMPORTANT: If you change these types, ensure consistency across:
 * - Worker services (workflowExecutionService, attributionService)
 * - Worker routes (inhouseWorkflowRuns)
 * - Frontend API calls (run-overview-content.tsx, modals)
 * - Database schemas (workflow_runs, workflow_attributions)
 */

// ============================================
// ACTION DEFINITION
// ============================================

/**
 * Available action identifiers.
 * Must match ACTION_REGISTRY keys in both frontend and backend.
 */
export type ActionId =
  | 'recover_abandoned'
  | 'send_promo'
  | 'onboard_users'
  | 'send_reminders'
  | 'send_motivation'

/**
 * Attribution model for outcome tracking.
 * Single source of truth for model string literals.
 */
export type AttributionModel = 'last_touch_48h'

/**
 * Risk level for actions - affects confirmation requirements.
 */
export type ActionRisk = 'low' | 'medium' | 'high'

/**
 * Requirements that must be met for an action to be available.
 */
export type ActionRequirement =
  | { type: 'hasEvents'; minCount?: number; eventType?: string }
  | { type: 'hasIntegration'; integration: string }
  | { type: 'hasRecipients'; source: string }
  | { type: 'hasPermission'; role: 'owner' | 'admin' }

/**
 * Full action definition for registry.
 * 'modal' is UI presentation hint, not action type.
 */
export interface ActionDefinition {
  id: ActionId
  type: 'workflow' | 'navigate'
  risk: ActionRisk
  confirmRequired: boolean
  supportsPreview: boolean
  ui?: {
    modalId?: 'sendPromo' | 'postUpdate'
  }
  outcome?: {
    model: AttributionModel
    windowHours: number
    metrics: string[]
  }
  requires?: ActionRequirement[]
  disabledReasonKey?: string
}

// ============================================
// WORKFLOW RUN
// ============================================

/**
 * Workflow execution status.
 */
export type WorkflowStatus = 'queued' | 'running' | 'succeeded' | 'failed'

/**
 * Workflow run record (matches database schema).
 */
export interface WorkflowRun {
  id: string
  projectId: string
  actionId: ActionId
  status: WorkflowStatus
  requestedAt: string
  clientRequestedAt?: string
  startedAt?: string
  completedAt?: string
  idempotencyKey: string
  params: Record<string, unknown>
  recipientCountEstimate?: number
  attempts: number
  leaseExpiresAt?: string
  lastHeartbeatAt?: string
  result?: WorkflowResult
  triggeredBy: string
  createdAt: string
}

/**
 * Workflow execution result.
 */
export interface WorkflowResult {
  totalRecipients: number
  successful: number
  failed: number
  errorSummary?: string
}

// ============================================
// OUTCOME (Canonical - used in 3 places)
// ============================================

/**
 * How attribution was determined.
 * Ordered by confidence: wid_link > email_exact > cart_match > amount_match
 */
export type MatchMethod = 'wid_link' | 'email_exact' | 'cart_match' | 'amount_match'

/**
 * Confidence level derived from match method.
 */
export type OutcomeConfidence = 'high' | 'medium' | 'low'

/**
 * Canonical outcome type - used in:
 * 1. Workflow status display
 * 2. Action card "last run" indicator
 * 3. Daily digest proof points
 */
export interface Outcome {
  model: AttributionModel
  windowHours: number
  conversions: number
  revenueCents: number
  currency: string
  confidence: OutcomeConfidence
  matchedBy: MatchMethod
}

/**
 * Workflow run with outcome data (for API responses).
 */
export interface WorkflowRunWithOutcome extends WorkflowRun {
  outcome?: Outcome
}

// ============================================
// POLICY DECISION
// ============================================

/**
 * Result of policy evaluation.
 * Always includes reason and params for i18n.
 */
export interface PolicyDecision {
  allowed: boolean
  reason?: string           // i18n key
  reasonParams?: Record<string, unknown>
}

// ============================================
// PREVIEW REQUEST/RESPONSE (POST, not GET)
// ============================================

/**
 * Request body for preview endpoint.
 * POST /v1/inhouse/projects/:projectId/run/workflow-runs/preview
 */
export interface PreviewRequest {
  actionId: ActionId
  params?: Record<string, unknown>  // Segmentation, filters, etc.
}

/**
 * Preview response with transparency.
 */
export interface PreviewResponse {
  count: number
  sample: Array<{ email: string; name?: string }>
  criteria: string                    // Human-readable: "Checkouts in last 24h without payment"
  exclusions: string[]                // ["Already purchased", "Unsubscribed"]
  warnings: string[]                  // ["This will email 500+ people"]
  blocked?: { reason: string }        // If policy blocks execution
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/**
 * Request body for creating a workflow run.
 * POST /v1/inhouse/projects/:projectId/run/workflow-runs
 */
export interface CreateWorkflowRunRequest {
  userId: string
  actionId: ActionId
  idempotencyKey: string
  clientRequestedAt?: string
  params?: Record<string, unknown>
  recipientCountEstimate?: number
}

/**
 * Response from creating a workflow run.
 */
export interface CreateWorkflowRunResponse {
  runId: string
  status: WorkflowStatus
  deduplicated: boolean
}

/**
 * Query params for listing workflow runs.
 */
export interface ListWorkflowRunsQuery {
  userId: string
  actionId?: ActionId
  status?: WorkflowStatus
  limit?: number
  cursor?: string
}

/**
 * Response from listing workflow runs.
 */
export interface ListWorkflowRunsResponse {
  runs: WorkflowRunWithOutcome[]
  nextCursor?: string
}

// ============================================
// DIGEST TYPES
// ============================================

/**
 * Digest content for email generation.
 */
export interface DigestContent {
  projectName: string
  date: string
  timezone: string
  industryTag?: string

  // Narrative headline
  headline: {
    text: string
    delta: number
    metric: 'revenue' | 'leads' | 'conversion'
  }

  // KPIs
  kpis: {
    revenue: { value: number; delta: number; deltaPercent: number }
    leads: { value: number; delta: number; deltaPercent: number }
    conversion: { value: number; delta: number; deltaPercent: number }
  }

  // Top anomaly (optional)
  anomaly?: {
    type: string
    message: string
    severity: 'high' | 'medium'
  }

  // Recommended action (optional)
  recommendedAction?: {
    id: ActionId
    label: string
    reason: string
  }

  // Proof point (optional)
  lastOutcome?: {
    actionLabel: string
    outcome: Outcome
    when: string
  }

  runHubUrl: string
}

// ============================================
// ATTRIBUTION TYPES
// ============================================

/**
 * Attribution record (matches database schema).
 */
export interface WorkflowAttribution {
  id: string
  projectId: string
  workflowRunId: string
  paymentEventId: number
  attributedAt: string
  model: AttributionModel
  matchMethod: MatchMethod
  amountCents: number
  currency: string
  confidence: OutcomeConfidence
}

/**
 * Input for attribution check.
 */
export interface AttributionCheckInput {
  projectId: string
  eventId: number
  customerEmail?: string
  checkoutMetadata?: {
    wid?: string      // Workflow run ID from recovery link
    cartId?: string   // Cart ID for matching
  }
  amountCents: number
  currency: string
  occurredAt: string
}

/**
 * Impact summary for a workflow run.
 */
export interface WorkflowImpact {
  totalRecipients: number
  conversions: number
  recoveredRevenueCents: number
  currency: string
}
