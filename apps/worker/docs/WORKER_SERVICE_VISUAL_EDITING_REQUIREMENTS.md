# Worker Service Requirements for Visual Editing
**For Worker Team Implementation**
*Version: 1.0 | Last Updated: October 2025*

## Overview

This document outlines the required changes to the worker service to support visual editing in the SheenApps builder. Visual editing allows users to click elements in the preview and edit them directly (free text edits) or with AI assistance (paid).

## Priority: Phase 1 (MVP - Vite Projects Only)

Start with Vite projects, expand to Next.js/React later.

---

## 1. NPM Dependencies Required

Add these Babel packages to worker's `package.json`:

```json
{
  "dependencies": {
    "@babel/core": "^7.23.0",
    "@babel/parser": "^7.23.0",
    "@babel/traverse": "^7.23.0",
    "@babel/generator": "^7.23.0",
    "@babel/types": "^7.23.0"
  }
}
```

**Why**: AST-based element ID tagging and safe text editing (not regex - prevents bugs from code reformatting).

---

## 2. New Vite Plugin: Visual Editing

**File**: `worker/src/plugins/visual-editing/index.js`

### Plugin Responsibilities

1. **Inject tracking script** into HTML (development: inline, production: external with SRI)
2. **Tag JSX elements** with stable `data-sheen-id` attributes via AST transformation
3. **Maintain ID registry** (optional but recommended) for element → source location mapping

### Implementation Approach

```javascript
/**
 * Visual Editing Plugin for Vite
 * - Injects tracking script for postMessage communication
 * - Tags JSX elements with stable IDs via AST transformation
 */

class VisualEditingPlugin {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.elementTypes = options.elementTypes || ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'img'];
    this.idRegistry = {}; // Maps elementId → { file, astPath, line, column }
  }

  apply() {
    return {
      name: 'sheen-visual-editing',
      enforce: 'post',

      // 1. Inject tracking script into HTML
      transformIndexHtml: {
        enforce: 'post',
        transform: (html, ctx) => {
          if (!this.enabled) return html;

          const isDev = process.env.NODE_ENV !== 'production';

          if (isDev) {
            // Development: inline script
            const script = this.getTrackingScript();
            return html.replace('</body>', `<script>${script}</script></body>`);
          } else {
            // Production: external script with SRI (you'll generate hash)
            const scriptTag = '<script src="/__sheen/tracking.js" integrity="sha384-[HASH]" crossorigin="anonymous"></script>';
            return html.replace('</body>', `${scriptTag}</body>`);
          }
        }
      },

      // 2. Transform JSX/TSX files to add element IDs
      transform(code, id) {
        if (!this.enabled || !/\.(jsx|tsx)$/.test(id)) {
          return null;
        }

        return this.transformJSX(code, id);
      }
    };
  }

  transformJSX(code, filePath) {
    const babel = require('@babel/core');
    const traverse = require('@babel/traverse').default;
    const generate = require('@babel/generator').default;
    const t = require('@babel/types');

    try {
      const ast = babel.parseSync(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        filename: filePath
      });

      traverse(ast, {
        JSXOpeningElement: (path) => {
          const elementName = path.node.name.name;

          if (!this.elementTypes.includes(elementName)) {
            return;
          }

          // Skip if already has data-sheen-id
          const hasId = path.node.attributes.some(attr =>
            t.isJSXAttribute(attr) && attr.name.name === 'data-sheen-id'
          );
          if (hasId) return;

          // Generate stable ID
          const elementId = this.generateStableId(filePath, path, elementName);

          // Store in registry for lookup
          this.idRegistry[elementId] = {
            file: filePath,
            astPath: this.buildASTPath(path),
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column
          };

          // Inject attribute
          path.node.attributes.push(
            t.jsxAttribute(
              t.jsxIdentifier('data-sheen-id'),
              t.stringLiteral(elementId)
            )
          );
        }
      });

      const output = generate(ast, { retainLines: true, comments: true });
      return { code: output.code, map: null };

    } catch (error) {
      console.warn(`[VisualEditing] AST parse failed for ${filePath}:`, error.message);
      return null; // Return original code
    }
  }

  buildASTPath(astPath) {
    const parts = [];
    let current = astPath;

    while (current && parts.length < 5) {
      if (current.isJSXElement()) {
        parts.unshift(current.node.openingElement.name.name || 'element');
      } else if (current.isFunctionDeclaration() || current.isFunctionExpression()) {
        parts.unshift(current.node.id?.name || 'fn');
      } else if (current.isVariableDeclarator()) {
        parts.unshift(current.node.id?.name || 'var');
      }
      current = current.parentPath;
    }

    return parts.join('/');
  }

  generateStableId(filePath, astPath, tagName) {
    const crypto = require('crypto');

    const normalizedPath = filePath.replace(/^.*\/src\//, 'src/');
    const fileHash = crypto.createHash('md5').update(normalizedPath).digest('hex').slice(0, 6);

    const astPathString = this.buildASTPath(astPath);
    const pathHash = crypto.createHash('md5').update(`${tagName}/${astPathString}`).digest('hex').slice(0, 6);

    return `${tagName}_${fileHash}_${pathHash}`;
  }

  getTrackingScript() {
    // Minified MessageChannel-based tracking script
    // See full source in section 3 below
    return `(function(){/* minified script */})();`;
  }
}

module.exports = { VisualEditingPlugin };
```

