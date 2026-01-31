/**
 * WorkflowPolicyService
 *
 * Centralized guardrails for Run Hub workflow execution.
 * Two-layer enforcement:
 * 1. Trigger-time: Fast feedback when user clicks button (may use cached data)
 * 2. Execution-time: Authoritative check when worker is about to send (fresh data)
 *
 * Part of Run Hub Phase 4 Implementation.
 */

import { Pool } from 'pg'
import { getPool } from './database'
import type { ActionId, PolicyDecision, ActionRisk } from '../types/run-contracts'

// ============================================
// POLICY RULES (configurable per action)
// ============================================

export interface PolicyRules {
  minCooldownMinutes: number        // Same action can't run within X min
  maxRecipientsPerRun: number       // Safety cap
  minRecipientsPerRun: number       // Prevent empty runs
  highRiskRequiresOwner: boolean    // risk: 'high' actions need owner role
  requirePreviewBeforeExecute: boolean
}

const DEFAULT_POLICY_RULES: PolicyRules = {
  minCooldownMinutes: 60,           // 1 hour cooldown
  maxRecipientsPerRun: 1000,        // Safety cap
  minRecipientsPerRun: 1,           // No empty runs
  highRiskRequiresOwner: true,      // Owner-only for high-risk
  requirePreviewBeforeExecute: true, // Must preview first
}

// Action-specific overrides
const ACTION_POLICY_OVERRIDES: Partial<Record<ActionId, Partial<PolicyRules>>> = {
  recover_abandoned: {
    minCooldownMinutes: 30,         // Cart recovery can run more frequently
  },
  send_promo: {
    minCooldownMinutes: 120,        // Promos need longer cooldown
    maxRecipientsPerRun: 500,       // Stricter cap for bulk promos
  },
}

// ============================================
// SERVICE INTERFACE
// ============================================

export interface TriggerPolicyInput {
  projectId: string
  actionId: ActionId
  actionRisk: ActionRisk
  recipientCountEstimate: number
  triggeredByRole: 'owner' | 'admin' | 'member'
  lastRunAt?: Date
}

export interface ExecutionPolicyInput {
  projectId: string
  actionId: ActionId
  actionRisk: ActionRisk
  recipientCountActual: number
  runId: string
}

// ============================================
// SERVICE IMPLEMENTATION
// ============================================

export class WorkflowPolicyService {
  private pool: Pool

  constructor() {
    this.pool = getPool()
  }

  /**
   * Get policy rules for an action (merges defaults with overrides).
   */
  private getRulesForAction(actionId: ActionId): PolicyRules {
    const overrides = ACTION_POLICY_OVERRIDES[actionId] || {}
    return { ...DEFAULT_POLICY_RULES, ...overrides }
  }

