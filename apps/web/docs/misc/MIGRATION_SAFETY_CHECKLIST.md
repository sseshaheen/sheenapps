# Migration Safety Checklist - Final Expert Checkpoints

## 🚦 **GREEN LIGHT APPROVED** with 4 Critical Safety Measures

### **Checkpoint 1: Migration Dry-Run First**
**Goal**: Verify data integrity before any production changes

#### Pre-Sprint 1 Tasks (This Week)
```typescript
// /src/migrations/__tests__/migration-dry-run.ts
describe('Migration Dry Run', () => {
  it('preserves real project data', async () => {
    // Export actual projects from production/staging
    const realProjects = await exportRealProjectData()
    
    for (const project of realProjects) {
      const migrated = migrateExistingData(project)
      
      // Verify snapshots survive
      expect(migrated.history.stack).toHaveLength(project.expectedHistoryCount)
      
      // Verify undo/redo works
      const afterUndo = undo(migrated)
      expect(afterUndo.layouts).toEqual(project.expectedUndoState)
      
      // Verify layout-switch preserves data
      const afterSwitch = switchLayout(migrated, 'differentLayout')
      expect(afterSwitch.layouts[project.originalLayout]).toEqual(project.originalSections)
    }
  })
})
```

#### Real Project Export Script
```typescript
// /scripts/export-real-projects.ts
export async function exportRealProjectData() {
  const projects = [
    // Get diverse project data
    await getProject('luxury-salon-project'),
    await getProject('minimal-portfolio-project'), 
    await getProject('complex-ecommerce-project'),
    await getProject('heavily-edited-project'),
    await getProject('multi-layout-project')
  ]
  
  return projects.map(project => ({
    id: project.id,
    currentState: getCurrentState(project),
    historyCount: getHistoryCount(project),
    layoutCount: getLayoutCount(project),
    expectedUndoState: getExpectedUndoState(project),
    originalSections: getOriginalSections(project)
  }))
}
```

#### Verification Checklist
- [ ] **Snapshots**: All edit history preserved correctly
- [ ] **Undo/Redo**: Works on migrated data
- [ ] **Layout Switch**: Cross-layout history maintained
- [ ] **Edge Cases**: Empty projects, corrupted data, large histories
- [ ] **Performance**: Migration completes under 2 seconds per project

**🚨 HARD STOP**: Do not proceed to Sprint 1 until ALL real projects migrate successfully

---

### **Checkpoint 2: DevTools & Logging from Day 1**
**Goal**: Surface race conditions and state issues immediately

#### Zustand DevTools Setup
```typescript
// /src/store/builder-store.ts
import { devtools } from 'zustand/middleware'

export const useBuilderStore = create<BuilderState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        // Store implementation
      }))
    ),
    {
      name: 'builder-store',
      enabled: process.env.NODE_ENV === 'development'
    }
  )
)
```

#### Event Logging System
```typescript
// /src/utils/event-logger.ts
import mitt from 'mitt'

const events = mitt()

// Log ALL events during development
if (process.env.NODE_ENV === 'development') {
  events.on('*', (type, data) => {
    console.group(`🎯 Event: ${type}`)
    console.log('Data:', data)
    console.log('Timestamp:', new Date().toISOString())
    console.log('Store State:', useBuilderStore.getState())
    console.groupEnd()
  })
}

export { events }
```

#### State Change Monitoring
```typescript
// /src/store/debug-middleware.ts
const debugMiddleware = (config) => (set, get, api) =>
  config(
    (...args) => {
      const prevState = get()
      set(...args)
      const nextState = get()
      
      // Log state changes
      console.log('🔄 State Change:', {
        action: args[0],
        prev: prevState,
        next: nextState,
        diff: getDiff(prevState, nextState)
      })
    },
    get,
    api
  )
```

#### Development Dashboard
```typescript
// /src/components/debug/dev-dashboard.tsx
function DevDashboard() {
  const state = useBuilderStore()
  
  if (process.env.NODE_ENV !== 'development') return null
  
  return (
    <div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded">
      <h3>Debug Info</h3>
      <div>History Index: {state.history.index}</div>
      <div>History Length: {state.history.stack.length}</div>
      <div>Current Layout: {state.ui.currentLayoutId}</div>
      <div>Can Undo: {selectors.canUndo(state) ? '✅' : '❌'}</div>
      <div>Can Redo: {selectors.canRedo(state) ? '✅' : '❌'}</div>
    </div>
  )
}
```

