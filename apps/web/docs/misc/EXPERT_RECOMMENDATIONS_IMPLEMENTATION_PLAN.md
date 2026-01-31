# Expert Recommendations & Implementation Plan

## Expert Analysis Summary

The expert identified our core issues and provided a clear path forward. Their analysis confirms what we experienced: **the architecture is fundamentally flawed, not just buggy**.

### Key Expert Insights

> **"Too many sources of truth"** - Consolidate to one reactive store
> **"Iframe is the bottleneck"** - Replace with in-page React tree or Shadow-DOM
> **"Undo/redo should be pure data, not DOM"** - Immutable snapshots, not DOM surgery
> **"Race conditions come from side-effects"** - Remove setTimeout orchestration
> **"Button state = derived data"** - Compute from history state, no separate manager

---

## 🎯 **New Architecture Vision**

### Single Source of Truth Store
```typescript
interface BuilderState {
  // Current content
  layouts: Record<string, Layout>
  currentLayoutId: string
  sections: Record<string, Section>
  
  // History (pure data)
  history: {
    entries: HistoryEntry[]
    currentIndex: number
  }
  
  // UI state
  activeEditSection: string | null
  isPreviewReady: boolean
}

// Derived state (computed)
const canUndo = state.history.currentIndex > 0
const canRedo = state.history.entries.length - 1 > state.history.currentIndex
```

### In-Page Preview (No Iframe)
```typescript
// Preview component renders from state
function PreviewRenderer({ sections, layout }: PreviewProps) {
  return (
    <div className="preview-container">
      {layout.sections.map(sectionId => {
        const section = sections[sectionId]
        return (
          <SectionWrapper 
            key={sectionId}
            section={section}
            onEdit={() => dispatch({ type: 'EDIT_SECTION', sectionId })}
            canUndo={canUndo(sectionId)}
            canRedo={canRedo(sectionId)}
          />
        )
      })}
    </div>
  )
}
```

### Pure Data History
```typescript
// No DOM manipulation for undo/redo
function undoSection(sectionId: string) {
  const entry = state.history.entries[state.history.currentIndex - 1]
  dispatch({
    type: 'RESTORE_SECTION',
    sectionId,
    content: entry.sections[sectionId]
  })
  dispatch({ type: 'DECREMENT_HISTORY_INDEX' })
}
```

---

## 📋 **Implementation Phases**

### Phase 1: Single Store Migration (Week 1-2)
**Goal**: Consolidate all state into one reactive store

#### 1.1 Create Unified Store
```typescript
// /src/store/builder-store.ts
interface BuilderStore {
  // Migrate from QuestionFlowStore
  businessContext: BusinessContext | null
  currentQuestion: Question | null
  
  // Migrate from PerSectionHistoryStore  
  history: HistoryState
  
  // Migrate from LivePreviewEngine state
  layouts: Record<string, Layout>
  sections: Record<string, Section>
  currentLayoutId: string
  
  // UI state
  activeEditSection: string | null
  isPreviewReady: boolean
}
```

#### 1.2 Migration Steps
1. **Create new unified store** (`builder-store.ts`)
2. **Migrate history data** from `PerSectionHistoryStore`
3. **Migrate business context** from `QuestionFlowStore`
4. **Keep iframe rendering** (for now) but drive from unified store
5. **Update all components** to use unified store
6. **Remove old stores** once migration complete

#### 1.3 Success Criteria
- [ ] All state in single store
- [ ] No data duplication
- [ ] Existing functionality preserved
- [ ] State synchronization issues eliminated

### Phase 2: Iframe Replacement (Week 3-4)
**Goal**: Replace iframe with in-page React components

#### 2.1 Preview Component Architecture
```typescript
// /src/components/builder/preview/
├── preview-renderer.tsx          # Main preview container
├── section-wrapper.tsx          # Editable section wrapper
├── section-components/
│   ├── hero-preview.tsx         # Hero section renderer
│   ├── features-preview.tsx     # Features section renderer
│   └── ...                     # Other section types
└── preview-styles.tsx           # CSS-in-JS styling
```

