# UX Analysis: Reducing Perceived Wait Time During AI Code Generation

## Executive Summary

Users experience a natural waiting period while the AI generates their website. This analysis examines the current implementation and provides recommendations to improve perceived performance through **stability, data-driven feedback, and progressive disclosure** - not more animations.

**Core philosophy**: Make it calm, inevitable, and slightly magical. The universe is chaotic; your generator UI shouldn't be.

---

## Current State Analysis

### What's Already Implemented

| Feature | Status | Location |
|---------|--------|----------|
| SSE Streaming | ✅ Complete | `buildStream.ts`, `stream-controller.ts` |
| Code Viewer | ✅ Complete | `generated-code-viewer.tsx` |
| Streaming Cursor | ✅ Complete | Shows cursor position in real-time |
| File Tree Updates | ✅ Complete | Files appear as they're created |
| Progress Phases | ✅ Complete | `streaming-status.tsx` (4 phases) |
| Rotating Messages | ✅ Complete | Tips rotate every 3-5 seconds |
| Elapsed Time Counter | ✅ Complete | Shows XX:XX format |
| Long Wait Warning | ✅ Complete | Appears after 20+ seconds |
| Cancel Button | ✅ Complete | Appears after 5 seconds |

### Current Flow Analysis

```
User Submits Prompt
       ↓
[Chat Plan Processing] ← User sees: Streaming status with phases
       ↓
[Plan to Build Conversion] ← GAP: Jarring transition
       ↓
[Code Generation] ← User sees: Code viewer with streaming
       ↓
[Build Complete]
```

### Identified Gaps

1. **Jarring Plan→Build Transition**: No bridge between "plan complete" and "generating"
2. **Code Viewer Not Immediately Visible**: May require user action to see streaming
3. **No Skeleton Preview**: User doesn't know what files will be generated
4. **Code Stream Lacks Context**: Raw code without explanation feels chaotic
5. **Progress Feels Abstract**: Phases don't map to concrete milestones

---

## Critical Principle: Avoid UI Thrash

**This is the most important consideration.**

Adding more moving parts (phases, events, animations) can backfire if it causes:
- Layout shifts
- Auto-scroll fights
- "Status spam"
- Visual chaos that increases anxiety

### Key Definitions

**Proof-of-work** = `file_manifest` event OR first file node in tree OR first code chunk (whichever happens first). This is the moment users know "something real is happening."

### Three Rules for Perceived Performance

1. **Never steal scroll unless user has been idle for ~1.5-2 seconds**
   - Track `lastUserInteractionAt` timestamp, not a permanent flag
   - One early scroll shouldn't permanently disable auto-expand

2. **Prefer stable regions over constantly updating everywhere**

3. **Coalesce UI updates to max 4 updates/sec**
   - Prevents jitter and layout churn from rapid SSE events
   - Batch visual changes, don't render every chunk immediately

Users hate having control taken away more than they hate waiting.

---

## Psychology of Wait Time

### Key Principles

| Principle | Application |
|-----------|-------------|
| **Uncertainty > Time** | People hate not knowing more than waiting |
| **Proof of Work** | Show concrete evidence something is happening |
| **Stable Progress** | Predictable updates beat flashy animations |
| **Control Preservation** | Never yank the UI away from users |

### Wait Time Tolerance

- **0-2 seconds**: Immediate response expected
- **2-10 seconds**: Acceptable with feedback
- **10-30 seconds**: Requires proof-of-work visibility
- **30+ seconds**: Need milestone feedback + control options

---

## Recommendations

### Phase 1: Reduce Anxiety (Quick Wins)

#### 1.1 File Manifest Preview (Skeleton Tree)

**Priority: HIGHEST** - This is the highest "trust per line of code."

**Problem**: User doesn't know what will be generated - mystery breeds anxiety.

**Solution**: Send planned file structure at generation start, show as skeleton.

