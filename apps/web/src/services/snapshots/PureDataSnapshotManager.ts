/**
 * Pure Data Snapshot Manager - Sprint 3 Implementation
 * Expert requirement: "Optimize snapshot creation (Immer patches)"
 */

import { produce, enablePatches, applyPatches, Patch } from 'immer'
import type { SectionState, Layout, Snapshot } from '@/store/builder-store'
import { events } from '@/utils/event-logger'

// Enable Immer patches for optimal snapshots
enablePatches()

export interface OptimizedSnapshot extends Snapshot {
  // Additional optimization metadata
  patches?: Patch[]
  inversePatches?: Patch[]
  sizeEstimate: number
  compressionRatio?: number
  sectionsModified: string[]
  changeType: 'create' | 'update' | 'delete' | 'reorder'
}

export interface SnapshotCreationOptions {
  /** Include patches for optimal undo/redo */
  includePatch?: boolean
  
  /** Compress unchanged sections */
  compressUnchanged?: boolean
  
  /** Maximum size before compression */
  maxSizeBytes?: number
  
  /** Deep clone vs shallow references */
  deepClone?: boolean
}

export interface SnapshotMetrics {
  totalSnapshots: number
  averageSize: number
  compressionRatio: number
  memoryUsage: number
  patchesUsed: number
  performanceMs: number
}

/**
 * Pure Data Snapshot Manager
 * 
 * Creates optimized snapshots for history tracking without DOM dependencies.
 * Uses Immer patches for minimal memory usage and fast restoration.
 */
export class PureDataSnapshotManager {
  private snapshots: Map<string, OptimizedSnapshot> = new Map()
  private metrics: SnapshotMetrics = {
    totalSnapshots: 0,
    averageSize: 0,
    compressionRatio: 1,
    memoryUsage: 0,
    patchesUsed: 0,
    performanceMs: 0
  }

  /**
   * Create optimized snapshot with Immer patches
   * Expert requirement: "Optimize snapshot creation"
   */
  public createSnapshot(
    currentSections: Record<string, SectionState>,
    previousSections: Record<string, SectionState> | null,
    userAction: string,
    layoutId: string,
    options: SnapshotCreationOptions = {}
  ): OptimizedSnapshot {
    const startTime = performance.now()

    const {
      includePatch = true,
      compressUnchanged = true,
      maxSizeBytes = 100 * 1024, // 100KB default
      deepClone = false
    } = options

    // Generate unique snapshot ID
    const snapshotId = this.generateSnapshotId()

    // Detect what changed
    const sectionsModified = this.detectModifiedSections(currentSections, previousSections)
    const changeType = this.detectChangeType(currentSections, previousSections, sectionsModified)

    // Create base snapshot
    let snapshot: OptimizedSnapshot = {
      id: snapshotId,
      timestamp: Date.now(),
      userAction,
      layoutId,
      sectionsState: deepClone ? this.deepCloneSections(currentSections) : { ...currentSections },
      sizeEstimate: 0,
      sectionsModified,
      changeType
    }

    // Add Immer patches if requested and we have previous state
    if (includePatch && previousSections) {
      const { patches, inversePatches } = this.createImmerPatches(previousSections, currentSections)
      snapshot.patches = patches
      snapshot.inversePatches = inversePatches
      this.metrics.patchesUsed++
    }

    // Compress if needed
    if (compressUnchanged && sectionsModified.length < Object.keys(currentSections).length / 2) {
      snapshot = this.compressSnapshot(snapshot, sectionsModified)
    }

    // Calculate size estimate
    snapshot.sizeEstimate = this.estimateSnapshotSize(snapshot)

    // Store snapshot
    this.snapshots.set(snapshotId, snapshot)

    // Update metrics
    this.updateMetrics(snapshot, performance.now() - startTime)

    // Emit analytics event
    events.emit('snapshot:created', {
      snapshotId,
      sizeEstimate: snapshot.sizeEstimate,
      sectionsModified: sectionsModified.length,
      changeType,
      patches: !!snapshot.patches,
      timestamp: Date.now()
    })

    return snapshot
  }

