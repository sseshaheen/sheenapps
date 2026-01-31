/**
 * Section-Agnostic History Manager - Sprint 3 Implementation
 * Expert requirement: History should work regardless of section types
 */

import type { SectionState, Layout, Snapshot } from '@/store/builder-store'
import { pureDataSnapshotManager } from '@/services/snapshots/PureDataSnapshotManager'
import { events } from '@/utils/event-logger'

export interface HistoryOperation {
  type: 'edit' | 'create' | 'delete' | 'reorder' | 'layout_switch'
  sectionId?: string
  layoutId: string
  userAction: string
  timestamp: number
  metadata?: Record<string, any>
}

export interface HistoryContext {
  currentLayoutId: string
  availableLayouts: string[]
  totalSections: number
  sectionTypes: string[]
  lastOperation?: HistoryOperation
}

export interface SectionAgnosticResult {
  success: boolean
  operation: 'undo' | 'redo'
  sectionsAffected: {
    modified: string[]
    created: string[]
    deleted: string[]
    unchanged: string[]
  }
  layoutsAffected: string[]
  metadata: {
    operationType: string
    performanceMs: number
    sectionTypesInvolved: string[]
  }
}

/**
 * Section-Agnostic History Manager
 * 
 * Manages history operations that work seamlessly across:
 * - Different section types (hero, features, pricing, etc.)
 * - Multiple layouts (desktop, mobile, print, etc.)
 * - Mixed operations (create + edit + delete in one action)
 * - Cross-layout operations (copy section between layouts)
 */
export class SectionAgnosticHistoryManager {
  
  /**
   * Apply section-agnostic edit operation
   * Works regardless of section type or layout
   */
  public applyEdit(
    currentSections: Record<string, SectionState>,
    sectionId: string,
    newContent: Partial<SectionState>,
    context: HistoryContext
  ): {
    newSections: Record<string, SectionState>
    snapshot: Snapshot
    operation: HistoryOperation
  } {
    const startTime = performance.now()

    // Get the existing section (if any)
    const existingSection = currentSections[sectionId]
    
    // Detect operation type based on section existence and content
    const operationType = this.detectOperationType(existingSection, newContent)
    
    // Apply the edit regardless of section type
    const updatedSection = this.mergeSection(existingSection, newContent, sectionId)
    
    // Create new sections state
    const newSections = {
      ...currentSections,
      [sectionId]: updatedSection
    }

    // Create optimized snapshot
    const snapshot = pureDataSnapshotManager.createSnapshot(
      newSections,
      currentSections,
      context.lastOperation?.userAction || 'section_edit',
      context.currentLayoutId
    )

    // Create operation record
    const operation: HistoryOperation = {
      type: operationType,
      sectionId,
      layoutId: context.currentLayoutId,
      userAction: context.lastOperation?.userAction || 'section_edit',
      timestamp: Date.now(),
      metadata: {
        sectionType: updatedSection.type,
        performanceMs: performance.now() - startTime,
        snapshotId: snapshot.id
      }
    }

    // Emit analytics
    events.emit('history:section_agnostic_edit', {
      operationType,
      sectionType: updatedSection.type,
      layoutId: context.currentLayoutId,
      performanceMs: operation.metadata!.performanceMs,
      timestamp: Date.now()
    })

    return { newSections, snapshot, operation }
  }

