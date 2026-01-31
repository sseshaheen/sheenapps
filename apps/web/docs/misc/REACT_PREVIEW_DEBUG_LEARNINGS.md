# React Preview Debug Session - Learnings & Conclusions

## 🎯 Problem Statement
React Preview was showing "No sections to preview" when options were selected, despite having completed the 4-sprint builder architecture transformation.

## 🔍 Root Cause Analysis

### Primary Issue: Auto-Selection Logic Flaws
1. **Hardcoded Question ID Restriction**: Auto-selection only worked for `'visual-foundation-1'` but actual question IDs varied
2. **Preview Engine Dependency**: Auto-selection required iframe preview engine even when using React Preview
3. **Impact Type Mismatch**: `applyReactPreviewImpact` only handled `'modular-transformation'` but actual impacts were `'theme_change'`

### Secondary Issues
1. **Browser Caching**: Fast Refresh didn't update function changes, required `.next` cache clearing
2. **Console Rate Limiting**: Debug logs were hidden by `console-replacement.ts` rate limiting
3. **Multiple Code Paths**: Auto-selection vs manual selection used different logic

## ✅ Solutions Implemented

### 1. Fixed Auto-Selection Logic
```typescript
// BEFORE: Restrictive conditions
if (currentQuestion && currentQuestion.id === 'visual-foundation-1' && previewEngine) {

// AFTER: Flexible conditions  
const useReactPreview = FEATURE_FLAGS.ENABLE_REACT_PREVIEW
const canAutoSelect = useReactPreview || previewEngine
if (currentQuestion && !hasAutoSelected && canAutoSelect) {
```

### 2. Enhanced Impact Processing
```typescript
// BEFORE: Only modular-transformation
if (impact.type === 'modular-transformation' && impact.modules) {

// AFTER: Multiple impact types
if (impact.type === 'modular-transformation' && impact.modules) {
  // Handle modular impacts
} else if (impact.type === 'theme_change' || impact.type === 'layout_update' || impact.type?.includes('theme')) {
  // Handle theme/layout impacts with default sections
}
```

### 3. Unified Auto-Selection Approach
```typescript
// Simplified auto-selection in useEffect
if (currentQuestion && !hasAutoSelected && visibleOptions.length > 0) {
  const firstOption = visibleOptions[0]
  const impact = firstOption.previewImpact
  
  setSelectedOption(firstOption.id)
  setHasAutoSelected(true)
  
  if (impact) {
    applyReactPreviewImpact(impact, firstOption.text)
  } else {
    // Create default sections
  }
}
```

## 🏗️ Architecture Insights

### React Preview vs Iframe Preview
- **React Preview**: Direct store manipulation, no API calls, 2-5x faster
- **Iframe Preview**: Uses `/api/preview/[projectId]/[choiceId]/[componentName]` route
- **Key Difference**: React Preview doesn't need preview engine initialization

### Store Flow
1. `initializeProject(projectId)` → Creates default layout with empty sections
2. `addSection(section)` → Adds section to current layout  
3. `PreviewRenderer` → Reads sections from store via selectors
4. `useBuilderStore(selectors.currentSections)` → Returns sections for rendering

## 🧪 Debugging Techniques Used

### Effective Methods
1. **Direct `window.console` calls** to bypass rate limiting
2. **Test sections** to verify store/render pipeline works
3. **Comprehensive debug objects** with all condition checks
4. **Cache clearing** (`rm -rf .next`) for function updates

### Debug Log Patterns
```typescript
// Bypass rate limiting
window.console?.error?.('🚨 FORCE DEBUG:', data)

// Comprehensive condition checking  
console.log('🔍 Auto-selection check:', {
  hasCurrentQuestion: !!currentQuestion,
  canAutoSelect: useReactPreview || previewEngine,
  allConditionsMet: !!(/* all conditions */)
})
```

## 📋 Current Status
- ✅ **Auto-selection logic fixed** - No hardcoded question ID restrictions
- ✅ **Impact processing enhanced** - Handles theme_change and modular-transformation  
- ✅ **React Preview compatibility** - Works without iframe preview engine
- ✅ **Cache issues resolved** - Fresh build should load updated code
- ✅ **React Preview confirmed working** - User tested in incognito window successfully
- ✅ **Undo/Redo functionality fixed** - `addSection` now creates history snapshots
- ✅ **React Preview Edit System Complete** - AI editing now works with store-based updates

### Edit System Architecture Fix
**Root Cause**: Edit dialogs were trying to use iframe methods (`getCurrentSectionContentFromIframe`, `previewEngine.updateSection`) for React Preview sections.