#### Implementation Checklist
- [ ] **Zustand DevTools**: Time-travel debugging enabled
- [ ] **Event Logging**: All events logged with timestamps
- [ ] **State Monitoring**: State changes tracked and diffed
- [ ] **Dev Dashboard**: Real-time state visibility
- [ ] **Race Condition Detection**: Concurrent events flagged

---

### **Checkpoint 3: Performance Guardrails**
**Goal**: Prevent performance regressions from day 1

#### Bundle Size Budget
```json
// package.json
{
  "scripts": {
    "size-limit": "size-limit",
    "size-check": "size-limit --why"
  },
  "size-limit": [
    {
      "name": "Homepage Bundle",
      "path": "dist/homepage.js",
      "limit": "250 KB",
      "webpack": false
    },
    {
      "name": "Builder Bundle", 
      "path": "dist/builder.js",
      "limit": "250 KB",
      "webpack": false
    }
  ]
}
```

#### History Performance Tests
```typescript
// /src/store/__tests__/performance.test.ts
describe('History Performance', () => {
  it('handles 50 operations under 100ms', () => {
    const state = createInitialState()
    const start = performance.now()
    
    // Apply 50 edits
    let currentState = state
    for (let i = 0; i < 50; i++) {
      currentState = applyEdit(currentState, 'hero', generateContent(), `Edit ${i}`)
    }
    
    // 25 undos
    for (let i = 0; i < 25; i++) {
      currentState = undo(currentState)
    }
    
    // 25 redos
    for (let i = 0; i < 25; i++) {
      currentState = redo(currentState)
    }
    
    const duration = performance.now() - start
    expect(duration).toBeLessThan(100) // Hard limit: 100ms
  })
  
  it('maintains memory efficiency with large history', () => {
    const state = createStateWithHistory(100) // 100 snapshots
    const memoryBefore = performance.memory?.usedJSHeapSize || 0
    
    // Perform operations
    const newState = applyEdit(state, 'hero', largeContent, 'Large Edit')
    
    const memoryAfter = performance.memory?.usedJSHeapSize || 0
    const memoryGrowth = memoryAfter - memoryBefore
    
    expect(memoryGrowth).toBeLessThan(1024 * 1024) // Max 1MB growth
  })
})
```

#### CI Performance Gates
```yaml
# .github/workflows/performance-check.yml
name: Performance Check
on: [pull_request]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - name: Install dependencies
        run: npm ci
        
      - name: Build bundles
        run: npm run build
        
      - name: Check bundle size
        run: npm run size-limit
        
      - name: Run performance tests
        run: npm run test:performance
        
      - name: Fail if performance regressed
        run: |
          if [[ $(npm run test:performance | grep "FAIL") ]]; then
            echo "❌ Performance tests failed"
            exit 1
          fi
```

#### Memory Monitoring
```typescript
// /src/utils/memory-monitor.ts
export class MemoryMonitor {
  private baseline: number = 0
  
  start() {
    this.baseline = performance.memory?.usedJSHeapSize || 0
  }
  
  check(operation: string) {
    const current = performance.memory?.usedJSHeapSize || 0
    const growth = current - this.baseline
    
    if (growth > 5 * 1024 * 1024) { // 5MB threshold
      console.warn(`🚨 Memory warning: ${operation} grew by ${growth / 1024 / 1024}MB`)
    }
  }
}
```

#### Implementation Checklist
- [ ] **Bundle Size Limits**: 250KB hard limit with CI enforcement
- [ ] **History Performance**: <100ms for 50 operations
- [ ] **Memory Efficiency**: <1MB growth per operation
- [ ] **CI Gates**: Performance tests block PRs
- [ ] **Monitoring**: Real-time memory tracking in development

---

### **Checkpoint 4: Feature-Flag Rollout**
**Goal**: Safe progressive rollout with instant rollback capability

#### Feature Flag Implementation
```typescript
// /src/config/feature-flags.ts
export const FEATURE_FLAGS = {
  ENABLE_NEW_PREVIEW: process.env.NEXT_PUBLIC_ENABLE_NEW_PREVIEW === 'true',
  ENABLE_NEW_STORE: process.env.NEXT_PUBLIC_ENABLE_NEW_STORE === 'true',
  ENABLE_REACT_PREVIEW: process.env.NEXT_PUBLIC_ENABLE_REACT_PREVIEW === 'true'
} as const

// Dynamic flags from database/API
export async function getFeatureFlags(userId: string): Promise<typeof FEATURE_FLAGS> {
  const userFlags = await fetch(`/api/feature-flags/${userId}`)
  return { ...FEATURE_FLAGS, ...(await userFlags.json()) }
}
```

