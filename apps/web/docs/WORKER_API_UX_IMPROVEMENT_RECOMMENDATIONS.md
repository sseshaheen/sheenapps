# Worker API UX Improvement Recommendations

## Executive Summary

**Core Pain**: Frontend is forced to regex parse emoji strings to understand build progress.

**Pre-Launch Advantage**: Since we haven't launched yet, we can make breaking changes and design the API properly from the start.

## Current Challenge

**Problem**: Frontend must parse arbitrary strings with emoji prefixes to understand what's happening.

```json
// Current events require string parsing
{ "message": "Creating package.json...", "event_type": "progress" }
{ "message": "🔄 Deployment successful! Preview: https://...", "event_type": "progress" }
{ "message": "Validate TypeScript compilation", "event_type": "started" }
```

**Result**: Complex regex parsing, wrong progress calculations, missed completion states.

## Clean API Design (Sequential-Aware)

**Understanding Worker Constraints**: Worker can only emit "start" signals and steps are strictly sequential (when step N starts, step N-1 is implicitly completed).

**Minimal Schema for Step Events:**
```json
{
  "id": "evt_XYZ",
  "build_id": "01K1EEJED57XEQP0FE5T25WTF6",
  "event_type": "started" | "failed",  // no per-step "completed"
  "phase": "build",                    // setup | dependencies | build | deploy
  "step_index": 3,                     // 0-based position
  "total_steps": 12,                   // lets UI compute % without guessing
  "title": "Creating package.json",    // clean title, no emojis
  "created_at": "2025-07-30T19:58:28.573Z"
}
```

**Final Summary Event:**
```json
{
  "id": "evt_summary",
  "build_id": "01K1EEJED57XEQP0FE5T25WTF6",
  "event_type": "summary",             // single record emitted at the end
  "finished": true,
  "status": "success" | "failed",
  "preview_url": "https://e44d9072.sheenapps-preview.pages.dev", // only when status = success
  "total_duration_seconds": 91.3,
  "phases": {
    "setup": 3.2,
    "build": 70.4,
    "deploy": 17.7
  },
  "created_at": "2025-07-30T19:58:39.573Z"
}
```

**Why This Works:**
- **Accurate progress**: `step_index / total_steps` gives exact %, no guessing
- **Implicit completion**: Frontend derives it - when step N starts, mark step N-1 "completed"
- **No per-file completed events**: Not required; UI infers completion from sequence
- **Definitive finish**: Single summary event carries `finished=true` or `status=failed`
- **Preview URL**: Lives only in summary, no regex needed

**Benefits of Breaking Change Approach:**
- **No legacy cruft** - Clean, purpose-built structure
- **Simpler implementation** - No compatibility layers or migration complexity
- **Better DX** - Frontend gets exactly what it needs, nothing more

## Timeline Ask

**One-Sprint Breaking Change**: Replace current event structure with clean schema above. Frontend will update immediately to consume new format.

## Actionable Request (Updated for Sequential-Only Worker)

1. **Problem** - Regex parsing emojis → wrong progress
2. **Ask** - Add `step_index` and `total_steps` to each step event (`type=started`)
3. **Ask** - Emit one summary event at the end with `{ finished, status, preview_url }`
4. **Keep** - `title`, `phase`, and `created_at` - no need for per-step "completed"
5. **Timeline** - Breaking change in next sprint, frontend updates same sprint

**Worker Effort**: Add two counters + one final summary emit. That's it.

## Benefits

- **Frontend**: Zero string parsing, accurate progress bars, reliable completion detection
- **End Users**: No more misleading "95% estimated", clear "Build Complete! 🎉" with preview links
- **Development**: Clean API foundation for future features, no technical debt

## Examples of Improved UX

### Current Experience
```
🏗️ Building Your App
95% estimated                    <- Misleading
Setup up next                   <- Wrong
🔄 Deployment successful! Preview: https://... <- Hard to parse
```

### With Clean API
```
🏗️ Building Your App
100% • Build Complete! 🎉       <- Accurate (finished: true)
🚀 View Preview                 <- Clear action (preview_url)
Deploy completed in 2.4s        <- Informative (duration_seconds)
```

## Sample Happy-Path Sequence

```json
[
  {
    "id":"evt_1",
    "event_type":"started",
    "phase":"setup",
    "step_index": 0,
    "total_steps": 12,
    "title":"Creating package.json",
    "created_at":"2025-07-30T19:58:20.000Z"
  },
  {
    "id":"evt_2",
    "event_type":"started",
    "phase":"setup",
    "step_index": 1,
    "total_steps": 12,
    "title":"Configuring TypeScript",
    "created_at":"2025-07-30T19:58:24.100Z"
  },
  {
    "id":"evt_3",
    "event_type":"started",
    "phase":"build",
    "step_index": 5,
    "total_steps": 12,
    "title":"Building main.ts",
    "created_at":"2025-07-30T19:58:36.800Z"
  },
  {
    "id":"evt_summary",
    "event_type":"summary",
    "finished": true,
    "status": "success",
    "preview_url":"https://e44d9072.sheenapps-preview.pages.dev",
    "total_duration_seconds": 91.3,
    "phases": { "setup": 8.4, "build": 70.2, "deploy": 12.7 },
    "created_at":"2025-07-30T19:58:39.200Z"
  }
]
```

## Frontend Logic (Trivial)

```typescript
// Accurate progress calculation
progress = (step_index + 1) / total_steps   // e.g. 3/12 → 25%

// Definitive completion detection
if (event.event_type === 'summary') {
  showCompletionBanner(event.status, event.preview_url)
}

// Implicit step completion
if (event.event_type === 'started') {
  markPreviousStepCompleted(event.step_index - 1)
}
```

---

**Ready to discuss implementation details and make this breaking change work smoothly.**
