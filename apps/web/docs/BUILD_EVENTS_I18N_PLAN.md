# Build Events Internationalization Plan

## Problem Statement

Build event titles display in English in the BuildRunCard expanded view, even for Arabic users. Events like "Processing", "Creating package.json...", "Install dependencies with pnpm" appear untranslated.

## Decision: Option B (Backend Translation Keys)

**Why:** The backend already has `event_code` and `event_params` fields. We just need to use them.

**Rejected Alternative:** Frontend pattern-matching (fragile, maintenance burden, ~80% coverage)

---

## Architecture

### Data Flow
```
Backend (event_code + event_params) → API → Frontend (translate via next-intl) → UI
```

### Event Structure
```typescript
interface CleanBuildEvent {
  // ... other fields
  title?: string                   // Legacy fallback (English) - may be empty when event_code present
  event_code?: string              // Translation key: "BUILD_DEPENDENCIES_INSTALLING"
  event_params?: Record<string, string | number | boolean | null>  // { packageCount: 234 }
}
```

### Frontend Translation
```typescript
// In build-run-card.tsx
function getLocalizedEventTitle(event: CleanBuildEvent, t: Function): string {
  if (event.event_code) {
    const key = `buildEvents.${event.event_code}`
    try {
      const translated = t(key, event.event_params ?? {})
      // next-intl returns the key string when missing - detect that
      if (translated !== key) {
        return translated
      }
    } catch {
      // Missing key or formatting issue - fall through
    }
  }
  // Fallback to raw title, or generic "Processing" if title is empty
  return event.title || t('buildEvents.PROCESSING')
}
```

---

## Expert Guidelines

### 1. Single Translation Source
Use existing `src/messages/*/builder.json` (buildEvents key) via next-intl.
**Do NOT** create separate `compiled/{locale}/events.json` files.

### 2. Consistent Field Naming
```typescript
// ✅ Correct - matches DB schema
event_code?: string
event_params?: Record<string, string | number | boolean | null>

// ❌ Wrong - inconsistent naming
params, translation_key, translation_params
```

### 3. Params are Data, Not Strings
```typescript
// ✅ Correct - raw data for interpolation
{ packageCount: 234, packageManager: 'pnpm' }

// ❌ Wrong - preformatted string
{ message: '234 packages with pnpm' }
```

### 4. Semantic Event Codes
```typescript
// ✅ Good - describes what happened
'BUILD_DEPENDENCIES_INSTALLING'

// ❌ Bad - too specific to current implementation
'INSTALL_DEPENDENCIES_WITH_PNPM'
```

### 5. Param Names Are API Contracts
Once shipped, param names should never change (treat like API fields).

### 6. Arabic Tone Consistency
Existing translations use Egyptian colloquial ("بنحمّل", "بنترجم").
Keep this consistent across all build events.

### 7. RTL + Interpolation Testing
Test events with mixed content (filenames, URLs) in Arabic to catch bidi issues.
We already use `<bdi>` wrappers in BuildRunCard.

### 8. Backend: Enforce Codes-First
Backend should require `event_code` for all user-facing events.
Legacy methods should be deprecated with warnings.

---

## Current State

| Component | Status |
|-----------|--------|
| DB fields (`event_code`, `event_params`) | ✅ Ready |
| Backend emitter (`WithCode` methods) | ✅ Ready |
| Workers using codes | ✅ Complete |
| Frontend translation lookup | ✅ Implemented |
| Translation keys in builder.json | ✅ Complete (all 9 locales) |
| API serialization | ✅ Fixed |
| Deprecation warnings | ✅ Added |

---

## Implementation Status

### Completed (Frontend - sheenappsai)

- [x] Added `event_params` to `CleanBuildEvent` type
- [x] Made `title` and `description` optional in type
- [x] Added `getLocalizedEventTitle()` helper with try/catch fallback
- [x] Fixed API route to return `event_code` and `event_params`
- [x] Added new translation keys for file operations

#### Files Changed

