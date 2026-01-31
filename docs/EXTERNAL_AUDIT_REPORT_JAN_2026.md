# SheenApps Platform — External Audit Report (January 23, 2026)

Scope: correctness, security, performance, code quality, i18n/RTL, and test coverage for features shipped in the last ~2 weeks across:
- Frontend: `sheenappsai/` (Next.js 15, React 19)
- Backend: `sheenapps-claude-worker/` (Fastify 5.4, Node 22)

Method: static code review + doc review + targeted consistency checks (no runtime tests executed).

---

## 1) Findings Report (by Severity)

### Critical
- None confirmed from static review.

### High
1) **SSE sequence integrity breaks during replay vs live stream**
   - `BuildSSEBridge` sends missed events using a local `seq` that does **not** advance the live `currentSeq`, so IDs can repeat or go out-of-order if replay and live events overlap. This breaks the `id = seq` invariant and can corrupt client resume logic.  
   - Evidence: `sheenapps-claude-worker/src/services/buildSSEBridge.ts:34-71` and `sheenapps-claude-worker/src/services/buildSSEBridge.ts:93-104`.

2) **Project authorization missing on project-scoped worker endpoints**
   - `/projects/:projectId/recommendations` validates input but does **not** call `assertProjectAccess()` (or equivalent). This violates the stated security requirement and relies solely on HMAC + optional `userId` query param.  
   - Evidence: `sheenapps-claude-worker/src/routes/recommendations.ts:17-121` (no project access check).

3) **SSE build stream endpoint lacks project access enforcement**
   - `/api/v1/builds/:buildId/stream` requires `userId` in query but never verifies that the `userId` has access to the build/project. This violates the “assertProjectAccess on every endpoint” requirement.  
   - Evidence: `sheenapps-claude-worker/src/routes/buildStream.ts:83-191` (no access check beyond required params).

4) **SSRF protection can be bypassed via DNS-resolved private IPs**
   - `WebsiteCrawlerService.validateUrl()` blocks private IPs only by hostname string regex and does **not** resolve DNS. Hostnames that resolve to internal IPs (e.g., `127.0.0.1.nip.io`, or DNS rebinding) can bypass the checks.  
   - Evidence: `sheenapps-claude-worker/src/services/websiteCrawlerService.ts:55-111`.

### Medium
1) **SSE write serialization/backpressure missing**
   - SSE writes are performed directly via `reply.raw.write(...)` from multiple async sources (replay, live events, keep-alives) with no single-writer queue or backpressure handling. This risks interleaved frames and memory growth under load.  
   - Evidence: `sheenapps-claude-worker/src/services/enhancedSSEService.ts:111-125` and `sheenapps-claude-worker/src/routes/buildStream.ts:144-201`.

2) **i18n locale shape mismatch across 9 locales**
   - Locale JSON files are **not** identical in shape. Example: Arabic locales contain extra keys not present in `en`, violating “all locale files must share identical shape.”
   - Examples (extra keys in non-EN):
     - `sheenappsai/src/messages/ar-eg/advisor.json` (+59 keys), `sheenappsai/src/messages/ar-eg/auth.json` (+5 keys), `sheenappsai/src/messages/ar-eg/common.json` (+5 keys), `sheenappsai/src/messages/ar-eg/pricing-page.json` (+18 keys). Similar mismatches in `ar-sa`, `ar`, `ar-ae`, plus smaller mismatches in `de`, `fr`, `es`, `fr-ma`.  
   - Impact: runtime translation lookups drift across locales; type/shape guarantees violated; higher risk of missing keys and inconsistent UX.

3) **Realtime transcription rate limiting is per-instance only**
   - Usage tracking uses in-memory `Map`s, so limits reset per worker instance and can be bypassed in multi-instance deployments.  
   - Evidence: `sheenapps-claude-worker/src/routes/realtimeTranscription.ts:101-110`.

