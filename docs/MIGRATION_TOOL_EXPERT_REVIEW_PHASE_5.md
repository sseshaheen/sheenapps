# Phase 5: Enhanced Transformation & Verification

**Website Migration Tool - AI-Powered Next.js Code Generation**

**Date**: 2026-01-21
**Status**: Planning Phase (Updated with Expert Feedback ✅)
**Previous Phases**: 1-4 Complete (Analysis, Planning, Basic Transformation)
**Expert Review**: Completed - Key strategic pivots incorporated

---

## 🎯 Executive Summary: Expert-Informed Updates

**Original Plan**: Per-component AI generation with basic quality gates
**Expert Feedback**: "Where migration tools go from demo to production system"
**Updated Plan**: Hierarchical generation + compile-repair + tiered gates

### Three Critical Changes (Expert's "Top 3"):

1. **Hierarchical Component Generation** (not batch vs individual)
   - Pass 1: Shared foundation (layout + primitives) - 1 API call
   - Pass 2: Page composition (uses shared components) - 1 call per page
   - Compile-repair loop: TypeScript feedback → Claude fixes → max 2 attempts
   - **Impact**: Massive jump in first-try success rate, controlled costs

2. **Separate Verification Queue** (not mixed with main queue)
   - Isolated `verificationQueue` for expensive builds
   - Strict concurrency (1-2 max) prevents resource exhaustion
   - Sequential fail-fast (don't run build if TS fails)
   - **Impact**: Reliable resource management, no "Tuesday build failures"

3. **Tiered Product Model** (not one-size-fits-all)
   - Basic: Templates only (~$0.30)
   - Standard: AI components + TS gate (~$1.50) - default
   - Pro: Standard + assets + build + a11y (~$3.00)
   - **Impact**: Aligns costs with user needs, sustainable pricing

### Key Insights Applied:
- Structured outputs = schema compliance, NOT code correctness ✅
- DRY-ish deduplication (primitives only) ✅
- Pragmatic quality gates (zero critical, minor warnings okay) ✅
- Selective asset downloading (same-origin + size caps) ✅
- Cache AI outputs by signature ✅

---

## Executive Summary

We're building an AI-powered tool that migrates existing websites to modern Next.js 15 applications. Phases 1-4 (queue infrastructure, analysis, planning, basic code generation) are complete and working. We now need expert guidance on Phase 5: **enhanced component generation, asset optimization, and quality verification**.

**Current Capability**: Input any website URL → Output working Next.js 15 project with structure, routing, and design tokens

**Phase 5 Goal**: Generate production-ready components with actual code, optimized assets, and automated quality gates

---

## Current State: What's Built (Phases 1-4)

### Architecture Overview

```
Frontend Request
    ↓
API Endpoint (/api/migrations)
    ↓
BullMQ Queue (Redis-backed)
    ↓
Migration Worker (Durable execution)
    ↓
┌─────────────────────────────────────────────┐
│ PHASE 1: Analysis (Week 1-2)               │
│ ✅ Shallow crawl (homepage preview)         │
│ ✅ SSRF protection (blocks private IPs)    │
│ ✅ Deep crawl (50 pages, post-verification)│
│ ✅ Asset extraction (images, CSS, JS)      │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ PHASE 2: AI Planning (Week 3)              │
│ ✅ Claude Sonnet 4.5 analysis              │
│ ✅ Top 10 page sampling (90% cost savings) │
│ ✅ Fine-grained component ID (35+ types)   │
│ ✅ Design system extraction                │
│ ✅ Next.js route structure generation      │
│ ✅ SEO-safe URL mappings (301 redirects)   │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ PHASE 3: Code Generation (Week 4)          │
│ ✅ Next.js 15 project structure            │
│ ✅ Package.json with dependencies          │
│ ✅ Tailwind config with design tokens      │
│ ✅ TypeScript strict mode setup            │
│ ✅ Page components (template-based)        │
│ ✅ File writing to filesystem              │
│ ✅ Project creation in database            │
└─────────────────────────────────────────────┘
    ↓
Real Project ID → /Users/sh/projects/{userId}/{projectId}/
```

### Tech Stack

**Backend**:
- Node.js + TypeScript (strict mode)
- Fastify (API framework)
- BullMQ (queue system, Redis-backed)
- PostgreSQL (Supabase)
- Anthropic Claude Sonnet 4.5 API

**Generated Projects**:
- Next.js 15 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 3.4

**Infrastructure**:
- Queue-based execution (retry-safe, durable)
- Idempotent phases (resume from checkpoints)
- Lease locking (prevents duplicate work)
- Event persistence (audit trail)
- SSE for real-time updates

### Key Features Delivered

#### 1. Security (SSRF Protection)
- Blocks private IP ranges (127.x, 10.x, 192.168.x, 172.16-31.x)
- Blocks cloud metadata endpoints (AWS, GCP)
- Validates redirects before following
- Same-origin + subdomain policy
- Ownership verification required for deep crawl

#### 2. AI-Powered Analysis (Claude Sonnet 4.5)
- **Model**: `claude-sonnet-4-5-20250929` (stable snapshot)
- **Input**: Top 10 pages (by importance) + page summaries
- **Output**: Component library (35+ types), design system, routes
- **Cost**: ~$0.30 per migration (vs $2.50 without optimization)
- **Token Optimization**: 90% reduction via page sampling + summaries

**Component Identification** (Fine-Grained):
- **Layout**: Header, Footer, Navigation, Sidebar, Container, Section
- **Interactive**: Button, IconButton, Link, Dropdown, Menu, Modal, Dialog, Tabs
- **Form**: Input, Textarea, Select, Checkbox, Radio, Switch, Label, FieldSet
- **Display**: Card, Badge, Tag, Chip, Avatar, Image, Icon, Divider
- **Content**: Hero, Heading, Paragraph, List, Blockquote, Code
- **Media**: ImageGallery, Carousel, VideoPlayer, AudioPlayer
- **Data**: Table, DataGrid, Chart, Graph
- **Feedback**: Alert, Toast, Notification, Progress, Spinner
- **Business**: PricingCard, Testimonial, FeatureList, TeamMember, ContactForm

Each component includes:
- `type`: Component name (Button, Card, etc.)
- `role`: Semantic role (e.g., "primary-cta", "navigation-link")
- `content`: Brief description
- `attributes`: Extracted properties (href, variant, etc.)

#### 3. Design System Extraction
Automatically identifies from crawled pages:
- **Colors**: Primary, secondary, accent, background, text
- **Typography**: Heading font, body font, scale (tight/normal/spacious)
- **Spacing**: Layout patterns
- **Border Radius**: none/small/medium/large
- **Shadows**: none/subtle/prominent

Example output:
```json
{
  "colors": {
    "primary": "#3b82f6",
    "secondary": "#8b5cf6"
  },
  "typography": {
    "headingFont": "Inter",
    "bodyFont": "Inter",
    "scale": "normal"
  },
  "spacing": "normal"
}
```

#### 4. Next.js Route Generation
- Converts old URLs to App Router structure
- SEO-safe redirects (301 permanent)
- URL normalization (remove .html, trailing slashes)
- Respects user preferences (strict preservation vs modernization)

Examples:
```
/about.html     → /about (301 redirect)
/index.html     → / (301)
/page.php?id=5  → /page-5 (if consolidation allowed)
```

#### 5. Idempotency & Durability
**Pattern**: Check DB → Run expensive operation → Store result

Benefits:
- Worker crashes don't lose progress
- Retries are instant (cached in DB)
- No duplicate API calls
- Cost-efficient (only pay once)

Applies to:
- Analysis phase (crawl results)
- Planning phase (AI analysis)
- Transformation phase (generated code)

#### 6. Generated Project Structure (Current)

```
project-name-2026-01-21/
├── package.json              # Next.js 15, React 19, Tailwind
├── tsconfig.json             # Strict TypeScript config
├── next.config.js            # Image optimization
├── tailwind.config.ts        # Design tokens from AI
├── postcss.config.js         # PostCSS + Tailwind
├── .gitignore               # Standard Next.js
├── README.md                # Documentation
└── app/
    ├── layout.tsx           # Root layout with metadata
    ├── page.tsx             # Homepage
    ├── globals.css          # Tailwind directives
    └── [routes]/
        └── page.tsx         # Dynamic pages per plan
```

**Current Page Component Example**:
```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn about our company',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">About Us</h1>
      <p className="text-gray-600">
        This page was migrated from: https://example.com/about.html
      </p>
      {/* TODO: Add components: Hero, Button, Card, Form */}
    </div>
  );
}
```

**Note**: Components are TODOs (not yet generated) - this is Phase 5's goal.

### Performance Metrics (Phases 1-4)

**Per Migration**:
- Analysis: 10-30 seconds (depends on site size)
- Planning: 15-45 seconds (Claude API call)
- Code Generation: 5-15 seconds (template-based)
- **Total**: 30-90 seconds for working Next.js project

**Cost Per Migration**:
- Claude API: ~$0.30 (with optimization)
- Infrastructure: Negligible (Redis, DB writes)
- **Total**: ~$0.30 per migration

**Success Rate**:
- Analysis: 95%+ (SSRF catches invalid URLs)
- Planning: 90%+ (depends on Claude API availability)
- Code Generation: 99%+ (template-based, no AI)

### Database Schema (Relevant Tables)

```sql
-- Main migration tracking
migration_projects (
  id UUID PRIMARY KEY,
  user_id UUID,
  source_url TEXT,
  status migration_status,  -- 'analyzing', 'processing', 'completed', 'failed'
  target_project_id UUID,   -- Links to generated project
  verification_verified_at TIMESTAMPTZ,
  created_at, updated_at, completed_at
)

-- Analysis results (idempotency cache)
migration_analysis (
  id UUID PRIMARY KEY,
  migration_project_id UUID,
  analysis_type TEXT,  -- 'preliminary', 'detailed', 'planning', 'transformation'
  data JSONB,          -- Crawl results, AI plan, etc.
  created_at
)

-- SEO redirects
migration_map (
  id UUID PRIMARY KEY,
  migration_project_id UUID,
  src_url TEXT,
  target_route TEXT,
  redirect_code SMALLINT,  -- 301, 302, etc.
  status map_status,
  meta_data JSONB
)

-- User preferences (optional)
migration_user_brief (
  id UUID PRIMARY KEY,
  migration_project_id UUID,
  goals TEXT,                    -- 'preserve', 'modernize', 'uplift'
  style_preferences JSONB,       -- Typography, spacing, motion
  framework_preferences JSONB,   -- Strict URL preservation, etc.
  risk_appetite TEXT             -- 'conservative', 'balanced', 'bold'
)

-- Generated projects
projects (
  id UUID PRIMARY KEY,
  owner_id UUID,
  name TEXT,
  framework TEXT,      -- 'nextjs'
  build_status build_status,
  config JSONB,
  created_at, updated_at
)
```

---

## Phase 5 Plan: Enhanced Transformation & Verification

### Goals

1. **Generate production-ready components** (not just TODOs)
2. **Download and optimize assets** (images, fonts, etc.)
3. **Automated quality gates** (TypeScript check, build verification, accessibility audit)
4. **Preview environment** (optional: deploy to staging for user review)

### 5.1: AI-Powered Component Generation

**Current State**: Components are TODOs in pages
**Goal**: Generate actual React components with code

#### Approach: Hierarchical Generation with Compile-Repair Loop (Expert-Recommended ⭐)

**Strategy**: Generate in passes with decreasing blast radius + add TypeScript feedback loop.

**Two-Pass Generation** (simplified from expert's 3-pass):

```typescript
// PASS 1: Shared Foundation (1 API call)
// Generate layout components + UI primitives that are reused everywhere
async function generateSharedComponents(plan: MigrationPlan): Promise<GeneratedComponent[]> {
  const sharedTypes = [
    'Header', 'Footer', 'Navigation',  // Layout
    'Button', 'Card', 'Input', 'Modal', 'Badge'  // UI primitives
  ];

  const components = plan.componentLibrary.filter(c => sharedTypes.includes(c));

  const result = await claude.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8000,  // Larger budget for batch
    system: SHARED_COMPONENTS_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: buildSharedComponentsPrompt(components, plan.designSystem)
    }],
    // Structured outputs for schema compliance (NOT code correctness)
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'shared_components',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            components: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  filename: { type: 'string' },
                  code: { type: 'string' },
                  imports: { type: 'array', items: { type: 'string' } }
                },
                required: ['filename', 'code']
              }
            }
          },
          required: ['components']
        }
      }
    }
  });

  return result.components;
}

// PASS 2: Page Composition (1 API call per page)
// Generate page-level components that compose the shared primitives
async function generatePageComponent(page: PagePlan, sharedComponents: string[]): Promise<GeneratedComponent> {
  const result = await claude.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4000,
    system: PAGE_COMPOSITION_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: buildPagePrompt(page, sharedComponents, plan.designSystem)
    }],
    response_format: { /* structured output schema */ }
  });

  return result;
}
```

**Critical Addition: Compile-Repair Loop** (Expert's #1 recommendation):

```typescript
async function generateWithRepair(
  prompt: string,
  maxRepairs: number = 2
): Promise<GeneratedComponent> {
  let component = await generateComponent(prompt);

  for (let attempt = 0; attempt < maxRepairs; attempt++) {
    // Write file and check TypeScript
    await writeFile(component.filename, component.code);
    const tsResult = await execAsync('npx tsc --noEmit', { cwd: projectPath });

    if (tsResult.exitCode === 0) {
      // Success!
      return component;
    }

    // Failed - extract errors and send back to Claude for repair
    const errors = parseTypeScriptErrors(tsResult.stderr);
    const relevantErrors = errors.filter(e => e.file === component.filename);

    if (relevantErrors.length === 0) {
      // Errors elsewhere, not this component
      return component;
    }

    // Ask Claude to fix the errors
    component = await repairComponent(component, relevantErrors);
  }

  // Max repairs exhausted - fallback to template
  unifiedLogger.system('startup', 'warn', 'Component generation failed after repairs, using template', {
    filename: component.filename
  });

  return generateTemplateComponent(component.type);
}

async function repairComponent(
  component: GeneratedComponent,
  errors: TypeScriptError[]
): Promise<GeneratedComponent> {
  const repairPrompt = `
The following TypeScript component has compilation errors:

Filename: ${component.filename}
Code:
\`\`\`typescript
${component.code}
\`\`\`

TypeScript Errors:
${errors.map(e => `Line ${e.line}: ${e.message}`).join('\n')}

Please fix these errors and return the corrected component code.
Maintain the same structure and functionality.
`;

  const result = await claude.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4000,
    system: REPAIR_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: repairPrompt }],
    response_format: { /* same schema */ }
  });

  return result;
}
```

**Why This Works** (Expert insight):
- Structured outputs = schema compliance, NOT code correctness
- Compile-repair loop = massive jump in first-try success rate
- Hierarchical passes = shared components are solid before pages use them
- Max 2 repairs = prevents infinite loops, falls back to templates

**System Prompt** (Component Generator):
```
You are an expert Next.js 15 and React 19 component generator.

