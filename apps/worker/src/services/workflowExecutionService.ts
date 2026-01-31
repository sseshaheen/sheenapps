/**
 * WorkflowExecutionService
 *
 * Core service for Run Hub workflow execution.
 * Handles:
 * - Idempotent run creation (deduplication via idempotency_key)
 * - Workflow execution (email sending)
 * - Status tracking and impact calculation
 * - Preview/dry-run functionality
 *
 * Part of Run Hub Phase 4 Implementation.
 */

import { Pool, PoolClient } from 'pg'
import { getPool } from './database'
import { getWorkflowPolicyService } from './workflowPolicyService'
import { getInhouseEmailService, type SupportedLocale } from './inhouse/InhouseEmailService'
import type {
  ActionId,
  WorkflowRun,
  WorkflowRunWithOutcome,
  WorkflowResult,
  PreviewResponse,
  CreateWorkflowRunResponse,
  Outcome,
  WorkflowStatus,
} from '../types/run-contracts'

// Simple logging prefix for this service
const LOG_PREFIX = '[WorkflowExecutionService]'

// ============================================
// SERVICE INTERFACE
// ============================================

export interface CreateRunInput {
  projectId: string
  actionId: ActionId
  triggeredBy: string
  idempotencyKey: string
  clientRequestedAt?: string
  params?: Record<string, unknown>
  recipientCountEstimate?: number
  locale?: string
}

export interface ListRunsOptions {
  actionId?: ActionId
  status?: WorkflowStatus
  limit?: number
  cursor?: string
}

export interface Recipient {
  email: string
  name?: string
  metadata?: Record<string, unknown>
}

// ============================================
// SERVICE IMPLEMENTATION
// ============================================

export class WorkflowExecutionService {
  private pool: Pool

  constructor() {
    this.pool = getPool()
  }

  /**
   * Create and queue a workflow run (idempotent).
   * Uses xmax = 0 trick to detect true inserts vs conflict matches.
   */
  async createRun(input: CreateRunInput): Promise<CreateWorkflowRunResponse> {
    // Merge locale into params so it's persisted with the run
    const params = {
      ...(input.params ?? {}),
      ...(input.locale ? { locale: input.locale } : {}),
    }

    const result = await this.pool.query(
      `
      INSERT INTO workflow_runs (
        project_id,
        action_id,
        triggered_by,
        idempotency_key,
        client_requested_at,
        params,
        recipient_count_estimate
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (project_id, action_id, idempotency_key)
      DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
      RETURNING id, (xmax = 0) AS inserted, status
      `,
      [
        input.projectId,
        input.actionId,
        input.triggeredBy,
        input.idempotencyKey,
        input.clientRequestedAt ?? null,
        params,
        input.recipientCountEstimate ?? null,
      ]
    )

    const { id: runId, inserted, status } = result.rows[0]

    console.log(`${LOG_PREFIX} Workflow run created:`, {
      runId,
      projectId: input.projectId,
      actionId: input.actionId,
      inserted,
      deduplicated: !inserted,
      status,
    })

    return {
      runId,
      status: status as WorkflowStatus,
      deduplicated: !inserted,
    }
  }

  /**
   * Execute a workflow run.
   * Called by job processor. Updates status and handles email sending.
   */
  async execute(runId: string): Promise<void> {
    const startTime = Date.now()

    // 1. Acquire lease and mark as running
    const run = await this.acquireLease(runId)
    if (!run) {
      console.warn(`${LOG_PREFIX} Workflow run lease failed:`, { runId })
      return
    }

    console.log(`${LOG_PREFIX} Workflow run started:`, {
      runId,
      projectId: run.projectId,
      actionId: run.actionId,
    })

    try {
      // 2. Build recipient list
      const recipients = await this.buildRecipients(
        run.projectId,
        run.actionId as ActionId,
        run.params,
        'execute'
      )

      console.log(`${LOG_PREFIX} Workflow run recipients built:`, {
        runId,
        recipientCount: recipients.length,
      })

      // 3. Check execution-time policy
      const policyService = getWorkflowPolicyService()
      const policy = await policyService.evaluateExecution({
        projectId: run.projectId,
        actionId: run.actionId as ActionId,
        actionRisk: 'medium', // TODO: Look up from registry
        recipientCountActual: recipients.length,
        runId,
      })

      if (!policy.allowed) {
        await this.markFailed(runId, `Policy blocked: ${policy.reason}`)
        console.warn(`${LOG_PREFIX} Workflow run policy blocked:`, {
          runId,
          reason: policy.reason,
          reasonParams: policy.reasonParams,
        })
        return
      }

      // 4. Execute the workflow (send emails)
      const result = await this.sendEmails(run, recipients)

      // 5. Mark as succeeded
      await this.markSucceeded(runId, result)

      console.log(`${LOG_PREFIX} Workflow run completed:`, {
        runId,
        successful: result.successful,
        failed: result.failed,
        durationMs: Date.now() - startTime,
      })
    } catch (err) {
      const error = err as Error
      const errorSummary = error.message?.slice(0, 500) || 'Unknown error'

      await this.markFailed(runId, errorSummary)

      console.error(`${LOG_PREFIX} Workflow run failed:`, {
        runId,
        error: error.message,
        errorSummary,
        durationMs: Date.now() - startTime,
      })

      throw err
    }
  }

