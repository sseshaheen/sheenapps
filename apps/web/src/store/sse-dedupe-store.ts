/**
 * SSE Dedupe Store
 *
 * Prevents duplicate SSE message processing with two-layer defense:
 * 1. Primary: lastSeq per project (monotonic sequence check)
 * 2. Safety: LRU recentMessageIds (handles out-of-order delivery)
 *
 * CRITICAL Production Fixes Applied:
 * - Round 2: Per-project scope (not global Set that grows forever)
 * - Round 2: 500-item LRU cap (memory-bounded)
 * - Round 4: Removed redundant seenSeqs Set
 * - Round 6: Reorder window (10 seq) for defensive hardening
 */

'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// ========================================
// Types & Interfaces
// ========================================

export interface SSEDedupeStore {
  // Primary dedupe: last processed seq per project
  lastSeq: Record<string, number>  // projectId → seq

  // Safety net: LRU of recent message IDs (handles out-of-order, duplicates)
  recentMessageIds: Record<string, string[]>  // projectId → messageIds (LRU-ordered)

  // Methods
  shouldProcess: (projectId: string, seq: number, messageId: string) => boolean
  markProcessed: (projectId: string, seq: number, messageId: string) => void
  reset: (projectId: string) => void
}

// Constants
const LRU_CAPACITY = 500  // Max message IDs to remember per project
const REORDER_WINDOW = 10  // Allow messages up to 10 seq behind current

// ========================================
// Store Implementation
// ========================================

export const useSSEDedupeStore = create<SSEDedupeStore>()(
  devtools(
    (set, get) => ({
      lastSeq: {},
      recentMessageIds: {},

      /**
       * Check if message should be processed
       *
       * Returns true if:
       * - seq > lastSeq (new message)
       * - seq within REORDER_WINDOW and not in LRU (reordered message)
       *
       * Returns false if:
       * - seq too old (beyond reorder window)
       * - messageId already in LRU (duplicate)
       */
      shouldProcess: (projectId, seq, messageId) => {
        const state = get()
        const lastSeq = state.lastSeq[projectId] || 0
        const recentIds = state.recentMessageIds[projectId] || []

        // CRITICAL: Allow small reorder window for defensive hardening (Round 6 fix)
        // Messages can arrive slightly out of order in rare cases (CDN, load balancers)
        const isInReorderWindow = seq > lastSeq - REORDER_WINDOW && seq <= lastSeq
        const isFutureMessage = seq > lastSeq

        // Reject if too old (beyond reorder window)
        if (!isFutureMessage && !isInReorderWindow) {
          console.log('[SSEDedupe] Rejecting old message:', {
            projectId,
            seq,
            lastSeq,
            reason: 'too old'
          })
          return false
        }

        // Safety net: Check LRU for duplicates (handles both future and reordered)
        if (recentIds.includes(messageId)) {
          console.log('[SSEDedupe] Rejecting duplicate:', {
            projectId,
            messageId,
            seq,
            reason: 'already processed'
          })
          return false
        }

        return true
      },

      /**
       * Mark message as processed
       * Updates lastSeq (if newer) and adds to LRU
       */
      markProcessed: (projectId, seq, messageId) => set(state => {
        const currentLastSeq = state.lastSeq[projectId] || 0
        const currentRecentIds = state.recentMessageIds[projectId] || []

        // Update lastSeq (only if seq is newer)
        const newLastSeq = Math.max(currentLastSeq, seq)

        // Add to LRU (prepend to array)
        const newRecentIds = [messageId, ...currentRecentIds]

        // Cap LRU to prevent unbounded growth
        if (newRecentIds.length > LRU_CAPACITY) {
          newRecentIds.length = LRU_CAPACITY
        }

        return {
          lastSeq: {
            ...state.lastSeq,
            [projectId]: newLastSeq
          },
          recentMessageIds: {
            ...state.recentMessageIds,
            [projectId]: newRecentIds
          }
        }
      }),

      /**
       * Reset dedupe state for a project
       * Useful for reconnection scenarios
       */
      reset: (projectId) => set(state => {
        const { [projectId]: _, ...remainingSeq } = state.lastSeq
        const { [projectId]: __, ...remainingIds } = state.recentMessageIds

        return {
          lastSeq: remainingSeq,
          recentMessageIds: remainingIds
        }
      })
    }),
    { name: 'SSEDedupeStore' }
  )
)
