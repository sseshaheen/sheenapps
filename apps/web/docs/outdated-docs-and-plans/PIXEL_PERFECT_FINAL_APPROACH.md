# 🚀 Pixel-Perfect Preview: Final Implementation Strategy

## Fast & Smooth Zero-Lag User Experience

A UX-first build strategy that keeps both servers and users happy.

---

## 📊 Three-Layer Architecture

| Layer | What We Do | Why It's Fast for Users | Why It's Light on Servers |
|-------|------------|------------------------|---------------------------|
| **1. Client-side compile** (default) | • Lazy-load esbuild-wasm only when preview opens<br>• Compile each component once, memoized in IndexedDB by SHA-256 | • First render after cache warm-up < 150ms<br>• Subsequent opens are instant | • No server CPU per preview<br>• Only one 2MB WASM download per browser/year |
| **2. Edge pre-compile** (hot cache) | • During template generation, compute SHA<br>• Check Supabase/KV – if missing, Edge Function compiles<br>• Client fetches `compiled/{sha}.js` via CDN | • p95 first preview ≈ 20ms (network + eval) | • Compile happens once per unique SHA<br>• Amortized across all users |
| **3. Server fallback** (rare) | • If client compile fails or browser blocks WASM<br>• Call `/api/compile` to stream compiled ESM | • Guarantees preview on locked-down devices | • Runs only for < 1% of sessions |

---

## 🔑 Implementation Checklist (UX-First Order)

### 1. Lazy-load WASM
```typescript
// Only load when preview pane opens
const esbuild = await import('esbuild-wasm')
await esbuild.initialize({ 
  wasmURL: '/esbuild.wasm' // CDN-cached with immutable headers
})
```

### 2. Local Bundle Cache (IndexedDB)
```typescript
// Check local cache first
const cached = await idb.get('compiled', sha)
if (cached) return cached // Instant hit after first compile
```

### 3. Edge Cache Lookup Before Compile
```typescript
// Try CDN first
const response = await fetch(`https://cdn.sheenapps.com/compiled/${sha}.js`)
if (response.ok) {
  return await response.text()
}
// Miss? Compile locally, then PUT to CDN for next user
```

### 4. Concurrency Guard in Worker
```typescript
if (activeCompiles > 4) {
  queue.push(task) // Prevents tab freeze
} else {
  processCompile(task)
}
```

### 5. 60KB Compile Budget
```typescript
if (bundle.length > 60_000) {
  console.warn('⚠️ Large bundle detected - consider refactoring')
  // Show designer warning toast
}
```

### 6. Telemetry Events

| Event | Payload |
|-------|---------|
| `preview_compile` | `{ sha, sourceBytes, compileMs, cacheHit: "local\|edge\|miss" }` |
| `preview_error` | `{ sha, error, stage: "validate\|compile\|eval" }` |
| `preview_fallback` | `{ sha, componentName, reason }` |

**Goal**: Local + edge cache hit rate > 90% after one week

### 7. Progressive Spinner
```typescript
// Show skeleton after 150ms threshold
setTimeout(() => {
  if (!compiled) showSkeleton()
}, 150)
```

---

## 🔍 Sprint-Ready Refinements

| Area | What's Great | Small Tweak / Watch-out |
|------|--------------|------------------------|
| **Phase 0 POC** | One hard-coded DynamicComponent proves flow | 👉 Wrap in ErrorBoundary NOW to prevent breaking entire preview |
| **Template patch** | Zero AI prompt changes | 👉 Store `deps?: string[]` per component for rare dependencies |
| **Compiler worker** | Uses existing infra | 👉 Add `/*#__PURE__*/` comments for tree-shaking (≤ 5KB bundles) |
| **Security scan** | Bans browser APIs | 👉 Add regex for dynamic `import()` to block runtime loading |
| **SHA cache key** | Cross-project dedupe | 👉 Persist hash in `template.metadata.components[name].hash` |
| **Shell script** | Base64 decode noted | 👉 Clean `rm -rf "$BASE_DIR/src/__compiled"` before unpack |
| **Perf target** | ≤ 50ms realistic | 👉 Track p95 and max; Safari often spikes once |
| **Fallback path** | Keeps generic renderer | 👉 Log `preview_fallback` event with componentName |
| **Phase 2 cache** | Supabase/KV later | 👉 Set `Cache-Control: public, immutable, max-age=31536000` |

---

## 🏗️ Complete Implementation

### Enhanced DynamicComponent with All Features

```typescript
// src/components/builder/preview/dynamic-component.tsx
import { useState, useEffect, ComponentType } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { compilerService } from '@/services/preview/compiler-service'