| File | Change |
|------|--------|
| `src/types/build-events.ts` | Made `title` and `description` optional; added `event_params` |
| `src/components/persistent-chat/build-run-card.tsx` | Added `getLocalizedEventTitle()` helper |
| `src/app/api/builds/[buildId]/events/route.ts` | Added `event_code` and `event_params` to API response |
| `src/messages/*/builder.json` (all 9 locales) | Added new keys: `BUILD_FILE_CREATING`, `BUILD_FILE_UPDATING`, `BUILD_FILE_READING`, `BUILD_TASK_WORKING`, `BUILD_PLANNING_COMPLETE`, `BUILD_DEVELOPMENT_PROGRESS`, `PROCESSING` |

### Completed (Backend - sheenapps-claude-worker)

- [x] Migrated `claudeSession.ts` to use `WithCode` methods
- [x] Added `extractUserUpdateWithCode()` method for i18n-aware event extraction
- [x] Added deprecation warnings to legacy emitter methods (throttled by title)

#### Files Changed

| File | Change |
|------|--------|
| `src/stream/claudeSession.ts` | New `extractUserUpdateWithCode()` method; updated progress events to use `phaseProgressWithCode()` |
| `src/services/eventService.ts` | Added `@deprecated` JSDoc and throttled warnings to legacy methods |

#### How It Works

```
Event with event_code    →  Look up translation  →  Show Arabic text
Event without event_code →  Skip translation     →  Show raw English title
Translation missing      →  Catch error          →  Show raw English title
Empty title + no code    →  Fallback             →  Show "جاري المعالجة" (Processing)
```

#### Usage Location

In `BuildRunCard`, the expandable event list (line ~395):
```tsx
<bdi>{getLocalizedEventTitle(event, t)}</bdi>
```

#### Manual Testing

1. Open a workspace with a completed build
2. Expand "Show X build steps" in the BuildRunCard
3. **Events WITH `event_code`:** Should show Arabic (e.g., "بنحمّل الحزم...")
4. **Events WITHOUT `event_code`:** Will show English (fallback)

To check which events have codes, open browser DevTools → Network → find `/api/builds/{id}/events` → check response for `event_code` field.

---

## New Translation Keys Added

| Event Code | English | Arabic (ar-eg) |
|------------|---------|----------------|
| `BUILD_FILE_CREATING` | Creating {filename}... | بنعمل {filename}... |
| `BUILD_FILE_UPDATING` | Updating {filename}... | بنحدث {filename}... |
| `BUILD_FILE_READING` | Reading {filename}... | بنقرأ {filename}... |
| `BUILD_TASK_WORKING` | Working on: {task} | شغالين على: {task} |
| `BUILD_PLANNING_COMPLETE` | Planning complete, starting implementation... | التخطيط خلص، بنبدأ التنفيذ... |
| `BUILD_DEVELOPMENT_PROGRESS` | AI is working on your project | الذكاء الاصطناعي شغال على مشروعك |
| `PROCESSING` | Processing... | جاري المعالجة... |

---

## Event Codes Reference (Complete)

| Event Code | Phase | Arabic (ar-eg) |
|------------|-------|----------------|
| `BUILD_STARTED` | setup | بنبدأ البناء... |
| `BUILD_DEVELOPMENT_STARTING` | development | الذكاء الاصطناعي بيبدأ يشتغل |
| `BUILD_DEVELOPMENT_COMPLETE` | development | الذكاء الاصطناعي خلص الكود |
| `BUILD_FILE_CREATING` | development | بنعمل {filename}... |
| `BUILD_FILE_UPDATING` | development | بنحدث {filename}... |
| `BUILD_FILE_READING` | development | بنقرأ {filename}... |
| `BUILD_TASK_WORKING` | development | شغالين على: {task} |
| `BUILD_PLANNING_COMPLETE` | development | التخطيط خلص، بنبدأ التنفيذ... |
| `BUILD_DEPENDENCIES_INSTALLING` | dependencies | جاري تثبيت الحزم... |
| `BUILD_DEPENDENCIES_COMPLETE` | dependencies | الحزم اتثبتت بنجاح |
| `BUILD_COMPILING` | build | ترجمة التطبيق |
| `BUILD_BUNDLING` | build | تجميع الملفات |
| `BUILD_DEPLOY_PREPARING` | deploy | بنحضر للنشر |
| `BUILD_COMPLETE` | deploy | اكتمل البناء! |
| `BUILD_METADATA_GENERATING` | metadata | بنعمل التوصيات |
| `BUILD_RECOMMENDATIONS_GENERATED` | metadata | عملنا توصيات |
| `PROCESSING` | any | جاري المعالجة... |

