# Admin Voice Analytics - Analysis & Enhancement Plan

> Generated: 2026-01-19
> Updated: 2026-01-22
> Status: Phase 1 ✅ Complete | Phase 2 ✅ Complete | Phase 3 ✅ Complete

---

## Current State Analysis

### What Already Exists

The admin voice analytics system is **surprisingly comprehensive**. Here's what's built:

#### Worker Side (`src/routes/adminVoiceRecordings.ts`)
| Endpoint | Purpose |
|----------|---------|
| `GET /v1/admin/voice-recordings/:id/signed-url` | Generate signed URLs for audio playback |

**Security features:**
- JWT-based admin authentication with permission checking (`voice_analytics.audio`)
- Path validation (regex allowlist, prevent traversal)
- GDPR audit logging to `security_audit_log` table
- Correlation IDs for request tracing

#### Next.js API Routes
| Route | Purpose |
|-------|---------|
| `/api/admin/voice-analytics` | Aggregated metrics (summary, time series, languages, performance, quality, top users) |
| `/api/admin/voice-analytics/recordings` | List recordings with pagination |
| `/api/admin/voice-analytics/recordings/[id]` | Single recording detail + signed URL |

**Permission:** `voice_analytics.read`

#### Admin Page (`/admin/voice-analytics/page.tsx`)

**Dashboard Features:**
- Summary cards: Recordings, Unique Users, Total Cost, Avg Duration, Audio Minutes
- Time period selector (7/30/90 days)
- Performance metrics: Avg/P50/P95/P99 processing time, success rate
- Quality metrics: Avg confidence, low confidence count, empty transcriptions
- Language distribution with progress bars and confidence scores
- Top users table (by recording count)
- Recent recordings table with Play button
- Recording detail modal with:
  - Audio playback (HTML5 `<audio>` element)
  - Transcription display
  - Full metadata (format, file size, provider, model, processing time)

---

## Gaps Identified (Based on Recent Changes)

### 1. New Database Columns Not Displayed

We added these columns in migration 093:

| Column | Purpose | Admin Display Status |
|--------|---------|---------------------|
| `client_recording_id` | Idempotency key | Not displayed (internal use) |
| `source` | 'hero' \| 'project' | **Not displayed - should be added** |

**Impact:** Can't filter or analyze hero vs project recordings separately.

### 2. Token-Based Pricing Not Shown

We switched from duration-based to token-based cost calculation:
- Old: `cost = duration * rate`
- New: `cost = (inputTokens / 1000) * 0.01`

The `inputTokens` field is returned but not stored in DB or shown in admin.

**Impact:** Cost breakdown is less transparent.

### 3. Missing Analytics Dimensions

| Feature | Value | Effort |
|---------|-------|--------|
| Filter by source (hero/project) | See adoption by entry point | Low |
| Source breakdown in summary | "X hero, Y project" | Low |
| Source in time series | Trend comparison | Medium |
| Cost per source | Revenue attribution | Low |

---

## Enhancement Priorities

### P0: Critical (Blocks understanding of new feature)

**None** - Current system works, just missing new dimensions.

### P1: High Value ✅ COMPLETE

#### 1.1 Add Source Filter & Display ✅
- Add `source` to recordings list response
- Add filter dropdown in admin page
- Show source badge in recordings table
- Add source breakdown to summary cards

#### 1.2 Source Analytics in Summary ✅
```typescript
summary: {
  total_recordings: number
  hero_recordings: number      // ✅ Implemented
  project_recordings: number   // ✅ Implemented
  unique_users: number
  total_cost_usd: number
  // ...
}
```

### P2: Medium Value ✅ COMPLETE (2026-01-21)

#### 2.1 Store and Display Input Tokens ✅
- Add `input_tokens` column to `voice_recordings`
- ~~Update worker to save it~~ (Worker already returns it - just needed to save in Next.js API)
- Display in admin detail view

**Why:** Better cost transparency, can catch token inflation issues.

