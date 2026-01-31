# Pixel-Perfect Preview Implementation Plan

## Overview
This document outlines the plan to implement a true pixel-perfect preview system that renders components exactly as they appear in the built application, using the actual TSX source code stored in the database.

## Key Architecture Decisions (Based on Expert Feedback)

1. **Pre-purged CSS**: Generate and store pre-purged Tailwind CSS during template creation instead of parsing configs in browser
2. **Keep esbuild**: Use `bundle: true` and `platform: "browser"` to fix module resolution instead of switching compilers
3. **Bundle dependencies**: Include React and other imports in the bundle to eliminate custom module resolution
4. **SES for security**: Use Agoric SES Compartments for secure evaluation instead of custom sandboxing
5. **Smart caching**: Use hash + templateVersion as cache key to prevent stale previews

## Current State Analysis

### What's Working
- ✅ TSX source code is generated and stored in database `config.templateData.metadata.components[ComponentName].tsx`
- ✅ Data flows correctly from DB → Workspace → Preview
- ✅ Feature flag `ENABLE_PIXEL_PERFECT_PREVIEW` controls the system
- ✅ Component source is preserved through the data pipeline

### Current Issues
- ❌ Dynamic TSX compilation bypassed due to esbuild module resolution issues
- ❌ Pre-compiled components use different styling than database TSX
- ❌ Preview inherits SheenApps global styles instead of template styles
- ❌ Missing template-specific fonts and CSS variables
- ❌ Different Tailwind CSS versions between preview and built app

## Implementation Progress

### Completed
- ✅ **IsolatedPreviewContainer** - Shadow DOM container with style isolation
- ✅ **StyleInjectorService** - Template style extraction and injection
- ✅ **PixelPerfectRenderer** - Component that ties isolation and rendering together
- ✅ **Data Flow Integration** - Connected projectData from workspace to preview
- ✅ **Phase 1.2 - Pre-purged CSS Generation** - Updated template generation to emit pre-purged CSS
  - Created TailwindExtractor service to extract classes from TSX
  - Created CSSGenerator service to generate pre-purged CSS
  - Modified mock-service to generate CSS during template creation
  - Added styles property to template metadata structure
- ✅ **Phase 2.1 - Fixed esbuild Configuration** - Updated compiler to use bundle:true approach
  - Modified component-compiler.worker.ts to use esbuild.build instead of transform
  - Created reactPlugin to handle React and clsx imports
  - Removed restrictive security patterns to allow necessary browser APIs
  - Bundle includes all dependencies, eliminating module resolution issues
  - Both single and batch compilation now use consistent bundling approach

### In Progress
- 🔄 Phase 2.3 - Integrate SES for secure evaluation

### Todo
- ⏳ Phase 3 - Complete rendering pipeline
- ⏳ Phase 4 - Performance optimizations
- ⏳ Phase 5 - Testing and validation

## Implementation Plan

### Phase 1: Style Isolation & Environment Setup

#### 1.1 Create Isolated Preview Container ✅
```typescript
// src/components/builder/preview/isolated-preview-container.tsx
- ✅ Created Shadow DOM container for style isolation
- ✅ Supports style and font injection via props
- ✅ Uses React Portal for rendering children in Shadow DOM
- ✅ Clean CSS environment achieved
```

#### 1.2 Template Style Extraction ✅
```typescript
// src/services/preview/tailwind-extractor.ts & css-generator.ts
- ✅ Created TailwindExtractor to extract classes from TSX source
- ✅ Created CSSGenerator to generate pre-purged CSS with only used utilities
- ✅ Modified mock-service to generate CSS during template creation
- ✅ CSS stored in metadata.styles.css alongside TSX source
- ✅ Font information stored in metadata.styles.fonts
- ✅ No browser-side Tailwind parsing needed
```

**Benefits:**
- Faster preview (no JIT compilation in browser)
- Eliminates Tailwind config/version mismatches
- Consistent styling between preview and built app

#### 1.3 Dynamic Style Injection ✅
```typescript
// src/services/preview/style-injector.ts
- ✅ Created style injector service
- ✅ Extracts template styles from project data
- ✅ Parses and injects font links
- ✅ Combines base reset with template CSS
- ✅ Metrics logging for debugging
```

### Phase 2: Fix TSX Compilation

#### 2.1 Fix esbuild Configuration ✅
```typescript
// src/workers/component-compiler.worker.ts
- ✅ Kept esbuild-wasm (already integrated and fastest)
- ✅ Enabled bundle: true and platform: "browser"
- ✅ Created reactPlugin to resolve React imports to global window.React
- ✅ Bundle includes all dependencies (no external packages)
- ✅ Module resolution issues eliminated
- ✅ Security patterns updated to allow necessary browser APIs
```

**esbuild Configuration:**
```typescript
const result = await esbuild.build({
  stdin: {
    contents: source,
    loader: 'tsx'
  },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'Component',
  external: [], // Bundle everything, no externals
})
```

**Fallback Options (only if esbuild has blockers):**
- SWC or Sucrase as alternatives
- But first prove that bundling doesn't solve the issue

#### 2.2 Simplified Module Resolution
```typescript
// No custom resolver needed!
- With bundle: true, esbuild includes all dependencies
- React, clsx, and other imports are automatically resolved
- CSS imports handled by esbuild's built-in loader
- Simpler code surface = fewer security vulnerabilities
```