---

## Verification

Run a new build and check that ALL events in the response have `event_code` field:
```bash
curl /api/builds/{buildId}/events | jq '.events[] | select(.event_code == null)'
# Should return empty if all events have codes
```

---

## Optional Future Improvements

- [ ] Add CI grep check for `phaseStarted(` without `WithCode` to catch regressions
- [ ] Consider adding more granular event codes for specific tool operations
- [ ] Add smoke test that verifies all event codes have translations in all locales

---

## Expert Feedback Fixes (2026-01-12)

Following expert code review, the following improvements were made:

### 1. Progress Clamping Bug Fix
**Problem:** `eventData.overallProgress ? ...` treated `0` as falsy, clamping to null.
**Fix:** Use `typeof eventData.overallProgress === 'number'` check in `eventService.ts:emitCleanBuildEvent`.

### 2. Bus Payload Naming Consistency
**Problem:** `UserBuildEvent` type used `code`/`params` but API used `event_code`/`event_params`.
**Fix:** Updated `cleanEvents.ts` type and `eventService.ts` bus payload to use `event_code`/`event_params`.

### 3. TodoWrite Params Preformatted String
**Problem:** Params were `{ task: "Fix bug (1/3)" }` - a preformatted string.
**Fix:** Changed to raw primitives `{ task: "Fix bug", completed: 1, total: 3 }` in `claudeSession.ts`.
**Translation Update:** All 9 locales now use `"Working on: {task} ({completed}/{total})"`.

### 4. API Route Improvements
**Problem:**
- Ordering by `created_at` (can have duplicates)
- Diagnostic query ran on every request (wasteful)
- `finished` inferred from `event_type === 'completed'` (false positives)

**Fix in `route.ts`:**
- Order by `id` for stable ordering
- Gate diagnostics behind `?debug=true`
- Trust only DB `finished` flag

### 5. Unbounded Set Growth
**Problem:** `warnedLegacyTitles` Set could grow unbounded in long-running processes.
**Fix:** Added `MAX_WARNED_TITLES = 100` limit with check before adding to Set.

---

## Expert Feedback Fixes - Round 2 (2026-01-12)

Following second expert code review, additional improvements were made:

### 1. emitRecommendationsEvent TypeScript Fix
**Problem:** `data: Record<string, unknown>` required unsafe property access.
**Fix:** Added proper type definitions `RecommendationsReadyPayload` and `RecommendationsFailedPayload` in `eventService.ts`.

### 2. Numeric Field Parsing (Supabase String Issue)
**Problem:** Supabase can return `numeric(3,2)` columns as strings, breaking `typeof === 'number'` checks.
**Fix:** Added `toNumber()` helper in API route that handles both string and number inputs safely.

### 3. Debug Mode Security
**Problem:** `?debug=true` could leak cross-user data and expose full user IDs; `Set` doesn't serialize to JSON.
**Fix:**
- Gate debug behind `NODE_ENV !== 'production'`
- Track only `uniqueUserCount` and `currentUserEventCount` (no user IDs)
- Changed `buildIdVariants` from `Set<string>` to `string[]`

### 4. Bus Emit on DB Failure
**Problem:** When DB is unavailable, `emitCleanBuildEvent` returned early without emitting to bus, losing real-time updates.
**Fix:** Restructured function to always emit to bus even if DB insert fails. Uses `temp-{timestamp}` ID as fallback.

### 5. getCleanEventsSince Missing i18n Fields
**Problem:** Worker API function didn't return `event_code` and `event_params`.
**Fix:** Added fields to SELECT query and return mapping with proper JSON parsing.

