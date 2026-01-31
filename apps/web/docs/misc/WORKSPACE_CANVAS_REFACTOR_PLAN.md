# Workspace Canvas Refactoring Plan

## 🎯 **Goal**: Transform 1044-line spaghetti code into clean, maintainable modules

## 📊 **Current State Analysis**
- **File size**: 1044 lines (+744 lines of changes)
- **Issues**: Debugging code, duplicate logic, mixed concerns, complex DOM manipulation
- **Maintainability**: Poor - critical logic scattered throughout

## 🏗️ **New Architecture**

### 1. **UndoRedoButtonManager** (Service Layer)
```typescript
// /src/services/undo-redo/UndoRedoButtonManager.ts
class UndoRedoButtonManager {
  - updateButtons()           // Primary iframe communication
  - updateButtonsDirectly()   // Direct DOM manipulation fallback
  - cleanupExistingButtons()  // Comprehensive button cleanup
  - createButtons()           // Consistent button creation
  - State caching & debouncing
}
```

### 2. **useUndoRedoManager** (Hook Layer)
```typescript
// /src/hooks/useUndoRedoManager.ts
const { handleUndo, handleRedo, updateSectionButtons, recordEditAndUpdateButtons } = useUndoRedoManager({
  currentLayoutId,
  onUndo: handleUndoSection,
  onRedo: handleRedoSection
})
```

### 3. **Simplified WorkspaceCanvas** (Component Layer)
```typescript
// Clean component focused on:
- Message handling coordination
- State management
- UI rendering
- Business logic
```

## 🔄 **Refactoring Steps**

### Step 1: Extract Button Management
- ✅ Create `UndoRedoButtonManager` class
- ✅ Create `useUndoRedoManager` hook
- 🔄 Update `workspace-canvas.tsx` to use new abstractions

### Step 2: Clean Up workspace-canvas.tsx
- Remove duplicate button creation logic (2x copies → 1x abstraction)
- Remove debugging console.logs (keep essential logging via logger)
- Remove complex retry mechanisms (handled by button manager)
- Remove direct DOM manipulation (moved to service)
- Simplify message handlers to use hook methods

### Step 3: Extract Additional Services (Optional)
- `MessageHandler` - Handle iframe communication
- `SectionEditManager` - Handle section editing workflow
- `DebugLogger` - Centralized debugging utilities

## 📈 **Expected Benefits**

### Maintainability
- **Single responsibility** - Each module has one clear purpose
- **No duplication** - Button logic in one place
- **Clear interfaces** - Hook provides clean API
- **Testable** - Each module can be unit tested

### Performance
- **Debounced updates** - Built into button manager
- **Efficient caching** - State cache prevents unnecessary updates
- **Cleanup management** - Proper timeout/memory cleanup

### Robustness
- **Fallback systems** - Graceful degradation built-in
- **Error boundaries** - Isolated error handling
- **State consistency** - Centralized state management

### Developer Experience
- **Clean workspace-canvas.tsx** - Focus on business logic
- **Reusable services** - Can be used by other components
- **Better debugging** - Centralized logging
- **Type safety** - Strong TypeScript interfaces

## 🎯 **Target File Sizes**
- `workspace-canvas.tsx`: 1044 lines → ~400 lines (-62%)
- `UndoRedoButtonManager.ts`: ~200 lines
- `useUndoRedoManager.ts`: ~150 lines
- **Total**: Similar LOC but much better organized

## 🧪 **Migration Strategy**
1. **Create new modules** (✅ Done)
2. **Update workspace-canvas incrementally** - Replace sections one by one
3. **Test each change** - Ensure undo/redo still works
4. **Remove old code** - Clean up after migration
5. **Add tests** - Unit test the new modules

## 🔍 **Code Review Checklist**
- [ ] No duplicate button creation logic
- [ ] No console.log debugging (use logger)
- [ ] Clean separation of concerns
- [ ] Proper error handling
- [ ] Memory leak prevention (cleanup timeouts)
- [ ] Type safety throughout
- [ ] Performance optimizations in place