# Testing Strategy & Critical Learnings

## Overview
This test suite was developed after implementing an inline undo/redo system that experienced multiple critical bugs during development. These tests serve as regression prevention and document the key failure patterns we discovered.

## Critical Bug Patterns Discovered

### 1. Edit → Undo → Redo → Buttons Disappear
**Problem**: After performing edit → undo → redo sequence, both buttons would disappear
**Root Cause**: Button visibility logic incorrectly evaluated `canUndo || canRedo` as false
**Solution**: Implemented `hasAnyHistory` pattern - buttons stay visible if any history exists
**Tests**: `button-state-matrix.test.ts` - covers all state combinations

### 2. Button ID Mismatch Crisis  
**Problem**: Buttons created with IDs like `undo-hero-luxury-premium-hero-color-scheme` but search looked for `undo-hero-hero`
**Root Cause**: Dynamic component IDs vs static search patterns
**Solution**: Multi-pattern fallback matching with priority order
**Tests**: `pattern-matching.test.ts` - tests the exact patterns that failed

### 3. Stale State References in Zustand
**Problem**: Tests failing due to stale store state between operations
**Root Cause**: Using captured state instead of fresh `getState()` calls
**Solution**: Always call `usePerSectionHistoryStore.getState()` fresh after mutations
**Tests**: All store tests now use this pattern correctly

### 4. Iframe Communication Brittleness
**Problem**: Button updates failing when iframe not ready or cross-origin issues
**Root Cause**: No error handling for DOM access failures
**Solution**: Graceful degradation with retry logic and fallback patterns
**Tests**: `error-handling.test.ts` - covers iframe failure scenarios

## Test Architecture

### Store Tests (`per-section-history-store.test.ts`)
- **Purpose**: Core business logic validation
- **Focus**: Edit sequences, history limits, state transitions
- **Key Pattern**: Always use fresh `getState()` calls

### Integration Tests (`undo-redo-integration.test.tsx`)
- **Purpose**: End-to-end workflow validation
- **Focus**: Multi-component interaction, real user scenarios
- **Key Pattern**: Test complete edit → undo → redo cycles

### Component Tests (`component-renderer.test.ts`)
- **Purpose**: Button generation and styling validation
- **Focus**: HTML structure, event handlers, ID patterns
- **Key Pattern**: Verify exact button IDs and click handlers

### Edge Case Tests
- **Pattern Matching**: Complex ID fallback scenarios
- **Button States**: All canUndo/canRedo combinations
- **Race Conditions**: Rapid user interactions
- **Error Handling**: Iframe and DOM failures

## Essential Testing Principles

### 1. Test Real Bug Scenarios
Every test corresponds to an actual bug we encountered:
- Button disappearance after specific sequences
- ID mismatches causing missing buttons  
- State corruption during rapid interactions
- Communication failures with iframe

### 2. Use Exact Real-World Data
Tests use the actual component IDs and patterns from our system:
- `hero-luxury-premium-hero-color-scheme`
- `features-ai-generated`
- `testimonials-config-based`

### 3. Test State Transitions, Not Just End States
Critical bugs happen during transitions:
- Edit → Undo (buttons should appear)
- Undo → Redo (buttons should stay visible)
- Multiple rapid operations (state should remain consistent)

### 4. Mock External Dependencies Carefully
Iframe communication is inherently fragile:
- Mock `getElementById` to return null (button not found)
- Mock `postMessage` to throw errors (communication failure)
- Test recovery mechanisms and graceful degradation

## Running Tests

```bash
# Run all tests
npm test

# Run specific test categories
npm test button-state-matrix
npm test pattern-matching  
npm test error-handling
npm test race-conditions

# Run with coverage
npm test -- --coverage
```

## Debugging Failed Tests

### Common Issues:
1. **Store state pollution**: Ensure `beforeEach` resets store state
2. **Async timing**: Use proper `await` for async operations
3. **Mock cleanup**: Reset mocks between tests with `vi.clearAllMocks()`

### Debug Patterns:
```typescript
// Log store state during test
const state = usePerSectionHistoryStore.getState()
console.log('Store state:', state.histories)

// Verify exact button patterns
console.log('Looking for button ID:', expectedButtonId)
console.log('Available button IDs:', mockDocument.queriedIds)
```

## Future Test Considerations

### When Adding New Features:
1. **Test the integration**: How does it interact with undo/redo?
2. **Test edge cases**: What happens during rapid user interactions?
3. **Test error scenarios**: How does it handle iframe communication failures?
4. **Test state consistency**: Does it maintain proper history state?

### When Refactoring:
1. **Run full test suite first**: Establish baseline
2. **Maintain test coverage**: Don't break existing tests
3. **Add regression tests**: For any new bugs discovered
4. **Update mocks carefully**: Ensure they still reflect real behavior

## Key Learning: Prevention Over Debugging

These tests exist because debugging iframe communication issues and state management bugs in development was extremely time-consuming. The test suite now catches these issues immediately, making development much safer and faster.

**Remember**: Every test here represents hours of debugging that we never want to repeat.