---

## Expert Feedback Fixes - Round 3 (2026-01-12)

Critical production fixes following third expert code review:

### 1. ClaudeSession Timer/Interval Leak (MUST-FIX)
**Problem:** `streamTimeout` and `continueCheckInterval` were declared inside try block, not cleared on error paths.
**Fix:**
- Moved timer declarations outside try block (before line 80)
- Added cleanup in `finally` block: clears `this.timeout`, `streamTimeout`, and `continueCheckInterval`
- Prevents zombie intervals firing on dead stdin after errors

### 2. emitBuildEvent Bus Emit on DB Down
**Problem:** Legacy `emitBuildEvent()` also returned early when DB unavailable, losing real-time updates.
**Fix:** Restructured to always emit to bus even if DB insert fails (same pattern as `emitCleanBuildEvent`).

### 3. JSON.parse Crash in getCleanEventsSince
**Problem:** `row.error_params ? JSON.parse(row.error_params)` crashes if pg already parsed jsonb to object.
**Fix:** Added safe parsing: `typeof row.error_params === 'string' ? JSON.parse(...) : row.error_params`

### 4. Structured Errors in API Route
**Problem:** API route didn't select/map `error_code`, `error_params`, `user_error_message` - UI never received structured errors.
**Fix:**
- Added fields to SELECT query
- Build `structuredError` object in transformation
- Return as `error` field alongside legacy `error_message`

### 5. lastEventId NaN Handling
**Problem:** `parseInt('abc')` returns NaN, causing odd resumption behavior.
**Fix:** `const lastEventIdRaw = Number(...); Number.isFinite(lastEventIdRaw) ? lastEventIdRaw : 0`

### 6. null vs undefined Consistency
**Problem:** API returned `null` for missing fields but TS types use `string | undefined`.
**Fix:** Changed `preview_url` and `error_message` to use `|| undefined` instead of `|| null`

### 7. Comment/Filter Mismatch
**Problem:** Log said "build_id matches buildId or buildId-*" but code did exact match.
**Fix:** Updated comment and log to accurately reflect `.eq('build_id', buildId)`

### 8. buildFailedWithCode Error Preservation
**Problem:** `errorMessage: ''` threw away actual error info.
**Fix:** Extract error from `params.message || params.error || code` and populate legacy fields

---

## Expert Feedback Fixes - Round 4 (2026-01-12)

Production hardening and scalability fixes:

### 1. EventEmitter Listener Scaling
**Problem:** Global `bus` EventEmitter with default 10 max listeners causes warnings with many concurrent SSE clients.
**Fix:** Added `bus.setMaxListeners(0)` after creating the EventEmitter.

### 2. progressThrottleState Unbounded Growth
**Problem:** Map grows indefinitely if builds crash without terminal events (SYNC_COMPLETED/SYNC_FAILED).
**Fix:**
- Added TTL cleanup (5 minute threshold)
- Added max size limit (500 entries)
- Cleanup runs before adding new entries

### 3. Numeric Field Normalization in Worker
**Problem:** `getCleanEventsSince()` used `|| 0` which returns strings if Supabase returns numeric as string.
**Fix:** Added `toNumber()` helper (matches Next.js API route) and use `toNumber(row.overall_progress) ?? 0`.

### 4. Internal Data Logging Security
**Problem:** `internalData` logged unconditionally, could leak paths/commands in production.
**Fix:** Gate logging behind `process.env.NODE_ENV !== 'production'`.

### 5. Async Event Handler Pattern
**Problem:** `rl.on('line', async ...)` in `resume()` - async errors become unhandled promise rejections.
**Fix:** Wrap in `void (async () => { ... })().catch(err => console.error(...))` pattern.

### 6. Version Info Persistence (Migration Pending)
**Problem:** `versionId`/`versionName` are emitted on bus but not persisted to DB - disappear on refresh/polling.
**Fix:** Created migration file `103_build_events_version_columns.sql`. After running:
- Update `emitCleanBuildEvent()` to INSERT version columns
- Update Next.js API route to SELECT and return them

