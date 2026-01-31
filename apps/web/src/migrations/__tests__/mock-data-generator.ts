/**
 * Mock Data Generator - Comprehensive test scenarios for migration
 * Expert requirement: Test with all edge cases since no real projects yet
 */

import type { BuilderState, SectionState, Layout, Snapshot } from '@/store/builder-store'

// Helper to create mock section
function createMockSection(
  id: string, 
  type: SectionState['type'], 
  overrides?: Partial<SectionState>
): SectionState {
  return {
    id,
    type,
    content: {
      html: `<div class="${type}-section">${type.toUpperCase()} Content</div>`,
      props: {
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Title`,
        subtitle: `${type} subtitle content`,
        description: `This is a mock ${type} section for testing purposes.`
      }
    },
    styles: {
      css: `.${type}-section { padding: 2rem; margin: 1rem 0; }`,
      variables: {
        '--primary-color': '#3b82f6',
        '--text-color': '#1f2937',
        '--bg-color': '#ffffff'
      }
    },
    metadata: {
      lastModified: Date.now(),
      userAction: 'initial',
      aiGenerated: true
    },
    ...overrides
  }
}

// Helper to create mock layout
function createMockLayout(id: string, name: string, sectionIds: string[]): Layout {
  const sections: Record<string, SectionState> = {}
  
  sectionIds.forEach((sectionId, index) => {
    const types: SectionState['type'][] = ['hero', 'features', 'pricing', 'testimonials', 'cta', 'footer']
    const type = types[index % types.length]
    sections[sectionId] = createMockSection(sectionId, type)
  })
  
  return {
    id,
    name,
    sections
  }
}

// Helper to create mock snapshot
function createMockSnapshot(
  id: string,
  layoutId: string, 
  sectionsState: Record<string, SectionState>,
  userAction: string = 'mock-edit'
): Snapshot {
  return {
    id,
    timestamp: Date.now() - Math.random() * 86400000, // Random time in last 24h
    userAction,
    layoutId,
    sectionsState: { ...sectionsState }
  }
}

export function generateMockProjectData() {
  return {
    // Empty project (new user)
    emptyProject: (): BuilderState => ({
      projectId: 'empty-test-project',
      layouts: {},
      history: {
        stack: [],
        index: -1
      },
      sectionHistory: {},
      ui: {
        currentLayoutId: '',
        modal: null,
        activeEditSection: null
      }
    }),

    // Single layout project (basic usage)
    singleLayoutProject: (): BuilderState => {
      const layout = createMockLayout('layout-1', 'Modern Layout', [
        'hero-1', 'features-1', 'pricing-1'
      ])
      
      return {
        projectId: 'single-layout-test',
        layouts: {
          'layout-1': layout
        },
        history: {
          stack: [],
          index: -1
        },
        sectionHistory: {},
        ui: {
          currentLayoutId: 'layout-1',
          modal: null,
          activeEditSection: null
        }
      }
    },

    // Multi-layout project (layout switching)
    multiLayoutProject: (): BuilderState => {
      const layout1 = createMockLayout('layout-1', 'Modern Layout', ['hero-1', 'features-1'])
      const layout2 = createMockLayout('layout-2', 'Classic Layout', ['hero-2', 'pricing-2'])
      const layout3 = createMockLayout('layout-3', 'Minimal Layout', ['hero-3', 'cta-3'])
      
      return {
        projectId: 'multi-layout-test',
        layouts: {
          'layout-1': layout1,
          'layout-2': layout2,
          'layout-3': layout3
        },
        history: {
          stack: [],
          index: -1
        },
        sectionHistory: {},
        ui: {
          currentLayoutId: 'layout-2',
          modal: null,
          activeEditSection: null
        }
      }
    },

    // Heavily edited project (complex history)
    heavilyEditedProject: (): BuilderState => {
      const layout = createMockLayout('layout-1', 'Edited Layout', ['hero-1', 'features-1'])
      
      // Create extensive edit history
      const history: Snapshot[] = []
      const editActions = [
        'AI Generated Hero',
        'User Edited Title',
        'Updated Color Scheme', 
        'Added CTA Button',
        'Refined Typography',
        'Updated Images',
        'Adjusted Spacing',
        'Color Tweaks',
        'Content Updates',
        'Final Polish'
      ]
      
      editActions.forEach((action, index) => {
        // Modify sections for each edit
        const modifiedSections = { ...layout.sections }
        Object.values(modifiedSections).forEach(section => {
          section.metadata = {
            ...section.metadata,
            lastModified: Date.now() - (editActions.length - index) * 60000, // 1 min apart
            userAction: action
          }
          // Simulate content changes
          section.content.props.title = `${section.content.props.title} (Edit ${index + 1})`
        })
        
        history.push(createMockSnapshot(
          `snapshot-${index}`,
          'layout-1',
          modifiedSections,
          action
        ))
      })
      
      return {
        projectId: 'heavily-edited-test',
        layouts: {
          'layout-1': layout
        },
        history: {
          stack: history,
          index: history.length - 1 // At latest edit
        },
        sectionHistory: {},
        ui: {
          currentLayoutId: 'layout-1',
          modal: null,
          activeEditSection: null
        }
      }
    },

    // Corrupted project (edge case testing)
    corruptedProject: (): BuilderState => {
      const layout = createMockLayout('layout-1', 'Corrupted Layout', ['hero-1'])
      
      // Introduce various corruption scenarios
      const corruptedLayout = {
        ...layout,
        sections: {
          // Missing required fields
          'broken-section-1': {
            id: 'broken-section-1',
            type: 'hero' as const,
            content: {
              html: '', // Empty HTML
              props: {} // Empty props
            },
            styles: {
              css: 'invalid css syntax {{{',
              variables: {}
            },
            metadata: {
              lastModified: NaN, // Invalid timestamp
              userAction: '',
              aiGenerated: true
            }
          },
          // Valid section for comparison
          'valid-section': layout.sections['hero-1'],
          // Section with circular references (serialization issue)
          'circular-section': (() => {
            const section = createMockSection('circular-section', 'features')
            // Create circular reference
            ;(section.content.props as any).self = section
            return section
          })()
        }
      }
      
      // Corrupted history
      const corruptedHistory = [
        // Invalid snapshot
        {
          id: '',
          timestamp: -1,
          userAction: '',
          layoutId: 'non-existent-layout',
          sectionsState: {}
        },
        // Snapshot referencing missing sections
        {
          id: 'snapshot-2',
          timestamp: Date.now(),
          userAction: 'valid-action',
          layoutId: 'layout-1',
          sectionsState: {
            'missing-section': createMockSection('missing-section', 'hero')
          }
        }
      ]
      
      return {
        projectId: 'corrupted-test',
        layouts: {
          'layout-1': corruptedLayout
        },
        history: {
          stack: corruptedHistory as Snapshot[],
          index: 10 // Index out of bounds
        },
        sectionHistory: {},
        ui: {
          currentLayoutId: 'non-existent-layout', // Invalid layout
          modal: 'edit',
          activeEditSection: 'missing-section' // Missing section
        }
      }
    },

    // Large project (performance testing)
    largeProject: (): BuilderState => {
      const layouts: Record<string, Layout> = {}
      
      // Create 10 layouts
      for (let i = 1; i <= 10; i++) {
        const sectionIds = Array.from({ length: 20 }, (_, j) => `section-${i}-${j}`)
        layouts[`layout-${i}`] = createMockLayout(`layout-${i}`, `Layout ${i}`, sectionIds)
      }
      
      // Create large history (50 entries - max limit)
      const history: Snapshot[] = []
      for (let i = 0; i < 50; i++) {
        const layoutId = `layout-${(i % 10) + 1}`
        const layout = layouts[layoutId]
        history.push(createMockSnapshot(
          `large-snapshot-${i}`,
          layoutId,
          layout.sections,
          `Large Edit ${i}`
        ))
      }
      
      return {
        projectId: 'large-test-project',
        layouts,
        history: {
          stack: history,
          index: 25 // Middle of history
        },
        sectionHistory: {},
        ui: {
          currentLayoutId: 'layout-5',
          modal: null,
          activeEditSection: null
        }
      }
    },

    // Project with complex sections (edge case content)
    complexSectionsProject: (): BuilderState => {
      const complexSections = {
        // Section with very large content
        'large-content-section': createMockSection('large-content-section', 'hero', {
          content: {
            html: '<div>' + 'Large content '.repeat(1000) + '</div>',
            props: {
              title: 'Large Title',
              largeArray: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `Item ${i}` })),
              deepObject: {
                level1: {
                  level2: {
                    level3: {
                      level4: {
                        level5: 'Deep value'
                      }
                    }
                  }
                }
              }
            }
          }
        }),
        
        // Section with special characters and HTML
        'special-chars-section': createMockSection('special-chars-section', 'features', {
          content: {
            html: '<div>🚀 Special & "quoted" <script>alert("xss")</script> content</div>',
            props: {
              title: 'Special Title: áéíóú & çñü',
              description: 'Content with\nnewlines\tand\rtabs',
              emoji: '🎉🔥⚡🚀💯',
              html: '<strong>HTML content</strong>',
              json: JSON.stringify({ key: 'value', array: [1, 2, 3] })
            }
          }
        }),
        
        // Section with dynamic content
        'dynamic-section': createMockSection('dynamic-section', 'pricing', {
          content: {
            html: `<div>Generated at: ${new Date().toISOString()}</div>`,
            props: {
              timestamp: Date.now(),
              random: Math.random(),
              function: (() => 'function result')(),
              date: new Date(),
              undefined: undefined,
              null: null,
              boolean: true,
              number: 42.5
            }
          }
        })
      }
      
      return {
        projectId: 'complex-sections-test',
        layouts: {
          'layout-1': {
            id: 'layout-1',
            name: 'Complex Layout',
            sections: complexSections
          }
        },
        history: {
          stack: [],
          index: -1
        },
        sectionHistory: {},
        ui: {
          currentLayoutId: 'layout-1',
          modal: null,
          activeEditSection: null
        }
      }
    }
  }
}

// Test data validation helpers
export const mockDataValidators = {
  validateProjectStructure: (project: BuilderState): string[] => {
    const errors: string[] = []
    
    // Check required fields
    if (!project.projectId) errors.push('Missing projectId')
    if (!project.layouts) errors.push('Missing layouts object')
    if (!project.history) errors.push('Missing history object')
    if (!project.ui) errors.push('Missing ui object')
    
    // Validate history structure
    if (project.history.index >= project.history.stack.length) {
      errors.push('History index out of bounds')
    }
    
    // Validate layouts
    Object.entries(project.layouts).forEach(([layoutId, layout]) => {
      if (!layout.id) errors.push(`Layout ${layoutId} missing id`)
      if (!layout.name) errors.push(`Layout ${layoutId} missing name`)
      if (!layout.sections) errors.push(`Layout ${layoutId} missing sections`)
      
      // Validate sections
      Object.entries(layout.sections).forEach(([sectionId, section]) => {
        if (!section.id) errors.push(`Section ${sectionId} missing id`)
        if (!section.type) errors.push(`Section ${sectionId} missing type`)
        if (!section.content) errors.push(`Section ${sectionId} missing content`)
        if (!section.metadata) errors.push(`Section ${sectionId} missing metadata`)
      })
    })
    
    return errors
  },
  
  validateHistoryIntegrity: (project: BuilderState): string[] => {
    const errors: string[] = []
    
    project.history.stack.forEach((snapshot, index) => {
      if (!snapshot.id) errors.push(`Snapshot ${index} missing id`)
      if (!snapshot.timestamp || snapshot.timestamp < 0) {
        errors.push(`Snapshot ${index} invalid timestamp`)
      }
      if (!snapshot.layoutId) errors.push(`Snapshot ${index} missing layoutId`)
      if (!snapshot.sectionsState) errors.push(`Snapshot ${index} missing sectionsState`)
    })
    
    return errors
  }
}

// Development helpers
if (process.env.NODE_ENV === 'development') {
  (window as any).generateMockProjectData = generateMockProjectData
  (window as any).mockDataValidators = mockDataValidators
}