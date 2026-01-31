# Builder Architecture Analysis - Unified Implementation Guide

## Executive Summary

This unified analysis combines comprehensive technical documentation with real-world bug scenarios and expert-validated solutions for the SheenApps builder architecture as of December 2024. The system has achieved significant performance improvements (2-5x faster preview rendering, 26% bundle size reduction) while facing critical challenges with state synchronization, memory management, and architectural complexity.

**Expert Validation**: Architecture refactor plan reviewed and enhanced by senior engineering expert with specific implementation timeline and safeguards.

## Table of Contents
1. [Core Architecture Overview](#1-core-architecture-overview)
2. [State Management Deep Dive](#2-state-management-deep-dive)
3. [Preview System Analysis](#3-preview-system-analysis)
4. [Critical Issues & Known Bugs](#4-critical-issues--known-bugs)
5. [Performance & Optimization](#5-performance--optimization)
6. [Expert-Validated Implementation Roadmap](#6-expert-validated-implementation-roadmap)
7. [Success Metrics & Monitoring](#7-success-metrics--monitoring)
8. [Lessons Learned & Future Considerations](#8-lessons-learned--future-considerations)

## 1. Core Architecture Overview

### Component Hierarchy

```
/src/components/builder/
├── enhanced-workspace-page.tsx (318 lines) - Main orchestrator
├── workspace/
│   ├── workspace-core.tsx (384 lines) - State coordinator
│   ├── workspace-canvas.tsx - Preview container
│   └── workspace-preview.tsx - Preview manager
├── question-flow/
│   ├── question-interface.tsx (945 lines) - User interaction
│   └── mobile-question-interface.tsx - Mobile variant
└── preview/
    ├── preview-renderer.tsx (233 lines) - React preview
    └── section-renderers/ - Individual section components
```

### Key Architectural Patterns

1. **Layered Architecture**
   - Clear separation between UI, business logic, and data layers
   - Dependency injection for services
   - Component composition over inheritance

2. **Event-Driven Communication**
   - 30+ event types coordinated through EventCoordinator
   - Loose coupling between systems
   - Comprehensive event logging for debugging

3. **Lazy Loading Strategy**
   - Dynamic imports for heavy components
   - Code splitting at route and component levels
   - Reduced initial bundle by ~200KB

## 2. State Management Deep Dive

### Unified Store Architecture

```typescript
// /src/store/builder-store.ts
interface BuilderState {
  projectId: string
  layouts: Record<string, Layout>
  history: {
    stack: Snapshot[]
    index: number
  }
  sectionHistory: { // Per-section undo/redo
    [sectionId: string]: {
      undoStack: Snapshot[]
      redoStack: Snapshot[]
    }
  }
  ui: {
    currentLayoutId: string
    modal: 'edit' | null
    activeEditSection: string | null
  }
}
```

### Critical Issues

1. **Store Race Conditions**
   ```typescript
   // Multiple components race to initialize
   useEffect(() => {
     if (projectId && !isStoreReady) {
       initializeProject(projectId) // Can be called multiple times
     }
   }, [projectId, isStoreReady])
   ```

2. **Memory Leaks**
   - Section history never cleaned up
   - Unbounded snapshot storage
   - Each edit creates 2 snapshots (global + section)
   - 100 operations = ~5MB memory growth

## 3. Preview System Analysis

### Performance Comparison

| Metric | Iframe Preview | React Preview | Improvement |
|--------|---------------|---------------|-------------|
| Initial Render | 500-800ms | 100-200ms | 4x faster |
| Update Speed | 200-300ms | 20-50ms | 5x faster |
| Memory Usage | Separate context | Shared context | 50% less |
| Bundle Size | +150KB | +50KB | 100KB saved |

### Implementation Challenges

1. **Style Isolation**
   - CSS-in-JS creates potential conflicts
   - No shadow DOM isolation
   - Global styles can leak

2. **Preview Fidelity**
   - React components != production HTML
   - Different rendering behavior
   - Potential hydration mismatches

## 4. Critical Issues & Known Bugs

### 4.1 Real-World Bug Scenarios

#### Section Edit Restoration Failures
**The Core Problem**: Section edits don't preserve when navigating between layouts

**What Users Experience:**
- User edits hero section on Layout A
- User switches to Layout B, then back to Layout A
- **RESULT**: Original layout shows, edited content lost
- **User Impact**: "I lost all my changes!"

**Failed Attempts:**
1. Direct DOM manipulation approach
2. PostMessage coordination
3. Multiple timer delays (100ms, 200ms, 300ms, 800ms)
4. CSS variable persistence

**Current Status**: ❌ **STILL BROKEN** - Works sometimes, fails randomly

#### Button Disappearing Issue
**The Core Problem**: Edit/Undo/Redo buttons appear briefly then vanish

**Root Cause Discovery:**
- `updateUndoRedoButtons()` function hiding buttons when no history exists
- Restored sections treated as "no history" sections
- Button visibility logic conflicts between different code paths

**Current Status**: ⚠️ **PARTIALLY FIXED** - Latest fix may resolve but needs testing

### 4.2 Development Experience Issues

#### Development Server Corruption
**What Happens:**
- User refreshes page
- Browser downloads files named "en", "ar-eg" instead of rendering
- Console shows: `Cannot find module './vendor-chunks/next.js'`

**Workaround**: `npm run dev:safe` (clears cache, uses polling)

#### Impossible to Debug
```
1. Set breakpoint in parent window
2. Error occurs in iframe
3. No stack trace crosses boundary
4. Console shows nothing
5. Give up, add more setTimeout delays
```

## 5. Performance & Optimization

### Bundle Size Achievements

```
Homepage: 314KB → 233KB (-26%)
Builder: 340KB → 257KB (-24%)
Build Time: 14s → 5s (3x faster)
```

### Key Optimizations

1. **Icon System Refactor**
   ```typescript
   // Before: import { ArrowRight } from 'lucide-react'
   // After: <Icon name="arrow-right" />
   // Savings: ~50KB
   ```

2. **Motion Library Optimization**
   ```typescript
   // LazyMotion with minimal features
   import { LazyMotion, domAnimation } from 'framer-motion'
   // Savings: ~30KB
   ```

### Performance Bottlenecks

1. **Memory Growth**: ~5MB per 100 operations
2. **React Re-renders**: Missing React.memo on heavy components
3. **Initial Load Blocking**: Question generation blocks UI

## 6. Expert-Validated Implementation Roadmap

### Phase 1: Stabilization (Weeks 1-2)

#### Week 1 Must-Dos

- [ ] **Lock Store Initialization** (P0 - Data Loss Prevention)
  ```typescript
  // Add to builder-store.ts
  const initLock = new Map<string, Promise<void>>()
  
  export const initializeProject = async (projectId: string) => {
    if (!initLock.has(projectId)) {
      initLock.set(projectId, performInitialization(projectId))
    }
    return initLock.get(projectId)!
  }
  ```

- [ ] **Global Error Boundary + Sentry/Grafana Hook** (P0 - Production Stability)
  ```typescript
  // app/[locale]/layout.tsx
  export default function RootLayout({ children }) {
    return (
      <html>
        <body>
          <ErrorBoundary
            fallback={<BuilderRecoveryUI />}
            onError={(error, errorInfo) => {
              captureException(error, errorInfo)
              sendToGrafana({ type: 'crash', error })
            }}
          >
            {children}
          </ErrorBoundary>
        </body>
      </html>
    )
  }
  ```

- [ ] **Cap Section History** (P0 - Memory Management)
  ```typescript
  const MAX_SNAPSHOTS = 50
  
  if (sectionHistory[sectionId].undoStack.length > MAX_SNAPSHOTS) {
    requestIdleCallback(() => {
      sectionHistory[sectionId].undoStack = 
        sectionHistory[sectionId].undoStack.slice(-MAX_SNAPSHOTS)
    })
  }
  ```

- [ ] **Enable noImplicitAny Gradually** (P1 - Type Safety)
  ```json
  // tsconfig.json - Start with warnings
  {
    "compilerOptions": {
      "noImplicitAny": false,
      "strict": false
    }
  }
  // Then fix files incrementally: builder-store.ts → workspace-core.tsx → preview-renderer.tsx
  ```

- [ ] **Wire Performance Metrics to Grafana** (P1 - Baseline Data)
  ```typescript
  // utils/performance-metrics.ts
  export const metrics = {
    TTI: () => {
      const tti = performance.getEntriesByType('navigation')[0].loadEventEnd
      sendToGrafana({ metric: 'TTI', value: tti })
    },
    memoryUsage: () => {
      if (performance.memory) {
        sendToGrafana({ 
          metric: 'memory', 
          value: performance.memory.usedJSHeapSize 
        })
      }
    }
  }
  ```

### Phase 2: Optimization (Weeks 3-6)

- [ ] **Visual Regression Tests First** (P0 - Prevent Silent Drift)
  ```typescript
  // __tests__/visual-regression.test.ts
  beforeAll(() => {
    // Capture baseline screenshots of all sections
  })
  
  afterEach(() => {
    // Compare against baseline before any preview changes
  })
  ```

- [ ] **Retire Iframe Preview** (P1 - After Visual Tests Pass)
  - Remove iframe code paths
  - Consolidate to React preview only
  - Verify visual regression tests still pass

- [ ] **Paint-Time Optimizations** (P1 - Ship Together)
  ```typescript
  // Skeleton states
  const SectionSkeleton = () => (
    <div className="animate-pulse bg-gray-200 h-64" />
  )
  
  // React.memo on heavy components
  export const HeroSection = React.memo(({ data }) => {
    // Component implementation
  }, (prevProps, nextProps) => {
    return prevProps.data.id === nextProps.data.id
  })
  ```

- [ ] **Merge WorkspaceCore into Parent** (P1 - Flatten Architecture)
  ```typescript
  // From 5+ layers to 3 layers
  // WorkspacePage → PreviewCanvas → SectionRenderers
  ```

- [ ] **Implement Unified History System** (P1 - Simplify State)
  ```typescript
  interface UnifiedHistory {
    stack: Array<{
      snapshot: Snapshot
      sectionId?: string
      layoutId: string
      type: 'global' | 'section'
    }>
    index: number
  }
  ```

### Phase 3: Scale & Future (Weeks 7-14)

- [ ] **Real-Time Collaboration Prep** (P1 - Before Micro-frontends)
  ```typescript
  // Research CRDT implementation
  import * as Y from 'yjs'
  
  const ydoc = new Y.Doc()
  const sections = ydoc.getMap('sections')
  
  // This will affect micro-frontend boundaries
  ```

- [ ] **Edge Function Latency + Cost Dashboards** (P1 - Grafana Integration)
  ```typescript
  // api/ai/generate/route.ts
  export const runtime = 'edge'
  
  export async function POST(request: Request) {
    const start = Date.now()
    const response = await generateAI()
    
    sendToGrafana({
      metric: 'edge-function-latency',
      value: Date.now() - start,
      function: 'ai-generate'
    })
    
    return response
  }
  ```

- [ ] **Accessibility Audit Pass** (P1 - Before Architecture Freeze)
  ```json
  // package.json
  {
    "scripts": {
      "test:a11y": "axe-core ./src/**/*.tsx",
      "ci:accessibility": "npm run test:a11y -- --fail-on-violation"
    }
  }
  ```

- [ ] **Evaluate Micro-frontends** (P2 - After CRDT Constraints Clear)
  - Module Federation vs single-spa
  - Measure bundle impact
  - Consider CRDT synchronization boundaries

- [ ] **Deploy AI to Edge Functions** (P2 - Performance + Cost)
  - Stream responses for better UX
  - Monitor costs in Grafana dashboard
  - Set up alerts for usage spikes

## 7. Success Metrics & Monitoring

### Performance Targets
- **Time to Interactive (TTI)**: <1.5s (from current ~2.5s)
- **Memory Growth**: <1MB per 100 operations (from current 5MB)
- **Bundle Size**: <300KB total (from current 340KB)
- **Crash Rate**: <0.1% (from current ~2%)

### Monitoring Setup
```typescript
// Grafana dashboard configuration
{
  panels: [
    { title: "TTI by Locale", metric: "tti_by_locale" },
    { title: "Memory Growth Rate", metric: "memory_growth_rate" },
    { title: "Edge Function Costs", metric: "edge_function_costs" },
    { title: "Error Rate by Component", metric: "error_rate" }
  ]
}
```

### Developer Velocity Metrics
- **Type Coverage**: 100% (from current ~60%)
- **Test Coverage**: >80% (from current ~40%)
- **Build Time**: <5s (maintained)
- **PR Review Time**: <4 hours (from current ~8 hours)

## 8. Lessons Learned & Future Considerations

### Key Architectural Insights

1. **Iframe Architecture Is Problematic**
   - Message passing is unreliable
   - DOM access across boundaries is fragile
   - Debugging is nearly impossible

2. **Multiple State Systems Don't Work**
   - Different stores get out of sync
   - No single source of truth
   - Testing becomes impossible

3. **Timing-Based Solutions Are Unreliable**
   - setTimeout delays don't guarantee order
   - Different browsers have different timing
   - Mobile performance varies timing

### Questions for Ongoing Evaluation

1. **Preview Architecture**
   - How to ensure React preview matches production?
   - Should we consider server-side preview generation?

2. **State Management**
   - Is event sourcing worth the complexity for better debugging?
   - Should we migrate to Redux Toolkit for better DevTools?

3. **Collaboration Features**
   - What's the real-time collaboration priority?
   - How do we handle conflict resolution?

4. **Performance vs Features**
   - Which features can we defer for better performance?
   - What's our mobile performance strategy?

### The Fundamental Question

**"Should we be doing preview editing this way at all?"**

The industry may have better patterns for:
- Real-time preview systems
- Cross-frame communication
- State management for editing
- Undo/redo in preview contexts
- Layout switching with preservation

Our current approach might be fundamentally flawed rather than just buggy.

---

This unified analysis serves as both a historical record of challenges faced and a practical guide for implementing solutions. The phased approach ensures stability first, optimization second, and scalability last, with continuous monitoring and safeguards throughout.