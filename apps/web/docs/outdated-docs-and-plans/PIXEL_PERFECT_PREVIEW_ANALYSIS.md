# 📊 Pixel-Perfect Preview Plan Analysis

## Current Architecture vs. Proposed System

### 🔍 Gap Analysis

#### Current System
```typescript
// Current flow: Template → Props → Generic Renderers
templateData.components.Hero.propsSchema → HeroRenderer → Generic styled output
```

**Issues:**
- ❌ Generic renderers can't match custom designs
- ❌ Style information lost in translation
- ❌ No way to render custom JSX/TSX from templates
- ❌ Limited to predefined section types

#### Proposed System
```typescript
// New flow: Template → Compiled Component → Exact Render
templateData.components.Hero.tsx → Worker compile → <CompiledHero {...props} />
```

**Benefits:**
- ✅ Exact pixel-perfect rendering
- ✅ Preserves all custom styling
- ✅ Supports unlimited component types
- ✅ True WYSIWYG experience

---

## 🏗️ Implementation Requirements

### 1. **New Infrastructure Needed**

#### a) Template Structure Change
```typescript
// Current template format
{
  "components": {
    "Hero": {
      "propsSchema": { title, subtitle }
    }
  }
}

// Required format
{
  "components": {
    "Hero": {
      "propsSchema": { title, subtitle },
      "tsx": "export default function Hero({title}) { return <div>...</div> }",
      "hash": "abc123" // For caching
    }
  }
}
```

#### b) Worker Infrastructure
- **File needed**: `/src/workers/component-compiler.worker.ts`
- **Dependencies**: `esbuild-wasm` (~6.5MB - needs optimization)
- **Integration**: Existing `template-renderer.worker.ts` could be extended

#### c) Component Cache
- **Storage**: Supabase Storage bucket or Redis/KV
- **Key structure**: `compiled/{hash}.js`
- **Headers**: `Cache-Control: public, max-age=604800`

### 2. **Required Code Changes**

#### a) Preview Renderer Modifications
```typescript
// src/components/builder/preview/preview-renderer.tsx
// FROM:
const getSectionRenderer = (section) => {
  switch(section.type) {
    case 'hero': return <HeroRenderer section={section} />
  }
}

// TO:
const getSectionRenderer = async (section) => {
  const CompiledComponent = await loadCompiledComponent(section.componentHash)
  return <CompiledComponent {...section.props} />
}
```

#### b) Builder Store Updates
```typescript
// src/store/builder-store.ts
// Add to SectionState:
interface SectionState {
  // existing...
  componentHash?: string
  componentTsx?: string
  compiledUrl?: string
}
```

#### c) Template Service Enhancement
```typescript
// src/services/ai/orchestrator.ts
// Enhance to include TSX generation:
async generateProjectFromSpec(spec) {
  // Generate both props AND component TSX
  return {
    components: {
      Hero: {
        propsSchema: {...},
        tsx: generateComponentTSX(spec, 'Hero'),
        hash: hashComponent(tsx)
      }
    }
  }
}
```

---

## 🚦 Risk Assessment

### Technical Risks

| Risk | Severity | Mitigation | Current State |
|------|----------|------------|---------------|
| **Bundle size** | High | Lazy load esbuild-wasm | ❌ Not implemented |
| **XSS attacks** | Critical | Sandbox + CSP | ⚠️ Basic CSP exists |
| **Performance** | Medium | Worker + caching | ✅ Worker infra exists |
| **Browser compat** | Low | Polyfills | ✅ Modern browsers only |

### Security Considerations

1. **Code Execution**
   - Current: No dynamic code execution
   - Proposed: `eval()` of compiled components
   - Mitigation: Strict CSP, sandboxed iframe option

2. **User Input**
   - Current: Props validated by schema
   - Proposed: Same + component code validation
   - Mitigation: AST validation before compile

---

## 📈 Performance Impact

### Benchmarks Needed

```typescript
// Measure compilation time
const start = performance.now()
const compiled = await compileComponent(tsx)
const duration = performance.now() - start

// Target metrics:
// - First compile: < 40ms
// - Cached load: < 5ms
// - Bundle size: < 5KB per component
```

### Current Performance Baseline
- Preview render: ~10ms (props-based)
- Section switch: ~5ms
- Edit update: ~2ms

### Expected Performance
- First preview: ~45ms (compile + render)
- Cached preview: ~7ms (load + render)
- Edit update: ~2ms (unchanged)

---

## 🔄 Migration Strategy

### Phase 1: Parallel Systems (Week 1-2)
1. Add `ENABLE_COMPILED_PREVIEW` flag
2. Implement worker compilation
3. Test with single component type

### Phase 2: Template Enhancement (Week 3-4)
1. Update mock templates to include TSX
2. Enhance AI services to generate TSX
3. Build component library

### Phase 3: Rollout (Week 5-6)
1. Enable for new projects
2. Provide migration tool for existing
3. Deprecate props-based system

---

## ✅ Recommendations

### Immediate Actions
1. **Prototype the worker compiler** with existing salon template
2. **Benchmark esbuild-wasm** performance and size
3. **Design component sandboxing** strategy

### Architecture Decisions Needed
1. **Storage strategy**: Supabase vs CDN vs KV?
2. **Component format**: Full TSX vs simplified DSL?
3. **Security model**: iframe vs CSP vs both?

### Alternative Approaches
1. **Server-side compilation**: More secure but slower
2. **Pre-compiled library**: Faster but less flexible
3. **Hybrid approach**: Common components pre-compiled, custom ones on-demand

---

## 🎯 Success Metrics

1. **Preview Accuracy**: 100% pixel match with production
2. **Compilation Speed**: p95 < 50ms
3. **Cache Hit Rate**: > 90% after warmup
4. **Security Incidents**: 0 XSS vulnerabilities
5. **User Satisfaction**: > 4.5/5 on preview accuracy

---

## 📝 Next Steps

1. [ ] Create POC with salon template
2. [ ] Benchmark compilation performance
3. [ ] Design security sandbox
4. [ ] Update template structure
5. [ ] Build worker infrastructure
6. [ ] Implement caching layer
7. [ ] Create fallback system
8. [ ] Write security tests
9. [ ] Document component format
10. [ ] Plan phased rollout