4) **RTL requirement violated in new Feedback UI components**
   - Feedback UI uses physical directions (`left/right`, `text-left`, `pr-6`, `right-4`, etc.) rather than logical start/end, causing RTL layout drift.  
   - Evidence: `sheenappsai/src/components/feedback/FeedbackTab.tsx:122-215`, `sheenappsai/src/components/feedback/MicroSurvey.tsx:253-259`, `sheenappsai/src/components/feedback/CSATSurvey.tsx:271-359`.

### Low
- None documented from this pass.

---

## 2) Security Assessment (Vulnerabilities + Remediation)

1) **SSRF DNS bypass in migration crawler** (High)
   - Risk: internal network access, metadata endpoint probing, and data exfiltration by using public hostnames that resolve to private IPs.
   - Fix: resolve DNS and reject private/loopback/link-local addresses for all resolved A/AAAA records. Consider a hardened allowlist of public IP ranges, and enforce `fetch` via an outbound proxy with egress filtering.
   - Files: `sheenapps-claude-worker/src/services/websiteCrawlerService.ts`.

2) **Missing `assertProjectAccess()` on project-scoped worker routes** (High)
   - Risk: cross-project data access if a signed request is crafted or if upstream request construction is flawed. Violates the “Project authorization on ALL endpoints” policy.
   - Fix: centralize access check (e.g., `assertProjectAccess(projectId, userId)`) and apply to `/projects/:projectId/recommendations` and `/api/v1/builds/:buildId/stream`. Prefer verifying `userId` from signed actor claims rather than query params.
   - Files: `sheenapps-claude-worker/src/routes/recommendations.ts`, `sheenapps-claude-worker/src/routes/buildStream.ts`.

3) **SSE stream corruption risk from multi-writer + replay race** (High)
   - Risk: corrupted event frames, duplicated IDs, broken resume state, client hangs.
   - Fix: implement a single-writer queue per SSE connection, and ensure replay uses the same sequence counter that live events increment. Consider explicit ordering: replay -> set `currentSeq` to last replayed -> then subscribe.
   - Files: `sheenapps-claude-worker/src/services/buildSSEBridge.ts`, `sheenapps-claude-worker/src/services/enhancedSSEService.ts`, `sheenapps-claude-worker/src/routes/buildStream.ts`.

4) **Per-instance rate limiting for realtime transcription** (Medium)
   - Risk: abuse and cost spikes under horizontal scaling.
   - Fix: move usage + concurrency tracking to Redis (or another shared store). There’s already a TODO for this.
   - Files: `sheenapps-claude-worker/src/routes/realtimeTranscription.ts`.

---

## 3) Code Quality Score (per Feature)

Scale: 1–10 (10 = excellent). Scores reflect correctness, security, clarity, and maintainability.

| Feature | Score | Notes |
|---|---:|---|
| 1) Feedback Collection System | 7.5 | Strong validation, idempotency, admin workflows. RTL and logical-property violations in new UI components reduce UX quality. |
| 2) Voice Input & Transcription | 6.5 | Solid HMAC + SSE parsing; rate limiting is in-memory only and needs shared store. |
| 3) Real-time Build Events & Streaming | 6.0 | Good structured events on frontend, but SSE sequence and serialization flaws on backend. |
| 4) In-House Mode / Easy Mode | 7.0 | Good rate limiting + ownership checks; Phase 3 partial; needs tests for auth/session edge cases. |
| 5) Website Migration Tool | 6.0 | SSRF protections are documented but DNS-based bypass remains; Phase 5 not implemented. |
| 6) Arabic SEO & Regional Pages | 8.0 | Regional content and schema additions are solid; no obvious correctness issues found. |
| 7) Templates System | 7.0 | Server-side gating present; ensure plan enforcement and template versions covered by tests. |
| 8) Playwright E2E Coverage | 6.0 | Strong foundation, but new features lack direct E2E coverage. |

---

## 4) Test Gap Analysis (Critical Paths Not Covered)

