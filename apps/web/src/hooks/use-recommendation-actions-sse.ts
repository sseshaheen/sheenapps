/**
 * Recommendation Actions Processor
 *
 * EXPERT FIX ROUND 3: Pure processor that accepts liveMessages as input.
 * Does NOT mount usePersistentLive (prevents duplicate SSE subscriptions).
 *
 * Architecture:
 * - Receives liveMessages from usePersistentChat (single SSE source)
 * - Deduplicates with SSE dedupe store
 * - Updates chatActionsStore on message confirmation
 * - Updates buildTrackingStore when builds start
 * - Parallel to React Query (doesn't interfere with existing chat)
 */

'use client'

import { useEffect } from 'react'
import { useChatActionsStore } from '@/store/chat-actions-store'
import { useBuildTrackingStore } from '@/store/build-tracking-store'
import { useSSEDedupeStore } from '@/store/sse-dedupe-store'
import type { PersistentChatMessage } from '@/services/persistent-chat-client'

interface UseRecommendationActionsProcessorOptions {
  projectId: string
  enabled?: boolean
  liveMessages: PersistentChatMessage[]  // EXPERT FIX: Accept as input, don't mount usePersistentLive
  // EXPERT FIX ROUND 5: Optional build status to enable build_tracking → done transition
  activeBuildId?: string
  activeBuildStatus?: 'queued' | 'running' | 'completed' | 'failed'
}

/**
 * Pure processor to sync SSE events with Zustand stores for recommendation actions
 *
 * EXPERT FIX ROUND 3: Accepts liveMessages as prop to avoid mounting usePersistentLive twice.
 * Call from UnifiedChatContainer after usePersistentChat.
 */
export function useRecommendationActionsProcessor({
  projectId,
  enabled = true,
  liveMessages,
  activeBuildId,
  activeBuildStatus
}: UseRecommendationActionsProcessorOptions) {
  // EXPERT FIX ROUND 3: No usePersistentLive call here - liveMessages passed as prop

  // EXPERT FIX ROUND 3: Removed lastProcessedSeqRef - it contradicted the reorder window
  // Trust the dedupe store entirely (it has lastSeq + reorder window + LRU cap)

  useEffect(() => {
    if (!enabled || !projectId) return

    // Process each live message - dedupe store handles reordering + duplicates
    for (const message of liveMessages) {
      const seq = message.seq ?? 0

      // CRITICAL: Dedupe check (prevent processing same message twice)
      // This respects the REORDER_WINDOW (10 seq) for late arrivals
      const shouldProcess = useSSEDedupeStore.getState().shouldProcess(
        projectId,
        seq,
        message.id
      )

      if (!shouldProcess) {
        // Already processed or too old (by dedupe store with reorder window)
        continue
      }

      // Mark as processed (updates lastSeq + LRU)
      useSSEDedupeStore.getState().markProcessed(projectId, seq, message.id)

      // Only process messages with client_msg_id (correlation ID)
      if (!message.client_msg_id) {
        continue  // EXPERT FIX: continue (not return) - return exits entire effect!
      }

      // Check if we're tracking this action
      const action = useChatActionsStore.getState().getAction(projectId, message.client_msg_id)
      if (!action) {
        // Not a recommendation action, skip
        continue  // EXPERT FIX: continue (not return) - return exits entire effect!
      }

      // Update action based on message type
      if (message.message_type === 'user') {
        // User message confirmed by backend
        if (action.state === 'sending' || action.state === 'sent') {
          useChatActionsStore.getState().updateAction(projectId, message.client_msg_id, {
            state: 'confirmed',
            timestamps: { confirmed: Date.now() }
          })
        }
      } else if (message.message_type === 'assistant') {
        // Assistant response received
        if (action.state !== 'done' && action.state !== 'error') {
          useChatActionsStore.getState().updateAction(projectId, message.client_msg_id, {
            state: 'assistant_received',
            timestamps: { completed: Date.now() }
          })

          // CRITICAL: Check for build_id (backend sends this in response_data)
          // Field priority: response_data.buildId > response_data.build_id > response_data.metadata.buildId
          const buildId =
            (message.response_data as any)?.buildId ||
            (message.response_data as any)?.build_id ||
            (message.response_data as any)?.metadata?.buildId

          if (buildId) {
            // Build started! Transition to build_tracking state
            useChatActionsStore.getState().updateAction(projectId, message.client_msg_id, {
              state: 'build_tracking',
              metadata: { buildId }
            })

            // Add to build tracking store
            useBuildTrackingStore.getState().setBuild({
              buildId,
              status: 'pending',
              startedAt: Date.now()
            })
          } else {
            // No build, mark as done
            useChatActionsStore.getState().updateAction(projectId, message.client_msg_id, {
              state: 'done'
            })
          }
        }
      }
    }
  }, [liveMessages, projectId, enabled])

  // EXPERT FIX ROUND 5: Watch for build completion and transition build_tracking → done
  useEffect(() => {
    if (!enabled || !projectId || !activeBuildId || !activeBuildStatus) return

    // Only process completed or failed builds
    if (activeBuildStatus !== 'completed' && activeBuildStatus !== 'failed') return

    // Update buildTrackingStore first
    const buildTracking = useBuildTrackingStore.getState().getBuild(activeBuildId)
    if (buildTracking && buildTracking.status !== activeBuildStatus) {
      useBuildTrackingStore.getState().updateBuild(activeBuildId, {
        status: activeBuildStatus,
        completedAt: Date.now(),
        ...(activeBuildStatus === 'failed' ? { error: 'Build failed' } : {})
      })
    }

    // Find all chat actions tracking this buildId and transition to done/error
    const allActions = useChatActionsStore.getState().actions[projectId] || {}
    for (const [clientMsgId, action] of Object.entries(allActions)) {
      if (action.state === 'build_tracking' && action.metadata.buildId === activeBuildId) {
        useChatActionsStore.getState().updateAction(projectId, clientMsgId, {
          state: activeBuildStatus === 'completed' ? 'done' : 'error',
          metadata: {
            ...(activeBuildStatus === 'failed' ? { error: 'Build failed' } : {})
          },
          timestamps: { completed: Date.now() }
        })
      }
    }
  }, [enabled, projectId, activeBuildId, activeBuildStatus])

  // No return value - this is a side-effect hook
}
