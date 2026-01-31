/**
 * Unified Builder Store - Single Source of Truth
 * Expert-validated architecture: Zustand + Immer for structured state + cheap snapshots
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'
import { shallow } from 'zustand/shallow'
import { events } from '@/utils/event-logger'

// Core data types
export interface SectionState {
  id: string
  type: 'hero' | 'features' | 'pricing' | 'testimonials' | 'cta' | 'footer'
  content: {
    html: string
    props: Record<string, any>
  }
  styles: {
    css: string
    variables: Record<string, string>
  }
  metadata: {
    lastModified: number
    userAction: string
    aiGenerated: boolean
  }
  // Pixel-perfect preview fields
  componentSource?: string // TSX source code
  componentHash?: string   // SHA-256 hash for caching
  componentPath?: string   // Original file path from template
  deps?: string[]         // Component dependencies
  defaultProps?: Record<string, any> // Default props from auto-binding
  editableKeys?: string[] // Keys that can be edited
  propMetadata?: Record<string, any> // Metadata about props
}

export interface Layout {
  id: string
  name: string
  sections: Record<string, SectionState>
}

export interface Snapshot {
  id: string
  timestamp: number
  userAction: string
  layoutId: string
  sectionId?: string // Track which section was modified
  isUndoRedo?: boolean // Track if this is an undo/redo operation
  sectionsState: Record<string, SectionState>
}

// Section override for props without modifying code
export interface SectionOverride {
  overrides: Record<string, any>
  defaultHash: string
  lastModified: number
}

// Code patch record for prompt-to-code editing
export interface PatchRecord {
  id: string
  timestamp: number
  prompt: string
  patch: {
    type: 'ast' | 'string' | 'regex'
    description: string
    diff: string
    oldContent: string
    newContent: string
    tier: number
  }
  status: 'applied' | 'reverted'
}

export interface BuilderState {
  projectId: string
  layouts: Record<string, Layout>
  history: {
    stack: Snapshot[]
    index: number
  }
  sectionHistory: {
    // Track undo/redo state per section: sectionId -> { undoStack: Snapshot[], redoStack: Snapshot[] }
    [sectionId: string]: {
      undoStack: Snapshot[]
      redoStack: Snapshot[]
    }
  }
  ui: {
    currentLayoutId: string
    modal: 'edit' | null
    activeEditSection: string | null
    previewMode: 'edit' | 'preview' | 'compiled' // New: Toggle between edit, preview, and compiled modes
  }
  // Props override system (from iframe implementation)
  sectionOverrides: Record<string, SectionOverride>
  // Code editing state (from prompt-to-code implementation)
  codeEditHistory: Record<string, PatchRecord[]>
  activeCodeEdit: {
    sectionId: string
    originalSource: string
    currentSource: string
    patches: PatchRecord[]
  } | null
}

// Action types for type safety
export interface BuilderActions {
  // Core actions
  applyEdit: (sectionId: string, newContent: SectionState['content'], userAction: string) => void
  undo: () => void
  redo: () => void
  undoSection: (sectionId: string) => void
  redoSection: (sectionId: string) => void
  switchLayout: (layoutId: string) => void
  
  // UI actions
  setModal: (modal: 'edit' | null) => void
  setActiveEditSection: (sectionId: string | null) => void
  setPreviewMode: (mode: 'edit' | 'preview' | 'compiled') => void
  
  // Project actions
  initializeProject: (projectId: string) => void
  loadProjectData: (projectData: any) => void
  addLayout: (layout: Layout) => void
  addSection: (section: SectionState) => void
  clearSections: () => void
  
  // Utility actions
  clearHistory: () => void
  resetState: () => void
  
  // Props override actions (for iframe preview)
  setSectionOverride: (sectionId: string, overrides: Record<string, any>) => void
  clearSectionOverride: (sectionId: string) => void
  getSectionProps: (sectionId: string) => Record<string, any>
  getSectionPropsWithMetadata: (sectionId: string) => {
    props: Record<string, any>
    hasOverrides: boolean
    overrideCount: number
  }
  
  // Code editing actions (for prompt-to-code)
  startCodeEdit: (sectionId: string) => void
  applyCodePatch: (sectionId: string, patch: PatchRecord['patch'], prompt: string) => Promise<void>
  revertCodeEdit: (sectionId: string, steps?: number) => void
  commitCodeEdit: (sectionId: string) => void
  updateSectionCode: (sectionId: string, newSource: string, patch?: PatchRecord['patch']) => void
}

// Pure reducer functions (easily testable)
export const reducers = {
  applyEdit: (
    state: BuilderState,
    sectionId: string,
    newContent: SectionState['content'],
    userAction: string
  ): BuilderState => {
    const currentLayout = state.layouts[state.ui.currentLayoutId]
    if (!currentLayout) {
      console.warn(`Cannot apply edit: layout ${state.ui.currentLayoutId} not found`)
      return state
    }

    const existingSection = currentLayout.sections[sectionId]
    if (!existingSection) {
      console.warn(`Cannot apply edit: section ${sectionId} not found`)
      return state
    }

    // Save the current section state to the undo stack before making changes
    if (!state.sectionHistory) {
      state.sectionHistory = {}
    }
    if (!state.sectionHistory[sectionId]) {
      state.sectionHistory[sectionId] = { undoStack: [], redoStack: [] }
    }
    
    // Create snapshot of the current state (before edit) for undo
    const undoSnapshot: Snapshot = {
      id: generateId(),
      timestamp: Date.now(),
      userAction: `Before: ${userAction}`,
      layoutId: state.ui.currentLayoutId,
      sectionId: sectionId,
      sectionsState: { ...currentLayout.sections }
    }
    
    // Add to undo stack and clear redo stack (new edit breaks redo chain)
    state.sectionHistory[sectionId].undoStack.push(undoSnapshot)
    state.sectionHistory[sectionId].redoStack = []

    // Create new section with updated content
    const newSection: SectionState = {
      ...existingSection,
      content: newContent,
      metadata: {
        ...existingSection.metadata,
        lastModified: Date.now(),
        userAction
      }
    }

    // Update the section in place using Immer
    state.layouts[state.ui.currentLayoutId].sections[sectionId] = newSection

    // Create snapshot of the NEW state (after edit) for global history
    const snapshot: Snapshot = {
      id: generateId(),
      timestamp: Date.now(),
      userAction,
      layoutId: state.ui.currentLayoutId,
      sectionId: sectionId, // Track which section was modified
      sectionsState: { ...state.layouts[state.ui.currentLayoutId].sections }
    }

    // Update history in place using Immer
    state.history.stack = [...state.history.stack.slice(0, state.history.index + 1), snapshot]
    state.history.index = state.history.index + 1

    // Emit event for logging
    events.emit('store:action', {
      type: 'applyEdit',
      payload: { sectionId, userAction },
      timestamp: Date.now()
    })

    return state
  },

  undo: (state: BuilderState): BuilderState => {
    if (state.history.index < 0) {
      console.warn('Cannot undo: no history available')
      return state
    }

    const currentLayout = state.layouts[state.ui.currentLayoutId]
    if (!currentLayout) {
      console.warn(`Cannot undo: layout ${state.ui.currentLayoutId} not found`)
      return state
    }

    // If we're at index 0, we can still undo to move to index -1 (empty state)
    if (state.history.index === 0) {
      // Emit event for logging
      events.emit('store:action', {
        type: 'undo',
        payload: { layoutId: state.ui.currentLayoutId },
        timestamp: Date.now()
      })

      return {
        ...state,
        history: {
          ...state.history,
          index: -1
        }
      }
    }

    // Get the previous state (one step back)
    const snapshot = state.history.stack[state.history.index - 1]

    // Emit event for logging
    events.emit('store:action', {
      type: 'undo',
      payload: { layoutId: state.ui.currentLayoutId },
      timestamp: Date.now()
    })

    return {
      ...state,
      layouts: {
        ...state.layouts,
        [state.ui.currentLayoutId]: {
          ...currentLayout,
          sections: { ...snapshot.sectionsState }
        }
      },
      history: {
        ...state.history,
        index: state.history.index - 1
      }
    }
  },

  redo: (state: BuilderState): BuilderState => {
    if (state.history.index >= state.history.stack.length - 1) {
      console.warn('Cannot redo: no forward history available')
      return state
    }

    const snapshot = state.history.stack[state.history.index + 1]
    const currentLayout = state.layouts[state.ui.currentLayoutId]

    if (!currentLayout) {
      console.warn(`Cannot redo: layout ${state.ui.currentLayoutId} not found`)
      return state
    }

    // Emit event for logging
    events.emit('store:action', {
      type: 'redo',
      payload: { layoutId: state.ui.currentLayoutId },
      timestamp: Date.now()
    })

    return {
      ...state,
      layouts: {
        ...state.layouts,
        [state.ui.currentLayoutId]: {
          ...currentLayout,
          sections: { ...snapshot.sectionsState }
        }
      },
      history: {
        ...state.history,
        index: state.history.index + 1
      }
    }
  },

  undoSection: (state: BuilderState, sectionId: string): BuilderState => {
    if (!state.sectionHistory) {
      state.sectionHistory = {}
    }
    const sectionHist = state.sectionHistory[sectionId]
    if (!sectionHist || sectionHist.undoStack.length === 0) {
      console.warn(`Cannot undo section ${sectionId}: no undo history available`)
      return state
    }

    const currentLayout = state.layouts[state.ui.currentLayoutId]
    if (!currentLayout) {
      console.warn(`Cannot undo: layout ${state.ui.currentLayoutId} not found`)
      return state
    }

    // Get the snapshot to restore from undo stack
    const undoSnapshot = sectionHist.undoStack[sectionHist.undoStack.length - 1]
    
    // Create snapshot of current state for redo stack
    const currentSnapshot: Snapshot = {
      id: generateId(),
      timestamp: Date.now(),
      userAction: `Before undo: ${sectionId}`,
      layoutId: state.ui.currentLayoutId,
      sectionId: sectionId,
      sectionsState: { ...currentLayout.sections }
    }

    // Pop from undo stack and push to redo stack using Immer
    state.sectionHistory[sectionId].undoStack.pop()
    state.sectionHistory[sectionId].redoStack.push(currentSnapshot)

    // Apply the undo - restore only the target section using Immer
    state.layouts[state.ui.currentLayoutId].sections[sectionId] = undoSnapshot.sectionsState[sectionId]

    // Emit event for logging
    events.emit('store:action', {
      type: 'undoSection',
      payload: { sectionId, layoutId: state.ui.currentLayoutId },
      timestamp: Date.now()
    })

    return state
  },

  redoSection: (state: BuilderState, sectionId: string): BuilderState => {
    if (!state.sectionHistory) {
      state.sectionHistory = {}
    }
    const sectionHist = state.sectionHistory[sectionId]
    if (!sectionHist || sectionHist.redoStack.length === 0) {
      console.warn(`Cannot redo section ${sectionId}: no redo history available`)
      return state
    }

    const currentLayout = state.layouts[state.ui.currentLayoutId]
    if (!currentLayout) {
      console.warn(`Cannot redo: layout ${state.ui.currentLayoutId} not found`)
      return state
    }

    // Get the snapshot to restore from redo stack
    const redoSnapshot = sectionHist.redoStack[sectionHist.redoStack.length - 1]
    
    // Create snapshot of current state for undo stack
    const currentSnapshot: Snapshot = {
      id: generateId(),
      timestamp: Date.now(),
      userAction: `Before redo: ${sectionId}`,
      layoutId: state.ui.currentLayoutId,
      sectionId: sectionId,
      sectionsState: { ...currentLayout.sections }
    }

    // Pop from redo stack and push to undo stack using Immer
    state.sectionHistory[sectionId].redoStack.pop()
    state.sectionHistory[sectionId].undoStack.push(currentSnapshot)

    // Apply the redo - restore only the target section using Immer
    state.layouts[state.ui.currentLayoutId].sections[sectionId] = redoSnapshot.sectionsState[sectionId]

    // Emit event for logging
    events.emit('store:action', {
      type: 'redoSection',
      payload: { sectionId, layoutId: state.ui.currentLayoutId },
      timestamp: Date.now()
    })

    return state
  },

  switchLayout: (state: BuilderState, layoutId: string): BuilderState => {
    if (!state.layouts[layoutId]) {
      console.warn(`Cannot switch to layout: ${layoutId} not found`)
      return state
    }

    // Emit event for logging
    events.emit('store:action', {
      type: 'switchLayout',
      payload: { layoutId },
      timestamp: Date.now()
    })

    return {
      ...state,
      ui: {
        ...state.ui,
        currentLayoutId: layoutId,
        modal: null, // Close any open modals
        activeEditSection: null // Clear active edit
      }
      // History is preserved per layout automatically
    }
  }
}

// Stable empty object to prevent re-renders
const EMPTY_SECTIONS = {}

// Safe helper to get current layout
const getCurrentLayout = (state: BuilderState): Layout | null => {
  const layoutId = state.ui.currentLayoutId
  if (!layoutId || !state.layouts[layoutId]) {
    return null
  }
  return state.layouts[layoutId]
}

// Selectors (derived state) - memoized to prevent infinite loops
export const selectors = {
  previewMode: (state: BuilderState) => state.ui.previewMode,
  isEditMode: (state: BuilderState) => state.ui.previewMode === 'edit',
  isPreviewMode: (state: BuilderState) => state.ui.previewMode === 'preview',
  isCompiledMode: (state: BuilderState) => state.ui.previewMode === 'compiled',
  canUndo: (state: BuilderState) => {
    // No history at all
    if (state.history.index < 0 || state.history.stack.length === 0) {
      return false
    }
    
    // If we only have one snapshot and it's the initialization baseline, can't undo
    if (state.history.stack.length === 1 && state.history.stack[0]?.userAction === 'Project initialized') {
      return false
    }
    
    // Otherwise, can undo if we have history beyond index 0 or if current snapshot is not initialization
    return state.history.index > 0 || (state.history.index === 0 && state.history.stack[0]?.userAction !== 'Project initialized')
  },
  canRedo: (state: BuilderState) => state.history.index < state.history.stack.length - 1,
  canUndoSection: (sectionId: string) => (state: BuilderState) => {
    const sectionHist = state.sectionHistory[sectionId]
    return sectionHist ? sectionHist.undoStack.length > 0 : false
  },
  canRedoSection: (sectionId: string) => (state: BuilderState) => {
    const sectionHist = state.sectionHistory[sectionId]
    return sectionHist ? sectionHist.redoStack.length > 0 : false
  },
  currentLayout: (state: BuilderState) => getCurrentLayout(state),
  currentSections: (state: BuilderState) => {
    const layout = getCurrentLayout(state)
    return layout?.sections || EMPTY_SECTIONS
  },
  historyLength: (state: BuilderState) => state.history.stack.length,
  hasUnsavedChanges: (state: BuilderState) => state.history.stack.length > 0,
  // Add a selector for store readiness
  isStoreReady: (state: BuilderState) => !!state.projectId && !!state.ui.currentLayoutId
}

// Utility functions
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Initial state
const initialState: BuilderState = {
  projectId: '',
  layouts: {},
  history: {
    stack: [],
    index: -1
  },
  sectionHistory: {},
  ui: {
    currentLayoutId: '',
    modal: null,
    activeEditSection: null,
    previewMode: 'edit' as const
  },
  sectionOverrides: {},
  codeEditHistory: {},
  activeCodeEdit: null
}

// Create the store with all middleware
export const useBuilderStore = create<BuilderState & BuilderActions>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...initialState,

        // Actions using pure reducers
        applyEdit: (sectionId: string, newContent: SectionState['content'], userAction: string) => {
          set((state) => {
            const newState = reducers.applyEdit(state, sectionId, newContent, userAction)
            return newState
          })
        },

        undo: () => {
          set((state) => {
            const newState = reducers.undo(state)
            return newState
          })
        },

        redo: () => {
          set((state) => {
            const newState = reducers.redo(state)
            return newState
          })
        },

        switchLayout: (layoutId: string) => {
          set((state) => {
            const newState = reducers.switchLayout(state, layoutId)
            return newState
          })
        },

        undoSection: (sectionId: string) => {
          set((state) => {
            const newState = reducers.undoSection(state, sectionId)
            return newState
          })
        },

        redoSection: (sectionId: string) => {
          set((state) => {
            const newState = reducers.redoSection(state, sectionId)
            return newState
          })
        },

        // UI actions
        setModal: (modal: 'edit' | null) => {
          set((state) => {
            state.ui.modal = modal
          })
        },

        setActiveEditSection: (sectionId: string | null) => {
          set((state) => {
            state.ui.activeEditSection = sectionId
          })
        },
        setPreviewMode: (mode: 'edit' | 'preview' | 'compiled') => {
          set((state) => {
            state.ui.previewMode = mode
            // Clear active edit section when switching to preview mode
            if (mode === 'preview') {
              state.ui.activeEditSection = null
              state.ui.modal = null
            }
          })
          // Emit event for analytics
          events.emit('previewModeChanged', { mode, timestamp: Date.now() })
        },

        // Project actions
        initializeProject: (projectId: string) => {
          console.log('🏪 initializeProject called for:', projectId)
          set((state) => {
            state.projectId = projectId
            
            // Create a default layout if none exist
            const defaultLayoutId = 'default-layout'
            const defaultLayout: Layout = {
              id: defaultLayoutId,
              name: 'Default Layout',
              sections: {}
            }
            
            state.layouts = {
              [defaultLayoutId]: defaultLayout
            }
            
            // Create baseline snapshot (empty state)
            const baselineSnapshot: Snapshot = {
              id: generateId(),
              timestamp: Date.now(),
              userAction: 'Project initialized',
              layoutId: defaultLayoutId,
              sectionsState: {}
            }
            
            state.history = { 
              stack: [baselineSnapshot], 
              index: 0 
            }
            state.sectionHistory = {}
            state.ui = { 
              currentLayoutId: defaultLayoutId, 
              modal: null, 
              activeEditSection: null,
              previewMode: 'edit' as const
            }
            console.log('✅ initializeProject completed. Store state:', {
              projectId: state.projectId,
              layoutId: state.ui.currentLayoutId,
              hasLayout: !!state.layouts[defaultLayoutId],
              sectionsCount: Object.keys(state.layouts[defaultLayoutId].sections).length
            })
          })
        },

        loadProjectData: (projectData: any) => {
          set((state) => {
            console.log('🔄 Loading project data into builder store:', projectData)
            console.log('🔄 Project data keys:', Object.keys(projectData || {}))
            console.log('🔄 Has sections?', !!projectData?.sections)
            console.log('🔄 Sections keys:', projectData?.sections ? Object.keys(projectData.sections) : 'no sections')
            
            // Handle different project data structures
            if (!projectData) {
              console.warn('No project data to load')
              return
            }

            // Check if we have sections data from the project
            const sections = projectData.sections || projectData.content?.sections || {}
            const layouts = projectData.layouts || projectData.content?.layouts || {}
            
            // If we have layouts with sections, load them
            if (Object.keys(layouts).length > 0) {
              Object.entries(layouts).forEach(([layoutId, layoutData]: [string, any]) => {
                const layout: Layout = {
                  id: layoutId,
                  name: layoutData.name || layoutId,
                  sections: {}
                }
                
                // Load sections for this layout
                if (layoutData.sections) {
                  Object.entries(layoutData.sections).forEach(([sectionId, sectionData]: [string, any]) => {
                    layout.sections[sectionId] = {
                      id: sectionId,
                      type: sectionData.type || 'hero',
                      content: sectionData.content || { html: '', props: {} },
                      styles: sectionData.styles || { css: '', variables: {} },
                      metadata: sectionData.metadata || {
                        lastModified: Date.now(),
                        userAction: 'loaded',
                        aiGenerated: true
                      }
                    }
                  })
                }
                
                state.layouts[layoutId] = layout
              })
              
              // Set the first layout as current if none is set
              if (!state.ui.currentLayoutId && Object.keys(state.layouts).length > 0) {
                state.ui.currentLayoutId = Object.keys(state.layouts)[0]
              }
            }
            // If we have sections but no layouts, create a default layout with the sections
            else if (Object.keys(sections).length > 0) {
              const defaultLayoutId = 'default-layout'
              const defaultLayout: Layout = {
                id: defaultLayoutId,
                name: 'Default Layout',
                sections: {}
              }
              
              // Convert sections to the correct format
              Object.entries(sections).forEach(([sectionKey, sectionData]: [string, any]) => {
                // Use the section's own ID and type if available
                const sectionId = sectionData.id || sectionKey
                const sectionType = sectionData.type || sectionKey
                
                defaultLayout.sections[sectionId] = {
                  id: sectionId,
                  type: sectionType as SectionState['type'],
                  content: {
                    html: sectionData.html || sectionData.content?.html || '',
                    props: sectionData.props || sectionData.content?.props || {}
                  },
                  styles: {
                    css: sectionData.css || sectionData.styles?.css || '',
                    variables: sectionData.variables || sectionData.styles?.variables || {}
                  },
                  metadata: {
                    lastModified: sectionData.lastModified || sectionData.metadata?.lastModified || Date.now(),
                    userAction: sectionData.metadata?.userAction || 'loaded',
                    aiGenerated: sectionData.metadata?.aiGenerated !== undefined ? sectionData.metadata.aiGenerated : true
                  },
                  // Pixel-perfect preview fields
                  componentSource: sectionData.componentSource || undefined,
                  componentHash: sectionData.componentHash || undefined,
                  componentPath: sectionData.componentPath || undefined,
                  deps: sectionData.deps || []
                }
              })
              
              state.layouts[defaultLayoutId] = defaultLayout
              state.ui.currentLayoutId = defaultLayoutId
            }
            
            console.log('✅ Project data loaded:', {
              layoutCount: Object.keys(state.layouts).length,
              currentLayout: state.ui.currentLayoutId,
              sectionCount: state.layouts[state.ui.currentLayoutId]?.sections 
                ? Object.keys(state.layouts[state.ui.currentLayoutId].sections).length 
                : 0
            })
          })
        },

        addLayout: (layout: Layout) => {
          set((state) => {
            state.layouts[layout.id] = layout
            // Set as current if it's the first layout
            if (!state.ui.currentLayoutId) {
              state.ui.currentLayoutId = layout.id
            }
          })
        },

        addSection: (section: SectionState) => {
          console.log('🏗️ addSection called with:', {
            sectionId: section.id,
            sectionType: section.type,
            currentLayoutId: get().ui.currentLayoutId,
            hasCurrentLayout: !!get().layouts[get().ui.currentLayoutId]
          })
          
          set((state) => {
            const currentLayout = state.layouts[state.ui.currentLayoutId]
            if (currentLayout) {
              // Add section to layout first
              currentLayout.sections[section.id] = section
              
              // Create snapshot of the NEW state (after adding section)
              const snapshot: Snapshot = {
                id: generateId(),
                timestamp: Date.now(),
                userAction: `Add ${section.type} section`,
                layoutId: state.ui.currentLayoutId,
                sectionId: section.id, // Track which section was added
                sectionsState: { ...currentLayout.sections }
              }
              
              console.log('📸 Creating history snapshot after adding section:', {
                snapshotId: snapshot.id,
                userAction: snapshot.userAction,
                newSectionsCount: Object.keys(currentLayout.sections).length
              })
              
              // Add snapshot to history (truncate if we're not at the end)
              state.history.stack = [...state.history.stack.slice(0, state.history.index + 1), snapshot]
              state.history.index = state.history.index + 1
              
              console.log('✅ Section added with history:', {
                layoutId: state.ui.currentLayoutId,
                sectionId: section.id,
                sectionType: section.type,
                newSectionsCount: Object.keys(currentLayout.sections).length,
                historyIndex: state.history.index,
                historyLength: state.history.stack.length
              })
              
              // Emit event for logging
              events.emit('store:action', {
                type: 'addSection',
                payload: { sectionId: section.id, sectionType: section.type },
                timestamp: Date.now()
              })
            } else {
              console.error('❌ No current layout found for addSection:', {
                currentLayoutId: state.ui.currentLayoutId,
                availableLayouts: Object.keys(state.layouts)
              })
            }
          })
        },

        clearSections: () => {
          set((state) => {
            const currentLayout = state.layouts[state.ui.currentLayoutId]
            if (currentLayout) {
              console.log('🗑️ Clearing all sections from current layout')
              currentLayout.sections = {}
              
              // Create snapshot for cleared state
              const snapshot: Snapshot = {
                id: generateId(),
                timestamp: Date.now(),
                userAction: 'Clear all sections',
                layoutId: state.ui.currentLayoutId,
                sectionsState: {}
              }
              
              // Add to history
              state.history.stack = [...state.history.stack.slice(0, state.history.index + 1), snapshot]
              state.history.index = state.history.index + 1
              
              // Emit event for logging
              events.emit('store:action', {
                type: 'clearSections',
                payload: { layoutId: state.ui.currentLayoutId },
                timestamp: Date.now()
              })
            }
          })
        },

        // Utility actions
        clearHistory: () => {
          set((state) => {
            state.history = { stack: [], index: -1 }
          })
        },

        resetState: () => {
          set(() => ({ ...initialState }))
        },
        
        // Props override actions (for iframe preview)
        setSectionOverride: (sectionId: string, overrides: Record<string, any>) => {
          set((state) => {
            const section = state.layouts[state.ui.currentLayoutId]?.sections[sectionId]
            if (!section) return
            
            state.sectionOverrides[sectionId] = {
              overrides,
              defaultHash: section.componentHash || '',
              lastModified: Date.now()
            }
          })
        },
        clearSectionOverride: (sectionId: string) => {
          set((state) => {
            delete state.sectionOverrides[sectionId]
          })
        },
        getSectionProps: (sectionId: string) => {
          const state = get()
          const section = state.layouts[state.ui.currentLayoutId]?.sections[sectionId]
          if (!section) return {}
          
          const override = state.sectionOverrides[sectionId]
          const defaultProps = section.defaultProps || section.content.props || {}
          
          // Merge with overrides
          return {
            ...defaultProps,
            ...(override?.overrides || {})
          }
        },
        getSectionPropsWithMetadata: (sectionId: string) => {
          const state = get()
          const props = get().getSectionProps(sectionId)
          const override = state.sectionOverrides[sectionId]
          
          return {
            props,
            hasOverrides: !!override && Object.keys(override.overrides).length > 0,
            overrideCount: override ? Object.keys(override.overrides).length : 0
          }
        },
        
        // Code editing actions (for prompt-to-code)
        startCodeEdit: (sectionId: string) => {
          const state = get()
          const section = state.layouts[state.ui.currentLayoutId]?.sections[sectionId]
          if (!section?.componentSource) return
          
          set((state) => {
            state.activeCodeEdit = {
              sectionId,
              originalSource: section.componentSource!,
              currentSource: section.componentSource!,
              patches: []
            }
          })
        },
        applyCodePatch: async (sectionId: string, patch: PatchRecord['patch'], prompt: string) => {
          const state = get()
          const activeEdit = state.activeCodeEdit
          if (!activeEdit || activeEdit.sectionId !== sectionId) return
          
          // Apply patch
          const newSource = patch.newContent
          
          // Create patch record
          const patchRecord: PatchRecord = {
            id: generateId(),
            timestamp: Date.now(),
            prompt,
            patch,
            status: 'applied'
          }
          
          // Update section with new source
          set((state) => {
            const section = state.layouts[state.ui.currentLayoutId]?.sections[sectionId]
            if (!section) return
            
            section.componentSource = newSource
            section.metadata.lastModified = Date.now()
            section.metadata.userAction = `Code edit: ${prompt}`
            
            if (state.activeCodeEdit) {
              state.activeCodeEdit.currentSource = newSource
              state.activeCodeEdit.patches.push(patchRecord)
            }
            
            // Add to history
            if (!state.codeEditHistory[sectionId]) {
              state.codeEditHistory[sectionId] = []
            }
            state.codeEditHistory[sectionId].push(patchRecord)
          })
        },
        revertCodeEdit: (sectionId: string, steps: number = 1) => {
          set((state) => {
            const activeEdit = state.activeCodeEdit
            if (!activeEdit || activeEdit.sectionId !== sectionId) return
            
            const patches = activeEdit.patches
            if (patches.length === 0) return
            
            // Find the source to revert to
            const targetIndex = Math.max(0, patches.length - steps)
            const targetSource = targetIndex === 0 
              ? activeEdit.originalSource 
              : patches[targetIndex - 1].patch.newContent
            
            // Update source
            const section = state.layouts[state.ui.currentLayoutId]?.sections[sectionId]
            if (!section) return
            
            section.componentSource = targetSource
            section.metadata.lastModified = Date.now()
            section.metadata.userAction = `Reverted ${steps} code edit(s)`
            
            // Update active edit
            activeEdit.currentSource = targetSource
            activeEdit.patches = patches.slice(0, targetIndex)
            
            // Mark reverted patches in history
            const history = state.codeEditHistory[sectionId]
            if (history) {
              for (let i = targetIndex; i < patches.length; i++) {
                const historyPatch = history.find(p => p.id === patches[i].id)
                if (historyPatch) {
                  historyPatch.status = 'reverted'
                }
              }
            }
          })
        },
        commitCodeEdit: (sectionId: string) => {
          set((state) => {
            state.activeCodeEdit = null
          })
        },
        updateSectionCode: (sectionId: string, newSource: string, patch?: PatchRecord['patch']) => {
          set((state) => {
            const section = state.layouts[state.ui.currentLayoutId]?.sections[sectionId]
            if (!section) return
            
            section.componentSource = newSource
            section.metadata.lastModified = Date.now()
            section.metadata.userAction = patch?.description || 'Code update'
            
            // Generate new hash
            const encoder = new TextEncoder()
            const data = encoder.encode(newSource)
            crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
              const hash = Array.from(new Uint8Array(hashBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
              
              set((state) => {
                const section = state.layouts[state.ui.currentLayoutId]?.sections[sectionId]
                if (section) {
                  section.componentHash = hash
                }
              })
            })
          })
        }
      }))
    ),
    {
      name: 'builder-store',
      enabled: process.env.NODE_ENV === 'development'
    }
  )
)

// Export shallow comparison helper for components
export { shallow }

// Types are already exported as interfaces above