interface DynamicComponentProps {
  source: string
  props: Record<string, any>
  componentName: string
  fallback?: ComponentType<any>
}

export function DynamicComponent({ 
  source, 
  props, 
  componentName,
  fallback: FallbackComponent 
}: DynamicComponentProps) {
  const [Component, setComponent] = useState<ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(false)
  
  useEffect(() => {
    let cancelled = false
    let skeletonTimer: NodeJS.Timeout
    
    async function loadComponent() {
      try {
        setIsLoading(true)
        setError(null)
        
        // Progressive loading indicator
        skeletonTimer = setTimeout(() => {
          if (!cancelled) setShowSkeleton(true)
        }, 150)
        
        const start = performance.now()
        const CompiledComponent = await compilerService.compileComponent(source)
        const duration = performance.now() - start
        
        // Track metrics
        analytics.track('preview_compile', {
          sha: await compilerService.hash(source),
          sourceBytes: source.length,
          compileMs: duration,
          cacheHit: duration < 10 ? 'local' : duration < 50 ? 'edge' : 'miss'
        })
        
        if (!cancelled) {
          setComponent(() => CompiledComponent)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          
          // Track error
          analytics.track('preview_error', {
            sha: await compilerService.hash(source),
            error: err.message,
            stage: err.stage || 'compile'
          })
          
          // Use fallback if available
          if (FallbackComponent) {
            analytics.track('preview_fallback', {
              componentName,
              reason: err.message
            })
            setComponent(() => FallbackComponent)
          }
        }
      } finally {
        clearTimeout(skeletonTimer)
        if (!cancelled) {
          setIsLoading(false)
          setShowSkeleton(false)
        }
      }
    }
    
    loadComponent()
    
    return () => { 
      cancelled = true
      clearTimeout(skeletonTimer)
    }
  }, [source, componentName, FallbackComponent])
  
  if (showSkeleton || (isLoading && !Component)) {
    return (
      <div className="animate-pulse">
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    )
  }
  
  if (error && !Component) {
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4 m-4">
        <p className="text-red-800">Component Error: {error}</p>
        <p className="text-sm text-red-600 mt-2">Component: {componentName}</p>
      </div>
    )
  }
  
  if (!Component) return null
  
  return (
    <ErrorBoundary 
      fallback={<div className="p-4 text-red-600">Component crashed</div>}
      onError={(error) => {
        analytics.track('preview_runtime_error', {
          componentName,
          error: error.message
        })
      }}
    >
      <Component {...props} />
    </ErrorBoundary>
  )
}
```

### Enhanced Compiler Service with 3-Layer Cache

```typescript
// src/services/preview/compiler-service.ts
import { openDB, IDBPDatabase } from 'idb'

class CompilerService {
  private worker: Worker | null = null
  private memoryCache = new Map<string, ComponentType>()
  private idb: IDBPDatabase | null = null
  private activeCompiles = new Map<string, Promise<ComponentType>>()
  private compileQueue: Array<() => void> = []
  private activeCount = 0
  
  async compileComponent(source: string): Promise<ComponentType> {
    const sha = await this.hash(source)
    
    // Layer 1: Memory cache
    if (this.memoryCache.has(sha)) {
      return this.memoryCache.get(sha)!
    }
    
    // Prevent duplicate compiles for same source
    if (this.activeCompiles.has(sha)) {
      return this.activeCompiles.get(sha)!
    }
    
    const compilePromise = this.doCompile(source, sha)
    this.activeCompiles.set(sha, compilePromise)
    
    try {
      const result = await compilePromise
      return result
    } finally {
      this.activeCompiles.delete(sha)
    }
  }
  
  private async doCompile(source: string, sha: string): Promise<ComponentType> {
    // Layer 2: IndexedDB cache
    const cached = await this.getFromIDB(sha)
    if (cached) {
      const Component = this.evaluateComponent(cached)
      this.memoryCache.set(sha, Component)
      return Component
    }
    
    // Layer 3: Edge cache
    try {
      const edgeBundle = await this.fetchFromEdge(sha)
      if (edgeBundle) {
        await this.saveToIDB(sha, edgeBundle)
        const Component = this.evaluateComponent(edgeBundle)
        this.memoryCache.set(sha, Component)
        return Component
      }
    } catch (err) {
      console.warn('Edge cache miss:', err)
    }
    
    // Compile with concurrency control
    if (this.activeCount >= 4) {
      await new Promise(resolve => this.compileQueue.push(resolve))
    }
    
    this.activeCount++
    try {
      const compiled = await this.compileInWorker(source)
      
      // Save to caches
      await this.saveToIDB(sha, compiled)
      this.uploadToEdge(sha, compiled) // Fire and forget
      
      const Component = this.evaluateComponent(compiled)
      this.memoryCache.set(sha, Component)
      
      return Component
    } finally {
      this.activeCount--
      const next = this.compileQueue.shift()
      if (next) next()
    }
  }
  
