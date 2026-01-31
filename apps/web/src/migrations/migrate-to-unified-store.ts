/**
 * Migration Script - Convert existing stores to unified store
 * Expert requirement: Migration with fallbacks + validation
 */

import type { 
  BuilderState, 
  Layout, 
  SectionState, 
  Snapshot 
} from '@/store/builder-store'

// Types for old store data (based on existing architecture)
interface OldSectionHistory {
  history: Array<{
    id: string
    timestamp: number
    userAction: string
    content: any
  }>
  currentIndex: number
}

interface OldPerSectionHistoryStore {
  histories: Record<string, OldSectionHistory>
}

interface OldQuestionFlowStore {
  currentLayoutId: string
  layouts: Array<{
    id: string
    name: string
    sections?: Array<{
      id: string
      type: string
      content?: any
      styles?: any
    }>
  }>
  currentQuestion?: any
  answers?: Record<string, any>
}

interface MigrationResult {
  success: boolean
  data?: BuilderState
  errors: string[]
  warnings: string[]
  fallbackUsed: boolean
}

// Validation helpers
function validateSectionState(section: any, sectionId: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!section) {
    errors.push(`Section ${sectionId} is null or undefined`)
    return { isValid: false, errors }
  }
  
  if (!section.id) errors.push(`Section ${sectionId} missing id`)
  if (!section.type) errors.push(`Section ${sectionId} missing type`)
  if (!section.content) errors.push(`Section ${sectionId} missing content`)
  if (!section.metadata) errors.push(`Section ${sectionId} missing metadata`)
  
  // Validate content structure
  if (section.content && typeof section.content !== 'object') {
    errors.push(`Section ${sectionId} content must be object`)
  }
  
  if (section.content && !section.content.hasOwnProperty('html')) {
    errors.push(`Section ${sectionId} content missing html property`)
  }
  
  if (section.content && !section.content.hasOwnProperty('props')) {
    errors.push(`Section ${sectionId} content missing props property`)
  }
  
  return { isValid: errors.length === 0, errors }
}

function validateLayoutStructure(layout: any, layoutId: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!layout) {
    errors.push(`Layout ${layoutId} is null or undefined`)
    return { isValid: false, errors }
  }
  
  if (!layout.id) errors.push(`Layout ${layoutId} missing id`)
  if (!layout.name) errors.push(`Layout ${layoutId} missing name`)
  
  if (layout.sections) {
    if (typeof layout.sections !== 'object') {
      errors.push(`Layout ${layoutId} sections must be object or array`)
    } else if (Array.isArray(layout.sections)) {
      // Handle array format - old store might have sections as array
      layout.sections.forEach((section: any, index: number) => {
        if (section && section.id) {
          const validation = validateSectionState(section, section.id)
          if (!validation.isValid) {
            errors.push(`Section ${section.id || index} validation failed: ${validation.errors.join(', ')}`)
          }
        }
      })
    } else {
      // Handle object format
      Object.entries(layout.sections).forEach(([sectionId, section]) => {
        const validation = validateSectionState(section, sectionId)
        if (!validation.isValid) {
          errors.push(`Section ${sectionId} validation failed: ${validation.errors.join(', ')}`)
        }
      })
    }
  }
  
  return { isValid: errors.length === 0, errors }
}

