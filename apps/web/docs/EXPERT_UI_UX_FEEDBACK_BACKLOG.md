# Expert UI/UX Feedback - Backlog

> Received: 2026-01-19
> Status: Backlog - Review after core functionality is stable
> Context: Feedback on voice recording and builder UI polish

---

## Summary

Expert reviewed the voice recording and builder implementation. Most suggestions are polish/UX improvements appropriate for post-MVP phase. Core functionality (voice transcription, storage, RTL) should be completed first.

---

## High-Value Ideas (Consider for Next Sprint)

### 1. Voice Transcript Preview
Show transcript before submission with confirm/re-record options:
```
[Recording complete]
"أريد أن أبني تطبيق لإدارة المواعيد"
[Use This] [Re-record]
```
**Effort**: Low (20 lines)
**Impact**: Medium - better UX for voice input
**Prerequisite**: Voice recording E2E working

### 2. Plan vs Build Naming
Rename for clarity:
- "plan" → "Discuss"
- "build" → "Build"

Add explanatory sentence under toggle.

**Effort**: Low (translation files only)
**Impact**: Medium - reduces cognitive load

### 3. Balance/Credits as Contextual Card
Instead of banner, show inline in chat:
- "This change needs ~X minutes"
- "You have Y"
- "Buy Z" or **"Reduce scope"** button

The "Reduce scope" option is interesting for conversion.

**Effort**: Medium
**Impact**: Medium-High - feels less like paywall

---

## Medium-Term Polish (Post-MVP)

### 4. Builder "Cockpit" Header
Add to chat header:
- Project name + status pill (Queued/Building/Live)
- "Open Preview" / "Share" / "Rollback" / "Report issue"
- Last build time + environment (Easy/Pro mode)
- Connection indicator (visible, subtle)

### 5. Build Steps as "Cinematic Sequence"
- Short, crisp steps (2-5 words)
- Progress beam (not spinner)
- Real-time microcopy ("Generating pages…", "Styling Arabic RTL…")

### 6. Chat Message Polish
- Message grouping (same sender in block, fewer avatars)
- Rich assistant cards (plans, recommendations as structured cards)
- Inline "Apply this" actions
- Streaming presence (tool usage + elapsed time)

### 7. Templates Upgrade
- Replace emoji with real thumbnails/mockups
- Add badges: "Fastest to launch", "Best for salons", "Works great in Arabic"
- 3-second preview drawer on tap before creating project

---

## Long-Term / Design System Work

### 8. Unify Visual Language
Current mix:
- Purple→pink gradients (FAB + modal)
- Dark gray enterprise UI (chat)
- Blue (plan mode + balance banner)

**Recommendation**: One primary accent + semantic colors only for meaning.
Plan mode = "calm" via lighter surfaces, not different color.

### 9. 2-Panel New Project Hero
- Left: "Describe your idea" + voice + attachments
- Right: Live preview (animated spec cards: Pages, Features, Integrations, Timeline)
- Trust strip: privacy, export, time estimates, humans available

**Note**: Major redesign, requires spec preview infrastructure.

### 10. Idea Capture "Command Palette" Level
- Inline structured hints (chips: industry, language, style, must-have)
- Attachment intelligence (thumbnails + "extract what?" toggles)
- Voice: permission state, recording state, waveform, transcript, Insert/Replace

### 11. Motion Guidelines
Use motion only for:
- Modal open/close
- Build progress transitions
- Recommendation insertion
- Success state

Keep durations short, easing consistent. Avoid stacked glows + gradients + blur.

### 12. Performance Polish
- Lazy-load OrchestrationInterface until first open
- Prefetch /builder/workspace/[id] after typing pause
- Keep heavy logs out of main UI thread
- Careful with backdrop blur + shadows on low-end devices

---

## Already Addressed

| Suggestion | Status |
|------------|--------|
| Mic icon animation (Framer → CSS) | Done 2026-01-19 |
| RTL input direction | In progress (plan file) |

---

## RTL-Specific (Covered in Existing Plan)

These are already scoped in `typed-watching-harp.md`:
- `chat-input.tsx` - Add `dir={direction}` + `text-right`
- `idea-capture-modal.tsx` - Add RTL support
- Global CSS for RTL textarea placeholders
- Arabic typography choices (font + line height)
- Spacing tokens (ms-/me- consistently)

---

## Decision Log

| Date | Decision |
|------|----------|
| 2026-01-19 | Backlogged all suggestions. Priority: finish voice recording E2E, then RTL fixes from existing plan. |