### 7. Duplicate Timeout Removed
**Problem:** `streamTimeout` was set to same value as `this.timeout` - redundant.
**Fix:** Removed `streamTimeout` entirely. `this.timeout` already handles session timeout.

### 8. BuildRunCard Icon Logic
**Problem:** Used `index < events.length - 1` to determine completion - wrong for interleaved progress events.
**Fix:** Changed to `event.event_type === 'completed' || event.finished` - uses actual event state.

### Skipped Items (Evaluated as Overengineering)

| Issue | Reason for Skipping |
|-------|---------------------|
| Trust boundary for userId | Only trusted server code calls `emitBuildEvent()` |
| params as Promise type | Expert wrong - this is correct for Next.js 15 App Router |
| Recommendations in DB | SSE is signal-only; actual data is in `project_recommendations` table |

---

## Expert Feedback Fixes - Round 5 (2026-01-12)

Critical persistence fixes to ensure refresh/polling works like SSE:

### 1. Version Info Persistence (Gap #1)
**Problem:** `versionId`/`versionName` were emitted on bus but never written to DB or returned from API.
**Fix:**
- Added `version_id`, `version_name` to `emitCleanBuildEvent()` INSERT ($17, $18)
- Added to `getCleanEventsSince()` SELECT and return
- Added to `getInternalEventsSince()` SELECT and return
- Added to Next.js API route SELECT and mapping

### 2. Structured Errors for Clean Failures (Gap #2)
**Problem:** `error_code`, `error_params`, `user_error_message` were selected but never populated for clean events.
**Fix:** In `emitCleanBuildEvent()`, when `eventType === 'failed'`:
- Set `error_code` = event code or 'BUILD_FAILED'
- Set `error_params` = JSON stringified params
- Set `user_error_message` = sanitized error message

### 3. SessionResult needsFallback Type
**Problem:** `resume()` returned `needsFallback: true` but it wasn't in the type - easy to miss.
**Fix:** Added `needsFallback?: boolean | undefined` to `SessionResult` interface.

### 4. sanitizeErrorMessage URL Preservation
**Problem:** Regex `/\/[^\s]+/g` replaced URLs (http://..., /api/...) with `[file]`.
**Fix:** More selective path detection:
- Only matches known system paths: `/home`, `/Users`, `/var`, `/tmp`, `/usr`, `/opt`, etc.
- Uses negative lookbehind to preserve `https://` and `http://`
- Handles Windows paths (`C:\...`)

---

## Expert Feedback Fixes - Round 6 (2026-01-12)

Final cleanup before production:

### 1. Empty Title/Description Normalization
**Problem:** `phaseStartedWithCode()` etc. set `title: ''` and `description: ''`. Empty string ≠ NULL creates subtle truthiness bugs.
**Fix:** In `emitCleanBuildEvent()`, normalize before INSERT:
```typescript
const normalizedTitle = eventData.title?.trim() || null;
const normalizedDescription = eventData.description?.trim() || null;
```

### 2. Composite Index for Hot Path
**Problem:** The events polling query lacks an index for the WHERE clause pattern.
**Fix:** Created migration `104_build_events_composite_index.sql`:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_build_events_polling
ON project_build_events (build_id, user_id, user_visible, id)
WHERE user_visible = true;
```

### Skipped Items

| Issue | Reason |
|-------|--------|
| Recommendations replay | UI uses `/projects/:id/recommendations` for data, SSE for signal. Data IS persisted in `project_recommendations` table. |
| params as Promise | Expert wrong - Next.js 15 App Router requires `await params` |
| Legacy emitBuildEvent version | Expert acknowledges fine - version only for clean completion events |

---

## Pending Migrations

### 1. Version Columns (103)
```bash
psql -f migrations/103_build_events_version_columns.sql
```

### 2. Composite Index (104)
```bash
# IMPORTANT: Run outside transaction (uses CONCURRENTLY)
psql -f migrations/104_build_events_composite_index.sql
```

**Code changes are already complete** - they will work once migrations run.