```
┌─────────────────────────────────────────┐
│ Generating 18 files...            3/18  │
├─────────────────────────────────────────┤
│ ▼ src/                                  │
│   ├── components/                       │
│   │   ├── ◌ Header.tsx      (pending)  │
│   │   ├── ● Sidebar.tsx     (writing)  │
│   │   └── ◌ Footer.tsx      (pending)  │
│   ├── pages/                            │
│   │   └── ◌ index.tsx       (pending)  │
│   └── styles/                           │
│       └── ✓ globals.css     (done)     │
└─────────────────────────────────────────┘
```

**Backend Implementation**:

```typescript
// New SSE event - sent FIRST before any file_start
interface FileManifestEvent {
  event: 'file_manifest';
  data: {
    totalFiles: number;
    plannedFiles: Array<{
      path: string;
      description?: string; // Optional: "Main navigation component"
    }>;
  };
}
```

**Why it works**: Turns mystery into inevitability. "It's coming; I can see the shape."

---

#### 1.2 Plan→Build Handshake Bridge

**Problem**: Transition from plan completion to build start is jarring.

**Solution**: Create a satisfying micro-moment that connects plan to action.

**Event boundaries**:
- **Triggered on**: `plan_complete` event (or equivalent chat plan completion)
- **Displayed until**: `file_manifest` event OR first `file_start` event (whichever comes first)

When plan ends, show:

```
┌─────────────────────────────────────────┐
│ ✓ Plan locked                           │
│                                         │
│ Generating files from plan...           │
│                                         │
│ ◌ src/components/Header.tsx             │
│ ◌ src/components/Sidebar.tsx            │
│ ◌ src/pages/index.tsx                   │
│   (showing first 3 of 18 files)         │
└─────────────────────────────────────────┘
```

**Why it works**: Tells the user "the plan wasn't just text; it's now driving actions."

---

#### 1.3 Auto-Show Code Viewer (Without Hijacking)

**Problem**: Code viewer may not be visible when generation begins.

**Wrong approach**: Force scroll to code viewer (steals control, causes rage).

**Right approach**: "Peek + Pin" pattern with timestamp-based interaction tracking.

```typescript
const IDLE_THRESHOLD_MS = 1500; // Auto-expand if idle for 1.5s

// Track WHEN user last interacted (not just IF)
const lastInteractionRef = useRef<number>(Date.now());

useEffect(() => {
  const markInteraction = () => {
    lastInteractionRef.current = Date.now();
  };

  window.addEventListener('wheel', markInteraction, { passive: true });
  window.addEventListener('touchstart', markInteraction, { passive: true });
  window.addEventListener('keydown', markInteraction);

  return () => {
    window.removeEventListener('wheel', markInteraction);
    window.removeEventListener('touchstart', markInteraction);
    window.removeEventListener('keydown', markInteraction);
  };
}, []);

useEffect(() => {
  if (!isStreamingBuild) return;

  // Always show the code viewer (collapsed state)
  setCodeViewerVisible(true);

  // Only auto-expand if user has been idle for threshold
  const timer = setTimeout(() => {
    const timeSinceInteraction = Date.now() - lastInteractionRef.current;
    if (timeSinceInteraction >= IDLE_THRESHOLD_MS) {
      setCodeViewerExpanded(true);
    }
  }, IDLE_THRESHOLD_MS);

  return () => clearTimeout(timer);
}, [isStreamingBuild]);
```

**UI Pattern**:

1. When build starts: Show compact pinned progress strip (always visible)
2. Show code viewer in collapsed state: `"Generating files... (3/18) ▸ Expand"`
3. If user hasn't scrolled/touched in ~1.2s: Gently expand
4. If user is actively reading: Stay collapsed, let them expand manually

**Why it works**: "Assist, don't hijack."

---

#### 1.4 Data-Driven Micro-Status (Not Fortune Cookies)

**Problem**: More phases ≠ better. Fake phases feel like fortune cookies.

**Current**: 4 phases (understanding → analyzing → searching → generating)

**Better approach**: Keep 4-6 durable phases, but add **data-driven micro-status**:

