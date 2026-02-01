# SheenApps Easy Mode: Mobile App (iOS/Android) Analysis & Implementation Plan

**Date**: 2026-01-30 (Updated 2026-02-01 for monorepo)
**Status**: Proposal / Analysis Phase
**Target Audience**: External Expert Review
**Related Docs**: [EASY_MODE_IMPLEMENTATION_PLAN.md](./EASY_MODE_IMPLEMENTATION_PLAN.md), [EASY_MODE_FUTURE_PHASES.md](./EASY_MODE_FUTURE_PHASES.md), [MONOREPO_ANALYSIS_AND_PLAN.md](./MONOREPO_ANALYSIS_AND_PLAN.md)

---

## Executive Summary

This document analyzes the proposal to build a companion mobile app (iOS/Android) for SheenApps Easy Mode. The app would enable non-technical users — primarily Arabic-speaking small business owners — to manage their websites, content, and business operations on the go.

**Current Status**: Listed as Priority 3 feature for Q2+ 2026 with an estimated 4-6 week effort.

**Key Finding**: The backend infrastructure (18 SDKs, comprehensive API layer, real-time capabilities) is mature enough to support a mobile app. However, the web UX for Easy Mode itself has pending blockers that should be resolved first. A phased mobile approach focusing on read-heavy operations (dashboard, notifications) before write operations (content editing) is recommended.

**Critical Architecture Decision**: Mobile apps cannot safely hold HMAC secrets. The recommended approach is for the mobile app to call the Next.js backend (`apps/web`) as an API gateway, which then handles HMAC signing to the worker. This reuses the existing trust boundary with minimal backend changes.

---
Architecture

Mobile App (Expo)
    → Session token auth (no secrets on device)
    → Next.js Gateway (handles HMAC)
    → Worker

---
Phases
┌───────┬───────┬──────────────────────────────────────────────┐
│ Phase │ Weeks │                 Deliverable                  │
├───────┼───────┼──────────────────────────────────────────────┤
│ 1A    │ 1-3   │ Auth + Dashboard + KPIs (no push)            │
├───────┼───────┼──────────────────────────────────────────────┤
│ 1B    │ 4-5   │ Push notifications                           │
├───────┼───────┼──────────────────────────────────────────────┤
│ 2     │ 6-8   │ CMS viewing/editing, leads, orders           │
├───────┼───────┼──────────────────────────────────────────────┤
│ 3     │ 9-11  │ Rich editor, workflows, app store submission │
└───────┴───────┴──────────────────────────────────────────────┘
---
Key Decisions

- Framework: Expo (React Native)
- Gateway: Thin BFF (single /api/gateway/[...path] route, not parallel API)
- Auth: OTP-first (6-digit code primary, magic link fallback)
- Push: Provider-agnostic (Expo Push for MVP, can swap to FCM later)
- Real-time: Push + pull-to-refresh (no SSE on mobile)
- Phase 1 split: Ship dashboard value before tackling push complexity

---

## Current Status - 1 Feb 2026 - Updated

### What Exists (All Infrastructure) ✅