  /**
   * Restore state from optimized snapshot
   * Uses patches for efficient restoration when available
   */
  public restoreFromSnapshot(
    snapshotId: string,
    currentSections: Record<string, SectionState>
  ): Record<string, SectionState> | null {
    const snapshot = this.snapshots.get(snapshotId)
    if (!snapshot) {
      console.warn(`Snapshot ${snapshotId} not found`)
      return null
    }

    const startTime = performance.now()

    try {
      let restoredState: Record<string, SectionState>

      // Use patches for efficient restoration if available
      if (snapshot.inversePatches && snapshot.inversePatches.length > 0) {
        restoredState = produce(currentSections, (draft) => {
          applyPatches(draft, snapshot.inversePatches!)
        })
      } else {
        // Fallback to full state restoration
        restoredState = snapshot.sectionsState
      }

      // Emit analytics event
      events.emit('snapshot:restored', {
        snapshotId,
        restorationMethod: snapshot.inversePatches ? 'patches' : 'full_state',
        performanceMs: performance.now() - startTime,
        timestamp: Date.now()
      })

      return restoredState

    } catch (error) {
      console.error('Failed to restore from snapshot:', error)
      
      events.emit('snapshot:restore_failed', {
        snapshotId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      })

      return null
    }
  }

  /**
   * Validate snapshot integrity
   * Expert requirement: Comprehensive validation
   */
  public validateSnapshot(snapshot: OptimizedSnapshot): {
    isValid: boolean
    issues: string[]
    metrics: {
      sectionsCount: number
      patchesCount: number
      sizeWithinLimits: boolean
    }
  } {
    const issues: string[] = []

    // Basic structure validation
    if (!snapshot.id || !snapshot.timestamp || !snapshot.layoutId) {
      issues.push('Missing required snapshot fields')
    }

    if (!snapshot.sectionsState || typeof snapshot.sectionsState !== 'object') {
      issues.push('Invalid sectionsState')
    }

    // Validate sections
    const sectionsCount = Object.keys(snapshot.sectionsState || {}).length
    for (const [sectionId, section] of Object.entries(snapshot.sectionsState || {})) {
      if (!section.id || !section.type || !section.content) {
        issues.push(`Section ${sectionId} missing required fields`)
      }
    }

    // Validate patches if present
    const patchesCount = snapshot.patches?.length || 0
    if (snapshot.patches && !Array.isArray(snapshot.patches)) {
      issues.push('Invalid patches format')
    }

    // Size validation
    const sizeWithinLimits = snapshot.sizeEstimate < 1024 * 1024 // 1MB limit
    if (!sizeWithinLimits) {
      issues.push(`Snapshot size ${snapshot.sizeEstimate} exceeds limits`)
    }

    return {
      isValid: issues.length === 0,
      issues,
      metrics: {
        sectionsCount,
        patchesCount,
        sizeWithinLimits
      }
    }
  }

  /**
   * Cleanup old snapshots to manage memory
   * Expert requirement: "Add history size limits (50 entries max)"
   */
  public cleanupSnapshots(maxSnapshots: number = 50): {
    removed: number
    memoryFreed: number
  } {
    const snapshotsArray = Array.from(this.snapshots.entries())
    
    if (snapshotsArray.length <= maxSnapshots) {
      return { removed: 0, memoryFreed: 0 }
    }

    // Sort by timestamp, keep newest
    snapshotsArray.sort(([, a], [, b]) => b.timestamp - a.timestamp)
    
    const toRemove = snapshotsArray.slice(maxSnapshots)
    let memoryFreed = 0

    for (const [id, snapshot] of toRemove) {
      memoryFreed += snapshot.sizeEstimate
      this.snapshots.delete(id)
    }

    // Update metrics
    this.metrics.totalSnapshots = this.snapshots.size
    this.metrics.memoryUsage -= memoryFreed

    events.emit('snapshots:cleanup', {
      removed: toRemove.length,
      memoryFreed,
      remaining: this.snapshots.size,
      timestamp: Date.now()
    })

    return { removed: toRemove.length, memoryFreed }
  }

  /**
   * Get current snapshot metrics
   */
  public getMetrics(): SnapshotMetrics {
    return { ...this.metrics }
  }

  /**
   * Export snapshots for debugging or analysis
   */
  public exportSnapshots(): OptimizedSnapshot[] {
    return Array.from(this.snapshots.values())
  }

  // Private helper methods