- **Feedback flows**: No E2E tests for feedback tab, NPS/CSAT/first-build survey, rage-click triggers, or admin triage flows.
- **Voice transcription**: No E2E tests for Web Speech fallback, multipart upload, or admin moderation signed URLs.
- **In-House Mode**: Missing E2E for auth (magic link), CMS CRUD, API key rotation, quotas, custom domains scaffolding, and eject placeholders.
- **Migration Tool**: No automated tests for crawling restrictions (SSRF), analysis → planning → transform stages, or error recovery.
- **SSE stability**: No tests for resume (`Last-Event-ID`) and sequence ordering for build events.
- **Template gating**: No E2E tests to verify PRO template server enforcement or downgrade paths.
- **i18n structure**: No CI check that all locale JSON shapes match; current drift exists.

---

## 5) Recommendations (Prioritized)

1) **Fix SSE sequence integrity**
   - Ensure replay increments the *same* `currentSeq` used for live events; gate live subscription until replay completes.
   - Add single-writer queue per SSE connection to prevent interleaved frames.

2) **Enforce project authorization on all project-scoped worker routes**
   - Introduce `assertProjectAccess()` in `recommendations.ts` and `buildStream.ts`. Pull `userId` from signed claims, not query params.

3) **Harden SSRF defenses in migration crawler**
   - Resolve DNS and reject private IPs for all resolved records. Consider an outbound proxy with strict egress filters.

4) **Add locale-shape validation to CI**
   - Fail builds if any locale JSON deviates from `en` key shape. Repair mismatches by adding missing keys or removing extras.

5) **Replace in-memory transcription limits with Redis**
   - Enforce rate limits and concurrency across pods/instances.

6) **RTL compliance sweep for new UI**
   - Replace `left/right`, `ml/mr`, `pl/pr`, `text-left/right` with logical classes in feedback components.

7) **Add missing E2E coverage**
   - Prioritize: feedback flows, voice transcription fallback, in-house auth/CMS, migration SSRF tests, template gating, SSE resume.

---

## Appendix: Key Files Reviewed

- Feedback UI + APIs: `sheenappsai/src/components/feedback/*`, `sheenappsai/src/app/api/feedback/*`, `sheenappsai/src/app/api/admin/feedback/*`, `sheenapps-claude-worker/src/routes/feedback.ts`, `sheenapps-claude-worker/src/services/feedback/*`
- Voice transcription: `sheenapps-claude-worker/src/routes/realtimeTranscription.ts`, `sheenapps-claude-worker/src/routes/adminVoiceRecordings.ts`
- Build events/SSE: `sheenapps-claude-worker/src/services/buildSSEBridge.ts`, `sheenapps-claude-worker/src/services/enhancedSSEService.ts`, `sheenapps-claude-worker/src/routes/buildStream.ts`, `sheenappsai/src/app/api/builds/[buildId]/events/route.ts`, `sheenappsai/src/hooks/use-clean-build-events.ts`
- Migration crawler: `sheenapps-claude-worker/src/services/websiteCrawlerService.ts`
- In-house mode: `sheenapps-claude-worker/src/routes/inhouseGateway.ts`, `sheenapps-claude-worker/src/routes/inhouseAuth.ts`, `sheenapps-claude-worker/src/routes/inhousePhase3.ts`
- Templates: `sheenappsai/src/app/api/projects/route.ts`, `packages/templates/src/*`
- i18n: `sheenappsai/src/messages/*/*.json`


---

# UX/Journey Addendum (MENA Non‑Tech Focus)

Audience: Arabic-speaking, non‑technical users. Competitive bar: “Lovable/Replit‑level” clarity and momentum. Focused journeys:
1) First‑time onboarding → first build success
2) Iteration loop (edit → regenerate → preview → deploy)
4) In‑house / Easy Mode (auth, CMS, deploy, custom domain)

Method: static UX audit of builder and Easy Mode UI components + flow-level heuristics.

---

## A) First‑time Onboarding → First Build Success

**Strengths (what already helps non‑tech users)**
- Onboarding wizard is visually guided, short, and RTL‑aware (`sheenappsai/src/components/builder/onboarding-wizard.tsx`).
- Auto‑advance on selection reduces clicks and cognitive load.
- Translations are injected, which makes it feasible to provide dialect‑appropriate Arabic.