```
┌─────────────────────────────────────────┐
│ ⚡ Generating code                      │
│                                         │
│ Files: 3/18 complete                    │
│ Current: src/components/Sidebar.tsx     │
│                                         │
│ ████████████████░░░░░░░░░░░░ 42%       │
└─────────────────────────────────────────┘
```

**What to show**:
- `Files generated: 3/18` (concrete number)
- `Current file: Header.tsx` (specific name)
- `Installing deps` / `Running checks` (only when actually happening)

**What NOT to do**:
- 8 vague phases that don't map to real backend events
- Rotating "inspirational" messages every 3 seconds
- Progress bar that doesn't correlate to actual progress

**Why it works**: Data you can verify > words you have to trust.

---

### Phase 2: Make It Meaningful

#### 2.1 Split View: Explanation + Code

**Problem**: Raw code streaming feels meaningless to non-developers.

**Solution**: Show AI's explanation alongside code.

```
┌────────────────────────────┬─────────────────────────────┐
│ What I'm Building          │ Code                        │
├────────────────────────────┼─────────────────────────────┤
│ Creating your Header       │ export function Header() {  │
│ component with:            │   return (                  │
│                            │     <header className="...">│
│ • Responsive navigation    │       <nav>                 │
│ • Dark mode toggle         │         <ThemeToggle />     │
│ • Mobile menu              │         <MobileMenu />      │
│                            │       </nav>                │
│ Next: Sidebar component    │     </header>               │
│                            │   );                        │
└────────────────────────────┴─────────────────────────────┘
```

**Implementation**: Backend streams explanation as separate event type:

```typescript
interface FileExplanationEvent {
  event: 'file_explanation';
  data: {
    path: string;
    summary: string;      // "Header component with responsive nav"
    features: string[];   // ["Dark mode toggle", "Mobile menu"]
    nextFile?: string;    // Preview of what's coming
  };
}
```

**Why it works**: Bridges technical and non-technical users. Reduces "random code chaos."

---

#### 2.2 Tasteful Milestone Celebrations

**Trigger**: Only at meaningful, data-backed milestones.

```typescript
const milestones = [
  {
    trigger: 'first_file_complete',
    message: 'First file ready',
    // Subtle: brief highlight, no confetti
  },
  {
    trigger: 'halfway',
    message: '50% complete',
    // Subtle: progress bar pulse
  },
  {
    trigger: 'complete',
    message: 'Build complete!',
    // Celebratory: can be more visible
  },
];
```