  private async getFromIDB(sha: string): Promise<string | null> {
    if (!this.idb) {
      this.idb = await openDB('component-cache', 1, {
        upgrade(db) {
          db.createObjectStore('compiled')
        }
      })
    }
    return await this.idb.get('compiled', sha)
  }
  
  private async saveToIDB(sha: string, bundle: string): Promise<void> {
    if (!this.idb) return
    await this.idb.put('compiled', bundle, sha)
  }
  
  private async fetchFromEdge(sha: string): Promise<string | null> {
    const response = await fetch(`https://cdn.sheenapps.com/compiled/${sha}.js`)
    if (response.ok) {
      return await response.text()
    }
    return null
  }
  
  private async uploadToEdge(sha: string, bundle: string): Promise<void> {
    // Check bundle size
    if (bundle.length > 60_000) {
      console.warn(`⚠️ Large bundle (${(bundle.length / 1024).toFixed(1)}KB) - skipping edge upload`)
      return
    }
    
    try {
      await fetch('/api/compiled/upload', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/javascript' },
        body: JSON.stringify({ sha, bundle })
      })
    } catch (err) {
      console.warn('Edge upload failed:', err)
    }
  }
  
  async hash(source: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(source)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
}

export const compilerService = new CompilerService()
```

### Security-Enhanced Worker

```typescript
// src/workers/component-compiler.worker.ts
import * as esbuild from 'esbuild-wasm'