// Migration functions
function createDefaultSectionState(
  id: string, 
  type: SectionState['type'] = 'hero',
  overrides?: Partial<SectionState>
): SectionState {
  return {
    id,
    type,
    content: {
      html: `<div class="${type}-section">Default ${type} content</div>`,
      props: {
        title: `Default ${type} Title`,
        subtitle: `Default ${type} subtitle`
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
      userAction: 'migration',
      aiGenerated: false
    },
    ...overrides
  }
}

function migrateSection(oldSection: any, sectionId: string): SectionState | null {
  // Handle null/undefined sections
  if (!oldSection) {
    console.warn(`Section ${sectionId} is null/undefined, skipping`)
    return null
  }
  
  // Extract valid section type
  const validTypes: SectionState['type'][] = ['hero', 'features', 'pricing', 'testimonials', 'cta', 'footer']
  const sectionType = validTypes.includes(oldSection.type) ? oldSection.type : 'hero'
  
  // Even if validation fails, try to extract what we can
  return {
    id: oldSection.id || sectionId,
    type: sectionType,
    content: {
      html: oldSection.content?.html || `<div>Migrated ${sectionType} content</div>`,
      props: oldSection.content?.props || {}
    },
    styles: {
      css: oldSection.styles?.css || '',
      variables: oldSection.styles?.variables || {}
    },
    metadata: {
      lastModified: oldSection.metadata?.lastModified || Date.now(),
      userAction: oldSection.metadata?.userAction || 'migration',
      aiGenerated: oldSection.metadata?.aiGenerated || false
    }
  }
}

function migrateLayout(oldLayout: any): Layout | null {
  // Handle null layouts
  if (!oldLayout) {
    console.warn('Layout is null, skipping')
    return null
  }
  
  const layoutId = oldLayout.id || `fallback-${Date.now()}`
  const layoutName = oldLayout.name || 'Migrated Layout'
  
  const sections: Record<string, SectionState> = {}
  
  if (oldLayout.sections) {
    if (Array.isArray(oldLayout.sections)) {
      // Convert array format to object
      oldLayout.sections.forEach((section: any, index: number) => {
        if (section) {
          const sectionId = section.id || `section-${index}`
          const migratedSection = migrateSection(section, sectionId)
          if (migratedSection) {
            sections[sectionId] = migratedSection
          }
        }
      })
    } else if (typeof oldLayout.sections === 'object') {
      // Already object format
      Object.entries(oldLayout.sections).forEach(([sectionId, section]) => {
        const migratedSection = migrateSection(section, sectionId)
        if (migratedSection) {
          sections[sectionId] = migratedSection
        }
      })
    }
  }
  
  // Ensure at least one section exists
  if (Object.keys(sections).length === 0) {
    sections['hero-1'] = createDefaultSectionState('hero-1', 'hero')
  }
  
  return {
    id: layoutId,
    name: layoutName,
    sections
  }
}

function migrateHistory(
  oldHistories: Record<string, OldSectionHistory>,
  layoutId: string,
  sections: Record<string, SectionState>
): { stack: Snapshot[]; index: number } {
  const snapshots: Snapshot[] = []
  
  try {
    // Find all unique timestamps across all section histories
    const allTimestamps = new Set<number>()
    Object.values(oldHistories).forEach(sectionHistory => {
      sectionHistory.history.forEach(entry => {
        if (entry.timestamp && entry.timestamp > 0) {
          allTimestamps.add(entry.timestamp)
        }
      })
    })
    
    const sortedTimestamps = Array.from(allTimestamps).sort()
    
    // Create snapshots for each timestamp
    sortedTimestamps.forEach((timestamp, index) => {
      const sectionsStateAtTime: Record<string, SectionState> = { ...sections }
      let userAction = 'migration'
      
      // Apply all section changes up to this timestamp
      Object.entries(oldHistories).forEach(([sectionId, sectionHistory]) => {
        const relevantEntries = sectionHistory.history.filter(
          entry => entry.timestamp <= timestamp
        )
        
        if (relevantEntries.length > 0) {
          const latestEntry = relevantEntries[relevantEntries.length - 1]
          
          if (sectionsStateAtTime[sectionId]) {
            sectionsStateAtTime[sectionId] = {
              ...sectionsStateAtTime[sectionId],
              content: latestEntry.content || sectionsStateAtTime[sectionId].content,
              metadata: {
                ...sectionsStateAtTime[sectionId].metadata,
                lastModified: latestEntry.timestamp,
                userAction: latestEntry.userAction || 'migration'
              }
            }
            userAction = latestEntry.userAction || userAction
          }
        }
      })
      
      snapshots.push({
        id: `migration-${timestamp}-${index}`,
        timestamp,
        userAction,
        layoutId,
        sectionsState: sectionsStateAtTime
      })
    })
  } catch (error) {
    console.warn('Failed to migrate history, starting with empty history:', error)
    return { stack: [], index: -1 }
  }
  
  return {
    stack: snapshots,
    index: snapshots.length > 0 ? snapshots.length - 1 : -1
  }
}

// Main migration function
export function migrateToUnifiedStore(
  oldPerSectionStore?: OldPerSectionHistoryStore,
  oldQuestionFlowStore?: OldQuestionFlowStore
): MigrationResult {
  const errors: string[] = []
  const warnings: string[] = []
  let fallbackUsed = false
  
  try {
    // Validate input data
    if (!oldQuestionFlowStore && !oldPerSectionStore) {
      errors.push('No store data provided for migration')
      return { success: false, errors, warnings, fallbackUsed: true }
    }
    
    // Generate project ID
    const projectId = `migrated-${Date.now()}`
    
    // Migrate layouts
    const layouts: Record<string, Layout> = {}
    let currentLayoutId = ''
    
    if (oldQuestionFlowStore?.layouts) {
      if (Array.isArray(oldQuestionFlowStore.layouts)) {
        let hasInvalidLayouts = false
        oldQuestionFlowStore.layouts.forEach(oldLayout => {
          try {
            const migratedLayout = migrateLayout(oldLayout)
            if (migratedLayout) {
              layouts[migratedLayout.id] = migratedLayout
              
              if (!currentLayoutId) {
                currentLayoutId = migratedLayout.id
              }
            } else {
              warnings.push(`Layout validation failed for ${oldLayout?.id}`)
              hasInvalidLayouts = true
            }
          } catch (error) {
            warnings.push(`Failed to migrate layout ${oldLayout?.id}: ${error}`)
            hasInvalidLayouts = true
          }
        })
        if (hasInvalidLayouts) {
          fallbackUsed = true
        }
      } else {
        warnings.push('Layouts data is not an array, skipping layout migration')
      }
    }
    
    // Set current layout from old store
    if (oldQuestionFlowStore?.currentLayoutId) {
      if (layouts[oldQuestionFlowStore.currentLayoutId]) {
        currentLayoutId = oldQuestionFlowStore.currentLayoutId
      } else {
        warnings.push(`Current layout ID '${oldQuestionFlowStore.currentLayoutId}' not found in migrated layouts`)
        fallbackUsed = true
      }
    }
    
    // Create fallback layout if none exist
    if (Object.keys(layouts).length === 0) {
      const fallbackLayout: Layout = {
        id: 'fallback-layout',
        name: 'Default Layout',
        sections: {
          'hero-1': createDefaultSectionState('hero-1', 'hero'),
          'features-1': createDefaultSectionState('features-1', 'features')
        }
      }
      layouts['fallback-layout'] = fallbackLayout
      currentLayoutId = 'fallback-layout'
      fallbackUsed = true
      warnings.push('No valid layouts found, created fallback layout')
    }
    
    // Migrate history
    let history: { stack: Snapshot[]; index: number } = { stack: [], index: -1 }
    
    if (oldPerSectionStore?.histories && currentLayoutId && layouts[currentLayoutId]) {
      try {
        history = migrateHistory(
          oldPerSectionStore.histories,
          currentLayoutId,
          layouts[currentLayoutId].sections
        )
      } catch (error) {
        warnings.push(`Failed to migrate history: ${error}`)
        history = { stack: [], index: -1 }
      }
    }
    
    // Create migrated state
    const migratedState: BuilderState = {
      projectId,
      layouts,
      history,
      ui: {
        currentLayoutId,
        modal: null,
        activeEditSection: null,
        previewMode: 'edit' as const
      },
      sectionHistory: {},
      sectionOverrides: {},
      codeEditHistory: {},
      activeCodeEdit: null
    }
    
    // Final validation
    const finalValidation = validateMigratedState(migratedState)
    if (!finalValidation.isValid) {
      warnings.push(...finalValidation.errors)
      // Don't fail the migration, just report warnings
    }
    
    return {
      success: true,
      data: migratedState,
      errors,
      warnings,
      fallbackUsed
    }
    
  } catch (error) {
    errors.push(`Migration failed with error: ${error}`)
    return { success: false, errors, warnings, fallbackUsed: true }
  }
}

// Validation for migrated state
function validateMigratedState(state: BuilderState): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!state.projectId) errors.push('Missing projectId')
  if (!state.layouts || Object.keys(state.layouts).length === 0) {
    errors.push('No layouts in migrated state')
  }
  if (!state.history) errors.push('Missing history object')
  if (!state.ui) errors.push('Missing ui object')
  
  if (state.ui.currentLayoutId && !state.layouts[state.ui.currentLayoutId]) {
    errors.push(`Current layout ID '${state.ui.currentLayoutId}' does not exist in layouts`)
    // Auto-fix by selecting first available layout
    const firstLayoutId = Object.keys(state.layouts)[0]
    if (firstLayoutId) {
      state.ui.currentLayoutId = firstLayoutId
    }
  }
  
  // Validate each layout
  Object.entries(state.layouts).forEach(([layoutId, layout]) => {
    const validation = validateLayoutStructure(layout, layoutId)
    errors.push(...validation.errors)
  })
  
  return { isValid: errors.length === 0, errors }
}

