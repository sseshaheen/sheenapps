# Visual Design Editor: Technical Viability Analysis

**Date**: 2026-01-30
**Status**: Analysis / Pre-planning
**Risk Level**: High complexity feature

---

## The Core Problem

SheenApps generates websites via Claude AI prompts. When users want to make visual changes:

1. **No predictable structure** — Claude generates arbitrary React/Next.js code. Unlike Wix/Squarespace with fixed slots, we have freeform code.
2. **Regeneration destroys edits** — User says "add a blog section" → Claude may rewrite files, potentially overwriting any visual customizations.
3. **No source mapping** — When user clicks a heading in the preview, we don't know which file/line that heading lives in.
4. **Templates are loose guidance** — Our scaffold defines expected pages/entities but doesn't enforce component structure.

**The fundamental tension**: Visual editors assume a stable, predictable structure. AI code generation produces dynamic, unpredictable output.

---

## Industry Approaches (Research Summary)

### 1. Design Tokens / CSS Variables Layer

**How it works**: Separate styling from code. Define colors, fonts, spacing as CSS variables. Visual editor only modifies these variables, never touches component code.

**Examples**: [Builder.io Design Tokens](https://www.builder.io/c/docs/design-tokens), [Panda CSS Tokens](https://panda-css.com/docs/theming/tokens)

**Architecture**:
```
┌─────────────────────────────────────────────┐
│ Generated Code (untouched)                  │
│   <h1 className="text-primary">Title</h1>   │
└─────────────────────────────────────────────┘
                    ↓ references
┌─────────────────────────────────────────────┐
│ Theme Layer (editable)                      │
│   --color-primary: #0052CC                  │
│   --font-heading: 'Inter', sans-serif       │
│   --spacing-lg: 2rem                        │
└─────────────────────────────────────────────┘
```

**Pros**:
- Never conflicts with code regeneration
- Simple to implement
- Runtime theming without recompilation
- Supports dark mode, accessibility themes

**Cons**:
- Limited to style changes (colors, fonts, spacing)
- Can't edit text content, layout, or add/remove elements
- Requires Claude to use CSS variables (can be prompted)

**Sources**: [CSS-Tricks: Design Tokens](https://css-tricks.com/what-are-design-tokens/), [Penpot Developer Guide](https://penpot.app/blog/the-developers-guide-to-design-tokens-and-css-variables/)

---

### 2. Headless CMS Visual Editing (Sanity/Vercel Style)

**How it works**: Content is stored in CMS, separate from code. Visual editor overlays identify CMS-backed elements and allow click-to-edit. Code structure is untouched.

**Examples**: [Sanity Visual Editing](https://www.sanity.io/docs/visual-editing/introduction-to-visual-editing), [Vercel Visual Editing](https://vercel.com/blog/visual-editing)

**Architecture**:
```
┌─────────────────────────────────────────────┐
│ Generated Code                              │
│   <h1>{cmsData.hero.title}</h1>             │  ← CMS reference
│   <p className="hardcoded">Static text</p>  │  ← Not editable
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Overlay Layer (injected at runtime)         │
│   Detects CMS-backed elements via stega     │
│   Renders click targets → opens CMS field   │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ CMS (source of truth for content)           │
│   hero.title = "Welcome to My Site"         │
└─────────────────────────────────────────────┘
```

**How Sanity does it**:
- Uses [steganography](https://github.com/sanity-io/visual-editing) to encode source location in text content (invisible characters)
- `@vercel/stega` library encodes field paths into rendered text
- Overlay component scans DOM for stega-encoded elements
- Click → opens CMS Studio at exact field

**Pros**:
- Clean separation of content and code
- Regeneration-safe (content lives in CMS, not files)
- Already have CMS infrastructure in SheenApps
- Progressive enhancement model

**Cons**:
- Only works for CMS-backed content
- Hardcoded text in components not editable
- Requires Claude to use CMS for all dynamic content

**Sources**: [Sanity Overlays Docs](https://www.sanity.io/docs/visual-editing/visual-editing-overlays), [FocusReactive Deep Dive](https://focusreactive.com/sanity-visual-editing-review/)

---

### 3. AST-Based Code Modification (Onlook Style)

**How it works**: Instrument the codebase at build time with element IDs. Map DOM elements to source file locations. When user edits visually, use AST manipulation to patch the exact JSX.

**Examples**: [Onlook](https://onlook.com/features/visual-editor), [Codux by Wix](https://www.smashingmagazine.com/2023/06/codux-react-visual-editor-improves-developer-experience/), [Piny](https://getpiny.com/)

**Architecture**:
```
┌─────────────────────────────────────────────┐
│ Build Step (instrumentation)                │
│   Adds data-oid="file:line:col" to JSX      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Visual Editor (browser)                     │
│   User clicks element → gets data-oid       │
│   Sends edit request with oid + new value   │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Code Patcher (server/CLI)                   │
│   Parses source file with Babel             │
│   Locates JSX node at line:col              │
│   Applies AST transformation                │
│   Writes modified file → triggers HMR       │
└─────────────────────────────────────────────┘
```

**How Onlook does it**:
- Web container (CodeSandbox SDK + Bun) runs the project
- Build step adds `data-oid` attributes to all elements
- Visual edits use oid to locate corresponding JSX
- AI layer (Morph Fast-Apply) streams code patches
- Two-way sync: visual → code and code → visual

**Pros**:
- Full flexibility — can edit any element
- Real code output, no abstraction layer
- Supports adding/removing elements
- Works with existing Tailwind/React patterns

**Cons**:
- Complex to implement (needs custom build plugin, AST tools)
- **Regeneration problem remains** — if Claude rewrites files, oid mappings break
- Fragile with complex component structures
- Requires running dev server in controlled environment

**Sources**: [Onlook GitHub](https://github.com/onlook-dev/onlook), [LogRocket: Onlook Deep Dive](https://blog.logrocket.com/onlook-react-visual-editor/)

---

### 4. Protected Regions / User Code Markers

**How it works**: Explicitly mark sections of code as "user-modified" so regeneration skips them.

**Example pattern**:
```tsx
// Generated code
export default function Hero() {
  return (
    <section>
      {/* === BEGIN USER CUSTOMIZATION === */}
      <h1 style={{ color: '#ff0000' }}>My Custom Title</h1>
      {/* === END USER CUSTOMIZATION === */}

      {/* Generated content below */}
      <p>Welcome to the site</p>
    </section>
  )
}
```

**Pros**:
- Explicit, predictable behavior
- Works with any regeneration approach
- User knows exactly what's preserved

**Cons**:
- Invasive — code is littered with markers
- Claude must respect markers (can be prompted, but not guaranteed)
- Limits where users can customize
- Poor UX — users see ugly markers

**Sources**: [VibeCodiQ: Deterministic Regeneration](https://dev.to/vibecodiq/why-regenerate-in-ai-coding-should-never-mean-rewrite-1eel), [OpenAI Forum Discussion](https://community.openai.com/t/improve-code-editor-efficiency-avoid-full-code-regeneration-on-edits/1268599)

---

### 5. Customization Overlay Layer

**How it works**: Generated code is the "base layer" (frozen after generation). User customizations stored separately as JSON patches. Applied at render time or merged at build time.

**Architecture**:
```
┌─────────────────────────────────────────────┐
│ Generated Code (read-only base)             │
│   Original Claude output, never modified    │
└─────────────────────────────────────────────┘
                    +
┌─────────────────────────────────────────────┐
│ Customizations DB (per-project JSON)        │
│   {                                         │
│     "hero-title": { "text": "New Title" },  │
│     "theme": { "primary": "#ff0000" }       │
│   }                                         │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Runtime Injection                           │
│   Script reads customizations, patches DOM  │
│   OR: Build step merges before deploy       │
└─────────────────────────────────────────────┘
```

**Pros**:
- Regeneration-safe (customizations survive)
- Clean separation of concerns
- Can version control customizations separately
- Rollback to "original" is trivial

**Cons**:
- Two-layer complexity
- Potential conflicts when base changes
- Runtime injection has performance cost
- DOM patching can be fragile

---

### 6. Structured Component System (Constraint-Based)

**How it works**: Instead of letting Claude generate arbitrary code, enforce a standard component library with explicit "editable slots". Visual editor modifies slot content, not arbitrary code.

**Architecture**:
```
┌─────────────────────────────────────────────┐
│ Component Library (fixed, versioned)        │
│   <HeroSection                              │
│     title={/* editable slot */}             │
│     subtitle={/* editable slot */}          │
│     bgColor={/* theme token */}             │
│   />                                        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Claude generates component composition      │
│   <HeroSection title="..." subtitle="..." />│
│   <FeatureGrid items={[...]} />             │
│   <ContactForm fields={[...]} />            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Visual Editor knows component schemas       │
│   Can modify props without touching code    │
│   Props stored in DB, injected at render    │
└─────────────────────────────────────────────┘
```

**Pros**:
- Predictable, stable structure
- Clean editing experience
- Components are well-tested, accessible
- Visual editor knows exactly what's editable

**Cons**:
- **Constrains Claude's creativity** — can't generate unique layouts
- Significant upfront investment in component library
- Moves away from "AI builds anything" promise
- Users may feel limited

---

## SheenApps-Specific Considerations

### What We Have

| Asset | Status |
|-------|--------|
| CMS System | ✅ Full CMS with content types, entries, media |
| Template System | ✅ 12 templates with scaffold definitions |
| Build Pipeline | ✅ Claude generates → build → deploy to Workers |
| Preview System | ✅ Live iframe preview in workspace |
| CSS Framework | ✅ Tailwind CSS (utility classes) |

### What We Don't Have

| Gap | Impact |
|-----|--------|
| Source mapping | Can't connect DOM element to source file |
| Component library | Claude generates arbitrary components |
| Stable structure | No guaranteed file/component layout |
| Edit history | No way to preserve edits across regeneration |

### The Regeneration Problem (Critical)

When a user says "add a contact page" or "change the layout to two columns":

1. Claude receives the full prompt + existing code
2. Claude may rewrite multiple files
3. Any previous visual customizations in those files are lost
4. User has no warning this will happen

**This is the #1 technical risk** for any visual editor approach that modifies code.

**Conflict UX Policy** (implement when regen-triggering actions are possible):
> When a user requests a change that would trigger code regeneration, the UI should display:
> *"This may overwrite code-level edits. Your theme, CMS content, and safe layers are preserved."*

This sets correct expectations and keeps the product honest about what survives regen.

---

## Recommendation: Phased Approach

Given the constraints, I recommend a **layered strategy** that starts simple and grows based on user demand.

### Phase 1: Theme Customization Layer ✅ RECOMMENDED FIRST

**Scope**: Colors, fonts, logo, favicon only. No code modification.

**Implementation**:

1. **Semantic Tailwind Tokens (shadcn/ui pattern)**

   Instead of arbitrary value classes like `bg-[color:var(--color-primary)]`, use semantic token classes that map to CSS variables. This is the approach popularized by shadcn/ui:

   ```css
   /* globals.css */
   :root {
     --primary: 221.2 83.2% 53.3%;
     --primary-foreground: 210 40% 98%;
     --secondary: 210 40% 96.1%;
     --background: 0 0% 100%;
     --foreground: 222.2 84% 4.9%;
     --muted: 210 40% 96.1%;
     --accent: 210 40% 96.1%;
   }
   ```

   ```typescript
   // tailwind.config.ts
   theme: {
     extend: {
       colors: {
         primary: 'hsl(var(--primary))',
         'primary-foreground': 'hsl(var(--primary-foreground))',
         secondary: 'hsl(var(--secondary))',
         background: 'hsl(var(--background))',
         foreground: 'hsl(var(--foreground))',
         // ...
       }
     }
   }
   ```

   **Benefits**:
   - Claude prompts are simple: "use `bg-primary` for primary surfaces"
   - Tailwind IntelliSense works perfectly
   - Dark mode becomes trivial (swap CSS variables)
   - Consistent classnames across all templates

2. **Canonical Token Set** (templates MUST only use these tokens):
   ```css
   /* Core semantic tokens - this is the complete list */
   --background        /* Page/card backgrounds */
   --foreground        /* Primary text */
   --primary           /* Brand color, CTAs */
   --primary-foreground
   --secondary         /* Secondary UI elements */
   --secondary-foreground
   --muted             /* Subdued backgrounds */
   --muted-foreground  /* Subdued text */
   --accent            /* Highlights, hover states */
   --accent-foreground
   --destructive       /* Error states, delete actions */
   --destructive-foreground
   --border            /* Borders, dividers */
   --input             /* Form input backgrounds */
   --ring              /* Focus rings */
   ```

   **Hard rule**: No inventing tokens like `--brand`, `--primary2`, `--header-bg`. The validator rejects non-canonical tokens. This prevents token sprawl.

3. **Theme Schema**:
   ```typescript
   interface ThemeCustomizations {
     colors: {
       primary: string      // HSL values
       secondary: string
       background: string
       foreground: string
       accent: string
       muted: string
       destructive: string
       border: string
     }
     fonts: {
       heading: string
       body: string
     }
     logo?: { url: string; alt: string }
     favicon?: string
   }
   ```

3. **Store in `project_customizations` table** (already have `projects` table)

4. **Build-time CSS variable injection**: Generate globals.css with user's theme values

5. **Post-Generation Compliance** (critical for real-world reliability):
   - **Normalizer codemod**: After Claude generates, run a pass that rewrites hardcoded colors (`bg-blue-500`) to semantic tokens (`bg-primary`)
   - **Deploy validator**: Block deployment if hardcoded color classes are detected
   - **Migration script**: Best-effort migration for existing projects

6. **Theme UI in infrastructure panel**:
   - Color pickers for 6 core colors (HSL-based)
   - Font selector (Google Fonts dropdown)
   - Logo upload
   - Live preview updates via CSS (no rebuild needed)

**Why start here**:
- Zero risk to generated code
- High user value (branding is top request)
- Works with regeneration (theme is separate layer)
- Semantic tokens are easier for AI compliance than arbitrary values

---

### Phase 2: CMS Content Visual Editing (4-5 weeks)

**Scope**: Click-to-edit for CMS-backed content only.

**Implementation using Content Source Maps (Sanity/Vercel pattern)**:

Rather than custom `data-cms-field` attributes (which require Claude compliance), adopt the industry-standard **stega encoding** approach:

1. **Stega-encode CMS responses**:
   ```typescript
   // In CMS client
   import { stegaEncodeSourceMap } from '@vercel/stega'

   function queryCMS(contentType: string) {
     const data = await fetchFromCMS(contentType)
     // Encode field paths into text using invisible characters
     return stegaEncodeSourceMap(data, {
       origin: '/cms',
       // Maps each field to its CMS path
     })
   }
   ```

   This embeds invisible characters in the text content itself, so `"Welcome to My Site"` becomes `"Welcome to My Site[invisible:hero.title]"`.

2. **Overlay layer detects stega-encoded elements**:
   ```typescript
   // Lightweight overlay script
   import { vercelStegaDecode } from '@vercel/stega'

   // Scans DOM text nodes for stega markers
   // Renders edit affordances on hover
   // Click → opens CMS editor at exact field
   ```

3. **Benefits over custom attributes**:
   - **No Claude prompting needed** — stega is applied at CMS layer, not in generated code
   - **Proven tooling** — same pattern used by Sanity + Vercel Visual Editing
   - **Clear boundary** — CMS-backed fields are editable; everything else isn't
   - **Survives regeneration** — CMS layer is untouched by code changes

4. **Inline editing component**:
   - Click text → inline contenteditable
   - On blur → save to CMS via existing API
   - Preview refreshes via existing SSE

**Constraints**:
- Only works for content from CMS (by design)
- Hardcoded text in components not editable (correct behavior)
- **Hard rule**: Stega applies only to CMS-origin strings. Do NOT post-process, sanitize, or transform those strings in a way that alters text nodes. Typography libs, sanitizers, and aggressive minifiers will break the encoding.

**Reference**: [Vercel Visual Editing](https://vercel.com/docs/workflow-collaboration/visual-editing), [@vercel/stega](https://github.com/vercel/stega)

---

### Phase 3: Layout Blocks (6-8 weeks) — Future, If Demand

**Scope**: Drag-and-drop section reordering, add/remove predefined blocks.

**Product Framing: Blocks as an Easy Mode Feature**

The concern "blocks betray the AI-builds-anything promise" is valid but solvable through product positioning:

- **Easy Mode users** want predictable, safe editing. Blocks give them Wix-like control without breaking things.
- **Future Pro Mode** (if built) could remain freeform with chat-based edits only.

Blocks aren't a limitation — they're a feature for users who value predictability over creativity.

**Prerequisites: Generation Contract**

Before implementing blocks, formalize file ownership to prevent regeneration conflicts:

```json
// sheenapps.manifest.json
{
  "version": 1,
  "ownership": {
    "generator": [
      "src/components/**",
      "src/app/**"
    ],
    "user": [
      "src/styles/theme.css",
      "content/**"
    ],
    "shared": [
      "src/blocks/**"  // Generator may only patch, not rewrite
    ]
  }
}
```

**Enforcement**:
- Server-side policy rejects rewrites to "user" paths
- Build step fails if generator modifies protected paths
- Diffs to "shared" paths require patch-only mode

This converts "regen destroys edits" from emergent behavior into a deterministic rule.

**Implementation**:
1. Define a block library (10-15 common sections):
   - Hero variants (centered, split, video background)
   - Feature grids (3-col, 4-col, alternating)
   - Testimonials, CTAs, Pricing tables, etc.

2. Store page structure as JSON:
   ```json
   {
     "blocks": [
       { "type": "hero-centered", "props": { "title": "..." } },
       { "type": "feature-grid", "props": { "items": [...] } }
     ]
   }
   ```

3. Render engine composes blocks at runtime
4. Visual editor allows reorder, add, delete, edit props
5. Claude generates initial block composition from prompt

---

### Alternative: Chat-First Editing (Parallel Track)

Instead of building visual editor UI, leverage the existing chat interface to manipulate safe layers:

**How it works**:
- User types natural language in EasyModeHelper chat
- System detects "safe" edit intents → executes directly without full rebuild
- Feedback is immediate; no waiting for Claude to regenerate code

**Safe edit categories**:

| User Says | System Does | Layer |
|-----------|-------------|-------|
| "Make my site more minimal" | Adjusts theme tokens (reduce accent, increase whitespace) | Theme |
| "Change primary color to blue" | Updates `--primary` CSS variable | Theme |
| "Change hero headline to X" | Edits CMS field directly | CMS |
| "Update contact email" | Edits CMS field | CMS |
| "Swap features and testimonials" | Reorders block JSON | Blocks (Phase 3) |
| "Remove the pricing section" | Deletes block from JSON | Blocks (Phase 3) |

**Implementation**:
1. Intent classifier (could be simple rules or lightweight LLM call)
2. Route safe intents to direct mutations (no Claude code generation)
3. Route complex/unsafe intents to full chat → build flow

**Benefits**:
- Scratches the "visual editing" itch without building UI
- Leverages existing chat infrastructure
- Instant feedback for safe changes
- Progressive: start with theme/CMS, add blocks later

**This is Phase 1B** — implement alongside or shortly after theme UI.

---

### What NOT to Build (At Least Initially)

| Feature | Why Not |
|---------|---------|
| Full Onlook-style AST editing | Too complex, fragile with regeneration |
| Arbitrary element editing | Requires source mapping we don't have |
| In-browser code editing | Users are non-technical |
| Layout modification | Conflicts with Claude's output |

---

## Decision Matrix

| Approach | Complexity | Regen-Safe | Edit Scope | User Value | Recommendation |
|----------|------------|------------|------------|------------|----------------|
| Theme Layer (semantic tokens) | Low-Medium | ✅ Yes | Colors/fonts | High | ✅ Phase 1 |
| Chat-First Editing | Low | ✅ Yes | Theme + CMS | High | ✅ Phase 1B |
| CMS Visual Edit (stega) | Medium | ✅ Yes | CMS content | High | ✅ Phase 2 |
| Block System | High | ✅ Yes | Blocks only | High | Maybe Phase 3 |
| AST Patching | Very High | ❌ No | Everything | Very High | ❌ Skip |
| Protected Regions | Medium | Partial | Marked areas | Medium | ❌ Skip |
| Overlay Layer | High | ✅ Yes | Patched elements | Medium | ❌ Skip |

---

## Implementation Estimate (Phase 1)

The UI work is straightforward. The real challenge is **AI compliance** across 12 templates and creative generations.

| Task | Effort | Notes |
|------|--------|-------|
| Theme schema + DB table | 2 hours | |
| Tailwind config with semantic tokens | 4 hours | shadcn pattern |
| Build-time CSS variable injection | 4 hours | |
| Theme customization UI | 1-2 days | Color pickers, font selector |
| Logo/favicon upload | 4 hours | |
| Claude prompt updates | 4 hours | "use bg-primary" etc |
| **Subtotal: Core Implementation** | **~1 week** | |
| | | |
| Post-gen normalizer codemod | 1-2 days | Rewrites hardcoded colors |
| Deploy validator | 4 hours | Blocks non-compliant code |
| Testing across 12 templates | 2-3 days | The real grind |
| Iteration on prompt compliance | 1-2 days | Claude doesn't always listen |
| Migration for existing projects | 1 day | Best-effort |
| **Subtotal: Compliance & Polish** | **~1-1.5 weeks** | |
| | | |
| **Total Phase 1 (realistic)** | **~2-3 weeks** | |

The estimate increased because "works in the wild" requires:
- Claude reliably using semantic tokens (not guaranteed)
- Codemod to fix violations (safety net)
- Validator to catch regressions (enforcement)
- Testing across all template variations

---

## Open Questions

1. **How much should we constrain Claude?**
   - Easy Mode: more constraints = predictable, safe editing
   - Pro Mode (future): fewer constraints = creative freedom
   - **Resolved**: Different products can have different constraints

2. **Visual editing vs chat-based changes?**
   - Chat-first editing may be sufficient for most users
   - Visual UI is nice-to-have, not must-have
   - **Action**: Implement chat-first alongside theme UI

3. **What happens on regeneration?**
   - Phase 1 (theme) survives automatically ✅
   - Phase 2 (CMS/stega) survives automatically ✅
   - Phase 3 (blocks) needs full Generation Contract
   - **Action**: Minimal contract in Phase 1A (protect theme/CMS), expand before Phase 3

4. **Onlook integration?**
   - Interesting for Pro Mode, but regeneration problem remains
   - Would still need Generation Contract
   - **Deferred**: Evaluate after Phase 2

---

## Next Steps

1. **Phase 1A: Theme Layer + Minimal Contract**
   - Implement semantic Tailwind tokens (shadcn pattern)
   - Build theme UI in infrastructure panel
   - Create normalizer codemod + deploy validator
   - **Minimal generation contract**: protect `theme.css` and CMS content paths from regen rewrites (prevents future foot-guns)
   - Test across all 12 templates

2. **Phase 1B: Chat-First Editing**
   - Build intent classifier for safe edits
   - Route theme/CMS changes directly (no Claude rebuild)
   - Leverage existing EasyModeHelper chat

3. **Phase 2: CMS Visual Editing**
   - Adopt @vercel/stega for content source maps
   - Build overlay component for click-to-edit
   - Inline editing → CMS mutation

4. **Before Phase 3: Full Generation Contract**
   - Expand manifest to cover blocks/shared paths
   - Implement server-side ownership enforcement
   - Only then proceed to blocks

5. **Measure & Iterate**
   - Track theme customization usage (>30% = success)
   - **Regen regret rate**: % of sessions where user loses an edit or hits "why did it revert" — if non-trivial, tighten contracts before expanding scope
   - Survey users: visual UI vs chat preference

6. **Next Document: Engineering PRD for Phase 1**
   - Exact schema/table name for theme customizations
   - Tailwind token set (full list)
   - Validator rules and codemod trigger points
   - Pipeline integration details

---

## References

**Theming & Design Tokens**
- [shadcn/ui Theming Docs](https://ui.shadcn.com/docs/theming)
- [CSS-Tricks: Design Tokens](https://css-tricks.com/what-are-design-tokens/)
- [Penpot: Design Tokens & CSS Variables](https://penpot.app/blog/the-developers-guide-to-design-tokens-and-css-variables/)

**Visual Editing & Content Source Maps**
- [Vercel Visual Editing](https://vercel.com/docs/workflow-collaboration/visual-editing)
- [@vercel/stega](https://github.com/vercel/stega)
- [Sanity Visual Editing](https://www.sanity.io/docs/visual-editing/introduction-to-visual-editing)
- [FocusReactive: Sanity Visual Editing Deep Dive](https://focusreactive.com/sanity-visual-editing-review/)

**Code Editing Tools**
- [Onlook GitHub](https://github.com/onlook-dev/onlook)
- [LogRocket: Onlook React Visual Editor](https://blog.logrocket.com/onlook-react-visual-editor/)
- [Builder.io Best AI Tools 2026](https://www.builder.io/blog/best-ai-tools-2026)

**Regeneration Strategies**
- [OpenAI Forum: Avoid Full Code Regeneration](https://community.openai.com/t/improve-code-editor-efficiency-avoid-full-code-regeneration-on-edits/1268599)

---

*Last updated: 2026-01-30 — Final version with canonical token set, stega hard rules, conflict UX policy*
