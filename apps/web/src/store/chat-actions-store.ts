/**
 * Chat Actions Store
 *
 * Tracks the lifecycle of recommendation-triggered chat actions.
 * Keyed by client_msg_id for proper correlation across SSE, POST, and UI.
 *
 * State Machine:
 * sending → sent → confirmed → assistant_received → build_tracking → done | error
 *
 * CRITICAL Production Fixes Applied:
 * - Round 4: Record-based (not Map) for JSON serialization
 * - Round 4: O(1) recommendationIndex (not O(n) scan)
 * - Round 4: Deep merge for nested updates
 * - Round 6: Index NOT persisted (rebuilt on rehydrate)
 * - Round 6: Recommendation ID immutability
 */

'use client'

import { create } from 'zustand'
import { persist, devtools } from 'zustand/middleware'

// ========================================
// Types & Interfaces
// ========================================

export type ChatActionState =
  | 'sending'              // Initial state, POST in flight
  | 'sent'                 // POST succeeded, waiting for SSE confirmation
  | 'confirmed'            // User message confirmed via SSE
  | 'assistant_received'   // Assistant response received
  | 'build_tracking'       // Build started, tracking progress
  | 'done'                 // Completed successfully
  | 'error'                // Failed at any stage

export interface ChatAction {
  client_msg_id: string  // PRIMARY KEY
  state: ChatActionState
  metadata: {
    recommendation_id?: string  // NOT the key, just metadata
    buildId?: string
    versionId?: string
    jobId?: string
    error?: string
    // Store payload for retry (so retry uses SAME client_msg_id)
    payload?: {
      text: string
      mode: string
      recommendation_id?: string
    }
  }
  timestamps: {
    initiated: number
    sent?: number
    confirmed?: number
    completed?: number
  }
}

// Helper type for partial updates (nested objects can be partial)
export type ChatActionUpdate = Partial<Omit<ChatAction, 'timestamps' | 'metadata'>> & {
  timestamps?: Partial<ChatAction['timestamps']>
  metadata?: Partial<ChatAction['metadata']>
}

export interface ChatActionsStore {
  // Record (plain object) not Map for JSON serialization
  actions: Record<string, Record<string, ChatAction>>  // projectId → (client_msg_id → ChatAction)

  // O(1) recommendation lookup index (NOT persisted - rebuilt from actions)
  recommendationIndex: Record<string, Record<string, string>>  // projectId → (recommendation_id → client_msg_id)

  // Getters
  getAction: (projectId: string, clientMsgId: string) => ChatAction | undefined
  getActionByRecommendation: (projectId: string, recommendationId: string) => ChatAction | undefined

  // Setters
  setAction: (projectId: string, action: ChatAction) => void
  updateAction: (projectId: string, clientMsgId: string, updates: ChatActionUpdate) => void

  // Cleanup
  clearProject: (projectId: string) => void
  cleanup: (projectId: string, maxAgeMs: number) => void

  // Index management
  rebuildIndex: () => void
}

// ========================================
// Helper: Deep Merge
// ========================================

/**
 * Deep merge for ChatAction updates
 * Handles nested metadata and timestamps properly
 */
function deepMergeChatAction(target: ChatAction, source: ChatActionUpdate): ChatAction {
  const result: ChatAction = { ...target }

  // Merge top-level properties
  if (source.state !== undefined) result.state = source.state
  if (source.client_msg_id !== undefined) result.client_msg_id = source.client_msg_id

  // Deep merge metadata
  if (source.metadata) {
    result.metadata = {
      ...target.metadata,
      ...source.metadata
    }
  }

  // Deep merge timestamps
  if (source.timestamps) {
    result.timestamps = {
      ...target.timestamps,
      ...source.timestamps
    }
  }

  return result
}

// ========================================
// Store Implementation
// ========================================

