# In-House Mode: Gap Analysis & Recommendations

**Date**: 2026-01-16
**Author**: Claude (Technical Analysis)
**Scope**: Cross-reference of planning docs vs actual implementation in sheenapps-claude-worker and sheenappsai

---

## Executive Summary

After analyzing all 4 planning documents and cross-referencing with the actual codebase, the In-House Mode implementation is **substantially complete** with excellent code quality. However, there are **critical gaps** that need attention before production launch.

### Overall Status

| Phase | Plan Status | Implementation Status | Gap |
|-------|-------------|----------------------|-----|
| **Phase 1: Infrastructure** | Complete | 95% | Infrastructure connections |
| **Phase 2: Auth + CMS** | Complete | 98% | Minor polish |
| **Phase 3: Domains/Export/Eject** | Complete | 40% | Feature flags + real integration |
| **SDK Packages** | Documented | 90% | Not published to npm |
| **Dispatch Worker** | Documented | 90% | Not deployed to production |

### Beta Definition (Revised per Expert Review)

**Beta Promise**: Phase 1 + Phase 2 + deploy happy-path working end-to-end.
**Phase 3**: Disabled with "coming soon" UI (domains/exports/eject are real projects, not small tasks).

**Launch Criterion**: A green end-to-end smoke test in staging. Code completeness ≠ launch readiness.

---

## PART 0: Launch Gates (Expert Review - 2026-01-16)

**Approach**: Think in gates. Don't start Gate 2 until Gate 1 is green.

### Gate 1 — "Can this system even run in staging?"

Goal: Create project → query DB → use CMS/auth → deploy once → end-to-end on staging.

| # | Task | Status | Owner | Notes |
|---|------|--------|-------|-------|
| 1.1 | Provision CF resources (R2, KV, dispatch) | **BLOCKED** | DevOps | Need CF account access |
| 1.2 | Provision Neon database URL | **BLOCKED** | DevOps | Need Neon account access |
| 1.3 | Add worker env validation (Zod, fail fast) | **DONE** | Backend | `envValidation.ts` updated |
| 1.4 | Deploy worker + Next.js to staging | **BLOCKED** | DevOps | Needs 1.1, 1.2 |
| 1.5 | Run smoke test script | **BLOCKED** | DevOps | Needs 1.4 |

**Smoke Test Script Should Cover**:
- Create project → get API key
- `/db/health`
- Create CMS type → create entry → list public entries
- Auth sign-up/sign-in → read /user
- Deploy tiny build artifact → verify hosting status

**Deliverable**: One CI job (or manual script) that prints ✅/❌

### Gate 2 — "Prevent the easiest disasters"

Goal: Safe enough that a beta user can't accidentally (or intentionally) knock you over.

| # | Task | Status | Owner | Notes |
|---|------|--------|-------|-------|
| 2.1 | Auth rate limiting | **DONE** | Backend | sign-up, sign-in, magic-link all rate-limited |
| 2.2 | HMAC replay prevention | **DONE** | Backend | Already in `HmacSignatureService` - nonce + timestamp + Redis TTL |
| 2.3 | Sentry integration (worker + Next.js) | **TODO** | Full-stack | Errors + performance basics |

**HMAC Replay Prevention Design**:
- Require headers: `x-sheen-ts`, `x-sheen-nonce`
- Signature covers: method + path + body + ts + nonce
- Store nonce in KV/Redis for TTL (5-10 min) keyed by (projectId, nonce)
- Reject if seen before, or if ts skew > N minutes

### Gate 3 — "Make the product flow not feel broken"

Goal: Users can complete the "deploy" workflow without hitting missing endpoints.

| # | Task | Status | Owner | Notes |
|---|------|--------|-------|-------|
| 3.1 | Implement Build Artifacts API | **DONE** | Backend | `buildArtifacts.ts` + Next.js API route |
| 3.2 | Keep Phase 3 disabled | **DONE** | N/A | Feature flags already in place |

### What NOT To Do Yet (Avoid Productivity Trap)

| Item | Why Defer |
|------|-----------|
| Full admin dashboard | Not a launch gate |
| Full translations | Ship EN-only beta with clear fallback |
| Custom domains + export processor | Real projects, not small tasks |
| SDK npm publishing | Internal beta can use workspace packages |
| Singleton pattern (everywhere) | Only target real leaks: DB pool, Redis, CF clients |

