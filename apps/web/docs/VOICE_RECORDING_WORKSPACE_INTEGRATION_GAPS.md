# Voice Recording Workspace Integration - Gap Analysis

> Generated: 2026-01-19
> Status: ✅ RESOLVED - Unified to single flow (Jan 2026)

---

## Current Architecture (Two Flows)

### Flow 1: Hero/New Project (Just Fixed ✅)
```
Browser → /api/v1/transcribe → Worker /v1/transcribe
                                    ↓
                              Transcribe + Storage Upload
                                    ↓
         Next.js ← returns storagePath
              ↓
         UPSERT to voice_recordings (with client_recording_id, source='hero')
```

**Features:**
- Client-generated `recordingId` (idempotency)
- `source` = 'hero'
- Storage upload in worker
- DB save in Next.js route

### Flow 2: Workspace/Project (Has Gaps ❌)
```
Browser → /api/v1/projects/[projectId]/transcribe → Worker /v1/projects/:projectId/transcribe
                                                          ↓
                                                    Transcribe + Storage Upload
                                                          ↓
                                                    Direct INSERT to DB (in worker)
```

**Issues:**
- Worker-generated `recordingId` (no client idempotency)
- **Missing `source` column** (should be 'project')
- **Missing `client_recording_id` column**
- INSERT will fail after migration 093 if `source` has NOT NULL (currently nullable with default)

---

## Files Involved

| File | Purpose | Issue |
|------|---------|-------|
| `src/components/builder/chat/chat-input.tsx` | Renders VoiceRecordingButton | Feature-flagged, needs VOICE_INPUT=true |
| `src/components/builder/chat/voice-recording-button.tsx` | Voice UI in workspace | Calls project-based endpoint |
| `src/app/api/v1/projects/[projectId]/transcribe/route.ts` | Next.js BFF | Forwards to worker, doesn't handle DB |
| `worker/src/routes/voiceTranscription.ts` | Worker endpoint | Direct DB INSERT missing new columns |

---

## Specific Code Issues

### Issue 1: Worker DB INSERT Missing Columns

**File:** `sheenapps-claude-worker/src/routes/voiceTranscription.ts` (lines 421-452)

```typescript
// CURRENT - Missing source and client_recording_id
const dbResult = await pool.query(
  `INSERT INTO voice_recordings (
    id,
    user_id,
    project_id,
    audio_url,
    audio_format,
    duration_seconds,
    file_size_bytes,
    transcription,
    detected_language,
    provider,
    model_version,
    processing_duration_ms,
    created_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
  RETURNING id, created_at`,
  [...]
);
```

**Fix needed:**
```typescript
// Add source and client_recording_id
const dbResult = await pool.query(
  `INSERT INTO voice_recordings (
    id,
    user_id,
    project_id,
    source,                    -- ADD
    client_recording_id,       -- ADD (use recordingId)
    audio_url,
    audio_format,
    ...
  ) VALUES ($1, $2, $3, $4, $5, $6, ...)`,
  [
    recordingId,
    userId,
    projectId,
    'project',                 -- Always 'project' for this flow
    recordingId,               -- Use same as id for now (or accept from client)
    ...
  ]
);
```

### Issue 2: No Client-Side RecordingId for Idempotency

The workspace flow generates `recordingId` in the worker:
```typescript
const recordingId = crypto.randomUUID(); // Generated server-side
```

This means retries create duplicate records. The hero flow generates it client-side for idempotency.

**Options:**
1. Accept `recordingId` from client (like hero flow)
2. Use UPSERT instead of INSERT (prevents duplicates)

---

## Recommended Fixes

### Priority 1: Add Missing Columns to Worker INSERT

Update `voiceTranscription.ts` to include `source` and `client_recording_id`:

```typescript
// Line 421-452 in voiceTranscription.ts
const dbResult = await pool.query(
  `INSERT INTO voice_recordings (
    id,
    user_id,
    project_id,
    source,
    client_recording_id,
    audio_url,
    audio_format,
    duration_seconds,
    file_size_bytes,
    transcription,
    detected_language,
    provider,
    model_version,
    processing_duration_ms,
    created_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
  RETURNING id, created_at`,
  [
    recordingId,
    userId,
    projectId,
    'project',          // source
    recordingId,        // client_recording_id (use same as id for now)
    storagePath,
    audioFormat,
    result.duration ?? null,
    audioBuffer.length,
    result.text,
    result.language ?? language ?? null,
    provider,
    'gpt-4o-mini-transcribe',
    transcriptionDuration
  ]
);
```

### Priority 2: Enable Feature Flag (If Not Already)

Ensure `NEXT_PUBLIC_ENABLE_VOICE_INPUT=true` in `.env.local`

### Priority 3 (Future): Consolidate Flows

Consider unifying both flows to:
- Always accept `recordingId` from client
- Use UPSERT for idempotency
- Have consistent source tracking

---

## Feature Flag Status

```typescript
// src/config/features.ts
VOICE_INPUT: process.env.NEXT_PUBLIC_ENABLE_VOICE_INPUT !== 'false',
```

**Default:** Enabled (unless explicitly set to 'false')

---

## Testing Checklist

After fixes:
- [ ] Record voice in workspace chat
- [ ] Check `voice_recordings` table has `source='project'`
- [ ] Check `client_recording_id` is populated
- [ ] Verify admin analytics shows project recordings
- [ ] Test retry behavior (no duplicates)

---

## Summary

| Flow | Transcription | Storage | DB Save | source | Idempotency |
|------|--------------|---------|---------|--------|-------------|
| Hero | ✅ Works | ✅ Works | ✅ Next.js | ✅ 'hero' | ✅ client_recording_id |
| Workspace | ✅ Works | ✅ Works | ✅ Next.js | ✅ 'project' | ✅ client_recording_id |

## Resolution (Jan 2026)

**Both flows now use the unified `/api/v1/transcribe` endpoint:**

1. `VoiceRecordingButton` updated to:
   - Generate `recordingId` at recording start (for idempotency)
   - Call `/api/v1/transcribe` (same as hero)
   - Pass `projectId` in form data (determines source='project')
   - Read `result.text` (unified response format)

2. Single persistence path:
   - Next.js handles all DB writes via UPSERT
   - Worker only handles transcription + storage upload
   - No more dual DB write owners

3. Benefits:
   - Consistent idempotency via `client_recording_id`
   - Proper `source` tracking for analytics
   - Single codebase to maintain