| Component | Location | Status |
|-----------|----------|--------|
| Gateway route | apps/web/src/app/api/gateway/[...path]/route.ts | ✅ Exists |
| Mobile auth routes | apps/web/src/app/api/mobile/auth/ | ✅ 3 endpoints exist |
| Worker mobile auth | apps/worker/src/routes/platformMobileAuth.ts | ✅ Exists |
| Workspace packages | packages/ | ✅ api-contracts, platform-tokens, capabilities |
| **Mobile app** | **apps/mobile/** | ✅ **Created in monorepo** |
| **i18n with RTL** | **apps/mobile/lib/i18n/** | ✅ **En/Ar with platform-tokens** |
| **Auth screens** | **apps/mobile/app/(auth)/** | ✅ **Login + OTP verify** |
| **Tab screens** | **apps/mobile/app/(tabs)/** | ✅ **Dashboard, Projects, Settings** |

### Previously Needed - Now Complete ✅

| Issue | Previous State | Resolution |
|-------|----------------|------------|
| Mobile app location | Standalone at /sheenapps-mobile | ✅ Created fresh in apps/mobile/ |
| Package name | sheenapps-mobile | ✅ @sheenapps/mobile |
| Workspace deps | None (standalone npm) | ✅ workspace:* for shared packages |
| Translations adapter | Skeleton only | ✅ i18next with platform-tokens integration |
Strategy Assessment

No major strategy change needed. The plan is well-aligned with the monorepo architecture. The key items are:

1. Move mobile to monorepo (when mobile work resumes)
mv /sheenapps-mobile apps/mobile
# Update package.json:
# - name: @sheenapps/mobile
# - Add workspace:* deps for shared packages
2. Add Metro config for workspace symlinks
// apps/mobile/metro.config.js
config.watchFolders = [path.resolve(__dirname, '../../packages')]
3. Verify EAS works with pnpm workspace (Phase 1b checklist in plan covers this)

Current Mobile Status

Per the plan, mobile is at Week 3 (Polish) but using mock data:
- Auth screens ✅
- Dashboard ✅ (mock data)
- Gateway routes ✅ (not yet connected)
- Gap: Need to connect mobile to real APIs via gateway

Recommendation

No direction change required. When you're ready to resume mobile:

1. Move sheenapps-mobile → apps/mobile/
2. Convert to workspace package with workspace:* deps
3. Add Metro config for workspace resolution
4. Connect to real gateway APIs (replace mock data)
5. Run EAS build to validate monorepo setup



Week 3 Tasks (Polish)
┌───────────────────────────────────────────────┬────────┐
│     Task                                      │ Status │
├───────────────────────────────────────────────┼────────┤
│ RTL testing on real Arabic devices            │ ⬜     │
├───────────────────────────────────────────────┼────────┤
│ Performance optimization                      │ ⬜     │
├───────────────────────────────────────────────┼────────┤
│ TestFlight (iOS) + Internal testing (Android) │ ⬜     │
├───────────────────────────────────────────────┼────────┤
│ App store assets (icons, screenshots)         │ ⬜     │
├───────────────────────────────────────────────┼────────┤
│ Basic analytics                               │ ⬜     │
└───────────────────────────────────────────────┴────────┘
Minor Improvements Noted

- Replace emoji tab icons with proper icon library
- Dark mode theme provider refinement

Phase 1B (Push Notifications) - Not Started

- Push notification service in worker
- Device token registration
- Notification preferences
- Expo Notifications setup

Phase 2+ (Content Editing) - Not Started

- CMS entry list/edit
- Image upload
- Lead/Order details

Bottom line: Backend auth is built. Main gap is connecting the mobile app to the real APIs instead of mock data, then Week 3 polish.
---

## Part 1: Situation Analysis

### 1.1 Current Platform Architecture

> **Note (2026-02-01):** Platform now uses a Turborepo monorepo. See [MONOREPO_ANALYSIS_AND_PLAN.md](./MONOREPO_ANALYSIS_AND_PLAN.md) for details.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SheenApps Monorepo (sheenapps/)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────┐         ┌──────────────────────────────┐       │
│  │  apps/web           │         │  apps/worker                 │       │
│  │  (Next.js 16)       │──HMAC──►│  (Fastify)                   │       │
│  │                     │   Auth  │                              │       │
│  │  • Web App          │◄──SSE───│  • 40+ API routes            │       │
│  │  • Dashboard        │         │  • Build/Deploy pipeline     │       │
│  │  • Builder          │         │  • Business event processing │       │
│  │  • Run Hub          │         │  • Webhook handlers          │       │
│  └─────────────────────┘         └──────────────────────────────┘       │
│           │                                │                             │
│           └────────────┬───────────────────┘                             │
│                        ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │              packages/ (Workspace Packages)                       │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │  INTERNAL (workspace:*)                                           │   │
│  │  • @sheenapps/api-contracts  - Zod schemas, API types            │   │
│  │  • @sheenapps/platform-tokens - Locales, RTL, currencies         │   │
│  │  • @sheenapps/capabilities   - Feature/plan vocabulary           │   │
│  │  • @sheenapps/translations   - i18n (skeleton, ready for mobile) │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │  PUBLISHED (for Easy Mode customer apps)                          │   │
│  │  • @sheenapps/auth, db, storage, email, payments, analytics...   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                      Infrastructure                             │     │
│  ├────────────────────────────────────────────────────────────────┤     │
│  │  • Neon (PostgreSQL) - project databases                        │     │
│  │  • Cloudflare R2 - asset storage                                │     │
│  │  • Cloudflare KV - hosting metadata                             │     │
│  │  • Cloudflare Workers for Platforms - site hosting              │     │
│  │  • Ably - realtime (websockets)                                 │     │
│  │  • Resend - transactional email                                 │     │
│  │  • Stripe - payments                                            │     │
│  │  • OpenSRS - domain registration                                │     │
│  └────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Target User Profile

| Attribute | Description |
|-----------|-------------|
| **Primary Persona** | Nour — Small business owner (photographer, salon, restaurant) |
| **Technical Level** | Non-technical. Never written code. Comfortable with WhatsApp, Instagram |
| **Language** | Arabic-first (Saudi Arabia, UAE, Egypt primary markets) |
| **Device Usage** | Primarily mobile (70%+ of daily screen time) |
| **Pain Point** | "I need to update my website but I'm not near my computer" |
| **Success Metric** | Can check business stats and site status in under 10 seconds |

### 1.3 Competitive Landscape

| Platform | Mobile App | Key Features | Notes |
|----------|------------|--------------|-------|
| **Replit** | ✅ iOS/Android | Full code editor, AI chat, deployments | Developer-focused |
| **Lovable** | ❌ Web only | — | Desktop-centric |
| **Wix** | ✅ iOS/Android | Site management, blog, analytics, chat | Consumer-friendly |
| **Squarespace** | ✅ iOS/Android | Analytics, inventory, orders, scheduling | Content-focused |
| **Shopify** | ✅ iOS/Android | Orders, products, analytics, POS | E-commerce focused |
| **WordPress** | ✅ iOS/Android | Posts, comments, stats, media | Content management |
| **SheenApps** | ❌ Currently none | — | Opportunity |

**Key Insight**: Direct competitors (Replit, Lovable) either have mobile or don't target non-technical users. Indirect competitors (Wix, Squarespace) that target similar users ALL have mobile apps.

### 1.4 Current Web Platform Status

Before building mobile, the web platform has prerequisites:

| Area | Status | Blocker for Mobile? |
|------|--------|---------------------|
| **API Contracts** | ✅ Fixed (P0-1 complete) | No |
| **Status Endpoint** | ✅ Implemented | No |
| **Magic Link Auth** | ✅ Wired | No — mobile can use same flow |
| **CMS Form Builder** | ✅ Built | No |
| **Run Hub** | ✅ Production-grade | No — key mobile feature |
| **Multi-currency** | ✅ Complete | No |
| **SSE Real-time** | ✅ Working | Needs mobile-specific handling |
| **Push Notifications** | ⏳ Not built | **Yes — high priority for mobile** |
| **Offline Support** | ❌ Not designed | Medium priority |

---

## Part 2: Proposed Mobile App Scope

### 2.1 Core Value Proposition

> "Manage your business website from anywhere — check stats, update content, see what's happening."

The mobile app is NOT a full replacement for the web builder. It's a **companion app** for:
1. **Monitoring** — Business dashboard, site status, alerts
2. **Quick edits** — Update content, respond to leads
3. **Notifications** — Get alerted when something important happens

### 2.2 Feature Matrix by Phase

#### Phase 1A: "Zero-Regret MVP" (3 weeks)

Focus on dashboard/monitoring. No push yet — validates core value before tackling push complexity.

| Feature | Description | API Dependency |
|---------|-------------|----------------|
| **Authentication** | OTP-first login (6-digit code) | `POST /v1/platform/auth/request-code`, `verify-code` |
| **Project List** | View all projects | `GET /v1/inhouse/projects` |
| **Business Dashboard** | Revenue, leads, signups, payments | `GET /v1/inhouse/business-events`, `GET /v1/inhouse/projects/:id/kpi` |
| **Site Status** | Is site live? Last deploy time, any errors | `GET /v1/inhouse/projects/:id/status` |
| **Quick Actions** | View site, copy URL, basic controls | Deep links to web |

#### Phase 1B: "Push Notifications" (2 weeks)

Add push after core app is validated with internal testers.

| Feature | Description | API Dependency |
|---------|-------------|----------------|
| **Push Notifications** | Alerts for leads, orders, deploys | `POST /v1/inhouse/push/register` |
| **Notification Center** | In-app notification history | `GET /v1/inhouse/notifications` |
| **Notification Preferences** | Per-type and per-project toggles | `GET/PUT /v1/inhouse/push/preferences` |

#### Phase 2: "Write-Lite" (3 weeks)

Add content editing for the most common use cases.

| Feature | Description | API Dependency |
|---------|-------------|----------------|
| **CMS Entry List** | View all content entries | `GET /v1/inhouse/cms/entries` |
| **Quick Edit Entry** | Edit text/number fields inline | `PUT /v1/inhouse/cms/entries/:id` |
| **Image Upload** | Capture from camera, upload | `POST /v1/inhouse/storage/upload` |
| **Lead Details** | View lead info, mark as contacted | `GET/PATCH /v1/inhouse/business-events/:id` |
| **Order Details** | View order info, update status | Same as above |

#### Phase 3: "Power Mobile" (3 weeks)

Advanced features for power users.

| Feature | Description | API Dependency |
|---------|-------------|----------------|
| **Create Content** | Add new blog posts, products | `POST /v1/inhouse/cms/entries` |
| **Rich Text Editor** | Mobile-friendly WYSIWYG | Client-side only |
| **Workflow Triggers** | Send promo email, recover cart | `POST /v1/inhouse/workflows/execute` |
| **Analytics Deep Dive** | Detailed charts, date ranges | Existing KPI endpoints |
| **Domain Management** | View domains, check status | `GET /v1/inhouse/domains` |
| **Team Chat** | Notify team members | `@sheenapps/notifications` |

### 2.3 Features Explicitly OUT of Scope

| Feature | Reason |
|---------|--------|
| **Code Editor** | Not aligned with non-technical user persona |
| **Template Builder** | Complex UI not suited for mobile |
| **AI Chat/Rebuild** | Computationally expensive, better on desktop |
| **Database Console** | Developer feature, not Easy Mode |
| **Full Deploy Control** | Auto-deploy handles this; risky on mobile |
| **API Key Management** | Security risk on mobile devices |

---

## Part 3: Technical Implementation Options

### 3.1 Framework Decision Matrix

| Option | Pros | Cons | Effort | Recommendation |
|--------|------|------|--------|----------------|
| **React Native** | Code sharing with web (React), large ecosystem, mature | Two builds (iOS/Android), native module complexity | Medium | ⭐ **Recommended** |
| **Flutter** | Single codebase, fast, beautiful UI, strong RTL | Different language (Dart), no code sharing with existing JS | Medium | Good alternative |
| **Native (Swift + Kotlin)** | Best performance, full platform features | Two codebases, higher effort, no JS sharing | High | Not recommended |
| **Expo (React Native)** | Simplified RN, OTA updates, managed workflow | Some native limitations, vendor dependency | Low-Medium | ⭐ **Recommended for MVP** |
| **PWA (Progressive Web App)** | No app store, same codebase | Limited push, no offline, feels less native | Low | Fallback option |
| **Capacitor** | Wraps existing web app | Performance issues, feels like web | Low | Not recommended |

**Recommendation**: **Expo (React Native)** for MVP

Rationale:
1. Team already knows React/TypeScript (from Next.js codebase)
2. Expo provides managed workflow, OTA updates, push notifications out-of-box
3. Can eject to bare React Native if needed later
4. Single codebase for iOS + Android
5. Strong RTL support for Arabic

### 3.1.1 Monorepo Integration (Updated 2026-02-01)

Mobile app is an **app** (not a package) in the Turborepo monorepo at `apps/mobile/`.

```
sheenapps/
├── apps/
│   ├── web/        # @sheenapps/web (Next.js)
│   ├── worker/     # @sheenapps/worker (Fastify)
│   └── mobile/     # @sheenapps/mobile (Expo) ← APP, not package
├── packages/
│   ├── api-contracts/   # Shared Zod schemas
│   ├── platform-tokens/ # Locale utilities
│   └── capabilities/    # Feature/plan vocabulary
```

**Current state:** Mobile app exists at `/sheenapps-mobile` (standalone). Needs to be moved into monorepo when mobile work resumes.

**Migration steps (when mobile work resumes):**

1. **Move into monorepo:**
   ```bash
   # From monorepo root
   mv ../sheenapps-mobile apps/mobile
   ```

2. **Update package.json:**
   ```json
   {
     "name": "@sheenapps/mobile",
     "dependencies": {
       "@sheenapps/api-contracts": "workspace:*",
       "@sheenapps/platform-tokens": "workspace:*",
       "@sheenapps/capabilities": "workspace:*"
     }
   }
   ```

3. **Add Metro config for workspace symlinks:**
   ```js
   // apps/mobile/metro.config.js
   const path = require('path');
   const { getDefaultConfig } = require('expo/metro-config');

   const config = getDefaultConfig(__dirname);

   // Watch workspace packages
   config.watchFolders = [
     path.resolve(__dirname, '../../packages/api-contracts'),
     path.resolve(__dirname, '../../packages/platform-tokens'),
     path.resolve(__dirname, '../../packages/capabilities'),
   ];

   module.exports = config;
   ```

4. **Run pnpm install from monorepo root**

5. **Verify EAS build works** (see Phase 1b checklist in section 5.1)

**Workspace packages available to mobile:**

| Package | What it provides | Mobile usage |
|---------|------------------|--------------|
| `@sheenapps/api-contracts` | Zod schemas, API types | Request/response validation |
| `@sheenapps/platform-tokens` | `SUPPORTED_LOCALES`, `isRTL()`, `normalizeLocale()` | RTL detection, locale handling |
| `@sheenapps/capabilities` | `formatLimit()`, `shouldShowUpgrade()` | Upgrade prompts, limit display |
| `@sheenapps/translations` | i18n strings (skeleton ready) | Shared translations when activated |

**Build commands (after migration):**
```bash
# Build mobile with dependencies
pnpm turbo build --filter=@sheenapps/mobile...

# Run mobile dev
pnpm --filter @sheenapps/mobile start

# EAS build (from apps/mobile/)
cd apps/mobile && eas build --platform all
```

**EAS + pnpm workspace considerations:**
- See Phase 1b "EAS Monorepo Readiness" checklist in section 5.1
- All workspace packages consumed by mobile must emit `dist/` (Metro resolves JS, not TS)
- Metro config needs `watchFolders` pointing to workspace packages
- No Node-only APIs in shared packages (fs, path, etc.)

**Locale utilities example:**
```typescript
// apps/mobile/lib/i18n/index.ts
import {
  SUPPORTED_LOCALES,
  isRTL,
  normalizeLocale,
  getDirection,
} from '@sheenapps/platform-tokens';

// Use the same locale logic as web
export function setupI18n(userLocale: string) {
  const locale = normalizeLocale(userLocale);
  const isRtl = isRTL(locale);
  I18nManager.forceRTL(isRtl);
  return locale;
}
```

### 3.2 Architecture Proposal

> **Critical Decision**: Mobile apps cannot safely store HMAC secrets. The mobile app calls Next.js as an API gateway, which handles HMAC signing to the worker. This reuses the existing trust boundary.

> **Monorepo Note (2026-02-01)**: Mobile app will live at `apps/mobile/` in the monorepo, consuming workspace packages via `workspace:*`.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Mobile App Architecture                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              apps/mobile (Expo / React Native)                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │
│  │  │   Screens   │  │  Components │  │     Navigation      │   │  │
│  │  │  • Dashboard│  │  • KpiCard  │  │    (Expo Router)    │   │  │
│  │  │  • Projects │  │  • EntryForm│  │                     │   │  │
│  │  │  • Content  │  │  • StatusBadge│ │                    │   │  │
│  │  │  • Settings │  │  • etc.     │  │                     │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │  │
│  │                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │                    State Management                      │  │  │
│  │  │  • Zustand (simple, works with RN)                       │  │  │
│  │  │  • TanStack Query (data fetching, caching)              │  │  │
│  │  │  • Secure storage (expo-secure-store)                    │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │              Shared Workspace Packages                   │  │  │
│  │  │  • @sheenapps/api-contracts - API types + Zod schemas   │  │  │
│  │  │  • @sheenapps/platform-tokens - Locales, RTL, isRTL()   │  │  │
│  │  │  • @sheenapps/capabilities - Entitlements display       │  │  │
│  │  │  • @sheenapps/translations - i18n strings (when ready)  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │                    API Layer                             │  │  │
│  │  │  • Session token auth (NOT HMAC — no secrets on device) │  │  │
│  │  │  • Calls Next.js /api/mobile/* endpoints                 │  │  │
│  │  │  • Error handling / exponential backoff                  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              apps/web (Next.js) — API Gateway                  │  │
│  │                                                                │  │
│  │  /api/mobile/* routes                                          │  │
│  │  • Validates session token (user auth)                         │  │
│  │  • Adds HMAC signature                                         │  │
│  │  • Proxies to worker                                           │  │
│  │  • Rate limiting + caching layer                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                          (HMAC)                                      │
│                              ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    apps/worker (Fastify)                       │  │
│  │                                                                │  │
│  │  REUSED (no changes):                                          │  │
│  │  • HMAC auth (from Next.js gateway, not mobile)                │  │
│  │  • Existing API routes • Business logic (+ new /push routes)   │  │
│  │                                                                │  │
│  │  NEW (backend work required):                                  │  │
│  │  • Push notification service + device registration             │  │
│  │  • Provider-agnostic push interface                            │  │
│  │  • Event-to-notification rule engine                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why Next.js as Gateway (Option A)?**
- No secrets on mobile device (HMAC key stays server-side)
- Reuses existing trust boundary
- Smallest backend change
- Trade-off: adds ~50-100ms latency, but acceptable for non-realtime operations

**Alternative (Option B)**: Implement mobile-safe JWT auth directly to worker. Cleaner long-term but requires significant security design + implementation. Deferred to V2 if latency becomes a problem.

### 3.3 Authentication Strategy

**Current Web Flow**:
1. User enters email
2. Server sends magic link email
3. User clicks link → session created → tokens stored in cookies

**Proposed Mobile Flow (OTP-First)**:

> **Why OTP-first?** Magic links on mobile fail in frustrating ways: opens wrong browser, wrong profile, user on different device. OTP is familiar to Arabic users (WhatsApp, banking apps) and works reliably across devices.

1. User enters email in app
2. Server sends email with **OTP code prominently displayed** + magic link as secondary option
3. App shows OTP input screen → user types 6-digit code → logged in
4. (Fallback) Magic link still works if user taps it

**Email Template**:
```
Subject: Your SheenApps login code: 847293

السلام عليكم،

Your login code is: 847293

Enter this code in the app to sign in.
Code expires in 10 minutes.

Or tap here to log in automatically: [Magic Link Button]
```

**Mobile UI Flow**:
```
┌─────────────────────────────────────┐
│  Enter your email                   │
│  ┌─────────────────────────────┐   │
│  │ ahmed@example.com           │   │
│  └─────────────────────────────┘   │
│  [Send Code]                        │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  Enter the 6-digit code             │
│  we sent to ahmed@example.com       │
│                                     │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐│
│  │ 8 │ │ 4 │ │ 7 │ │ 2 │ │ 9 │ │ 3 ││
│  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘│
│                                     │
│  Didn't get it? [Resend] [Use Link] │
└─────────────────────────────────────┘
```

**OTP Security**:
- Rate limit: 3 attempts per email per 10 minutes
- Lockout: 5 failed attempts → 30 minute cooldown
- OTP valid for 10 minutes only
- Each OTP invalidated after use

**Magic Link (Secondary Path)**:
Magic links still work for users who prefer them. Deep link handling:

```typescript
// Deep link handling for magic link fallback
Linking.addEventListener('url', ({ url }) => {
  const { queryParams } = Linking.parse(url);
  if (queryParams?.token) {
    await authService.verifyMagicLink(queryParams.token);
    navigation.navigate('Dashboard');
  }
});
```

Pre-launch: Add Universal Links (iOS) + App Links (Android) for reliable deep linking.

**Decisions Made**:
- ✅ OTP-first: Primary auth method (better UX for target market)
- ✅ Magic link: Secondary option (still available)
- ✅ Session duration: 30 days for mobile (longer than web's 7 days)
- ⏳ Biometric unlock: Phase 2 (nice-to-have, not MVP critical)

### 3.4 Push Notifications Architecture

This is NEW infrastructure required for mobile. **Design provider-agnostic from day 1** — don't bake Expo-specific logic into the database or core service.

**Event Types to Notify**:

| Event | Priority | Example Message |
|-------|----------|-----------------|
| New Lead | High | "🔔 New lead: Ahmed K. just submitted a form" |
| New Order | High | "💰 New order: SAR 375 from Sara M." |
| Deploy Success | Medium | "✅ Your site is now live!" |
| Deploy Failed | High | "⚠️ Deployment failed — tap to retry" |
| Low Quota | Medium | "📊 You've used 80% of your monthly events" |
| Daily Digest | Low | "📈 Yesterday: 5 leads, SAR 1,200 revenue" |

**Backend Changes Required**:

```sql
-- Provider-agnostic device registration (NOT Expo-specific)
CREATE TABLE inhouse_push_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,

    -- Device identification (app-generated, NOT OS-provided)
    -- iOS has no stable device ID; we generate UUID on first launch, store in SecureStore
    -- Reinstall = new device (by design)
    device_id VARCHAR(255) NOT NULL,
    device_token TEXT NOT NULL,           -- Provider-specific push token (rotates!)
    platform VARCHAR(10) NOT NULL,        -- 'ios' | 'android'

    -- For localization
    locale VARCHAR(10) DEFAULT 'en',      -- 'ar', 'en', etc.
    timezone VARCHAR(50),                 -- 'Asia/Riyadh', etc.

    -- Per-project notification settings (avoids spam for multi-project users)
    project_prefs JSONB DEFAULT '{}',     -- { "proj-uuid": { "leads": true, ... } }

    -- Global notification preferences (per-device defaults)
    notification_prefs JSONB DEFAULT '{
        "leads": true,
        "orders": true,
        "deploys": true,
        "marketing": false,
        "digest": true
    }',

    -- Quiet hours (optional)
    quiet_start TIME,                     -- e.g., '22:00'
    quiet_end TIME,                       -- e.g., '07:00'

    -- Metadata
    app_version VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    disabled_at TIMESTAMPTZ,              -- Set when push provider returns "invalid token"

    -- One device per user (not per project — avoids duplicate rows)
    UNIQUE(user_id, device_id)
);

-- Push token upsert: ON CONFLICT (user_id, device_id) DO UPDATE SET device_token = ...
-- Tokens rotate; always upsert on registration

CREATE INDEX idx_push_devices_user ON inhouse_push_devices(user_id);
```

**Token Cleanup Policy** (prevents error log farm):
- If push provider returns "invalid token" → set `disabled_at = NOW()`, stop sending
- Device re-registers on next app open → clears `disabled_at`, updates token
- Periodic cleanup job: delete devices where `last_used_at < NOW() - INTERVAL '90 days'`
- Prevents stale tokens from accumulating and causing noisy delivery failures

**Device ID Strategy**:
```typescript
// On first app launch, generate stable device ID and store in SecureStore
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';

async function getOrCreateDeviceId(): Promise<string> {
  let deviceId = await SecureStore.getItemAsync('device_id');
  if (!deviceId) {
    deviceId = randomUUID();
    await SecureStore.setItemAsync('device_id', deviceId);
  }
  return deviceId;
}
// Reinstall = new device ID (intentional — can't recover SecureStore)
```

**Multi-Project Notification Strategy**:
- Users with multiple projects can get spammed with "new lead" across all projects
- Default: notifications enabled only for "primary" project (most recently active)
- Settings UI: per-project toggles to enable/disable (Phase 2)

```typescript
// Provider-agnostic interface (swap Expo → FCM later without touching business logic)
interface PushProvider {
  send(token: string, payload: PushPayload): Promise<PushResult>;
  sendBatch(tokens: string[], payload: PushPayload): Promise<PushResult[]>;
}

// Implementations
class ExpoPushProvider implements PushProvider { ... }      // MVP
class FCMPushProvider implements PushProvider { ... }       // Later if needed

// Service uses the interface, not the concrete provider
class InhousePushNotificationService {
  constructor(private provider: PushProvider) {}

  async registerDevice(projectId, userId, deviceInfo) { ... }
  async unregisterDevice(projectId, userId, deviceId) { ... }
  async sendPush(projectId, eventType, payload) {
    // 1. Lookup devices for project's users
    // 2. Check notification_prefs (does user want this event type?)
    // 3. Check quiet hours
    // 4. Send via provider.send()
  }
}

// Notification rules in ONE place (not scattered in event handlers)
const NOTIFICATION_RULES: NotificationRule[] = [
  { eventType: 'lead_created', prefKey: 'leads', priority: 'high' },
  { eventType: 'order_created', prefKey: 'orders', priority: 'high' },
  { eventType: 'deploy_succeeded', prefKey: 'deploys', priority: 'normal' },
  { eventType: 'deploy_failed', prefKey: 'deploys', priority: 'high' },
  // ...
];
```

**Provider Options**:
| Provider | Pros | Cons | Cost |
|----------|------|------|------|
| **Expo Push** | Built into Expo, simple | Expo-only, less control | Free tier generous |
| **Firebase FCM** | Industry standard, free | Requires Firebase project | Free |
| **OneSignal** | Easy dashboard, analytics | Another vendor | Free tier, paid at scale |
| **Custom APNs/FCM** | Full control | More work | Free (infrastructure cost only) |

**Recommendation**: Start with **Expo Push** for speed, but use the provider-agnostic interface so we can swap to FCM/APNs later without touching business logic.

**Notification Preferences (MVP)**:
Add minimal preference controls early — otherwise "opt-out" = "delete the app":
- Settings screen with toggles per notification type
- Quiet hours option (common in Arabic markets)
- Stored per-device (not per-user) to handle multiple devices

### 3.5 Real-Time Strategy (SSE vs Push)

**Problem**: SSE (Server-Sent Events) works well on web but is problematic on mobile:
- Battery drain from persistent connections
- Unreliable in background
- iOS aggressively kills background connections

**Recommendation for Mobile**:

| Use Case | Web Approach | Mobile Approach |
|----------|--------------|-----------------|
| "New lead came in" | SSE real-time | **Push notification** |
| "Build is deploying" | SSE streaming | **Push + periodic refresh** |
| Dashboard refresh | Auto-poll every 30s | **Pull-to-refresh + stale cache** |
| Live typing indicator | WebSocket | **Not needed for MVP** |

**Implementation**:
- **Foreground**: Use Ably (existing realtime layer) only for screens where it matters
- **Background**: Rely on push notifications (no persistent connections)
- **Refresh**: Pull-to-refresh + TanStack Query stale-while-revalidate

```typescript
// Dashboard screen: periodic refresh only when foregrounded
const { data, refetch } = useQuery({
  queryKey: ['kpi', projectId],
  queryFn: fetchKpi,
  refetchInterval: 60000, // 1 minute
  refetchIntervalInBackground: false, // Don't poll when backgrounded
});

// For build status: poll more frequently while actively watching
const { data: buildStatus } = useQuery({
  queryKey: ['build', buildId],
  queryFn: fetchBuildStatus,
  refetchInterval: isBuildInProgress ? 5000 : false, // 5s while building
});
```

### 3.6 Offline Considerations

**Question**: How much offline support is needed?

| Level | Description | Effort | Recommendation |
|-------|-------------|--------|----------------|
| **None** | App requires internet, shows error when offline | Low | MVP approach |
| **Read Cache** | Cache last-fetched data, show stale data when offline | Medium | ⭐ Recommended |
| **Write Queue** | Queue writes offline, sync when online | High | V2 if demanded |

**Implementation for Read Cache**:
```typescript
// TanStack Query handles this out of box
const { data, isLoading, isError } = useQuery({
  queryKey: ['kpi', projectId],
  queryFn: () => fetchKpi(projectId),
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 24 * 60 * 60 * 1000, // Cache for 24 hours
});

// NetInfo for connectivity detection
NetInfo.addEventListener(state => {
  if (!state.isConnected) {
    showToast('You are offline. Showing cached data.');
  }
});
```

### 3.7 Security Considerations

> Mobile apps have unique security concerns that don't exist on web. This section covers mobile-specific security requirements.

**Token Storage**:
| Storage Option | Security Level | Use Case |
|----------------|----------------|----------|
| `expo-secure-store` | High (Keychain/Keystore) | ⭐ Session tokens, refresh tokens |
| `AsyncStorage` | Low (plain text) | Non-sensitive preferences only |
| In-memory only | Medium | Transient data during session |

**Session & Token Strategy**:
```typescript
// Secure storage for sensitive tokens
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'sheenapps_session_token';
const REFRESH_KEY = 'sheenapps_refresh_token';

// Store tokens on successful auth
await SecureStore.setItemAsync(TOKEN_KEY, sessionToken);
await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);

// Token refresh before expiry (proactive, not reactive)
const scheduleTokenRefresh = (expiresAt: Date) => {
  const refreshTime = expiresAt.getTime() - 5 * 60 * 1000; // 5 min before expiry
  setTimeout(refreshTokens, refreshTime - Date.now());
};
```

**Device Revocation**:
- Backend tracks device_id in `inhouse_push_devices`
- User can revoke devices from web settings ("Sign out everywhere")
- Admin can force-revoke via admin panel
- Revoked devices get 401 on next API call → app clears local tokens

**Jailbreak/Root Detection**:
| Approach | Recommendation |
|----------|----------------|
| **Block jailbroken devices** | Not recommended (false positives, user friction) |
| **Warn but allow** | Recommended for MVP |
| **Extra monitoring** | Log device status for fraud detection |

```typescript
// Example: warn but don't block
import * as Device from 'expo-device';

if (Device.isRootedExperimental) {
  logAnalytics('jailbreak_detected', { deviceId });
  // Show warning toast, but allow use
}
```

**Session Invalidation Triggers**:
- Password change on web → invalidate all mobile sessions
- Account deletion → immediate token revocation
- Suspicious activity → admin-initiated revocation
- App uninstall → push token automatically deregistered

**Multi-Tenant Considerations for Push**:
- User may have access to multiple projects
- Push notifications scoped by project_id
- Device can receive notifications for all projects user has access to
- Notification payload includes project_id for routing

---

## Part 4: UI/UX Considerations

### 4.1 Design Principles

1. **Arabic-First**: RTL layout, Arabic typography, culturally relevant imagery
2. **Thumb-Friendly**: Key actions reachable with one thumb
3. **Glanceable**: Dashboard info visible in 3 seconds
4. **Non-Technical**: No jargon, icons with labels, confirmation dialogs
5. **Fast**: App should feel instant (perceived performance)

### 4.2 Screen Flow (MVP)

```
┌─────────────────────────────────────────────────────────────────┐
│                         App Structure                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                                │
│  │  Splash/Auth │                                                │
│  │  (Magic Link)│                                                │
│  └──────┬───────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Bottom Tab Navigation                       │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │                                                          │    │
│  │  ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐            │    │
│  │  │ Home  │  │Content│  │ Leads │  │Settings│            │    │
│  │  │   📊  │  │   📝  │  │   👥  │  │   ⚙️   │            │    │
│  │  └───┬───┘  └───┬───┘  └───┬───┘  └───┬───┘            │    │
│  │      │          │          │          │                 │    │
│  └──────┼──────────┼──────────┼──────────┼─────────────────┘    │
│         │          │          │          │                       │
│         ▼          ▼          ▼          ▼                       │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐        │
│  │ Dashboard │ │Entry List │ │Lead List  │ │ Profile   │        │
│  │ - KPIs    │ │           │ │           │ │ - Language│        │
│  │ - Status  │ └─────┬─────┘ └─────┬─────┘ │ - Logout  │        │
│  │ - Actions │       │             │       │ - Support │        │
│  └───────────┘       ▼             ▼       └───────────┘        │
│                ┌───────────┐ ┌───────────┐                       │
│                │Entry Edit │ │Lead Detail│                       │
│                │ - Fields  │ │ - Info    │                       │
│                │ - Save    │ │ - Actions │                       │
│                └───────────┘ └───────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Dashboard (Home) Wireframe

```
┌─────────────────────────────────────────┐
│ ◀ My Business         🔔 (3)            │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  📊 Today's Summary              │   │
│  │  ─────────────────────────────   │   │
│  │  Revenue      SAR 1,875  ▲ 12%   │   │
│  │  New Leads    5          ▲ 2     │   │
│  │  Orders       3                  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  🌐 Site Status                  │   │
│  │  ─────────────────────────────   │   │
│  │  ● Live at mybusiness.sheenapps │   │
│  │  Last updated: 2 hours ago       │   │
│  │                                  │   │
│  │  [Open Site]  [Share Link]       │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  ⚡ Quick Actions                │   │
│  │  ─────────────────────────────   │   │
│  │  [📝 Add Content]                │   │
│  │  [📧 Send Promo]                 │   │
│  │  [🛒 View Orders]                │   │
│  └─────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│  [Home]  [Content]  [Leads]  [Settings] │
└─────────────────────────────────────────┘
```

### 4.4 Arabic RTL Considerations

| Element | LTR (English) | RTL (Arabic) |
|---------|---------------|--------------|
| Back button | Left | Right |
| Navigation flow | Left → Right | Right → Left |
| Tab bar order | Left-to-right | Right-to-left |
| Text alignment | Left | Right |
| Numbers | LTR (Western Arabic numerals) | LTR or RTL (Eastern Arabic ٠١٢٣) |
| Currency | "SAR 1,875" | "1,875 ر.س" |
| Swipe gestures | Swipe right = back | Swipe left = back |

**Implementation**:
```typescript
// Use I18nManager for global RTL
import { I18nManager } from 'react-native';

if (userLocale.startsWith('ar')) {
  I18nManager.forceRTL(true);
}

// Use react-native-reanimated for gesture handling
// Libraries like react-navigation handle RTL automatically
```

---

## Part 5: Implementation Roadmap

### 5.1 Phase 1: MVP (Split for De-Risking)

> **Strategic split**: Push notifications are the hardest part of this plan. Separating Phase 1 into 1A (no push) and 1B (push) lets us validate the "companion app" value before building the most failure-prone subsystem.

#### Phase 1A: "Zero-Regret MVP" (3 weeks)

Validates core value: "I can see my business stats on my phone"

**Week 1: Foundation**
- [ ] Expo project setup with TypeScript
- [ ] Navigation structure (Expo Router, built on React Navigation)
- [ ] Auth flow (OTP-first + magic link fallback)
- [ ] Thin BFF gateway (`/api/gateway/[...path]`) + API client using @sheenapps/api-contracts
- [ ] Secure token storage (expo-secure-store)
- [ ] Arabic + English i18n setup
- [ ] Crash reporting (Sentry or Firebase Crashlytics)

**Week 2: Dashboard**
- [ ] Project list screen
- [ ] Dashboard screen (KPIs, status)
- [ ] Site status card with "Open Site" action
- [ ] Pull-to-refresh
- [ ] Error states + offline detection

**Week 3: Polish & Internal Testing**
- [ ] RTL testing on real Arabic devices
- [ ] Performance optimization
- [ ] TestFlight (iOS) + Internal testing (Android)
- [ ] App store assets (icons, screenshots)
- [ ] Basic analytics (screen views, auth success rate)

**Phase 1A Success Criteria**:
- Auth works (magic link + OTP)
- Dashboard loads in < 3 seconds
- RTL layout correct
- Crash-free rate > 99%

#### Phase 1B: Push Notifications (2 weeks)

Only start after Phase 1A is validated with internal testers.

**Week 4: Backend + Integration**
- [ ] Push notification service (worker) with provider-agnostic interface
- [ ] Device token registration endpoint
- [ ] Expo Push provider implementation
- [ ] Event-to-notification rule engine
- [ ] Notification preferences storage

**Week 5: App Integration**
- [ ] Expo Notifications setup
- [ ] Device registration on app open
- [ ] Notification list screen (in-app history)
- [ ] Notification preferences in Settings
- [ ] Universal Links setup (pre-launch requirement)

### 5.2 Phase 2: Content Editing (3 weeks)

**Week 6: CMS Read**
- [ ] Content type list
- [ ] Entry list with search
- [ ] Entry detail view
- [ ] Image preview

**Week 7: CMS Write**
- [ ] Entry edit form (text, number, date fields)
- [ ] Validation
- [ ] Save with loading state
- [ ] Image upload from camera/gallery

**Week 8: Leads & Orders**
- [ ] Lead list with filters
- [ ] Lead detail with actions
- [ ] Order list
- [ ] Order detail

### 5.3 Phase 3: Advanced (3 weeks)

**Week 9-10: Power Features**
- [ ] Create new entries
- [ ] Rich text editor
- [ ] Workflow triggers
- [ ] Charts/analytics

**Week 11: Polish**
- [ ] Offline read cache
- [ ] Biometric unlock
- [ ] App Store submission
- [ ] Play Store submission

### 5.4 Team & Resources

| Role | Responsibility | Phase | Notes |
|------|----------------|-------|-------|
| Mobile Developer | React Native/Expo development | All | Could be existing frontend dev |
| Backend Developer | Next.js gateway + push service | 1A, 1B | Part-time, ~1.5 weeks total |
| Designer | UI/UX, Arabic layouts | 1A | Part-time, 1 week |
| QA | Arabic device testing | All | Critical for RTL; needed for 1A validation |

**Estimated Effort by Phase**:

| Phase | Duration | Mobile Dev | Backend Dev | Designer |
|-------|----------|------------|-------------|----------|
| **1A** | 3 weeks | 1 FTE | 0.3 FTE | 0.5 FTE |
| **1B** | 2 weeks | 1 FTE | 0.5 FTE | — |
| **2** | 3 weeks | 1 FTE | 0.2 FTE | 0.3 FTE |
| **3** | 3 weeks | 1 FTE | 0.1 FTE | 0.2 FTE |

**Total**: ~1.5-2 FTE for 11 weeks (including Phase 1 split)

---

## Part 6: Risk Analysis

### 6.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Push notification complexity** | Medium | High | Split Phase 1 into 1A/1B; use Expo Push initially |
| **RTL bugs** | Medium | Medium | Test on real Arabic devices early |
| **Deep linking issues** | Medium | Medium | Start with scheme links; add Universal Links pre-launch |
| **API rate limiting** | Low | Medium | Implement exponential backoff |
| **App Store rejection** | Low | High | Follow guidelines, no hidden features |
| **Expo limitations** | Low | Medium | Document eject path if needed |
| **Gateway latency (Next.js proxy)** | Low | Low | Monitor; option to add direct JWT auth in V2 |

### 6.2 Operational Requirements

> These are NOT optional polish — they're required for production operation.

| Requirement | Tool Options | When |
|-------------|--------------|------|
| **Crash Reporting** | Sentry, Firebase Crashlytics | Phase 1A (from day 1) |
| **Performance Monitoring** | Sentry Performance, Firebase | Phase 1A |
| **Analytics** | Mixpanel, Amplitude, or custom | Phase 1A |
| **App Store Monitoring** | AppFollow, Appbot | Pre-launch |
| **Error Alerting** | PagerDuty, Slack webhook | Pre-launch |

```typescript
// Sentry integration (recommended)
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2, // 20% of transactions
});
```

### 6.3 Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Low adoption** | Medium | High | Start with existing users, get feedback |
| **Support burden** | Medium | Medium | In-app help, guided flows |
| **Feature creep** | High | Medium | Strict MVP scope, defer to web for complex tasks |
| **Distraction from web platform** | Medium | Medium | Separate team/timebox |

### 6.4 Go/No-Go Criteria

**Prerequisites before starting mobile**:
- [x] P0 API blockers fixed (contract mismatches)
- [x] Status endpoint working
- [x] Magic link auth working
- [x] Run Hub stable
- [ ] Push notification backend designed
- [ ] Mobile team identified

---

## Part 7: Strategic Alternatives (Before Committing)

> **Key insight**: Mobile apps are not a feature — they're a second product you have to feed, QA, support, and keep alive forever. Before committing to 11 weeks, consider whether there's a higher-leverage path.

### 7.1 The Core Strategic Question

The real value for this persona is **interrupt-driven** (leads, orders, deploy issues). A dashboard without push is "nice" but won't become a habit. The question isn't "can we build it?" — it's "will it change behavior enough to justify a new surface area forever?"

### 7.2 Alternative Paths

#### Option A: Notifications & Actions Platform First (Recommended for Long-Term)

Build a multi-channel "Something happened → User acted" platform:

```
Event → Rules → Routing → Delivery → Preference Center → Audit → Analytics
                            ↓
                   WhatsApp / Email / In-Web / Push (later)
```

**Why this matters for Arabic markets:**
- Your persona lives in WhatsApp. They already check it 50+ times/day.
- If they can reply "1" to mark a lead contacted, or tap a link to see today's sales, you've built "mobile app behavior" without an app.
- When you later add native push, it plugs into a mature system rather than becoming the system.

**Trade-off**: More effort upfront (WhatsApp Business API, message templates, routing logic), but compounds forever.

#### Option B: Edge Gateway (Cloudflare Worker) Instead of Next.js

If mobile must feel instant and always-on:
- Put HMAC signing/proxy at the edge (Cloudflare Worker) where you already host sites
- Keep Next.js out of the hot path for mobile API calls
- Reduces latency, cold starts, and "random bad days"

**Why it matters**: Mobile has zero tolerance for "sometimes it loads." Serverless cold starts erode trust fast.

**Trade-off**: Another service to maintain, but aligns with existing Cloudflare infrastructure.

#### Option C: Thin "Operator" App (Fastest Win)

A minimalist app whose only job is push + action:

| Feature | In App | Via Web |
|---------|--------|---------|
| Push notifications | ✅ | — |
| Notification inbox | ✅ | — |
| Quick actions (call lead, WhatsApp, mark contacted) | ✅ | — |
| View dashboard | Deep link → web | ✅ |
| Edit content | Deep link → web | ✅ |
| Everything else | Deep link → web | ✅ |

**Why it works**: Gets the main behavioral win (push → action) with 30% of the surface area. Phase 2/3 content editing may never be worth building natively.

### 7.3 Recommendation Matrix

| Path | Effort | Behavioral Impact | Long-term Leverage |
|------|--------|-------------------|-------------------|
| **Full Mobile App (current plan)** | 11 weeks | Medium (dashboard without push is weak) | Medium |
| **Notifications Platform → then Mobile** | 8-10 weeks | High (reaches users in WhatsApp) | **Very High** |
| **Thin "Operator" App** | 4-5 weeks | High (push is the whole point) | Medium |
| **Edge Gateway + Full App** | 12 weeks | Medium-High | High |

### 7.4 The WhatsApp Angle

> "For your specific users, WhatsApp-first may beat App Store-first."

If SheenApps can feel like a helpful assistant living where users already are:
- No app install friction
- No App Store review delays
- Works on any phone (even old ones)
- Users already trust WhatsApp with business comms

This is an unfair advantage Wix/Squarespace can't easily replicate in Arabic markets.

### 7.5 Go/No-Go Decision Framework

Before greenlighting 11-week mobile roadmap:

| Question | If Yes | If No |
|----------|--------|-------|
| Do we have push infrastructure designed? | Continue | **Stop** — build notifications platform first |
| Is web UX stable (no major blockers)? | Continue | **Stop** — fix web first |
| Do we have mobile team identified? | Continue | **Stop** — don't start without dedicated owner |
| Have we validated demand (user interviews)? | Continue | **Consider** thin "Operator" app to test |
| Is Next.js gateway latency acceptable (<200ms p95)? | Continue | **Consider** edge gateway |

---

## Part 8: Open Questions (Updated After Expert Review)

### 7.1 Resolved Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | HMAC on mobile? | **No** — mobile calls Next.js gateway, which handles HMAC |
| 2 | Gateway architecture? | **Thin BFF** — single `/api/gateway/[...path]` route with proper body/query forwarding |
| 3 | HMAC canonicalization? | **Explicit** — METHOD + path + search + timestamp + bodyHash (byte-identical) |
| 4 | Tenant scoping? | **Gateway enforces** — cheap deny before hitting worker; worker does RLS/ACL |
| 5 | Auth ownership? | **Worker owns logic** — Next.js only issues tokens after worker validates |
| 6 | Push provider architecture? | **Provider-agnostic** — interface allows Expo → FCM swap |
| 7 | Session duration? | **30 days** for mobile (longer than web's 7 days) |
| 8 | Auth method? | **OTP-first** — 6-digit code primary, magic link secondary |
| 9 | Device identity? | **App-generated UUID** — stored in SecureStore; reinstall = new device |
| 10 | Multi-project notifications? | **Primary project only by default** — per-project toggles in Phase 2 |
| 11 | SSE on mobile? | **No** — use push + periodic refresh |
| 12 | Crash reporting? | **Required** — Sentry or Crashlytics from Phase 1A |
| 13 | Phase 1 scope? | **Split** — 1A (no push) validates value; 1B adds push |
| 14 | Content-type forwarding? | **As-is** — don't default to JSON (breaks uploads) |
| 15 | HMAC clock skew? | **±5 minutes** — worker rejects stale timestamps |
| 16 | Push token cleanup? | **Disable + cleanup** — mark invalid tokens, purge after 90 days |

### 7.2 Remaining Strategic Questions

1. **Timing**: Is mobile the right priority for Q2 2026, or should we focus on web UX polish first?

2. **PWA Alternative**: Should we consider a Progressive Web App first to test demand before native investment?

3. **Tablet Support**: Should we design for tablets (iPad) or phone-only?

### 7.3 Remaining Technical Questions

4. **Framework**: Is Expo the right choice, or should we go with bare React Native for more control?

5. **Biometric Auth**: Should FaceID/TouchID be in Phase 2 or deferred further?

6. **Offline Write**: Is read-cache sufficient, or do users need offline write capability in Phase 2+?

### 7.4 Remaining Operational Questions

7. **Onboarding**: Do we need a mobile-specific onboarding flow, or is web sufficient?

8. **Feature Parity Messaging**: How do we communicate that mobile is "companion" not "full replacement"?

9. **RTL QA**: How do we ensure Arabic layout quality without dedicated Arabic-speaking QA?

10. **Update Strategy**: OTA (Expo) vs forced app updates — what's the right balance?

---

## Part 9: Success Metrics

### 9.0 Phase 1A Core Promise Metrics

> These metrics prove the core value proposition: "I can quickly see my business stats on my phone"

| Metric | Definition | Target | How to Measure |
|--------|------------|--------|----------------|
| **Time-to-glance (warm)** | App already open → dashboard visible | < 1 second | Analytics: `app_foregrounded` → `dashboard_rendered` |
| **Time-to-glance (cold)** | App cold start → dashboard visible | < 3 seconds | Analytics: `app_launched` → `dashboard_rendered` |
| **Time-to-glance (expired)** | Cold start + token refresh → dashboard | < 5 seconds | Analytics: `app_launched` → `token_refreshed` → `dashboard_rendered` |
| **OTP success rate** | % of code_sent that result in code_verified | > 85% | Analytics: `otp_sent` → `otp_verified` |
| **Auth funnel completion** | % of email_entered → logged_in | > 75% | Analytics: `auth_started` → `auth_success` |
| **Session completion** | % of sessions that view at least one KPI | > 80% | Analytics: `session_start` → `kpi_viewed` |

### 9.1 Phase 1B Push Metrics

| Metric | Definition | Target | How to Measure |
|--------|------------|--------|----------------|
| **Lead response latency** | Time from lead event → first app open | < 10 min (with push) vs baseline | Compare `lead_created` timestamp → `app_opened` |
| **Push opt-in rate** | % of users who allow notifications | > 60% | OS permission grant rate |
| **Push tap rate** | % of notifications that result in app open | > 15% | Expo Push analytics |

### 9.2 Adoption Metrics (30/90 Day)

| Metric | 30-Day Target | 90-Day Target |
|--------|---------------|---------------|
| App downloads | 500 | 2,000 |
| DAU (Daily Active Users) | 50 | 200 |
| DAU/MAU ratio | 20% | 30% |
| Push notification opt-in | 60% | 70% |
| Session duration | 2 min | 3 min |

### 9.3 Engagement Metrics (Phase 2+)

| Metric | Target |
|--------|--------|
| Dashboard views per session | 2+ |
| Content edits via mobile (Phase 2) | 10% of total edits |
| Actions triggered (Phase 3) | 5+ per user/week |
| Crash-free rate | 99.5% |
| App Store rating | 4.0+ |

### 9.4 Business Metrics

| Metric | Target |
|--------|--------|
| Retention improvement (users with app vs without) | +10% |
| Response time to leads (users with push) | -50% |
| NPS impact | +5 points |

---

## Part 10: Appendices

### Appendix A: Next.js Gateway Architecture (Thin BFF)

> **Design principle**: Don't duplicate the entire API surface. Keep one set of "real" endpoints in the worker. Next.js is a thin BFF: auth validation, HMAC signing, pass-through routing.

**Auth Ownership** (avoid duplication):
- **Worker owns auth domain logic**: OTP generation, validation, rate limiting, user lookup
- **Next.js owns session issuance**: receives validated user from worker, issues mobile session token
- Auth routes in Next.js are thin wrappers that call worker endpoints + issue tokens
- No auth business logic in Next.js (single source of truth)

**Route Structure**:
```
apps/web/src/app/api/
├── gateway/
│   └── [...path]/route.ts       # Single pass-through route for all worker APIs
├── mobile/
│   └── auth/
│       ├── request-code/route.ts  # → worker /auth/request-code, returns success
│       ├── verify-code/route.ts   # → worker /auth/verify-code, issues session token
│       ├── verify-link/route.ts   # → worker /auth/verify-link, issues session token
│       └── refresh/route.ts       # Validates refresh token, issues new session
│   └── push/
│       ├── register/route.ts      # → gateway to worker (authenticated)
│       └── preferences/route.ts   # → gateway to worker (authenticated)
```

**Gateway Implementation** (`/api/gateway/[...path]/route.ts`):
```typescript
// ONE route handles all mobile → worker requests
// No parallel API surface to maintain

import { validateMobileSession } from '@/lib/auth/mobile-session';
import { signHmac } from '@/lib/auth/hmac';
import { createHash } from 'crypto';

export async function handler(req: NextRequest) {
  // 1. Validate mobile session token
  const session = await validateMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Extract path + query string (must preserve for HMAC + worker)
  const url = new URL(req.url);
  const path = url.pathname.replace('/api/gateway', '');
  const search = url.search; // includes leading '?'
  const workerPath = `/v1/inhouse${path}${search}`;
  const workerUrl = `${WORKER_URL}${workerPath}`;

  // 3. Read body correctly (Next.js gotcha: req.body isn't forwardable)
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const bodyBytes = hasBody ? await req.arrayBuffer() : undefined;
  const bodyHash = bodyBytes
    ? createHash('sha256').update(Buffer.from(bodyBytes)).digest('hex')
    : '';

  // 4. HMAC over canonical string (must match exactly what worker validates)
  // Canonical: METHOD + path + search + timestamp + bodyHash
  const timestamp = Date.now().toString();
  const hmacHeaders = signHmac({
    method: req.method,
    path: workerPath,
    timestamp,
    bodyHash,
  });

  // 5. Enforce tenant scope (cheap deny before hitting worker)
  const projectId = extractProjectId(path); // e.g., /projects/123 → 123
  if (projectId && !session.projectIds.includes(projectId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 6. Proxy to worker with user + tenant context
  // Forward content-type as-is (don't default to JSON — breaks uploads)
  const contentType = req.headers.get('content-type');
  const response = await fetch(workerUrl, {
    method: req.method,
    headers: {
      ...hmacHeaders,
      'x-user-id': session.userId,
      'x-project-id': projectId || '',
      ...(contentType ? { 'content-type': contentType } : {}),
    },
    body: bodyBytes,
  });

  return new NextResponse(response.body, { status: response.status });
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
```

**HMAC Canonicalization** (critical for signature matching):
```
Canonical string = METHOD + workerPath + timestamp + bodyHash
Example: "POST/v1/inhouse/cms/entries?type=blog1706745600000a1b2c3d4e5f..."
```
- `bodyHash` = SHA-256 hex of raw body bytes (empty string for GET/HEAD)
- Gateway computes hash from the same `bodyBytes` it forwards
- Worker recomputes hash from received body and validates signature

**Clock Skew & Replay Protection**:
- Worker accepts timestamps within **±5 minutes** of server time
- Signature includes timestamp → old signed requests rejected
- Optional: add `x-request-id` nonce for high-risk routes (payments, deletes) — not required for MVP
- Handles "airplane mode resume" gracefully (request just fails, user retries)

**Benefits**:
- **1 route** instead of 20+ mirrored routes
- **No drift** — mobile and web use identical worker contracts
- **@sheenapps/api-contracts** shared between platforms
- Mobile-specific logic (auth, push) stays separate

### Appendix B: Worker Endpoints (Called via Gateway)

| Worker Endpoint | Method | Purpose |
|-----------------|--------|---------|
| `/v1/platform/auth/request-code` | POST | Send OTP + magic link email |
| `/v1/platform/auth/verify-code` | POST | Verify OTP code |
| `/v1/platform/auth/verify-magic-link` | POST | Verify magic link token |
| `/v1/platform/auth/session` | GET | Get current session |
| `/v1/inhouse/projects` | GET | List projects |
| `/v1/inhouse/projects/:id` | GET | Project details |
| `/v1/inhouse/projects/:id/status` | GET | Infrastructure status |
| `/v1/inhouse/projects/:id/kpi` | GET | Business KPIs |
| `/v1/inhouse/business-events` | GET | List events |
| `/v1/inhouse/cms/types` | GET | List content types |
| `/v1/inhouse/cms/entries` | GET/POST/PUT | CRUD entries |
| `/v1/inhouse/storage/upload` | POST | Upload file |
| `/v1/inhouse/push/register` | POST | Register push device (NEW) |
| `/v1/inhouse/push/preferences` | GET/PUT | Notification prefs (NEW) |

### Appendix C: Package.json (Proposed)

```json
{
  "name": "@sheenapps/mobile",
  "version": "1.0.0",
  "main": "expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "test": "jest"
  },
  "dependencies": {
    "expo": "~50.0.0",
    "expo-secure-store": "~12.0.0",
    "expo-notifications": "~0.27.0",
    "expo-linking": "~6.0.0",
    "@react-navigation/native": "^6.0.0",
    "@react-navigation/bottom-tabs": "^6.0.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.0.0",
    "react-native-reanimated": "~3.6.0",
    "i18next": "^23.0.0",
    "react-i18next": "^14.0.0",
    "@sentry/react-native": "^5.0.0",
    "@react-native-community/netinfo": "^11.0.0"
  }
}
```

### Appendix D: Directory Structure (Proposed)

> **Monorepo Location**: `apps/mobile/` in the sheenapps monorepo

```
apps/mobile/                 # In monorepo (sheenapps/)
├── app/                     # Expo Router (file-based routing)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── magic-link.tsx
│   ├── (tabs)/
│   │   ├── index.tsx        # Dashboard
│   │   ├── content.tsx
│   │   ├── leads.tsx
│   │   └── settings.tsx
│   ├── content/
│   │   └── [id].tsx         # Entry detail
│   └── _layout.tsx
├── components/
│   ├── KpiCard.tsx
│   ├── StatusBadge.tsx
│   └── ...
├── lib/
│   ├── api/
│   │   ├── client.ts        # Session-token fetch (calls Next.js gateway)
│   │   └── endpoints.ts
│   ├── auth/
│   │   └── session.ts
│   └── i18n/
│       └── index.ts         # Imports from @sheenapps/platform-tokens
├── stores/
│   └── auth.ts              # Zustand store
├── package.json             # workspace:* deps for shared packages
└── app.json                 # Expo config
```

**package.json dependencies (workspace packages)**:
```json
{
  "name": "@sheenapps/mobile",
  "dependencies": {
    "@sheenapps/api-contracts": "workspace:*",
    "@sheenapps/platform-tokens": "workspace:*",
    "@sheenapps/capabilities": "workspace:*"
  }
}
```

---

## Conclusion

A mobile companion app for SheenApps Easy Mode is **technically feasible** with the current backend infrastructure. However, **strategic feasibility** requires answering: "Will it change behavior enough to justify a second product forever?"

### Technical Plan (If We Proceed)

**Key Architecture Decisions**:
1. **Thin BFF gateway** — single `/api/gateway/[...path]` route, not parallel API surface
2. **OTP-first auth** — 6-digit code primary, magic link secondary (better for Arabic market)
3. **No HMAC on device** — Next.js handles HMAC signing to worker

**Recommended approach**:
1. **Phase 1A** (3 weeks): OTP auth + dashboard — validates core value, no push
2. **Phase 1B** (2 weeks): Push notifications — adds stickiness
3. **Phase 2** (3 weeks): Content editing based on user feedback
4. Defer complex features (AI chat, code editor) to desktop

### Strategic Alternatives (Consider First)

| Option | Effort | When to Choose |
|--------|--------|----------------|
| **Notifications Platform → then Mobile** | 8-10 weeks | Best long-term leverage; WhatsApp reaches users where they are |
| **Thin "Operator" App** | 4-5 weeks | Fastest behavioral win; push + quick actions only |
| **Edge Gateway + Full App** | 12 weeks | Best reliability if mobile is definitely happening |

**The WhatsApp angle**: For Arabic markets, WhatsApp-first may beat App Store-first. If SheenApps can feel like a helpful assistant living where users already are, that's an unfair advantage Wix doesn't get.

### Decision Framework

Before greenlighting 11-week mobile roadmap:
- ✅ Push infrastructure designed?
- ✅ Web UX stable (no major blockers)?
- ✅ Mobile team identified?
- ✅ User demand validated?
- ✅ Gateway latency acceptable (<200ms p95)?

If any answer is "no" → consider Notifications Platform or Thin Operator App first.

---

## Part 11: Implementation Progress

> This section tracks actual implementation progress and discoveries.

### 11.1 Phase 1A Progress

**Status**: 🟢 Foundation Complete (Week 1-2)

#### Week 1: Foundation ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| Expo project setup | ✅ Done | Created directly in `apps/mobile/` with monorepo support |
| Navigation structure (Expo Router) | ✅ Done | `app/` structure with (auth) and (tabs) groups |
| OTP-first auth flow | ✅ Done | Login + OTP verify screens with 6-digit input |
| Thin BFF gateway (`/api/gateway/[...path]`) | ✅ Done | Gateway + auth endpoints in `apps/web` |
| API client with @sheenapps/api-contracts | ✅ Done | Client created with gateway API functions |
| Secure token storage (expo-secure-store) | ✅ Done | Auth store with SecureStore |
| Arabic + English i18n setup | ✅ Done | i18next with @sheenapps/platform-tokens RTL detection |
| Metro workspace config | ✅ Done | watchFolders for workspace packages |

#### Week 2: Dashboard ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| Project list screen | ✅ Done | FlatList with project cards |
| Dashboard screen (KPIs, status) | ✅ Done | KPI cards, site status, action buttons |
| Site status card with "Open Site" action | ✅ Done | Opens URL with Linking, Share link support |
| Pull-to-refresh | ✅ Done | RefreshControl integrated |
| Settings screen | ✅ Done | Language switch, logout |

#### Week 3: Polish & Internal Testing

| Task | Status | Notes |
|------|--------|-------|
| Connect to real gateway APIs | ⬜ Pending | Replace mock data |
| RTL testing on real Arabic devices | ⬜ Pending | |
| Performance optimization | ⬜ Pending | |
| TestFlight (iOS) + Internal testing (Android) | ⬜ Pending | |
| App store assets (icons, screenshots) | ⬜ Pending | Need design assets |
| Basic analytics | ⬜ Pending | |

### 11.2 Discoveries & Improvements

> Log important discoveries, issues, and improvement ideas here.

| Date | Category | Description | Action |
|------|----------|-------------|--------|
| 2026-01-31 | Setup | Starting implementation | Begin with Expo project setup |
| 2026-01-31 | Deps | Sentry has peer dep conflicts with React 19 | Used `--legacy-peer-deps` |
| 2026-01-31 | Improvement | Tab icons are emoji placeholders | Replace with proper icon library (lucide-react-native?) |
| 2026-01-31 | Improvement | Dark mode support needs refinement | Colors work but could use theme provider |
| 2026-01-31 | Next | Need gateway routes in apps/web | ✅ Created gateway + auth endpoints |
| 2026-01-31 | TODO | Gateway session validation is placeholder | ✅ Implemented proper session validation |
| 2026-01-31 | TODO | Worker OTP endpoints don't exist yet | ✅ Created worker OTP routes + migration |
| 2026-01-31 | Note | Worker routes need testing | Run migration, test with curl/Postman |
| 2026-01-31 | **FIX** | Originally created separate user table | Refactored to use auth.users (Supabase Auth) |

### 11.3 Implementation Log

```
2026-01-31: Phase 1A Foundation - Day 1
- Created Expo project with TypeScript in /sheenapps-mobile (pre-monorepo)
- Installed core deps: expo-router, tanstack-query, zustand, i18next, sentry, etc.
- Set up app.json with scheme, bundleIdentifier, plugins
- Created directory structure: app/(auth), app/(tabs), lib/, stores/

NOTE (2026-02-01): Mobile app location will be apps/mobile/ in monorepo.
Current standalone /sheenapps-mobile can be moved when mobile work resumes.

Mobile App Structure (target: apps/mobile/):
apps/mobile/
├── app/
│   ├── _layout.tsx          # Root layout with providers
│   ├── index.tsx             # Auth redirect
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx         # Email input → send OTP
│   │   └── verify.tsx        # 6-digit OTP input
│   └── (tabs)/
│       ├── _layout.tsx       # Tab navigation
│       ├── index.tsx         # Dashboard with KPIs
│       ├── projects.tsx      # Project list
│       └── settings.tsx      # Settings + logout
├── lib/
│   ├── api/client.ts         # API client for gateway
│   ├── auth/api.ts           # Auth API functions
│   └── i18n/                 # Uses @sheenapps/platform-tokens
├── stores/
│   └── auth.ts               # Zustand auth store with SecureStore
└── package.json              # workspace:* deps for shared packages

2026-01-31: Gateway Routes in apps/web - Completed
- Created /api/gateway/[...path]/route.ts - Thin BFF gateway
  • Validates mobile session token (Authorization: Bearer)
  • Signs requests with HMAC via createWorkerAuthHeaders()
  • Forwards to worker with user context headers
  • Enforces tenant scope (project access check)
  • Handles all HTTP methods (GET, POST, PUT, PATCH, DELETE)

- Created /api/mobile/auth/request-code/route.ts
  • Sends OTP to user email
  • Normalizes email, forwards to worker
  • Worker path: /v1/platform/auth/request-code

- Created /api/mobile/auth/verify-code/route.ts
  • Validates 6-digit OTP code
  • Maps worker error codes to mobile-friendly responses
  • Returns session tokens on success
  • Worker path: /v1/platform/auth/verify-code

- Created /api/mobile/auth/refresh/route.ts
  • Exchanges refresh token for new access token
  • Validates device ID
  • Worker path: /v1/platform/auth/refresh

Gateway Architecture (apps/web/src/app/api/):
apps/web/src/app/api/
├── gateway/
│   └── [...path]/route.ts       # Pass-through for all worker APIs
└── mobile/
    └── auth/
        ├── request-code/route.ts  # Send OTP
        ├── verify-code/route.ts   # Verify OTP → get tokens
        └── refresh/route.ts       # Refresh tokens

IMPORTANT: Gateway session validation is placeholder!
validateMobileSession() returns mock data - needs proper
JWT/session validation against inhouse_mobile_sessions table.

2026-01-31: Worker OTP Routes - Completed (apps/worker/)
- Created /routes/platformMobileAuth.ts with 4 endpoints:
  • POST /v1/platform/auth/request-code - Generate OTP, send email
  • POST /v1/platform/auth/verify-code - Verify OTP, create session, return tokens
  • POST /v1/platform/auth/refresh - Refresh access token
  • POST /v1/platform/auth/logout - Revoke session

- Created migration 157_inhouse_mobile_auth.sql with tables:
  • inhouse_mobile_users - Platform-level mobile users
  • inhouse_mobile_otp - One-time password codes (hashed)
  • inhouse_mobile_sessions - Session tokens (hashed)
  • inhouse_mobile_push_preferences - Push notification settings

- Registered routes in server.ts

Security features implemented:
- OTP hashing (SHA-256, never store plaintext)
- Token hashing for session storage
- Rate limiting (5 OTP requests/10min, 10 verify attempts/10min)
- Max 5 failed OTP attempts before lockout
- OTP expiry (10 minutes)
- Session expiry (30 days for mobile)
- Automatic cleanup of expired OTPs

2026-01-31: Gateway Session Validation - Completed
- Created /lib/auth/mobile-session.ts with proper validation
- Updated gateway to use validateMobileSession()

2026-01-31: IMPORTANT CORRECTION - Use Supabase Auth
- Refactored to use EXISTING auth.users (Supabase Auth)
- Mobile users = same users as web app (no separate user table)
- Mobile auth adds OTP + session layer on top of existing auth

Corrected architecture:
```
Web:    Supabase Auth → auth.users
Mobile: OTP → validates against auth.users → mobile session layer
```

Tables (migration 157):
- inhouse_mobile_otp: OTP codes (references auth.users)
- inhouse_mobile_sessions: Mobile sessions (references auth.users)
- inhouse_mobile_push_preferences: Push settings

Key points:
- Users must register via web first (mobile is companion app)
- OTP request returns generic message to prevent enumeration
- Worker queries auth.users for user lookup
- Session validation uses user_id from auth.users

2026-01-31: Route Naming Correction
- Renamed from /v1/inhouse/auth/* to /v1/platform/auth/*
- Reason: "inhouse" is for Easy Mode SDK (end users of customer apps)
         "platform" is for SheenApps platform (our customers)
- Files renamed: inhouseMobileAuth.ts → platformMobileAuth.ts

Naming distinction:
  /v1/inhouse/*  → Easy Mode SDK (customer's end users)
  /v1/platform/* → SheenApps platform (our customers)

Next steps:
1. Run migration 157_inhouse_mobile_auth.sql
2. (Optional) Create get_user_by_id RPC in Supabase for Next.js
3. Add OTP email sending in worker
4. Test auth flow end-to-end
5. Connect mobile app to real APIs
```

---

*Document updated after external expert review. Technical feedback: thin BFF gateway, HMAC canonicalization, tenant scoping, OTP-first auth, device ID strategy, push cleanup policy. Strategic feedback: consider Notifications Platform (WhatsApp-first) or Thin Operator App before committing to full mobile product.*

---

## Update Log

| Date | Changes |
|------|---------|
| 2026-01-30 | Initial document created |
| 2026-01-31 | Updated after expert review, added implementation progress |
| 2026-02-01 | **Monorepo alignment**: Updated all references for Turborepo monorepo migration. Mobile will live at `apps/mobile/`, consuming workspace packages (`@sheenapps/api-contracts`, `@sheenapps/platform-tokens`, `@sheenapps/capabilities`). Added section 3.1.1 "Monorepo Integration". See [MONOREPO_ANALYSIS_AND_PLAN.md](./MONOREPO_ANALYSIS_AND_PLAN.md) for full monorepo details. |
| 2026-02-01 | **Mobile app created**: Created Expo app directly in `apps/mobile/` with: Metro workspace config, i18n with platform-tokens RTL detection, auth screens (login/OTP verify), tab navigation (dashboard/projects/settings), API client for gateway. Phase 1A Weeks 1-2 complete. |