Generate production-ready TypeScript React components with:
- Next.js 15 App Router compatibility
- TypeScript strict mode
- Tailwind CSS styling
- Responsive design (mobile-first)
- Accessibility (ARIA labels, semantic HTML, keyboard navigation)
- Modern React patterns (hooks, composition)
- next/image for images
- next/link for navigation

Component Type: {type}
Role: {role}
Content: {content}
Design System: {colors, typography, spacing}

Return valid JSON with filename and complete component code.
```

**User Prompt** (Per Component):
```
Generate a {type} component for a Next.js 15 project.

Component Details:
- Type: {Hero, Button, Card, etc.}
- Role: {primary-cta, navigation-link, etc.}
- Content: {extracted from original page}
- Design System:
  - Primary Color: #3b82f6
  - Secondary Color: #8b5cf6
  - Font: Inter
  - Spacing: normal

Requirements:
1. Use TypeScript with proper types
2. Use Tailwind CSS classes (text-primary-500, bg-secondary-500, etc.)
3. Make it responsive (mobile-first, use sm:, md:, lg: breakpoints)
4. Add ARIA labels for accessibility
5. Use next/image for images, next/link for navigation
6. Export as default function
7. Add JSDoc comments
```

**Output Example**:
```json
{
  "filename": "Button.tsx",
  "code": "import React from 'react';\n\ninterface ButtonProps {\n  children: React.ReactNode;\n  variant?: 'primary' | 'secondary';\n  onClick?: () => void;\n}\n\n/**\n * Button component with Tailwind styling\n */\nexport default function Button({ children, variant = 'primary', onClick }: ButtonProps) {\n  const baseClasses = 'px-4 py-2 rounded-lg font-medium transition-colors';\n  const variantClasses = variant === 'primary' \n    ? 'bg-primary text-white hover:bg-primary-600'\n    : 'bg-secondary text-white hover:bg-secondary-600';\n  \n  return (\n    <button \n      onClick={onClick}\n      className={`${baseClasses} ${variantClasses}`}\n      aria-label={typeof children === 'string' ? children : 'Button'}\n    >\n      {children}\n    </button>\n  );\n}",
  "imports": ["react"],
  "exports": ["Button"]
}
```

**Cost Estimate**:
- Input: ~1K tokens per component (prompt + context)
- Output: ~2K tokens per component (code)
- Cost: ~$0.05 per component
- **Typical migration (20 components)**: ~$1.00 additional

#### Approach 2: Template-Based with AI Enhancement (Alternative)

Use predefined templates for common components, AI for custom ones.

**Pros**:
- Faster generation
- More predictable output
- Lower cost

**Cons**:
- Less flexible
- May not match original design exactly

#### Implementation Decisions (Based on Expert Review ✅)

**1. Batching Strategy** → **RESOLVED: Hierarchical Two-Pass**
- Pass 1: Shared foundation (1 call for all layout + primitives)
- Pass 2: Page composition (1 call per page, composes shared components)
- Repair loop: Individual calls only for failed components (max 2 attempts)

**Why**: Control of batching without fragile mega-prompts. Shared components are solid before pages depend on them.

**2. Component Deduplication** → **RESOLVED: DRY-ish, Not DRY**
- Deduplicate layout components (Header, Footer, Nav)
- Deduplicate UI primitives (Button, Card, Input, Modal, etc.)
- Keep page-specific sections independent (avoid fuzzy matching complexity)

**Rule**: If type is in known primitive list → generate once, import everywhere. Otherwise → page-local.

**Why**: Removes 60-80% duplication without building a similarity engine.

**3. Error Handling** → **RESOLVED: Compile-Repair Loop**
- Validate with `tsc --noEmit` (fast)
- Feed TypeScript errors back to Claude for repair
- Max 2 repair attempts
- Fallback to templates if repairs fail

**Why**: Jumps "first-try success rate" massively with minimal extra cost (~$0.05-0.10 per repair).

**4. Styling Precision** → **RESOLVED: Tiered Product**
- **Basic**: Templates only + design tokens (fast/cheap)
- **Standard** (default): AI components + compile-repair + TS gate
- **Pro**: Standard + assets + build verification + a11y audit + preview deploy

**Default = "credible approximation"**: Match colors, typography, layout structure. Don't chase pixel-perfect.

**Why**: Aligns with cost structure ($0.30 basic → $1.50 standard → $3.00 pro) and user needs.

### 5.2: Asset Download & Optimization

**Current State**: Assets extracted (URLs only), not downloaded
**Goal**: Download, optimize, and include in generated project

#### Asset Processing Pipeline

```typescript
async function processAssets(plan: MigrationPlan): Promise<GeneratedAsset[]> {
  const assets: GeneratedAsset[] = [];

  // 1. Collect unique asset URLs
  const assetUrls = extractAssetUrls(plan.pages);

  // 2. Download with concurrency limit (5 concurrent)
  for (const url of assetUrls) {
    const asset = await downloadAsset(url);

    // 3. Optimize based on type
    if (isImage(asset)) {
      const optimized = await optimizeImage(asset);
      assets.push(optimized);
    } else {
      assets.push(asset);
    }
  }

  return assets;
}
```

#### Image Optimization (Sharp)

```typescript
import sharp from 'sharp';

