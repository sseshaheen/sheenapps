# Technical Debt Documentation

## Overview
This document tracks temporary fixes and disabled features introduced during the Sprint 1-3 integration debugging session. These items should be addressed when implementing Sprint 4 (Event-Driven Architecture) or as part of regular maintenance.

## High Priority Items

### 1. Event System Architecture ✅ **COMPLETED**
**Location**: `src/utils/event-logger.ts`
**Issue**: Event system completely disabled with stub implementation
**Solution Applied**: 
```typescript
// Feature-flag controlled event emitter
function createEventEmitter(): Emitter<BuilderEvents> {
  if (FEATURE_FLAGS.ENABLE_EVENT_SYSTEM) {
    return mitt<BuilderEvents>()
  }
  return stubEmitter // No-op when disabled
}
```
**Status**: ✅ Implemented conditional event system with 30+ comprehensive event types

### 2. Builder Store Integration ⚠️ **PARTIALLY COMPLETE**
**Locations**: Multiple files
- `src/components/builder/workspace/workspace-core.tsx`
- `src/components/builder/builder-wrapper.tsx`
- `src/services/preview/live-preview-engine.ts`

**Issue**: ✅ Imports re-enabled, but store usage disabled due to infinite loop
**Current Fix**: `const useNewStore = false // FEATURE_FLAGS.ENABLE_NEW_STORE`
**Root Cause**: Store selectors returning new objects causing React re-renders
**Detailed Issue**: `selectors.currentSections` returns `{}` when no layout, creates new object reference
**Fix Required**:
1. Use stable empty objects: `const EMPTY_SECTIONS = {}` ✅ Applied
2. Proper store initialization with project data
3. Consider shallow comparison in Zustand hooks
**Proper Solution**: Wait for Sprint 4 to properly integrate with event-driven architecture

## Medium Priority Items

### 3. Missing Event Types ✅ **COMPLETED**
**Locations**: Throughout codebase
**Issue**: Many event types not defined in BuilderEvents interface
**Solution Applied**: Added comprehensive event types including:
- ✅ `history:section_agnostic_edit`
- ✅ `history:undo_section_agnostic`
- ✅ `history:redo_section_agnostic`
- ✅ `history:cross_layout_operation`
- ✅ `snapshot:created`
- ✅ `snapshot:restored`
- ✅ `snapshot:restore_failed`
- ✅ `snapshots:cleanup`
- ✅ `builder:undo`
- ✅ `builder:redo`
- ✅ `builder:clear_history`
- ✅ Plus 20+ additional event types for complete coverage

**Status**: ✅ All event emissions re-enabled with proper type checking

### 4. Database Collaborators Issue
**Location**: `src/services/database/projects-temp-fix.ts`
**Issue**: Infinite recursion in project_collaborators join
**Current Fix**: Removed join, returning empty arrays
**Proper Solution**: Fix recursive join or redesign schema

### 5. Feature Flag Controls
**Location**: `src/components/builder/workspace/workspace-core.tsx`
**Issue**: Feature flags hardcoded to false
**Current Fix**: `const useNewStore = false // FEATURE_FLAGS.ENABLE_NEW_STORE`
**Proper Solution**: Use actual feature flags once integration is stable

## Low Priority Items

### 6. Web Vitals Monitoring
**Location**: `src/app/[locale]/layout.tsx`
**Issue**: Causing excessive analytics requests
**Current Fix**: Component commented out
**Proper Solution**: Add rate limiting or batching

### 7. Test File Locations
**Locations**: 
- `src/services/snapshots/__tests__/`
- `src/services/undo-redo/__tests__/`
- `src/services/history/__tests__/`

**Issue**: Test files in service directories instead of root `__tests__`
**Current Fix**: Left in service directories
**Proper Solution**: Either pattern is acceptable, choose one and be consistent

### 8. Development Event Logging
**Location**: `src/utils/event-logger.ts:172`
**Issue**: Module-level event subscription causing errors
**Current Fix**: `if (false && process.env.NODE_ENV === 'development')`
**Proper Solution**: Lazy initialization or proper conditional loading

## Code Cleanup Checklist

When addressing this tech debt:

1. [ ] Fix event system architecture to support conditional initialization
2. [ ] Add all missing event types to BuilderEvents interface
3. [ ] Re-enable event emissions one by one with testing
4. [ ] Implement Sprint 4 (Event-Driven Architecture) 
5. [ ] Re-enable builder store imports after Sprint 4
6. [ ] Fix database collaborators recursive join
7. [ ] Add rate limiting to Web Vitals
8. [ ] Review and set proper feature flags
9. [ ] Remove all "temporarily disabled" comments
10. [ ] Update this document as items are resolved

## Related Files
- Sprint Roadmap: `IMPLEMENTATION_ROADMAP.md`
- Architecture Decisions: `EXPERT_RECOMMENDATIONS_IMPLEMENTATION_PLAN.md`
- Development Guide: `CLAUDE.md`

## Notes
Most of these temporary fixes should be resolved as part of Sprint 4 implementation, which is designed to properly integrate all the new systems with an event-driven architecture.