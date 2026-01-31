# 🎯 Pixel-Perfect Preview Implementation Plan

## Overview
Transform the current props-based preview system to render exact compiled components, ensuring users see precisely what they'll get in production.

---

## 1. Compile AI Components in a Worker

### Step 1.1: esbuild-wasm Worker Setup
- **Implementation**: Dedicated Web Worker with esbuild-wasm
- **Function**: `compile(tsx) → { esm: string, hash }`
- **Target Performance**: ≤ 40ms per unique component

### Step 1.2: Component Caching
- **Storage**: Supabase Storage (or KV store)
- **Strategy**: Cache bundles by hash - identical components compile once
- **Benefit**: Cross-project component reuse

### Step 1.3: Component Transfer
- **Method**: Return `{ Comp: eval(esm).default }` via postMessage
- **Size Target**: ≤ 5kB payload per hash

---

## 2. Design Mode Rendering

```typescript
// design-mode renderer
function SectionView({ Comp, props }: { Comp: FC; props: any }) {
  return <Comp {...props} />
}
```

### Architecture
- Pages as ordered arrays of `{ Comp, props }`
- Tailwind v4 CSS global application
- 1:1 class matching with final build

---

## 3. Live Editing Flow

### Process
1. User edits prop via generated form (propsSchema-powered)
2. Update props JSON in store
3. React re-renders `<Comp {...newProps} />` - no recompile needed
4. Persist delta to Supabase

### Benefits
- Instant visual feedback
- No compilation overhead on edits
- Maintains undo/redo capability

---

## 4. Multi-Page Support

### Data Structure
| Data | Storage Location |
|------|------------------|
| pageId (e.g., "home", "about") | Added to each section record |
| route (e.g., `/`, `/about`) | Stored once per PageState |
| Dynamic templates (`page_type: 'post'`) | Register `/posts/[slug]` at export |

### Preview UI
- Side-rail tabs: `Home · About · Blog`
- Tab switching swaps section array
- Maintains per-page edit history

---

## 5. Safety Guardrails

### Risk Mitigation Matrix

| Risk | Mitigation |
|------|------------|
| **Malicious code** | ESLint rule in worker bans `window`, `document`, `eval`, `fetch`, etc. |
| **Infinite loops** | Worker kill-switch: terminate if compile + render > 2s |
| **XSS in props** | Validate & DOMPurify any `type: "string", rich: true` fields |
| **Bundle bloat** | Warn if `esm.length > 100kB`; show designer toast |

---

## 6. Performance Instrumentation

```javascript
performance.mark('compile-start')
// …worker compile…
performance.mark('compile-end')
performance.measure('compile', 'compile-start', 'compile-end')
```

### Monitoring
- Log duration to PostHog
- Alert if p95 > 150ms
- Track cache hit rates
- Monitor bundle sizes

---

## 7. Rollout Checklist

### Phase 1: Infrastructure
- [ ] Worker compile pipeline behind `NEXT_PUBLIC_COMPILED_PREVIEW=true`
- [ ] Storage bucket setup with cache headers (`public, max-age=1 week`)
- [ ] Fallback to generic renderer on compile error

### Phase 2: Quality Assurance
- [ ] Compare preview vs. production build on three templates:
  - Salon booking app
  - SaaS dashboard
  - Blog platform
- [ ] Performance benchmarks meet targets
- [ ] Security audit of worker sandbox

### Phase 3: Documentation
- [ ] Update docs: "Templates must export one default React component per file"
- [ ] Migration guide for existing templates
- [ ] Component authoring guidelines

---

## Expected Outcome

Users see an **exact replica** of the shipped app within the builder:
- ✅ Pixel-perfect preview matching production
- ✅ Instant prop edits without recompilation
- ✅ Schema-driven safety and validation
- ✅ Analytics and extensibility preserved

---

## Technical Advantages

1. **True WYSIWYG**: No discrepancy between preview and production
2. **Performance**: Component compilation cached and shared
3. **Security**: Sandboxed execution with strict guardrails
4. **Scalability**: Worker-based architecture handles load
5. **Developer Experience**: Direct TSX → preview pipeline

---

## Migration Path

### From Current System
```typescript
// Current: Props-based generic renderers
<HeroRenderer section={section} />

// New: Compiled component renderers
<SectionView Comp={CompiledHeroComponent} props={section.props} />
```

### Backward Compatibility
- Feature flag controls system selection
- Gradual migration of existing projects
- Fallback ensures no breaking changes