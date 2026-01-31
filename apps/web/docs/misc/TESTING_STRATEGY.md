# SheenApps Testing Strategy

## Overview
This testing strategy addresses the critical issues discovered during development, particularly:
- Component state management breaking during refactors
- Undo/redo functionality failures
- Button visibility logic issues
- iframe communication problems
- History state corruption

## Testing Layers

### 1. Unit Tests (Stores & Utilities)

#### Per-Section History Store Tests
```typescript
// src/stores/__tests__/per-section-history-store.test.ts
describe('PerSectionHistoryStore', () => {
  test('records initial edit with original + new content', () => {
    // Given: Empty history
    // When: Recording first edit
    // Then: Should have 2 entries (original + edited)
  })

  test('maintains 10-step history limit', () => {
    // Given: 10 edits in history
    // When: Adding 11th edit
    // Then: Oldest edit removed, newest added
  })

  test('undo/redo maintains correct currentIndex', () => {
    // Given: 3 edits, currentIndex at 2
    // When: Undo twice, then redo once
    // Then: currentIndex should be 1
  })

  test('canUndo/canRedo returns correct states', () => {
    // Test all edge cases:
    // - No history
    // - At original (index 0)
    // - In middle of history
    // - At latest edit
  })

  test('truncates redo history on new edit', () => {
    // Given: Undone to middle of history
    // When: New edit recorded
    // Then: Future history cleared
  })
})
```

#### Builder Workspace Logic Tests
```typescript
// src/hooks/__tests__/use-builder-workspace.test.ts
describe('useBuilderWorkspace', () => {
  test('handles section updates correctly', () => {
    // Test section content updates
    // Verify preview engine calls
    // Check state updates
  })

  test('maintains consistent component IDs', () => {
    // Test that section keys remain consistent
    // Verify dynamic IDs don't break history
  })
})
```

### 2. Integration Tests (Component Interactions)

#### Undo/Redo Button Integration
```typescript
// src/components/builder/__tests__/undo-redo-integration.test.tsx
describe('Undo/Redo Integration', () => {
  test('buttons appear after first edit', async () => {
    // Setup: Render workspace with preview
    // Action: Edit a section
    // Assert: Undo button visible, redo hidden
  })

  test('edit → undo → redo sequence maintains state', async () => {
    // Critical test for the bug we fixed
    // Setup: Edit section
    // Action: Click undo, then redo
    // Assert: Both buttons remain visible with correct states
  })

  test('buttons persist for 3 seconds after click', async () => {
    // Setup: Edit section, buttons visible
    // Action: Click undo
    // Assert: Buttons stay visible for 3s
  })

  test('component ID changes handled correctly', async () => {
    // Setup: Component with dynamic ID
    // Action: Undo/redo operations
    // Assert: Buttons found despite ID changes
  })
})
```

#### iframe Communication Tests
```typescript
// src/services/preview/__tests__/live-preview-engine.test.ts
describe('LivePreviewEngine iframe Communication', () => {
  test('postMessage handlers work correctly', () => {
    // Test EDIT_SECTION_REQUEST
    // Test UNDO_SECTION_REQUEST
    // Test REDO_SECTION_REQUEST
  })

  test('updateUndoRedoButtons called with correct params', () => {
    // Verify debouncing works
    // Check state caching doesn't interfere
  })
})
```

### 3. E2E Tests (Critical User Flows)

#### Builder Workspace E2E
```typescript
// e2e/builder-workspace.spec.ts
test.describe('Builder Workspace', () => {
  test('complete edit → undo → redo flow', async ({ page }) => {
    // 1. Navigate to workspace
    // 2. Wait for preview to load
    // 3. Edit hero section
    // 4. Verify undo button appears
    // 5. Click undo
    // 6. Verify content reverted
    // 7. Verify redo button appears
    // 8. Click redo
    // 9. Verify content restored
    // 10. Verify both buttons visible
  })

  test('multiple section edits maintain independent history', async ({ page }) => {
    // Edit hero section
    // Edit features section
    // Undo hero (features unchanged)
    // Undo features (hero unchanged)
  })

  test('layout switching preserves section history', async ({ page }) => {
    // Edit sections in one layout
    // Switch layouts
    // Return to original layout
    // Verify history intact
  })
})
```

#### Question Flow E2E
```typescript
// e2e/question-flow.spec.ts
test.describe('Question Flow', () => {
  test('complete question flow with preview updates', async ({ page }) => {
    // Answer questions
    // Verify preview updates
    // Check history not corrupted
  })
})
```

### 4. Visual Regression Tests

```typescript
// e2e/visual-regression.spec.ts
test.describe('Visual Regression', () => {
  test('undo/redo buttons visual states', async ({ page }) => {
    // Screenshot enabled state
    // Screenshot disabled state
    // Screenshot hover state
  })
})
```

## Implementation Plan

### Phase 1: Foundation (Week 1)
1. **Setup Vitest**
   ```bash
   npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom
   npm install -D @testing-library/user-event jsdom
   ```

2. **Create test configuration**
   ```typescript
   // vitest.config.ts
   import { defineConfig } from 'vitest/config'
   import react from '@vitejs/plugin-react'
   
   export default defineConfig({
     plugins: [react()],
     test: {
       environment: 'jsdom',
       setupFiles: './src/test/setup.ts',
       globals: true,
     },
   })
   ```

3. **Add test scripts**
   ```json
   {
     "scripts": {
       "test": "vitest",
       "test:ui": "vitest --ui",
       "test:coverage": "vitest --coverage"
     }
   }
   ```

### Phase 2: Critical Path Tests (Week 2)
1. Write tests for per-section-history-store
2. Write tests for undo/redo button logic
3. Write integration tests for edit → undo → redo flow

### Phase 3: E2E Setup (Week 3)
1. **Setup Playwright**
   ```bash
   npm install -D @playwright/test
   npx playwright install
   ```

2. Write E2E tests for critical user flows
3. Add visual regression tests

### Phase 4: CI Integration (Week 4)
1. Add GitHub Actions workflow
2. Run tests on PR
3. Block merge on test failure

## Testing Patterns

### Mock iframe Communication
```typescript
// test-utils/mock-iframe.ts
export function mockIframeWindow() {
  return {
    contentWindow: {
      document: createMockDocument(),
      updateUndoRedoButtons: vi.fn(),
      postMessage: vi.fn()
    }
  }
}
```

### Test History State
```typescript
// test-utils/history-helpers.ts
export function setupHistoryWithEdits(count: number) {
  const store = usePerSectionHistoryStore.getState()
  for (let i = 0; i < count; i++) {
    store.recordEdit('layout1', 'hero', 'hero', 
      { content: `edit-${i}` }, `Edit ${i}`)
  }
}
```

### Async State Updates
```typescript
// test-utils/async-helpers.ts
export async function waitForButtonUpdate() {
  // Wait for debounced updates
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 100))
  })
}
```

## Test Data Management

### Fixtures
```typescript
// test-data/fixtures.ts
export const mockComponents = {
  hero: {
    original: { id: 'hero-1', content: 'Original' },
    edited: { id: 'hero-2', content: 'Edited' }
  }
}
```

## Success Metrics
- 80% code coverage for critical paths
- All E2E tests passing before deploy
- Visual regression tests catch UI changes
- Test execution < 5 minutes locally
- Zero production bugs in tested features

## Maintenance
- Review and update tests with each feature
- Add regression tests for each bug fix
- Refactor tests when refactoring code
- Keep test data realistic and up-to-date