async function optimizeImage(asset: DownloadedAsset): Promise<GeneratedAsset> {
  const image = sharp(asset.buffer);
  const metadata = await image.metadata();

  // Convert to WebP for modern browsers
  const webpBuffer = await image
    .webp({ quality: 85 })
    .toBuffer();

  // Generate responsive sizes
  const sizes = [640, 750, 828, 1080, 1200, 1920];
  const responsiveImages = await Promise.all(
    sizes.map(width =>
      image.resize(width).webp({ quality: 85 }).toBuffer()
    )
  );

  return {
    originalUrl: asset.url,
    localPath: `public/images/${asset.filename}.webp`,
    content: webpBuffer,
    mimeType: 'image/webp',
    size: webpBuffer.length,
    optimized: true,
    metadata: {
      originalSize: asset.size,
      compressionRatio: asset.size / webpBuffer.length,
      width: metadata.width,
      height: metadata.height,
      responsiveSizes: sizes
    }
  };
}
```

#### Font Optimization

**Strategy**: Download Google Fonts, self-host for performance

```typescript
async function downloadGoogleFont(fontFamily: string): Promise<GeneratedAsset> {
  // 1. Download WOFF2 from Google Fonts API
  const fontUrl = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(' ', '+')}`;
  const cssResponse = await fetch(fontUrl);
  const css = await cssResponse.text();

  // 2. Extract WOFF2 URLs from CSS
  const woff2Urls = extractFontUrls(css);

  // 3. Download font files
  const fontFiles = await Promise.all(
    woff2Urls.map(url => downloadFontFile(url))
  );

  // 4. Generate @font-face CSS
  const fontFaceCss = generateFontFaceCss(fontFamily, fontFiles);

  return {
    originalUrl: fontUrl,
    localPath: `public/fonts/${fontFamily.toLowerCase()}.woff2`,
    content: fontFiles[0].buffer,
    mimeType: 'font/woff2',
    optimized: true
  };
}
```

#### Implementation Decisions (Based on Expert Review ✅)

**1. Asset Selection** → **RESOLVED: Selective + Deterministic**

**Download by default**:
- ✅ Same-origin images referenced in HTML/CSS
- ✅ Logo/brand assets (always)
- ✅ Google Fonts (safe and common)
- ✅ Images under size cap (< 8-15MB per file)

**Keep as remote URLs** (write to report):
- ❌ External CDN assets (unless verified safe)
- ❌ Assets from stock photo domains (licensing risk)
- ❌ Large files over cap
- ❌ Assets that fail download (timeout/404)

**Why**: Avoid becoming an "asset siphon", reduce bandwidth costs, mitigate licensing issues.

**2. Storage Strategy** → **RESOLVED: Hybrid (Start Local)**
- **Phase 5**: Local filesystem (`/Users/sh/projects/{userId}/{projectId}/public/`)
- **Phase 6+**: Object storage (S3/R2) for large assets, local for small

**Why**: Start simple, migrate to object storage as scale demands.