  /**
   * Evaluate policy at trigger-time (when user clicks button).
   * Fast feedback, may use cached/estimated data.
   */
  async evaluateTrigger(input: TriggerPolicyInput): Promise<PolicyDecision> {
    const rules = this.getRulesForAction(input.actionId)

    // 1. Check role requirements for high-risk actions
    if (rules.highRiskRequiresOwner && input.actionRisk === 'high') {
      if (input.triggeredByRole !== 'owner') {
        return {
          allowed: false,
          reason: 'workflows.policy.ownerRequired',
          reasonParams: { action: input.actionId },
        }
      }
    }

    // 2. Check recipient count bounds
    if (input.recipientCountEstimate < rules.minRecipientsPerRun) {
      return {
        allowed: false,
        reason: 'workflows.policy.noRecipients',
        reasonParams: { minCount: rules.minRecipientsPerRun },
      }
    }

    if (input.recipientCountEstimate > rules.maxRecipientsPerRun) {
      return {
        allowed: false,
        reason: 'workflows.policy.tooManyRecipients',
        reasonParams: {
          count: input.recipientCountEstimate,
          max: rules.maxRecipientsPerRun,
        },
      }
    }

    // 3. Check cooldown (if we have last run time)
    if (input.lastRunAt) {
      const cooldownMs = rules.minCooldownMinutes * 60 * 1000
      const timeSinceLastRun = Date.now() - input.lastRunAt.getTime()
      if (timeSinceLastRun < cooldownMs) {
        const remainingMinutes = Math.ceil((cooldownMs - timeSinceLastRun) / 60000)
        return {
          allowed: false,
          reason: 'workflows.policy.cooldownActive',
          reasonParams: { minutes: remainingMinutes },
        }
      }
    }

    // 4. Check database for recent runs (cooldown from DB)
    const lastRunFromDb = await this.getLastRunTime(input.projectId, input.actionId)
    if (lastRunFromDb && !input.lastRunAt) {
      const cooldownMs = rules.minCooldownMinutes * 60 * 1000
      const timeSinceLastRun = Date.now() - lastRunFromDb.getTime()
      if (timeSinceLastRun < cooldownMs) {
        const remainingMinutes = Math.ceil((cooldownMs - timeSinceLastRun) / 60000)
        return {
          allowed: false,
          reason: 'workflows.policy.cooldownActive',
          reasonParams: { minutes: remainingMinutes },
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Evaluate policy at execution-time (when worker is about to send).
   * Authoritative check with fresh data.
   *
   * TODO: Execution-time should re-enforce trigger-time rules for security:
   * - highRiskRequiresOwner (need to store triggered_by_role in workflow_runs)
   * - requirePreviewBeforeExecute (need to store previewed_at in workflow_runs)
   * - Cooldown re-check (currently only enforced at trigger-time)
   *
   * Current enforcement is NOT sufficient for adversarial actors who can
   * spoof trigger-time inputs or exploit race conditions.
   */
  async evaluateExecution(input: ExecutionPolicyInput): Promise<PolicyDecision> {
    const rules = this.getRulesForAction(input.actionId)

    // 1. Re-check recipient count (conditions may have changed)
    if (input.recipientCountActual < rules.minRecipientsPerRun) {
      return {
        allowed: false,
        reason: 'workflows.policy.noRecipients',
        reasonParams: { minCount: rules.minRecipientsPerRun },
      }
    }

    if (input.recipientCountActual > rules.maxRecipientsPerRun) {
      return {
        allowed: false,
        reason: 'workflows.policy.tooManyRecipients',
        reasonParams: {
          count: input.recipientCountActual,
          max: rules.maxRecipientsPerRun,
        },
      }
    }

    // 2. Check if another run started while we were waiting
    const conflictingRun = await this.checkForConflictingRun(
      input.projectId,
      input.actionId,
      input.runId
    )
    if (conflictingRun) {
      return {
        allowed: false,
        reason: 'workflows.policy.conflictingRun',
        reasonParams: { runId: conflictingRun },
      }
    }

    // 3. Re-check cooldown with fresh data from DB
    const lastRunTime = await this.getLastRunTime(input.projectId, input.actionId)
    if (lastRunTime) {
      const cooldownMs = rules.minCooldownMinutes * 60 * 1000
      const timeSinceLastRun = Date.now() - lastRunTime.getTime()
      if (timeSinceLastRun < cooldownMs) {
        const remainingMinutes = Math.ceil((cooldownMs - timeSinceLastRun) / 60000)
        return {
          allowed: false,
          reason: 'workflows.policy.cooldownActive',
          reasonParams: { minutes: remainingMinutes },
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Get last successful run time for an action.
   */
  private async getLastRunTime(
    projectId: string,
    actionId: ActionId
  ): Promise<Date | null> {
    const result = await this.pool.query(
      `
      SELECT completed_at
      FROM workflow_runs
      WHERE project_id = $1
        AND action_id = $2
        AND status = 'succeeded'
      ORDER BY completed_at DESC
      LIMIT 1
      `,
      [projectId, actionId]
    )

    if (result.rows.length === 0) return null
    return new Date(result.rows[0].completed_at)
  }

  /**
   * Check if there's another run in progress for the same action.
   */
  private async checkForConflictingRun(
    projectId: string,
    actionId: ActionId,
    excludeRunId: string
  ): Promise<string | null> {
    const result = await this.pool.query(
      `
      SELECT id
      FROM workflow_runs
      WHERE project_id = $1
        AND action_id = $2
        AND id != $3
        AND status IN ('queued', 'running')
      LIMIT 1
      `,
      [projectId, actionId, excludeRunId]
    )

    if (result.rows.length === 0) return null
    return result.rows[0].id
  }

  /**
   * Get last run info for action card display.
   */
  async getLastRunInfo(
    projectId: string,
    actionId: ActionId
  ): Promise<{
    runId: string
    status: string
    completedAt: Date
    recipientCount: number
  } | null> {
    const result = await this.pool.query(
      `
      SELECT id, status, completed_at, (result->>'totalRecipients')::int as recipient_count
      FROM workflow_runs
      WHERE project_id = $1
        AND action_id = $2
        AND status IN ('succeeded', 'failed')
      ORDER BY completed_at DESC
      LIMIT 1
      `,
      [projectId, actionId]
    )

    if (result.rows.length === 0) return null
    const row = result.rows[0]
    return {
      runId: row.id,
      status: row.status,
      completedAt: new Date(row.completed_at),
      recipientCount: row.recipient_count || 0,
    }
  }
}

// Singleton instance
let workflowPolicyServiceInstance: WorkflowPolicyService | null = null

export function getWorkflowPolicyService(): WorkflowPolicyService {
  if (!workflowPolicyServiceInstance) {
    workflowPolicyServiceInstance = new WorkflowPolicyService()
  }
  return workflowPolicyServiceInstance
}
