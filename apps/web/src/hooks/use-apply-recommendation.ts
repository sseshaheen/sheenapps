/**
 * Apply Recommendation Hook (Adapter Pattern)
 *
 * Wraps the existing sendMessageMutation from usePersistentChat
 * with Zustand orchestration for recommendation click tracking.
 *
 * Architecture:
 * - Zustand stores: Track recommendation action lifecycle
 * - React Query mutation: Handle actual API call (retry logic, error handling)
 * - SSE listener: Update stores on message confirmation (separate hook)
 *
 * This keeps the existing React Query infrastructure working while adding
 * production-grade state management for recommendations.
 */

'use client'

import { useCallback } from 'react'
import { useChatActionsStore } from '@/store/chat-actions-store'
import { type ProjectRecommendation } from '@/types/project-recommendations'

// EXPERT FIX ROUND 6: Tighter type signature for sendMessage
export type SendMessageFunction = (
  text: string,
  target: 'team' | 'ai',
  messageType: 'user' | 'assistant',
  buildImmediately?: boolean,
  clientMsgId?: string
) => Promise<void>

interface UseApplyRecommendationOptions {
  projectId: string
  userId: string
  sendMessage: SendMessageFunction  // EXPERT FIX ROUND 6: Required (no fallback)
  onSuccess?: (clientMsgId: string) => void
  onError?: (error: Error, clientMsgId: string) => void
}

interface ApplyRecommendationResult {
  applyRecommendation: (recommendation: ProjectRecommendation) => Promise<void>
  retryRecommendation: (recommendationId: string) => Promise<void>
  isApplying: (recommendationId: string) => boolean
  getError: (recommendationId: string) => string | undefined
}

/**
 * Hook for applying recommendations with full lifecycle tracking
 *
 * EXPERT FIX ROUND 6: sendMessage is now REQUIRED (no fallback).
 * This prevents accidental duplicate usePersistentChat initialization.
 * Components must pass sendMessage from their parent chat context.
 */