  /**
   * Undo operation that works across any section types
   */
  public undoSectionAgnostic(
    currentSections: Record<string, SectionState>,
    historyStack: Snapshot[],
    currentIndex: number,
    context: HistoryContext
  ): SectionAgnosticResult | null {
    const startTime = performance.now()

    if (currentIndex <= 0) {
      return null
    }

    // For undo, we restore to the PREVIOUS snapshot (currentIndex - 1)
    const snapshot = historyStack[currentIndex - 1]
    
    // Analyze what will change
    const affectedSections = this.analyzeAffectedSections(
      currentSections,
      snapshot.sectionsState
    )
    

    // Restore sections regardless of their types
    const restoredSections = this.restoreSectionsAgnostic(snapshot.sectionsState)

    // Emit analytics
    events.emit('history:undo_section_agnostic', {
      sectionsModified: affectedSections.modified.length,
      sectionsCreated: affectedSections.created.length,
      sectionsDeleted: affectedSections.deleted.length,
      sectionTypes: this.extractSectionTypes(snapshot.sectionsState),
      layoutId: context.currentLayoutId,
      performanceMs: performance.now() - startTime,
      timestamp: Date.now()
    })

    return {
      success: true,
      operation: 'undo',
      sectionsAffected: affectedSections,
      layoutsAffected: [context.currentLayoutId],
      metadata: {
        operationType: snapshot.userAction,
        performanceMs: performance.now() - startTime,
        sectionTypesInvolved: this.extractSectionTypes(snapshot.sectionsState)
      }
    }
  }

  /**
   * Redo operation that works across any section types
   */
  public redoSectionAgnostic(
    currentSections: Record<string, SectionState>,
    historyStack: Snapshot[],
    currentIndex: number,
    context: HistoryContext
  ): SectionAgnosticResult | null {
    const startTime = performance.now()

    if (currentIndex >= historyStack.length - 1) {
      return null
    }

    const snapshot = historyStack[currentIndex + 1]
    
    // Analyze what will change
    const affectedSections = this.analyzeAffectedSections(
      currentSections,
      snapshot.sectionsState
    )

    // Apply forward changes regardless of section types
    const newSections = this.restoreSectionsAgnostic(snapshot.sectionsState)

    // Emit analytics
    events.emit('history:redo_section_agnostic', {
      sectionsModified: affectedSections.modified.length,
      sectionsCreated: affectedSections.created.length,
      sectionsDeleted: affectedSections.deleted.length,
      sectionTypes: this.extractSectionTypes(snapshot.sectionsState),
      layoutId: context.currentLayoutId,
      performanceMs: performance.now() - startTime,
      timestamp: Date.now()
    })

    return {
      success: true,
      operation: 'redo',
      sectionsAffected: affectedSections,
      layoutsAffected: [context.currentLayoutId],
      metadata: {
        operationType: snapshot.userAction,
        performanceMs: performance.now() - startTime,
        sectionTypesInvolved: this.extractSectionTypes(snapshot.sectionsState)
      }
    }
  }

  /**
   * Handle cross-layout operations
   * Copy/move sections between different layouts
   */
  public handleCrossLayoutOperation(
    sourceLayout: Layout,
    targetLayout: Layout,
    sectionId: string,
    operation: 'copy' | 'move'
  ): {
    updatedSourceLayout: Layout
    updatedTargetLayout: Layout
    snapshots: Snapshot[]
  } {
    const sourceSection = sourceLayout.sections[sectionId]
    if (!sourceSection) {
      throw new Error(`Section ${sectionId} not found in source layout`)
    }

    // Generate new ID for target to avoid conflicts
    const targetSectionId = operation === 'copy' 
      ? `${sectionId}_copy_${Date.now()}`
      : sectionId

    // Create target section (works regardless of section type)
    const targetSection: SectionState = {
      ...sourceSection,
      id: targetSectionId,
      metadata: {
        ...sourceSection.metadata,
        lastModified: Date.now(),
        userAction: `${operation}_from_${sourceLayout.id}`
      }
    }

    // Update layouts
    const updatedTargetLayout: Layout = {
      ...targetLayout,
      sections: {
        ...targetLayout.sections,
        [targetSectionId]: targetSection
      }
    }

    const updatedSourceLayout: Layout = operation === 'move' 
      ? {
          ...sourceLayout,
          sections: Object.fromEntries(
            Object.entries(sourceLayout.sections).filter(([id]) => id !== sectionId)
          )
        }
      : sourceLayout

    // Create snapshots for both layouts
    const sourceSnapshot = pureDataSnapshotManager.createSnapshot(
      updatedSourceLayout.sections,
      sourceLayout.sections,
      `${operation}_source`,
      sourceLayout.id
    )

    const targetSnapshot = pureDataSnapshotManager.createSnapshot(
      updatedTargetLayout.sections,
      targetLayout.sections,
      `${operation}_target`,
      targetLayout.id
    )

    // Emit analytics
    events.emit('history:cross_layout_operation', {
      operation,
      sectionType: sourceSection.type,
      sourceLayoutId: sourceLayout.id,
      targetLayoutId: targetLayout.id,
      timestamp: Date.now()
    })

    return {
      updatedSourceLayout,
      updatedTargetLayout,
      snapshots: [sourceSnapshot, targetSnapshot]
    }
  }