### Concrete Action List

**Today**:
1. ~~Provision CF resources + Neon URL~~ (BLOCKED - need account access)
2. ~~Add worker env validation (Zod, fail fast)~~ ✅ DONE (2026-01-16)
3. ~~Deploy to staging~~ (BLOCKED)
4. ~~Run smoke tests~~ (BLOCKED)

**Tomorrow**:
5. ~~Add auth rate limiting~~ ✅ DONE (2026-01-16) - sign-up now rate-limited
6. ~~Add HMAC replay prevention~~ ✅ ALREADY DONE (exists in `HmacSignatureService`)
7. Add Sentry ← **CAN DO NOW** (config only)

**Then**:
8. ~~Build artifacts endpoint~~ ✅ DONE (2026-01-16) - `buildArtifacts.ts` worker route + `/api/builds/[buildId]/artifacts` Next.js route

**Nice-to-have (completed)**:
9. ~~Auth UI enhancements~~ ✅ DONE (2026-01-16) - `AuthKitDialog.tsx` now has:
   - Session persistence (localStorage, keyed by project)
   - Current user display with logged-in email
   - Sign-out button
   - Auto-restore session on dialog open
   - Session verification against backend

---

## Part 1: Document Analysis

### 1.1 INHOUSE_MODE_PLAN.md (Main Planning Doc)

**Status**: Comprehensive, well-maintained, implementation log up-to-date

**Key Sections Verified**:
- [x] Phase 1 tasks marked complete (API Gateway, Neon integration, Dispatch Worker, SDK)
- [x] Phase 2 tasks marked complete (Auth, CMS)
- [x] Expert review fixes documented (5 rounds)
- [x] Implementation discoveries logged with dates

**Gaps Found**:
| Section | Issue | Status |
|---------|-------|--------|
| Part 10: Implementation Log | Last update 2026-01-15 | Needs update with recent security fixes |
| Phase 4 (Scale & Harden) | Not started | Expected - future work |
| Improvement Ideas | 5 items listed | None addressed yet |

---

### 1.2 INHOUSE_MODE_IMPLEMENTATION_REVIEW.md

**Status**: Thorough code review, accurate assessment

**Recommendations Status**:

| Priority | Recommendation | Status | Notes |
|----------|---------------|--------|-------|
| Immediate | Fix resource leaks (singleton) | **NOT DONE** | Services still instantiated per-route |
| Immediate | Add environment validation | **NOT DONE** | No startup validation |
| Immediate | Add Zod validation | **PARTIALLY** | Some routes have Zod, not all |
| Immediate | Add error tracking | **NOT DONE** | No Sentry integration |
| Immediate | Add health checks | **PARTIAL** | `/v1/inhouse/db/health` exists |
| Short-term | Build SDK packages | **DONE** | Packages exist in `/packages/` |
| Short-term | Add testing coverage | **NOT DONE** | No tests found |
| Short-term | Implement custom domains | **PARTIAL** | Routes exist, CF integration missing |

---

### 1.3 INHOUSE_MODE_DEEP_DIVE_REVIEW.md

**Status**: Detailed 100% code review, accurate findings

**Critical Missing Pieces Identified**:

| Item | Status | Current State |
|------|--------|---------------|
| Translation files | **PARTIAL** | Some keys exist, 9 locales incomplete |
| Project creation flow | **DONE** | InfraModeSelector exists |
| Build artifacts API | **NOT IMPLEMENTED** | `/api/builds/[buildId]/artifacts` missing |
| Phase 3 integration | **PLACEHOLDER** | Routes work, no real CF integration |

**Production Readiness Checklist Review**:

