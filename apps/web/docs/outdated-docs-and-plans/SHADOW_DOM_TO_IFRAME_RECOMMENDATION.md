# Shadow DOM to Iframe Migration Recommendation

## Executive Summary
**Recommendation: MODIFY the existing implementation rather than starting from scratch**

The current Shadow DOM implementation is well-architected with clean separation of concerns. Approximately 80% of the code can be reused for the iframe approach, making modification the most efficient path forward.

## Current Implementation Analysis

### Staged Files Overview
- **36 files** modified/added for pixel-perfect preview
- **7 documentation files** detailing the approach
- **5 new services** for compilation and styling
- **4 preview components** implementing the Shadow DOM approach

### Architecture Strengths
1. **Feature-flagged implementation** (`ENABLE_PIXEL_PERFECT_PREVIEW`)
2. **Clean service layer separation**
3. **Robust compilation pipeline with caching**
4. **Well-documented approach and validation**

## Reusability Assessment

### ✅ Highly Reusable (No Changes Needed)
1. **Compilation Pipeline**
   - `component-compiler.worker.ts` - Web Worker for TSX compilation
   - `compiler-service.ts` - Three-layer caching system
   - esbuild-wasm integration and configuration

2. **Style Extraction Services**
   - `tailwind-extractor.ts` - Tailwind class extraction
   - `css-generator.ts` - Pre-purged CSS generation
   - Template metadata structure

3. **API & Data Flow**
   - `/api/compiled/upload` - Compilation result caching
   - `mock-service.ts` modifications for CSS generation
   - Database schema and component source storage

### 🔄 Minor Modifications Needed
1. **Style Injection** (`style-injector.ts`)
   - Change from Shadow DOM root to iframe document
   - Update style mounting strategy

2. **Preview Renderer** (`preview-renderer.tsx`)
   - Update conditional to check for iframe mode
   - Maintain existing fallback logic

### ❌ Complete Replacement Needed
1. **IsolatedPreviewContainer** → **IframePreviewContainer**
   - Replace Shadow DOM with iframe creation
   - Implement iframe communication protocol
   - Handle cross-origin considerations

2. **DynamicComponent mounting**
   - Replace React Portal with iframe postMessage
   - Implement iframe-safe component rendering

## Implementation Strategy

### Phase 1: Create Iframe Infrastructure (1-2 days)

#### Core Components

1. **srcdoc Builder Helper**
```typescript
interface IframeDocOpts {
  css: string;                  // pre-purged template CSS
  fonts?: string[];             // full hrefs
  jsBundleUrl: string;          // compiled template bundle (IIFE exposes window.TemplateRoot)
  initialProps: any;
  nonce: string;                // CSP nonce
}

export function buildPreviewSrcDoc(o: IframeDocOpts): string {
  // Builds complete HTML document with inlined CSS, fonts, and bootstrap script
  // Includes ResizeObserver for auto-height and message listener for prop updates
}
```

2. **IframePreviewContainer Component**
```typescript
export function IframePreview({ css, fonts, jsBundleUrl, props, onError }) {
  // Manages iframe lifecycle with sandbox="allow-scripts allow-pointer-lock"
  // Handles bidirectional postMessage communication
  // Auto-adjusts height based on content
}
```

### Phase 2: Bundle Generation Strategy (0.5 days)

Update esbuild configuration for IIFE format:
```typescript
await esbuild.build({
  stdin: { contents: entrySource, resolveDir: '/', loader: 'tsx' },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'TemplateRoot', // window.TemplateRoot.mount()
  write: false,
  minify: true,
  treeShaking: true
})
```

### Phase 3: Props Layer Architecture (1 day)

Implement minimal props system:
- Store only user overrides, not full duplicates
- Auto-derive defaults from component code
- Maintain code as authority for structure, props for user data

```typescript
interface SectionBinding {
  component: string;          // 'Hero'
  propsOverrides?: Record<string, unknown>; // user-changed only
  defaultHash: string;        // tie to code version
}
```

### Phase 4: Security & Testing (1 day)
- Implement CSP meta tag in srcdoc
- Test sandbox isolation
- Validate style fidelity with salon template
- Performance benchmarking vs Shadow DOM

## Cost-Benefit Analysis

### Starting Fresh
**Pros:**
- Clean slate without Shadow DOM artifacts
- Opportunity to rethink architecture

**Cons:**
- Loss of 3+ weeks of development work
- Re-implementing compilation pipeline
- Re-creating style extraction logic
- Risk of introducing new bugs
- Documentation becomes obsolete

**Time Estimate:** 2-3 weeks

### Modifying Existing
**Pros:**
- Preserve compilation infrastructure
- Keep style extraction services
- Maintain documentation relevance
- Lower risk of regression
- Faster implementation

**Cons:**
- Some Shadow DOM artifacts remain
- Need careful refactoring

