# Technology Audit Report: Prompt-to-First-Iteration Flow

**Project:** SheenApps AI Builder
**Audit Date:** January 8, 2026
**Scope:** User prompt submission → System processing → First iteration display → Recommendations
**Prepared for:** External Expert Review

---

## Executive Summary

This audit examines the complete flow from when a user provides their initial prompt through to receiving their first iteration and subsequent recommendations. The analysis covers architecture, performance, Arabic readiness, and identifies areas for strategic improvement.

### Key Findings

| Area | Rating | Summary |
|------|--------|---------|
| **Architecture** | B+ | Solid monorepo with clear separation, but some coupling concerns |
| **Performance** | B | Good foundations with room for latency optimization |
| **Arabic Readiness** | A- | Production-ready RTL with 4 regional variants |
| **Recommendations System** | B+ | Well-designed but timing could be optimized |
| **Overall Assessment** | **B+** | Mature system with targeted optimization opportunities |

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Prompt Submission Flow Analysis](#2-prompt-submission-flow-analysis)
3. [System Processing & Iteration Generation](#3-system-processing--iteration-generation)
4. [First Iteration Display](#4-first-iteration-display)
5. [Recommendations System](#5-recommendations-system)
6. [Arabic Language Readiness](#6-arabic-language-readiness)
7. [Performance Analysis](#7-performance-analysis)
8. [Critical Issues & Recommendations](#8-critical-issues--recommendations)
9. [Strategic Refactoring Recommendations](#9-strategic-refactoring-recommendations)
10. [Appendices](#appendices)

---

## 1. System Architecture Overview

### 1.1 Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                 │
│  Next.js 15 (App Router) + TypeScript + Tailwind CSS 4          │
│  State: Zustand | Data: React Query | Forms: React Hook Form    │
│  i18n: next-intl (9 locales) | UI: Radix UI                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS + HMAC Auth
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND                                  │
│  Fastify 5 (Node.js 22.x) + TypeScript (strict)                 │
│  Queue: BullMQ + Redis | Jobs: Node Cron                        │
│  AI: Anthropic Claude Code through Terminal (Not API)           │
│  Storage: CF R2 | Deploy: Cloudflare                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ RLS-First
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATABASE                                 │
│  Supabase (PostgreSQL) with Row-Level Security                  │
│  Auth: Supabase Auth | Realtime: Supabase Realtime              │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Monorepo Structure

```
/sheenapps/
├── /sheenappsai/              # Next.js 15 frontend
│   ├── /src/app/              # App Router (59+ API routes)
│   ├── /src/components/       # 42+ React components
│   ├── /src/hooks/            # 30+ custom hooks
│   ├── /src/services/         # 44+ service modules
│   ├── /src/store/            # 15+ Zustand stores
│   └── /src/messages/         # 9 locale translation files
│
└── /sheenapps-claude-worker/  # Fastify backend
    ├── /src/routes/           # 78+ API route handlers
    ├── /src/services/         # 150+ service modules
    ├── /src/workers/          # 14+ background workers
    ├── /src/queue/            # BullMQ queue definitions
    └── /src/jobs/             # Scheduled cron jobs
```

### 1.3 Authentication Architecture

- **Frontend → Backend:** Dual-signature HMAC (V1 + V2 for rollout compatibility)
- **User Auth:** Supabase Auth with JWT tokens
- **Database:** Row-Level Security (RLS) enforced at database level
- **No service role key in production** (security-first design)

---

## 2. Prompt Submission Flow Analysis

### 2.1 User Input Entry Point

**Component:** `src/components/builder/chat/chat-input.tsx`

```
User Types in Chat Input
         │
         ▼
┌─────────────────────────────────────┐
│     ChatInput Component             │
│  - Textarea with mode toggle        │
│  - Build mode vs Plan mode          │
│  - Enter to submit (Shift+Enter     │
│    for newlines)                    │
│  - iOS-optimized (16px font)        │
└─────────────────────────────────────┘
         │
         │ onSubmit()
         ▼
┌─────────────────────────────────────┐
│     usePersistentChat Hook          │
│  - sendMessage(text, target, mode)  │
│  - Creates optimistic message       │
│  - Generates clientMsgId            │
└─────────────────────────────────────┘
```

### 2.2 Message Routing Logic

```typescript
// Two distinct paths based on mode and target
if (target === 'ai' && mode === 'build') {
  // Path A: Unified message → triggers build
  sendUnifiedMessageMutation()
} else {
  // Path B: Regular message → plan discussion
  sendMessageMutation()
}
```

### 2.3 API Route Processing

**Endpoint:** `POST /api/persistent-chat/messages`

```
┌─────────────────────────────────────────────────────────────┐
│                    API Route Processing                      │
├─────────────────────────────────────────────────────────────┤
│  1. Authenticate user via Supabase                          │
│  2. Validate required fields (project_id, text)             │
│  3. Generate clientMsgId if not provided                    │
│  4. Build request payload with user context                 │
│  5. Create HMAC-signed headers (createWorkerAuthHeaders())  │
│  6. Forward to Worker backend                               │
│  7. Transform response and return to client                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HMAC + x-sheen-locale header
                              ▼
           Worker: POST /v1/projects/{projectId}/chat/messages
```

### 2.4 Prompt Analysis (Pre-Generation)

**Endpoint:** `POST /api/ai/analyze-prompt`

For initial business idea input, the system performs semantic analysis:

```typescript
// Analysis Output Structure
{
  businessType: string,        // e.g., "salon", "restaurant"
  confidence: number,          // 0-100
  extractedInfo: {
    services: string[],        // booking, payment, inventory
    personality: string[],     // luxury, friendly, professional
    targetAudience: string[],  // families, professionals
    functionalRequirements: string[]
  },
  missingInformation: string[],
  suggestedQuestions: string[]
}
```

### 2.5 Assessment: Prompt Submission Flow

| Aspect | Status | Notes |
|--------|--------|-------|
| Optimistic updates | ✅ Good | Immediate UI feedback with clientMsgId |
| Error handling | ✅ Good | Retry logic with exponential backoff (max 5s) |
| Deduplication | ✅ Good | clientMsgId prevents duplicate messages |
| Auth security | ✅ Excellent | HMAC dual-signature, no Bearer tokens exposed |
| Mode handling | ⚠️ Adequate | Two separate mutation paths add complexity |

**Concern:** The branching between `sendUnifiedMessageMutation` and `sendMessageMutation` creates code duplication and potential inconsistency.

---

## 3. System Processing & Iteration Generation

### 3.1 Build Queue Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    BullMQ Queue System                          │
├────────────────────────────────────────────────────────────────┤
│  buildQueue      → Project building with progress events       │
│  streamQueue     → Streaming operations                        │
│  deployQueue     → Deployment to Cloudflare                    │
│  planQueue       → Plan mode conversations                     │
│  taskQueue       → General background tasks                    │
│  webhookQueue    → External webhook processing                 │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Build Worker Flow

```
User Prompt Received
         │
         ▼
┌─────────────────────────────────────┐
│     buildQueue.add(job)             │
│  - projectId, userId, prompt        │
│  - mode: 'create' | 'update'        │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│     buildWorker.process()           │
│  1. Initialize build context        │
│  2. Call Claude AI for generation   │
│  3. Stream progress events          │
│  4. Save artifacts to S3            │
│  5. Update database state           │
│  6. Trigger deploy if successful    │
└─────────────────────────────────────┘
         │
         │ SSE Events
         ▼
┌─────────────────────────────────────┐
│     buildSSEBridge                  │
│  - Broadcasts to connected clients  │
│  - 7 event types supported          │
└─────────────────────────────────────┘
```

### 3.3 Streaming Event Types

| Event Type | Purpose | Payload |
|------------|---------|---------|
| `connection` | Session established | sessionId |
| `assistant_text` | Streamed AI response | text chunk, featurePlan? |
| `tool_use` | Tool invocation | tool name, parameters |
| `tool_result` | Tool execution result | result data |
| `progress_update` | Localized progress | i18n message key |
| `complete` | Stream finished | full response object |
| `error` | Error occurred | code, message, details |

### 3.4 Response Processing Pipeline

```
SSE Stream from Worker
         │
         ▼
┌─────────────────────────────────────┐
│     ChatPlanClient.streamChat()     │
│  - Custom fetch-based SSE           │
│  - Manual event parsing             │
│  - Event dispatch to callbacks      │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│     useChatPlan Hook                │
│  - Accumulates streamed text        │
│  - Preserves structured data        │
│  - Manages streaming state          │
│  - useRef to avoid closure issues   │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│     RAF-Based Streaming Buffer      │
│  - Batches chunks on animation      │
│    frames (~60 updates/sec max)     │
│  - Per-file buffering               │
│  - Reduces store updates 10-20x     │
└─────────────────────────────────────┘
```

### 3.5 Assessment: System Processing

| Aspect | Status | Notes |
|--------|--------|-------|
| Queue architecture | ✅ Excellent | BullMQ with Redis is production-grade |
| Streaming efficiency | ✅ Good | RAF buffering reduces UI churn |
| Error recovery | ✅ Good | claudeErrorResolver with classification |
| Progress feedback | ✅ Good | 7 event types for granular updates |
| Build state management | ⚠️ Adequate | Multiple stores create sync complexity |

**Concern:** State spread across `build-state-store`, `code-viewer-store`, and component-level state creates potential for race conditions.

---

## 4. First Iteration Display

### 4.1 Display Flow Timeline

```
t=0      User submits prompt
         │
t=~100ms Optimistic message appears in chat
         │
t=~200ms Loading indicator shown (isAssistantTyping=true)
         │
t=~500ms SSE connection established
         │
t=1-10s  Streaming tokens displayed progressively
         │
t=10-60s Build completes, preview URL available
         │
t+3-4s   Recommendations fetched and displayed
```

### 4.2 UI Components Involved

```
┌─────────────────────────────────────────────────────────────┐
│              BuilderChatInterface                            │
│  - Manages message list                                      │
│  - Handles mode switching (build/plan)                       │
│  - Coordinates streaming display                             │
├─────────────────────────────────────────────────────────────┤
│              ChatMessages                                    │
│  - Renders message list                                      │
│  - Different renderers per message type:                     │
│    • assistant → Text with emotion/actions                   │
│    • recommendation → Cards with suggestions                 │
│    • interactive → Button options                            │
│    • clean_build_events → Build progress component           │
├─────────────────────────────────────────────────────────────┤
│              CleanBuildProgress                              │
│  - Phase indicators (Planning, Coding, Testing, Deploy)      │
│  - Progress percentage                                       │
│  - Preview URL when ready                                    │
├─────────────────────────────────────────────────────────────┤
│              VirtualizedCodeView                             │
│  - react-window for 100k+ line files                         │
│  - O(1) scroll via line index lookup                         │
│  - Plain text during stream, syntax highlight on idle        │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Response Type Handling

```typescript
// 5 Response Types with Different UI Treatments
type ChatPlanResponse =
  | QuestionResponse      // Answer with code references
  | FeaturePlanResponse   // Step-by-step implementation plan
  | FixPlanResponse       // Bug fix with solution
  | AnalysisResponse      // Code analysis report
  | GeneralResponse       // General conversation
```

### 4.4 Assessment: First Iteration Display

| Aspect | Status | Notes |
|--------|--------|-------|
| Streaming UX | ✅ Good | Progressive token display |
| Progress feedback | ✅ Good | Phase indicators with percentage |
| Code display | ✅ Excellent | Virtualized for large files |
| Error states | ✅ Good | Balance errors, connection errors handled |
| Loading states | ✅ Good | Skeleton screens match final UI |

**Concern:** The 3-4 second delay before showing recommendations (after build completion) is arbitrary and could be optimized.

---

## 5. Recommendations System

### 5.1 Architecture

```
Build Completes
         │
         ▼
┌─────────────────────────────────────┐
│     recommendationsPrompt.ts        │
│  (Worker)                           │
│  - Zod schema validation            │
│  - 3-7 recommendations generated    │
│  - Semantic versioning hints        │
└─────────────────────────────────────┘
         │
         │ Stored in Database
         ▼
┌─────────────────────────────────────┐
│     GET /projects/:id/recommendations│
│  - HMAC signature validation        │
│  - Locale-aware (x-sheen-locale)    │
│  - Returns categorized list         │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│     useProjectRecommendations       │
│  - React Query with 5-min stale     │
│  - Max 2 retries                    │
│  - Skip retry on 404/401            │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│     ProjectRecommendations UI       │
│  - Animated card entrance           │
│  - Category icons with colors       │
│  - Priority/impact/complexity       │
│  - "Add This Feature" CTA           │
└─────────────────────────────────────┘
```

### 5.2 Recommendation Schema

```typescript
interface ProjectRecommendation {
  id: number,                    // 1-10
  title: string,
  description: string,
  category: RecommendationCategory,
  complexity: 'easy' | 'medium' | 'hard',
  impact: 'low' | 'medium' | 'high',
  versionHint: 'patch' | 'minor' | 'major',
  prompt: string                 // Executable AI instruction
}

type RecommendationCategory =
  | 'feature' | 'ui' | 'performance' | 'security'
  | 'seo' | 'accessibility' | 'deployment'
  | 'development' | 'functionality' | 'testing'
```

### 5.3 Smart Hints System (Contextual Guidance)

```
User Behavior Signals
         │
         ▼
┌─────────────────────────────────────┐
│     HintEngine                      │
│  - Confusion detection:             │
│    • >30s on one question           │
│    • >5 option hovers w/o select    │
│    • >2 backtrack events            │
│    • No preview interaction         │
│  - Hint types:                      │
│    explanation, suggestion,         │
│    encouragement, tutorial, warning │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│     SmartHint Component             │
│  - Queue management                 │
│  - Priority-based styling           │
│  - Auto-hide with progress bar      │
│  - Pulsing for urgent hints         │
└─────────────────────────────────────┘
```

### 5.4 Assessment: Recommendations System

| Aspect | Status | Notes |
|--------|--------|-------|
| Generation quality | ✅ Good | AI-powered with structured schema |
| UI presentation | ✅ Excellent | Rich cards with visual hierarchy |
| Action execution | ✅ Good | Direct prompt execution on selection |
| Timing | ⚠️ Needs Work | 35-second fallback timer is too long |
| Smart hints | ✅ Good | Behavioral signals well-designed |

**Critical Issue:** The 35-second fallback timer for recommendations is excessive. If recommendations aren't ready, the user waits too long or misses them entirely.

---

## 6. Arabic Language Readiness

### 6.1 i18n Configuration

```typescript
// Supported Locales (9 total)
const locales = [
  'en',                    // English (default)
  'ar', 'ar-eg', 'ar-sa', 'ar-ae',  // Arabic variants
  'fr', 'fr-ma',           // French variants
  'es',                    // Spanish
  'de'                     // German
]

// RTL Detection
const RTL_LOCALES = new Set(['ar', 'ar-eg', 'ar-sa', 'ar-ae'])
const direction = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'
```

### 6.2 Arabic Font Stack

```typescript
// Primary: Cairo (Google Fonts)
const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700"],  // Optimized from 9 weights
  display: 'swap',
  preload: true,
})

// Secondary: IBM Plex Sans Arabic
const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],  // Optimized from 7 weights
  display: 'swap',
})
```

### 6.3 RTL Implementation

```html
<!-- Root HTML Element -->
<html lang={locale} dir={direction} className={fontClasses}>
```

**CSS Approach:**
- Semantic tokens preferred: `start`, `end`, `ms`, `me`, `ps`, `pe`
- RTL variants via `rtl:` Tailwind prefix
- CSS logical properties over physical (`margin-inline-start` vs `margin-left`)

### 6.4 Regional Customization

```typescript
// Locale-specific pricing
const regionalPricing = {
  'ar-eg': { multiplier: 0.15, discount: 0.2 },  // Egypt: lower costs
  'ar-sa': { multiplier: 1.1, discount: 0 },     // Saudi: premium
  'ar-ae': { multiplier: 1.2, discount: 0 },     // UAE: premium
}

// Locale-specific timezones
const timeZones = {
  'ar-eg': 'Africa/Cairo',
  'ar-sa': 'Asia/Riyadh',
  'ar-ae': 'Asia/Dubai',
}
```

### 6.5 Backend i18n Support

**Worker Locale Handling:**
- Header: `x-sheen-locale` (en|ar|fr|es|de)
- RTL detection: `locale.startsWith('ar')`
- IntlMessageFormat for ICU syntax
- Fallback chain: Compiled → Template → Error code

### 6.6 Test Coverage

```typescript
// E2E Tests (i18n.smoke.spec.ts)
✅ Arabic locale navigation (/ar-eg)
✅ RTL attribute verification (dir="rtl")
✅ Arabic text detection (Unicode \u0600-\u06FF)
✅ Arabic login form
✅ Arabic dashboard
✅ RTL persistence across navigation
✅ Language switcher functionality
```

### 6.7 Assessment: Arabic Readiness

| Aspect | Status | Notes |
|--------|--------|-------|
| RTL layout | ✅ Excellent | Comprehensive CSS logical properties |
| Typography | ✅ Excellent | Cairo + IBM Plex Arabic, optimized |
| Regional variants | ✅ Excellent | 4 Arabic dialects supported |
| Translations | ✅ Good | All namespaces translated |
| Backend support | ✅ Good | Locale header respected |
| Testing | ✅ Good | E2E coverage for RTL |
| SEO | ✅ Good | hreflang, OG locale mapping |

**Minor Issue:** Backend only supports base locales (ar, not ar-eg), so regional variants fall back to base Arabic for server-generated content.

---

## 7. Performance Analysis

### 7.1 Loading Performance

**Code Splitting:**
- 28+ lazy-loaded components
- ~200KB saved on initial bundle
- Framer Motion dynamically imported

```typescript
// Example Lazy Components
const LazyBuilderInterface = lazy(() => import('./builder-interface'))
const LazyQuestionInterface = lazy(() => import('./question-interface'))
const LazyCelebrationEffects = lazy(() => import('./celebration-effects'))
```

**Skeleton Screens:**
- Project grid/list skeletons
- Mobile panel skeletons (4 types)
- Builder interface skeletons

### 7.2 Runtime Performance

**Virtualization:**
- `react-window` for code viewer (100k+ lines)
- `@tanstack/virtual` for lists
- O(1) scroll to any line

**Memoization:**
- 32+ `useMemo`/`useCallback` instances in code-viewer
- `React.memo()` for expensive components
- RAF-based streaming buffer (10-20x fewer updates)

**Event Handling:**
- RAF-based throttling (60fps)
- Passive scroll/resize listeners
- Debounced search inputs

### 7.3 Caching Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Caching Layers                            │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: In-Memory (AI responses)                          │
│  - 24-hour TTL                                              │
│  - Hourly cleanup                                           │
│  - Deterministic key hashing                                │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Redis (Rate limits, sessions)                     │
│  - Sliding window algorithm                                 │
│  - Atomic Lua scripts                                       │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: React Query (Client state)                        │
│  - 5-minute stale time (recommendations)                    │
│  - 10-minute stale time (post-build)                        │
│  - Automatic background refetch                             │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Triple No-Cache (Fresh data)                      │
│  - Route: dynamic='force-dynamic', revalidate=0             │
│  - Headers: Cache-Control: no-store                         │
│  - Client: timestamp query params                           │
└─────────────────────────────────────────────────────────────┘
```

### 7.4 Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| API General | 100 | 1 min |
| AI Generation | 10 | 1 min |
| Auth Attempts | 5 | 15 min |
| Uploads | 20 | 1 min |
| Webhooks | 100 | 1 min |

### 7.5 Performance Monitoring

```typescript
// Built-in Monitoring
- Frame rate (FPS)
- Average render time
- Memory usage (Chrome API)
- Session duration
- Reconnect attempts
- Slow render warnings (>100ms)
```

### 7.6 Assessment: Performance

| Aspect | Status | Notes |
|--------|--------|-------|
| Initial load | ✅ Good | Code splitting reduces bundle |
| Streaming | ✅ Excellent | RAF buffering, virtualization |
| Caching | ✅ Excellent | Multi-layer strategy |
| Rate limiting | ✅ Excellent | Redis-backed with Lua |
| Monitoring | ✅ Good | Built-in performance tracking |

**Concern:** No explicit measurement of Time-to-First-Iteration (TTFI) metric. This should be tracked.

---

## 8. Critical Issues & Recommendations

### 8.1 Critical Issues

#### Issue 1: 35-Second Recommendations Fallback Timer
**Severity:** High
**Impact:** Poor UX when recommendations are slow

```typescript
// Current Implementation
const RECOMMENDATIONS_FALLBACK_TIMER = 35000 // Too long!
```

**Recommendation:** Reduce to 10 seconds with progressive loading:
```typescript
// Proposed
const RECOMMENDATIONS_QUICK_CHECK = 5000   // Quick API check
const RECOMMENDATIONS_FALLBACK = 10000     // Show generic suggestions
// Stream recommendations as they become available
```

#### Issue 2: State Fragmentation
**Severity:** Medium
**Impact:** Potential race conditions, debugging difficulty

**Current State Distribution:**
- `build-state-store.ts` - Build IDs, timestamps
- `code-viewer-store.ts` - File contents, streaming
- `builder-chat-interface.tsx` - Local message state
- `usePersistentChat` - Hook-level state
- `useChatPlan` - Streaming state

**Recommendation:** Consolidate into unified build session store:
```typescript
interface BuildSessionStore {
  // Single source of truth
  session: {
    buildId: string | null
    projectId: string | null
    status: BuildStatus
    startedAt: number | null
  }
  streaming: {
    isActive: boolean
    currentText: string
    tools: string[]
    progress: string
  }
  messages: Message[]
  recommendations: Recommendation[]
}
```

#### Issue 3: Duplicate API Paths
**Severity:** Low
**Impact:** Code maintenance burden

Two separate mutation paths for messages:
- `sendUnifiedMessageMutation` (build mode)
- `sendMessageMutation` (plan mode)

**Recommendation:** Unify into single mutation with mode parameter.

### 8.2 Performance Optimizations

#### Optimization 1: Measure Time-to-First-Iteration (TTFI)

Add explicit tracking:
```typescript
// Track TTFI metric
const ttfiStart = performance.now()
// ... on first content visible
const ttfi = performance.now() - ttfiStart
analytics.track('ttfi', { value: ttfi, locale, mode })
```

#### Optimization 2: Preload Recommendations

Start fetching recommendations earlier:
```typescript
// Current: Wait for build complete + 35s
// Proposed: Start at 80% progress
if (buildProgress >= 0.8 && !recommendationsPreloaded) {
  prefetchRecommendations(projectId)
}
```

#### Optimization 3: Connection Pooling for SSE

Current implementation creates new connections frequently. Implement connection reuse:
```typescript
// Connection pool for SSE streams
class SSEConnectionPool {
  private connections: Map<string, EventSource>

  getOrCreate(projectId: string): EventSource {
    if (!this.connections.has(projectId)) {
      this.connections.set(projectId, createSSEConnection(projectId))
    }
    return this.connections.get(projectId)!
  }
}
```

---

## 9. Strategic Refactoring Recommendations

### 9.1 Short-Term (1-2 Sprints)

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| P0 | Reduce recommendations timer to 10s | Low | High |
| P0 | Add TTFI metric tracking | Low | Medium |
| P1 | Preload recommendations at 80% | Medium | High |
| P1 | Unify message mutation paths | Medium | Medium |

### 9.2 Medium-Term (1-2 Months)

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| P1 | Consolidate state stores | High | High |
| P1 | SSE connection pooling | Medium | Medium |
| P2 | Backend regional locale support | Medium | Low |
| P2 | Progressive recommendations loading | Medium | High |

### 9.3 Long-Term Considerations

1. **WebSocket Migration:** Consider replacing SSE with WebSocket for bidirectional communication
2. **Edge Functions:** Move prompt analysis to edge for lower latency
3. **Streaming Recommendations:** Generate and stream recommendations during build, not after
4. **Predictive Caching:** Pre-generate common recommendation patterns

---

## Appendices

### Appendix A: Key File Locations

| Component | Path |
|-----------|------|
| Chat Input | `/sheenappsai/src/components/builder/chat/chat-input.tsx` |
| Persistent Chat Hook | `/sheenappsai/src/hooks/use-persistent-chat.ts` |
| Chat Plan Hook | `/sheenappsai/src/hooks/use-chat-plan.ts` |
| Build Events Hook | `/sheenappsai/src/hooks/use-clean-build-events.ts` |
| Messages API | `/sheenappsai/src/app/api/persistent-chat/messages/route.ts` |
| Stream API | `/sheenappsai/src/app/api/chat-plan/stream/route.ts` |
| Recommendations Prompt | `/sheenapps-claude-worker/src/services/recommendationsPrompt.ts` |
| Recommendations Route | `/sheenapps-claude-worker/src/routes/recommendations.ts` |
| Build Worker | `/sheenapps-claude-worker/src/workers/buildWorker.ts` |
| i18n Config | `/sheenappsai/src/i18n/config.ts` |
| RTL Layout | `/sheenappsai/src/app/[locale]/layout.tsx` |

### Appendix B: Observability Stack

| Tool | Purpose |
|------|---------|
| Sentry | Error tracking (frontend + backend) |
| Grafana Faro | Frontend performance monitoring |
| OpenTelemetry | Distributed tracing |
| Pino | Structured logging |
| PostHog | User analytics |
| Microsoft Clarity | Session recordings |
| Bull Board | Queue visualization |

### Appendix C: Response Time Benchmarks (Estimated)

| Stage | Current | Target |
|-------|---------|--------|
| Prompt submission | ~100ms | ~100ms |
| SSE connection | ~500ms | ~300ms |
| First token | ~1-2s | ~1s |
| Build complete | 10-60s | 10-45s |
| Recommendations visible | +35s | +5s |
| **Total TTFI** | **~15s** | **~10s** |

---

## Conclusion

The SheenApps prompt-to-iteration flow is **architecturally sound** with **production-grade infrastructure**. The system demonstrates thoughtful engineering in streaming, state management, and internationalization.

**Key Strengths:**
- Excellent Arabic/RTL support (A- rating)
- Robust queue-based build system
- Comprehensive observability
- Strong security posture (HMAC, RLS)

**Priority Improvements:**
1. Reduce recommendations timer from 35s to 10s (Quick win, high impact)
2. Add TTFI metric tracking (Essential for optimization)
3. Consolidate state stores (Medium effort, high maintainability impact)
4. Preload recommendations at 80% build progress (Improves perceived speed)

The system is **not** in need of a significant refactor. Targeted optimizations in the areas identified will yield meaningful improvements without architectural upheaval.

---

*Report prepared by Claude Code AI Assistant*
*Audit methodology: Deep codebase analysis across 200+ files, architecture review, performance assessment*
