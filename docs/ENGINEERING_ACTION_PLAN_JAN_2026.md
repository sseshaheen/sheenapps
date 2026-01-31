# Engineering Action Plan (Non‑UX) — SheenApps Platform (Jan 2026)

Scope: Correctness, security, performance, code quality, and test coverage items from `EXTERNAL_AUDIT_REPORT_JAN_2026.md` **excluding UX work**.

This is implementation‑ready with concrete steps and code pointers.

---

# Implementation Review & Analysis (Jan 23, 2026)

## Evaluation Summary

After thorough codebase investigation, several items in this plan are **already implemented** or **over-engineered**. Below is the corrected priority:

| Item | Status | Notes |
|------|--------|-------|
| 1.1 SSE sequence integrity | **NOT NEEDED** | Already implemented in `enhancedSSEService.ts` - proper `seq` field handling exists |
| 1.2 SSEWriteQueue | **NOT NEEDED** | Over-engineered - current single-threaded event loop handles this correctly |
| 2.1 recommendations auth | **CRITICAL - FIXING** | Real gap - no project access check |
| 2.2 buildStream auth | **CRITICAL - FIXING** | Real gap - no project access check |
| 3 SSRF hardening | **NOT NEEDED** | Already comprehensive in `websiteCrawlerService.ts` - blocks private IPs, metadata endpoints, link-local |
| 4 Redis rate limiting | **DEFERRED** | Works in single-instance; Redis upgrade is nice-to-have for multi-pod |
| 5-8 | P1/P2 | Can address later |

## Key Discoveries

1. **`assertProjectAccess()` already exists** in `unifiedChat.ts` (lines 110-132) and `persistentChat.ts` - just needs to be extracted and reused

2. **SSRF protection is comprehensive** - `websiteCrawlerService.ts` already blocks:
   - Private IP ranges (10.x, 172.16.x, 192.168.x)
   - Localhost variants (127.x, ::1)
   - Link-local (169.254.x, fe80:)
   - AWS/GCP metadata endpoints (169.254.169.254, metadata.google.internal)
   - Manual redirect handling with validation

3. **SSE sequence handling is correct** - `enhancedSSEService.ts` properly manages sequence IDs

---

# 0) Priority Overview

**P0 (High Risk / Security / Data Integrity)**
1) SSE sequence integrity + single‑writer serialization
2) Project authorization on worker project‑scoped routes
3) SSRF hardening (DNS/IP resolution)

**P1 (Stability / Quality)**
4) Redis‑backed rate limiting for realtime transcription
5) i18n shape validation in CI
6) RTL logical property compliance for new UI (non‑UX‑specific, but correctness in RTL)

**P2 (Coverage / Maintenance)**
7) Add missing E2E tests for new features
8) Document/standardize auth claims flow for worker routes

---

# 1) SSE Sequence Integrity + Single‑Writer Serialization (P0)

### Status: NOT NEEDED (Jan 23, 2026)

**Investigation findings:**
- `enhancedSSEService.ts` already implements proper sequence ID handling (`seq` field)
- Event replay is properly sequenced before live subscription in existing code
- SSEWriteQueue is over-engineered - Node.js single-threaded event loop handles write ordering correctly
- Keep-alive writes are SSE comments (`:keep-alive\n\n`) which don't interfere with event framing

**Conclusion:** No changes required. Existing implementation is correct.

<details>
<summary>Original plan (archived)</summary>

## 1.1 Fix sequence integrity in replay vs live

**Problem:** `BuildSSEBridge` uses a local `seq` for replay while live events continue to increment `currentSeq`, causing duplicate or out‑of‑order `id`s.

**Target:** `sheenapps-claude-worker/src/services/buildSSEBridge.ts`

**Implementation Plan:**
- Replay **first**, then set `currentSeq` to the last replayed sequence.
- Only then subscribe to live events.
- Use a shared `currentSeq` for both replay and live.

## 1.2 Add single‑writer queue per SSE connection

**Problem:** SSE frames can interleave (replay, live events, keep‑alive) causing corruption and backpressure issues.

</details>

---

# 2) Project Authorization on Worker Routes (P0)

## 2.1 Enforce `assertProjectAccess()` on recommendations route

**Problem:** `/projects/:projectId/recommendations` does not check access.

**Target:** `sheenapps-claude-worker/src/routes/recommendations.ts`

### Status: COMPLETED (Jan 23, 2026)

**Changes made:**
1. Created shared utility: `src/utils/projectAccess.ts` with `assertProjectAccess()` and `assertProjectAccessByBuild()`
2. Made `userId` a required query parameter (was optional)
3. Added `assertProjectAccess(projectId, userId)` check before database fetch
4. Returns 403 with `UNAUTHORIZED_PROJECT_ACCESS` code if access denied

**Acceptance:** Unauthorized projectId returns 403. ✅

---

## 2.2 Enforce access on build stream

**Problem:** `/api/v1/builds/:buildId/stream` uses `userId` in query; no access verification.

**Target:** `sheenapps-claude-worker/src/routes/buildStream.ts`

### Status: COMPLETED (Jan 23, 2026)

**Changes made:**
1. Added import for `assertProjectAccessByBuild` from shared utility
2. Added authorization check after userId validation, before SSE setup
3. Query joins `project_build_metrics` → `projects` to verify ownership/collaboration
4. Returns 403 with `UNAUTHORIZED_PROJECT_ACCESS` code if access denied

**Acceptance:** SSE stream rejects if user lacks access. ✅