  private generateSnapshotId(): string {
    return `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private detectModifiedSections(
    current: Record<string, SectionState>,
    previous: Record<string, SectionState> | null
  ): string[] {
    if (!previous) return Object.keys(current)

    const modified: string[] = []
    
    // Check for changes and additions
    for (const [id, section] of Object.entries(current)) {
      const prevSection = previous[id]
      if (!prevSection || this.sectionsDiffer(section, prevSection)) {
        modified.push(id)
      }
    }

    // Check for deletions
    for (const id of Object.keys(previous)) {
      if (!current[id]) {
        modified.push(id)
      }
    }

    return modified
  }

  private detectChangeType(
    current: Record<string, SectionState>,
    previous: Record<string, SectionState> | null,
    modified: string[]
  ): 'create' | 'update' | 'delete' | 'reorder' {
    if (!previous) return 'create'

    const currentKeys = Object.keys(current)
    const previousKeys = Object.keys(previous)

    if (currentKeys.length > previousKeys.length) return 'create'
    if (currentKeys.length < previousKeys.length) return 'delete'
    if (modified.length === 0) return 'reorder'
    return 'update'
  }

  private sectionsDiffer(a: SectionState, b: SectionState): boolean {
    return (
      a.content.html !== b.content.html ||
      JSON.stringify(a.content.props) !== JSON.stringify(b.content.props) ||
      a.styles.css !== b.styles.css ||
      JSON.stringify(a.styles.variables) !== JSON.stringify(b.styles.variables)
    )
  }

  private createImmerPatches(
    previous: Record<string, SectionState>,
    current: Record<string, SectionState>
  ): { patches: Patch[]; inversePatches: Patch[] } {
    let patches: Patch[] = []
    let inversePatches: Patch[] = []

    produce(
      previous,
      (draft) => {
        // Replace with current state
        Object.assign(draft, current)
      },
      (p, ip) => {
        patches = p
        inversePatches = ip
      }
    )

    return { patches, inversePatches }
  }

  private compressSnapshot(
    snapshot: OptimizedSnapshot,
    modifiedSections: string[]
  ): OptimizedSnapshot {
    // Only store modified sections + references to unchanged
    const compressedSections: Record<string, SectionState> = {}
    
    for (const sectionId of modifiedSections) {
      compressedSections[sectionId] = snapshot.sectionsState[sectionId]
    }

    const originalSize = snapshot.sizeEstimate
    const compressedSnapshot = {
      ...snapshot,
      sectionsState: compressedSections,
      compressionRatio: Object.keys(compressedSections).length / Object.keys(snapshot.sectionsState).length
    }

    compressedSnapshot.sizeEstimate = this.estimateSnapshotSize(compressedSnapshot)

    return compressedSnapshot
  }

  private deepCloneSections(sections: Record<string, SectionState>): Record<string, SectionState> {
    return JSON.parse(JSON.stringify(sections))
  }

  private estimateSnapshotSize(snapshot: OptimizedSnapshot): number {
    return JSON.stringify(snapshot).length * 2 // UTF-16 characters
  }

  private updateMetrics(snapshot: OptimizedSnapshot, performanceMs: number): void {
    this.metrics.totalSnapshots++
    this.metrics.memoryUsage += snapshot.sizeEstimate
    this.metrics.averageSize = this.metrics.memoryUsage / this.metrics.totalSnapshots
    this.metrics.performanceMs = (this.metrics.performanceMs + performanceMs) / 2
    
    if (snapshot.compressionRatio) {
      this.metrics.compressionRatio = (this.metrics.compressionRatio + snapshot.compressionRatio) / 2
    }
  }
}

/**
 * Singleton instance for global use
 */
export const pureDataSnapshotManager = new PureDataSnapshotManager()

/**
 * React hook for snapshot operations
 */
export function useSnapshotManager() {
  return {
    createSnapshot: (
      current: Record<string, SectionState>,
      previous: Record<string, SectionState> | null,
      userAction: string,
      layoutId: string,
      options?: SnapshotCreationOptions
    ) => pureDataSnapshotManager.createSnapshot(current, previous, userAction, layoutId, options),
    
    restoreFromSnapshot: (snapshotId: string, current: Record<string, SectionState>) =>
      pureDataSnapshotManager.restoreFromSnapshot(snapshotId, current),
    
    validateSnapshot: (snapshot: OptimizedSnapshot) =>
      pureDataSnapshotManager.validateSnapshot(snapshot),
    
    getMetrics: () => pureDataSnapshotManager.getMetrics(),
    
    cleanup: (maxSnapshots?: number) => pureDataSnapshotManager.cleanupSnapshots(maxSnapshots)
  }
}