**Friction Points / Risks**
1) **English microcopy leaks in critical early UX**
   - Feedback surfaces and micro‑surveys in English will appear during early sessions (e.g., “Send Feedback”, “Quick feedback”), which breaks immersion for Arabic‑first users.  
   - Evidence: `sheenappsai/src/components/feedback/FeedbackTab.tsx` (English strings), `sheenappsai/src/components/feedback/MicroSurvey.tsx` (English default strings), `sheenappsai/src/components/feedback/CSATSurvey.tsx` (English labels).

2) **RTL layout inconsistencies in early touchpoints**
   - Feedback UI uses physical left/right positioning; in RTL this can feel “wrong side” and contradicts product localization.  
   - Evidence: `sheenappsai/src/components/feedback/FeedbackTab.tsx`, `MicroSurvey.tsx`, `CSATSurvey.tsx`.

3) **Wizard is not persisted / resumable**
   - Onboarding state is in component state only; refresh or tab close loses progress. For low‑tech users, drop‑offs here are costly.
   - Evidence: `sheenappsai/src/components/builder/onboarding-wizard.tsx` (no storage or URL state).

4) **No explicit “first success” hand‑off**
   - The handoff from wizard completion to “first build started” is not surfaced in the wizard itself; the user is thrown into a dense workspace. This is a known “momentum cliff” for non‑technical users.
   - Evidence: `sheenappsai/src/components/builder/enhanced-workspace-page.tsx` (dense controls, sidebars, multiple panes).

**Recommendations (Prioritized)**
- **P0 UX Quick Win:** Localize feedback and micro‑surveys (Arabic + dialect) and add RTL‑safe positions. This improves the first‑session feel immediately.
- **P1:** Persist onboarding progress in local storage or user profile so users can resume without feeling “lost.”
- **P1:** Add a guided “first build success” moment (explicit “We’re building your app now” step + short explainer for what to expect next). Trigger a visible progress card right after wizard completion.
- **P2:** Add a short “What happens next?” tooltip on entering the workspace for the first time.

---

## B) Iteration Loop (Edit → Regenerate → Preview → Deploy)

**Strengths**
- Builder has rich controls, smart hints, celebration effects, and clear preview/code switcher (`sheenappsai/src/components/builder/enhanced-workspace-page.tsx`).
- Build progress strips and structured build events provide a stable data model for real‑time UI feedback.

**Friction Points / Risks**
1) **Too many simultaneous surfaces for non‑tech users**
   - Workspace opens with sidebar + preview + chat + infrastructure drawer + code view toggle. This “expert density” may overwhelm first‑time users.
   - Evidence: `sheenappsai/src/components/builder/enhanced-workspace-page.tsx` (multiple panes and triggers).

2) **Implicit behaviors (auto‑switch to code view) can confuse novices**
   - Auto‑switching view on build start is useful for power users but can confuse non‑technical users who don’t understand code vs preview.  
   - Evidence: `useUserIdle`/auto‑switch logic in `sheenappsai/src/components/builder/enhanced-workspace-page.tsx`.

3) **Preview controls are powerful but lack “simple mode”**
   - The preview area provides multiple layouts and features; there’s no “safe” default mode that hides advanced controls for first‑time users.
   - Evidence: `sheenappsai/src/components/builder/responsive-preview/*`, `workspace/*`.

**Recommendations (Prioritized)**
- **P0 UX Quick Win:** Add a “Simple Mode” toggle for new users that hides code view and advanced sidebar sections; default to Simple Mode for first 7 days or until 2 successful builds.
- **P1:** Change auto‑switch to code view into an opt‑in (“Show code” prompt), especially for Arabic locales.
- **P1:** Add a single, prominent “Preview → Edit → Regenerate” guidance strip with Arabic microcopy anchored above the preview panel.

---

## C) In‑House / Easy Mode (Auth, CMS, Deploy, Custom Domain)

