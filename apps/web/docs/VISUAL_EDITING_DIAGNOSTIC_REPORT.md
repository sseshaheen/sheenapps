# Visual Editing Implementation - Diagnostic Report v2.0
*Updated Assessment with Cross-Origin Solution & Worker Integration*
*Last Updated: October 2025*

## Executive Summary

After deep technical analysis and research into modern visual editing implementations (Lovable, Vercel V0), we've identified a **viable cross-origin approach** that works with our current architecture. The original plan's assumption of same-origin preview is **architecturally incompatible** with our worker service model, but a postMessage-based solution provides a **better, more secure** path forward.

## Critical Architectural Discovery

### ❌ Original Assumption: Same-Origin Preview
**Plan Expected**: Next.js rewrite proxy to serve preview under builder domain
```javascript
// Assumed approach (doesn't work with our architecture)
module.exports = {
  async rewrites() {
    return [{ source: "/preview/:id", destination: "http://worker-preview" }]
  }
}
```

**Reality**: Worker service returns **dynamic external URLs**
```typescript
// Current architecture
const previewUrl = "https://abc123-xyz.preview.sheenapps.com"
// Each project gets unique subdomain - impossible to proxy with simple rewrites
```

**Why Same-Origin Won't Work**:
1. Worker generates unique subdomains per project
2. SSL certificate management nightmare (wildcard certs + dynamic routing)
3. CDN/infrastructure complexity (reverse proxy for thousands of previews)
4. DevOps-heavy with marginal benefit
5. Defeats purpose of isolated preview environments

### ✅ Better Solution: PostMessage Cross-Origin Communication

**Modern Standard**: Used by Google, Microsoft, all major WYSIWYG editors
**Security**: Built-in origin validation, no DOM manipulation needed
**Performance**: Lightweight, no infrastructure changes
**Compatibility**: Works with current worker architecture

## Research Findings: How Lovable Does It

### Lovable's Architecture (From Blog Post Analysis)

**Their Advantage**: Full stack control
- Host 4,000+ ephemeral dev servers on fly.io
- Preview and editor on **same infrastructure**
- **No cross-origin issues** because they own both ends
- Direct DOM access via same-origin policy

**Their Technical Stack**:
1. **Stable Component IDs**: Vite plugin injects unique IDs at compile-time
2. **Bi-directional Mapping**: DOM element ↔ JSX location in code
3. **Client-Side AST**: Full source code as AST in browser (Babel/SWC)
4. **Direct DOM Access**: Can read/modify iframe content directly
5. **Real-time Compilation**: Changes compile in-browser, no round-trip

**Key Insight**: Their approach **requires same-origin**. We can't replicate it without fundamentally changing our architecture (hosting previews ourselves).

## Our Architectural Reality

### Current Stack (August-October 2025)

**Frontend (Next.js 15)**:
- Builder interface with chat + iframe preview
- Workspace management and build tracking
- React Query for data fetching
- Feature flags system ready (`FEATURE_FLAGS`)
- Mobile-responsive architecture (`useResponsive()`)

**Worker Service (External Microservice)**:
- Handles all build operations
- Generates unique preview URLs
- Framework-agnostic (Vite, Next.js, React, etc.)
- HMAC authentication (dual signature v1 + v2)
- External preview hosting on isolated subdomains

**Database (Supabase)**:
- Project metadata with `framework` field
- Build events and version tracking
- RLS-based security model

**Integration Points**:
- `WorkerAPIClient` for authenticated worker requests
- Build events API (`/api/builds/[buildId]/events`)
- `SimpleIframePreview` component for preview display
- `BuilderChatInterface` for user interaction

## Proposed Cross-Origin Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Builder Interface (sheenapps.com)                       │
│                                                          │
│  ┌────────────────┐      ┌──────────────────────────┐  │
│  │ Chat Interface │      │ Preview Container        │  │
│  │                │      │                          │  │
│  │ • Build mode   │      │  ┌──────────────────┐   │  │
│  │ • Visual mode  │◄────►│  │ Cross-Origin     │   │  │
│  │ • AI prompts   │ msgs │  │ Iframe           │   │  │
│  │                │      │  │                  │   │  │
│  └────────────────┘      │  │ preview.sheen... │   │  │
│                          │  └──────────────────┘   │  │
│  ┌────────────────┐      │         ▲               │  │
│  │ Selection      │      │         │ postMessage   │  │
│  │ Overlays       │      │         │               │  │
│  │ (Canvas/SVG)   │◄─────┼─────────┘               │  │
│  └────────────────┘      └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                                   │
                                   │ Worker API
                                   ▼
                    ┌──────────────────────────┐
                    │ Worker Service           │
                    │                          │
                    │ • Build injection script │
                    │ • Element ID tagging     │
                    │ • Framework detection    │
                    │ • Preview deployment     │
                    └──────────────────────────┘