#### 2.2 Export Functionality ✅
- Add "Export CSV" button
- Download recordings data for offline analysis
- Respects current filters (source, days)
- Includes user emails

#### 2.3 Real-Time Metrics 🔜 BACKLOGGED
- WebSocket or polling for live recording counter
- Useful for launch monitoring

### P3: Low Priority ✅ COMPLETE (2026-01-21)

#### 3.1 Moderation Tools ✅
- Flag/unflag recordings
- Delete recordings (with audit log)
- Content policy enforcement

#### 3.2 Cost Alerts
- Notify when daily cost exceeds threshold
- Per-user cost caps

#### 3.3 Quality Monitoring
- Alert on high empty transcription rate
- Language mismatch detection

---

## Recommended Implementation Order

### Phase 1: Source Analytics ✅ COMPLETE

1. ✅ **Update API** - Add source to responses
2. ✅ **Update Page** - Add filter + display
3. ✅ **Test** - Verify hero vs project filtering works

### Phase 2: Enhanced Metrics ✅ COMPLETE (2026-01-21)

1. ✅ **Migration** - Add `input_tokens` column
2. ✅ **API Update** - Save input_tokens from worker response (worker already returned it)
3. ✅ **Admin Display** - Show tokens in detail view + cost per 1K tokens
4. ✅ **CSV Export** - Export button with filters

### Phase 3: Operational Tools ✅ COMPLETE (2026-01-21)

1. ~~Real-time updates (WebSocket/polling)~~ - Deferred (not needed)
2. ✅ Moderation tools (flag/delete)
3. ✅ Cost alerts (banner when daily threshold exceeded)

---

## Code Snippets for Phase 1

### Add Source to Recordings API

```typescript
// src/app/api/admin/voice-analytics/recordings/route.ts

// Add to query
const { data, error } = await supabase
  .from('voice_recordings')
  .select('id, user_id, duration_seconds, detected_language, confidence_score, cost_usd, transcription, created_at, source')  // Add source
  .order(sortBy, { ascending: sortOrder === 'asc' })
  .range(offset, offset + pageSize - 1)

// Add filter
if (searchParams.get('source')) {
  query = query.eq('source', searchParams.get('source'))
}
```

### Add Source Summary

```typescript
// src/app/api/admin/voice-analytics/route.ts

// Add to summary calculation
const heroCount = summaryData?.filter(r => r.source === 'hero').length || 0
const projectCount = summaryData?.filter(r => r.source === 'project').length || 0

const metrics = {
  summary: {
    total_recordings: totalRecordings,
    hero_recordings: heroCount,
    project_recordings: projectCount,
    // ...
  }
}
```

### Add Filter UI

```tsx
// src/app/admin/voice-analytics/page.tsx

const [sourceFilter, setSourceFilter] = useState<'all' | 'hero' | 'project'>('all')

// In fetch
const recordingsRes = await fetch(
  `/api/admin/voice-analytics/recordings?page=1&page_size=20&sort_by=created_at&sort_order=desc${
    sourceFilter !== 'all' ? `&source=${sourceFilter}` : ''
  }`
)

// In UI
<div className="flex items-center gap-2">
  <Button variant={sourceFilter === 'all' ? 'default' : 'outline'} onClick={() => setSourceFilter('all')}>All</Button>
  <Button variant={sourceFilter === 'hero' ? 'default' : 'outline'} onClick={() => setSourceFilter('hero')}>Hero</Button>
  <Button variant={sourceFilter === 'project' ? 'default' : 'outline'} onClick={() => setSourceFilter('project')}>Project</Button>
</div>
```

---

## Decision Log