  /**
   * Validate history consistency across section types
   */
  public validateSectionAgnosticHistory(
    historyStack: Snapshot[],
    context: HistoryContext
  ): {
    isValid: boolean
    issues: string[]
    metrics: {
      totalSnapshots: number
      sectionTypeCoverage: string[]
      layoutsCovered: string[]
      averageSnapshotSize: number
    }
  } {
    const issues: string[] = []
    const sectionTypes = new Set<string>()
    const layouts = new Set<string>()
    let totalSize = 0

    // Validate each snapshot
    for (let i = 0; i < historyStack.length; i++) {
      const snapshot = historyStack[i]

      // Basic validation
      if (!snapshot.sectionsState || typeof snapshot.sectionsState !== 'object') {
        issues.push(`Snapshot ${i}: Invalid sectionsState`)
        continue
      }

      // Collect metrics
      layouts.add(snapshot.layoutId)

      // Validate sections regardless of type
      for (const [sectionId, section] of Object.entries(snapshot.sectionsState)) {
        if (!this.isValidSection(section)) {
          issues.push(`Snapshot ${i}, Section ${sectionId}: Invalid section structure`)
        } else {
          sectionTypes.add(section.type)
        }
      }

      totalSize += JSON.stringify(snapshot).length
    }

    return {
      isValid: issues.length === 0,
      issues,
      metrics: {
        totalSnapshots: historyStack.length,
        sectionTypeCoverage: Array.from(sectionTypes),
        layoutsCovered: Array.from(layouts),
        averageSnapshotSize: historyStack.length > 0 ? totalSize / historyStack.length : 0
      }
    }
  }

  // Private helper methods

  private detectOperationType(
    existingSection: SectionState | undefined,
    newContent: Partial<SectionState>
  ): HistoryOperation['type'] {
    if (!existingSection) return 'create'
    if (!newContent.content && !newContent.styles) return 'delete'
    return 'edit'
  }

  private mergeSection(
    existingSection: SectionState | undefined,
    newContent: Partial<SectionState>,
    sectionId: string
  ): SectionState {
    if (!existingSection) {
      // Create new section with defaults
      return {
        id: sectionId,
        type: (newContent.type || 'hero') as SectionState['type'],
        content: newContent.content || { html: '', props: {} },
        styles: newContent.styles || { css: '', variables: {} },
        metadata: {
          lastModified: Date.now(),
          userAction: 'create',
          aiGenerated: false,
          ...newContent.metadata
        }
      }
    }

    // Merge with existing section
    return {
      ...existingSection,
      ...newContent,
      content: newContent.content ? { ...existingSection.content, ...newContent.content } : existingSection.content,
      styles: newContent.styles ? { ...existingSection.styles, ...newContent.styles } : existingSection.styles,
      metadata: {
        ...existingSection.metadata,
        lastModified: Date.now(),
        userAction: newContent.metadata?.userAction || 'edit',
        ...newContent.metadata
      }
    }
  }