export function useApplyRecommendation({
  projectId,
  userId,
  sendMessage,
  onSuccess,
  onError
}: UseApplyRecommendationOptions): ApplyRecommendationResult {
  // EXPERT FIX ROUND 6: No fallback - sendMessage must be provided by caller
  // This prevents duplicate chat/SSE stacks from ever being created

  /**
   * Apply a recommendation
   * Orchestrates: Zustand state → React Query mutation → SSE updates
   */
  const applyRecommendation = useCallback(
    async (recommendation: ProjectRecommendation) => {
      // Generate stable client_msg_id for idempotency
      const clientMsgId = crypto.randomUUID()

      // Convert recommendation.id to string for storage
      const recommendationIdStr = String(recommendation.id)

      // Prepare message payload
      const messageText = `Apply recommendation: ${recommendation.title}`
      const payload = {
        text: messageText,
        mode: 'build' as const,
        recommendation_id: recommendationIdStr
      }

      try {
        // 1. CRITICAL: Update Zustand BEFORE mutation (optimistic state)
        useChatActionsStore.getState().setAction(projectId, {
          client_msg_id: clientMsgId,
          state: 'sending',
          metadata: {
            recommendation_id: recommendationIdStr,
            payload // Store for potential retry
          },
          timestamps: {
            initiated: Date.now()
          }
        })

        // 2. Delegate to React Query mutation (reuses retry, error handling, optimistic updates)
        // EXPERT FIX: Pass client_msg_id for correlation (critical for state machine transitions)
        await sendMessage(
          messageText,
          'ai',           // target
          'user',         // messageType
          true,           // buildImmediately (recommendation always triggers build)
          clientMsgId     // EXPERT FIX: Thread client_msg_id so SSE can correlate
        )

        // 3. Update state to 'sent' (POST succeeded, waiting for SSE confirmation)
        // EXPERT FIX ROUND 7: Only update to 'sent' if still 'sending' (race condition guard)
        // SSE might have already confirmed while we were waiting for sendMessage to return
        const current = useChatActionsStore.getState().getAction(projectId, clientMsgId)
        if (current?.state === 'sending') {
          useChatActionsStore.getState().updateAction(projectId, clientMsgId, {
            state: 'sent',
            timestamps: { sent: Date.now() }
          })
        }

        // 4. Callback on success
        onSuccess?.(clientMsgId)

        // Note: Further updates happen via SSE listener hook (use-recommendation-actions-sse)
        // SSE will transition: sent → confirmed → assistant_received → build_tracking → done
      } catch (error) {
        // 5. Update state to 'error' on failure
        useChatActionsStore.getState().updateAction(projectId, clientMsgId, {
          state: 'error',
          metadata: {
            error: error instanceof Error ? error.message : 'Failed to send message'
          },
          timestamps: { completed: Date.now() }
        })

        // 6. Callback on error
        onError?.(error instanceof Error ? error : new Error('Unknown error'), clientMsgId)

        throw error
      }
    },
    [projectId, userId, sendMessage, onSuccess, onError]
  )

  /**
   * Retry a failed recommendation
   * EXPERT FIX ROUND 4: Reuses original client_msg_id for true idempotency
   * If the first request actually succeeded but client thought it failed,
   * backend can deduplicate via same client_msg_id
   */
  const retryRecommendation = useCallback(
    async (recommendationId: string) => {
      // Look up the existing action
      const existingAction = useChatActionsStore
        .getState()
        .getActionByRecommendation(projectId, recommendationId)

      if (!existingAction) {
        throw new Error(`No existing action found for recommendation ${recommendationId}`)
      }

      if (existingAction.state !== 'error') {
        throw new Error(`Can only retry failed actions (current state: ${existingAction.state})`)
      }

      // CRITICAL: Reuse the SAME client_msg_id (true idempotency)
      const clientMsgId = existingAction.client_msg_id

      // Pull the stored payload
      const payload = existingAction.metadata.payload
      if (!payload) {
        throw new Error('No payload found in action metadata')
      }

      try {
        // 1. Reset state to 'sending' (reusing same client_msg_id)
        useChatActionsStore.getState().updateAction(projectId, clientMsgId, {
          state: 'sending',
          metadata: {
            error: undefined // Clear previous error
          },
          timestamps: {
            initiated: Date.now()
          }
        })

        // 2. Resend with SAME client_msg_id
        await sendMessage(
          payload.text,
          'ai',
          'user',
          true,
          clientMsgId  // CRITICAL: Same ID for idempotency
        )

        // 3. Update state to 'sent'
        // EXPERT FIX ROUND 7: Only update to 'sent' if still 'sending' (race condition guard)
        const current = useChatActionsStore.getState().getAction(projectId, clientMsgId)
        if (current?.state === 'sending') {
          useChatActionsStore.getState().updateAction(projectId, clientMsgId, {
            state: 'sent',
            timestamps: { sent: Date.now() }
          })
        }

        // 4. Callback on success
        onSuccess?.(clientMsgId)
      } catch (error) {
        // 5. Update state to 'error' on failure
        useChatActionsStore.getState().updateAction(projectId, clientMsgId, {
          state: 'error',
          metadata: {
            error: error instanceof Error ? error.message : 'Failed to send message'
          },
          timestamps: { completed: Date.now() }
        })

        // 6. Callback on error
        onError?.(error instanceof Error ? error : new Error('Unknown error'), clientMsgId)

        throw error
      }
    },
    [projectId, sendMessage, onSuccess, onError]
  )

  /**
   * Check if a recommendation is currently being applied
   */
  const isApplying = useCallback(
    (recommendationId: string) => {
      const action = useChatActionsStore
        .getState()
        .getActionByRecommendation(projectId, recommendationId)

      if (!action) return false

      // Consider 'applying' if not done/error
      return !['done', 'error'].includes(action.state)
    },
    [projectId]
  )

  /**
   * Get error message for a recommendation (if any)
   */
  const getError = useCallback(
    (recommendationId: string) => {
      const action = useChatActionsStore
        .getState()
        .getActionByRecommendation(projectId, recommendationId)

      return action?.metadata?.error
    },
    [projectId]
  )

  return {
    applyRecommendation,
    retryRecommendation,
    isApplying,
    getError
  }
}