  /**
   * Acquire lease for a run (for concurrency safety).
   * Returns run data if lease acquired, null otherwise.
   *
   * Handles stuck runs: If a run is in 'running' status but lease has expired,
   * it can be re-acquired (worker died scenario).
   */
  private async acquireLease(runId: string): Promise<WorkflowRun | null> {
    const leaseMinutes = 30 // 30 minute lease
    const result = await this.pool.query(
      `
      UPDATE workflow_runs
      SET
        status = 'running',
        started_at = COALESCE(started_at, now()),
        attempts = attempts + 1,
        lease_expires_at = now() + interval '${leaseMinutes} minutes',
        last_heartbeat_at = now()
      WHERE id = $1
        AND (
          status = 'queued'
          OR (status = 'running' AND lease_expires_at < now())
        )
      RETURNING *
      `,
      [runId]
    )

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    const wasStuck = row.attempts > 1

    if (wasStuck) {
      console.warn(`${LOG_PREFIX} Recovered stuck workflow run:`, {
        runId,
        attempts: row.attempts,
        previouslyStartedAt: row.started_at,
      })
    }

    return this.rowToWorkflowRun(row)
  }

  /**
   * Update heartbeat and extend lease for long-running workflows.
   * Call this periodically during execution to prevent lease expiry.
   */
  async heartbeat(runId: string, extendMinutes: number = 30): Promise<void> {
    await this.pool.query(
      `
      UPDATE workflow_runs
      SET
        last_heartbeat_at = now(),
        lease_expires_at = now() + ($2::text)::interval
      WHERE id = $1
        AND status = 'running'
      `,
      [runId, `${extendMinutes} minutes`]
    )
  }

  /**
   * Mark run as succeeded.
   */
  private async markSucceeded(runId: string, result: WorkflowResult): Promise<void> {
    await this.pool.query(
      `
      UPDATE workflow_runs
      SET
        status = 'succeeded',
        completed_at = now(),
        result = $2,
        lease_expires_at = NULL
      WHERE id = $1
      `,
      [runId, result]
    )
  }