```
Infrastructure:
[ ] Neon database connection configured - NEEDS SETUP
[ ] R2 bucket created - NEEDS SETUP
[ ] Workers for Platforms namespace - NEEDS SETUP
[ ] KV namespaces - NEEDS SETUP
[ ] Environment variables validated - NOT IMPLEMENTED
[x] Health check endpoints exist

API Endpoints:
[x] CMS admin routes working
[x] CMS public routes working
[x] Auth routes working
[x] Phase 3 placeholder routes working
[ ] Build artifacts route - NOT IMPLEMENTED (required for DeployDialog)
[ ] Export status polling - NOT IMPLEMENTED
[ ] Domain verification webhook - NOT IMPLEMENTED

Frontend Components:
[x] CmsManagerDialog (936 lines)
[x] AuthKitDialog (432 lines)
[x] Infrastructure drawer
[x] Phase 3 tools panel
[x] Project creation with mode selector
[x] Infrastructure panel
[ ] Export job status polling UI - NOT IMPLEMENTED
[ ] Domain verification status UI - NOT IMPLEMENTED
[ ] Eject wizard (multi-step) - NOT IMPLEMENTED
```

---

### 1.4 INHOUSE_MODE_FRONTEND_PLAN.md

**Status**: Comprehensive but partially outdated

**Plan vs Reality**:

| Planned Component | Location | Exists? |
|------------------|----------|---------|
| InfrastructurePanel | `/components/builder/infrastructure/` | **YES** |
| DatabaseCard | Same | **YES** (DatabaseStatusCard) |
| HostingCard | Same | **YES** (HostingStatusCard) |
| QuotasCard | Same | **YES** |
| ApiKeysPanel | Same | **YES** (ApiKeysCard) |
| SchemaBrowser | `/components/builder/infrastructure/database/` | **YES** |
| CreateTableDialog | Same | **YES** |
| QueryConsole | Same | **YES** |
| DeploymentCard | `/components/builder/infrastructure/` | **PARTIAL** (DeployButton + DeployDialog) |
| DeploymentHistory | Same | **NO** |
| LogsViewer | Same | **NO** |
| EjectButton | Same | **PARTIAL** (Phase3PlaceholdersCard) |
| Admin Dashboard | `/app/admin/inhouse/` | **NO** |
| System Health | Same | **NO** |
| Abuse Detection | Same | **NO** |

---

## Part 2: Backend Analysis (sheenapps-claude-worker)

### 2.1 Services Implemented

| Service | File | Lines | Status |
|---------|------|-------|--------|
| InhouseGatewayService | `services/inhouse/InhouseGatewayService.ts` | ~1200 | Complete |
| InhouseProjectService | `services/inhouse/InhouseProjectService.ts` | ~500 | Complete |
| InhouseDeploymentService | `services/inhouse/InhouseDeploymentService.ts` | ~400 | Complete |
| InhouseAuthService | `services/inhouse/InhouseAuthService.ts` | ~325 | Complete |
| InhouseCmsService | `services/inhouse/InhouseCmsService.ts` | ~337 | Complete |

### 2.2 Routes Implemented

