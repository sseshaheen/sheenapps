/**
 * Build Tracking Store
 *
 * Tracks build status for recommendation-triggered builds.
 * Keyed by buildId (NOT client_msg_id or operationId).
 *
 * CRITICAL Production Fixes Applied:
 * - Round 6: Persist with TTL cleanup (refresh mid-build preserves state)
 * - Keeps completed/failed builds for history
 * - Removes stale in-progress builds after 1 hour
 */

'use client'

import { create } from 'zustand'
import { persist, devtools } from 'zustand/middleware'

// ========================================
// Types & Interfaces
// ========================================

export type BuildStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface BuildTracking {
  buildId: string
  status: BuildStatus
  startedAt: number
  completedAt?: number
  progress?: {
    step: number
    total: number
  }
  error?: string
}

export interface BuildTrackingStore {
  // Record-based: buildId → BuildTracking
  builds: Record<string, BuildTracking>

  // Getters
  getBuild: (buildId: string) => BuildTracking | undefined

  // Setters
  setBuild: (build: BuildTracking) => void
  updateBuild: (buildId: string, updates: Partial<BuildTracking>) => void

  // Cleanup
  cleanup: (maxAgeMs: number) => void
}

// ========================================
// Store Implementation
// ========================================

export const useBuildTrackingStore = create<BuildTrackingStore>()(
  devtools(
    persist(
      (set, get) => ({
        builds: {},

        // Get build by buildId
        getBuild: (buildId) => {
          return get().builds[buildId]
        },

        // Set build (create new)
        setBuild: (build) => set(state => ({
          builds: {
            ...state.builds,
            [build.buildId]: build
          }
        })),

        // Update build (partial update)
        updateBuild: (buildId, updates) => set(state => {
          const existing = state.builds[buildId]
          if (!existing) {
            console.warn('[BuildTrackingStore] Build not found:', buildId)
            return state
          }

          return {
            builds: {
              ...state.builds,
              [buildId]: {
                ...existing,
                ...updates
              }
            }
          }
        }),

        // TTL cleanup for stale builds
        cleanup: (maxAgeMs) => set(state => {
          const now = Date.now()
          const cleaned: Record<string, BuildTracking> = {}

          for (const [buildId, build] of Object.entries(state.builds)) {
            const age = now - build.startedAt

            // Keep if:
            // 1. Fresh (age < maxAge)
            // 2. Completed/failed (keep for history regardless of age)
            if (age < maxAgeMs || build.status === 'completed' || build.status === 'failed') {
              cleaned[buildId] = build
            }
          }

          return { builds: cleaned }
        })
      }),
      {
        name: 'build-tracking',
        // Cleanup stale builds on rehydrate
        onRehydrateStorage: () => (state) => {
          if (state) {
            const ONE_HOUR = 60 * 60 * 1000
            state.cleanup(ONE_HOUR)
          }
        }
      }
    ),
    { name: 'BuildTrackingStore' }
  )
)
