# In‑House / Easy Mode – Limitations, Gaps & Recommendations
**Date:** 2026-01-29
**Scope:** Plan docs in `docs/Inhouse-Easy-Mode/` + implementation across `sheenappsai`, `sheenapps-claude-worker`, and `sheenapps-packages`.
**Target:** Non‑technical users (Arabic-first). Goal = “one click away” or “no‑click” experience.

---

## Executive Summary (Short)
Easy Mode has strong foundations (gateway, hosting pipeline, auth, CMS, SDKs), but the end‑to‑end experience is **not yet seamless** for non‑technical users. There are **critical integration mismatches**, missing infrastructure wiring, and **developer‑centric UI flows** (JSON schema, SQL console, API keys) that conflict with the “Arabic Replit/Lovable” goal. Phase 3 (domains/export/eject) remains placeholder‑level, and some core endpoints expected by the frontend are missing in the worker.

**Bottom line:** The platform is close architecturally, but the current UX still assumes technical literacy and the runtime wiring is incomplete. Several blockers will prevent a smooth “one‑click to live” path.

---

## What’s Working (High‑Level)
- **In-house deployment pipeline** exists and auto‑deploys Easy Mode builds to in‑house hosting (`sheenapps-claude-worker/src/workers/buildWorker.ts`).
- **DB gateway + project provisioning** are implemented (`sheenapps-claude-worker/src/services/inhouse/InhouseGatewayService.ts`, `sheenapps-claude-worker/src/services/inhouse/InhouseProjectService.ts`).
- **Auth & CMS** services exist (`sheenapps-claude-worker/src/routes/inhouseAuth.ts`, `sheenapps-claude-worker/src/routes/inhouseCms*.ts`) with frontend tooling (`sheenappsai/src/components/builder/infrastructure/auth/*`, `sheenappsai/src/components/builder/infrastructure/cms/*`).
- **Easy/Pro Mode selection** is integrated into project creation (`sheenappsai/src/components/builder/infrastructure/InfraModeSelector.tsx`).
- **SDK ecosystem** is wide and mostly code‑complete (`sheenapps-packages/*` + `docs/Inhouse-Easy-Mode/EASY_MODE_SDK_PLAN.md`).

---

## Critical Gaps & Limitations (Plan ↔ Implementation)

### A) Hard Integration Mismatches (Blockers)
1. **Easy Mode project creation payload mismatch**
   - Worker expects `{ name }`, but Next.js sends `{ projectName }`.
   - Evidence: `sheenapps-claude-worker/src/routes/inhouseProjects.ts` (expects `name`), `sheenappsai/src/server/services/easy-project-service.ts` (sends `projectName`).
   - Impact: Easy Mode creation can return 400 (“name required”).

2. **Public API key return shape mismatch**
   - Worker returns `apiKey.publicKey` but Next.js expects `publicApiKey`.
   - Evidence: `sheenapps-claude-worker/src/routes/inhouseProjects.ts`, `sheenappsai/src/server/services/easy-project-service.ts`.
   - Impact: UI may display missing keys or fail to initialize SDK snippets.

3. **Infrastructure status endpoint missing in worker**
   - Next.js calls `/v1/inhouse/projects/:id/status` but no worker route exists.
   - Evidence: `sheenappsai/src/app/api/inhouse/projects/[id]/status/route.ts` vs no match in `sheenapps-claude-worker/src/routes/inhouseProjects.ts`.
   - Impact: Infrastructure Panel can fail or show “load failed” for every Easy Mode project.

### B) Phase 3 Features Are Still Placeholders
- **Custom domains, export, eject** are gated by env flags and use placeholder verification.
- Evidence: `sheenapps-claude-worker/src/routes/inhouseDomains.ts`, `sheenappsai/src/components/builder/infrastructure/phase3/*`.
- Impact: Any “go live on my domain” path is blocked; the “coming soon” UX is visible, but not functional.

### C) Infra Wiring Still Required (Operational Gaps)
- **Cloudflare R2/KV/Dispatch worker** + **Neon DB** are not provisioned in code; setup is manual.
- Evidence: `docs/Inhouse-Easy-Mode/INHOUSE_INFRA_SETUP.md`.
- Impact: Even with code complete, Easy Mode cannot be fully functional in real environments.