```

### Technical Approach

#### 1. Build-Time Injection (Worker Service)

**Worker Modifications Required**:
```javascript
// NEW: Visual editing plugin for worker
class SheenVisualEditingPlugin {
  apply(compiler) {
    compiler.hooks.emit.tapAsync('SheenVisualEditingPlugin', (compilation, callback) => {
      // 1. Inject tracking script into HTML entry point
      injectTrackingScript(compilation);

      // 2. Add data-sheen-id attributes to tagged elements
      tagElements(compilation, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'img']);

      callback();
    });
  }
}
```

**Tracking Script** (injected into preview):
```javascript
// tracking-client.js (minified ~3KB)
(function() {
  // Only initialize if parent window is valid sheenapps.com origin
  const ALLOWED_ORIGINS = ['https://www.sheenapps.com', 'http://localhost:3000'];

  // Element hover tracking
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-sheen-id]');
    if (target) {
      sendToParent({
        type: 'visual/hover',
        elementId: target.dataset.sheenId,
        tagName: target.tagName.toLowerCase(),
        bounds: target.getBoundingClientRect(),
        text: target.textContent?.trim().substring(0, 100),
        classList: Array.from(target.classList)
      });
    }
  });

  // Element click selection
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-sheen-id]');
    if (target && window.parent !== window) {
      e.preventDefault();
      sendToParent({
        type: 'visual/select',
        elementId: target.dataset.sheenId,
        tagName: target.tagName.toLowerCase(),
        bounds: target.getBoundingClientRect(),
        text: target.textContent?.trim(),
        classList: Array.from(target.classList),
        computedStyles: getRelevantStyles(target)
      });
    }
  });

  // Scroll/resize updates (throttled)
  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      sendToParent({ type: 'visual/viewport-changed' });
    }, 100);
  }, true);

  // Send message to parent with origin validation
  function sendToParent(data) {
    ALLOWED_ORIGINS.forEach(origin => {
      window.parent.postMessage(data, origin);
    });
  }

  // Extract relevant styles for editing
  function getRelevantStyles(element) {
    const computed = window.getComputedStyle(element);
    return {
      color: computed.color,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      backgroundColor: computed.backgroundColor,
      // ... other relevant properties
    };
  }

  // Notify parent that preview is ready
  sendToParent({ type: 'visual/ready', url: window.location.href });
})();
```

#### 2. Parent Window Communication (Builder Interface)

**Enhanced SimpleIframePreview**:
```typescript
'use client'

import { useEffect, useState, useRef } from 'react'

