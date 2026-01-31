# Integrated MVP Implementation Summary

## Overview

This document shows how all the pieces fit together for the MVP "Render-Anything" Live Preview system.

## Component Integration

### 1. Robust Payload Adapter (`robust-payload-adapter.ts`)
Handles all AI inconsistencies discovered from `unpack-template.sh`:
- Multiple file formats (strings vs objects)
- Path field variations (path, file, filename, name)
- Content escaping issues (\\n → newlines, \" → ")
- Missing content entries
- Deduplication between arrays

### 2. Preview Compile Worker (`previewCompileWorker.js`)
- Uses esbuild-wasm for fast compilation
- Treats React as external for speed
- In-memory file system plugin
- Returns compiled bundle or error

### 3. Preview HTML Factory (`preview-html-factory.ts`)
- Injects compiled bundle
- Loads React UMD once
- CSS strategy: inline or Tailwind CDN
- Error boundary built-in

### 4. LivePreview Component
Orchestrates the entire flow:

```typescript
export default function LivePreview({ payload }: { payload: TemplatePayload }) {
  // Step 1: Use robust adapter to normalize chaotic AI output
  const { entry, files, metadata } = adaptPayloadForPreview(payload);
  
  // Step 2: Send to worker for compilation
  worker.postMessage({ entry, files });
  
  // Step 3: On success, generate HTML and render
  const html = makePreviewHTML(compiledCode, payload);
  iframe.srcdoc = html;
  
  // Step 4: On error, show fallback skeleton
  iframe.srcdoc = generateFallbackSkeleton(payload, error);
}
```

## Data Flow

```
AI Template JSON (messy)
        ↓
robust-payload-adapter.ts
  - Normalize formats
  - Find entry point
  - Process escapes
  - Validate files
        ↓
{ entry, files, metadata }
        ↓
previewCompileWorker.js
  - esbuild compilation
  - React externals
  - Fast transforms
        ↓
Compiled Bundle
        ↓
preview-html-factory.ts
  - Inject bundle
  - Add React/CSS
  - Create HTML doc
        ↓
iframe.srcdoc
  - Sandboxed execution
  - Isolated preview
```

## Key Design Decisions

### 1. Why Robust Adapter?
The AI generates inconsistent formats. Rather than forcing the AI to be perfect, we handle whatever it produces:

```javascript
// AI might generate any of these:
{ "templateFiles": ["App.tsx"], "files": [{ "path": "App.tsx", "content": "..." }] }
{ "files": [{ "file": "App.tsx", "content": "..." }] }
{ "files": [{ "filename": "App.tsx", "content": "const App = \"Hello\\nWorld\"" }] }

// Robust adapter normalizes all to:
{ entry: "App.tsx", files: { "/App.tsx": "const App = \"Hello\nWorld\"" } }
```

### 2. Why Worker Compilation?
- Non-blocking UI during compilation
- Isolated from main thread
- Can be terminated if hung
- Enables future parallelization

### 3. Why Iframe + srcdoc?
- True isolation from builder
- No CORS issues
- Instant updates
- Matches production environment

### 4. Why External React?
- 250ms rebuilds vs 2s+ with bundled React
- Smaller bundles
- Shared across previews
- Stable CDN caching

## Success Metrics Tracking

```typescript
// Add to LivePreview component
const trackPerformance = (event: string, duration: number) => {
  performance.mark(`preview-${event}-end`);
  
  // Send to analytics
  analytics.track('preview_performance', {
    event,
    duration_ms: duration,
    template_name: payload.name,
    files_count: Object.keys(files).length,
    has_css: !!files['/src/index.css'],
    entry_strategy: entry.includes('App.tsx') ? 'primary' : 'fallback'
  });
};
```

## Week 0-1 Checklist

- [x] Create robust-payload-adapter.ts
- [ ] Set up previewCompileWorker.js in /public
- [ ] Implement preview-html-factory.ts
- [ ] Create LivePreview component
- [ ] Add fallback skeleton generator
- [ ] Wire into workspace
- [ ] Test with real AI templates
- [ ] Add performance tracking

## Week 2 Enhancements

1. **SHA Cache**: Skip recompiling unchanged files
2. **PostMessage Channel**: Live prop updates without rebuild
3. **Bundle Size Guard**: Auto-fallback for >500KB

## Testing Strategy

Test with actual problematic payloads:

```typescript
// Test 1: Mixed formats
const messyPayload = {
  name: "salon-template",
  templateFiles: ["App.tsx"],  // String reference
  files: [
    { file: "App.tsx", content: "export default () => \"Test\"" },
    { filename: "index.css", content: "body { margin: 0; }" }
  ]
};

// Test 2: Escaped content
const escapedPayload = {
  name: "escaped-test",
  files: [{
    path: "App.tsx",
    content: "const msg = \"Line 1\\nLine 2\"\\nexport default () => <div>{msg}</div>"
  }]
};

// Test 3: No obvious entry
const noEntryPayload = {
  name: "custom-entry",
  files: [{ path: "components/Main.jsx", content: "..." }]
};
```

## Conclusion

This integrated approach combines:
- **Expert's efficient architecture** (Worker + iframe + external React)
- **Your real-world insights** (AI inconsistencies from shell script)
- **Our robust handling** (adapter that normalizes everything)

Result: A preview system that "just works" with whatever the AI generates, renders in <1.5s, and provides clear feedback when things go wrong.

The system is simple enough to implement in a week but robust enough to handle production chaos.