### D) Auth Flow Not Production‑Ready
- **Magic link emails are not sent** (token is returned only in non‑prod logic).
- Evidence: `sheenapps-claude-worker/src/routes/inhouseAuth.ts` (comments: “Production: Token sent via email, don’t return it”).
- Impact: End‑user auth will fail in production unless email delivery is wired.

### E) SDK Rollout Requires Manual Migrations & Env
- Six migrations and multiple env vars are still required to enable SDKs (secrets/email/payments/analytics/backups).
- Evidence: `docs/Inhouse-Easy-Mode/EASY_MODE_REMAINING.md`.
- Impact: “Batteries included” promise breaks if migrations/env are missing.

---

## UX / User Journey Analysis (Non‑Technical Users)

### Overall Journey Rating (today)
- **Ease:** 2/5 (still too technical)
- **Completeness:** 3/5 (core pieces exist, but several flows are placeholders)
- **Integration:** 2/5 (API mismatches + missing wiring)
- **Smoothness:** 2/5 (manual steps, no guided flow, unclear live status)

### Step‑by‑Step Journey (Current Reality)
1. **Start Project (Easy Mode selection)**
   - ✅ Mode selection exists (`sheenappsai/src/components/builder/infrastructure/InfraModeSelector.tsx`).
   - ❌ Easy Mode create request may fail due to request shape mismatch (see above).
   - ⚠️ No explicit “no‑click” promise; user still must choose and submit.

2. **Build & Deploy**
   - ✅ Worker auto‑deploys for Easy Mode (`sheenapps-claude-worker/src/workers/buildWorker.ts`).
   - ❌ UI still shows manual Deploy flows and buttons (`sheenappsai/src/components/persistent-chat/build-run-card.tsx`, `sheenappsai/src/components/builder/infrastructure/DeployButton.tsx`).
   - ⚠️ “Preview” vs “Live” messaging is ambiguous for non‑technical users.

3. **Content (CMS)**
   - ✅ CMS admin UI exists.
   - ❌ Content type creation requires JSON schema input (`sheenappsai/src/components/builder/infrastructure/cms/CmsManagerDialog.tsx`).
   - ❌ No simple “form builder” for non‑technical users.

4. **Auth**
   - ✅ Auth kit exists.
   - ❌ UX is developer‑oriented (snippets + API key usage) (`sheenappsai/src/components/builder/infrastructure/auth/AuthKitDialog.tsx`).
   - ❌ Magic‑link emails not wired in production (`sheenapps-claude-worker/src/routes/inhouseAuth.ts`).

5. **Go Live / Custom Domain**
   - ❌ Domains are “coming soon” or disabled (Phase 3 placeholder).
   - ❌ No domain purchase or verification wizard.

6. **Growth & Operations (Email, Payments, Analytics, Jobs)**
   - ✅ SDKs exist.
   - ❌ No user‑friendly UI flows; requires technical integration.
   - ❌ Migrations/env keys required (easy mode isn’t zero‑setup).

**Takeaway:** The UX still assumes technical knowledge for CMS schemas, auth, API keys, and data queries. For Arabic “Replit/Lovable,” the core tasks must be *task‑driven*, not *developer‑driven*.

---

## Features That Logically Should Exist (Given the Goal)

### For “One‑Click / No‑Click” Experience
- **Auto‑publish** when build completes + clear “Your site is live” confirmation.
- **Zero‑touch hosting** (no Deploy dialog unless rollback needed).
- **Auto‑provisioned content types** (AI‑generated schema from prompt).
- **Pre‑filled sample data** so users instantly see content.

### For Non‑Technical Users
- **Form‑based CMS schema builder** (no JSON required).
- **Simple “Enable Login” toggle** that adds login/signup UI automatically.
- **Built‑in user management panel** (view users, reset password, etc.).
- **Guided checklist** (“Add content → Publish → Connect domain”).