| Date | Decision |
|------|----------|
| 2026-01-19 | Admin voice analytics already exists and is comprehensive |
| 2026-01-19 | P1 enhancement: Add source filter/display after migration 093 runs |
| 2026-01-19 | P2/P3 features backlogged for future sprints |
| 2026-01-21 | Phase 1 (Source Analytics) confirmed complete |
| 2026-01-21 | Phase 2 (Input Tokens + CSV Export) implemented |
| 2026-01-21 | Phase 3 (Moderation Tools + Cost Alerts) implemented |
| 2026-01-21 | Real-time metrics deferred (not needed at this time) |
| 2026-01-21 | Soft delete chosen over hard delete (preserves audit trail) |
| 2026-01-21 | Storage files NOT deleted on soft delete (allows recovery) |
| 2026-01-22 | Code review fixes applied (NaN guard, date alignment, flag reason prompt) |
| 2026-01-22 | Migration review: removed FK to auth.users, added better indexes, added reason length constraint |

---

## Phase 2 Implementation Details (2026-01-21)

### Key Discovery: Worker Already Returns `inputTokens`

The worker (`sheenapps-claude-worker/src/routes/transcribe.ts`) was already extracting and returning `inputTokens` from the OpenAI API response (lines 131, 195). The Next.js API was receiving it but not saving it to the database.

**OpenAI API Response Format (gpt-4o-mini-transcribe):**
```json
{
  "text": "Transcribed text...",
  "usage": {
    "type": "tokens",
    "input_tokens": 1234,
    "input_token_details": {
      "text_tokens": 100,
      "audio_tokens": 1134
    },
    "output_tokens": 50,
    "total_tokens": 1284
  }
}
```

Note: `whisper-1` does NOT return token usage (billed per minute instead).

### Files Modified

**Migration:**
- `supabase/migrations/20260121_voice_recordings_input_tokens.sql` - Add `input_tokens` column

**API Updates:**
- `src/app/api/v1/transcribe/route.ts` - Save `input_tokens` to database
- `src/app/api/admin/voice-analytics/recordings/route.ts` - Add `input_tokens` to interface
- `src/app/api/admin/voice-analytics/recordings/[id]/route.ts` - Add `input_tokens` to interface

**New Export API:**
- `src/app/api/admin/voice-analytics/export/route.ts` - CSV export endpoint
  - Respects current filters (source, date range)
  - Max 10,000 records (memory safety)
  - Includes user emails
  - Permission: `voice_analytics.read`

**Admin Page:**
- `src/app/admin/voice-analytics/page.tsx`:
  - Display `input_tokens` in recording detail modal
  - Calculate and show "cost per 1K tokens"
  - Add "Export CSV" button with loading state

### Test Checklist

- [ ] Run migration `20260121_voice_recordings_input_tokens.sql`
- [ ] Record new audio → verify `input_tokens` is saved
- [ ] Open recording detail modal → see "Input Tokens" field
- [ ] Click "Export CSV" → download file with all columns including `input_tokens`
- [ ] Verify CSV includes user emails
- [ ] Verify source filter works with export

---

## Summary

**Phase 1:** ✅ Complete (Source Analytics)
- Source filter buttons (All/Hero/Project)
- Source badge in recordings table
- Source breakdown in summary card

**Phase 2:** ✅ Complete (Enhanced Metrics + Export)
- `input_tokens` column added via migration
- Token count displayed in recording detail modal
- CSV export with all filters

**Phase 3:** ✅ Complete (Moderation Tools + Cost Alerts) - 2026-01-21
- Moderation tools (flag/unflag, soft delete)
- Cost alert banner when daily threshold exceeded
- Real-time metrics: 🔜 Backlogged (not needed at this time)

**All planned enhancements complete.**

---

## Phase 3 Implementation Details (2026-01-21)

### Moderation Tools

**Migration: `20260121_voice_recordings_moderation.sql`**
- `flagged_at` (timestamptz) - when recording was flagged
- `flagged_by` (uuid) - admin who flagged it
- `flag_reason` (text) - optional reason
- `deleted_at` (timestamptz) - soft delete timestamp
- `deleted_by` (uuid) - admin who deleted
- Indexes for efficient queries
- Constraints to ensure consistency

