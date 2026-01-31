# Quick Start: Immediate Testing Implementation

## 🚀 Start Today (30 minutes)

### Step 1: Install Minimal Test Setup
```bash
# Essential testing packages
npm install -D vitest @vitejs/plugin-react @testing-library/react jsdom

# Create test config
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
EOF

# Add test script to package.json
npm pkg set scripts.test="vitest"
npm pkg set scripts.test:watch="vitest --watch"
```

### Step 2: First Critical Test (Undo/Redo Bug Prevention)

Create `src/stores/__tests__/per-section-history-store.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { usePerSectionHistoryStore } from '../per-section-history-store'

describe('PerSectionHistoryStore - Critical Bugs Prevention', () => {
  beforeEach(() => {
    // Reset store before each test
    usePerSectionHistoryStore.setState({ histories: {} })
  })

  test('edit → undo → redo maintains correct button states', () => {
    const store = usePerSectionHistoryStore.getState()
    const layoutId = 'test-layout'
    const sectionType = 'hero'
    const sectionId = 'hero'

    // Initial state - no history
    expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(false)
    expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(false)

    // Record original content
    store.recordEdit(layoutId, sectionType, sectionId, 
      { content: 'original' }, 'original')
    
    // Record edit
    store.recordEdit(layoutId, sectionType, sectionId, 
      { content: 'edited' }, 'user edit')

    // After edit: can undo, cannot redo
    expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(true)
    expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(false)

    // Perform undo
    const undoResult = store.undo(layoutId, sectionType, sectionId)
    expect(undoResult?.content).toEqual({ content: 'original' })

    // After undo: cannot undo (at original), can redo
    expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(false)
    expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(true)

    // Perform redo
    const redoResult = store.redo(layoutId, sectionType, sectionId)
    expect(redoResult?.content).toEqual({ content: 'edited' })

    // After redo: can undo, cannot redo (THIS WAS THE BUG!)
    expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(true)
    expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(false)
  })

  test('history maintains 10-step limit', () => {
    const store = usePerSectionHistoryStore.getState()
    
    // Add 12 edits
    for (let i = 0; i < 12; i++) {
      store.recordEdit('layout', 'hero', 'hero', 
        { content: `edit-${i}` }, `edit ${i}`)
    }

    const history = store.histories['layout_hero_hero']
    expect(history.edits.length).toBe(10) // Should cap at 10
    expect(history.edits[0].content).toEqual({ content: 'edit-2' }) // First 2 removed
    expect(history.edits[9].content).toEqual({ content: 'edit-11' }) // Latest kept
  })

  test('consistent section keys work regardless of component ID', () => {
    const store = usePerSectionHistoryStore.getState()
    
    // Record with dynamic component ID
    store.recordEdit('layout1', 'hero', 'hero', 
      { id: 'hero-dynamic-123', content: 'test' }, 'edit')
    
    // Should still find history with consistent section key
    expect(store.canUndo('layout1', 'hero', 'hero')).toBe(true)
    
    // Even if component ID changes
    expect(store.canUndo('layout1', 'hero', 'hero-different-456')).toBe(true)
  })
})
```

### Step 3: Run Your First Test
```bash
npm test
```

## 🎯 High-Impact Tests to Add Next

### 1. Button Visibility Logic Test
```typescript
// src/components/builder/__tests__/button-visibility.test.tsx
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComponentRenderer } from '@/services/preview/component-renderer'

describe('Undo/Redo Button Visibility', () => {
  test('buttons have correct IDs for iframe queries', () => {
    const html = ComponentRenderer.wrapWithEditControls(
      '<div>Test</div>', 
      'hero', 
      'hero-123'
    )
    
    // Check button IDs match expected pattern
    expect(html).toContain('id="undo-hero-hero-123"')
    expect(html).toContain('id="redo-hero-hero-123"')
  })

  test('data-keep-visible attribute prevents hiding', () => {
    const html = ComponentRenderer.wrapWithEditControls(
      '<div>Test</div>', 
      'hero', 
      'hero-123'
    )
    
    // Verify onclick sets data-keep-visible
    expect(html).toContain('data-keep-visible')
    expect(html).toContain('setTimeout')
  })
})
```

### 2. Async Message Handler Test
```typescript
// src/services/preview/__tests__/message-handlers.test.ts
describe('iframe Message Handlers', () => {
  test('undo/redo handlers are synchronous (no await)', () => {
    // This would have caught our build error!
    const handlerCode = handleUndoSection.toString()
    expect(handlerCode).not.toContain('await')
  })
})
```

## 📊 Coverage Goals for Critical Paths

### Week 1: Foundation (Prevent Regressions)
- [ ] Per-section history store: 100% coverage
- [ ] Button update logic: Key paths covered
- [ ] Component ID handling: Edge cases tested

### Week 2: Integration Safety
- [ ] Edit → Undo → Redo flow
- [ ] Multiple section independence
- [ ] Layout switching scenarios

### Week 3: E2E Critical Paths
- [ ] Full builder workflow
- [ ] Question flow integration
- [ ] Preview updates

## 🚨 Test on Every Bug Fix

When you fix a bug:
1. Write a failing test that reproduces the bug
2. Fix the bug
3. Verify test passes
4. Add to regression suite

Example from our conversation:
```typescript
test('regression: buttons disappear after edit-undo-redo', () => {
  // This test would have caught the bug we spent hours fixing!
})
```

## 🏃‍♂️ Run Tests Automatically

Add to package.json:
```json
{
  "scripts": {
    "pre-commit": "npm run lint && npm run type-check && npm test && npm run build"
  }
}
```

## 💡 Testing Philosophy

**Test the behavior users depend on, not implementation details:**

✅ Good: "Undo button appears after editing a section"
❌ Bad: "usePerSectionHistoryStore.histories['key'].currentIndex equals 1"

✅ Good: "Buttons stay visible for 3 seconds after clicking"
❌ Bad: "setTimeout called with 3000ms"

Start with these tests TODAY to prevent the issues we've been debugging!