### For “Arabic Replit/Lovable” Positioning
- **Visual click‑to‑edit** (edit live UI without code).
- **AI QA / self‑testing** (auto‑click and validate flows).
- **One‑click domain purchase + DNS setup** (no CNAME copying).
- **In‑product walkthroughs** for non‑technical Arabic users.

---

## Recommendations (Prioritized)

### P0 — Must Fix Before Public Beta
1. **Fix API contract mismatches** (Easy Mode create request + response shape).
   - `sheenappsai/src/server/services/easy-project-service.ts`
   - `sheenapps-claude-worker/src/routes/inhouseProjects.ts`
2. **Implement `/v1/inhouse/projects/:id/status`** in worker or change proxy to existing endpoint.
3. **Wire production magic‑link email delivery** using `InhouseEmailService`.
4. **Ship infra wiring** (R2/KV/Dispatch/Neon) per `docs/Inhouse-Easy-Mode/INHOUSE_INFRA_SETUP.md`.
5. **Add contract tests** for every `/api/inhouse/*` proxy vs worker endpoint (prevent future drift).

### P1 — UX & Onboarding (Non‑Technical Readiness)
1. **Simplify CMS schema creation** with a form builder UI and AI‑assisted schema generation.
2. **Make Easy Mode truly “auto‑deploy”** (remove or de‑emphasize manual Deploy unless rollback).
3. **Add a 3‑step guided checklist** on the Infrastructure panel (content → publish → domain).
4. **Hide developer panels by default** (API keys, SQL console) unless user explicitly opts‑in.
5. **Show “Your site is live at …”** once Easy Mode deploy completes.

### P2 — Growth‑Ready Experience
1. **Custom domain wizard** (step‑by‑step, auto‑verify, status polling).
2. **Payments + Email + Analytics “one‑click setup” flows** (no SDK usage required).
3. **Surface “Run Hub” features** (leads/orders/notifications) as a simplified dashboard for non‑technical users.
4. **Apply pending migrations + env checks** in CI/CD (avoid manual steps).

### P3 — Competitive Moat
1. **Visual click‑to‑edit** (Lovable‑style UX).
2. **Agent self‑testing** (Replit‑style autopilot QA).
3. **One‑click domain purchase** + SSL provisioning.

---

## Suggested Next Actions (Concrete)
1. **Add missing worker status endpoint** and update any mismatched field names.
2. **Align Easy Mode creation response** to match frontend expectations (or update frontend contract).
3. **Build a “Simple CMS” wizard** (form‑builder UI) and hide JSON schema editor behind “Advanced”.
4. **Replace Deploy button** with “Live” badge in Easy Mode by default.
5. **Plan a short E2E smoke suite** for Easy Mode (create → build → live URL → CMS entry).

---

## Appendix: File Evidence (Key)
- **Easy Mode create mismatch:**
  - `sheenappsai/src/server/services/easy-project-service.ts`
  - `sheenapps-claude-worker/src/routes/inhouseProjects.ts`
- **Missing status endpoint:**
  - `sheenappsai/src/app/api/inhouse/projects/[id]/status/route.ts`
  - `sheenapps-claude-worker/src/routes/inhouseProjects.ts`
- **Auto‑deploy vs UI deploy:**
  - `sheenapps-claude-worker/src/workers/buildWorker.ts`
  - `sheenappsai/src/components/persistent-chat/build-run-card.tsx`
- **CMS JSON schema requirement:**
  - `sheenappsai/src/components/builder/infrastructure/cms/CmsManagerDialog.tsx`
- **Auth kit dev‑oriented + magic link not emailed:**
  - `sheenappsai/src/components/builder/infrastructure/auth/AuthKitDialog.tsx`
  - `sheenapps-claude-worker/src/routes/inhouseAuth.ts`
- **Phase 3 placeholders:**
  - `sheenapps-claude-worker/src/routes/inhouseDomains.ts`
  - `sheenappsai/src/components/builder/infrastructure/phase3/Phase3ToolsPanel.tsx`
- **Infra wiring checklist:**
  - `docs/Inhouse-Easy-Mode/INHOUSE_INFRA_SETUP.md`
- **SDK migrations/env tasks:**
  - `docs/Inhouse-Easy-Mode/EASY_MODE_REMAINING.md`
