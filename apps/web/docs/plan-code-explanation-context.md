# Plan: Code Explanation Context During Generation

## Executive Summary

**Goal**: Help users understand what code is being generated and why, without overwhelming them with technical details.

**Key Insight**: We already have rich explanation data in `FeaturePlanResponse` and `FixPlanResponse` - we just don't connect it to the code generation UI. Most of this feature can be implemented **without backend changes**.

**Recommended Approach**: "Contextual Step Tracker" - Show which plan step the current file relates to, with optional deep-dive into details.

**Deployment**: Experimental feature behind a feature flag (defaults ON, easy kill switch).

---

## Feature Flag Strategy

### Implementation

Single environment variable with easy toggle:

```typescript
// Environment variable
NEXT_PUBLIC_ENABLE_PLAN_CONTEXT = 'true' // default ON for experiment

// Usage in components
const isPlanContextEnabled = process.env.NEXT_PUBLIC_ENABLE_PLAN_CONTEXT === 'true'
```

### Rationale

- **Simple**: Single flag, no complex gradual rollout initially
- **Easy kill switch**: Change env var and redeploy (or use config service if available)
- **Default ON**: Ship as experiment, gather data, then decide
- **Graceful degradation**: Feature simply doesn't render when OFF

### Future Enhancement (If Needed)

If we need finer control later, we can add:
- Remote config service integration (no-deploy toggle)
- Percentage-based rollout
- "Simple mode" (file banner only, no step tracker)

For now, keep it simple: ON or OFF.

---

## Problem Statement

**Current State**: Users see code streaming but don't understand:
- Why this file is being created/modified
- What the code does at a high level
- How this file relates to the overall plan
- What's coming next

**User Impact**:
- Non-developers feel lost watching "random code"
- Even developers lack business context
- Wait time feels longer without meaning
- Disconnect between approved plan and actual execution

---

## Non-Gimmick Constraints (Hard Requirements)

This feature becomes a gimmick if it lies, is verbose, or adds UI thrash. These constraints are **non-negotiable**:

### 1. Truthful Language

**Never claim certainty we don't have.**

| ❌ Don't say | ✅ Say instead |
|-------------|----------------|
| "Executing Step 2" | "Related to Step 2" |
| "Building Header.tsx" | "Working on Header.tsx" |
| "Step 2 complete" | (Only if we can verify) |

**Rule**: Use "Related to" / "From your plan" / "Part of" unless we have explicit confirmation from the build system.

### 2. Throttled UI Updates

- Maximum 4 context updates per second (coalesce rapid changes)
- Context region should feel stable, not flickering
- Batch file-to-step lookups

### 3. Default Collapsed

- Step details panel: **collapsed by default**
- File banner: visible but minimal (one line)
- Mobile: even more conservative

### 4. Graceful Degradation

**Show nothing rather than wrong information.**

| Situation | Response |
|-----------|----------|
| Plan data missing | Don't show context UI at all |
| File doesn't match any step | Don't show banner for that file |
| Multiple steps match | Show first match, or show nothing |
| Feature flag OFF | Render nothing |

**Never show**: "Unknown step", "Step ?", placeholder text

### 5. One-Line Banner Maximum

File context banner must be scannable in <1 second:

```
✅ Good: "📝 Related to: Set up payment form"
❌ Bad:  "📝 This file is part of Step 2 of 5 which involves setting up the payment form component with card validation..."
```

---

## Available Data (No Backend Changes Needed)

### From FeaturePlanResponse

```typescript
{
  summary: string,                    // "Build a payment integration with Stripe"
  plan: {
    overview: string,                 // "Technical approach using Stripe SDK..."
    steps: [{
      order: number,                  // 1, 2, 3...
      title: string,                  // "Set up payment form component"
      description: string,            // "Create a form that collects card details..."
      files: string[],                // ["src/components/PaymentForm.tsx", ...]
      estimatedEffort: string,        // "low" | "medium" | "high"
    }],
    dependencies: [{
      name: string,                   // "@stripe/stripe-js"
      reason: string,                 // "Required for secure payment processing"
    }],
    risks: string[],                  // ["PCI compliance considerations", ...]
  }
}
```

### From FixPlanResponse

```typescript
{
  issue: {
    description: string,              // "Login form doesn't validate email"
    severity: string,                 // "medium"
  },
  rootCause: string,                  // "Missing validation regex"
  solution: {
    approach: string,                 // "Add email validation with error feedback"
    changes: [{
      file: string,                   // "src/components/LoginForm.tsx"
      changeType: string,             // "modify"
      description: string,            // "Add email validation before submit"
    }],
    testingStrategy: string,          // "Test with valid/invalid emails"
  }
}
```

### Existing File-to-Step Matching

`src/utils/plan-files.ts` already extracts planned files with their step context:

```typescript
interface PlannedFile {
  path: string
  changeType: 'create' | 'modify' | 'delete' | 'unknown'
  description?: string    // ← Step description available
  stepTitle?: string      // ← Step title available
}
```

