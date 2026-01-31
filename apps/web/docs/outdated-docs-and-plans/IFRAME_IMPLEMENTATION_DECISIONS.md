# Iframe Implementation - Technical Decisions

## ✅ Recommended Approach for Each Decision

### 1. Bundle Bootstrap Contract: **Message-Based** ✓

**Go with the message-based approach** rather than global `window.TemplateRoot`:

```javascript
// In bundle
window.__sheenappsPreviewReady = (api) => {
  // Store API for later use
  const { containerId, props } = api;
  createRoot(document.getElementById(containerId)).render(<App {...props} />);
};

// Signal readiness
window.parent.postMessage({ type: 'template-ready' }, '*');

// Parent responds
{ type: 'init', containerId: 'root', props: {...} }
```

**Why this is better:**
- No global namespace pollution
- Supports multiple previews (future-proof)
- Easier versioning and API evolution
- More testable

### 2. Props Override Storage: **Per-Section Delta Map** ✓

The recommended approach is perfect:

```typescript
interface SectionOverrides {
  [sectionId: string]: {
    overrides: Record<string, any>;  // Only changed values
    defaultHash: string;             // Track schema version
  }
}
```

**Benefits confirmed:**
- Minimal storage footprint
- Easy undo/redo implementation
- Natural i18n support (locale-specific overrides)
- Clean analytics data

### 3. Granularity: **Page Bundle (Phase 1)** ✓

Start with page-level bundles:

```typescript
// Single bundle exports all sections
export function App({ sections }) {
  return (
    <>
      <div data-section="hero">
        <Hero {...sections.hero} />
      </div>
      <div data-section="features">
        <Features {...sections.features} />
      </div>
    </>
  );
}
```

**Advantages:**
- Simpler CSS management (one purge pass)
- Consistent layout/spacing
- Single React root (better performance)
- Section anchors enable targeted editing

## Implementation Defaults

| Setting | Value | Rationale |
|---------|-------|-----------|
| iframe sandbox | `"allow-scripts allow-pointer-lock"` | Maximum security, no same-origin |
| CSP in srcdoc | `default-src 'none'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src https: data:; img-src https: data:` | Tight security perimeter |
| Prop update debounce | 50ms | Smooth typing, prevents message spam |
| Max bundle warn | 60KB | Early warning for performance |
| Resize throttle | `requestAnimationFrame` | Native browser optimization |

## Day 0 Merge Checklist

- [ ] Environment variable: `NEXT_PUBLIC_PREVIEW_MODE=iframe`
- [ ] `IframePreview` component rendering salon template
- [ ] Pre-purged CSS injection working
- [ ] Props round-trip: edit title → iframe updates
- [ ] Message flow: error + height events
- [ ] Fallback to generic renderer on iframe failure

## Risk Assessment

### ✅ Mitigated Risks
- **Multi-section latency**: 50ms debounce handles rapid edits
- **Security**: Sandbox + CSP provides defense in depth
- **Implementation time**: 3-5 days realistic with existing infrastructure

### ⚠️ Watch For
- **Ad blockers**: Some strip srcDoc - need fallback strategy
- **Browser compatibility**: Test Safari/Firefox iframe behavior
- **Memory leaks**: Proper cleanup on iframe unmount

## Next Steps

1. **Implement message-based bootstrap** (recommended approach)
2. **Create `IframePreview` component** with all security defaults
3. **Wire up props delta system** in builder store
4. **Test with salon template** end-to-end

## Architecture Decision Record

**Decision**: Message-based bootstrap over global namespace
**Date**: January 2025
**Status**: Approved
**Consequences**: 
- More complex initial handshake
- Better long-term maintainability
- Enables future multi-preview scenarios