# 🎯 Pixel-Perfect Preview: Revised Implementation Plan

## Context: Template Files Already Exist!

### 🔎 What You Already Have
- **Templates contain full TSX files** – no extra generation work required
- **Worker infrastructure is in place** – it already compiles code for the generic-renderer path
- **Shell script cleanly unpacks** any file that appears in `templateFiles[]`

The issue: **Live preview uses generic renderers instead of the actual template components**

### ⚖️ Why This Revised Plan Wins

| Criterion | Lean Plan (Original) | Revised Plan ⭐ | Notes |
|-----------|---------------------|-----------------|-------|
| **Code to write** | Needs new "tsx" field, hash logic, worker, cache | Only adds "source" extraction & one React wrapper | 40-50% fewer LoC |
| **Template change** | AI must emit TSX separately | Just re-using files it already produces | No prompt re-training |
| **Security surface** | Same (eval after compile) | Same – but simpler entry path to static analysis | Equal |
| **Migration effort** | Moderate (augment generator & storage) | Tiny (1-2 small patches) | Faster |
| **Risk** | More moving parts early | Minimal; you still have fallback renderers | Lower |

---

## 📌 Recommended Roadmap

| Phase | Goal | Concrete Tasks | Effort |
|-------|------|----------------|--------|
| **0** (½ day) | Quick proof | • Hard-code one section to pass source into the worker → render compiled component in preview | Low |
| **1** (1 sprint) | Minimal viable pixel-perfect preview | 1. Template generation – copy each `templateFiles[].content` into `components[{name}].source`<br>2. Builder store – add `componentSource?: string` to `SectionState`<br>3. `DynamicComponent` wrapper – compile + eval bundle; show spinner + error boundary<br>4. Fallback – if compile fails, call existing generic renderer<br>5. Shell script tweak – detect `*.compiled.js` (base64 decode) → done once you move to cached bundles | Medium |
| **2** (2-3 days) | Performance & safety | • Cache by SHA in Supabase Storage / KV<br>• Worker kill-switch (2s)<br>• ESLint rule banning `window`, `document`, `eval`, `fetch` | Medium |
| **3** (later) | Scale & polish | • Pre-compile most-used components during template generation<br>• Multi-page preview tabs (`PageState` group)<br>• CDN for compiled bundles<br>• Telemetry (compile time, cache hit) | High but optional |

---

## 👉 Immediate Next Steps

### 1. Template Patch
```typescript
// After the AI finishes generating templateFiles[]
template.metadata.components[name].source = 
  template.templateFiles.find(f => f.path === `src/components/${name}.tsx`)?.content
```

### 2. DynamicComponent.tsx (Just the Essentials)
```typescript
import { useState, useEffect, ComponentType } from 'react'
import { compileInWorker } from '@/workers/compiler' // thin wrapper

export default function DynamicComponent({ source, props }) {
  const [Comp, setComp] = useState<ComponentType | null>(null)

  useEffect(() => { 
    compileInWorker(source).then(setComp) 
  }, [source])

  if (!Comp) return <div className="animate-pulse">Loading…</div>
  return <Comp {...props} />
}
```

### 3. Preview Swap
```typescript
return section.componentSource
  ? <DynamicComponent source={section.componentSource} props={section.props} />
  : <GenericRenderer section={section} />
```

### 4. Benchmark
Target: **≤ 50ms first render** with the Salon template

---

## Technical Implementation Details

### Phase 0: Quick Proof (½ Day)

Hard-code the salon Hero component to validate the approach:

```typescript
// src/components/builder/preview/preview-renderer.tsx
// Temporary hard-coded proof
const SALON_HERO_SOURCE = `
export default function Hero({ title, subtitle, description, ctaText }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-rose-50 to-purple-50">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-pink-600/10 mix-blend-multiply" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            {title}
          </h1>
          <p className="mt-4 text-2xl text-purple-800 font-light">{subtitle}</p>
          <p className="mt-6 text-lg text-gray-600">{description}</p>
          <button className="mt-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-4 text-lg font-semibold text-white">
            {ctaText}
          </button>
        </div>
      </div>
    </section>
  )
}`

// In getSectionRenderer, for hero type:
if (section.type === 'hero') {
  return <DynamicComponent source={SALON_HERO_SOURCE} props={section.content.props} />
}
```