### When to Enable Plugin

Enable visual editing plugin when:
- User has visual editing enabled for their project (flag in DB)
- OR environment variable `ENABLE_VISUAL_EDITING=true`

**Recommended**: Enable by default for all Vite projects (small overhead, big UX win).

---

## 3. Tracking Script (Client-Side)

**File**: `worker/src/plugins/visual-editing/tracking-client.js` (full source)

This script gets injected into the preview and handles:
- Secure MessageChannel handshake with parent window
- Element hover/click detection
- Scroll/zoom bound updates
- PostMessage communication

```javascript
(function() {
  'use strict';

  // Extract parent origin and session from URL params
  const params = new URLSearchParams(location.search);
  const PARENT_ORIGIN = params.get('parentOrigin');
  const SESSION = params.get('session');

  if (!PARENT_ORIGIN || !SESSION) {
    console.warn('[SheenTracking] Missing security params, visual editing disabled');
    return;
  }

  let messagePort = null;
  let selectedElement = null;

  // Helper: Send message via MessagePort
  function send(data) {
    if (messagePort) {
      messagePort.postMessage(data);
    }
  }

  // Helper: Serialize bounds as primitives
  function serializeBounds(rect) {
    return {
      l: rect.left,
      t: rect.top,
      w: rect.width,
      h: rect.height
    };
  }

  // Handshake listener (one-time setup)
  window.addEventListener('message', (e) => {
    // CRITICAL: Validate origin
    if (e.origin !== PARENT_ORIGIN) {
      console.warn('[SheenTracking] Rejected handshake from:', e.origin);
      return;
    }

    if (e.data?.type === 'visual/handshake' && e.data.session === SESSION) {
      messagePort = e.ports?.[0];
      if (!messagePort) {
        console.error('[SheenTracking] No MessagePort received');
        return;
      }

      messagePort.onmessage = handlePortMessage;
      send({ type: 'visual/ready', url: location.href });
      console.log('[SheenTracking] Ready');
    }
  });

  function handlePortMessage(e) {
    // Handle parent → child messages (future: edit commands, etc.)
    console.log('[SheenTracking] Received:', e.data);
  }

  // Hover tracking (throttled via rAF)
  let hoverTicking = false;
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-sheen-id]');
    if (!target || hoverTicking) return;

    hoverTicking = true;
    requestAnimationFrame(() => {
      send({
        type: 'visual/hover',
        elementId: target.dataset.sheenId,
        tagName: target.tagName.toLowerCase(),
        bounds: serializeBounds(target.getBoundingClientRect()),
        text: target.textContent?.trim().substring(0, 100)
      });
      hoverTicking = false;
    });
  });

  // Click selection
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-sheen-id]');
    if (!target || !messagePort) return;

    e.preventDefault();
    selectedElement = target;

    send({
      type: 'visual/select',
      elementId: target.dataset.sheenId,
      tagName: target.tagName.toLowerCase(),
      bounds: serializeBounds(target.getBoundingClientRect()),
      text: target.textContent?.trim(),
      classList: Array.from(target.classList)
    });
  });

  // Scroll tracking (fresh bounds for selected element)
  let scrollTicking = false;
  window.addEventListener('scroll', () => {
    if (!selectedElement || scrollTicking) return;

    scrollTicking = true;
    requestAnimationFrame(() => {
      send({
        type: 'visual/bounds',
        elementId: selectedElement.dataset.sheenId,
        bounds: serializeBounds(selectedElement.getBoundingClientRect())
      });
      scrollTicking = false;
    });
  }, true); // Capture phase for nested scrolls

  // Resize (zoom detection)
  window.addEventListener('resize', () => {
    if (selectedElement) {
      send({
        type: 'visual/bounds',
        elementId: selectedElement.dataset.sheenId,
        bounds: serializeBounds(selectedElement.getBoundingClientRect())
      });
    }
  });
})();
```

