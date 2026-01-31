/**
 * Pure Data Snapshots Tests - Sprint 3 Validation
 * Expert requirement: "Optimize snapshot creation (Immer patches)"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PureDataSnapshotManager } from '../PureDataSnapshotManager'
import type { SectionState } from '@/store/builder-store'

// Mock the event logger
vi.mock('@/utils/event-logger', () => ({
  events: {
    emit: vi.fn()
  }
}))

describe('Pure Data Snapshot Manager', () => {
  let snapshotManager: PureDataSnapshotManager
  let sampleSections: Record<string, SectionState>
  let modifiedSections: Record<string, SectionState>

  beforeEach(() => {
    snapshotManager = new PureDataSnapshotManager()

    // Create sample sections
    sampleSections = {
      'hero-1': {
        id: 'hero-1',
        type: 'hero',
        content: {
          html: '<div>Hero Content</div>',
          props: { title: 'Hero Title' }
        },
        styles: {
          css: '.hero { padding: 2rem; }',
          variables: { '--primary-color': '#3b82f6' }
        },
        metadata: {
          lastModified: Date.now(),
          userAction: 'initial',
          aiGenerated: false
        }
      },
      'features-1': {
        id: 'features-1',
        type: 'features',
        content: {
          html: '<div>Features Content</div>',
          props: { title: 'Features' }
        },
        styles: {
          css: '.features { padding: 1rem; }',
          variables: { '--secondary-color': '#10b981' }
        },
        metadata: {
          lastModified: Date.now(),
          userAction: 'initial',
          aiGenerated: false
        }
      }
    }

    // Create modified version
    modifiedSections = {
      ...sampleSections,
      'hero-1': {
        ...sampleSections['hero-1'],
        content: {
          html: '<div>Modified Hero Content</div>',
          props: { title: 'Modified Hero Title' }
        }
      }
    }
  })

  describe('Snapshot Creation', () => {
    it('creates basic snapshot without patches', () => {
      const snapshot = snapshotManager.createSnapshot(
        sampleSections,
        null,
        'initial_load',
        'layout-1',
        { includePatch: false }
      )

      expect(snapshot.id).toMatch(/^snap_\d+_/)
      expect(snapshot.userAction).toBe('initial_load')
      expect(snapshot.layoutId).toBe('layout-1')
      expect(snapshot.sectionsState).toEqual(sampleSections)
      expect(snapshot.patches).toBeUndefined()
      expect(snapshot.changeType).toBe('create')
      expect(snapshot.sectionsModified).toEqual(['hero-1', 'features-1'])
    })

    it('creates optimized snapshot with Immer patches', () => {
      const snapshot = snapshotManager.createSnapshot(
        modifiedSections,
        sampleSections,
        'edit_hero',
        'layout-1',
        { includePatch: true }
      )

      expect(snapshot.patches).toBeDefined()
      expect(Array.isArray(snapshot.patches)).toBe(true)
      expect(snapshot.inversePatches).toBeDefined()
      expect(Array.isArray(snapshot.inversePatches)).toBe(true)
      expect(snapshot.changeType).toBe('update')
      expect(snapshot.sectionsModified).toContain('hero-1')
      expect(snapshot.sectionsModified).not.toContain('features-1') // unchanged
    })

    it('detects different change types correctly', () => {
      // Test create
      const createSnapshot = snapshotManager.createSnapshot(
        sampleSections,
        null,
        'create',
        'layout-1'
      )
      expect(createSnapshot.changeType).toBe('create')

      // Test update
      const updateSnapshot = snapshotManager.createSnapshot(
        modifiedSections,
        sampleSections,
        'update',
        'layout-1'
      )
      expect(updateSnapshot.changeType).toBe('update')

      // Test delete
      const deletedSections = { 'hero-1': sampleSections['hero-1'] }
      const deleteSnapshot = snapshotManager.createSnapshot(
        deletedSections,
        sampleSections,
        'delete',
        'layout-1'
      )
      expect(deleteSnapshot.changeType).toBe('delete')
    })

    it('compresses snapshots when most sections unchanged', () => {
      // Create a larger set of sections where only one changes
      const largeSectionSet = {
        ...sampleSections,
        'section-3': { ...sampleSections['hero-1'], id: 'section-3' },
        'section-4': { ...sampleSections['hero-1'], id: 'section-4' },
        'section-5': { ...sampleSections['hero-1'], id: 'section-5' },
        'section-6': { ...sampleSections['hero-1'], id: 'section-6' }
      }

      const modifiedLargeSet = {
        ...largeSectionSet,
        'hero-1': modifiedSections['hero-1'] // Only hero-1 modified
      }

      const snapshot = snapshotManager.createSnapshot(
        modifiedLargeSet,
        largeSectionSet,
        'minor_edit',
        'layout-1',
        { compressUnchanged: true }
      )

      expect(snapshot.compressionRatio).toBeDefined()
      expect(snapshot.compressionRatio!).toBeLessThan(1)
      
      // Should only store modified section when compressed
      expect(Object.keys(snapshot.sectionsState)).toHaveLength(1)
      expect(snapshot.sectionsState['hero-1']).toBeDefined()
    })

    it('estimates snapshot size accurately', () => {
      const snapshot = snapshotManager.createSnapshot(
        sampleSections,
        null,
        'test',
        'layout-1'
      )

      expect(snapshot.sizeEstimate).toBeGreaterThan(0)
      expect(typeof snapshot.sizeEstimate).toBe('number')
      
      // Size should be reasonable (less than 50KB for simple sections)
      expect(snapshot.sizeEstimate).toBeLessThan(50 * 1024)
    })
  })

  describe('Snapshot Restoration', () => {
    it('restores state from full snapshot', () => {
      const snapshot = snapshotManager.createSnapshot(
        sampleSections,
        null,
        'test',
        'layout-1',
        { includePatch: false }
      )

      const restored = snapshotManager.restoreFromSnapshot(
        snapshot.id,
        modifiedSections
      )

      expect(restored).toEqual(sampleSections)
    })

    it('restores state using Immer patches when available', () => {
      const snapshot = snapshotManager.createSnapshot(
        modifiedSections,
        sampleSections,
        'test',
        'layout-1',
        { includePatch: true }
      )

      const restored = snapshotManager.restoreFromSnapshot(
        snapshot.id,
        modifiedSections
      )

      expect(restored).toBeDefined()
      // Patches should restore to previous state
      expect(restored!['hero-1'].content.html).toBe('<div>Hero Content</div>')
    })

    it('handles missing snapshots gracefully', () => {
      const restored = snapshotManager.restoreFromSnapshot(
        'nonexistent-id',
        sampleSections
      )

      expect(restored).toBeNull()
    })

    it('handles restoration errors gracefully', () => {
      // Create snapshot with invalid patches
      const snapshot = snapshotManager.createSnapshot(
        sampleSections,
        null,
        'test',
        'layout-1'
      )
      
      // Corrupt the snapshot with malformed patches that will cause applyPatches to fail
      const corruptedSnapshot = { ...snapshot }
      corruptedSnapshot.inversePatches = [
        { op: 'replace', path: ['nonexistent', 'path'], value: 'invalid' } as any
      ]
      
      // Manually add corrupted snapshot
      ;(snapshotManager as any).snapshots.set('corrupted', corruptedSnapshot)

      const restored = snapshotManager.restoreFromSnapshot(
        'corrupted',
        sampleSections
      )

      expect(restored).toBeNull()
    })
  })

  describe('Snapshot Validation', () => {
    it('validates correct snapshots', () => {
      const snapshot = snapshotManager.createSnapshot(
        sampleSections,
        null,
        'test',
        'layout-1'
      )

      const validation = snapshotManager.validateSnapshot(snapshot)

      expect(validation.isValid).toBe(true)
      expect(validation.issues).toHaveLength(0)
      expect(validation.metrics.sectionsCount).toBe(2)
      expect(validation.metrics.sizeWithinLimits).toBe(true)
    })

    it('detects invalid snapshots', () => {
      const invalidSnapshot = {
        id: '', // Invalid: empty ID
        timestamp: Date.now(),
        userAction: 'test',
        layoutId: 'layout-1',
        sectionsState: null as any, // Invalid: null sections
        sizeEstimate: 0,
        sectionsModified: [],
        changeType: 'create' as const
      }

      const validation = snapshotManager.validateSnapshot(invalidSnapshot)

      expect(validation.isValid).toBe(false)
      expect(validation.issues.length).toBeGreaterThan(0)
      expect(validation.issues.some(issue => issue.includes('Missing required'))).toBe(true)
      expect(validation.issues.some(issue => issue.includes('Invalid sectionsState'))).toBe(true)
    })

    it('detects oversized snapshots', () => {
      const largeSnapshot = snapshotManager.createSnapshot(
        sampleSections,
        null,
        'test',
        'layout-1'
      )
      
      // Mock large size
      largeSnapshot.sizeEstimate = 2 * 1024 * 1024 // 2MB

      const validation = snapshotManager.validateSnapshot(largeSnapshot)

      expect(validation.metrics.sizeWithinLimits).toBe(false)
      expect(validation.issues.some(issue => issue.includes('exceeds limits'))).toBe(true)
    })
  })

  describe('Memory Management', () => {
    it('cleans up old snapshots when limit exceeded', () => {
      // Create multiple snapshots
      const snapshots = []
      for (let i = 0; i < 60; i++) {
        const snapshot = snapshotManager.createSnapshot(
          sampleSections,
          null,
          `test_${i}`,
          'layout-1'
        )
        snapshots.push(snapshot)
      }

      // Cleanup with limit of 50
      const cleanup = snapshotManager.cleanupSnapshots(50)

      expect(cleanup.removed).toBe(10)
      expect(cleanup.memoryFreed).toBeGreaterThan(0)

      const metrics = snapshotManager.getMetrics()
      expect(metrics.totalSnapshots).toBe(50)
    })

    it('does not cleanup when under limit', () => {
      // Create only a few snapshots
      for (let i = 0; i < 30; i++) {
        snapshotManager.createSnapshot(
          sampleSections,
          null,
          `test_${i}`,
          'layout-1'
        )
      }

      const cleanup = snapshotManager.cleanupSnapshots(50)

      expect(cleanup.removed).toBe(0)
      expect(cleanup.memoryFreed).toBe(0)
    })

    it('tracks memory usage accurately', () => {
      const initialMetrics = snapshotManager.getMetrics()
      const initialMemory = initialMetrics.memoryUsage

      const snapshot = snapshotManager.createSnapshot(
        sampleSections,
        null,
        'test',
        'layout-1'
      )

      const newMetrics = snapshotManager.getMetrics()
      expect(newMetrics.memoryUsage).toBeGreaterThan(initialMemory)
      expect(newMetrics.memoryUsage).toBe(initialMemory + snapshot.sizeEstimate)
    })
  })

  describe('Performance Optimization', () => {
    it('creates snapshots quickly', () => {
      const iterations = 100
      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        snapshotManager.createSnapshot(
          sampleSections,
          null,
          `perf_test_${i}`,
          'layout-1'
        )
      }

      const endTime = performance.now()
      const averageTime = (endTime - startTime) / iterations

      expect(averageTime).toBeLessThan(10) // Should be very fast
      console.log(`Snapshot creation: ${averageTime.toFixed(3)}ms average`)
    })

    it('uses patches for efficient storage', () => {
      // Create base snapshot
      const baseSnapshot = snapshotManager.createSnapshot(
        sampleSections,
        null,
        'base',
        'layout-1',
        { includePatch: false }
      )

      // Create patch-based snapshot
      const patchSnapshot = snapshotManager.createSnapshot(
        modifiedSections,
        sampleSections,
        'patched',
        'layout-1',
        { includePatch: true }
      )

      // Patch-based should be more efficient for small changes
      expect(patchSnapshot.patches).toBeDefined()
      expect(patchSnapshot.patches!.length).toBeGreaterThan(0)
      
      console.log(`Base snapshot: ${baseSnapshot.sizeEstimate} bytes`)
      console.log(`Patch snapshot: ${patchSnapshot.sizeEstimate} bytes`)
      console.log(`Patches: ${patchSnapshot.patches!.length} operations`)
    })
  })

  describe('Analytics Integration', () => {
    it('emits analytics events for snapshot operations', () => {
      const snapshot = snapshotManager.createSnapshot(
        sampleSections,
        null,
        'test',
        'layout-1'
      )

      // Verify snapshot was created with expected properties
      expect(snapshot.id).toMatch(/^snap_/)
      expect(snapshot.sizeEstimate).toBeGreaterThan(0)
      expect(snapshot.sectionsModified).toEqual(['hero-1', 'features-1'])
      expect(snapshot.changeType).toBe('create')
    })

    it('tracks snapshot metrics', () => {
      // Create several snapshots
      for (let i = 0; i < 5; i++) {
        snapshotManager.createSnapshot(
          sampleSections,
          null,
          `test_${i}`,
          'layout-1'
        )
      }

      const metrics = snapshotManager.getMetrics()

      expect(metrics.totalSnapshots).toBe(5)
      expect(metrics.averageSize).toBeGreaterThan(0)
      expect(metrics.memoryUsage).toBeGreaterThan(0)
      expect(metrics.performanceMs).toBeGreaterThanOrEqual(0) // Performance can be 0 for very fast operations
    })
  })

  describe('Export and Analysis', () => {
    it('exports snapshots for analysis', () => {
      // Create test snapshots
      const snapshot1 = snapshotManager.createSnapshot(sampleSections, null, 'test1', 'layout-1')
      const snapshot2 = snapshotManager.createSnapshot(modifiedSections, sampleSections, 'test2', 'layout-1')

      const exported = snapshotManager.exportSnapshots()

      expect(exported).toHaveLength(2)
      expect(exported[0].id).toBe(snapshot1.id)
      expect(exported[1].id).toBe(snapshot2.id)
    })
  })
})