#### Progressive Preview Component
```typescript
// /src/components/builder/adaptive-preview.tsx
function AdaptivePreview({ sections, layout }: PreviewProps) {
  const flags = useFeatureFlags()
  
  if (flags.ENABLE_REACT_PREVIEW) {
    return (
      <ErrorBoundary fallback={<IframePreview sections={sections} layout={layout} />}>
        <ReactPreview sections={sections} layout={layout} />
      </ErrorBoundary>
    )
  }
  
  return <IframePreview sections={sections} layout={layout} />
}
```

#### Store Migration Flag
```typescript
// /src/store/store-adapter.ts
export function useAdaptiveStore() {
  const flags = useFeatureFlags()
  
  if (flags.ENABLE_NEW_STORE) {
    return useBuilderStore()
  }
  
  // Legacy store compatibility layer
  return useLegacyStoreAdapter()
}
```

#### Rollout Phases
```typescript
// Phase 1: Internal Team (Sprint 1-2)
const INTERNAL_USERS = ['dev-team@company.com', 'qa-team@company.com']

// Phase 2: Beta Users (Sprint 3)  
const BETA_USERS = ['beta-user-1@example.com', 'power-user@example.com']

// Phase 3: Gradual Rollout (Sprint 4)
const ROLLOUT_PERCENTAGE = 10 // Start with 10% of users

// Phase 4: Full Rollout (Sprint 5)
const ROLLOUT_PERCENTAGE = 100
```

#### Error Tracking & Automatic Rollback
```typescript
// /src/utils/error-tracking.ts
export function trackMigrationError(error: Error, context: any) {
  // Send to error tracking service
  console.error('Migration Error:', error, context)
  
  // Auto-rollback if error rate > 5%
  if (getErrorRate() > 0.05) {
    console.warn('🚨 High error rate detected, triggering auto-rollback')
    disableFeatureFlag('ENABLE_NEW_PREVIEW')
  }
}
```

#### Rollout Checklist
- [ ] **Feature Flags**: Environment variable + database control
- [ ] **Error Boundaries**: New preview falls back to iframe
- [ ] **Internal Rollout**: Team testing for 1 sprint
- [ ] **Beta Testing**: Power users validate for 1 sprint  
- [ ] **Gradual Rollout**: 10% → 50% → 100% over 2 weeks
- [ ] **Auto-Rollback**: High error rate triggers automatic revert
- [ ] **Legacy Path**: Iframe remains available for 1 extra sprint

---

## 📅 **Updated Implementation Timeline**

### **Pre-Sprint: Safety Setup (3 days)**
- [ ] Migration dry-run with real projects
- [ ] DevTools and logging setup
- [ ] Performance guardrails implementation
- [ ] Feature flag infrastructure

### **Sprint 1: Single Store + Safety (Week 1-2)**
- [ ] Unified store with performance monitoring
- [ ] Migration script with real data validation
- [ ] Internal team rollout with feature flags
- [ ] Comprehensive logging and debugging

### **Sprint 2: React Preview + Beta (Week 3-4)**
- [ ] React preview components
- [ ] Beta user rollout (feature flagged)
- [ ] Side-by-side comparison testing
- [ ] Performance validation

### **Sprint 3: Pure Data History + Gradual Rollout (Week 5)**
- [ ] Pure data history implementation
- [ ] 10% → 50% user rollout
- [ ] Performance monitoring at scale
- [ ] Error tracking and auto-rollback

### **Sprint 4: Event Architecture + Full Rollout (Week 6)**
- [ ] Event-driven architecture
- [ ] 100% user rollout
- [ ] Legacy iframe cleanup
- [ ] Performance optimization

---

## 🛡️ **Safety Net Summary**

### **Zero-Risk Migration**
1. **Real Data Validation**: All migrations tested with actual projects
2. **Instant Rollback**: Feature flags enable immediate revert
3. **Performance Gates**: CI blocks any performance regressions
4. **Progressive Rollout**: Internal → Beta → Gradual → Full

### **Continuous Monitoring**
1. **DevTools**: Time-travel debugging throughout development
2. **Event Logging**: Race conditions surface immediately
3. **Performance Tracking**: Memory and timing continuously monitored
4. **Error Tracking**: Auto-rollback on high error rates

### **Fail-Safe Architecture**
1. **Error Boundaries**: New preview falls back to iframe
2. **Legacy Path**: Old system remains available during transition
3. **Data Preservation**: Migration is reversible
4. **Team Safety**: Internal testing before user exposure

**With these checkpoints, we have bulletproof safety measures that eliminate migration risk while ensuring we deliver a fundamentally better architecture.**

🚀 **Ready to proceed with maximum confidence!**