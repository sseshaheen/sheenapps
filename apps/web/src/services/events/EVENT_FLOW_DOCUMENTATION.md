# Event-Driven Architecture Documentation

## Overview
This document describes the event flow between the unified builder store, preview engine, and history management systems.

## Event Flow Patterns

### 1. User Edit Flow
```
User Action → Component → Event → Store → Event → Preview
```

1. User edits section in UI
2. Component emits `section:edited` event
3. Store reducer handles edit via `applyEdit`
4. Store emits `store:state_change` event
5. Preview engine listens and updates display

### 2. Undo/Redo Flow
```
User Action → Store → Event → Preview + History
```

1. User clicks undo/redo
2. Store restores snapshot
3. Store emits `history:undo` or `history:redo`
4. Preview syncs with new state
5. History manager updates UI state

### 3. Layout Switch Flow
```
User Selection → Store → Event → Preview Reset
```

1. User switches layout
2. Store emits `layout:switching`
3. Preview saves current state
4. Store switches active layout
5. Store emits `layout:switch_complete`
6. Preview loads new layout sections

## Key Event Types

### Store Events
- `store:action` - Any store action dispatched
- `store:state_change` - State changed after action
- `edit:committed` - Edit successfully applied

### Preview Events
- `preview:mounted` - Preview component ready
- `preview:sync_start` - Beginning sync with store
- `preview:sync_complete` - Sync finished
- `preview:update_from_store` - Section updated from store

### History Events
- `history:section_agnostic_edit` - Edit across any section type
- `history:undo_section_agnostic` - Undo operation
- `history:redo_section_agnostic` - Redo operation
- `snapshot:created` - New snapshot saved
- `snapshot:restored` - Snapshot applied

### Layout Events
- `layout:changed` - Active layout switched
- `layout:switching` - Switch in progress
- `layout:switch_complete` - Switch finished

## Event Handlers

### Store Subscriptions
```typescript
// Store listens to edit events
events.on('section:edited', ({ sectionId, content }) => {
  store.getState().applyEdit(sectionId, content, 'user-edit')
})

// Store emits state changes
store.subscribe((state, prevState) => {
  events.emit('store:state_change', {
    before: prevState,
    after: state,
    action: 'edit',
    timestamp: Date.now()
  })
})
```

### Preview Subscriptions
```typescript
// Preview listens to store changes
events.on('store:state_change', ({ after }) => {
  preview.syncWithState(after)
})

// Preview emits sync events
events.on('preview:sync_start', ({ layoutId }) => {
  console.log(`Syncing preview for layout ${layoutId}`)
})
```

### History Subscriptions
```typescript
// History manager listens to edits
events.on('section:edited', ({ sectionId, content, userAction }) => {
  historyManager.recordEdit(sectionId, content, userAction)
})

// History emits undo/redo events
events.on('history:undo', ({ sectionId, fromIndex, toIndex }) => {
  console.log(`Undo: ${sectionId} from ${fromIndex} to ${toIndex}`)
})
```

## Race Condition Prevention

### Critical Sections
1. **Store Updates** - Use immer for atomic updates
2. **Preview Sync** - Queue updates, process sequentially
3. **History Operations** - Lock during undo/redo

### Event Ordering
1. Always emit events AFTER state changes
2. Use timestamps for event ordering
3. Queue concurrent events

## Performance Considerations

### Event Throttling
- Preview updates: Max 60fps (16ms throttle)
- State persistence: 1s debounce
- History snapshots: After user pause (500ms)

### Event Batching
- Batch multiple section edits
- Combine rapid undo/redo operations
- Aggregate preview updates

## Testing Events

### Unit Tests
```typescript
it('emits section:edited on user edit', () => {
  const spy = vi.fn()
  events.on('section:edited', spy)
  
  editSection('hero', newContent)
  
  expect(spy).toHaveBeenCalledWith({
    sectionId: 'hero',
    content: newContent
  })
})
```

### Integration Tests
```typescript
it('syncs preview on store change', async () => {
  const preview = mountPreview()
  const store = createStore()
  
  store.applyEdit('hero', newContent)
  
  await waitFor(() => {
    expect(preview.getSection('hero')).toEqual(newContent)
  })
})
```

## Migration Guide

### From Direct Coupling
```typescript
// OLD: Direct method calls
preview.updateSection(sectionId, content)
store.applyEdit(sectionId, content)

// NEW: Event-driven
events.emit('section:edited', { sectionId, content })
```

### From setTimeout Orchestration
```typescript
// OLD: Timing-based coordination
setTimeout(() => preview.update(), 100)

// NEW: Event-based coordination
events.on('store:state_change', () => preview.update())
```