export function SimpleIframePreview({
  projectId,
  previewUrl,
  visualEditingEnabled
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null)
  const [hoveredElement, setHoveredElement] = useState<ElementInfo | null>(null)

  useEffect(() => {
    if (!visualEditingEnabled) return

    // Listen for messages from preview iframe
    const handleMessage = (event: MessageEvent) => {
      // CRITICAL: Validate origin
      const previewOrigin = new URL(previewUrl).origin
      if (event.origin !== previewOrigin) {
        console.warn('Rejected message from unauthorized origin:', event.origin)
        return
      }

      const data = event.data

      switch (data.type) {
        case 'visual/ready':
          console.log('Preview ready for visual editing')
          // Could show "Visual Edit Mode Active" banner
          break

        case 'visual/hover':
          setHoveredElement(data)
          break

        case 'visual/select':
          setSelectedElement(data)
          // Notify chat interface of selection
          onElementSelect?.(data)
          break

        case 'visual/viewport-changed':
          // Recalculate overlay positions if needed
          updateOverlayPositions()
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [visualEditingEnabled, previewUrl])

  return (
    <div className="relative h-full">
      <iframe
        ref={iframeRef}
        src={previewUrl}
        className="w-full h-full"
        sandbox="allow-scripts allow-same-origin"
      />

      {visualEditingEnabled && (
        <>
          {/* Hover overlay */}
          {hoveredElement && (
            <SelectionOverlay
              bounds={hoveredElement.bounds}
              type="hover"
              label={hoveredElement.tagName}
            />
          )}

          {/* Selection overlay */}
          {selectedElement && (
            <SelectionOverlay
              bounds={selectedElement.bounds}
              type="selected"
              label={`${selectedElement.tagName} • ${selectedElement.elementId}`}
            />
          )}
        </>
      )}
    </div>
  )
}
```

**Coordinate-Based Overlay Component**:
```typescript
function SelectionOverlay({
  bounds,
  type,
  label
}: {
  bounds: DOMRect
  type: 'hover' | 'selected'
  label: string
}) {
  // Convert iframe-relative coordinates to parent window coordinates
  const iframeRect = iframeRef.current?.getBoundingClientRect()

  const overlayStyle = {
    position: 'absolute',
    left: iframeRect.left + bounds.left,
    top: iframeRect.top + bounds.top,
    width: bounds.width,
    height: bounds.height,
    pointerEvents: 'none',
    border: type === 'selected' ? '2px solid blue' : '1px dashed rgba(0,0,255,0.5)',
    background: type === 'selected' ? 'rgba(0,0,255,0.1)' : 'rgba(0,0,255,0.05)'
  }

  return (
    <div style={overlayStyle}>
      <div className="absolute -top-6 left-0 bg-blue-600 text-white text-xs px-2 py-1 rounded">
        {label}
      </div>
    </div>
  )
}
```

#### 3. Chat Interface Integration

**Visual Edit Mode Toggle**:
```typescript
export function BuilderChatInterface({ ... }: Props) {
  const [mode, setMode] = useState<'build' | 'plan' | 'visual'>('build')

  // Visual editing state
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null)

  const handleElementSelect = (element: ElementInfo) => {
    setSelectedElement(element)

    // Add selection message to chat
    addAssistantMessage(
      `Selected: **${element.tagName}** element\n\nWhat would you like to do?\n\n` +
      `• Edit text directly (free)\n` +
      `• Modify styling with AI (uses credits)\n` +
      `• Change layout position (uses credits)`,
      'interactive',
      {
        type: 'element-selected',
        elementId: element.elementId,
        quickActions: [
          { label: 'Edit Text', action: 'edit-text', free: true },
          { label: 'Change Colors', action: 'edit-colors', free: false },
          { label: 'Adjust Size', action: 'edit-size', free: false }
        ]
      }
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle */}
      <ChatHeader
        mode={mode}
        onModeChange={setMode}
        modes={['build', 'plan', 'visual']}
      />

      {/* Visual edit banner */}
      {mode === 'visual' && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
          <p className="text-sm text-blue-900">
            ✏️ Visual Edit ON - Click elements to edit
            {selectedElement && ` • Selected: ${selectedElement.tagName}`}
          </p>
        </div>
      )}

      {/* Chat messages */}
      <ChatMessages messages={messages} />

      {/* Input */}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        mode={mode}
        selectedElement={selectedElement}
      />
    </div>
  )
}
```

## Worker Service Integration Requirements

### API Endpoints to Add/Modify

**1. Enable Visual Editing for Build**
```typescript
POST /api/v1/builds/{buildId}/enable-visual-editing
{
  "userId": "user_123",
  "elementTypes": ["h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "button", "img"]
}

Response:
{
  "success": true,
  "pluginEnabled": true,
  "trackingScriptInjected": true,
  "taggedElementCount": 143
}
```

**2. Element Code Location Lookup**
```typescript
POST /api/v1/projects/{projectId}/element-location
{
  "userId": "user_123",
  "elementId": "h2_abc123",
  "buildId": "build_xyz"
}

Response:
{
  "file": "src/components/Hero.tsx",
  "line": 42,
  "column": 8,
  "context": {
    "before": "<div className=\"hero\">",
    "element": "<h2 className=\"text-4xl font-bold\">Welcome</h2>",
    "after": "<p className=\"text-lg\">Get started today</p>"
  }
}
```

**3. Direct Text Edit (Free Tier)**
```typescript
POST /api/v1/projects/{projectId}/edit-text
{
  "userId": "user_123",
  "elementId": "h2_abc123",
  "newText": "Welcome to SheenApps",
  "buildId": "build_xyz"
}

Response:
{
  "success": true,
  "buildId": "build_abc_new",
  "previewUrl": "https://new-preview.sheenapps.com",
  "creditsUsed": 0,  // Free operation
  "hmrUpdateTime": "1.2s"
}
```

**4. AI-Powered Element Edit (Paid Tier)**
```typescript
POST /api/v1/projects/{projectId}/edit-element-ai
{
  "userId": "user_123",
  "elementId": "button_xyz",
  "prompt": "Make this button larger and use a gradient from blue to purple",
  "buildId": "build_xyz"
}

Response:
{
  "success": true,
  "buildId": "build_new",
  "previewUrl": "https://new-preview.sheenapps.com",
  "creditsUsed": 12,  // Seconds of AI time
  "changes": {
    "file": "src/components/Button.tsx",
    "before": "<button className=\"bg-blue-500 px-4 py-2\">",
    "after": "<button className=\"bg-gradient-to-r from-blue-500 to-purple-500 px-6 py-3 text-lg\">"
  }
}
```

### Worker Plugin Architecture

**Framework Detection**:
```javascript
// Worker determines framework from package.json
function detectFramework(packageJson) {
  if (packageJson.dependencies?.['next']) return 'nextjs'
  if (packageJson.devDependencies?.['vite']) return 'vite'
  if (packageJson.dependencies?.['react']) return 'react'
  return 'unknown'
}

// Apply appropriate plugin based on framework
function getVisualEditingPlugin(framework) {
  switch (framework) {
    case 'vite':
      return new ViteVisualEditingPlugin()
    case 'nextjs':
      return new NextJsVisualEditingPlugin()
    case 'react':
      return new ReactVisualEditingPlugin()
    default:
      return new GenericVisualEditingPlugin()
  }
}
```

**Element ID Generation** (Stable across changes):
```javascript
// Generate stable IDs based on file path + element position
function generateElementId(filePath, tagName, lineNumber) {
  const fileHash = hashString(filePath).slice(0, 6)
  const positionHash = hashString(`${tagName}_${lineNumber}`).slice(0, 6)
  return `${tagName}_${fileHash}_${positionHash}`
}

// Example: h2_3a7f2b_9d4e1c
// - h2: tag name
// - 3a7f2b: file path hash
// - 9d4e1c: position hash
```

## Implementation Phases

### Phase 0: Validation Spike (2-3 Days)

**Goal**: Prove postMessage approach works

**Tasks**:
1. Create minimal tracking script
2. Test postMessage communication between cross-origin iframe and parent
3. Implement basic coordinate-based overlay
4. Verify origin validation and security

**Success Criteria**:
- ✅ Message sent from iframe received by parent
- ✅ Origin validation blocks unauthorized origins
- ✅ Overlay renders at correct position (±2px tolerance)
- ✅ Hover and click detection working
- ✅ No security warnings in console

**Failure Scenario**: If postMessage is blocked by CSP or other security policies → abandon feature

### Phase 1: Worker Integration (Week 1-2)

**Goal**: Add visual editing support to worker service

**Tasks**:
1. Implement visual editing plugin for Vite projects (most common)
2. Create tracking script injection mechanism
3. Add element ID tagging logic
4. Implement element location lookup API
5. Test with 5 sample Vite projects

**Success Criteria**:
- ✅ Tracking script successfully injected into builds
- ✅ Element IDs stable across code formatting changes
- ✅ Build time increase <5%
- ✅ Element location lookup returns correct file/line
- ✅ Works with Vite production builds

### Phase 2: Frontend Interface (Week 3-4)

**Goal**: Build visual editing UI in builder

**Tasks**:
1. Enhance `SimpleIframePreview` with postMessage listener
2. Implement coordinate-based overlay components
3. Add visual edit mode to `BuilderChatInterface`
4. Create element selection flow and UI feedback
5. Implement direct text editing (free tier)

**Success Criteria**:
- ✅ Visual mode toggle working
- ✅ Element selection shows blue banner with element info
- ✅ Overlay positioning accurate on scroll/zoom
- ✅ Direct text edits save in <1.5s
- ✅ Desktop interface polished and intuitive

### Phase 3: AI Integration (Week 5)

**Goal**: Add AI-powered element editing

**Tasks**:
1. Implement element-scoped AI prompts
2. Integrate with credit system
3. Add preview before/after comparison
4. Create visual edit summary cards in chat

**Success Criteria**:
- ✅ AI element edits consume credits correctly
- ✅ Free vs paid distinction clear in UI
- ✅ Element modifications accurate and safe
- ✅ Error handling for complex/dynamic elements

### Phase 4: Mobile & Polish (Week 6)

**Goal**: Mobile interface and production readiness

**Tasks**:
1. Long-press selection for mobile
2. Mobile bottom sheet interface
3. Touch-optimized overlays
4. Performance optimization
5. Alpha testing with 10 users

**Success Criteria**:
- ✅ Long-press selection works on iOS/Android
- ✅ Mobile interface intuitive and responsive
- ✅ No performance issues on mid-range devices
- ✅ Alpha users provide positive feedback

## Technical Advantages of PostMessage Approach

### ✅ Benefits Over Same-Origin

1. **Security**: Natural iframe isolation, no CSP conflicts
2. **Infrastructure**: Works with existing preview architecture, zero DevOps changes
3. **Flexibility**: Can work with any preview URL (external, CDN, etc.)
4. **Standards-Based**: PostMessage is W3C standard, supported everywhere
5. **Performance**: No proxy overhead, direct preview loading
6. **Scalability**: No bottleneck through Next.js server

### ✅ Benefits Over Lovable's Approach

1. **Framework Agnostic**: Works with Vite, Next.js, React, Vue, etc.
2. **Simpler Stack**: Don't need to host thousands of dev servers
3. **Lower Costs**: Preview hosting handled by worker service already
4. **Easier Debugging**: Isolated preview environments
5. **Better Security**: Cross-origin isolation prevents accidental leaks

## Risk Assessment

### High Risk → Mitigated

**Risk**: PostMessage blocked by CSP
**Mitigation**: Phase 0 validation, fail-fast approach
**Status**: Low probability (postMessage widely supported)

**Risk**: Coordinate calculations incorrect
**Mitigation**: Extensive testing, tolerance for ±2px errors
**Status**: Manageable with proper iframe bounds detection

**Risk**: Worker service integration delays
**Mitigation**: Vite-only MVP, expand to other frameworks later
**Status**: Controlled scope

### Medium Risk → Monitored

**Risk**: Mobile performance issues
**Mitigation**: Desktop-first rollout, mobile behind feature flag
**Status**: Defer to Phase 4

**Risk**: Complex dynamic elements
**Mitigation**: Fast-fail to AI lane with clear messaging
**Status**: Acceptable UX trade-off

**Risk**: Element ID stability
**Mitigation**: Hash-based IDs resistant to formatting changes
**Status**: Proven approach (used by Lovable, others)

## Success Metrics

### Technical Metrics
- **Element Selection**: >95% success rate for tagged elements
- **Overlay Accuracy**: ±2px positioning tolerance
- **Performance**: <5% build time increase, <3KB tracking script
- **Reliability**: <1% postMessage delivery failures

### User Experience Metrics
- **Adoption**: >30% of builders try visual editing
- **Usage Pattern**: ~70% direct edits, ~30% AI prompts
- **Time to Edit**: <1.5s for direct text changes
- **Error Rate**: <10% of edits require support

### Business Metrics
- **Support Reduction**: Fewer styling help requests
- **Engagement**: Higher time spent in builder
- **Revenue**: Clear monetization via AI credits
- **Competitive**: Matches Lovable's core capability

## Decision Summary

### ✅ Proceeding With

- **PostMessage cross-origin approach**: Modern, secure, compatible
- **Worker service integration**: Controlled scope, Vite-first
- **Phase 0 validation spike**: Fail-fast before full commitment
- **Desktop-first rollout**: Mobile deferred to Phase 4
- **Feature flags**: `VISUAL_EDITING_ENABLED`, `VISUAL_EDITING_MOBILE`

### ❌ Explicitly Not Doing

- **Same-origin preview proxy**: Architecturally incompatible
- **Complex infrastructure changes**: Not needed with postMessage
- **Framework-agnostic MVP**: Start with Vite only
- **Production without validation**: Phase 0 must pass first

## Next Steps

1. **This Week**: Phase 0 validation spike (2-3 days)
2. **If Pass**: Begin worker service integration (Week 1)
3. **If Fail**: Document findings and explore alternative approaches
4. **Stakeholder Review**: Present Phase 0 results before full commitment

## Appendix: Research References

- **MDN postMessage**: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
- **Lovable Visual Edits**: https://lovable.dev/blog/visual-edits
- **Cross-Origin Security**: https://www.bindbee.dev/blog/secure-cross-window-communication
- **Vite Plugin API**: https://vite.dev/guide/api-plugin
- **Build-Time Injection**: https://vite.dev/guide/features (transformIndexHtml)

---

**Status**: Ready for Phase 0 validation spike
**Confidence**: High - approach validated by industry standards and research
**Recommendation**: Proceed with 2-3 day spike to validate postMessage approach