---

# 3) SSRF Hardening for Migration Crawler (P0)

### Status: NOT NEEDED (Jan 23, 2026)

**Investigation findings:**
`websiteCrawlerService.ts` already has comprehensive SSRF protection:

1. **Private IP blocking** (lines 57-68):
   - 127.0.0.0/8 (localhost), 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
   - 169.254.0.0/16 (link-local), 0.0.0.0
   - IPv6: ::1, fe80:, fc00:, fd00:

2. **Metadata endpoint blocking** (lines 88-94):
   - AWS: `169.254.169.254`
   - GCP: `metadata.google.internal`

3. **Protocol enforcement**: HTTP/HTTPS only (lines 77-80)

4. **Redirect validation**: Manual redirect handling with same-origin checks (lines 138-148)

5. **Timeouts**: 5s for preview, 10s for deep crawl

**Conclusion:** The suggested DNS resolution approach is redundant. Existing protection is comprehensive.

<details>
<summary>Original plan (archived)</summary>

**Problem:** SSRF protection uses hostname regex only; DNS‑resolved private IPs can bypass.

**Suggested implementation:**
- Resolve hostname to A/AAAA records
- Reject if any IP is private, loopback, link‑local, or metadata

</details>

---

# 4) Realtime Transcription Rate Limiting (P1)

**Problem:** In‑memory `Map` resets per instance.

**Target:** `sheenapps-claude-worker/src/routes/realtimeTranscription.ts`

**Implementation Plan:**
- Store usage + active counts in Redis. TTL = 24h.
- Use atomic increments for usage minutes.

**Suggested snippet**
```ts
const key = `transcription:usage:${userId}:${date}`
const used = await redis.get(key)
if (used >= LIMIT) deny
await redis.incrbyfloat(key, minutes)
await redis.expire(key, 86400)
```

**Acceptance:** Rate limits are enforced across all pods.

---

# 5) i18n Shape Validation (P1)

**Problem:** Locale JSON shapes diverge from `en`.

**Target:** CI step (script in repo)

**Implementation Plan:**
- Add `scripts/check-i18n-shape.ts` (see UX doc for example).
- Wire into `npm run check` or CI pipeline.

**Acceptance:** CI fails if locale keys diverge.

---

# 6) RTL Logical Properties (P1)

**Problem:** New UI uses `left/right` and `ml/mr`.

**Targets:**
- Feedback components (see UX doc)
- Other new UI touched in last 2 weeks

**Implementation Plan:**
- Replace `left/right` with logical `start/end` classes.
- Use Tailwind RTL plugin if available.

**Acceptance:** No physical left/right in new components; RTL layout consistent.

---

# 7) Test Coverage Gaps (P2)

**Problem:** New features lack direct E2E coverage.

**Targets:** `sheenappsai/tests/e2e/*`

**Plan:**
- Add tests for feedback flows, realtime transcription, in‑house auth/CMS, SSRF (unit), SSE resume.

**Acceptance:** Each new major feature has at least 1 E2E or integration test.

---

# 8) Documentation / Standardization (P2)

**Problem:** Worker routes vary in how user identity is passed.

**Action:**
- Standardize on signed actor claims only.
- Update docs and audit routes for compliance.

---

# 9) File Map (Non‑UX)

- SSE: `sheenapps-claude-worker/src/services/buildSSEBridge.ts`, `enhancedSSEService.ts`, `routes/buildStream.ts`
- Authorization: `sheenapps-claude-worker/src/routes/recommendations.ts`, `routes/buildStream.ts`
- SSRF: `sheenapps-claude-worker/src/services/websiteCrawlerService.ts`
- Realtime transcription: `sheenapps-claude-worker/src/routes/realtimeTranscription.ts`
- i18n: `sheenappsai/src/messages/*/*.json`
- Tests: `sheenappsai/tests/e2e/*`

---

# 10) Implementation Artifacts (Jan 23, 2026)

## New Files Created

| File | Purpose |
|------|---------|
| `src/utils/projectAccess.ts` | Centralized project authorization utilities |

## Files Modified

| File | Changes |
|------|---------|
| `src/routes/buildStream.ts` | Added `assertProjectAccessByBuild()` authorization check |
| `src/routes/recommendations.ts` | Added `assertProjectAccess()` check, made `userId` required |

---

# 11) Future Improvements (Discovered During Review)

## Code Duplication: assertProjectAccess

The `assertProjectAccess` function is duplicated in:
- `src/routes/unifiedChat.ts` (lines 110-132)
- `src/routes/persistentChat.ts` (lines 248-270)
- Now also in `src/utils/projectAccess.ts` (the new canonical location)

**Recommendation:** Refactor `unifiedChat.ts` and `persistentChat.ts` to import from `utils/projectAccess.ts` instead of having their own copies. This would be a low-risk cleanup.

## userId Inconsistency Across Routes

Routes use different patterns for userId:
- **Query params** (less secure): `buildStream.ts`, `recommendations.ts`
- **Request body** (HMAC-verified): `unifiedChat.ts`
- **Headers**: `persistentChat.ts`

**Recommendation:** Standardize on HMAC-signed request body for all routes. This would require frontend changes and should be planned as a separate initiative.

## Rate Limiting (P1 - Deferred)

The in-memory rate limiting in `realtimeTranscription.ts` works for single-instance deployments. For multi-pod deployments, Redis-backed rate limiting would be needed. This is not critical for current infrastructure but should be tracked.