  private analyzeAffectedSections(
    current: Record<string, SectionState>,
    target: Record<string, SectionState>
  ): {
    modified: string[]
    created: string[]
    deleted: string[]
    unchanged: string[]
  } {
    const currentIds = new Set(Object.keys(current))
    const targetIds = new Set(Object.keys(target))

    const modified: string[] = []
    const created: string[] = []
    const deleted: string[] = []
    const unchanged: string[] = []

    // Check for modifications and unchanged sections in target
    for (const id of targetIds) {
      if (currentIds.has(id)) {
        if (this.sectionsDiffer(current[id], target[id])) {
          modified.push(id)
        } else {
          unchanged.push(id)
        }
      } else {
        created.push(id)
      }
    }

    // Check for deletions (sections in current but not in target)
    for (const id of currentIds) {
      if (!targetIds.has(id)) {
        deleted.push(id)
      }
    }

    // CRITICAL FIX: For undo/redo, also check sections that exist in both
    // but will be modified when we restore the target state
    for (const id of currentIds) {
      if (targetIds.has(id) && !modified.includes(id) && !unchanged.includes(id)) {
        if (this.sectionsDiffer(current[id], target[id])) {
          modified.push(id)
        }
      }
    }

    return { modified, created, deleted, unchanged }
  }

  private restoreSectionsAgnostic(
    sectionsState: Record<string, SectionState>
  ): Record<string, SectionState> {
    // Deep clone to avoid reference issues
    return JSON.parse(JSON.stringify(sectionsState))
  }

  private extractSectionTypes(sectionsState: Record<string, SectionState>): string[] {
    return Array.from(new Set(Object.values(sectionsState).map(section => section.type)))
  }

  private sectionsDiffer(a: SectionState, b: SectionState): boolean {
    const htmlDiff = a.content.html !== b.content.html
    const propsDiff = JSON.stringify(a.content.props) !== JSON.stringify(b.content.props)
    const cssDiff = a.styles.css !== b.styles.css
    const varsDiff = JSON.stringify(a.styles.variables) !== JSON.stringify(b.styles.variables)
    
    const differ = htmlDiff || propsDiff || cssDiff || varsDiff
    
    
    return differ
  }

  private isValidSection(section: any): section is SectionState {
    return (
      typeof section === 'object' &&
      section.id &&
      section.type &&
      section.content &&
      section.styles &&
      section.metadata
    )
  }
}

/**
 * Singleton instance for global use
 */
export const sectionAgnosticHistoryManager = new SectionAgnosticHistoryManager()

/**
 * React hook for section-agnostic history operations
 */
export function useSectionAgnosticHistory() {
  return {
    applyEdit: (
      currentSections: Record<string, SectionState>,
      sectionId: string,
      newContent: Partial<SectionState>,
      context: HistoryContext
    ) => sectionAgnosticHistoryManager.applyEdit(currentSections, sectionId, newContent, context),
    
    undo: (
      currentSections: Record<string, SectionState>,
      historyStack: Snapshot[],
      currentIndex: number,
      context: HistoryContext
    ) => sectionAgnosticHistoryManager.undoSectionAgnostic(currentSections, historyStack, currentIndex, context),
    
    redo: (
      currentSections: Record<string, SectionState>,
      historyStack: Snapshot[],
      currentIndex: number,
      context: HistoryContext
    ) => sectionAgnosticHistoryManager.redoSectionAgnostic(currentSections, historyStack, currentIndex, context),
    
    crossLayoutOperation: (
      sourceLayout: Layout,
      targetLayout: Layout,
      sectionId: string,
      operation: 'copy' | 'move'
    ) => sectionAgnosticHistoryManager.handleCrossLayoutOperation(sourceLayout, targetLayout, sectionId, operation),
    
    validate: (historyStack: Snapshot[], context: HistoryContext) =>
      sectionAgnosticHistoryManager.validateSectionAgnosticHistory(historyStack, context)
  }
}