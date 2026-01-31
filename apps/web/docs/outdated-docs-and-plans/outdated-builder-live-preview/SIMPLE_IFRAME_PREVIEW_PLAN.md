# Simple Iframe Preview Implementation Plan

## Overview

Remove all complex preview systems and implement a straightforward iframe that shows the actual hosted site.

## ✅ Core Benefits

This approach eliminates a huge class of fidelity and performance issues by aligning with three essentials:

1. **WYSIWYG accuracy** – preview = production bundle
2. **Lower browser load** – no WASM, no big bundles in the builder tab
3. **Less code to maintain** – everything complex moves server-side where it already runs in CI/CD

## Current Situation

### What We Have (To Remove)
1. **LivePreview System** - Dynamic TypeScript compilation in browser
2. **Section-based Renderers** - Complex mapping of components to sections
3. **Template Conversion Logic** - Converting AI output to "builder format"
4. **Multiple Preview Modes** - edit, preview, compiled modes
5. **Robust Payload Adapter** - Complex normalization logic
6. **Preview Compilation Workers** - Web worker for TypeScript compilation
7. **Dynamic Component Generation** - Runtime component creation
8. **Mock File Generation** - Creating fake components when files are empty

### What We Want (Simple)

## 🏗️ Golden Path: AI JSON → Live URL

```
AI JSON
   ↓ unpack-template.sh   (temp dir)
pnpm install --frozen-lockfile
pnpm build               (vite/build outputs dist/)
   ↓
upload dist/ to preview bucket (S3 | Cloudflare R2 | Vercel)
   ↓
preview--{projectId}.sheenapps.com  (CNAME / federation)
   ↓
<iframe src={previewURL} … />      (builder renders)
```

## Cleanup Plan

### Phase 1: Remove Complex Preview Systems

#### Files to Delete
```
src/components/builder/preview/
├── LivePreview.tsx                    ❌ DELETE
├── dynamic-component.tsx              ❌ DELETE
├── iframe-preview-container.tsx       ❌ DELETE
├── isolated-preview-container.tsx     ❌ DELETE
├── pixel-perfect-renderer.tsx         ❌ DELETE
├── preview-mode-toggle.tsx            ❌ DELETE
├── compiled-preview.tsx               ❌ DELETE
├── compiled-preview-v2.tsx            ❌ DELETE
├── simple-template-preview.tsx        ❌ DELETE
├── section-renderers/                 ❌ DELETE ENTIRE FOLDER
│   ├── hero-renderer.tsx
│   ├── features-renderer.tsx
│   ├── pricing-renderer.tsx
│   ├── testimonials-renderer.tsx
│   ├── cta-renderer.tsx
│   └── footer-renderer.tsx
└── __tests__/                        ❌ DELETE ENTIRE FOLDER

src/services/preview/
├── robust-payload-adapter.ts         ❌ DELETE
├── bundle-cache.ts                   ❌ DELETE
├── bundle-entry-template.ts          ❌ DELETE
├── compiler-service.ts               ❌ DELETE
├── css-generator.ts                  ❌ DELETE
├── srcdoc-builder.ts                 ❌ DELETE
├── style-injector.ts                 ❌ DELETE
├── tailwind-extractor.ts             ❌ DELETE
├── live-preview-engine.ts            ❌ DELETE
├── impact-processor.ts               ❌ DELETE (if only used for preview)
└── auto-binding-service.ts           ❌ DELETE

src/workers/
├── component-compiler.worker.ts      ❌ DELETE
└── template-renderer.worker.ts       ❌ DELETE

public/
├── esbuild.wasm                      ❌ DELETE
└── previewCompileWorker.js           ❌ DELETE
```

#### Code to Remove from Existing Files

**src/components/builder/workspace/workspace-core.tsx**
- Remove `convertTemplateToBuilderFormat()` function
- Remove `extractPropsFromSource()` function
- Remove `createMockFilesFromComponents()` function
- Remove `generateComponentContent()` function
- Remove all template conversion logic
- Remove section mapping logic
- Simplify to just load project data as-is

**src/components/builder/preview/preview-renderer.tsx**
- Remove all section rendering logic
- Remove preview mode handling
- Replace with simple iframe component

**src/store/builder-store.ts**
- Remove `previewMode` from UI state
- Remove `setPreviewMode` action
- Remove section-related actions if not needed elsewhere
- Simplify to just store project/template data

### Phase 2: Implement Simple Iframe Preview

#### New Simple Components

**src/components/builder/preview/simple-iframe-preview.tsx**
```tsx
'use client';

import React from 'react';

interface SimpleIframePreviewProps {
  projectId: string;
  className?: string;
}

export function SimpleIframePreview({ projectId, className = '' }: SimpleIframePreviewProps) {
  // Simple: just show the hosted preview URL
  const previewUrl = `https://preview--${projectId}.sheenapps.com`;
  
  return (
    <div className={`iframe-preview-container ${className}`}>
      <iframe
        src={previewUrl}
        className="w-full h-full border-0"
        title="Site Preview"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}
```

**src/components/builder/workspace/workspace-preview.tsx**
```tsx
'use client';

import React from 'react';
import { SimpleIframePreview } from '@/components/builder/preview/simple-iframe-preview';

interface WorkspacePreviewProps {
  projectId: string;
}