  /**
   * Mark run as failed.
   */
  private async markFailed(runId: string, errorSummary: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE workflow_runs
      SET
        status = 'failed',
        completed_at = now(),
        result = $2,
        lease_expires_at = NULL
      WHERE id = $1
      `,
      [runId, { errorSummary }]
    )
  }

  /**
   * Get a workflow run by ID (with outcome if available).
   */
  async getRun(runId: string): Promise<WorkflowRunWithOutcome | null> {
    const result = await this.pool.query(
      `
      SELECT wr.*,
        (
          SELECT jsonb_build_object(
            'model', 'last_touch_48h',
            'windowHours', 48,
            'conversions', COUNT(*)::int,
            'revenueCents', COALESCE(SUM(wa.amount_cents), 0)::bigint,
            'currency', MAX(wa.currency),
            'confidence', MAX(wa.confidence),
            'matchedBy', MAX(wa.match_method)
          )
          FROM workflow_attributions wa
          WHERE wa.workflow_run_id = wr.id
        ) as outcome
      FROM workflow_runs wr
      WHERE wr.id = $1
      `,
      [runId]
    )

    if (result.rows.length === 0) return null

    const run = this.rowToWorkflowRun(result.rows[0])
    const outcome = result.rows[0].outcome
    const hasConversions = outcome?.conversions > 0

    return {
      ...run,
      outcome: hasConversions ? outcome as Outcome : undefined,
    }
  }

  /**
   * List workflow runs for a project.
   */
  async listRuns(
    projectId: string,
    options: ListRunsOptions = {}
  ): Promise<{ runs: WorkflowRunWithOutcome[]; nextCursor?: string }> {
    const limit = Math.min(options.limit || 20, 100)
    const conditions: string[] = ['wr.project_id = $1']
    const params: unknown[] = [projectId]
    let paramIndex = 2

    if (options.actionId) {
      conditions.push(`wr.action_id = $${paramIndex++}`)
      params.push(options.actionId)
    }

    if (options.status) {
      conditions.push(`wr.status = $${paramIndex++}`)
      params.push(options.status)
    }

    if (options.cursor) {
      conditions.push(`wr.created_at < $${paramIndex++}`)
      params.push(options.cursor)
    }

    params.push(limit + 1) // Fetch one extra to detect hasMore

    const result = await this.pool.query(
      `
      SELECT wr.*,
        (
          SELECT jsonb_build_object(
            'model', 'last_touch_48h',
            'windowHours', 48,
            'conversions', COUNT(*)::int,
            'revenueCents', COALESCE(SUM(wa.amount_cents), 0)::bigint,
            'currency', MAX(wa.currency),
            'confidence', MAX(wa.confidence),
            'matchedBy', MAX(wa.match_method)
          )
          FROM workflow_attributions wa
          WHERE wa.workflow_run_id = wr.id
        ) as outcome
      FROM workflow_runs wr
      WHERE ${conditions.join(' AND ')}
      ORDER BY wr.created_at DESC
      LIMIT $${paramIndex}
      `,
      params
    )

    const hasMore = result.rows.length > limit
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows

    const runs = rows.map((row) => {
      const run = this.rowToWorkflowRun(row)
      const outcome = row.outcome
      const hasConversions = outcome?.conversions > 0
      return {
        ...run,
        outcome: hasConversions ? outcome as Outcome : undefined,
      }
    })

    return {
      runs,
      nextCursor: hasMore ? rows[rows.length - 1].created_at : undefined,
    }
  }

  /**
   * Preview recipients (dry-run).
   * Uses the same buildRecipients logic as execute for consistency.
   */
  async previewRecipients(
    projectId: string,
    actionId: ActionId,
    params?: Record<string, unknown>
  ): Promise<PreviewResponse> {
    // Build recipients using same logic as execute
    const recipients = await this.buildRecipients(
      projectId,
      actionId,
      params ?? {},
      'preview'
    )

    // Check policy for warnings
    const policyService = getWorkflowPolicyService()
    const policy = await policyService.evaluateTrigger({
      projectId,
      actionId,
      actionRisk: 'medium', // TODO: Look up from registry
      recipientCountEstimate: recipients.length,
      triggeredByRole: 'owner', // TODO: Get from request
    })

    const warnings: string[] = []
    if (recipients.length > 100) {
      warnings.push(`This will email ${recipients.length} people`)
    }

    return {
      count: recipients.length,
      sample: recipients.slice(0, 5).map((r) => ({
        email: r.email,
        name: r.name,
      })),
      criteria: this.getCriteriaDescription(actionId, params),
      exclusions: this.getExclusionsList(actionId),
      warnings,
      blocked: policy.allowed ? undefined : { reason: policy.reason || '' },
    }
  }

  // Per-recipient cooldown: don't email same person for same action within this window
  private static readonly RECIPIENT_COOLDOWN_HOURS = 24

  /**
   * Build recipient list for a workflow action.
   * CRITICAL: Same function for preview and execute to ensure consistency.
   *
   * Exclusions enforced:
   * 1. Suppressed emails (handled by InhouseEmailService.getSuppressedRecipients at send time)
   * 2. Per-recipient cooldown via workflow_sends table (NOT EXISTS in queries below)
   * 3. Action-specific logic (e.g. already purchased for cart recovery)
   *
   * Not yet enforced:
   * - Invalid/bounced email addresses (requires email deliverability tracking)
   */
  private async buildRecipients(
    projectId: string,
    actionId: ActionId,
    params: Record<string, unknown>,
    mode: 'preview' | 'execute'
  ): Promise<Recipient[]> {
    // Different query based on action type
    switch (actionId) {
      case 'recover_abandoned':
        return this.buildAbandonedCartRecipients(projectId, mode)
      case 'send_promo':
        return this.buildPromoRecipients(projectId, params, mode)
      case 'onboard_users':
        return this.buildOnboardingRecipients(projectId, mode)
      default:
        return []
    }
  }

  /**
   * Build recipients for cart recovery workflow.
   * NOTE: Uses lower() for email normalization to prevent duplicates like Alice@x.com vs alice@x.com
   */
  private async buildAbandonedCartRecipients(
    projectId: string,
    mode: 'preview' | 'execute'
  ): Promise<Recipient[]> {
    const limit = mode === 'preview' ? 100 : 1000

    const result = await this.pool.query(
      `
      SELECT DISTINCT ON (lower(be.payload->>'customer_email'))
        lower(be.payload->>'customer_email') as email,
        be.payload->>'customer_name' as name,
        be.payload as metadata
      FROM business_events be
      WHERE be.project_id = $1
        AND be.event_type = 'checkout_started'
        AND be.occurred_at > now() - interval '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM business_events pe
          WHERE pe.project_id = $1
            AND pe.event_type = 'payment_succeeded'
            AND pe.occurred_at > be.occurred_at
            AND (
              pe.correlation_id = be.correlation_id
              OR lower(pe.payload->>'customer_email') = lower(be.payload->>'customer_email')
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM workflow_sends ws
          WHERE ws.project_id = $1
            AND ws.action_id = 'recover_abandoned'
            AND ws.email = lower(be.payload->>'customer_email')
            AND ws.status = 'sent'
            AND ws.sent_at > now() - ($3::text)::interval
        )
        AND be.payload->>'customer_email' IS NOT NULL
      ORDER BY lower(be.payload->>'customer_email'), be.occurred_at DESC
      LIMIT $2
      `,
      [projectId, limit, `${WorkflowExecutionService.RECIPIENT_COOLDOWN_HOURS} hours`]
    )

    return result.rows.map((row) => ({
      email: row.email,
      name: row.name || undefined,
      metadata: row.metadata,
    }))
  }

  /**
   * Build recipients for promo workflow.
   * NOTE: Uses lower() for email normalization to prevent duplicates
   */
  private async buildPromoRecipients(
    projectId: string,
    params: Record<string, unknown>,
    mode: 'preview' | 'execute'
  ): Promise<Recipient[]> {
    const limit = mode === 'preview' ? 100 : 1000
    const segmentation = params.segmentation || 'recent_30d'

    // Determine time window based on segmentation
    let interval = '30 days'
    if (segmentation === 'recent_7d') interval = '7 days'
    if (segmentation === 'all') interval = '365 days'

    const result = await this.pool.query(
      `
      SELECT DISTINCT ON (email)
        email,
        name,
        jsonb_build_object('last_event_at', max_occurred_at) as metadata
      FROM (
        SELECT
          lower(be.payload->>'customer_email') as email,
          be.payload->>'customer_name' as name,
          MAX(be.occurred_at) as max_occurred_at
        FROM business_events be
        WHERE be.project_id = $1
          AND be.occurred_at > now() - ($2::text)::interval
          AND be.payload->>'customer_email' IS NOT NULL
          AND be.event_type IN ('payment_succeeded', 'form_submitted', 'lead_created')
          AND NOT EXISTS (
            SELECT 1 FROM workflow_sends ws
            WHERE ws.project_id = $1
              AND ws.action_id = 'send_promo'
              AND ws.email = lower(be.payload->>'customer_email')
              AND ws.status = 'sent'
              AND ws.sent_at > now() - ($4::text)::interval
          )
        GROUP BY lower(be.payload->>'customer_email'), be.payload->>'customer_name'
      ) sub
      ORDER BY email, max_occurred_at DESC
      LIMIT $3
      `,
      [projectId, interval, limit, `${WorkflowExecutionService.RECIPIENT_COOLDOWN_HOURS} hours`]
    )

    return result.rows.map((row) => ({
      email: row.email,
      name: row.name || undefined,
      metadata: row.metadata,
    }))
  }

  /**
   * Build recipients for onboarding workflow.
   * NOTE: Uses lower() for email normalization to prevent duplicates
   */
  private async buildOnboardingRecipients(
    projectId: string,
    mode: 'preview' | 'execute'
  ): Promise<Recipient[]> {
    const limit = mode === 'preview' ? 100 : 1000

    const result = await this.pool.query(
      `
      SELECT DISTINCT ON (lower(be.payload->>'customer_email'))
        lower(be.payload->>'customer_email') as email,
        be.payload->>'customer_name' as name,
        be.payload as metadata
      FROM business_events be
      WHERE be.project_id = $1
        AND be.event_type IN ('user_signed_up', 'account_created')
        AND be.occurred_at > now() - interval '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM business_events ae
          WHERE ae.project_id = $1
            AND ae.event_type IN ('page_viewed', 'feature_used', 'payment_succeeded')
            AND ae.occurred_at > be.occurred_at
            AND lower(ae.payload->>'customer_email') = lower(be.payload->>'customer_email')
        )
        AND NOT EXISTS (
          SELECT 1 FROM workflow_sends ws
          WHERE ws.project_id = $1
            AND ws.action_id = 'onboard_users'
            AND ws.email = lower(be.payload->>'customer_email')
            AND ws.status = 'sent'
            AND ws.sent_at > now() - ($3::text)::interval
        )
        AND be.payload->>'customer_email' IS NOT NULL
      ORDER BY lower(be.payload->>'customer_email'), be.occurred_at DESC
      LIMIT $2
      `,
      [projectId, limit, `${WorkflowExecutionService.RECIPIENT_COOLDOWN_HOURS} hours`]
    )

    return result.rows.map((row) => ({
      email: row.email,
      name: row.name || undefined,
      metadata: row.metadata,
    }))
  }

  /**
   * Send emails to recipients via InhouseEmailService.
   * Uses the generic 'notification' template with action-specific content.
   */
  private async sendEmails(
    run: WorkflowRun,
    recipients: Recipient[]
  ): Promise<WorkflowResult> {
    let successful = 0
    let failed = 0

    const emailService = getInhouseEmailService(run.projectId)
    const locale = (run.params?.locale as SupportedLocale) || 'en'
    const emailContent = this.getEmailContent(run.actionId as ActionId, locale)

    // Heartbeat interval: extend lease every 50 recipients
    const HEARTBEAT_INTERVAL = 50

    for (const [i, recipient] of recipients.entries()) {
      // Extend lease periodically for large batches
      if (i > 0 && i % HEARTBEAT_INTERVAL === 0) {
        await this.heartbeat(run.id)
        console.log(`${LOG_PREFIX} Heartbeat at recipient ${i}/${recipients.length}`, {
          runId: run.id,
        })
      }

      try {
        await emailService.send({
          to: recipient.email,
          template: 'notification',
          variables: {
            subject: emailContent.subject,
            title: emailContent.title,
            message: emailContent.message,
            ...(emailContent.actionUrl ? { actionUrl: emailContent.actionUrl } : {}),
            ...(emailContent.actionText ? { actionText: emailContent.actionText } : {}),
            ...(recipient.name ? { recipientName: recipient.name } : {}),
          },
          locale,
          idempotencyKey: `workflow:${run.id}:${recipient.email}`,
        })

        // Record successful send for cooldown tracking
        await this.recordSend(run.projectId, run.id, run.actionId, recipient.email, 'sent')

        successful++
      } catch (err) {
        // Record failed send for audit
        await this.recordSend(run.projectId, run.id, run.actionId, recipient.email, 'failed').catch(() => {})

        console.warn(`${LOG_PREFIX} Workflow email failed:`, {
          runId: run.id,
          recipientEmail: recipient.email,
          error: (err as Error).message,
        })
        failed++
      }
    }

    console.log(`${LOG_PREFIX} Email batch complete:`, {
      runId: run.id,
      successful,
      failed,
      total: recipients.length,
    })

    return {
      totalRecipients: recipients.length,
      successful,
      failed,
    }
  }

  /**
   * Get email content (subject, title, message) per action type.
   * Uses simple English defaults; the notification template handles locale rendering.
   */
  private getEmailContent(
    actionId: ActionId,
    locale: SupportedLocale
  ): {
    subject: string
    title: string
    message: string
    actionUrl?: string
    actionText?: string
  } {
    switch (actionId) {
      case 'recover_abandoned':
        return {
          subject: 'You left something behind!',
          title: 'Complete your purchase',
          message: 'We noticed you started a checkout but didn\'t finish. Your items are still waiting for you.',
          actionText: 'Complete Checkout',
        }
      case 'send_promo':
        return {
          subject: 'A special offer just for you',
          title: 'Special Offer',
          message: 'We have an exclusive promotion for valued customers like you. Don\'t miss out!',
        }
      case 'onboard_users':
        return {
          subject: 'Welcome! Let\'s get you started',
          title: 'Welcome aboard!',
          message: 'Thanks for signing up! We\'re excited to have you. Here are some tips to get the most out of your experience.',
          actionText: 'Get Started',
        }
      default:
        return {
          subject: 'Notification',
          title: 'Notification',
          message: 'You have a new notification.',
        }
    }
  }

  /**
   * Record an individual email send for cooldown tracking and audit.
   * Uses ON CONFLICT to handle retries gracefully (update status instead of duplicate row).
   */
  private async recordSend(
    projectId: string,
    runId: string,
    actionId: string,
    email: string,
    status: 'sent' | 'failed' | 'suppressed'
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO workflow_sends (project_id, workflow_run_id, action_id, email, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workflow_run_id, email) DO UPDATE SET
         status = EXCLUDED.status,
         sent_at = now()`,
      [projectId, runId, actionId, email.toLowerCase(), status]
    )
  }

  /**
   * Get human-readable criteria description for an action.
   */
  private getCriteriaDescription(
    actionId: ActionId,
    params?: Record<string, unknown>
  ): string {
    switch (actionId) {
      case 'recover_abandoned':
        return 'Checkouts started in last 24h without payment'
      case 'send_promo':
        const seg = params?.segmentation || 'recent_30d'
        if (seg === 'recent_7d') return 'Customers with activity in last 7 days'
        if (seg === 'all') return 'All customers in last year'
        return 'Customers with activity in last 30 days'
      case 'onboard_users':
        return 'Users who signed up in last 7 days without engagement'
      default:
        return 'Selected recipients'
    }
  }

  /**
   * Get exclusion list for an action.
   * Only return exclusions that are ACTUALLY enforced in queries.
   */
  private getExclusionsList(actionId: ActionId): string[] {
    const cooldownLabel = `Emailed in last ${WorkflowExecutionService.RECIPIENT_COOLDOWN_HOURS}h`
    switch (actionId) {
      case 'recover_abandoned':
        return ['Already purchased', cooldownLabel, 'Suppressed emails']
      case 'send_promo':
        return [cooldownLabel, 'Suppressed emails']
      case 'onboard_users':
        return ['Already engaged', cooldownLabel, 'Suppressed emails']
      default:
        return []
    }
  }

  /**
   * Convert database row to WorkflowRun type.
   */
  private rowToWorkflowRun(row: Record<string, unknown>): WorkflowRun {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      actionId: row.action_id as ActionId,
      status: row.status as WorkflowStatus,
      requestedAt: (row.requested_at as Date).toISOString(),
      clientRequestedAt: row.client_requested_at
        ? (row.client_requested_at as Date).toISOString()
        : undefined,
      startedAt: row.started_at
        ? (row.started_at as Date).toISOString()
        : undefined,
      completedAt: row.completed_at
        ? (row.completed_at as Date).toISOString()
        : undefined,
      idempotencyKey: row.idempotency_key as string,
      params: row.params as Record<string, unknown>,
      recipientCountEstimate: row.recipient_count_estimate as number | undefined,
      attempts: row.attempts as number,
      leaseExpiresAt: row.lease_expires_at
        ? (row.lease_expires_at as Date).toISOString()
        : undefined,
      lastHeartbeatAt: row.last_heartbeat_at
        ? (row.last_heartbeat_at as Date).toISOString()
        : undefined,
      result: row.result as WorkflowResult | undefined,
      triggeredBy: row.triggered_by as string,
      createdAt: (row.created_at as Date).toISOString(),
    }
  }
}

// Singleton instance
let workflowExecutionServiceInstance: WorkflowExecutionService | null = null

export function getWorkflowExecutionService(): WorkflowExecutionService {
  if (!workflowExecutionServiceInstance) {
    workflowExecutionServiceInstance = new WorkflowExecutionService()
  }
  return workflowExecutionServiceInstance
}