**Strengths**
- Easy Mode panel is centralized with clear sections: API keys, database, hosting, quotas, CMS, auth (`sheenappsai/src/components/builder/infrastructure/InfrastructurePanel.tsx`).
- Deploy dialog provides progress states + SSE logs, which is excellent for transparency (`sheenappsai/src/components/builder/infrastructure/DeployDialog.tsx`).
- AuthKit dialog provides a built‑in “preview” for signup/signin/magic link flows (`sheenappsai/src/components/builder/infrastructure/auth/AuthKitDialog.tsx`).

**Friction Points / Risks**
1) **CMS manager exposes schema/JSON complexity early**
   - Non‑technical users are presented with schema fields, JSON editor tabs, and validation hints; this is intimidating without a “guided mode.”
   - Evidence: `sheenappsai/src/components/builder/infrastructure/cms/CmsManagerDialog.tsx` (schema builder + JSON editor).

2) **AuthKit preview uses tokens and JSON response logs**
   - Useful for developers but confusing for non‑tech; showing raw tokens and JSON can reduce trust.  
   - Evidence: `sheenappsai/src/components/builder/infrastructure/auth/AuthKitDialog.tsx` (preview response, tokens, session storage details).

3) **Custom domains are Phase‑3 placeholders**
   - UI shows domain tools but real capability is gated; for non‑tech users this creates a “promise gap.”  
   - Evidence: `sheenappsai/src/components/builder/infrastructure/phase3/Phase3ToolsPanel.tsx` (placeholder behavior).

**Recommendations (Prioritized)**
- **P0 UX Quick Win:** Introduce “Guided CMS” mode (simple fields, no JSON tab by default) and hide schema complexity unless “Advanced” is clicked.
- **P1:** Reframe AuthKit UI into a “Test your login flow” step with friendly copy; hide raw token outputs behind a “Developer details” accordion.
- **P1:** In Phase‑3 tools, change CTA text to “Coming soon” with a waitlist/notify action to avoid frustration.
- **P2:** Provide a 3‑step Easy Mode checklist (“Create content type → add entry → deploy”) shown at top of Infrastructure panel.

---

## UX Priority Roadmap (Arabic‑first Competitive Bar)

**P0 (1–2 weeks)**
- Localize all feedback/micro‑survey strings; enforce RTL logical positioning for those components.
- Add “Simple Mode” default for new users; hide code view + advanced sidebar sections.

**P1 (2–4 weeks)**
- Persist onboarding progress; add first‑build success hand‑off card.
- Add guided flow strips in preview area; opt‑in code view.
- Guided CMS + simplified AuthKit UI for non‑tech users.

**P2 (4–6 weeks)**
- Build a “Lifecycle Coach” panel: small checklist for build → iterate → deploy → share.
- Add localized “help moments” based on rage‑click signals and time‑on‑task.

---

## Quick Wins Checklist (Arabic Non‑Tech UX)

- Replace English hard‑coded strings in feedback components.
- Shift feedback/toast positions to logical `start/end` in RTL.
- Provide “first build is running” overlay after wizard completion.
- Add a single “Finish & Publish” CTA after first build completion.
- Hide JSON/raw responses in Easy Mode dialogs by default.

---

## Evidence (Key Files)
- Onboarding: `sheenappsai/src/components/builder/onboarding-wizard.tsx`
- Workspace shell (iteration loop): `sheenappsai/src/components/builder/enhanced-workspace-page.tsx`
- Feedback UI: `sheenappsai/src/components/feedback/FeedbackTab.tsx`, `MicroSurvey.tsx`, `CSATSurvey.tsx`
- Easy Mode panel: `sheenappsai/src/components/builder/infrastructure/InfrastructurePanel.tsx`
- Deploy dialog: `sheenappsai/src/components/builder/infrastructure/DeployDialog.tsx`
- Auth kit: `sheenappsai/src/components/builder/infrastructure/auth/AuthKitDialog.tsx`
- CMS manager: `sheenappsai/src/components/builder/infrastructure/cms/CmsManagerDialog.tsx`