**Solution**: Complete React Preview edit system integration:

1. **Store-based Content Capture**:
```typescript
// Replace iframe capture with store-based capture
const getCurrentSectionContent = (sectionType: string) => {
  if (FEATURE_FLAGS.ENABLE_REACT_PREVIEW) {
    const currentSections = useBuilderStore.getState().layouts[...].sections || {}
    const sectionEntry = Object.entries(currentSections).find(([_, section]) => section.type === sectionType)
    return sectionEntry ? storeSectionToContent(sectionEntry) : null
  }
  // Fallback to iframe method for legacy
}
```

2. **Store-based Content Updates**:
```typescript
// Replace preview engine with store updates  
const handleSectionUpdate = async (sectionId: string, newContent: any) => {
  if (FEATURE_FLAGS.ENABLE_REACT_PREVIEW) {
    const storeContent = { html: newContent.html || '', props: newContent.props || {} }
    const { applyEdit } = useBuilderStore.getState()
    applyEdit(sectionId, storeContent, 'AI Edit') // Creates history snapshot automatically
  }
  // Fallback to preview engine for legacy
}
```

3. **Store-based Undo/Redo**:
```typescript
// Enhanced undo/redo to handle store content
const handleUndoSection = async (sectionId: string, component: any) => {
  if (FEATURE_FLAGS.ENABLE_REACT_PREVIEW) {
    if (component?.content && component?.styles) {
      const { applyEdit } = useBuilderStore.getState()
      applyEdit(sectionId, component.content, 'Undo')
    }
  }
  // Fallback to iframe methods for legacy
}
```

### Undo/Redo System Integration Fix
**Root Cause 1**: `useUndoRedoManager` hook was using the legacy `usePerSectionHistoryStore` instead of the unified store, creating a disconnect between edit history and undo functionality.

**Root Cause 2**: History system was storing "before" states instead of "after" states, causing redo to restore the wrong state.

**Solution**: Complete undo/redo system overhaul:

1. **Direct Store Integration**:
```typescript
// Replace legacy manager with direct store calls
if (FEATURE_FLAGS.ENABLE_REACT_PREVIEW) {
  const { undo } = useBuilderStore.getState()
  undo()
} else {
  await handleUndoViaManager(sectionType)
}
```

2. **Fixed History Logic**:
```typescript
// OLD: Store state BEFORE edit (wrong)
const snapshot = { sectionsState: { ...currentLayout.sections } }
// Apply edit...

// NEW: Apply edit FIRST, then store result state (correct)
// Apply edit...
const snapshot = { sectionsState: { ...updatedLayout.sections } }
```

3. **Section-Specific Undo/Redo**: True section isolation without affecting other sections
```typescript
// Track which section was modified in each snapshot
export interface Snapshot {
  sectionId?: string // Track which section was modified
  sectionsState: Record<string, SectionState>
}

// Section-specific undo: Reverts only the target section
undoSection: (sectionId: string) => {
  // Find the previous state of this section
  const sourceSnapshot = findPreviousSnapshotFor(sectionId)
  
  // Create new state with current sections + reverted target section
  const newSections = {
    ...currentLayout.sections,
    [sectionId]: sourceSnapshot.sectionsState[sectionId]
  }
  
  // Add as new snapshot (preserves other sections' history)
  return addSnapshot(newSections, `Undo ${sectionId}`)
}
```

4. **Enhanced Button States**: Section buttons show availability for that specific section
5. **Baseline State**: Projects start with empty baseline in history

## 🔮 Next Steps
1. **Clean up debug logging** - Remove temporary console logs for production
2. **Performance optimization** - Monitor bundle size impact  
3. **Remove legacy undo/redo code** - Clean up unused per-section history system
4. **Testing** - Verify complete edit → undo → redo workflow works

## 💡 Key Learnings
1. **React Preview is fundamentally different** from iframe preview - don't mix patterns
2. **Browser caching can hide code changes** - always clear `.next` for function updates
3. **Console rate limiting** can hide critical debug info - use direct `window.console` calls
4. **Feature flags should gate logic**, not just UI rendering
5. **Auto-selection and manual selection** should use identical impact processing

## 🔧 Tools & Commands
```bash
# Clear cache and restart
rm -rf .next && npm run dev:safe

# Force enable all logs  
window.__ENABLE_LOGS__ = true
debugPresets.verboseDebugging()

# Check feature flags
FEATURE_FLAGS.ENABLE_REACT_PREVIEW

# Bypass rate limiting
window.console?.error?.('DEBUG:', data)
```