---

## UI Approaches Analysis

### Option A: Split View (Original Proposal)

```
┌─────────────────────────┬──────────────────────────┐
│ What I'm Building       │ Code                     │
├─────────────────────────┼──────────────────────────┤
│ Creating PaymentForm    │ export function Payment  │
│ with:                   │   Form() {               │
│ • Card input fields     │   return (               │
│ • Validation            │     <form>               │
│ • Submit handling       │       ...                │
└─────────────────────────┴──────────────────────────┘
```

**Pros**:
- Rich context always visible
- Clear connection between explanation and code

**Cons**:
- Takes 40-50% of horizontal space
- Poor mobile experience
- Requires managing sync between panels
- May feel cluttered for simple files

**Verdict**: ❌ Too heavy for most use cases

---

### Option B: File Header Context Banner

```
┌─────────────────────────────────────────────────────┐
│ 📝 Step 2 of 5: Set up payment form component       │
│ Creating a form that collects card details securely │
├─────────────────────────────────────────────────────┤
│ export function PaymentForm() {                     │
│   return (                                          │
│     <form>                                          │
│       ...                                           │
└─────────────────────────────────────────────────────┘
```

**Pros**:
- Minimal UI footprint
- Context visible but not intrusive
- Works on mobile
- Easy to implement

**Cons**:
- Only shows current file's context
- Less detail than split view

**Verdict**: ✅ Good for file-level context

---

### Option C: Step Progress Tracker (Build Progress Integration)

```
┌─────────────────────────────────────────────────────┐
│ 🏗️ Building Your App                    Step 2/5   │
├─────────────────────────────────────────────────────┤
│ ✓ Step 1: Initialize project structure             │
│ ▶ Step 2: Set up payment form component    ◉       │
│   "Creating a form that collects card details..."  │
│ ○ Step 3: Add Stripe integration                   │
│ ○ Step 4: Handle payment submission                │
│ ○ Step 5: Add success/error states                 │
└─────────────────────────────────────────────────────┘
```

**Pros**:
- Shows overall progress with context
- Users see what's done and what's coming
- Connects to existing progress UI
- Explains "why" at build level

**Cons**:
- Doesn't explain specific code being written
- More complex to implement

**Verdict**: ✅ Good for build-level context

---

### Option D: Contextual Tooltip on File Names

```
┌─────────────────────────────────────────────────────┐
│ ▼ src/                                              │
│   ├── components/                                   │
│   │   ├── PaymentForm.tsx ← [hover]                │
│   │   │   ┌──────────────────────────────────┐     │
│   │   │   │ Step 2: Set up payment form      │     │
│   │   │   │ Creates card input with validation│     │
│   │   │   └──────────────────────────────────┘     │
```

**Pros**:
- On-demand information
- No UI footprint until needed
- Non-intrusive

**Cons**:
- Requires user action (hover)
- Not visible during streaming
- Poor for touch devices

**Verdict**: ⚠️ Good as supplementary, not primary

---

### Option E: "What's Happening" Collapsed Panel

```
┌─────────────────────────────────────────────────────┐
│ ▼ What's happening now                              │
├─────────────────────────────────────────────────────┤
│ Step 2 of 5: Set up payment form component          │
│                                                     │
│ Creating a form that collects card details securely │
│ using Stripe Elements for PCI compliance.           │
│                                                     │
│ Files in this step:                                 │
│ • PaymentForm.tsx (creating)                        │
│ • payment-styles.css (creating)                     │
│                                                     │
│ Next: Add Stripe integration                        │
└─────────────────────────────────────────────────────┘
```

**Pros**:
- Detailed context when expanded
- Can be collapsed to save space
- Works on mobile
- Shows what's coming next

**Cons**:
- Users may not expand it
- Takes vertical space when expanded

**Verdict**: ✅ Good for detailed exploration

---

## Recommended Approach: Hybrid "Contextual Step Tracker"

Combine the best elements:

1. **Step Progress in Build Card** (Option C)
   - Show current step title in CleanBuildProgress
   - Show step description as the "current status"

2. **File Context Banner** (Option B)
   - Small banner above code viewer showing step context for active file
   - Only when file is part of known plan step

3. **Expandable Details** (Option E)
   - "Show details" link to see full step info
   - Lists all files in current step
   - Shows what's next

### Wireframe: Integrated View

```
┌─────────────────────────────────────────────────────────────┐
│ 🏗️ Building Your App                                  40%   │
│ ════════════════════════════════════════════               │
│                                                             │
│ 📋 From your plan: Set up payment form component            │
│   Creating a form that collects card details securely       │
│                                                             │
│ [Show step details ▼]                                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 📁 Files │ PaymentForm.tsx                                  │
├─────────────────────────────────────────────────────────────┤
│ 📝 Related to: Set up payment form                          │
├─────────────────────────────────────────────────────────────┤
│ import { CardElement } from '@stripe/react-stripe-js'       │
│                                                             │
│ export function PaymentForm() {                             │
│   ...                                                       │
└─────────────────────────────────────────────────────────────┘
```