**Minified version**: Use a minifier (terser, uglify-js) to reduce to ~2KB gzipped.

---

## 4. API Endpoints Required

### 4.1 Enable Visual Editing for Build

**Endpoint**: `POST /api/v1/builds/:buildId/enable-visual-editing`

**Request**:
```json
{
  "userId": "user_abc123",
  "elementTypes": ["h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "button", "img"]
}
```

**Response**:
```json
{
  "success": true,
  "pluginEnabled": true,
  "trackingScriptInjected": true,
  "elementTypes": ["h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "button", "img"]
}
```

**Implementation**:
- Update build config to enable visual editing plugin
- Store preference in build metadata

---

### 4.2 Element Location Lookup

**Endpoint**: `POST /api/v1/projects/:projectId/element-location`

**Request**:
```json
{
  "userId": "user_abc123",
  "buildId": "build_xyz",
  "elementId": "h2_a3f8b2_9d1c4e"
}
```

**Response**:
```json
{
  "file": "src/components/Hero.tsx",
  "line": 42,
  "column": 8,
  "astPath": "Hero/div/section/h2",
  "context": {
    "before": "  <div className=\"hero\">\n    <section>",
    "element": "      <h2 className=\"text-4xl font-bold\">Welcome to SheenApps</h2>",
    "after": "      <p className=\"text-lg\">Build amazing apps</p>\n    </section>"
  }
}
```

**Implementation**:
1. Look up `elementId` in the plugin's `idRegistry`
2. Read the source file
3. Extract 2-3 lines of context around the element
4. Return file path, line/column, and context

**Error Cases**:
- `404`: Element ID not found in registry
- `403`: User doesn't own this project

---

### 4.3 Direct Text Edit (FREE - No AI)

**Endpoint**: `POST /api/v1/projects/:projectId/edit-text`

**Request**:
```json
{
  "userId": "user_abc123",
  "buildId": "build_xyz",
  "elementId": "h2_a3f8b2_9d1c4e",
  "newText": "Welcome to Your New App"
}
```

**Response**:
```json
{
  "success": true,
  "buildId": "build_new_123",
  "previewUrl": "https://build-new-123.preview.sheenapps.com",
  "creditsUsed": 0,
  "hmrUpdateTime": "1.2s"
}
```

**Implementation** (AST-based, NOT string replace):