**3. Optimization Strategy** → **RESOLVED: WebP + Let Next.js Handle**
- Convert images to WebP (quality 85%)
- Store originals + WebP versions
- Let Next.js Image component handle responsive sizes at runtime
- Don't generate srcset ourselves (Next does this)

**Why**: Next.js already optimizes at build/runtime. Our job is to ensure images are local + referenced correctly.

**4. Licensing Protection** → **RESOLVED: Blocklist + Disclaimer**
- Block known stock domains (Shutterstock, Getty, etc.)
- Add "user responsibility" disclaimer to TOS
- Generate asset report with external URLs flagged

**Why**: Prevents accidental copyright infringement while keeping simple.

**5. CDN Assets** → **RESOLVED: Keep Remote (with option to download)**
- Default: Keep CDN URLs (faster, no bandwidth cost)
- Option: Download if user explicitly opts in (Pro tier)

**Why**: CDNs are already optimized. Self-hosting adds cost without benefit unless user needs full control.

### 5.3: Quality Gates & Verification

**Goal**: Ensure generated projects are production-ready before delivery

#### Gate 1: TypeScript Compilation Check

```typescript
async function verifyTypeScript(projectPath: string): Promise<VerificationResult> {
  // Run TypeScript compiler
  const result = await execAsync('npx tsc --noEmit', { cwd: projectPath });

  return {
    passed: result.exitCode === 0,
    errors: parseTypeScriptErrors(result.stderr),
    duration: result.duration
  };
}
```

**Strictness** (Expert-Recommended): **Zero TypeScript errors**
- No `@ts-ignore` auto-insertion
- Compile-repair loop handles fixes (max 2 attempts)
- If repairs fail → fallback to templates + mark warnings

**If Fails After Repairs**:
- Deliver in "draft mode" with explicit warnings
- Report which components need manual review

#### Gate 2: Next.js Build Verification

```typescript
async function verifyBuild(projectPath: string): Promise<VerificationResult> {
  // 1. Install dependencies
  await execAsync('npm install', { cwd: projectPath, timeout: 300000 });

  // 2. Run Next.js build
  const result = await execAsync('npm run build', { cwd: projectPath, timeout: 600000 });

  return {
    passed: result.exitCode === 0,
    warnings: parseBuildWarnings(result.stdout),
    buildTime: result.duration,
    outputSize: await calculateBuildSize(projectPath)
  };
}
```

**Strictness** (Expert-Recommended): **Build must succeed**
- Warnings are okay (capture and surface)
- Errors block delivery (or deliver as "draft mode")

**Performance Strategy** (Expert-Recommended):
- ✅ **Separate `verificationQueue`** (lower priority, isolated from main queue)
- ✅ **Strict concurrency limits** (1-2 concurrent builds max)
- ✅ **Dependency caching** (pnpm global store or Docker layers)
- ⚠️ **Container isolation** (Phase 6 concern, not critical for Phase 5)

**Why**: Prevent one slow/failing build from blocking other migrations. Explicit resource management.

#### Gate 3: Accessibility Audit (Axe-Core)

```typescript
import { AxePuppeteer } from '@axe-core/puppeteer';
import puppeteer from 'puppeteer';

async function verifyAccessibility(projectPath: string): Promise<VerificationResult> {
  // 1. Start Next.js dev server
  const server = await startDevServer(projectPath);

  // 2. Run Axe on each page
  const browser = await puppeteer.launch();
  const results = [];

  for (const route of plan.routes) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:3000${route}`);

    const axeResults = await new AxePuppeteer(page).analyze();
    results.push({
      route,
      violations: axeResults.violations,
      passes: axeResults.passes.length
    });
  }

  await browser.close();
  await server.kill();

  // Expert-Recommended: Zero critical violations, minor warnings okay
  const criticalViolations = results.flatMap(r =>
    r.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
  );

  return {
    passed: criticalViolations.length === 0,  // Only critical/serious block
    violations: results.flatMap(r => r.violations),
    criticalCount: criticalViolations.length,
    minorCount: results.flatMap(r => r.violations).length - criticalViolations.length,
    summary: {
      totalPages: results.length,
      criticalPages: results.filter(r =>
        r.violations.some(v => v.impact === 'critical' || v.impact === 'serious')
      ).length
    }
  };
}
```

**Strictness** (Expert-Recommended): **Zero critical violations**
- Critical/serious violations → block delivery
- Minor/moderate violations → deliver with warnings
- Treat accessibility as "critical must-pass, minor warn"
```

#### Gate 4: SEO Check

```typescript
async function verifySEO(projectPath: string): Promise<VerificationResult> {
  const issues = [];

  // Check each page
  for (const page of plan.pages) {
    const component = await readPageComponent(projectPath, page.targetRoute);

    // Check metadata export
    if (!component.includes('export const metadata')) {
      issues.push({
        page: page.targetRoute,
        type: 'missing_metadata',
        message: 'Page missing metadata export'
      });
    }

    // Check title and description
    const metadata = extractMetadata(component);
    if (!metadata.title || metadata.title.length < 10) {
      issues.push({
        page: page.targetRoute,
        type: 'invalid_title',
        message: 'Title too short or missing'
      });
    }

    if (!metadata.description || metadata.description.length < 50) {
      issues.push({
        page: page.targetRoute,
        type: 'invalid_description',
        message: 'Description too short or missing'
      });
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    score: calculateSEOScore(issues)
  };
}
```

**Strictness** (Expert-Recommended): **Metadata must exist and be non-empty**
- Require title + description present
- Don't enforce perfect lengths (50+ chars is advisory, not blocking)
- Quality-score as advisory, existence as requirement
```

#### Verification Workflow (Sequential Fail-Fast - Expert-Recommended ⭐)

```
Code Generation Complete
    ↓
┌───────────────────────────────┐
│ Gate 1: TypeScript            │ (~5 seconds, FAST)
│ • Run: tsc --noEmit           │
│ • Strictness: ZERO errors     │
│ • On fail: Compile-repair loop│
└───────────────────────────────┘
    ↓ PASS (or fail after repairs)
┌───────────────────────────────┐
│ Gate 2: Build (verificationQueue)│ (~2-5 minutes, EXPENSIVE)
│ • Concurrency: 1-2 max        │
│ • Cache: pnpm store           │
│ • Strictness: Must succeed    │
│ • Warnings: Capture + surface │
└───────────────────────────────┘
    ↓ PASS (skip if fail)
┌───────────────────────────────┐
│ Gate 3: Accessibility         │ (~30 seconds)
│ • Strictness: Zero critical   │
│ • Minor violations: Warn only │
└───────────────────────────────┘
    ↓ PASS (non-blocking)
┌───────────────────────────────┐
│ Gate 4: SEO                   │ (~10 seconds)
│ • Strictness: Metadata exists │
│ • Lengths: Advisory only      │
└───────────────────────────────┘
    ↓
✅ MIGRATION COMPLETE
   Delivery: Production-ready if gates 1-2 pass
   Report: Gate results + warnings