// Utility functions for external use
export const migrationUtils = {
  validateOldStoreData: (data: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = []
    
    if (!data) {
      errors.push('No data provided')
      return { isValid: false, errors }
    }
    
    if (typeof data !== 'object') {
      errors.push('Data must be an object')
      return { isValid: false, errors }
    }
    
    return { isValid: errors.length === 0, errors }
  },
  
  createEmptyStore: (): BuilderState => ({
    projectId: `empty-${Date.now()}`,
    layouts: {},
    history: { stack: [], index: -1 },
    ui: { currentLayoutId: '', modal: null, activeEditSection: null, previewMode: 'edit' as const },
    sectionHistory: {},
    sectionOverrides: {},
    codeEditHistory: {},
    activeCodeEdit: null
  }),
  
  repairCorruptedState: (state: BuilderState): BuilderState => {
    const repairs: string[] = []
    
    // Repair missing projectId
    if (!state.projectId) {
      state.projectId = `repaired-${Date.now()}`
      repairs.push('Added missing projectId')
    }
    
    // Repair missing layouts
    if (!state.layouts) {
      state.layouts = {}
      repairs.push('Added missing layouts object')
    }
    
    // Repair missing history
    if (!state.history) {
      state.history = { stack: [], index: -1 }
      repairs.push('Added missing history object')
    }
    
    // Repair missing UI
    if (!state.ui) {
      state.ui = { currentLayoutId: '', modal: null, activeEditSection: null, previewMode: 'edit' as const }
      repairs.push('Added missing ui object')
    }
    
    // Repair invalid current layout
    if (state.ui.currentLayoutId && !state.layouts[state.ui.currentLayoutId]) {
      const firstLayoutId = Object.keys(state.layouts)[0]
      state.ui.currentLayoutId = firstLayoutId || ''
      repairs.push('Fixed invalid currentLayoutId')
    }
    
    if (repairs.length > 0) {
      console.warn('State repairs applied:', repairs)
    }
    
    return state
  }
}

// Development helpers
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  ;(window as any).migrateToUnifiedStore = migrateToUnifiedStore
  // migrationUtils is defined elsewhere
}