**Note**: Language uses "From your plan" / "Related to" - never "Executing" or "Building".

---

## Implementation Plan

### Phase 0: Feature Flag Setup

**Goal**: Gate the entire feature behind a flag for easy rollback

**Tasks**:

1. **Add environment variable**
   ```bash
   # .env.local
   NEXT_PUBLIC_ENABLE_PLAN_CONTEXT=true
   ```

2. **Create feature flag check utility**
   ```typescript
   // src/utils/feature-flags.ts
   export const isPlanContextEnabled = () =>
     process.env.NEXT_PUBLIC_ENABLE_PLAN_CONTEXT === 'true'
   ```

3. **Wrap all new components with flag check**
   ```tsx
   {isPlanContextEnabled() && <PlanContextBanner ... />}
   ```

**Files to modify**:
- `.env.example` - Document new flag
- `src/utils/feature-flags.ts` - Add flag (or create file)

---

### Phase 1: Plan Context Store (Foundation)

**Goal**: Cache and expose plan data during build execution, with refresh resilience

**Tasks**:

1. **Create `usePlanContext` hook**
   ```typescript
   interface PlanContext {
     plan: FeaturePlanResponse | FixPlanResponse | null
     getStepForFile(path: string): PlanStep | null
     isEnabled: boolean // respects feature flag
   }
   ```

2. **Implement sessionStorage persistence**
   - On `convertToBuild`: store `{ buildId, plan, plannedFilesMap, storedAt }`
   - On mount: restore from storage if within TTL (30 min)
   - Survives page refresh mid-build

3. **File-to-step matching with normalization**
   - Use existing `extractPlannedFiles()` logic
   - Create normalized lookup map: `normalizePath(filePath) → PlannedFile`
   - Handle path variations (slashes, casing, prefixes)

4. **Graceful null handling**
   - If plan not available: return null, components render nothing
   - If file not in map: return null, banner doesn't show

**Files to create/modify**:
- `src/hooks/use-plan-context.ts` - New hook
- `src/components/builder/builder-chat-interface.tsx` - Cache plan on conversion

---

### Phase 2: Step Progress in Build Card

**Goal**: Show which plan step relates to current activity in CleanBuildProgress

**Tasks**:

1. **Add step context to CleanBuildProgress**
   - Consume `usePlanContext` hook
   - Display: "📋 From your plan: {step.title}"
   - Show step description as subtitle (one line max)
   - **Language**: "From your plan" / "Related to" (never "Executing")

2. **Throttle context updates**
   - Max 4 updates per second
   - Coalesce rapid file changes to prevent flicker

3. **Graceful absence**
   - If no plan context: don't show step section at all
   - If current file doesn't match: show generic "Working on your build"

**Files to modify**:
- `src/components/builder/clean-build-progress.tsx`

---

### Phase 3: File Context Banner

**Goal**: Show which plan step relates to the current file

**Tasks**:

1. **Create `FileContextBanner` component**
   ```tsx
   <FileContextBanner
     filePath={activeFile}
     planContext={planContext}
   />
   // Shows: "📝 Related to: Set up payment form"
   // Shows: nothing if file not in plan
   ```

2. **One-line constraint**
   - Maximum one line of text
   - Truncate step title if needed
   - No multi-line descriptions in banner

3. **Integrate into code viewer**
   - Show above code content for active file
   - **Only display if file matches a plan step**
   - If no match: render nothing (not "Unknown")

4. **Style considerations**
   - Subtle background, not attention-grabbing
   - Same visual weight as file tabs
   - Consistent with existing UI

**Files to create/modify**:
- `src/components/builder/code-viewer/file-context-banner.tsx` - New
- `src/components/builder/code-viewer/code-display-panel.tsx` - Integrate banner

---

### Phase 4: Expandable Step Details

**Goal**: Allow users to dive deeper into current step

**Tasks**:

1. **Create `StepDetailsPanel` component**
   - Full step description
   - List of files in this step (with status)
   - What's next preview
   - Dependencies being added (if any)

2. **Toggle in CleanBuildProgress**
   - "Show step details" / "Hide details"
   - Animated expand/collapse

3. **Mobile considerations**
   - Full-width panel on mobile
   - Touch-friendly toggle

**Files to create/modify**:
- `src/components/builder/step-details-panel.tsx` - New
- `src/components/builder/clean-build-progress.tsx` - Add toggle

---

## Technical Considerations

### Refresh/Reconnect Storage Strategy

**Problem**: If user reloads mid-build or opens build from history, plan context is lost (only cached client-side during `convertToBuild`).

**Solution**: Persist plan context to sessionStorage with TTL.