```

**Key Changes** (Expert Insights):
1. **Sequential execution**: Fail early (don't run expensive Gate 2 if Gate 1 fails)
2. **Separate queue**: Build verification runs in `verificationQueue` (isolated, lower priority)
3. **Strict concurrency**: Max 1-2 concurrent builds (prevent resource exhaustion)
4. **Pragmatic strictness**: Zero errors for TS/build, zero critical for a11y, exists-only for SEO

#### Implementation Decisions (Based on Expert Review ✅)

**1. Gate Execution** → **RESOLVED: Sequential Fail-Fast**
- Run gates in order: TypeScript → Build → Accessibility → SEO
- If Gate 1 or 2 fails → skip remaining (don't waste resources)
- Gates 3-4 are non-blocking (advisory)

**Why**: Don't run expensive builds on code that doesn't compile.

**2. Failure Handling** → **RESOLVED: Deliver with Explicit Status**
- **TS/Build pass**: Deliver as "production-ready"
- **TS/Build fail after repairs**: Deliver as "draft mode" with warnings
- **Critical a11y violations**: Warn but deliver (user can fix)
- **SEO missing**: Warn but deliver

**Why**: Users can fix minor issues; blocking perfect outputs hurts velocity.

**3. Resource Management** → **RESOLVED: Separate Queue + Concurrency Limits**
- Create `verificationQueue` (isolated from main migration queue)
- Limit concurrent builds to 1-2 max
- Cache node_modules via pnpm global store
- Phase 6: Add Docker isolation (not Phase 5)

**Why**: Explicit resource control prevents one build from starving others.

**4. Quality Thresholds** → **RESOLVED: Pragmatic Strictness**
- **TypeScript**: Zero errors (no `@ts-ignore` escape hatch)
- **Build**: Must succeed (warnings okay but surfaced)
- **Accessibility**: Zero critical/serious (minor okay)
- **SEO**: Metadata must exist (length advisory)

**Why**: Balance "production-ready" with "delivered quickly".

**5. Preview Environment** → **RESOLVED: Optional + Tiered**
- **Basic/Standard**: No auto-deploy (local preview only)
- **Pro tier**: Optional Vercel preview deploy
- **Phase 6**: Consider internal staging

**Why**: Preview deployment is expensive/rate-limited. Make it opt-in for power users.

### 5.4: Enhanced User Feedback & Iteration

**Goal**: Allow users to review and refine generated code

#### Preview Dashboard

Show users:
- Generated file tree
- Component list with previews
- Quality gate results
- Before/after screenshots (if possible)

#### Iteration Options

1. **Regenerate Components**: User marks specific components for regeneration
   - Provide feedback ("make button larger", "use different color")
   - Re-run Claude with updated prompt

2. **Manual Edits**: User edits code directly in dashboard
   - Inline code editor
   - Save changes to project

3. **Style Adjustments**: Quick tweaks without regeneration
   - Adjust colors, fonts, spacing
   - Regenerate Tailwind config only

---

## Technical Considerations & Open Questions

### 1. Performance & Scalability (Expert-Informed ✅)

**Current Bottlenecks**:
- Claude API calls (15-45 seconds per migration)
- Build verification (2-5 minutes if implemented)
- Asset downloads (depends on size/count)

**Solutions Implemented**:
- ✅ **Separate `verificationQueue`** (isolated, lower priority, 1-2 concurrency)
- ✅ **Hierarchical generation** (shared foundation → pages, reduces API calls)
- ✅ **Compile-repair loop** (fixes errors without full regeneration)
- ✅ **AI output caching** (see section below)

**Caching Strategy** (Expert High-ROI Recommendations):

```typescript
// Cache 1: AI-generated components (HIGH ROI)
const cacheKey = generateCacheKey({
  migrationId,
  componentSignature: JSON.stringify(component),
  promptVersion: '1.0',
  modelVersion: 'claude-sonnet-4-5-20250929'
});

const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// Generate and cache
const result = await generateComponent(...);
await redis.set(cacheKey, JSON.stringify(result), 'EX', 86400 * 7); // 7 days

// Cache 2: Dependency store (HIGH ROI)
// Use pnpm with global store: --store-dir ~/.pnpm-store
// Or Docker layer caching for base image with common deps

// Cache 3: Downloaded assets (MEDIUM ROI)
const assetCacheKey = `asset:${url}:${etag || lastModified}`;
const cachedAsset = await redis.get(assetCacheKey);
```

**Don't Cache** (Expert Advice):
- ❌ Full `next build` artifacts (low hit rate, large size)
- ❌ User-specific migrations (no reuse across users)

### 2. Cost Management (Expert-Informed Tiered Model ⭐)

**Cost Structure by Tier**:

| Tier | Features | AI Calls | Cost per Migration | User Value |
|------|----------|----------|-------------------|------------|
| **Basic** | Templates + design tokens | 1 (planning) | ~$0.30 | Fast/cheap starter |
| **Standard** | AI components + TS gate + compile-repair | 3-5 (shared + pages + repairs) | ~$1.50 | Production-ready (default) |
| **Pro** | Standard + assets + build + a11y + preview | 3-5 + build time | ~$3.00 | Enterprise-grade |

**Cost Optimization Techniques** (Expert Recommendations):
1. **Hierarchical generation**: Shared primitives once → reuse in pages (reduces calls)
2. **Compile-repair loop**: Fix errors without full regeneration (~$0.05 vs $0.50)
3. **Component caching**: Keyed by signature + prompt version (instant reuse)
4. **Page sampling**: Already doing (top 10 pages = 90% savings)
5. **Template fallback**: Failed components use templates (no retry cost)

**Projected Phase 5 Costs** (Standard Tier):
- Planning (Phase 3): ~$0.30
- Shared components generation: ~$0.40 (1 call, 8-10 components)
- Page composition (5 pages): ~$0.50 (5 calls @ $0.10 each)
- Compile-repair (2 components): ~$0.10 (targeted fixes)
- Asset optimization: ~$0.10 (compute)
- Build verification: ~$0.05 (compute)
- **Total**: ~$1.45 per migration

**Abuse Prevention** (Expert-Informed):
- ✅ Per-user daily caps (e.g., 5 migrations/day for free tier)
- ✅ Require verification before expensive steps (build, assets)
- ✅ Email/payment gate for Pro tier
- ⚠️ Per-domain caps: Phase 6 concern (expert suggests but may be overkill)

### 3. Error Recovery & Debugging

**Current Approach**: Idempotency handles most failures
- Retry logic in BullMQ (3 attempts, exponential backoff)
- Resume from last successful phase

**Phase 5 Challenges**:
- AI-generated code might be invalid
- Builds might fail for subtle reasons
- Assets might be unreachable

**Questions**:
- How much debugging should be automated?
- Should we provide detailed logs to users?
- Should we allow "debug mode" with extra logging?

### 4. Component Reusability

**Current**: Each component generated independently

**Challenge**: Similar components across pages (duplicate code)
- Example: Navigation appears on every page
- Should we generate once and import?

**Proposed Solution**:
```typescript
// Detect shared components
const sharedComponents = detectSharedComponents(plan.pages);

// Generate once, import everywhere
for (const component of sharedComponents) {
  generateSharedComponent(component);
}