```javascript
async function editTextAST(elementId, newText, buildId) {
  // 1. Look up element in registry
  const elementInfo = idRegistry[elementId];
  if (!elementInfo) {
    throw new Error('Element not found');
  }

  // 2. Read source file
  const filePath = elementInfo.file;
  const sourceCode = await fs.readFile(filePath, 'utf-8');

  // 3. Parse to AST
  const ast = babel.parseSync(sourceCode, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    filename: filePath
  });

  // 4. Find element by ID and update text
  let updated = false;
  traverse(ast, {
    JSXElement(path) {
      const attrs = path.node.openingElement.attributes;
      const idAttr = attrs.find(a =>
        a.type === 'JSXAttribute' &&
        a.name.name === 'data-sheen-id' &&
        a.value.value === elementId
      );

      if (idAttr) {
        // Replace text child
        const textChild = path.node.children.find(c => c.type === 'JSXText');
        if (textChild) {
          textChild.value = newText;
          textChild.extra = { rawValue: newText, raw: newText };
          updated = true;
        }
      }
    }
  });

  if (!updated) {
    throw new Error('Element text not found or not editable');
  }

  // 5. Generate updated code
  const output = generate(ast, { retainLines: true, comments: true });

  // 6. Write file
  await fs.writeFile(filePath, output.code, 'utf-8');

  // 7. Trigger rebuild (HMR or full)
  const newBuildId = await triggerRebuild(buildId);

  return {
    success: true,
    buildId: newBuildId,
    previewUrl: `https://${newBuildId}.preview.sheenapps.com`,
    creditsUsed: 0
  };
}
```

**Why AST not regex**:
- Handles JSX expressions correctly (`<h2>{title}</h2>` vs `<h2>Static</h2>`)
- Preserves formatting and comments
- Won't break on edge cases (quotes, special chars, etc.)

**Error Cases**:
- `404`: Element not found
- `400`: Element has no text child (e.g., self-closing tag)
- `403`: User doesn't own project

---

### 4.4 AI-Powered Element Edit (PAID)

**Endpoint**: `POST /api/v1/projects/:projectId/edit-element-ai`

**Request**:
```json
{
  "userId": "user_abc123",
  "buildId": "build_xyz",
  "elementId": "button_a3f8b2_9d1c4e",
  "prompt": "Make this button larger with a blue to purple gradient"
}
```

**Response**:
```json
{
  "success": true,
  "buildId": "build_new_456",
  "previewUrl": "https://build-new-456.preview.sheenapps.com",
  "creditsUsed": 15,
  "changes": {
    "file": "src/components/Button.tsx",
    "before": "<button className=\"bg-blue-500 px-4 py-2\">Click Me</button>",
    "after": "<button className=\"bg-gradient-to-r from-blue-500 to-purple-500 px-6 py-3 text-lg\">Click Me</button>"
  }
}
```

**Implementation**:
1. Look up element location (same as 4.2)
2. Get current element code + surrounding context
3. Send to AI with prompt: "Modify this JSX element: [prompt]. Only return the modified JSX, preserve all functionality."
4. Parse AI response
5. Use AST to replace element in source
6. Trigger rebuild
7. Deduct credits from user's balance (charge for AI time used)

**Error Cases**:
- `402`: Insufficient credits (include recommendation for package to buy)
- `400`: AI couldn't parse element or generate valid code
- `403`: User doesn't own project

---

## 5. Security Requirements

### 5.1 HMAC Authentication

All endpoints must use existing dual-signature HMAC authentication (v1 + v2).

**Example** (from our Next.js app):
```typescript
const authHeaders = createWorkerAuthHeaders('POST', '/api/v1/projects/123/edit-text', body);
// Generates both x-sheen-signature (v1) and x-sheen-sig-v2 headers
```

### 5.2 Element Validation

Before any edit:
1. Verify `elementId` exists in ID registry for this build
2. Verify `elementId` maps to a file within the project (prevent path traversal)
3. Verify element is editable (has text child or modifiable attributes)

### 5.3 Rate Limiting

Apply rate limits:
- **Direct text edits**: 60 per minute per user
- **AI edits**: 10 per minute per user (more expensive)

### 5.4 Audit Logging

Log all edits:
```json
{
  "userId": "user_abc123",
  "projectId": "project_xyz",
  "elementId": "h2_a3f8b2_9d1c4e",
  "operation": "edit-text",
  "before": "Old Text",
  "after": "New Text",
  "timestamp": "2025-10-04T12:34:56Z"
}
```

---

## 6. Testing Requirements

### Unit Tests

1. **Plugin ID Stability**: Same element gets same ID after:
   - Code reformatting (prettier)
   - Adding/removing blank lines
   - Changing unrelated code

2. **AST Text Edit**: Correctly updates:
   - Simple text: `<h1>Hello</h1>` → `<h1>Goodbye</h1>`
   - Preserves attributes: `<h1 className="...">Text</h1>`
   - Handles JSX expressions safely (don't edit `<h1>{variable}</h1>`)

3. **Tracking Script Injection**:
   - Inline in development
   - External in production
   - Doesn't break existing scripts

### Integration Tests

1. **Full Edit Flow**:
   - Enable visual editing for build
   - Look up element location
   - Edit text
   - Verify rebuild triggered
   - Verify preview URL updated

2. **Error Handling**:
   - Invalid element ID → 404
   - User doesn't own project → 403
   - AST parse failure → graceful fallback

---

## 7. Deployment Checklist

- [ ] Add Babel dependencies to `package.json`
- [ ] Implement `VisualEditingPlugin` class
- [ ] Create `tracking-client.js` and minified version
- [ ] Implement 4 API endpoints (enable, locate, edit-text, edit-ai)
- [ ] Add ID registry persistence (optional: save to disk for lookup across builds)
- [ ] Configure rate limiting
- [ ] Set up audit logging
- [ ] Write unit tests (ID stability, AST editing)
- [ ] Test with 3 sample Vite projects
- [ ] Generate SRI hash for production tracking script
- [ ] Deploy to staging
- [ ] Smoke test: create project, enable visual editing, edit element, verify preview updates

---

## 8. Timeline Estimate

**Phase 1 (Vite Only)**:
- Plugin implementation: 3-4 days
- API endpoints: 2-3 days
- Testing & debugging: 2 days
- **Total: 7-9 days**

**Phase 2 (Next.js Support)**: +3-4 days
**Phase 3 (React/Webpack)**: +4-5 days

---

## 9. Questions & Support

**Questions for Worker Team**:

1. **ID Registry Persistence**: Should we save `idRegistry` to disk (e.g., JSON file in build artifacts) or rebuild on each lookup?
   - **Recommendation**: Save to `/.sheen/element-registry.json` in build output for faster lookups

2. **HMR vs Full Rebuild**: For text edits, should we use HMR or trigger full rebuild?
   - **Recommendation**: Try HMR first (faster), fallback to full rebuild if HMR fails

3. **AI Provider**: Which AI model should we use for element edits? (GPT-4, Claude, etc.)
   - **Recommendation**: Use same model as main builder (consistency)

4. **Production Script Hosting**: Where should we host the external tracking script?
   - **Recommendation**: Serve from `/__sheen/tracking.js` in preview domain (CDN cacheable)

**Contact**:
- **Technical Questions**: [Your team's contact]
- **API Auth Issues**: [Auth team contact]
- **AI Integration**: [AI team contact]

---

## 10. Success Metrics

Track these metrics post-launch:
- **Element ID Stability**: % of IDs that remain stable across code changes
- **Edit Success Rate**: % of text edits that succeed without errors
- **Performance**: Build time increase with plugin enabled (<5% target)
- **Tracking Script Size**: Gzipped size (<3KB target)
- **User Adoption**: % of builders who use visual editing

---

**Ready to Implement?**

This document has everything the worker team needs. Reach out if any clarification is needed. We're excited to see visual editing come to life! 🚀