**Time Estimate:** 3-5 days

## Recommended Approach

### 1. Keep Current Branch
```bash
# Create a backup tag for Shadow DOM implementation
git tag shadow-dom-implementation-backup

# Continue on current branch
```

### 2. Incremental Migration
```typescript
// Add new feature flag
NEXT_PUBLIC_PREVIEW_MODE=iframe // 'shadow-dom' | 'iframe'

// Implement side-by-side during transition
if (previewMode === 'iframe') {
  return <IframePreviewContainer />
} else {
  return <IsolatedPreviewContainer />
}
```

### 3. Preserve Services
All service layer code remains unchanged:
- Compilation pipeline
- Style extraction
- Caching mechanisms
- API endpoints

### 4. Focus Changes
Only replace the container layer:
- `IsolatedPreviewContainer` → `IframePreviewContainer`
- Update style injection target
- Modify component mounting

## Technical Implementation Details

### Sandbox Configuration
```html
sandbox="allow-scripts allow-pointer-lock"
```
- **No `allow-same-origin`** - iframe doc is opaque to template JS (prevents reading parent cookies)
- **No `allow-forms` or `allow-top-navigation`** - avoid data exfiltration
- **Props transport**: postMessage only

### Performance Optimizations
| Optimization | When | Effect |
|-------------|------|--------|
| Inline CSS in srcdoc | Always | No extra round trip before first paint |
| Use CDN for JS bundle | Always | Parallel load, cached across projects |
| Defer heavy fonts | Templates with large font stacks | Add rel="preload" then swap |
| Batch prop updates | Rapid typing/slider edits | Debounce parent postMessage 50ms |

### Security Hardening
1. **CSP Meta Tag in srcdoc**:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; font-src https: data:; 
               script-src 'self' 'unsafe-inline'; img-src https: data:;">
```

2. **Parent → iframe**:
   - No secrets in srcdoc
   - Sanitize HTML strings through DOMPurify before sending
   - Send prop updates after frame loads

3. **Iframe runtime**:
   - No network fetch allowed
   - Error boundaries for isolation

### Props Layer Benefits
| User Action | Without Props Layer | With Props Layer |
|------------|-------------------|------------------|
| Change headline text | Must parse+rewrite TSX, recompile | Update props.hero.title, re-render |
| Localize into 9 languages | Regenerate 9 code variants | Store per-locale prop bundles |
| Undo one field edit | Diff source text (brittle) | Stack of prop deltas (cheap) |
| AI "rewrite copy" | Whole-file code rewrite | Swap props only |
| Theme switch | CSS surgery or rebuild | Swap theme props/CSS vars |

## Migration Checklist

- [ ] Create `buildPreviewSrcDoc` helper function
- [ ] Create `IframePreview` component with postMessage handling
- [ ] Update esbuild config for IIFE format with `globalName: 'TemplateRoot'`
- [ ] Implement props override system (store only deltas)
- [ ] Add CSP meta tag to srcdoc
- [ ] Implement resize observer for auto-height
- [ ] Add fallback for ad-blocker srcDoc stripping
- [ ] Test with salon template
- [ ] Performance benchmarking vs Shadow DOM
- [ ] Update documentation

## Points for Further Consideration

### 1. Bundle Contract Complexity
The proposal suggests exposing `window.TemplateRoot.mount()` as a global, which could:
- Pollute the global namespace in the iframe
- Make testing more complex
- Consider using a message-based initialization instead

### 2. Props Override System
While the minimal props layer is elegant, consider:
- How to handle schema migrations when component interfaces change
- Whether to use TypeScript code generation for type-safe props
- How to validate props against component expectations

### 3. Fallback Strategy
The suggestion to fallback to Shadow DOM when iframe fails might add complexity:
- Maintaining two rendering paths increases testing burden
- Consider a simpler fallback like a read-only preview
- Or use a served HTML page instead of srcDoc for better compatibility

### 4. Multi-Section Rendering
The proposal suggests one bundle per page template with internal section composition:
- This differs from the current per-section approach
- Consider the trade-offs for section-level editing granularity
- May need to refactor how sections are managed in the builder

## Conclusion

The current implementation represents significant, valuable work that should be preserved. The modular architecture makes it straightforward to swap Shadow DOM for iframe while keeping the complex compilation and styling infrastructure intact. The iframe approach offers superior isolation and security guarantees while maintaining pixel-perfect fidelity.

**Estimated Timeline:**
- Modification approach: 3-5 days
- Starting fresh: 2-3 weeks

**Risk Assessment:**
- Modification: Low risk, proven foundation
- Starting fresh: High risk, unknown challenges

**Recommendation**: Proceed with the iframe implementation using the existing infrastructure, incorporating the security and performance optimizations from the proposal while carefully considering the points raised above.