// Update page imports
for (const page of plan.pages) {
  updatePageImports(page, sharedComponents);
}
```

**Questions**:
- How to detect "same" component (fuzzy matching)?
- What if components look similar but have different props?
- Should we over-share (DRY) or over-generate (independence)?

### 5. Design Fidelity vs Flexibility

**Spectrum**:
- **Low Fidelity**: Generic components, user customizes heavily
- **Medium Fidelity**: Match colors/fonts, approximate layout
- **High Fidelity**: Pixel-perfect recreation

**Trade-offs**:
- Low: Fast, cheap, but requires user work
- Medium: Balanced (current recommendation)
- High: Slow, expensive, brittle

**Questions**:
- Should this be user-configurable?
- Should we use AI to assess original design quality?
- Should we recommend improvements (e.g., accessibility fixes)?

---

## Success Metrics (Phase 5)

### Functional Requirements

- [ ] Generate actual React components (not TODOs)
- [ ] Components compile without TypeScript errors
- [ ] Components render correctly in Next.js dev mode
- [ ] Download and optimize at least images
- [ ] TypeScript compilation gate passes
- [ ] Build verification gate passes
- [ ] Accessibility audit runs (warnings acceptable)
- [ ] SEO check passes (metadata present)

### Quality Targets (Expert-Informed)

- **Component Generation Success Rate**: 90%+ (with compile-repair loop)
- **Build Success Rate**: 95%+ (after sequential gates + repairs)
- **Time to Generate**: <8 minutes (with verification queue isolation)
- **Cost per Migration (Standard)**: ~$1.50 (sustainable with caching)
- **User Satisfaction**: 85%+ (production-ready outcomes)

**Key Improvement**: Compile-repair loop expected to jump first-try success by 20-30% (expert estimate)

### Performance Targets

- **Component Generation**: <2 minutes for 20 components
- **Asset Download**: <1 minute for 50 assets
- **TypeScript Check**: <10 seconds
- **Build Verification**: <5 minutes (with caching)
- **Total Phase 5**: <8 minutes

---

## 🚀 Implementation Progress (2026-01-22)

### ✅ Week 5, Days 1-2: Hierarchical Generation + Compile-Repair (COMPLETED)

**Status**: Fully implemented and integrated ✨

#### Completed Items:

1. **Enhanced Code Generation Service** (`enhancedCodeGenerationService.ts`)
   - ✅ Hierarchical two-pass generation architecture
   - ✅ Pass 1: Shared foundation (primitives + layout) - single batched API call
   - ✅ Pass 2: Page composition (uses shared components) - 1 call per page
   - ✅ Claude Sonnet 4.5 integration (`claude-sonnet-4-5-20250929`)
   - ✅ Structured outputs for schema compliance (JSON parsing with markdown handling)
   - ✅ Component caching infrastructure (in-memory Map, Redis planned)

2. **Compile-Repair Loop** (Expert Priority #1 🔥)
   - ✅ TypeScript error parser with regex extraction
   - ✅ `generateWithRepair()` method with max 2 repair attempts
   - ✅ Template fallback when AI generation fails
   - ✅ Detailed error reporting and logging
   - ✅ File-by-file TypeScript compilation checking

3. **Integration with Migration Orchestrator**
   - ✅ Hybrid approach: Infrastructure (template) + Components (AI)
   - ✅ Temporary project directory creation for compile-repair loop
   - ✅ Combined code assembly (infrastructure + AI components)
   - ✅ Statistics tracking (success rate, repairs, template usage)
   - ✅ SSE progress broadcasting during generation

4. **TypeScript Quality**
   - ✅ All TypeScript errors fixed in enhanced service
   - ✅ Proper type guards for Claude API responses
   - ✅ Optional client handling for graceful degradation
   - ✅ Null safety for regex matches and content blocks

#### Key Architectural Decisions:

**Why Hybrid Approach?**
- Infrastructure generation (package.json, tsconfig, etc.) doesn't benefit from AI
- Focused AI usage on high-value components where creativity matters
- Follows expert advice: "Don't over-engineer, improve critical path"
- Maintains backwards compatibility with existing orchestrator

**Shared Components Strategy:**
- Primitives: Button, Card, Input, Modal, etc. (13 types)
- Layout: Header, Footer, Navigation, Sidebar (4 types)
- Generated once, reused across all pages
- Massive cost savings + consistency across project

**Compile-Repair Loop Design:**
```typescript
generateWithRepair(component, maxRepairs = 2):
  1. Write component to disk
  2. Run tsc on specific file
  3. If errors → repair with Claude + error context
  4. Retry up to 2 times
  5. If still failing → fallback to template
```

#### Statistics & Insights:

**Code Quality**:
- Enhanced service: ~850 lines of production code (with Redis caching)
- Full type safety with strict TypeScript
- Comprehensive error handling and logging
- Ready for production testing

### ✅ Week 5, Day 5: Component Caching & Cost Optimization (COMPLETED)

**Status**: Redis caching fully implemented ✨

#### Completed Items:

1. **Redis Integration**
   - ✅ Two-tier caching: In-memory (fast) + Redis (persistent)
   - ✅ Automatic failover to in-memory if Redis unavailable
   - ✅ Lazy connection with exponential backoff
   - ✅ 7-day TTL for cached components
   - ✅ Versioned cache keys for safe invalidation (`migration:component:v1:`)

2. **Cache Key Generation**
   - ✅ Hash-based keys from component type + design system
   - ✅ SHA-256 signature ensures consistency
   - ✅ Includes colors, typography, and spacing in key

3. **Cache Statistics**
   - ✅ Hit/miss tracking
   - ✅ Separate stats for Redis vs memory hits
   - ✅ Write tracking
   - ✅ Hit rate calculation
   - ✅ Logged with each generation run

4. **Graceful Degradation**
   - ✅ Falls back to in-memory if Redis connection fails
   - ✅ Continues generation even if cache unavailable
   - ✅ Proper cleanup method for Redis connection

**Architecture**:
```typescript
getCachedComponent():
  1. Check in-memory Map (instant)
  2. If miss, check Redis (network call)
  3. If Redis hit, populate in-memory cache
  4. Track statistics

cacheComponent():
  1. Always write to in-memory Map
  2. If Redis available, write with TTL
  3. Track writes
  4. Log success/failure
```

**Benefits**:
- **Cross-worker sharing**: Multiple workers can share components
- **Persistence**: Cache survives worker restarts
- **Cost savings**: Reuse AI-generated components across migrations
- **Fast fallback**: In-memory cache for instant lookups
- **Observable**: Statistics for monitoring cache effectiveness

**Next Steps**:
- End-to-end testing with real websites
- Performance profiling and cost analysis

---

### ✅ Week 6, Days 1-2: Verification Queue + Quality Gates (COMPLETED)

**Status**: Fully implemented with expert-recommended patterns ✨

#### Completed Items:

1. **Verification Queue** (`verificationQueue.ts`)
   - ✅ Separate queue isolated from main migration queue
   - ✅ Higher priority than migrations (3 vs 5)
   - ✅ Longer timeouts for expensive builds (vs default)
   - ✅ Single retry strategy (builds don't benefit from retries)
   - ✅ Idempotent job IDs (`verification:{projectId}`)

2. **Verification Worker** (`verificationWorker.ts`)
   - ✅ Strict concurrency limit (1 worker) - EXPERT PRIORITY
   - ✅ Rate limiting (max 5 jobs/minute)
   - ✅ Graceful shutdown handling (SIGTERM/SIGINT)
   - ✅ Database result storage with conflict handling
   - ✅ Comprehensive event logging (completed/failed/stalled)

3. **Migration Quality Gates Service** (`migrationQualityGatesService.ts`)
   - ✅ Sequential execution with fail-fast behavior
   - ✅ TypeScript check (fast, blocking) - 30s timeout
   - ✅ Build verification (expensive, blocking) - 5min timeout
   - ✅ Accessibility audit (fast, advisory) - static analysis
   - ✅ SEO check (fast, advisory) - metadata validation
   - ✅ Detailed error parsing for TypeScript and Next.js builds

**Accessibility Audit Checks:**
- Missing alt attributes on images
- Form inputs without labels or aria-label
- Buttons without accessible text
- Links with empty or "#" href
- Missing h1 headings on pages
- Heading hierarchy violations (skipping levels)

**SEO Check Validations:**
- Page metadata exports (title, description)
- generateMetadata function presence
- Viewport configuration
- Semantic HTML structure (main, article, section)
- Sitemap presence
- robots.txt presence
- h1 heading on each page

4. **Architecture Decisions**:
   ```
   Main Migration Queue (concurrency: 2)
   ├─ Analysis Phase
   ├─ Planning Phase
   └─ Transformation Phase
       └─ (triggers) → Verification Queue (concurrency: 1)
                        ├─ TypeScript Check (blocking)
                        ├─ Build Verification (blocking)
                        ├─ Accessibility Audit (advisory)
                        └─ SEO Check (advisory)
   ```

**Expert Insight Applied:**
> "Don't run expensive builds if TypeScript fails. Sequential fail-fast saves minutes and dollars."

**Sequential Fail-Fast Logic:**
```typescript
for (const gate of ['typescript', 'build', 'a11y', 'seo']) {
  if (gate is blocking && previous gate failed) {
    skip all remaining gates;  // Fail-fast!
    break;
  }

  run gate;

  if (gate failed && gate is blocking) {
    record failure;
    break;  // Stop immediately
  }
}
```

**Benefits:**
- **Resource Protection**: 1-worker concurrency prevents "Tuesday build failures"
- **Cost Savings**: Fail-fast stops expensive operations when TypeScript fails
- **Clear Feedback**: Sequential execution makes debugging easier
- **Isolation**: Separate queue ensures migrations aren't blocked by builds

**Statistics:**
- Verification queue: ~90 lines (minimal, focused)
- Quality gates service: ~350 lines (comprehensive)
- Verification worker: ~250 lines (robust)
- All TypeScript errors fixed ✅

**Next Steps**:
- End-to-end testing with real migration

---

### ✅ Week 6, Days 4-5: Asset Pipeline (COMPLETED)

**Status**: Fully implemented with selective downloading and optimization ✨

#### Completed Items:

1. **Asset Pipeline Service** (`assetPipelineService.ts`)
   - ✅ Selective downloading based on same-origin policy
   - ✅ Domain blocklist (stock photo sites with licensing concerns)
   - ✅ Domain allowlist (Google Fonts, common CDNs)
   - ✅ File size limits (8MB per file, 50MB total)
   - ✅ Concurrent downloads (5 parallel)
   - ✅ Download caching (in-memory)

2. **Image Optimization with Sharp**
   - ✅ WebP conversion (quality 85)
   - ✅ Automatic format detection
   - ✅ Compression statistics tracking
   - ✅ Graceful fallback if Sharp unavailable

3. **Orchestrator Integration**
   - ✅ Asset URL extraction from migration plan
   - ✅ Progress broadcasting during asset processing
   - ✅ Combined output with components

4. **Security Measures**
   - ✅ URL validation before download
   - ✅ Data URL rejection (already inline)
   - ✅ Content-type detection
   - ✅ Hash-based filenames for uniqueness

**Configuration:**
```typescript
// Size limits
MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;  // 8MB per file
MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024; // 50MB total