#### 2.3 Secure Component Evaluation
```typescript
// src/services/preview/component-evaluator.ts
- Use Agoric SES (Secure EcmaScript) Compartment for evaluation
- Provides tamper-proof globals with <2KB polyfill
- No need to reinvent security sandboxing
- Prevents prototype pollution and other attacks
```

**Implementation:**
```typescript
import { lockdown, createCompartment } from 'ses';

// One-time setup
lockdown();

// Per component
const compartment = createCompartment({
  React: window.React,
  // other safe globals
});

const Component = compartment.evaluate(bundledCode);
```

### Phase 3: Component Rendering Pipeline

#### 3.1 Unified Rendering Flow
```typescript
// src/components/builder/preview/pixel-perfect-renderer.tsx
1. Fetch component TSX from section.componentSource
2. Extract template styles from project metadata
3. Create isolated container
4. Inject styles and fonts
5. Compile TSX to JavaScript
6. Evaluate in sandboxed context
7. Render with correct props
```

#### 3.2 Props Mapping
```typescript
// src/services/preview/props-mapper.ts
- Map section.content.props to component props
- Handle default values from propsSchema
- Validate prop types
- Ensure consistency with built app
```

#### 3.3 Error Handling
```typescript
// src/services/preview/error-handler.ts
- Graceful fallback to generic renderers
- Detailed error logging for debugging
- User-friendly error messages
- Compilation error diagnostics
```

### Phase 4: Performance Optimization

#### 4.1 Compilation Caching
```typescript
// src/services/preview/compilation-cache.ts
- Cache key: hash + templateVersion (not just component name)
- Use IndexedDB for persistence
- Automatic invalidation when template version changes
- Prevents stale bundles when designers tweak TSX
```

**Cache Key Strategy:**
```typescript
const cacheKey = `${componentHash}_${templateVersion}`;
// This ensures updates are reflected even if component name stays same
```

#### 4.2 Lazy Loading
```typescript
// src/services/preview/lazy-loader.ts
- Load compiler on demand
- Progressive enhancement
- Prioritize visible sections
- Background compilation queue
```

#### 4.3 Resource Management
```typescript
// src/services/preview/resource-manager.ts
- Cleanup compiled components
- Memory usage monitoring
- Font loading optimization
- Style deduplication
```

### Phase 5: Testing & Validation

#### 5.1 Visual Regression Testing
- Capture screenshots of built app components
- Compare with preview renders
- Automated pixel diff testing
- CI/CD integration

#### 5.2 Cross-Browser Testing
- Test compilation in different browsers
- Ensure consistent rendering
- Mobile device testing
- Performance benchmarks

#### 5.3 Edge Cases
- Large components
- Complex styling
- Dynamic imports
- Third-party dependencies

## Technical Architecture

### Updated Data Structure
```typescript
// In database config.templateData
{
  "metadata": {
    "version": "1.0.0", // Template version for cache invalidation
    "styles": {
      "css": "/* Pre-purged Tailwind CSS */", // Generated during template creation
      "fonts": ["<link href='...' />"] // Font imports
    },
    "components": {
      "Hero": {
        "propsSchema": { /* ... */ },
        "tsx": "export default function Hero() { ... }",
        "hash": "abc123" // Component source hash
      }
    }
  }
}
```

### Component Compilation Flow
```
TSX Source + Pre-purged CSS (DB) 
    ↓
Container Creation (Shadow DOM)
    ↓
Style + Font Injection
    ↓
esbuild Bundle (with deps)
    ↓
SES Compartment Evaluation
    ↓
React Rendering
    ↓
Pixel-Perfect Preview
```

### Key Services
1. **CompilerService**: Handles TSX to JS transformation
2. **StyleService**: Manages style extraction and injection
3. **IsolationService**: Creates sandboxed containers
4. **EvaluationService**: Safely evaluates compiled code
5. **CacheService**: Manages compilation cache

## Migration Strategy

### Step 1: Parallel Implementation
- Keep current pre-compiled approach as fallback
- Implement new system behind feature flag
- Test with select components first

### Step 2: Gradual Rollout
- Enable for Hero component only
- Monitor performance and errors
- Expand to other components
- Gather user feedback

### Step 3: Full Migration
- Remove pre-compiled components
- Switch to database TSX only
- Deprecate old system
- Update documentation

## Success Metrics
- **Visual Fidelity**: 100% match with built app
- **Compilation Success Rate**: >95%
- **Performance**: <500ms compilation time
- **Cache Hit Rate**: >80% after warm-up
- **Error Rate**: <1% compilation failures

## Risk Mitigation
1. **Security**: Sandboxed evaluation, no eval()
2. **Performance**: Aggressive caching, lazy loading
3. **Compatibility**: Multiple compiler options
4. **Reliability**: Graceful fallbacks

## Timeline Estimate
- Phase 1: 3-4 days (Style isolation)
- Phase 2: 5-7 days (Compiler replacement)
- Phase 3: 3-4 days (Rendering pipeline)
- Phase 4: 2-3 days (Optimization)
- Phase 5: 3-4 days (Testing)

**Total: 3-4 weeks** for full implementation

## Next Steps
1. Evaluate compiler options (SWC vs Sucrase vs TypeScript API)
2. Prototype style isolation approach
3. Create proof-of-concept with Hero component
4. Benchmark performance requirements
5. Review security implications with team