**Design principles**:
- Subtle for in-progress milestones (don't interrupt flow)
- More visible only for completion
- No confetti/animation spam mid-generation
- Respect `prefers-reduced-motion`

**Why it works**: Breaks wait into satisfying chunks without creating chaos.

---

#### 2.3 Per-File Progress (Only If Reliable)

**Only implement if you can estimate reliably.** Bad estimates are worse than none.

```
Files:
├── Header.tsx     ████████████████████ ✓
├── Sidebar.tsx    ████████████████░░░░   (writing)
├── Footer.tsx     ░░░░░░░░░░░░░░░░░░░░   pending
└── index.tsx      ░░░░░░░░░░░░░░░░░░░░   pending
```

**If you can't estimate line counts**: Just show status (pending/writing/done), not fake progress bars.

---

### Phase 3: Controlled Magic

#### 3.1 Live Preview (Unlocks When Runnable)

**Problem**: User sees code but not visual result.

**Danger**: Live preview during partial builds is a stability trap (dependency resolution, runtime errors, CPU overhead).

**Pragmatic approach**:

1. **During generation**: Show static wireframe/skeleton preview
2. **When core files land**: Unlock interactive preview
3. **If preview errors**: Calm fallback message

```
┌─────────────────────────────────────────┐
│ Preview                                 │
├─────────────────────────────────────────┤
│                                         │
│   ┌─────────────────────────────┐      │
│   │ [====== Header ======]      │      │
│   │                             │      │
│   │ [Sidebar]  [  Content   ]   │      │
│   │            [  loading   ]   │      │
│   │                             │      │
│   └─────────────────────────────┘      │
│                                         │
│   Preview will be interactive when      │
│   core layout is ready (4/18 files)     │
│                                         │
└─────────────────────────────────────────┘
```

**Implementation**:
- Use Sandpack or similar for in-browser preview
- Preview unlocks on first "runnable slice" (e.g., layout + key components)
- NOT continuous hot-reload during every chunk

**Error handling**:
```
"Preview will appear when core layout is ready."
```
(Not: "Error: Cannot resolve module './Header'")

**Why it works**: Preserves the magic without requiring hot-reload perfection.

---

#### 3.2 Estimated Time Remaining (Only With Good Data)

**Only ship this if backed by decent historical data.**

```
~15s remaining (based on similar builds)
```

**Requirements**:
- Track historical build times by complexity
- Show confidence interval or range, not false precision
- Hide estimate if insufficient data

**If you don't have good data**: Just show elapsed time + file progress.

---

### Optional / Later

#### Audio Feedback (Ship Carefully or Skip)

**Risks outweigh benefits for most users:**
- Autoplay restrictions
- Accessibility concerns
- Open-office environments
- Mobile weirdness
- Battery/performance overhead
- If sound doesn't match visual cadence, feels cheap

**If you keep it**:
- Default **OFF**
- Respect `prefers-reduced-motion`
- Trigger on meaningful chunks (per SSE message), not every 50ms
- Provide clear "quiet mode" toggle

**Recommendation**: Milestones/subtle animations will delight more users than typing noises.

---

#### Interactive Interrupt & Adjust

**Cool but opens correctness issues.** Deferring to later phase.

The ability to pause/skip/modify mid-generation requires:
- Partial build state management
- Dependency graph awareness
- Complex error recovery

Worth exploring once core UX is solid.

---

## Implementation Roadmap

### Phase 1: Quick Wins (Reduce Anxiety)
- [x] File manifest preview (skeleton tree) ✅
- [x] Plan→Build handshake bridge ✅
- [x] Auto-show code viewer (peek + pin pattern, no scroll hijack) ✅
- [x] File count + current file indicator (data-driven) ✅

### Phase 2: Make It Meaningful
- [ ] Split view: explanation + code
- [x] Tasteful milestone markers ✅
- [x] Per-file progress (pending/writing/done status) ✅

### Phase 3: Controlled Magic
- [ ] Live preview (unlocks when runnable, not continuous)
- [ ] Time remaining estimate (only with historical data)

### Optional / Future
- [ ] Audio typing feedback (default off, careful implementation)
- [ ] Interrupt & adjust (after correctness issues solved)

---

## Metrics to Track

### Primary Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **Time-to-first-proof-of-work** | Seconds until proof-of-work appears (`file_manifest` OR first file node OR first code chunk - whichever first) | < 3s |
| **Abandonment rate during generation** | Users who cancel or navigate away | -30% |
| **Scroll/interaction during generation** | Users who scroll away, collapse viewer, or hit cancel (boredom/anxiety signal) | Track baseline, then reduce |

### Secondary Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| User satisfaction (post-generation) | Survey or implicit signals | +20% |
| Code viewer engagement | % of users who have viewer open during generation | >80% |
| Return user rate | Users who generate multiple builds | +15% |

### Instrumentation Points

1. **Time-to-first-proof-of-work**: Log timestamp when proof-of-work first renders (file_manifest, first file node, or first code chunk)
2. **Scroll/interaction tracking**: Detect if user disengages during generation (scroll away, collapse viewer, switch tabs)
3. **Cancel rate by elapsed time**: When do users give up? Bucket by 0-10s, 10-30s, 30s+

---

## Technical Considerations

### Backend Changes Required

| Change | Priority | Complexity |
|--------|----------|------------|
| `file_manifest` event at generation start | P1 | Low |
| `file_explanation` event per file | P2 | Medium |
| Milestone events | P2 | Low |
| Historical build time tracking | P3 | Medium |

### Frontend Changes Required

| Change | Priority | Complexity |
|--------|----------|------------|
| Skeleton file tree component | P1 | Low |
| Plan→Build handshake UI | P1 | Low |
| Peek + pin code viewer logic | P1 | Medium |
| **UI update coalescing (max 4/sec)** | P1 | Low |
| Split pane explanation view | P2 | Medium |
| Sandpack preview integration | P3 | High |

### Anti-Jitter Implementation

```typescript
// Coalesce rapid SSE updates to prevent layout churn
const COALESCE_INTERVAL_MS = 250; // Max 4 updates per second

const pendingUpdates = useRef<FileUpdate[]>([]);
const flushTimer = useRef<number | null>(null);

const queueUpdate = (update: FileUpdate) => {
  pendingUpdates.current.push(update);

  if (!flushTimer.current) {
    flushTimer.current = window.setTimeout(() => {
      // Batch apply all pending updates
      applyUpdates(pendingUpdates.current);
      pendingUpdates.current = [];
      flushTimer.current = null;
    }, COALESCE_INTERVAL_MS);
  }
};
```

---

## Summary: What to Ship First

If you ship only three things, ship these:

1. **File manifest / skeleton tree** - Highest trust per line of code
2. **Plan→Build handshake** - Smooth transition, connects intent to action
3. **Auto-show code viewer (peek + pin)** - Visibility without hijacking

These three changes reduce uncertainty (the real enemy) without adding UI thrash.

**Design principle**: Bias toward stable, data-driven proof-of-work and away from extra motion. Users want to feel confident something is happening, not entertained by animations.

---

## Implementation Progress

### Phase 1 Progress (January 2026)

| Task | Status | Notes |
|------|--------|-------|
| Auto-show code viewer (peek + pin) | ✅ Complete | `useUserIdle` hook + auto-switch logic in workspace |
| BuildProgressStrip component | ✅ Complete | Shows file count during builds |
| Data-driven file count indicator | ✅ Complete | Integrated in BuildProgressStrip |
| File manifest event (backend) | ⏳ Pending | See architectural discovery below |
| Plan→Build handshake UI | ✅ Complete | Shows planned files during conversion |

### Phase 2 Progress (January 2026)

#### 2.1 Skeleton File Tree & Plan→Build Handshake

| Task | Status | Notes |
|------|--------|-------|
| Extract planned files from plan response | ✅ Complete | `src/utils/plan-files.ts` utility |
| PlanBuildHandshake component | ✅ Complete | Shows transition from plan→build with file list |
| Integrate handshake into convert dialog | ✅ Complete | Shows during `isConverting` state |
| Skeleton file tree (pending files) | ✅ Complete | Added 'pending' status to FileStatus, shows grayed-out files |
| Set planned files in code viewer | ✅ Complete | `setPlannedFiles()` action in code-viewer-store |

#### 2.2 Tasteful Milestone Celebrations

| Task | Status | Notes |
|------|--------|-------|
| Create useMilestones hook | ✅ Complete | Tracks `first_progress`, `first_file`, `halfway`, `complete` |
| Create MilestoneToast component | ✅ Complete | Subtle, auto-dismissing notifications |
| Integrate into CleanBuildProgress | ✅ Complete | Shows toast at key progress points |
| Respect prefers-reduced-motion | ✅ Complete | Uses simple fade instead of slide animations |
| SessionStorage deduplication | ✅ Complete | Each milestone only triggers once per build |

**Design decisions:**
- Milestones are data-backed (real progress %), not fake phases
- "Subtle" intensity (2s duration) for in-progress, "visible" (3.5s) for completion
- Toast positioned at top center, doesn't interrupt scrolling
- Auto-dismiss without requiring user action

### Architectural Discoveries

#### 1. Files Are Generated Dynamically, Not Pre-Planned

**Discovery**: Claude decides what files to create during generation - there's no upfront file plan.

**Evidence**:
- `claudeSession.ts` processes `Write` and `Edit` tool calls as they happen
- Files are created/modified via Claude's tool usage, not from a predetermined list
- The `CleanEventEmitter` emits events as files are created, not before

**Impact on `file_manifest`**:
- Cannot emit a complete file manifest at generation start
- Options:
  1. Extract planned files from `FeaturePlanResponse.plan.steps[].files` during plan→build conversion
  2. Emit a "build_starting" event with estimated file count based on project type
  3. Build manifest progressively as files are mentioned in Claude's initial response

#### 2. Code Viewer Uses Polling, Not Streaming

**Discovery**: The code viewer fetches files via React Query polling, not SSE streaming.

**Evidence**:
- `use-code-stream.ts` is deprecated (marked as dead code)
- `use-code-files.ts` uses `useQuery` with polling
- Files are fetched from `/api/v1/projects/${projectId}/files`

**Impact on coalescing**:
- Polling naturally batches updates (no jitter from rapid SSE events)
- Coalescing is less critical than initially thought
- Focus on UX improvements rather than streaming optimization

#### 3. Two Separate Progress Systems

**Discovery**: There are two distinct progress UIs:
1. **Chat Plan Streaming** (`streaming-status.tsx`) - Shows phases during chat planning
2. **Build Progress** (`BuildProgressStrip`) - Shows file count during code generation

These serve different purposes and shouldn't be conflated.

### Files Created/Modified

| File | Purpose |
|------|---------|
| `src/hooks/use-user-idle.ts` | Track user interaction for peek+pin pattern |
| `src/hooks/use-milestones.ts` | Track and trigger build milestones |
| `src/components/builder/build-progress-strip.tsx` | Compact progress indicator during builds |
| `src/components/builder/milestone-toast.tsx` | Subtle toast for milestone celebrations |
| `src/components/builder/enhanced-workspace-page.tsx` | Added auto-show logic + progress strip |
| `src/utils/plan-files.ts` | Extract planned files from FeaturePlanResponse/FixPlanResponse |
| `src/components/builder/chat/plan-build-handshake.tsx` | Plan→Build handshake UI component |
| `src/components/builder/chat/convert-to-build-dialog.tsx` | Updated to show handshake during conversion |
| `src/store/code-viewer-store.ts` | Added 'pending' FileStatus + `setPlannedFiles()` action |
| `src/components/builder/code-viewer/file-tree-node.tsx` | Added pending status styling (grayed out, pulsing dot) |
| `src/components/builder/builder-chat-interface.tsx` | Sets planned files when conversion starts |
| `src/components/builder/clean-build-progress.tsx` | Integrated milestone toasts |

### Next Steps

1. **Code Explanation Context**: Show which plan step is being executed and why files are being created
   - **Plan document**: `docs/plan-code-explanation-context.md`
   - **Key insight**: Uses existing plan data - NO backend changes needed
   - **Approach**: "Contextual Step Tracker" (not split view)

2. **Backend `file_manifest`**: (Optional) Emit estimated file count from plan data when converting to build

3. **Live preview**: Show skeleton preview that unlocks when core files are ready (Phase 3)

---

## Future Improvements / Ideas

This section captures improvement ideas discovered during implementation. These are not blockers but potential enhancements.

### Potential Enhancements

1. **Progress bar pulse on milestones**: Add a subtle CSS pulse animation to the progress bar when hitting 50%. Currently using toast only, but a bar pulse could reinforce the milestone visually.

2. **File-level milestones**: Track milestones based on file count (first file, halfway through files, all files). Currently using overall progress percentage.

3. **Milestone sound cues**: Optional subtle audio feedback for milestones (with prefers-reduced-motion and user preference checks). Deferred per original analysis.

4. **Persistent milestone history**: Show a summary of triggered milestones in the expanded build timeline view.

5. **Split view: Code explanation panel**: The original spec suggested showing AI explanations alongside streaming code. This requires backend changes to emit `FileExplanationEvent` during generation.

### Technical Debt

1. **Milestone types enum**: Consider moving `MilestoneType` to a shared types file if other components need to reference it.

2. **BuildProgressStrip milestone integration**: Currently milestones only show in CleanBuildProgress. Could also integrate into BuildProgressStrip for code viewer context.

---

*Document created: January 2026*
*Last updated: January 2026 (Phase 2 complete - handshake, skeleton tree, milestone celebrations)*