```typescript
interface StoredPlanContext {
  buildId: string
  plan: FeaturePlanResponse | FixPlanResponse
  plannedFilesMap: Record<string, PlannedFile>
  storedAt: number // timestamp for TTL
}

// On convertToBuild:
sessionStorage.setItem(
  `plan-context:${buildId}`,
  JSON.stringify({ buildId, plan, plannedFilesMap, storedAt: Date.now() })
)

// On component mount (or reconnect):
const stored = sessionStorage.getItem(`plan-context:${buildId}`)
if (stored) {
  const parsed = JSON.parse(stored)
  const TTL_MS = 30 * 60 * 1000 // 30 minutes
  if (Date.now() - parsed.storedAt < TTL_MS) {
    // Restore context
  }
}
```

**TTL**: 30 minutes (longer than any reasonable build, auto-cleanup)

---

### Step-to-Progress Correlation

**Challenge**: Build events have `phase` (setup, development, dependencies, build, deploy) but not `stepIndex`.

**Solutions**:

1. **Heuristic mapping** (No backend changes):
   - Map phases to plan steps roughly
   - development phase → most file-related steps
   - dependencies phase → dependency installation step
   - Not perfect but provides value

2. **File-based tracking** (Preferred):
   - When a file starts streaming, look up its step
   - Mark that step as "in progress"
   - More accurate than phase-based

3. **Backend enhancement** (Future):
   - Tag build events with `stepIndex`
   - Most accurate but requires backend work

**Recommendation**: Start with file-based tracking (option 2) - it uses data we already have.

---

### Path Normalization

**Problem**: File paths from build events may differ slightly from plan paths (slashes, casing, root prefixes).

**Solution**: Normalize paths before lookup:

```typescript
function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')           // Backslash to forward slash
    .replace(/^\.\//, '')          // Remove leading ./
    .replace(/^\//, '')            // Remove leading /
    .toLowerCase()                 // Case-insensitive (optional, depends on OS)
}
```

---

### Mobile Experience

**Considerations**:
- File context banner should be collapsible
- Step details should be a bottom sheet on mobile
- Progress indicator should be compact
- Touch targets must be adequate size (44px min)

---

### Performance

**Considerations**:
- Plan data is small (typically <10KB) - caching is cheap
- File-to-step lookup should be O(1) via Map
- Avoid re-rendering entire code viewer when step changes
- Use memoization for derived state

---

## Metrics to Track

### Primary (Flag ON vs OFF comparison)

| Metric | Description | Success Signal |
|--------|-------------|----------------|
| Cancel rate during generation | Users who cancel/navigate away | Decrease |
| "Confusing" support signals | Feedback mentioning confusion | Decrease |
| Build completion rate | % of started builds that complete | Stable or increase |

### Secondary

| Metric | Description | Interpretation |
|--------|-------------|----------------|
| Detail expansion rate | % of users who expand step details | Modest is good; too high = default context insufficient |
| Context visibility | % of builds where context is shown | >80% (depends on plan data availability) |
| Time to first interaction | After build completes | Track baseline |

### Quick Pulse (Optional)

In-product 1-click feedback after build:
- "Was the build progress clear?" (👍 / 👎)
- Low-friction, high signal

---

## Dependencies

### Requires
- Existing `extractPlannedFiles()` utility
- Existing `FeaturePlanResponse` / `FixPlanResponse` types
- Existing `CleanBuildProgress` component
- Existing code viewer infrastructure

### Does NOT Require
- Backend changes (Phase 1-4)
- New SSE event types
- Database schema changes
- API modifications

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Plan data not cached | Low | High | sessionStorage persistence + null checks |
| File-step mismatch | Medium | Low | **Show nothing** (not "Unknown step") |
| UI clutter | Medium | Medium | Collapsed by default, one-line banner |
| Mobile layout issues | Medium | Medium | Responsive design from start |
| Performance regression | Low | Medium | Memoization, throttled updates |
| User feels "gaslit" | Medium | High | Truthful language ("Related to" not "Executing") |
| Page refresh loses context | Medium | Medium | sessionStorage with 30min TTL |

---

## Out of Scope (Future Considerations)

1. **Real-time code explanations** - Would require Claude to emit explanations during generation
2. **Interactive code annotations** - Hover tooltips explaining specific code blocks
3. **Video/animation of changes** - Showing before/after diffs animated
4. **Voice narration** - Audio explanation of what's being built

These could be Phase 2 of this feature if Phase 1 shows value.

---

## Success Criteria

1. **Users can see which plan step relates to current activity** during build
2. **Each file shows its context** (if it matches a plan step)
3. **No backend changes required** for Phase 0-4
4. **Works on mobile** without degraded experience
5. **Respects prefers-reduced-motion** for animations
6. **Graceful degradation**: shows nothing when data unavailable (not errors/placeholders)
7. **Truthful language**: never claims certainty we don't have
8. **Feature flag**: easy kill switch if issues arise
9. **Refresh resilient**: context survives page reload via sessionStorage

---

