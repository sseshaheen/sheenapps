# Iframe Implementation - Final Cleanup Tasks

## 🔧 Immediate Fixes Before Merge

### 1. Merge Duplicate Message Listeners in SrcDoc

**Issue**: Two separate message listeners can cause GC leaks and double processing.

**Fix**: Update srcdoc-builder.ts to use a single message handler:

```javascript
// In srcdoc template - REPLACE both message listeners with:
window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  
  switch (e.data.type) {
    case 'init':
      if (window.__sheenappsPreviewReady) {
        window.__sheenappsPreviewReady(e.data);
      }
      break;
      
    case 'update-props':
      if (window.__sheenappsRender) {
        window.__sheenappsRender(e.data.props);
      }
      break;
      
    case 'teardown':
      if (window.__sheenappsRoot) {
        window.__sheenappsRoot.unmount?.();
        window.__sheenappsRoot = null;
        window.__sheenappsRender = null;
      }
      break;
  }
});
```

### 2. Configure DOMPurify for Rich Content

**Issue**: Default DOMPurify strips useful formatting tags like `<strong>`, `<em>`.

**Fix**: Update sanitization function:

```typescript
// In iframe-preview-container.tsx
import DOMPurify from 'dompurify';

// Configure DOMPurify for rich text
const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: [
    'b', 'i', 'em', 'strong', 'a', 'br', 'p', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre'
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
  ALLOW_DATA_ATTR: false
};

function sanitizeForPreview(obj: any): any {
  if (typeof obj === 'string') {
    // Check if it's likely rich content
    if (obj.includes('<') && obj.includes('>')) {
      return DOMPurify.sanitize(obj, RICH_TEXT_CONFIG);
    }
    // Plain text - just escape
    return DOMPurify.sanitize(obj);
  }
  // ... rest of function
}
```

### 3. Add TypeScript Global Declarations

**File**: Create `src/types/preview-globals.d.ts`

```typescript
declare global {
  interface Window {
    __sheenappsPreviewReady?: (api: {
      containerId: string;
      props: any;
    }) => void;
    __sheenappsRender?: (props: any) => void;
    __sheenappsRoot?: {
      unmount?: () => void;
    };
  }
}

export {};
```

### 4. Bundle Entry Safety

**Issue**: Multiple components might duplicate the bootstrap code.

**Fix**: In component-compiler.worker.ts, add guard:

```typescript
// Wrap BUNDLE_ENTRY_TEMPLATE with guard
const GUARDED_ENTRY = `
if (!window.__sheenappsPreviewReady) {
  ${BUNDLE_ENTRY_TEMPLATE}
}
`;

// Use GUARDED_ENTRY when building
const entrySource = GUARDED_ENTRY + '\n' + componentsSources.join('\n');
```

### 5. Large Props Warning

**Add to iframe-preview-container.tsx**:

```typescript
// After sanitizing props
const propsSize = JSON.stringify(safeProps).length;
if (propsSize > 50_000) {
  console.warn(`[Preview] Large props payload: ${(propsSize / 1024).toFixed(1)}KB. Consider implementing incremental updates.`);
  
  // Log to analytics if available
  if (window.analytics) {
    window.analytics.track('preview.large_props', {
      size: propsSize,
      sectionId: props.sectionId
    });
  }
}
```

### 6. Cross-Origin Font Support

**Update srcdoc-builder.ts**:

```typescript
const fontLinks = fonts
  .map(href => {
    // Add crossorigin for Google Fonts and other CDNs
    const needsCrossOrigin = href.includes('fonts.googleapis.com') || 
                           href.includes('fonts.gstatic.com') ||
                           href.includes('use.typekit.net');
    
    return needsCrossOrigin
      ? `<link rel="stylesheet" href="${href}" crossorigin="anonymous">`
      : `<link rel="stylesheet" href="${href}">`;
  })
  .join('\n');
```

## 📋 Quick Test Plan (1 Hour)

### Test 1: Salon Template Render (10 min)
```bash
# 1. Enable iframe mode
NEXT_PUBLIC_PREVIEW_MODE=iframe

# 2. Load salon template
# 3. Verify pixel-perfect rendering
# 4. Check console for errors
```

### Test 2: Props Update (10 min)
- Edit hero title in builder
- Verify < 100ms update latency
- Check network tab for debounced messages
- Confirm sanitization working (try adding `<script>`)

### Test 3: Error Boundary (10 min)
```typescript
// Temporarily add to a component:
if (props.triggerError) {
  throw new Error('Test error boundary');
}
```
- Verify error message in parent console
- Confirm preview shows error UI
- Check error contains stack trace

### Test 4: Missing CSS (10 min)
- Pass empty string for CSS
- Verify preview still renders
- Check that component structure is intact

### Test 5: Debounce Stress Test (10 min)
- Type rapidly in text field
- Monitor network tab
- Verify ~20 messages/sec max
- Check for memory leaks in Performance tab

### Test 6: Teardown (10 min)
- Switch between templates rapidly
- Monitor memory usage
- Verify no console errors
- Check that previous previews are cleaned up

## 🎯 Definition of Done

- [ ] All message listeners merged
- [ ] DOMPurify configured for rich text
- [ ] TypeScript globals added
- [ ] Bundle entry has duplicate guard
- [ ] Large props warning implemented
- [ ] Cross-origin fonts handled
- [ ] All 6 tests pass
- [ ] No memory leaks detected
- [ ] Performance metrics documented

## 🚀 Post-Launch Tickets

1. **Incremental Props Updates** (P1)
   - Implement JSON patches for > 50KB payloads
   - Use `fast-json-patch` or similar

2. **LLM-Enhanced Auto-Binding** (P2)
   - Integrate GPT-4 for semantic prop analysis
   - Improve confidence scores

3. **Visual Regression Testing** (P2)
   - Puppeteer screenshots of preview vs production
   - Automated on PR

4. **Performance Dashboard** (P3)
   - Track preview render times
   - Monitor props payload sizes
   - Alert on degradation

---

**With these fixes, the iframe implementation is production-ready.**