export const useChatActionsStore = create<ChatActionsStore>()(
  devtools(
    persist(
      (set, get) => ({
        actions: {},
        recommendationIndex: {},

        // Get action by client_msg_id
        getAction: (projectId, clientMsgId) => {
          return get().actions[projectId]?.[clientMsgId]
        },

        // Get action by recommendation_id (O(1) lookup via index)
        getActionByRecommendation: (projectId, recommendationId) => {
          const clientMsgId = get().recommendationIndex[projectId]?.[recommendationId]
          if (!clientMsgId) return undefined
          return get().actions[projectId]?.[clientMsgId]
        },

        // Set action (create new)
        setAction: (projectId, action) => set(state => {
          const projectActions = state.actions[projectId] || {}
          const projectIndex = state.recommendationIndex[projectId] || {}

          // Update index if this action is for a recommendation
          const newIndex = action.metadata.recommendation_id
            ? { ...projectIndex, [action.metadata.recommendation_id]: action.client_msg_id }
            : projectIndex

          return {
            actions: {
              ...state.actions,
              [projectId]: {
                ...projectActions,
                [action.client_msg_id]: action
              }
            },
            recommendationIndex: {
              ...state.recommendationIndex,
              [projectId]: newIndex
            }
          }
        }),

        // Update action (partial update with deep merge)
        updateAction: (projectId, clientMsgId, updates) => set(state => {
          const projectActions = state.actions[projectId]
          if (!projectActions) return state

          const existing = projectActions[clientMsgId]
          if (!existing) return state

          // CRITICAL: Enforce recommendation_id immutability
          if (
            updates.metadata?.recommendation_id &&
            existing.metadata.recommendation_id &&
            updates.metadata.recommendation_id !== existing.metadata.recommendation_id
          ) {
            console.error('[ChatActionsStore] Cannot change recommendation_id after creation:', {
              existing: existing.metadata.recommendation_id,
              attempted: updates.metadata.recommendation_id
            })
            throw new Error('recommendation_id is immutable after creation')
          }

          // Deep merge nested objects
          const updated = deepMergeChatAction(existing, updates)

          // If recommendation_id changed (was undefined, now defined), update index
          const oldRecId = existing.metadata.recommendation_id
          const newRecId = updated.metadata.recommendation_id
          let newIndex = state.recommendationIndex

          if (newRecId && !oldRecId) {
            // New recommendation_id added - update index
            newIndex = {
              ...state.recommendationIndex,
              [projectId]: {
                ...(state.recommendationIndex[projectId] || {}),
                [newRecId]: clientMsgId
              }
            }
          }

          return {
            actions: {
              ...state.actions,
              [projectId]: {
                ...projectActions,
                [clientMsgId]: updated
              }
            },
            recommendationIndex: newIndex
          }
        }),

        // Clear all actions for a project
        clearProject: (projectId) => set(state => {
          const { [projectId]: _, ...remainingActions } = state.actions
          const { [projectId]: __, ...remainingIndex } = state.recommendationIndex

          return {
            actions: remainingActions,
            recommendationIndex: remainingIndex
          }
        }),

        // Cleanup stale actions (TTL-based)
        cleanup: (projectId, maxAgeMs) => set(state => {
          const projectActions = state.actions[projectId]
          if (!projectActions) return state

          const now = Date.now()
          const cleaned: Record<string, ChatAction> = {}

          for (const [clientMsgId, action] of Object.entries(projectActions)) {
            const age = now - action.timestamps.initiated

            // Keep if fresh OR if completed/errored (for history)
            if (age < maxAgeMs || action.state === 'done' || action.state === 'error') {
              cleaned[clientMsgId] = action
            }
          }

          // EXPERT FIX: Rebuild index in same transaction (don't call get().rebuildIndex())
          // Compute new actions first
          const newActions = {
            ...state.actions,
            [projectId]: cleaned
          }

          // Then rebuild index from new actions (single transaction)
          const newIndex: Record<string, Record<string, string>> = {}
          for (const [pid, actions] of Object.entries(newActions)) {
            newIndex[pid] = {}
            for (const [clientMsgId, action] of Object.entries(actions)) {
              if (action.metadata.recommendation_id) {
                newIndex[pid][action.metadata.recommendation_id] = clientMsgId
              }
            }
          }

          return {
            actions: newActions,
            recommendationIndex: newIndex
          }
        }),

        // Rebuild recommendation index from actions (NOT persisted)
        rebuildIndex: () => set(state => {
          const newIndex: Record<string, Record<string, string>> = {}

          for (const [projectId, projectActions] of Object.entries(state.actions)) {
            newIndex[projectId] = {}

            for (const [clientMsgId, action] of Object.entries(projectActions)) {
              if (action.metadata.recommendation_id) {
                newIndex[projectId][action.metadata.recommendation_id] = clientMsgId
              }
            }
          }

          return { recommendationIndex: newIndex }
        })
      }),
      {
        name: 'chat-actions',
        // CRITICAL: Don't persist recommendationIndex (Round 6 fix)
        partialize: (state) => ({
          actions: Object.fromEntries(
            Object.entries(state.actions).map(([projectId, actions]) => [
              projectId,
              // Filter out done/error states to reduce storage
              Object.fromEntries(
                Object.entries(actions).filter(([_, action]) =>
                  action.state !== 'done' && action.state !== 'error'
                )
              )
            ])
          )
          // recommendationIndex intentionally NOT persisted - rebuilt from actions
        }),
        // Cleanup stale actions on rehydrate
        onRehydrateStorage: () => (state) => {
          if (state) {
            const TTL = 60 * 60 * 1000 // 1 hour

            // Cleanup each project
            Object.keys(state.actions).forEach(projectId => {
              state.cleanup(projectId, TTL)
            })

            // Rebuild index from actions (CRITICAL: index not persisted)
            state.rebuildIndex()
          }
        }
      }
    ),
    { name: 'ChatActionsStore' }
  )
)
