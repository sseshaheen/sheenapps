/**
 * Workflow run creation utility
 *
 * Centralizes workflow run creation logic with proper idempotency.
 */

"use client"

export interface CreateWorkflowRunInput {
  projectId: string
  actionId: string
  params?: Record<string, unknown>
  recipientCountEstimate?: number
  idempotencyKey?: string // Optional: caller can provide to prevent double-submission
  testMode?: boolean // Send only to the test recipient
  testRecipientEmail?: string // Email to send test to (required if testMode=true)
}

export interface CreateWorkflowRunResult {
  runId: string
  status: string
  deduplicated: boolean
}

/**
 * Creates a workflow run with automatic idempotency key generation.
 *
 * @example
 * try {
 *   const result = await createWorkflowRun({
 *     projectId,
 *     actionId: 'send_promo',
 *     params: { segmentation: 'recent_30d' },
 *     recipientCountEstimate: preview.count
 *   })
 *   if (result.deduplicated) {
 *     toast.info('Workflow already running')
 *   } else {
 *     toast.success('Workflow started')
 *   }
 * } catch (error) {
 *   toast.error(error.message)
 * }
 */
/**
 * Generate a UUID with fallback for older environments
 */
function generateUUID(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function createWorkflowRun(
  input: CreateWorkflowRunInput
): Promise<CreateWorkflowRunResult> {
  // Use provided key or generate new one (caller should generate once per modal session)
  const idempotencyKey = input.idempotencyKey ?? generateUUID()

  const res = await fetch(`/api/projects/${input.projectId}/run/workflow-runs`, {
    method: 'POST',
    credentials: 'include', // Explicit cookie auth
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actionId: input.actionId,
      idempotencyKey,
      clientRequestedAt: new Date().toISOString(),
      params: input.params,
      recipientCountEstimate: input.recipientCountEstimate,
      testMode: input.testMode,
      testRecipientEmail: input.testRecipientEmail,
    }),
  })

  const json = await res.json().catch(() => null)

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error?.message || 'Failed to start workflow')
  }

  return json.data as CreateWorkflowRunResult
}