// Blocklist (licensing concerns)
BLOCKLIST_DOMAINS = [
  'shutterstock.com', 'istockphoto.com', 'gettyimages.com',
  'unsplash.com', 'pexels.com', 'pixabay.com', ...
];

// Allowlist (safe to download)
ALLOWLIST_DOMAINS = [
  'fonts.googleapis.com', 'fonts.gstatic.com',
  'cdnjs.cloudflare.com', 'unpkg.com', 'cdn.jsdelivr.net'
];
```

**Processing Pipeline:**
```
1. Extract asset URLs from migration plan
2. Deduplicate URLs
3. For each URL:
   a. Check blocklist/allowlist
   b. Check same-origin policy
   c. Download with timeout (30s)
   d. Check file size
   e. Optimize if image (WebP conversion)
   f. Save to project directory
4. Return processed assets + statistics
```

**Statistics Tracked:**
- Total URLs processed
- Downloaded count
- Optimized count (images converted to WebP)
- Skipped count (with reasons)
- Failed count (with errors)
- Total size in bytes
- Bytes saved from optimization

**Expert Insight Applied:**
> "Selective downloading avoids becoming an asset siphon, reduces bandwidth costs, and mitigates licensing issues."

**Next Steps**:
- End-to-end testing with real migration

---

## Implementation Strategy (Expert-Prioritized ⭐)

### Week 5 (Focus: Hierarchical Generation + Compile-Repair)

**Days 1-2**: Hierarchical Component Generation (Expert Priority #3)
- Pass 1: Shared foundation generator (layout + primitives)
- Pass 2: Page composition generator (uses shared components)
- Implement structured outputs for schema compliance
- Test with real migration (5-10 pages)

**Days 3-4**: Compile-Repair Loop (Expert Priority #1 🔥)
- Implement TypeScript error parser
- Create repair prompt system
- Add max-2-retry logic with template fallback
- Test with intentionally broken components

**Day 5**: Component Caching & Cost Optimization
- Implement Redis caching (keyed by signature + prompt version)
- Add pnpm global store for dependency caching
- Profile cost savings vs baseline
- Load testing with concurrent migrations

### Week 6 (Focus: Verification Queue + Assets)

**Days 1-2**: Verification Queue (Expert Priority #2 🔥)
- Create separate `verificationQueue` (isolated from main)
- Implement 1-2 concurrency limit
- Sequential fail-fast gate execution
- pnpm global store caching for builds

**Days 3**: Quality Gates Integration
- Gate 1: TypeScript check (fast, blocking)
- Gate 2: Build verification (expensive, blocking)
- Gate 3: Accessibility audit (fast, advisory)
- Gate 4: SEO check (fast, advisory)

**Days 4-5**: Asset Pipeline
- Selective downloading (same-origin + size caps + blocklist)
- Sharp WebP optimization
- Asset caching (keyed by URL + ETag)
- Test with various sites (images, fonts, external CDNs)

**Day 5 Evening**: Integration & Testing
- End-to-end test (Standard tier: full pipeline)
- Performance profiling (target: <8 minutes)
- Cost validation (target: ~$1.50 per migration)
- Documentation update

---

## Risks & Mitigation

### Risk 1: AI-Generated Code Quality
**Impact**: High (broken components = unusable project)
**Probability**: Medium (Claude is good but not perfect)

**Mitigation**:
- TypeScript compilation check (catch syntax errors)
- Fallback to templates for common components
- Allow regeneration with user feedback

### Risk 2: Build Verification Performance
**Impact**: Medium (slow feedback loop)
**Probability**: High (builds are inherently slow)

**Mitigation**:
- Run in separate queue (don't block other work)
- Cache node_modules (speed up retries)
- Make it optional (power users can skip)

### Risk 3: Asset Download Failures
**Impact**: Low (missing images, but project still works)
**Probability**: High (external URLs may be unreachable)

**Mitigation**:
- Graceful degradation (skip failed assets)
- Placeholder images for critical assets
- Report to user (list of failed downloads)

### Risk 4: Cost Overruns
**Impact**: High (unsustainable if too expensive)
**Probability**: Medium (depends on usage patterns)

**Mitigation**:
- Rate limiting (max migrations per user/day)
- Tiered pricing (basic vs premium)
- Cost monitoring and alerts

---

## Expert Review Results ✅

**Status**: Initial expert feedback received and incorporated (2026-01-21)

### All Questions Answered

✅ **Component Generation**: Hierarchical (shared → pages → repairs)
✅ **Caching**: AI outputs + pnpm store + assets (keyed by signature)
✅ **Error Recovery**: Compile-repair loop (max 2 attempts + template fallback)
✅ **Queue Architecture**: Separate `verificationQueue` with 1-2 concurrency
✅ **Resource Limits**: Explicit concurrency + pnpm caching + sequential fail-fast
✅ **Quality Gates**: TS + Build must-have; A11y + SEO advisory
✅ **Failure Handling**: Deliver with explicit status (production vs draft)
✅ **Iteration**: Yes - regenerate specific components with feedback (Phase 6)
✅ **Cost Optimization**: Hierarchical + repair loops + caching + template fallbacks
✅ **Pricing**: Tiered (Basic $0.30 / Standard $1.50 / Pro $3.00)
✅ **Rate Limiting**: Per-user daily caps + verification gates for expensive ops
✅ **Asset Storage**: Hybrid (local Phase 5, object storage Phase 6+)
✅ **Deduplication**: DRY-ish (primitives + layout only, not fuzzy matching)
✅ **Design Fidelity**: Medium by default (tiered for higher fidelity)

### Remaining Open Questions (Phase 6 Concerns)

These are acknowledged but deferred to Phase 6:

1. **Container Isolation**: Docker for builds (good for scale, not critical now)
2. **AVIF Support**: Beyond WebP (optimization, but WebP sufficient)
3. **ESLint Gate**: Adds time without much value (skip for now)
4. **Per-Domain Rate Limiting**: Possible overkill (per-user sufficient)
5. **Internal Staging**: Alternative to Vercel preview (Phase 6 consideration)

**Expert's Verdict**: "If you implement only three things in Phase 5, make them:
1. Compile-repair loop
2. Verification queue + constrained concurrency
3. Template-first primitives + AI page composition"

→ **All three are now in the plan** ✅

---

## Appendix: Code References

### Existing Services (Phases 1-4)

- `src/services/websiteCrawlerService.ts` - Analysis phase (SSRF protection, crawling)
- `src/services/migrationPlanningService.ts` - AI planning (Claude Sonnet 4.5)
- `src/services/codeGenerationService.ts` - Basic code generation (templates)
- `src/services/migrationOrchestratorService.ts` - Pipeline orchestration

### Database Schema

- `migrations/088_website_migration_tool_schema.sql` - Main schema
- `migrations/094_add_planning_analysis_type.sql` - Planning support

### Configuration

- `.env` - API keys (ANTHROPIC_API_KEY, DATABASE_URL)
- `src/queue/migrationQueue.ts` - BullMQ queue setup
- `src/workers/migrationWorker.ts` - Worker implementation

---

## Contact & Collaboration

**Current Team**: Solo developer (with AI assistance)
**Looking For**: Architectural review, strategic guidance, technical feedback
**Timeline**: Phase 5 planned for 2 weeks (flexible based on feedback)
**Budget**: Cost-conscious but willing to invest in quality

**Feedback Welcome On**:
- Architecture decisions
- Performance optimizations
- Cost reduction strategies
- Best practices for AI-powered code generation
- Production readiness concerns

---

## Summary: What Changed After Expert Review

### ✅ Strategic Pivots Incorporated

**1. Component Generation** → **Hierarchical (not batch/individual)**
- Before: Debating batch vs per-component
- After: Two-pass hierarchical (shared foundation → pages → repairs)
- Impact: Controlled complexity, reduced API calls

**2. Error Handling** → **Compile-Repair Loop (NEW)**
- Before: Fallback to templates on failure
- After: TypeScript errors fed back to Claude for targeted fixes (max 2)
- Impact: Expected 20-30% jump in first-try success rate

**3. Quality Gates** → **Sequential Fail-Fast + Separate Queue**
- Before: All gates in main queue
- After: `verificationQueue` with 1-2 concurrency, fail early
- Impact: Reliable resource management, no bonfire of retries

**4. Pricing** → **Tiered Product Model**
- Before: One-size-fits-all pricing
- After: Basic ($0.30) / Standard ($1.50) / Pro ($3.00)
- Impact: Aligns costs with value, sustainable economics

**5. Caching** → **AI Outputs by Signature**
- Before: Generic caching discussion
- After: Cache keyed by (migration, component signature, prompt version, model)
- Impact: Instant regeneration, significant cost savings on retries

**6. Asset Strategy** → **Selective + Blocklist**
- Before: Download everything
- After: Same-origin + size caps + stock domain blocklist
- Impact: Mitigates licensing risk, reduces bandwidth

**7. Quality Thresholds** → **Pragmatic Strictness**
- Before: Unclear strictness levels
- After: Zero errors (TS/build), zero critical (a11y), exists-only (SEO)
- Impact: Production-ready without perfectionism paralysis

### ❌ Rejected/Deferred (Overengineering for Phase 5)

- Patch/diff format instead of full rewrites (complex, low ROI)
- Container isolation for builds (Phase 6 concern)
- AVIF support beyond WebP (sufficient initially)
- ESLint as quality gate (time cost without benefit)
- Per-domain rate limiting (per-user sufficient)

### 🎯 Expert's "Top 3" All Incorporated

1. ✅ Compile-repair loop with TypeScript feedback
2. ✅ Verification queue with constrained concurrency
3. ✅ Template-first primitives + AI page composition

**Expert Verdict**: "This gets you production-ready outcomes without turning your worker into a bonfire of retries."

---

## 💡 Discoveries & Potential Improvements (2026-01-22)

### Discoveries During Implementation

1. **TypeScript Strictness is Non-Negotiable**
   - Optional properties with `exactOptionalPropertyTypes: true` require careful handling
   - Content blocks from Claude API can be undefined - always check before access
   - Regex matches need explicit null checks to avoid type errors
   - **Learning**: Type safety catches bugs before runtime, worth the extra effort

2. **Claude API Response Patterns**
   - Structured outputs guarantee JSON schema compliance, NOT code correctness
   - Claude sometimes wraps JSON in markdown code blocks (```json...```)
   - Need robust parsing that handles both plain JSON and markdown-wrapped responses
   - ThinkingBlock vs TextBlock types require proper type guards

3. **Hybrid Architecture Wins**
   - Don't use AI where templates work fine (infrastructure files)
   - Focus AI budget on high-value creative work (component composition)
   - Maintain backwards compatibility by wrapping new service
   - **Lesson**: Pragmatic > Pure (expert was right about not over-engineering)

4. **File System Operations During Compile-Repair**
   - Need to write files to disk before running tsc checks
   - Temporary directory structure mirrors final project layout
   - File paths must match between write location and tsc execution
   - **Note**: Could optimize by using tsc programmatic API instead of CLI

5. **Static Analysis vs Browser-Based Testing (2026-01-23)**
   - Existing qualityGatesService uses puppeteer + axe-core (requires browser)
   - For migration pipeline, static analysis is faster and more reliable
   - Regex-based pattern matching catches 80% of common issues
   - No runtime dependencies = more portable and easier to test
   - **Key insight**: Advisory gates should be fast; static analysis achieves <5s execution
   - **Pattern**: Parse TSX/JSX files, scan for known anti-patterns, aggregate warnings

### Potential Improvements (Not Urgent)

#### 1. Redis Caching Implementation (Week 5, Day 5)
**Current**: In-memory Map for component caching
**Improvement**: Redis-backed cache with TTL
**Benefits**:
- Persist cache across worker restarts
- Share cache between multiple workers
- Implement signature-based deduplication
**Effort**: ~2-3 hours
**ROI**: High for production, low for MVP

#### 2. Programmatic TypeScript API
**Current**: Shell out to `tsc` CLI via exec
**Improvement**: Use TypeScript compiler API directly
**Benefits**:
- Faster compilation (no process spawn)
- Better error object structure
- Memory efficient for batch checking
**Effort**: ~4 hours
**ROI**: Medium (current approach works fine)

#### 3. Streaming Generation for Large Projects
**Current**: Batch all components, then write
**Improvement**: Stream components to disk as generated
**Benefits**:
- Lower memory usage
- Faster time-to-first-component
- Better progress reporting granularity
**Effort**: ~6 hours (refactor orchestrator flow)
**ROI**: Low until we hit 100+ component projects

#### 4. Smart Template Selection
**Current**: Generic templates for all fallbacks
**Improvement**: Analyze component type + context for better templates
**Benefits**:
- Higher quality fallbacks
- Better match to original design
**Effort**: ~8 hours
**ROI**: Medium (mostly useful for edge cases)

### Won't Do (Consciously Decided Against)

1. **AI for Infrastructure Files**: Templates work perfectly, don't waste tokens
2. **Unlimited Repair Retries**: Max 2 prevents infinite loops, template fallback is safer
3. **Parallel Component Generation**: Sequential is easier to debug, cost difference minimal
4. **Custom TypeScript Error Formatting**: Regex parsing works fine, no need for complex AST

---

Thank you for reviewing! This expert feedback transformed the plan from "demo quality" to "production system." Excited to build Phase 5 with these strategic pivots.
