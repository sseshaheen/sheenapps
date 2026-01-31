# Builder Undo/Redo System: Critical Lessons Learned

## The Problem
Undo/redo buttons would appear inconsistently or not at all, especially after undo operations. Users experienced:
- First edit: undo button appeared ✅
- After undo: redo button missing ❌
- After redo: undo button missing ❌

## Root Causes Discovered

### 1. **Store Hydration Timing Issues**
- Zustand persistence caused delays in state availability
- React hook selectors were stale during rapid state changes
- **Solution**: Use `useUnifiedBuilderStore.getState()` for fresh state access instead of hook closures

### 2. **Component ID Mismatches After DOM Changes**
- Component IDs changed after undo/redo (e.g., `luxury-premium-hero-compelling-copy` → `captured-hero-1750728461706`)
- Iframe's `updateUndoRedoButtons` function couldn't find elements with new IDs
- **Solution**: Use consistent section type (`'hero'`) instead of dynamic component IDs

### 3. **Iframe Function Failures After DOM Replacement**
- Original iframe `updateUndoRedoButtons` function broke after `outerHTML` replacements
- DOM structure changes made button selectors invalid
- **Solution**: Direct DOM manipulation as fallback when iframe functions fail

### 4. **Button State Caching Problems**
- Cache keys prevented updates when state returned to previous values
- Undo → Redo → Undo cycle caused cache hits that skipped updates
- **Solution**: Clear ALL cache entries for section type during undo/redo operations

## Final Architecture

### Hybrid Approach (Both Systems Needed)
1. **Original iframe system** - Handles initial edits (works reliably)
2. **Direct DOM manipulation** - Handles undo/redo operations (when iframe system fails)

### Direct DOM Manipulation Implementation
```typescript
// Clean up all existing buttons comprehensively
heroSection.querySelectorAll('.undo-button, .redo-button').forEach(btn => btn.remove())
heroSection.querySelectorAll('[id*="undo-"], [id*="redo-"]').forEach(btn => btn.remove())

// Create buttons in correct order: Undo first (left), Redo second (right)
if (shouldHaveUndo) {
  const undoButton = doc.createElement('button')
  undoButton.innerHTML = 'Undo'
  undoButton.style.cssText = 'background: rgba(59, 130, 246, 0.9) !important; ...'
  undoButton.onclick = () => iframe.contentWindow.parent.postMessage(...)
  heroSection.appendChild(undoButton)
}

if (shouldHaveRedo) {
  const redoButton = doc.createElement('button')
  redoButton.innerHTML = 'Redo' 
  redoButton.style.cssText = 'background: rgba(59, 130, 246, 0.9) !important; ...'
  redoButton.onclick = () => iframe.contentWindow.parent.postMessage(...)
  heroSection.appendChild(redoButton)
}
```

## Critical Debugging Patterns

### 1. **Always Check State vs UI Separately**
```typescript
console.log('Expected state:', { shouldHaveUndo, shouldHaveRedo })
console.log('Actual DOM:', iframe.contentDocument.querySelectorAll('.undo-button, .redo-button'))
```

### 2. **Validate Store Access Methods**
```typescript
// ❌ Stale: React hook selector
const histories = useUnifiedBuilderStore(state => state.history.sections)

// ✅ Fresh: Direct store access  
const histories = useUnifiedBuilderStore.getState().history.sections
```

### 3. **Component ID Consistency**
```typescript
// ❌ Dynamic IDs break after DOM changes
updateIframeUndoRedoButtons(sectionType, actualComponentId)

// ✅ Consistent section type works across state changes
updateIframeUndoRedoButtons(sectionType, sectionType)
```

## UI/UX Lessons

### 1. **Button Order Matters**
- Users expect: Edit → Undo → Redo (left to right)
- Always create undo button before redo button in DOM

### 2. **Visual Consistency Required**  
- Mixed button designs confuse users
- Use `!important` to override iframe styles when necessary
- Match exact styling: padding, colors, border-radius, typography

### 3. **Comprehensive Cleanup**
- Remove buttons by multiple selectors (class, ID pattern, text content)
- Clean up before creating new buttons to prevent duplicates

## Prevention Guidelines

### For Future iframe/DOM Manipulation:
1. **Never rely solely on dynamic component IDs** - use consistent identifiers
2. **Always implement fallback systems** - iframe functions can break after DOM changes
3. **Clear caches aggressively** during state transitions
4. **Test the complete cycle** - not just individual operations
5. **Use direct store access** for time-sensitive state checks
6. **Implement comprehensive button cleanup** before recreation

### Testing Checklist:
- [ ] Fresh edit → undo button appears
- [ ] Undo → redo button appears  
- [ ] Redo → undo button appears
- [ ] Multiple edits → both buttons work
- [ ] Button styling is consistent
- [ ] Button order is correct (undo left, redo right)

## Key Insight
**Iframe-based systems are fragile during DOM manipulation.** Always have a direct DOM manipulation fallback for critical UI elements that must remain functional after content updates.