#### 2.2 Section Wrapper Design
```typescript
function SectionWrapper({ section, onEdit, canUndo, canRedo }: SectionWrapperProps) {
  return (
    <div 
      className="editable-section"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <SectionRenderer section={section} />
      
      {showControls && (
        <div className="section-controls">
          <button onClick={() => onEdit(section.id)}>Edit</button>
          <button onClick={() => onUndo(section.id)} disabled={!canUndo}>
            Undo
          </button>
          <button onClick={() => onRedo(section.id)} disabled={!canRedo}>
            Redo
          </button>
        </div>
      )}
    </div>
  )
}
```

#### 2.3 Migration Steps
1. **Create preview components** for each section type
2. **Implement CSS-in-JS styling** (no CSS variables dependency)
3. **Add edit controls** as React components
4. **Test side-by-side** with iframe preview
5. **Switch preview rendering** from iframe to React
6. **Remove iframe code** and postMessage system

#### 2.4 Success Criteria
- [ ] Preview renders from React components
- [ ] No iframe or postMessage usage
- [ ] Edit controls work reliably
- [ ] Styling preserved across edits
- [ ] Performance improved

### Phase 3: Pure Data History (Week 5)
**Goal**: Replace DOM-based undo/redo with pure data operations

#### 3.1 History Data Structure
```typescript
interface HistoryEntry {
  id: string
  timestamp: number
  userAction: string
  sectionsSnapshot: Record<string, Section>
  layoutId: string
}

interface HistoryState {
  entries: HistoryEntry[]
  currentIndex: number
  maxEntries: number // 50 instead of 10
}
```

#### 3.2 History Operations
```typescript
// Pure functions, no side effects
function recordEdit(
  state: BuilderStore, 
  sectionId: string, 
  newContent: any, 
  userAction: string
): BuilderStore {
  const sectionsSnapshot = { ...state.sections }
  sectionsSnapshot[sectionId] = newContent
  
  const newEntry: HistoryEntry = {
    id: generateId(),
    timestamp: Date.now(),
    userAction,
    sectionsSnapshot,
    layoutId: state.currentLayoutId
  }
  
  return {
    ...state,
    history: {
      entries: [...state.history.entries.slice(0, state.history.currentIndex + 1), newEntry],
      currentIndex: state.history.currentIndex + 1
    },
    sections: sectionsSnapshot
  }
}
```

#### 3.3 Success Criteria
- [ ] Undo/redo works via state updates only
- [ ] No setTimeout dependencies
- [ ] Layout switching preserves history
- [ ] Button states derived from data
- [ ] Performance improved (no DOM surgery)

### Phase 4: Event-Driven Architecture (Week 6)
**Goal**: Remove setTimeout orchestration with lifecycle events

#### 4.1 Event System
```typescript
// Replace setTimeout chains with events
const events = {
  PREVIEW_MOUNTED: 'preview_mounted',
  SECTION_EDITED: 'section_edited', 
  LAYOUT_CHANGED: 'layout_changed',
  EDIT_COMMITTED: 'edit_committed'
}

// Components emit events, store reacts
function onPreviewMount() {
  dispatch({ type: 'PREVIEW_READY' })
}

function onEditComplete(sectionId: string, content: any) {
  dispatch({ 
    type: 'COMMIT_SECTION_EDIT',
    sectionId,
    content,
    userAction: 'AI Generation'
  })
}
```

#### 4.2 Success Criteria
- [ ] No setTimeout usage for orchestration
- [ ] Components communicate via events
- [ ] Predictable execution order
- [ ] No race conditions

---

## 🚀 **Quick Wins Implementation**

### Immediate Actions (This Week)

#### 1. Kill Magic Numbers
```typescript
// Replace all setTimeout with named constants
const TIMING = {
  PREVIEW_LOAD_DELAY: 0, // Remove - use events instead
  BUTTON_UPDATE_DELAY: 0, // Remove - use derived state
  CSS_LOAD_WAIT: 0, // Remove - use CSS-in-JS
} as const
```