**API Endpoints:**
- `PATCH /api/admin/voice-analytics/recordings/[id]/flag` - Flag/unflag recording
  - Permission: `voice_analytics.moderate`
  - Body: `{ flagged: boolean, reason?: string }`
  - Audit logged to `security_audit_log`

- `DELETE /api/admin/voice-analytics/recordings/[id]` - Soft delete recording
  - Permission: `voice_analytics.moderate`
  - Sets `deleted_at` and `deleted_by` (doesn't remove storage file)
  - Audit logged to `security_audit_log`

**Recordings List API Updates:**
- Added filters: `flagged=true` (only flagged), `include_deleted=true` (show deleted)
- Default: Excludes deleted recordings
- Returns moderation fields in response

**Admin Page UI:**
- Flagged filter button in header
- Status column showing "Flagged" or "OK"
- Flag/unflag buttons in table row and detail modal
- Delete button with inline confirmation (table) or confirm dialog (modal)
- Flagged row highlighted with orange background
- Flagged badge in detail modal header

### Cost Alerts

**Environment Variable:**
- `NEXT_PUBLIC_VOICE_COST_ALERT_THRESHOLD` - Daily cost threshold in USD (default: $10)

**Banner Display:**
- Shows when today's cost exceeds threshold
- Red warning banner at top of page
- Displays today's cost vs threshold
- Calculated from `time_series` data

### Files Modified

**Migrations:**
- `supabase/migrations/20260121_voice_recordings_moderation.sql`

**API Routes:**
- `src/app/api/admin/voice-analytics/recordings/route.ts` - Added moderation filters
- `src/app/api/admin/voice-analytics/recordings/[id]/route.ts` - Added DELETE handler
- `src/app/api/admin/voice-analytics/recordings/[id]/flag/route.ts` - NEW

**Admin Page:**
- `src/app/admin/voice-analytics/page.tsx` - Moderation UI + cost alert

### Test Checklist

- [ ] Run migration `20260121_voice_recordings_moderation.sql`
- [ ] Flag a recording → see flagged badge
- [ ] Unflag a recording → badge removed
- [ ] Filter by flagged → only flagged shown
- [ ] Delete a recording → removed from list
- [ ] Set low threshold → see cost alert banner
- [ ] Verify audit logs for flag/unflag/delete actions

### Improvement Ideas (Future)

1. ~~**Flag reason modal** - Prompt for reason when flagging (currently optional)~~ ✅ Implemented via window.prompt
2. **Bulk operations** - Flag/delete multiple recordings at once
3. **Email notifications** - Alert admins when cost threshold exceeded
4. **Recovery endpoint** - Restore soft-deleted recordings
5. **Storage cleanup job** - Purge storage files for deleted recordings after retention period

---

## Code Review Fixes (2026-01-22)

Applied fixes based on expert code review to address potential bugs and UX issues.

### P0 Fixes (Critical)

#### 1. Cost Alert NaN Guard
**Issue:** If `NEXT_PUBLIC_VOICE_COST_ALERT_THRESHOLD` is missing or invalid, `parseFloat()` returns NaN, causing `.toFixed(2)` to display "NaN".

**Fix:** Added `safeNumber()` helper function:
```typescript
function safeNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : fallback
}

const COST_ALERT_THRESHOLD = safeNumber(
  process.env.NEXT_PUBLIC_VOICE_COST_ALERT_THRESHOLD,
  10
)
```

**Decision:** Kept UTC for date comparison (matches server-generated time_series dates). Adding Cairo timezone would create a mismatch since the API returns UTC dates.

#### 2. Recordings Table Date Alignment
**Issue:** Metrics showed "last 7 days" but recordings table showed all recordings, causing confusion.

**Fix:** Added `date_from` parameter to recordings API call:
```typescript
const dateFromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
// ... passed to recordings API call
```

### P1 Fixes (Important)

#### 3. Explicit Boolean for Flag Status
**Issue:** `!recording.flagged_at` relies on string-truthiness which could break if the type changes.

**Fix:** Used explicit boolean conversion:
```typescript
const isFlagged = Boolean(recording.flagged_at)
onClick={() => handleFlag(recording.id, !isFlagged)}
```

#### 4. Flag Reason Collection via Prompt
**Issue:** UI displayed flag_reason but never collected it.

**Fix:** Added `window.prompt()` when flagging:
```typescript
if (flagged && !finalReason) {
  const input = window.prompt('Why are you flagging this recording? (optional)')
  finalReason = input?.trim() || undefined
}
```

#### 5. Cost per 1K Tokens Divide-by-Zero
**Issue:** Truthy check `input_tokens && cost_usd` hides valid 0 cost and has divide-by-zero risk.

**Fix:** Safe numeric checks:
```typescript
const canShowCostPerToken = typeof tokens === 'number' && tokens > 0 && typeof cost === 'number'
```

#### 6. Flag Reason Length Clamping
**Issue:** No limit on reason length could cause DB bloat.

**Fix:** Trim and clamp in API:
```typescript
const reasonClean = typeof reason === 'string' ? reason.trim().slice(0, 500) : undefined
```

#### 7. Clear Delete Confirmation on Filter Change
**Issue:** Delete confirmation state persisted across filter changes, pointing to potentially different rows.

**Fix:** Reset on filter change:
```typescript
useEffect(() => {
  // ... fetch data
  setDeleteConfirmId(null) // Clear stale confirmation
}, [days, sourceFilter, flaggedFilter])
```

### Files Modified

- `src/app/admin/voice-analytics/page.tsx` - All client-side fixes
- `src/app/api/admin/voice-analytics/recordings/[id]/flag/route.ts` - Reason clamping + timestamp consistency

### Decision Log Update

| Date | Decision |
|------|----------|
| 2026-01-22 | Keep UTC for cost alert date (matches server time_series) |
| 2026-01-22 | Use window.prompt for flag reason (quick win, can upgrade to modal later) |
| 2026-01-22 | Clamp flag reason to 500 chars (prevents abuse) |

---

## Migration Review Fixes (2026-01-22)

Applied fixes based on expert migration review.

### P0 Fixes (Critical)

#### 1. Removed FK to auth.users
**Issue:** FK constraints on `flagged_by`/`deleted_by` → `auth.users(id)` can block admin deletion.

**Why it matters:**
- If an admin is deleted from auth.users, FK constraint blocks the deletion
- `ON DELETE SET NULL` would require updating check constraints
- Admin identity is already captured in `security_audit_log` with email

**Fix:** Removed `REFERENCES auth.users(id)` from both columns. UUIDs are still stored for lookup, but without FK constraint.

#### 2. Added Better Partial Indexes
**Issue:** Original indexes didn't match actual query patterns (ORDER BY created_at DESC WHERE deleted_at IS NULL).

**Fix:** Added query-optimized partial indexes:
```sql
-- Most common: recent + not deleted
CREATE INDEX idx_voice_recordings_created_at_not_deleted
  ON voice_recordings (created_at DESC)
  WHERE deleted_at IS NULL;

-- Flagged view: flagged + not deleted + recent
CREATE INDEX idx_voice_recordings_flagged_not_deleted
  ON voice_recordings (flagged_at DESC, created_at DESC)
  WHERE flagged_at IS NOT NULL AND deleted_at IS NULL;
```

### P1 Fixes

#### 3. Added Flag Reason Length Constraint (DB Level)
**Issue:** API-level clamping is good, but DB constraint provides defense in depth.

**Fix:** Added check constraint:
```sql
CHECK (flag_reason IS NULL OR length(flag_reason) <= 500)
```

#### 4. Fixed DELETE Handler Timestamp Consistency
**Issue:** DELETE handler used two separate `new Date().toISOString()` calls that could differ.

**Fix:** Single `now` variable used for both DB update and response:
```typescript
const now = new Date().toISOString()
// Used in both .update() and response
```

### Updated Migration File
`supabase/migrations/20260121_voice_recordings_moderation.sql`