export function WorkspacePreview({ projectId }: WorkspacePreviewProps) {
  return (
    <div className="absolute inset-0">
      <div className="w-full h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
        <SimpleIframePreview projectId={projectId} className="h-full" />
      </div>
    </div>
  );
}
```

### Phase 3: Backend Integration

## 🔧 Server-side Requirements

| Facet | Minimum Viable Decision |
|-------|------------------------|
| **Build runner** | GitHub Action, Cloud Build, or internal queuing worker running `docker run node:20 pnpm ...`. Pick one. |
| **Concurrency limits** | Simple FIFO queue per org or global (e.g. 3 parallel builds) to avoid 💥 during hackathon burst. |
| **Artifact hosting** | a. Push to Vercel w/ project-specific token<br>b. Upload to S3 & serve via CloudFront<br>c. Cloudflare Pages<br>Choose one path so your DNS pattern works. |
| **Subdomain provisioning** | Wildcard `*.preview--sheenapps.com` in DNS → same origin where artifacts live. If not possible, proxy `/preview/{id}` through your edge. |
| **Status API** | Persist build state (`queued`, `building`, `success`, `failed`) + logs in DB |
| **TTL / cleanup** | Cron job deletes preview artifacts older than N days to keep storage bill sane. |

#### API Endpoints

**POST /api/projects/{projectId}/deploy-preview**
- Receives output.json from AI
- Unpacks files using shell script
- Builds with pnpm
- Deploys to preview URL
- Returns preview URL

**GET /api/projects/{projectId}/preview-status**
- Returns build/deployment status
- Shows loading state while building

### Phase 4: Update Workspace Core

## 🎯 Builder-side: The Only New UI Logic

1. **Upload template** → call POST /deploy-preview
2. **Poll /preview-status** every 2-3s
3. **While building**: show "Building preview… (≈30s)"
4. **On success**: `<iframe src={previewUrl} .../>`
5. **On fail**: show log excerpt + "Rebuild" button

That's it—no mode toggles, no compile workers.

**Simplified workspace-core.tsx**
```tsx
export function WorkspaceCore({ projectId, projectData }) {
  // Just store the template data as-is
  useEffect(() => {
    if (projectData?.templateData) {
      // No conversion, just store it
      loadProjectData({
        ...projectData,
        templateData: projectData.templateData
      });
      
      // Trigger preview deployment
      deployPreview(projectId, projectData.templateData);
    }
  }, [projectData]);
  
  // Rest of workspace logic without preview complexity
}
```

## Migration Steps

1. **Git Stage Current Changes** ✅ (Already done)
2. **Create Feature Branch**
   ```bash
   git checkout -b feature/simple-iframe-preview
   ```

3. **Remove Complex Files**
   ```bash
   # Delete preview components
   rm -rf src/components/builder/preview/section-renderers
   rm src/components/builder/preview/LivePreview.tsx
   rm src/components/builder/preview/dynamic-component.tsx
   # ... etc
   ```

4. **Create Simple Components**
   - SimpleIframePreview
   - Updated WorkspacePreview
   - Preview deployment service

5. **Update Imports**
   - Remove all imports to deleted files
   - Update components to use simple iframe

6. **Test**
   - Ensure iframe loads
   - Verify preview URL works
   - Check responsive behavior

## Benefits of This Approach

1. **Simplicity**: No complex client-side compilation
2. **Reliability**: Shows exactly what will be deployed
3. **Performance**: No heavy client-side processing
4. **Maintainability**: Much less code to maintain
5. **Accuracy**: WYSIWYG - preview matches production exactly

## 🐉 Hidden Dragons to Pre-empt

| Issue | Mitigation |
|-------|-----------|
| **Build time creep** (npm install on every run) | Use `pnpm-store-path` cache volume in the runner or a Docker layer cache so 2nd builds drop from 60s → 10s |
| **Malicious code in preview** | Sandbox iframe with `allow-scripts allow-forms`; add CSP to disallow `top-navigation` + restrict external domains (`img-src *`) |
| **Edge-case JSON formats** | Keep the "robust adapter" server-side just for unpacking (it's trivial to run and isolates mess before build) |
| **Dependency hell** (native bindings) | Block packages that need binaries (`bcrypt`, `sharp`) at validation; inform user to switch to web-only deps |
| **Vite preview base path** | Ensure `vite.config.ts` uses `base: '/'` or environment-set base (`/preview-${id}/`) so assets resolve under subdomain |

## 📅 Lean Rollout Sequence (5-day target)

| Day | Deliverable |
|-----|------------|
| **0** | Delete legacy preview code on a branch (as per your file list) |
| **1** | Containerised build runner script (dockerfile + `scripts/unpack-template.sh`). Hard-code output to local `dist/` |
| **2** | Artifact upload to chosen host + wildcard DNS tested manually |
| **3** | API endpoints (deploy-preview, preview-status) + simple polling front-end |
| **4** | ⚙️ Smoke test: 3 real AI payloads build + load in iframe. Measure build time, confirm CSP |
| **5** | Merge & update docs; set backlog tickets for caching, cleanup cron, and security headers |

## Success Criteria

1. ✅ All complex preview code removed
2. ✅ Simple iframe preview working
3. ✅ Preview shows actual hosted site
4. ✅ No more template conversion logic
5. ✅ Codebase significantly simplified

## 🚀 Stretch Goals (only after MVP proves itself)

• **Incremental previews**: watch `dist/` and rsync diff instead of full rebuild
• **PR-style logs**: surface last 50 lines of build output in the UI
• **Background recycle**: auto-rebuild when AI regenerates template without user click

## 💡 Bottom Line

Delete the experimental client preview stack, push the entire template through your standard Node build pipeline, host, and iframe it. You'll trade ~0.3s in-tab compile time for ~20-30s one-time server build, but you gain predictability and pixel-perfect fidelity.

## Notes

- Keep git history of removed code in case needed later
- Document the preview URL pattern
- Ensure CORS is properly configured for iframe
- Consider loading states while preview builds