| Route File | Endpoints | Auth Method |
|------------|-----------|-------------|
| inhouseGateway.ts | /db/query, /db/schema, /db/health | API Key |
| inhouseProjects.ts | /projects/*, /tables | HMAC |
| inhouseDeployment.ts | /deploy, /rollback | HMAC |
| inhouseAuth.ts | /sign-up, /sign-in, /magic-link, /user, /sign-out | API Key |
| inhouseCms.ts | /cms/types, /cms/entries, /cms/media | API Key |
| inhouseCmsAdmin.ts | /cms/admin/* | HMAC |
| inhousePhase3.ts | /domains, /exports, /eject | HMAC + Feature Flags |

### 2.3 Backend Gaps

| Gap | Priority | Effort | Notes |
|-----|----------|--------|-------|
| Singleton service pattern | P0 | 2h | Resource leak risk |
| Redis rate limiting | P1 | 4h | Currently in-memory |
| Monitoring/alerting | P1 | 1d | No Sentry/metrics |
| Real CF for SaaS integration | P2 | 2d | Domains placeholder |
| Export job processor | P2 | 1d | Route exists, no worker |
| Eject workflow | P3 | 3d | Request tracking only |

---

## Part 3: Frontend Analysis (sheenappsai)

### 3.1 API Routes Implemented

```
src/app/api/inhouse/
├── deploy/route.ts
├── query/route.ts
└── projects/
    ├── create/route.ts
    └── [id]/
        ├── schema/route.ts
        ├── status/route.ts
        ├── tables/route.ts
        ├── cms/
        │   ├── entries/route.ts
        │   ├── entries/[entryId]/route.ts
        │   ├── media/route.ts
        │   └── types/route.ts
        ├── domains/route.ts
        ├── domains/[domain]/verify/route.ts
        ├── eject/route.ts
        └── exports/route.ts
```

**Total**: 13 API routes (matches plan)

**Missing Route**:
- `/api/builds/[buildId]/artifacts` - Required by DeployDialog to fetch build output before deployment

### 3.2 Components Implemented

```
src/components/builder/infrastructure/
├── InfrastructurePanel.tsx (main panel)
├── InfraModeSelector.tsx (Easy/Pro toggle)
├── DatabaseStatusCard.tsx
├── HostingStatusCard.tsx
├── QuotasCard.tsx
├── ApiKeysCard.tsx
├── DeployButton.tsx
├── DeployDialog.tsx
├── database/
│   ├── SchemaBrowser.tsx
│   ├── CreateTableDialog.tsx
│   └── QueryConsole.tsx
├── auth/
│   ├── AuthStatusCard.tsx
│   └── AuthKitDialog.tsx
├── cms/
│   ├── CmsStatusCard.tsx
│   └── CmsManagerDialog.tsx
└── phase3/
    ├── Phase3PlaceholdersCard.tsx
    └── Phase3ToolsPanel.tsx
```

**Total**: 17 components (exceeds plan)

### 3.3 Frontend Gaps

| Gap | Priority | Effort | Notes |
|-----|----------|--------|-------|
| Deployment history component | P1 | 4h | Plan shows need |
| Logs viewer component | P1 | 4h | Plan shows need |
| Admin dashboard pages | P2 | 2d | Plan shows 4 pages |
| Export status polling UI | P2 | 4h | Linked to backend |
| Domain verification UI | P2 | 4h | Linked to backend |
| Eject wizard | P3 | 1d | Multi-step modal |
| Translation files (9 locales) | P1 | 2d | Critical for i18n |

---

## Part 4: SDK Package Analysis

### 4.1 Package Status

| Package | Location | Has src/ | Has dist/ | package.json | Published |
|---------|----------|----------|-----------|--------------|-----------|
| @sheenapps/db | `/packages/db/` | Yes | No | Yes | **NO** |
| @sheenapps/cms | `/packages/cms/` | Yes | Yes | Yes | **NO** |
| @sheenapps/auth | `/packages/auth/` | Yes | No | Yes | **NO** |
| dispatch-worker | `/packages/dispatch-worker/` | Yes | No | ? | **NO** |

### 4.2 SDK Gaps

| Gap | Priority | Effort |
|-----|----------|--------|
| Build all packages | P0 | 1h |
| Publish to npm | P0 | 30min |
| Add JSDoc comments | P1 | 2h |
| Add README examples | P1 | 2h |
| Add TypeScript definitions | P0 | 1h |

---

## Part 5: Infrastructure Setup Gaps

### 5.1 INHOUSE_INFRA_SETUP.md Checklist

| Item | Status | Notes |
|------|--------|-------|
| Dispatch Worker deployment | **NOT DONE** | `packages/dispatch-worker/` exists |
| R2 smoke test | **NOT RUN** | Script exists |
| Neon Postgres connection | **NOT CONFIGURED** | Placeholder URL |
| KV namespaces created | **NOT DONE** | Placeholder IDs in wrangler.toml |
| Dispatch namespace created | **NOT DONE** | Placeholder in config |
| Feature flags configured | **NOT DONE** | Env vars not set |

### 5.2 Environment Variables Needed

**Worker**:
```
NEON_DATABASE_URL=
CF_ACCOUNT_ID=
CF_API_TOKEN_R2=
CF_R2_BUCKET_BUILDS=
CF_R2_BUCKET_MEDIA=
DISPATCH_NAMESPACE_ID=
KV_NAMESPACE_HOSTNAME_MAP=
KV_NAMESPACE_PROJECT_BUILDS=
INHOUSE_CUSTOM_DOMAINS_ENABLED=false
INHOUSE_EXPORTS_ENABLED=false
INHOUSE_EJECT_ENABLED=false
```

**Next.js**:
```
WORKER_URL=
(plus standard auth vars)
```

---

## Part 6: Security Review Status

### 6.1 Expert Review Fixes Applied

| Round | Issues | Fixed | Notes |
|-------|--------|-------|-------|
| Round 1 | Initial implementation | Yes | |
| Round 2 | UUID validation, userId removal, media hardening | Yes | |
| Round 3 | Empty PATCH, error handling, filename/domain validation | Yes | |
| Round 4 | (from plan log) | Yes | Multiple security issues |
| Round 5 | (from plan log) | Yes | KV encoding, quota increment |

### 6.2 Remaining Security Items

| Item | Priority | Status |
|------|----------|--------|
| HMAC replay prevention | P1 | **NEEDS AUDIT** |
| Scrypt N parameter (16384 vs 65536) | P2 | Lower than OWASP rec |
| Rate limiting on auth endpoints | P1 | **NOT IMPLEMENTED** |
| Session revocation by user ID | P2 | Only per-token |
| Abuse detection alerting | P2 | **NOT IMPLEMENTED** |

---

## Part 7: Consolidated Recommendations

### 7.1 Critical (Before Any Launch)

| # | Task | Owner | Effort | Blocker? |
|---|------|-------|--------|----------|
| 1 | Deploy infrastructure (R2, KV, dispatch namespace) | DevOps | 4h | **YES** |
| 2 | Configure environment variables | DevOps | 1h | **YES** |
| 3 | Run R2 + Neon smoke tests | DevOps | 1h | **YES** |
| 4 | Fix singleton service pattern | Backend | 2h | Risk |
| 5 | Build and publish SDK packages | Backend | 2h | **YES** |

### 7.2 High Priority (Before Beta)

| # | Task | Owner | Effort |
|---|------|-------|--------|
| 6 | Implement Build Artifacts API | Backend | 2h |
| 7 | Add rate limiting to auth endpoints | Backend | 4h |
| 8 | Add error tracking (Sentry) | Full-stack | 4h |
| 9 | Complete deployment history UI | Frontend | 4h |
| 10 | Complete logs viewer UI | Frontend | 4h |
| 11 | Add startup environment validation | Backend | 2h |

### 7.3 Medium Priority (Before GA)

| # | Task | Owner | Effort |
|---|------|-------|--------|
| 12 | Implement custom domains (CF for SaaS) | Backend | 2d |
| 13 | Implement export job processor | Backend | 1d |
| 14 | Add admin dashboard pages (4) | Frontend | 2d |
| 15 | Complete translation files (9 locales) | Frontend | 2d |
| 16 | Move rate limiting to Redis | Backend | 4h |
| 17 | Add testing coverage (unit + integration) | Full-stack | 1w |
| 18 | Write documentation (API, SDK, user guides) | Full-stack | 1w |

### 7.4 Lower Priority (Future)

| # | Task | Owner | Effort |
|---|------|-------|--------|
| 19 | Implement eject wizard | Full-stack | 3d |
| 20 | Add abuse detection alerting | Backend | 1w |
| 21 | Add usage analytics dashboard | Frontend | 1w |
| 22 | CMS enhancements (rich text editor, image picker, conditional fields) | Frontend | 1w |
| 23 | Increase scrypt N to 65536 | Backend | 1h |
| 24 | Add HMAC replay prevention | Backend | 4h |

---

## Part 8: Risk Assessment

### 8.1 Launch Blockers

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Infrastructure not deployed | App won't work | **HIGH** (current) | Deploy before launch |
| SDK not published | Users can't integrate | **HIGH** (current) | Publish packages |
| Memory leak from services | Worker OOM | Medium | Fix singleton pattern |

### 8.2 Beta Acceptable

| Risk | Impact | Why Acceptable |
|------|--------|----------------|
| Missing translations | Non-EN users see EN | Can ship EN-only beta |
| No admin dashboard | Internal visibility | Manual DB queries OK for beta |
| No deployment history | UX inconvenience | Can be added post-beta |
| Placeholder Phase 3 | Features disabled | Feature flags prevent access |

---

## Part 9: Suggested Launch Timeline

### Week 1: Infrastructure Setup
- Day 1-2: Deploy CF resources (R2, KV, dispatch namespace)
- Day 2-3: Configure env vars, run smoke tests
- Day 3-4: Fix singleton pattern, add env validation
- Day 4-5: Build + publish SDK packages

### Week 2: Stabilization
- Day 1-2: Add Sentry integration
- Day 2-3: Add auth rate limiting
- Day 3-5: Internal testing, bug fixes

### Week 3: Beta Launch
- Day 1: Soft launch (internal users)
- Day 2-3: Bug fixes
- Day 4-5: Expand to beta users

### Week 4+: Post-Beta
- Complete deployment history/logs UI
- Add admin dashboard
- Complete translations
- Implement custom domains
- Implement export jobs

---

## Appendix A: Files to Update in Plan Docs

After implementation, update these sections:

**INHOUSE_MODE_PLAN.md**:
- Part 10: Add entry for recent security fixes
- Phase tracker: Mark items complete

**INHOUSE_MODE_IMPLEMENTATION_REVIEW.md**:
- Production Readiness Checklist: Update checked items
- Status: Update from "Ready for Beta Launch" to current

**INHOUSE_MODE_FRONTEND_PLAN.md**:
- Part 12: Update implementation decisions with new findings
- Appendix: Verify file structure matches reality

**INHOUSE_API_ENDPOINTS.md**:
- Next Steps section: Check off completed items
- Add any new endpoints

---

## Appendix B: Quick Verification Commands

```bash
# Check worker services exist
ls -la /Users/sh/Sites/sheenapps/sheenapps-claude-worker/src/services/inhouse/

# Check Next.js API routes exist
find /Users/sh/Sites/sheenapps/sheenappsai/src/app/api/inhouse -name "*.ts" | wc -l

# Check frontend components exist
ls -la /Users/sh/Sites/sheenapps/sheenappsai/src/components/builder/infrastructure/

# Check SDK packages exist
ls -la /Users/sh/Sites/sheenapps/packages/

# Check dispatch worker exists
ls -la /Users/sh/Sites/sheenapps/packages/dispatch-worker/
```

---

## Appendix C: INHOUSE_MODE_DEEP_DIVE_REVIEW.md Recommendations Status

Cross-reference of all recommendations from the deep-dive review:

### Immediate (Before Staging)

| # | Recommendation | Status | Where in This Doc |
|---|----------------|--------|-------------------|
| 1 | Fix Singleton Pattern | **STILL NEEDED** | Critical #4 |
| 2 | Add Translation Scaffolding | **STILL NEEDED** | Medium #15 |
| 3 | Implement Build Artifacts API | **STILL NEEDED** | High #6 |
| 4 | Add Environment Validation | **STILL NEEDED** | High #11 |

### Short-Term (1-2 Weeks)

| # | Recommendation | Status | Where in This Doc |
|---|----------------|--------|-------------------|
| 5 | Project Creation Modal | **DONE** | N/A (InfraModeSelector exists) |
| 6 | Infrastructure Trigger | **DONE** | N/A (infrastructure-trigger.tsx exists) |
| 7 | SDK Packages | **DONE** (not published) | Critical #5 |
| 8 | Export Job Polling | **STILL NEEDED** | Medium #13 |
| 9 | Custom Domain Verification | **STILL NEEDED** | Medium #12 |
| 10 | Testing Coverage | **STILL NEEDED** | Medium #17 |

### Medium-Term (1 Month)

| # | Recommendation | Status | Where in This Doc |
|---|----------------|--------|-------------------|
| 11 | Eject Wizard | **STILL NEEDED** | Lower #19 |
| 12 | CMS Enhancements | **STILL NEEDED** | Lower #22 |
| 13 | Monitoring & Alerts | **STILL NEEDED** | High #8 (Sentry) |
| 14 | Documentation | **STILL NEEDED** | Medium #18 |

### Summary

- **Done**: 3 items (Project Creation, Infrastructure Trigger, SDK code)
- **Still Needed**: 11 items (all included in this gap analysis)

---

**Document generated**: 2026-01-16
**Updated**: 2026-01-16 (added missing items from DEEP_DIVE_REVIEW)
**Status**: Gap analysis complete
**Next step**: Execute Critical recommendations (Part 7.1)