## Timeline Estimate

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 0: Feature Flag Setup | 30 min | None |
| Phase 1: Plan Context Store | 2-3 hours | Phase 0 |
| Phase 2: Step Progress in Build Card | 2-3 hours | Phase 1 |
| Phase 3: File Context Banner | 2-3 hours | Phase 1 |
| Phase 4: Expandable Step Details | 3-4 hours | Phase 1, 2 |
| Testing & Polish | 2-3 hours | All phases |

**Total**: ~12-16 hours of development work

---

## Decision Record

| Question | Decision | Rationale |
|----------|----------|-----------|
| Split view vs integrated? | Integrated | Less intrusive, works on mobile |
| Backend changes? | None initially | Can ship value faster with existing data |
| File-step matching? | Use extractPlannedFiles | Already implemented, accurate |
| Expandable by default? | Collapsed | Less UI noise, on-demand detail |
| Mobile approach? | Responsive + bottom sheet | Native feel on mobile |
| Feature flag? | Single env var, default ON | Simple kill switch, avoid over-engineering |
| Gradual rollout? | Not initially | Can add later if needed |
| Language style? | "Related to" not "Executing" | Truthful, avoids gaslighting users |
| Missing data handling? | Show nothing | Better than wrong info or "Unknown" |
| Refresh handling? | sessionStorage with TTL | Survives reload, auto-cleanup |

---

## Code Review Fixes (Expert Feedback)

### Fix 1: ConvertToBuildDialog - Time Unit Bug + Safety ✅
**Issue**: `plan.estimated_time_minutes * 2` was not proper minutes→seconds conversion
**Fix**:
- Changed to `plan.estimated_time_minutes * 60` for proper conversion
- Added `DEFAULT_SECONDS_MULTIPLIER = 1.2` for AI processing overhead
- Added `safeBalance = Math.max(0, userBalance)` to prevent negative values
- Added `progressValue` calculation with divide-by-zero protection

### Fix 2: ConvertToBuildDialog - Add Credits Handler ✅
**Issue**: "Add Credits" button had no onClick handler
**Fix**: Added `onAddCredits?: () => void` prop to interface and wired to button

### Fix 3: ConvertToBuildDialog - Fragile stepCount Access ✅
**Issue**: `plan.steps.length` could crash if plan has `plan.plan.steps` structure
**Fix**: Robust access: `plan.steps ?? plan.plan?.steps ?? []`

### Fix 4: FileTreeNode - TypeScript Compile Risk ✅
**Issue**: `React.KeyboardEvent` could fail if React isn't in scope as namespace
**Fix**: Import `KeyboardEvent` directly from 'react', use `KeyboardEvent<HTMLDivElement>`

### Fix 5: BuildProgressStrip - Code Cleanup ✅
**Issues**:
- `useCallback` imported but unused
- `streaming` variable shadowed outer store value
- `completed` count could exceed `total`

**Fixes**:
- Removed unused `useCallback` import
- Renamed inner `streaming` to `streamingCount`
- Added `Math.min(completedRaw, total)` clamp

### Not Fixed: Console.log Cleanup
**Issue**: Debug logs in BuilderChatInterface (pre-existing, not introduced by Plan Context)
**Decision**: Left as-is since not part of this feature. Recommend future cleanup with devLog helper.

---

## Backend Worker Code Generation Fixes (Expert Feedback)

### Location: `sheenapps-claude-worker/src/services/`

#### Fix 1: next.config.js ESM/CJS Module Format ✅
**File**: `codeGenerationService.ts`
**Issue**: Generated `next.config.js` used `export default nextConfig;` (ESM) but package.json is CommonJS
**Fix**: Changed to `module.exports = nextConfig;` (CommonJS format)

#### Fix 2: Missing next-env.d.ts Generation ✅
**File**: `codeGenerationService.ts`
**Issue**: tsconfig.json includes `next-env.d.ts` but file wasn't generated
**Fix**: Added `generateNextEnvDts()` method and file generation in `generateInfrastructure()`