#### 2. Add Error Boundaries
```typescript
// /src/components/builder/error-boundary.tsx
function BuilderErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={<BuilderErrorFallback />}
      onError={(error, errorInfo) => {
        logger.error('Builder error:', error, errorInfo)
        // Send to error tracking service
      }}
    >
      {children}
    </ErrorBoundary>
  )
}
```

#### 3. Split Large Functions
```typescript
// Before: 200+ line function
function restoreEditsForCurrentLayout() { /* 200+ lines */ }

// After: Composed smaller functions
function restoreEditsForCurrentLayout() {
  const edits = getLayoutEdits()
  const sections = prepareSectionData(edits)
  applySectionRestorations(sections)
}
```

---

## 📊 **Success Metrics**

### Reliability Targets
- **Undo/Redo Success Rate**: 100% (currently ~50%)
- **Layout Switch Preservation**: 100% (currently ~70%) 
- **Edit Operation Success**: 100% (currently ~80%)
- **Zero Silent Failures**: All errors visible to user

### Performance Targets
- **Layout Switch Time**: <200ms (currently 800ms+ with delays)
- **Edit Response Time**: <100ms (currently varies wildly)
- **Bundle Size Reduction**: <250KB total (currently 300KB+)
- **Memory Usage**: Stable (currently grows indefinitely)

### Developer Experience
- **Debug Time**: Minutes instead of hours
- **Test Coverage**: 80%+ (currently ~20%)
- **Change Confidence**: High (currently fear-based)
- **Error Clarity**: Clear stack traces (currently silent failures)

---

## 🔄 **Migration Strategy**

### Parallel Implementation
1. **Build new system alongside old**
2. **Feature flag to switch between architectures**
3. **A/B test with real users**
4. **Migrate when new system proves stable**

### Data Migration
```typescript
// Migrate existing user data
function migrateUserProjects(oldFormat: OldProjectData): NewProjectData {
  return {
    layouts: convertLayouts(oldFormat.layouts),
    sections: convertSections(oldFormat.sections),
    history: convertHistory(oldFormat.histories),
    businessContext: oldFormat.businessContext
  }
}
```

### Rollback Plan
- Keep old architecture in codebase initially
- Feature flag can instantly revert to old system
- Data format compatible both ways
- No user data loss during migration

---

## 🎉 **Expected Outcomes**

### User Experience
- ✅ **No more lost work** - Reliable state preservation
- ✅ **Consistent undo/redo** - Always available when expected
- ✅ **Fast interactions** - No loading delays
- ✅ **Predictable behavior** - No random failures

### Developer Experience  
- ✅ **Easy debugging** - Clear error traces
- ✅ **Confident changes** - Minimal side effects
- ✅ **Fast development** - No iframe complexity
- ✅ **Comprehensive tests** - Mockable components

### Architecture Benefits
- ✅ **Single source of truth** - No state synchronization issues
- ✅ **Pure data operations** - No DOM dependencies
- ✅ **Event-driven flow** - No timing dependencies
- ✅ **Derived UI state** - No manual state management

---

## 💡 **Key Insights from Expert**

> **"Fixing the fundamental architecture (single source of truth + pure data history) will eliminate 90% of the timing, button, and restoration bugs—you'll debug data, not DOM."**

This validates our struggle: we weren't fighting bugs, we were fighting a flawed architecture. The new approach will:

1. **Make bugs obvious** - Data bugs are easier to trace than DOM timing issues
2. **Enable testing** - Pure functions are mockable, iframe interactions aren't  
3. **Improve performance** - No cross-frame communication overhead
4. **Simplify maintenance** - Single store vs 4 different systems
5. **Increase reliability** - Derived state can't get out of sync

The expert's plan gives us a clear path from "fighting the architecture" to "building on solid foundations."