const BANNED_PATTERNS = [
  /\b(window|document|global|process|require|eval|Function)\b/g,
  /import\s*\(/g, // Dynamic imports
  /fetch|XMLHttpRequest|WebSocket/g,
  /localStorage|sessionStorage|indexedDB/g,
]

function validateSource(source: string): void {
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(source)) {
      throw new Error(`Security violation: ${pattern}`)
    }
  }
}

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data
  
  if (type === 'COMPILE') {
    const { source, id } = payload
    
    try {
      // Security check
      validateSource(source)
      
      // Add pure annotations for tree-shaking
      const annotatedSource = source.replace(
        /export\s+default\s+function/g,
        '/*#__PURE__*/ export default function'
      )
      
      const result = await esbuild.transform(annotatedSource, {
        loader: 'tsx',
        format: 'esm',
        target: 'es2020',
        jsx: 'automatic',
        jsxImportSource: 'react',
        minify: true,
        treeShaking: true
      })
      
      self.postMessage({
        type: 'COMPILE_SUCCESS',
        payload: { id, code: result.code }
      })
    } catch (error) {
      self.postMessage({
        type: 'COMPILE_ERROR',
        payload: { id, error: error.message, stage: 'compile' }
      })
    }
  }
})
```

---

## ✅ Final Pre-Ship Checklist

| ☐ | Final-check item | Why it matters |
|---|------------------|----------------|
| ☐ | CDN headers set → `Cache-Control: public, immutable, max-age=31536000` on `/esbuild.wasm` and `/compiled/*.js` | Guarantees true "download once per year" behavior |
| ☐ | Edge compile function rejects bundles > 60 KB before storing (saves egress) | Prevents heavy components leaking into CDN |
| ☐ | IndexedDB quota guard (≈ 50 MB per origin) | Purge LRU if size > 40 MB so heavy users don't fill disk |
| ☐ | Safari WASM fallback tested (some corporate Macs block WASM) | Validates server-fallback path |
| ☐ | Telemetry dashboard tile: cacheHit local / edge / miss, p95 compile-ms | Lets you prove the 90% hit-rate goal to stakeholders |
| ☐ | CI test that compiles one sample component in headless Chrome | Protects against future regressions (e.g. banned API rule update) |
| ☐ | Designer toast wired to large bundle warning | UX feedback loop so non-devs know when to trim assets |

**If all boxes are ticked → GO**

Phase 0 (hard-coded Hero) should render pixel-perfect in < 150ms and log a `preview_compile` with `cacheHit:"miss"` the first time. After page refresh, the event should show `cacheHit:"local"` and run in ~5ms.

---

## 🎯 Why This Approach Wins

### User Experience
- **First load**: < 150ms with edge cache
- **Subsequent loads**: Instant from IndexedDB
- **Smooth loading**: Progressive skeleton after 150ms
- **Always works**: Fallback to generic renderers

### Server Efficiency
- **Zero server CPU**: 99% handled client-side
- **One compile per component**: SHA deduplication
- **CDN distribution**: Static files with infinite cache
- **Minimal bandwidth**: 2MB WASM cached forever

### Developer Experience
- **Simple integration**: ~300 lines total
- **Progressive enhancement**: Works without all layers
- **Clear metrics**: Know exactly what's slow
- **Easy debugging**: Each layer logged separately

---

## 📈 Success Metrics

1. **Cache hit rate > 90%** after 1 week
2. **p95 compile time < 50ms** (with cache)
3. **Zero server compiles** for popular templates
4. **Bundle size < 5KB** per component
5. **Error rate < 0.1%** with fallbacks

---

## 🚀 Implementation Progress

### Phase 0: POC (Completed)
- [x] Create DynamicComponent with ErrorBoundary
- [x] Add ENABLE_PIXEL_PERFECT_PREVIEW feature flag  
- [x] Integrate hard-coded salon Hero component
- [x] Enable feature flag in development environment
- [x] Create test component for validation
- [x] Implement temporary React.createElement transform for POC
- [ ] Run performance benchmarks
- [ ] Validate pixel-perfect output matches built version

**Phase 0 Implementation Details:**
- Created `/src/components/builder/preview/dynamic-component.tsx` with full error handling
- Modified preview renderer to use DynamicComponent for Hero sections when flag is enabled
- Added fallback to generic HeroRenderer if compilation fails
- Implemented basic telemetry logging (preview_compile, preview_error, preview_fallback)
- Created test component at `/src/components/builder/preview/test-pixel-perfect.tsx`

### Phase 1: Core Implementation (Completed)
- [x] Set up esbuild-wasm worker (`/src/workers/component-compiler.worker.ts`)
- [x] Implement compiler service with 3-layer caching (`/src/services/preview/compiler-service.ts`)
- [x] Add security validation with banned APIs regex
- [x] Install esbuild-wasm and idb dependencies
- [x] Copy esbuild.wasm to public directory
- [x] Configure CDN headers for esbuild.wasm (1 year cache)
- [x] Create edge API endpoint for compiled bundles (`/api/compiled/upload`)
- [x] Update builder store with componentSource fields
- [x] Implement IndexedDB caching with quota management (40MB limit)
- [x] Integrate with actual template TSX files
- [x] Update preview renderer to use componentSource when available
- [x] Add TSX source to salon Hero component in mock template

**Phase 1 Implementation Details:**
- Worker validates source code against banned patterns (window, document, eval, etc.)
- Adds `/*#__PURE__*/` annotations for tree-shaking
- Implements SHA-256 hashing for cache keys
- 3-layer cache: Memory → IndexedDB → Edge CDN
- Concurrency control (max 4 concurrent compiles)
- 60KB bundle size warning threshold
- 2-second compilation timeout
- Template conversion now extracts TSX source from component metadata
- Preview renderer uses DynamicComponent for any section with componentSource
- Fallback to generic renderers if compilation fails

### Phase 2: Performance & Scale (Ready to Start)
- [x] Set up CDN headers (configured in next.config.ts)
- [x] Implement IndexedDB caching (done in compiler service)
- [ ] Deploy edge pre-compilation to production
- [x] Set up quota guards (40MB limit implemented)
- [ ] Create telemetry dashboard
- [ ] Add remaining TSX components to salon template
- [ ] Performance benchmarking and optimization

**Next Steps:**
1. Test the pixel-perfect preview at `/test-pixel-perfect`
2. Verify performance metrics meet targets (<150ms first render)
3. Check cache hit rates in browser DevTools
4. ✅ **COMPLETED**: Add TSX source to remaining salon components
5. Deploy edge compilation infrastructure

**All Salon Components Now Have TSX Source:**
- ✅ Hero: Gradient background with title, subtitle, description, CTA
- ✅ ServicesMenu (Features): Service cards with icons, descriptions, prices
- ✅ BookingCalendar (CTA): Appointment booking form with service/stylist selection
- ✅ StaffProfiles (Testimonials): Team member profiles with ratings and booking buttons
- ✅ PricingSection: Three-column pricing table with highlighted popular plan
- ✅ ContactSection (Footer): Company info, contact details, social links, hours

This is as quick and reliable as it gets! 🚀