#### Fix 3: Safe Metadata String Escaping ✅
**Files**: `codeGenerationService.ts`, `enhancedCodeGenerationService.ts`
**Issue**: Unsafe string interpolation for metadata (`title: '${metaTitle}'`) could break with quotes/newlines
**Fix**: Added `tsString()` helper that escapes:
- Single quotes (`'` → `\'`)
- Backslashes (`\` → `\\`)
- Newlines, carriage returns, tabs
- Template literal interpolations (`${` → `\${`)

#### Fix 4: Hyphenated Route Component Names ✅
**Files**: `codeGenerationService.ts`, `enhancedCodeGenerationService.ts`
**Issue**: `/about-us` → `About-usPage` (incorrect)
**Fix**: Split by hyphen and capitalize each word: `/about-us` → `AboutUsPage`

#### Fix 5: Shared Components Use Import Specs ✅
**File**: `enhancedCodeGenerationService.ts`
**Issue**: Passed just filenames (`['Button.tsx']`) instead of import specs
**Fix**: Added `ComponentImportSpec` interface with `type`, `importPath`, `filename`. Prompt now shows:
```
- Button: import Button from '@/components/Button'
```

#### Fix 6: Compile Loop Optimization ✅
**File**: `enhancedCodeGenerationService.ts`
**Issues**:
- Ran `npx tsc` for each component (slow)
- No dependency installation before TypeScript check
**Fixes**:
- Added `ensureDepsInstalled()` that runs `npm install` once per project
- Use local `./node_modules/.bin/tsc` instead of `npx tsc` (faster)

#### Fix 7: TypeScript Error Parser Both Formats ✅
**File**: `enhancedCodeGenerationService.ts`
**Issue**: Only parsed Windows format `filename(line,column): error TS####`
**Fix**: Added Unix format support: `filename:line:column - error TS####`

#### Fix 8: Component Cache Implementation ✅
**File**: `enhancedCodeGenerationService.ts`
**Issue**: `cache: Map<string, GeneratedComponent>` declared but never used
**Fix**: Added cache key by component signature (hash of type + design system), with `getCachedComponent()` and `cacheComponent()` methods

#### Fix 9: Relevant Errors Path Matching ✅
**File**: `enhancedCodeGenerationService.ts`
**Issue**: `errors.filter(e => e.file.includes(filename))` gives false positives with absolute paths
**Fix**: Use `path.basename()` comparison for accurate matching

---

## Expert Code Review Round 12 (Frontend)

### Fix 1: Plan Streaming Upsert Pattern ✅
**File**: `builder-chat-interface.tsx`
**Issue**: Plan messages were "append-only" - streaming updates (content growth, late metadata enrichment) were dropped
**Fix**: Changed from `seenHookMessageIdsRef.has(id) ? continue` to upsert pattern:
- If message ID not seen: add it
- If message ID exists: update in place (preserving local UI state like `isTyping`)

### Fix 2: Wire Add Credits to ConvertToBuildDialog ✅
**File**: `builder-chat-interface.tsx`
**Issue**: `onAddCredits` prop was in interface but never passed - users hit dead end at monetization moment
**Fix**: Added `onAddCredits` handler that:
- Closes the dialog
- Calculates estimated cost from plan
- Opens credits modal with context

### Fix 3: Remove Debug Console Spam ✅
**File**: `builder-chat-interface.tsx`
**Issue**: Production console.log calls for balance debugging hurting performance
**Fix**: Removed the debug useEffect entirely (simpler than conditional gating)

### Fix 4: BuildProgressStrip 0/0 Edge Case ✅
**File**: `build-progress-strip.tsx`
**Issue**: When `plannedFileCount` undefined and `fileOrder.length` is 0 early, clamp logic made `completed=0` even if files streaming
**Fix**:
- Added `totalKnown` flag to track if total is actually known
- Only clamp if `total > 0` (don't clamp to 0 early)
- Show "(X)" instead of "(X/0)" when total unknown

### Fix 5: PlanBuildHandshake NaN Protection ✅
**File**: `plan-build-handshake.tsx`
**Issue**: Division by zero in progress calculation could show NaN% if `summary.total` was 0 due to upstream bug
**Fix**: Added defensive clamp: `Math.max(0, Math.min(100, pct))` and explicit `summary.total > 0` guards

---

## Expert Code Review Round 13 (Backend Worker)

### Fix 1: Missing `}` in generateNextEnvDts ✅ CRITICAL
**File**: `codeGenerationService.ts`
**Issue**: Function was missing closing brace - hard build break
**Fix**: Added missing `}`

### Fix 2: Path Traversal Security ✅ CRITICAL
**File**: `enhancedCodeGenerationService.ts`
**Issue**: Model-controlled filenames could write outside project (e.g., `../../../../etc/passwd`)
**Fixes**:
- Added `sanitizeRelPath()` - rejects absolute paths, embedded `..`, etc.
- Added `safeJoin()` - ensures result stays within baseDir
- Derive safe filename from component type (don't trust Claude's filename)

### Fix 3: Windows tsc Path Compatibility ✅
**File**: `enhancedCodeGenerationService.ts`
**Issue**: `./node_modules/.bin/tsc` fails on Windows (needs `.cmd`)
**Fix**: Platform-aware path selection (Note: server is Linux but helps local dev)

### Fix 4: Concurrency Guard for npm install ✅
**File**: `enhancedCodeGenerationService.ts`
**Issue**: Parallel jobs on same projectPath could corrupt npm install
**Fix**: Added `installLocks` Map to serialize installs per path

### Fix 5: Remove Unused Imports ✅
**File**: `codeGenerationService.ts`
**Issue**: `fs/promises` and `path` imports never used
**Fix**: Removed them

---

## Expert Code Review Round 14 (Frontend)

### Fix 1: Gate usePostBuildRecommendations Hook ✅
**File**: `clean-build-progress.tsx`
**Issue**: Hook was running and making API calls even though UI was disabled with `{false && ...}`
**Fix**: Added `SHOW_RECOMMENDATIONS_PANEL` flag to conditionally call hook:
```typescript
const SHOW_RECOMMENDATIONS_PANEL = false
const { recommendations, ... } = SHOW_RECOMMENDATIONS_PANEL
  ? usePostBuildRecommendations(...)
  : { recommendations: null, hasRecommendations: false, isLoading: false }
```

### Fix 2: Remove Unused Imports ✅
**Files**: `plan-build-handshake.tsx`, `code-display-panel.tsx`
**Issue**: Unused imports left in code (drifting architecture signal)
**Fixes**:
- Removed `getFileName` from plan-build-handshake.tsx
- Removed `Keyboard` and `KEYBOARD_SHORTCUTS` from code-display-panel.tsx

### Fix 3: Rename totalKnown to canShowFraction ✅
**File**: `build-progress-strip.tsx`
**Issue**: `totalKnown` was unclear - it tracks whether we can display "X/Y" format
**Fix**: Renamed to `canShowFraction` for clarity about its actual purpose

---

## Expert Code Review Round 15 (Backend Worker)

### Fix 1: Remove next-env.d.ts from Generated .gitignore ✅
**File**: `codeGenerationService.ts`
**Issue**: Generated `.gitignore` ignored `next-env.d.ts`, but we also generate that file. TypeScript/CI often assume it exists.
**Fix**: Removed `next-env.d.ts` from the generated `.gitignore` content.

### Fix 2: Standardize Claude Prompt Format ✅
**File**: `enhancedCodeGenerationService.ts`
**Issue**: System prompt said "Return an array" but showed object format `{ "components": [...] }`. User prompt said "Return JSON array". Parser handled both, but inconsistency could confuse Claude.
**Fix**: Standardized both prompts on object format `{ "components": [...] }`. Simplified parser to expect this format.

### Fix 3: Sanitize Component Type for Filenames ✅
**File**: `enhancedCodeGenerationService.ts`
**Issue**: `componentData.type` from Claude was used directly in filenames. If Claude outputs `type: "Button/evil"`, it would create nested paths.
**Fix**: Added `toSafeTypeName()` that:
- Allows only letters, numbers, underscore
- Must start with letter/underscore
- Also validates type is one of the requested shared types (prevents junk output)

### Fix 4: Pass Real DesignSystem to Fallback Templates ✅
**File**: `enhancedCodeGenerationService.ts`
**Issue**: `generateWithRepair` fallback used hardcoded design system colors instead of the plan's actual design system.
**Fix**: Added `designSystem: DesignSystem` parameter to `generateWithRepair`. All callers now pass `plan.designSystem`.

### Fix 5: Remove Unused filePath Parameter ✅
**File**: `enhancedCodeGenerationService.ts`
**Issue**: `checkTypeScript(projectPath, filePath)` had unused `filePath` parameter - misleading API.
**Fix**: Removed the parameter. Function now just takes `projectPath`.

### Fix 6: Add cleanRoute Helper ✅
**Files**: `codeGenerationService.ts`, `enhancedCodeGenerationService.ts`
**Issue**: If a route like `/about?x=y#section` leaked through, `routeToFilePath` would create invalid paths like `app/about?x=y/page.tsx`.
**Fix**: Added `cleanRoute()` helper that strips query strings and hash fragments. Both `routeToFilePath` and `routeToComponentName` now use it.

---

## Expert Code Review Round 16 (Frontend)

### Fix 1: Conditional Hook Call Violates Rules of Hooks ✅ CRITICAL
**Files**: `clean-build-progress.tsx`, `use-project-recommendations.ts`
**Issue**: The previous fix used a conditional hook call:
```typescript
const result = SHOW_RECOMMENDATIONS_PANEL
  ? usePostBuildRecommendations(...)
  : { static values }
```
This violates React Rules of Hooks. Even though the flag is constant, the pattern is illegal.
**Fix**:
- Added optional `enabled` parameter to `usePostBuildRecommendations`
- Hook is now always called, but with `enabled: false` it skips the actual fetch
- Maintains consistent hook call order

### Fix 2: Optimize BuildProgressStrip Double Object.values Scan ✅
**File**: `build-progress-strip.tsx`
**Issue**: Called `Object.values(filesByPath)` twice during streaming, scanning the array twice.
**Fix**: Single `for...of` loop through files array, counting `streamingCount` and `completedRaw` in one pass.
**Also**: Removed `idle` from completed count - clarified that only `modified` and `new` mean "done".

### Fix 3: Add projectId to Welcome Message ID ✅
**File**: `builder-chat-interface.tsx`
**Issue**: `id: 'welcome-message'` could collide if multiple builders render or messages persist across projects.
**Fix**: Changed to `id: \`welcome:${projectId}\`` for project-scoped uniqueness.

---

## Expert Code Review Round 17 (Frontend - Cleanup Items)

### Fix 1: Remove Unused seenHookMessageIdsRef ✅
**File**: `builder-chat-interface.tsx`
**Issue**: With the upsert pattern using `findIndex`, the `seenHookMessageIdsRef` was being populated but never used for lookup. It was dead weight - just growing and being capped.
**Fix**: Removed the ref, the `.add()` call, and the capping logic. The `findIndex` check is sufficient.

### Fix 2: Invert Progress Bar for Better UX ✅
**File**: `convert-to-build-dialog.tsx`
**Issue**: Progress bar showed "% of balance consumed". If you had lots of credits, the bar was small (looked like "low progress" even though you're in good shape).
**Fix**: Inverted to show "% of balance remaining". Now `progressValue = 100 - usagePct`. A fuller bar = more safety, which is more intuitive.
**Follow-up fix**: Also changed insufficient balance fallback from `100` to `0` - with inverted logic, empty bar correctly shows "0% remaining".

### Fix 3: Add Toast for Clipboard Failure ✅
**File**: `code-display-panel.tsx`
**Issue**: `navigator.clipboard` fails on non-HTTPS or in some browsers. We silently logged to console, leaving users confused.
**Fix**: Import `toast` from sonner. Show user-friendly error with suggestion: "Try selecting the code and using Ctrl+C / Cmd+C".

### Fix 4: Show BuildProgressStrip Earlier ✅
**File**: `build-progress-strip.tsx`
**Issue**: Render condition `!streaming.isActive && completed === 0` hid the strip when files were planned but streaming hadn't started yet.
**Fix**: Added `plannedFileCount > 0` to the show conditions. Now the strip appears as soon as a plan is converted, before the first file starts streaming.

---

## Implementation Progress

### Phase 0: Feature Flag Setup ✅
- Added `ENABLE_PLAN_CONTEXT` to `src/config/feature-flags.ts` (defaults ON)
- Added documentation to `.env.example`

### Phase 1: Plan Context Store ✅
- Created `src/hooks/use-plan-context.ts`
  - SessionStorage persistence with 30-min TTL
  - File-to-step lookup with path normalization
  - Graceful null handling
- Modified `src/components/builder/builder-chat-interface.tsx`
  - Calls `storePlanContext()` in onSuccess callback after buildId is available

### Phase 2: Step Progress in Build Card ✅
- Modified `src/components/builder/clean-build-progress.tsx`
  - Added `usePlanContext` hook
  - Uses `useCodeViewerStore` to get current streaming file
  - Shows "From your plan: {step.title}" banner during generation
  - Truthful language per design constraint

### Phase 3: File Context Banner ✅
- Created `src/components/builder/code-viewer/file-context-banner.tsx`
  - One-line banner showing related plan step
  - Graceful degradation (shows nothing if no match)
  - Subtle styling matching existing UI
- Modified `src/components/builder/code-viewer/code-display-panel.tsx`
  - Integrated FileContextBanner between FileTabs and Content

### Phase 4: Expandable Step Details ✅
- Created `src/components/builder/step-details-panel.tsx`
  - Collapsed by default
  - Shows full step description, files list with completion status
  - "What's next" preview
- Modified `src/components/builder/clean-build-progress.tsx`
  - Integrated StepDetailsPanel

---

## Implementation Discoveries

### Discovery 1: Build Events Don't Contain File Paths
**Issue**: Initially tried to extract file paths from `CleanBuildEvent` to determine current step.
**Finding**: CleanBuildEvent only has high-level event types (started, progress, completed, failed) - no file-level information.
**Solution**: Use `useCodeViewerStore` to get `streaming.currentFile` or `activeFile` instead.

### Discovery 2: Code Viewer Uses Polling, Not SSE
**Finding**: The code viewer uses React Query polling via `use-code-files.ts`, not SSE streaming. The `use-code-stream.ts` file is deprecated.
**Impact**: This means the "current file" updates are already throttled by the polling interval, reducing UI thrash concerns.

### Discovery 3: Plan Storage Timing
**Issue**: Needed to store plan context keyed by buildId, but buildId only becomes available after conversion API success.
**Finding**: The onSuccess callback in useBuildConversion has access to both result.buildId and planToConvert (from component state).
**Solution**: Store plan context in onSuccess callback, which runs before files start streaming.

---

## Potential Improvements

### 1. Throttle Context Updates
Currently, context updates happen whenever the streaming file changes. Consider adding debounce/throttle to limit updates to max 4/sec as per design constraint.

### 2. Step Progress Indicator
Could add visual progress dots showing completed/current/pending steps (similar to wizard UI). Currently just shows current step title.

### 3. Mobile Optimization
- StepDetailsPanel could use a bottom sheet on mobile
- FileContextBanner could be collapsible on small screens

### 4. Metrics Integration
Add tracking for:
- Cancel rate comparison (feature ON vs OFF)
- Detail expansion rate
- Context visibility rate

---

*Document created: January 2026*
*Last updated: January 2026*
*Status: IMPLEMENTED - All phases complete*