### Phase 1: Core Implementation

#### 1. Enhance Builder Store
```typescript
// src/store/builder-store.ts
export interface SectionState {
  // ... existing fields
  componentSource?: string // TSX source code
  componentPath?: string   // Original file path
}
```

#### 2. Worker Compiler Service
```typescript
// src/services/preview/compiler-service.ts
class CompilerService {
  private worker: Worker | null = null
  private cache = new Map<string, ComponentType>()
  
  async compileComponent(source: string): Promise<ComponentType> {
    // Check cache
    const hash = await this.hash(source)
    if (this.cache.has(hash)) {
      return this.cache.get(hash)!
    }
    
    // Compile via worker
    const compiled = await this.compileInWorker(source)
    const Component = this.evaluateComponent(compiled)
    
    this.cache.set(hash, Component)
    return Component
  }
  
  private async hash(source: string): Promise<string> {
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

#### 3. Dynamic Component Wrapper
```typescript
// src/components/builder/preview/dynamic-component.tsx
import { useState, useEffect, ComponentType } from 'react'
import { compilerService } from '@/services/preview/compiler-service'

interface DynamicComponentProps {
  source: string
  props: Record<string, any>
}

export function DynamicComponent({ source, props }: DynamicComponentProps) {
  const [Component, setComponent] = useState<ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    let cancelled = false
    
    async function loadComponent() {
      try {
        setIsLoading(true)
        setError(null)
        
        const CompiledComponent = await compilerService.compileComponent(source)
        
        if (!cancelled) {
          setComponent(() => CompiledComponent)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          console.error('Component compilation failed:', err)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }
    
    loadComponent()
    
    return () => { cancelled = true }
  }, [source])
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-gray-500">Loading component...</div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4 m-4">
        <p className="text-red-800">Component Error: {error}</p>
      </div>
    )
  }
  
  if (!Component) return null
  
  return <Component {...props} />
}
```

### Phase 2: Performance & Security

#### Security Constraints
```typescript
// src/workers/component-compiler.worker.ts
const BANNED_APIS = [
  'fetch', 'XMLHttpRequest', 'WebSocket',
  'localStorage', 'sessionStorage', 
  'document', 'window',
  'eval', 'Function'
]

function validateSource(source: string): void {
  for (const api of BANNED_APIS) {
    if (source.includes(api)) {
      throw new Error(`Banned API usage: ${api}`)
    }
  }
}
```

#### Performance Monitoring
```typescript
// Add to compiler service
performance.mark('compile-start')
const result = await this.compile(source)
performance.mark('compile-end')
performance.measure('component-compile', 'compile-start', 'compile-end')

const duration = performance.getEntriesByName('component-compile')[0].duration
if (duration > 50) {
  console.warn(`Slow compilation: ${duration}ms`)
}
```

---

## Metrics for Success

1. **Preview matches built output**: 100% pixel accuracy
2. **Compilation time**: < 50ms per component
3. **Memory usage**: < 10MB per session
4. **Security**: Zero XSS vulnerabilities
5. **User satisfaction**: "What I see is what I get!"

---

## Verdict

**Adopt the Revised Plan now**, keep the Lean Plan's hashing + CDN ideas for Phase 2 performance optimization.

### Why This Wins
- **Smallest code delta**: ~200 lines vs ~1000 lines
- **Fastest path to production**: 1 sprint vs 3-4 sprints
- **Lower risk**: Fallback to generic renderers if compile fails
- **No template changes**: Works with existing generated files

### Success Criteria for Phase 0
✅ Salon Hero renders pixel-perfect in preview  
✅ Compilation takes < 50ms  
✅ Props changes update instantly  
✅ Fallback works if compilation fails