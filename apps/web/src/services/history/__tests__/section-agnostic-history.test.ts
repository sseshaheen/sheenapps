/**
 * Section-Agnostic History Tests - Sprint 3 Validation
 * Expert requirement: History should work regardless of section types
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SectionAgnosticHistoryManager } from '../SectionAgnosticHistoryManager'
import type { SectionState, Layout, Snapshot } from '@/store/builder-store'

// Mock dependencies
vi.mock('@/utils/event-logger', () => ({
  events: { emit: vi.fn() }
}))

vi.mock('@/services/snapshots/PureDataSnapshotManager', () => ({
  pureDataSnapshotManager: {
    createSnapshot: vi.fn().mockImplementation((current, previous, userAction, layoutId) => ({
      id: `snap_${Date.now()}`,
      timestamp: Date.now(),
      userAction,
      layoutId,
      sectionsState: current,
      sizeEstimate: 1000,
      sectionsModified: Object.keys(current),
      changeType: 'update'
    }))
  }
}))

describe('Section-Agnostic History Manager', () => {
  let historyManager: SectionAgnosticHistoryManager
  let sampleHeroSection: SectionState
  let sampleFeaturesSection: SectionState
  let samplePricingSection: SectionState
  let mixedSections: Record<string, SectionState>

  beforeEach(() => {
    historyManager = new SectionAgnosticHistoryManager()

    // Create sample sections of different types
    sampleHeroSection = {
      id: 'hero-1',
      type: 'hero',
      content: {
        html: '<div>Hero Content</div>',
        props: { title: 'Hero Title', subtitle: 'Hero Subtitle' }
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
    }

    sampleFeaturesSection = {
      id: 'features-1',
      type: 'features',
      content: {
        html: '<div>Features Content</div>',
        props: { 
          title: 'Features',
          features: [
            { icon: '🚀', title: 'Fast', description: 'Lightning fast' },
            { icon: '🔒', title: 'Secure', description: 'Bank-level security' }
          ]
        }
      },
      styles: {
        css: '.features { display: grid; }',
        variables: { '--grid-cols': '3' }
      },
      metadata: {
        lastModified: Date.now(),
        userAction: 'initial',
        aiGenerated: true
      }
    }

    samplePricingSection = {
      id: 'pricing-1',
      type: 'pricing',
      content: {
        html: '<div>Pricing Content</div>',
        props: {
          title: 'Pricing',
          plans: [
            { name: 'Basic', price: '$9', features: ['Feature 1', 'Feature 2'] },
            { name: 'Pro', price: '$19', features: ['Feature 1', 'Feature 2', 'Feature 3'] }
          ]
        }
      },
      styles: {
        css: '.pricing { text-align: center; }',
        variables: { '--highlight-color': '#10b981' }
      },
      metadata: {
        lastModified: Date.now(),
        userAction: 'initial',
        aiGenerated: false
      }
    }

    mixedSections = {
      'hero-1': sampleHeroSection,
      'features-1': sampleFeaturesSection,
      'pricing-1': samplePricingSection
    }
  })

  describe('Section-Agnostic Edit Operations', () => {
    it('applies edits to hero sections', () => {
      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 1,
        sectionTypes: ['hero']
      }

      const result = historyManager.applyEdit(
        { 'hero-1': sampleHeroSection },
        'hero-1',
        {
          content: {
            html: '<div>Updated Hero</div>',
            props: { title: 'Updated Title' }
          }
        },
        context
      )

      expect(result.newSections['hero-1'].content.html).toBe('<div>Updated Hero</div>')
      expect(result.newSections['hero-1'].content.props.title).toBe('Updated Title')
      expect(result.operation.type).toBe('edit')
      expect(result.snapshot).toBeDefined()
    })

    it('applies edits to features sections', () => {
      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 1,
        sectionTypes: ['features']
      }

      const result = historyManager.applyEdit(
        { 'features-1': sampleFeaturesSection },
        'features-1',
        {
          content: {
            props: {
              features: [
                { icon: '⚡', title: 'Super Fast', description: 'Even faster now' }
              ]
            }
          }
        },
        context
      )

      expect(result.newSections['features-1'].content.props.features).toHaveLength(1)
      expect(result.newSections['features-1'].content.props.features[0].title).toBe('Super Fast')
      expect(result.operation.type).toBe('edit')
    })

    it('applies edits to pricing sections', () => {
      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 1,
        sectionTypes: ['pricing']
      }

      const result = historyManager.applyEdit(
        { 'pricing-1': samplePricingSection },
        'pricing-1',
        {
          content: {
            props: {
              plans: [
                { name: 'Enterprise', price: '$99', features: ['Everything'] }
              ]
            }
          }
        },
        context
      )

      expect(result.newSections['pricing-1'].content.props.plans).toHaveLength(1)
      expect(result.newSections['pricing-1'].content.props.plans[0].name).toBe('Enterprise')
      expect(result.operation.type).toBe('edit')
    })

    it('creates new sections of any type', () => {
      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 0,
        sectionTypes: []
      }

      const result = historyManager.applyEdit(
        {},
        'new-cta-1',
        {
          type: 'cta',
          content: {
            html: '<div>New CTA</div>',
            props: { title: 'Call to Action' }
          }
        },
        context
      )

      expect(result.newSections['new-cta-1']).toBeDefined()
      expect(result.newSections['new-cta-1'].type).toBe('cta')
      expect(result.newSections['new-cta-1'].content.props.title).toBe('Call to Action')
      expect(result.operation.type).toBe('create')
    })

    it('handles mixed section types in one operation', () => {
      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 3,
        sectionTypes: ['hero', 'features', 'pricing']
      }

      // Edit multiple different section types
      const heroResult = historyManager.applyEdit(mixedSections, 'hero-1', {
        content: { props: { title: 'New Hero Title' } }
      }, context)

      const featuresResult = historyManager.applyEdit(heroResult.newSections, 'features-1', {
        content: { props: { title: 'New Features Title' } }
      }, context)

      const pricingResult = historyManager.applyEdit(featuresResult.newSections, 'pricing-1', {
        content: { props: { title: 'New Pricing Title' } }
      }, context)

      expect(pricingResult.newSections['hero-1'].content.props.title).toBe('New Hero Title')
      expect(pricingResult.newSections['features-1'].content.props.title).toBe('New Features Title')
      expect(pricingResult.newSections['pricing-1'].content.props.title).toBe('New Pricing Title')
    })
  })

  describe('Section-Agnostic Undo/Redo', () => {
    it('undoes changes across different section types', () => {
      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 3,
        sectionTypes: ['hero', 'features', 'pricing']
      }

      // Create history stack with mixed section types
      const historyStack: Snapshot[] = [
        {
          id: 'snap-1',
          timestamp: Date.now() - 1000,
          userAction: 'initial_state',
          layoutId: 'layout-1',
          sectionsState: mixedSections
        },
        {
          id: 'snap-2',
          timestamp: Date.now(),
          userAction: 'edit_all_sections',
          layoutId: 'layout-1',
          sectionsState: {
            ...mixedSections,
            'hero-1': { ...sampleHeroSection, content: { ...sampleHeroSection.content, props: { title: 'Modified Hero' } } },
            'features-1': { ...sampleFeaturesSection, content: { ...sampleFeaturesSection.content, props: { title: 'Modified Features' } } }
          }
        }
      ]

      const result = historyManager.undoSectionAgnostic(
        historyStack[1].sectionsState,
        historyStack,
        1,
        context
      )

      expect(result).toBeDefined()
      expect(result!.success).toBe(true)
      expect(result!.operation).toBe('undo')
      expect(result!.sectionsAffected.modified).toContain('hero-1')
      expect(result!.sectionsAffected.modified).toContain('features-1')
      expect(result!.metadata.sectionTypesInvolved).toContain('hero')
      expect(result!.metadata.sectionTypesInvolved).toContain('features')
    })

    it('redoes changes across different section types', () => {
      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 3,
        sectionTypes: ['hero', 'features', 'pricing']
      }

      const historyStack: Snapshot[] = [
        {
          id: 'snap-1',
          timestamp: Date.now(),
          userAction: 'mixed_changes',
          layoutId: 'layout-1',
          sectionsState: mixedSections
        }
      ]

      const result = historyManager.redoSectionAgnostic(
        mixedSections,
        historyStack,
        -1, // Before first snapshot
        context
      )

      expect(result).toBeDefined()
      expect(result!.success).toBe(true)
      expect(result!.operation).toBe('redo')
      expect(result!.metadata.sectionTypesInvolved).toContain('hero')
      expect(result!.metadata.sectionTypesInvolved).toContain('features')
      expect(result!.metadata.sectionTypesInvolved).toContain('pricing')
    })

    it('handles empty history gracefully', () => {
      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 0,
        sectionTypes: []
      }

      const undoResult = historyManager.undoSectionAgnostic({}, [], -1, context)
      const redoResult = historyManager.redoSectionAgnostic({}, [], 0, context)

      expect(undoResult).toBeNull()
      expect(redoResult).toBeNull()
    })
  })

  describe('Cross-Layout Operations', () => {
    it('copies sections between layouts regardless of type', () => {
      const sourceLayout: Layout = {
        id: 'desktop',
        name: 'Desktop Layout',
        sections: { 'hero-1': sampleHeroSection }
      }

      const targetLayout: Layout = {
        id: 'mobile',
        name: 'Mobile Layout',
        sections: { 'features-1': sampleFeaturesSection }
      }

      const result = historyManager.handleCrossLayoutOperation(
        sourceLayout,
        targetLayout,
        'hero-1',
        'copy'
      )

      expect(result.updatedSourceLayout.sections['hero-1']).toBeDefined() // Original remains
      expect(result.updatedTargetLayout.sections['features-1']).toBeDefined() // Existing remains
      expect(Object.keys(result.updatedTargetLayout.sections)).toHaveLength(2) // New section added
      expect(result.snapshots).toHaveLength(2)

      // Find the copied section
      const copiedSectionId = Object.keys(result.updatedTargetLayout.sections).find(
        id => id.startsWith('hero-1_copy_')
      )
      expect(copiedSectionId).toBeDefined()
      expect(result.updatedTargetLayout.sections[copiedSectionId!].type).toBe('hero')
    })

    it('moves sections between layouts regardless of type', () => {
      const sourceLayout: Layout = {
        id: 'desktop',
        name: 'Desktop Layout',
        sections: { 'pricing-1': samplePricingSection }
      }

      const targetLayout: Layout = {
        id: 'mobile',
        name: 'Mobile Layout',
        sections: {}
      }

      const result = historyManager.handleCrossLayoutOperation(
        sourceLayout,
        targetLayout,
        'pricing-1',
        'move'
      )

      expect(result.updatedSourceLayout.sections['pricing-1']).toBeUndefined() // Removed from source
      expect(result.updatedTargetLayout.sections['pricing-1']).toBeDefined() // Added to target
      expect(result.updatedTargetLayout.sections['pricing-1'].type).toBe('pricing')
      expect(result.snapshots).toHaveLength(2)
    })

    it('handles cross-layout operations with multiple section types', () => {
      const sourceLayout: Layout = {
        id: 'desktop',
        name: 'Desktop Layout',
        sections: mixedSections
      }

      const targetLayout: Layout = {
        id: 'mobile',
        name: 'Mobile Layout',
        sections: {}
      }

      // Copy different section types
      const heroResult = historyManager.handleCrossLayoutOperation(
        sourceLayout,
        targetLayout,
        'hero-1',
        'copy'
      )

      const featuresResult = historyManager.handleCrossLayoutOperation(
        sourceLayout,
        heroResult.updatedTargetLayout,
        'features-1',
        'copy'
      )

      expect(Object.keys(featuresResult.updatedTargetLayout.sections)).toHaveLength(2)
      
      // Check both section types were copied
      const sections = Object.values(featuresResult.updatedTargetLayout.sections)
      const sectionTypes = sections.map(s => s.type)
      expect(sectionTypes).toContain('hero')
      expect(sectionTypes).toContain('features')
    })
  })

  describe('Section-Agnostic Validation', () => {
    it('validates history with mixed section types', () => {
      const historyStack: Snapshot[] = [
        {
          id: 'snap-1',
          timestamp: Date.now(),
          userAction: 'mixed_creation',
          layoutId: 'layout-1',
          sectionsState: {
            'hero-1': sampleHeroSection,
            'features-1': sampleFeaturesSection
          }
        },
        {
          id: 'snap-2',
          timestamp: Date.now(),
          userAction: 'add_pricing',
          layoutId: 'layout-1',
          sectionsState: mixedSections
        }
      ]

      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 3,
        sectionTypes: ['hero', 'features', 'pricing']
      }

      const validation = historyManager.validateSectionAgnosticHistory(historyStack, context)

      expect(validation.isValid).toBe(true)
      expect(validation.issues).toHaveLength(0)
      expect(validation.metrics.sectionTypeCoverage).toContain('hero')
      expect(validation.metrics.sectionTypeCoverage).toContain('features')
      expect(validation.metrics.sectionTypeCoverage).toContain('pricing')
      expect(validation.metrics.layoutsCovered).toContain('layout-1')
    })

    it('detects invalid sections in mixed history', () => {
      const invalidHistoryStack: Snapshot[] = [
        {
          id: 'snap-1',
          timestamp: Date.now(),
          userAction: 'invalid_creation',
          layoutId: 'layout-1',
          sectionsState: {
            'valid-hero': sampleHeroSection,
            'invalid-section': {
              id: 'invalid-section',
              // Missing required fields
            } as any
          }
        }
      ]

      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 2,
        sectionTypes: ['hero']
      }

      const validation = historyManager.validateSectionAgnosticHistory(invalidHistoryStack, context)

      expect(validation.isValid).toBe(false)
      expect(validation.issues.length).toBeGreaterThan(0)
      expect(validation.issues.some(issue => issue.includes('invalid-section'))).toBe(true)
    })

    it('calculates metrics across different section types', () => {
      const multiTypeHistory: Snapshot[] = [
        {
          id: 'snap-1',
          timestamp: Date.now(),
          userAction: 'hero_only',
          layoutId: 'desktop',
          sectionsState: { 'hero-1': sampleHeroSection }
        },
        {
          id: 'snap-2',
          timestamp: Date.now(),
          userAction: 'add_features',
          layoutId: 'desktop',
          sectionsState: {
            'hero-1': sampleHeroSection,
            'features-1': sampleFeaturesSection
          }
        },
        {
          id: 'snap-3',
          timestamp: Date.now(),
          userAction: 'mobile_version',
          layoutId: 'mobile',
          sectionsState: { 'pricing-1': samplePricingSection }
        }
      ]

      const context = {
        currentLayoutId: 'desktop',
        availableLayouts: ['desktop', 'mobile'],
        totalSections: 3,
        sectionTypes: ['hero', 'features', 'pricing']
      }

      const validation = historyManager.validateSectionAgnosticHistory(multiTypeHistory, context)

      expect(validation.isValid).toBe(true)
      expect(validation.metrics.totalSnapshots).toBe(3)
      expect(validation.metrics.sectionTypeCoverage).toEqual(['hero', 'features', 'pricing'])
      expect(validation.metrics.layoutsCovered).toEqual(['desktop', 'mobile'])
      expect(validation.metrics.averageSnapshotSize).toBeGreaterThan(0)
    })
  })

  describe('Performance and Analytics', () => {
    it('tracks performance across different section types', () => {
      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 1,
        sectionTypes: ['hero']
      }

      const startTime = performance.now()
      
      // Test with different section types
      const heroResult = historyManager.applyEdit({}, 'hero-1', sampleHeroSection, context)
      const featuresResult = historyManager.applyEdit(heroResult.newSections, 'features-1', sampleFeaturesSection, context)
      const pricingResult = historyManager.applyEdit(featuresResult.newSections, 'pricing-1', samplePricingSection, context)
      
      const endTime = performance.now()

      expect(heroResult.operation.metadata?.performanceMs).toBeGreaterThanOrEqual(0)
      expect(featuresResult.operation.metadata?.performanceMs).toBeGreaterThanOrEqual(0)
      expect(pricingResult.operation.metadata?.performanceMs).toBeGreaterThanOrEqual(0)
      
      const totalTime = endTime - startTime
      expect(totalTime).toBeLessThan(100) // Should be fast
      
      console.log(`Section-agnostic operations: ${totalTime.toFixed(2)}ms for 3 different section types`)
    })

    it('handles large numbers of mixed sections efficiently', () => {
      const largeMixedSections: Record<string, SectionState> = {}
      
      // Create 100 sections of different types
      for (let i = 0; i < 100; i++) {
        const types: SectionState['type'][] = ['hero', 'features', 'pricing', 'testimonials', 'cta', 'footer']
        const type = types[i % types.length]
        
        largeMixedSections[`${type}-${i}`] = {
          ...sampleHeroSection,
          id: `${type}-${i}`,
          type
        }
      }

      const context = {
        currentLayoutId: 'layout-1',
        availableLayouts: ['layout-1'],
        totalSections: 100,
        sectionTypes: ['hero', 'features', 'pricing', 'testimonials', 'cta', 'footer']
      }

      const startTime = performance.now()
      
      // Find an existing hero section to edit (hero sections are at positions 0, 6, 12, 18, etc.)
      const existingHeroSection = Object.keys(largeMixedSections).find(id => id.startsWith('hero-'))
      
      const result = historyManager.applyEdit(
        largeMixedSections,
        existingHeroSection!,
        { content: { props: { title: 'Modified' } } },
        context
      )
      
      const endTime = performance.now()

      expect(result.newSections).toBeDefined()
      expect(Object.keys(result.newSections)).toHaveLength(100)
      expect(endTime - startTime).toBeLessThan(50) // Should handle large sets efficiently
      
      console.log(`Large mixed sections (100 items): ${(endTime - startTime).toFixed(2)}ms`)
    })
  })
})