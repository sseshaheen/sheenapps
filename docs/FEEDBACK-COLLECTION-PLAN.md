# Subtle User Feedback Collection Plan

> A comprehensive strategy for non-intrusive, non-disruptive feedback collection across the web application experience.

### Three Critical Priorities

If you implement nothing else, do these:

1. **Server-side eligibility + caps** — Client-side only is weak (cleared storage, multi-device). Server is source of truth.
2. **Governance loop** — Route feedback to the right team, define acknowledgment SLAs, close the loop when issues are fixed.
3. **Privacy minimization** — Store derived signals (not raw data), scrub PII from free-text, short retention for implicit signals.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Feedback Categories](#feedback-categories)
3. [Implementation Strategies](#implementation-strategies)
4. [Touchpoint Matrix](#touchpoint-matrix)
5. [Governance & Operations](#governance--operations)
6. [Technical Implementation](#technical-implementation)
7. [Privacy & Consent](#privacy--consent)
8. [Sampling & Bias](#sampling--bias)
9. [Tools & Integration Options](#tools--integration-options)
10. [Success Metrics](#success-metrics)

---

## Core Principles

### The Golden Rules of Non-Intrusive Feedback

| Principle | Description |
|-----------|-------------|
| **Task First, Ask Second** | Never interrupt users mid-task. Wait until they complete an action before requesting feedback. |
| **Respect Timing** | Trigger feedback requests at natural pause points, not during critical flows. |
| **Minimize Friction** | One-tap responses > multi-step surveys. Every click reduces response rate. |
| **Give Control** | Let users choose when and how to provide feedback. Always dismissible. |
| **Show Value** | Explain briefly how feedback will be used. Close the loop when possible. |
| **Frequency Caps** | Never survey the same user more than once per 90 days for NPS; micro-surveys max 1 per session. |
| **Queue Priority** | Don't pile on frustrated users. Priority order: (1) Error/help prompt → (2) Success pulse → (3) NPS → (4) Exit intent. Only one per session. |
| **Close the Loop** | When a voted feature ships or reported bug is fixed, notify the user. Otherwise feedback feels like a void. |

---

## Feedback Categories

### 1. Passive/Implicit Feedback (Zero User Effort)

Collected automatically through behavior observation:

| Signal | What It Indicates | Collection Method | Notes |
|--------|-------------------|-------------------|-------|
| **Time on page/feature** | Engagement level, confusion, or deep interest | Analytics events | Store aggregates, not raw timestamps |
| **Scroll depth** | Content consumption, interest dropoff | Intersection Observer | Percentage buckets (25/50/75/100) |
| **Rage clicks** | Frustration, broken UI elements | Click pattern detection | 3+ clicks in 2s on same area |
| **Dead clicks** | Expected interactivity missing | Click on non-interactive elements | Use `data-track` attributes only (see Hard Requirements below) |
| **Mouse thrashing** | Confusion, searching for something | Mouse movement patterns | **⚠️ Experimental:** Off by default, sampled 1-5%, store only derived `thrashingScore`, discard raw coords |
| **Feature adoption** | What users actually use vs. ignore | Feature flags + analytics | Use stable `featureId`, not route paths |
| **Drop-off points** | Where users abandon flows | Funnel analytics | — |
| **Error encounters** | Pain points, bugs | Error boundary tracking | Auto-route to engineering queue |
| **Session recordings** | Holistic UX understanding | Opt-in session replay | See Privacy section for constraints |

#### Hard Requirements for Implicit Signals

**No exceptions. These prevent accidental PII leakage:**

| ❌ Never Store | ✅ Store Instead |
|----------------|------------------|
| CSS selectors (`.btn-primary`, `#user-email`) | `data-track="cta-signup"` attributes you control |
| Raw DOM text content | Nothing, or sanitized category labels |
| Raw mouse coordinates | Derived scores (`thrashingScore: 0.7`) |
| Full URLs with query params | Path only, or sanitized route names |
| Element innerHTML | Nothing |

```typescript
// ❌ BAD - leaks DOM structure and possibly PII
{ elementSelector: '.user-profile > .email-field', text: 'john@example.com' }

// ✅ GOOD - stable ID you control
{ elementId: 'profile-email-copy-btn' }
```

### 2. Active/Explicit Feedback (Minimal User Effort)

Requires user action but designed for speed:

| Type | Effort Level | Best For |
|------|--------------|----------|
| **Binary (thumbs up/down)** | 1 tap | Quick sentiment on specific features |
| **Emoji scale** | 1 tap | Emotional response to content/experience |
| **Star rating** | 1 tap | Quantifiable satisfaction scores |
| **Single-question micro-survey** | 1-2 taps | Contextual insights post-action |
| **NPS (0-10)** | 2 taps | Overall relationship health |
| **Feature voting** | 1 tap | Prioritization signals |
| **Open text (optional)** | Variable | Qualitative depth (always optional) |

---

## Implementation Strategies

### Strategy 1: Contextual Micro-Feedback Widgets

**Concept:** Small, inline feedback prompts that appear naturally within content.

```
┌─────────────────────────────────────────────────┐
│  Article/Feature Content                        │
│  ...                                            │
│  ─────────────────────────────────────────────  │
│  Was this helpful?  [👍] [👎]                   │
│                                                 │
│  [On thumbs down, expand:]                      │
│  What could be better? [____________________]   │
└─────────────────────────────────────────────────┘
```

**Placement Locations:**
- End of help articles/documentation
- After completing a task successfully
- After using a new feature for the first time
- Post-onboarding milestone completion

**Implementation Notes:**
- Appears inline, not as overlay
- Thumbs down triggers optional text input
- Results tied to specific content/feature ID
- Never blocks user flow


### Strategy 2: Persistent Feedback Tab

**Concept:** Always-available, unobtrusive feedback entry point.

```
                                    ┌──────────┐
                                    │          │
    ┌──────────────────────────┐    │ Feedback │
    │                          │    │          │
    │   Main Application       │    └──────────┘
    │   Content                │         ↑
    │                          │    Fixed to right
    │                          │    edge, minimal
    └──────────────────────────┘    visual weight
```

**Behavior:**
- Collapsed by default (just "Feedback" or icon)
- Expands on click to reveal simple form
- Options: Bug report, Feature idea, General feedback
- Screenshot capture option
- Stores page context automatically

**Why It Works:**
- User-initiated = higher quality feedback
- Captures bugs and ideas at moment of frustration/inspiration
- Non-disruptive (user controls when to engage)


### Strategy 3: Completion-Triggered Micro-Surveys

**Concept:** Brief surveys that appear after meaningful task completion.

**Trigger Points:**
| Trigger | Survey Type | Questions |
|---------|-------------|-----------|
| First successful task completion | Onboarding satisfaction | "How easy was it to get started?" (1-5) |
| Feature first use (3rd session+) | Feature feedback | "How useful is [feature]?" (emoji scale) |
| After export/download | Task satisfaction | "Did you get what you needed?" (Y/N) |
| Subscription milestone | NPS | "How likely to recommend?" (0-10) |
| Support resolution | CSAT | "Was your issue resolved?" (Y/N + optional why) |

**Presentation:**
```
┌──────────────────────────────────────────────┐
│ Main App Content                             │
│                                              │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 🎉 Nice! You just completed X.         │  │
│  │                                        │  │
│  │ Quick question: How was that experience? │
│  │                                        │  │
│  │ 😞  😐  🙂  😊  🤩                      │  │
│  │                                        │  │
│  │              [Maybe later]  [×]        │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
                    ↑
           Bottom toast/banner style
           Not modal, not blocking
```


### Strategy 4: Inline Reaction Patterns

**Concept:** Embedded reaction options within the natural UI flow.

**Example: Feature Cards**
```
┌─────────────────────────────────────┐
│ Feature X                           │
│ Description of what feature does... │
│                                     │
│ [Use Feature]                       │
│                                     │
│ ───────────────────────────────── │
│ 💡 Have ideas for this feature?     │
│ [Request improvement]               │
└─────────────────────────────────────┘
```

**Example: Results/Output**
```
┌─────────────────────────────────────┐
│ Your Results                        │
│                                     │
│ [Generated content/data here...]    │
│                                     │
│ ───────────────────────────────── │
│ Rate this result: [👍] [👎] [📋 Copy]│
└─────────────────────────────────────┘
```


### Strategy 5: Smart Exit Intent ⚠️ *Optional/Experimental*

**Concept:** Catch users leaving without being annoying.

> **Recommendation:** Consider skipping this entirely unless you have a severe conversion problem. Exit intent can feel desperate and damages trust. If you implement it, test thoroughly and monitor negative feedback rates on this surface.

**Rules (if implemented):**
- **Never on mobile** — Exit detection is glitchy and feels like a trap door
- Only trigger on exit intent IF user hasn't engaged with other feedback this session
- Only show once per 30 days per user (server-enforced)
- Never on first visit
- Skip if user completed their likely goal
- Never trigger if user already saw a frustration prompt this session

**Presentation:**
```
┌─────────────────────────────────────────────┐
│                                             │
│  Before you go...                           │
│                                             │
│  We'd love 10 seconds of your time.         │
│                                             │
│  How would you rate your experience today?  │
│                                             │
│  😞   😐   🙂   😊   🤩                       │
│                                             │
│  [No thanks]                                │
│                                             │
└─────────────────────────────────────────────┘
         ↑
    Small, centered, dismissible
    Not full-page takeover
```


### Strategy 6: Passive Frustration Detection

**Concept:** Detect frustration signals and offer contextual help.

**Detection Triggers:**
- 3+ rage clicks in 2 seconds
- Repeated form submission errors
- Long idle time on complex forms
- Back/forward navigation loops

**Response (non-intrusive):**
```
┌────────────────────────────────────────┐
│ App Content                            │
│                                        │
│    ┌────────────────────────────┐      │
│    │ 💬 Need help?              │      │
│    │ [Chat with us] [No thanks] │      │
│    └────────────────────────────┘      │
│               ↑                        │
│      Small, corner positioned          │
└────────────────────────────────────────┘
```


### Strategy 7: Feature Voting Board

**Concept:** Public or semi-public roadmap where users vote on priorities.

**Placement:** Accessible from settings/help menu, not intrusive.

**Benefits:**
- Users feel heard
- Validates demand before building
- Community-driven prioritization
- Reduces repetitive feature requests

---

## Touchpoint Matrix

| Journey Stage | Feedback Type | Trigger | Presentation | Frequency Cap |
|---------------|---------------|---------|--------------|---------------|
| **Onboarding** | Ease rating (1-5) | Complete onboarding | Bottom toast | Once |
| **First feature use** | Helpfulness (emoji) | 2nd use of feature | Inline below feature | Once per feature |
| **Repeated use (30 days)** | NPS | Login after 30 days active | Bottom banner | Every 90 days |
| **Error encountered** | Bug report prompt | After error message | Inline expansion | Per error type |
| **Help article viewed** | Helpful? (Y/N) | Scroll to bottom | Inline | Per article |
| **Task completion** | Quick satisfaction | Post-completion | Success toast | 1 per session |
| **Export/Download** | Quality check | After download | Bottom mini-survey | Once per 7 days |
| **Plan upgrade** | Decision factors | Post-upgrade | Email (not in-app) | Once |
| **Churn/Downgrade** | Exit survey | During cancel flow | Inline in flow | Once |
| **Support interaction** | CSAT | Post-resolution | Email or in-app | Per ticket |
| **Any time (user-initiated)** | Open feedback | Click feedback tab | Slide-out panel | Unlimited |

---

## Governance & Operations

> **The main missing piece from pure collection.** Without triage → action → closure, you collect a beautiful pile of sadness.

### Auto-Routing Rules

| Signal/Feedback Type | Route To | Priority |
|---------------------|----------|----------|
| Bug report + error encountered + 5xx in session | Engineering queue | High |
| Rage clicks + repeated errors on same page | Design review | Medium |
| Feature request from high-tier plan users | Product review | Medium |
| UX confusion signals (long idle on forms, nav loops) | Design review | Low |
| NPS detractor (0-6) with comment | Customer success | High |
| NPS promoter (9-10) | Marketing (testimonial opportunity) | Low |

### Response SLAs

| Feedback Type | Acknowledge Within | What "Acknowledge" Means |
|---------------|-------------------|--------------------------|
| Bug report | 48 hours | Human response confirming receipt and triage status |
| Feature request | 1 week | Added to public roadmap or response explaining why not |
| NPS detractor | 48 hours | Personal outreach from CS (not auto-reply) |
| General feedback | Auto-reply OK | Immediate auto-response thanking them |

### Close-the-Loop Mechanisms

**Critical:** Users learn quickly whether feedback is a void. Close the loop or they'll stop giving it.

| Event | Action |
|-------|--------|
| Voted feature ships | In-app notification or email: "✅ [Feature] you requested is live!" |
| Reported bug fixed | In-app notification: "We fixed an issue you reported" |
| Feedback leads to change | Optional: Monthly changelog mentions "Based on your feedback..." |

### Feedback Item Definition of Done

A feedback item isn't "done" until it has all of:

| Requirement | Examples |
|-------------|----------|
| **(a) Label** | `bug`, `feature-request`, `ux-confusion`, `praise`, `spam` |
| **(b) Owner** | Person or team responsible for disposition |
| **(c) Disposition** | `will-fix`, `wont-fix`, `duplicate`, `needs-info`, `shipped` |
| **(d) Closure action** (if applicable) | User notification sent, changelog entry added, or marked N/A |

This prevents slow death-by-inbox where items sit unlabeled forever.

### Internal Review Cadence

| Review | Frequency | Participants | Focus |
|--------|-----------|--------------|-------|
| Feedback triage | Daily (async) | Product/Eng on rotation | Route new items, flag urgent |
| UX friction review | Weekly | Design + Product | Rage clicks, drop-offs, confusion signals |
| NPS deep-dive | Monthly | Leadership + Product | Score trends, detractor themes |
| Roadmap prioritization | Monthly | Product | Feature votes vs. effort vs. strategy |

---

## Technical Implementation

### Architecture Overview (Next.js + Fastify)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Feedback     │  │ Analytics    │  │ UI Components        │   │
│  │ Context      │  │ Provider     │  │ - FeedbackTab        │   │
│  │ Provider     │  │ (implicit)   │  │ - MicroSurvey        │   │
│  │              │  │              │  │ - InlineRating       │   │
│  │ - frequency  │  │ - page views │  │ - EmojiScale         │   │
│  │   caps       │  │ - clicks     │  │ - NPSModal           │   │
│  │ - user prefs │  │ - scrolls    │  │ - ExitIntent         │   │
│  │ - queue mgmt │  │ - errors     │  │                      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│                    ┌─────────────────┐                          │
│                    │ Feedback API    │                          │
│                    │ Client          │                          │
│                    └────────┬────────┘                          │
│                             │                                    │
└─────────────────────────────┼────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Fastify Worker)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ POST /feedback   │  │ POST /analytics  │                     │
│  │                  │  │                  │                     │
│  │ - validate       │  │ - batch events   │                     │
│  │ - enrich context │  │ - aggregate      │                     │
│  │ - store          │  │ - store          │                     │
│  └────────┬─────────┘  └────────┬─────────┘                     │
│           │                     │                                │
│           └──────────┬──────────┘                                │
│                      ▼                                           │
│           ┌─────────────────────┐                               │
│           │ Storage             │                               │
│           │ - PostgreSQL/SQLite │                               │
│           │ - Time-series DB    │                               │
│           └─────────────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Recommended Component Structure

```
src/
├── components/
│   └── feedback/
│       ├── FeedbackProvider.tsx      # Context: state, queue priority, eligibility checks
│       ├── FeedbackTab.tsx           # Persistent side tab (highest signal)
│       ├── MicroSurvey.tsx           # Configurable popup survey
│       ├── InlineRating.tsx          # Thumbs up/down with optional follow-up
│       ├── EmojiScale.tsx            # 5-emoji satisfaction scale
│       ├── NPSSurvey.tsx             # 0-10 NPS component
│       ├── ExitIntent.tsx            # Exit detection + prompt (optional)
│       └── index.ts                  # Exports
├── hooks/
│   ├── useFeedback.ts                # Submit feedback, check server eligibility
│   ├── useFeedbackQueue.ts           # Queue priority: frustration > success > NPS > exit
│   ├── useFrustrationDetection.ts    # Rage clicks, dead clicks (use data-track attrs)
│   └── useExitIntent.ts              # Detect leaving behavior (optional)
├── lib/
│   └── feedback/
│       ├── client.ts                 # API client with idempotency
│       ├── eligibility.ts            # Hybrid: client cache + server check
│       ├── storage.ts                # Local storage for session state
│       └── types.ts                  # TypeScript interfaces
└── analytics/
    ├── implicit.ts                   # Passive signal collection (derived values only)
    └── events.ts                     # Event definitions with stable featureIds

# Backend (Fastify worker)
routes/
├── feedback/
│   ├── submit.ts                     # POST /feedback (idempotency, PII scrub, routing)
│   ├── eligibility.ts                # GET + POST eligibility (server-side caps)
│   └── analytics.ts                  # POST /analytics/batch
├── middleware/
│   ├── piiScrubber.ts                # Regex-based PII detection + redaction
│   └── idempotency.ts                # Reject duplicate submission IDs
└── services/
    ├── feedbackRouter.ts             # Auto-route to eng/product/CS queues
    └── notifier.ts                   # Close-the-loop notifications
```

### Data Model

```typescript
// Feedback submission
interface FeedbackSubmission {
  id: string;                    // UUID, used for idempotency (enforce uniqueness server-side)
  type: 'nps' | 'csat' | 'binary' | 'emoji' | 'text' | 'feature_request' | 'bug_report';
  value: number | string | boolean;
  textComment?: string;          // Server-side PII scrubbing applied (emails, phones, secrets)

  // Context (auto-captured)
  userId?: string;
  anonymousId: string;           // For non-logged-in users, persisted client-side
  sessionId: string;
  pageUrl: string;
  featureId?: string;            // Use stable IDs, NOT route paths (routes change)
  triggerPoint: string;

  // Prompt metadata (for analysis)
  promptId: string;              // Exact variant shown (e.g., "nps_v2", "feature_helpful_v1")
  placement: 'inline' | 'toast' | 'modal' | 'tab' | 'banner';
  goal: 'onboarding' | 'helpfulness' | 'satisfaction' | 'nps' | 'bug' | 'feature';

  // Environment
  timestamp: string;             // ISO 8601 string, NOT Date object
  userAgent: string;
  viewport: { width: number; height: number };
  locale: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  buildVersion: string;          // Correlate feedback spikes to deployments
}

// Implicit signal
interface ImplicitSignal {
  type: 'rage_click' | 'dead_click' | 'scroll_depth' | 'time_on_page' | 'error' | 'drop_off' | 'thrashing_score';
  value: number | string | Record<string, unknown>;  // Derived values, not raw data
  pageUrl: string;
  elementId?: string;            // Use data-track="xyz" attributes, NOT CSS selectors (avoid leaking DOM structure)
  sessionId: string;
  timestamp: string;             // ISO 8601 string
  buildVersion: string;
}

// Frequency tracking - HYBRID: client for UX speed, server for enforcement
interface FeedbackFrequency {
  lastNPS: string | null;        // ISO timestamp
  lastMicroSurvey: string | null;
  lastExitIntent: string | null;
  lastFrustrationPrompt: string | null;  // Don't pile on frustrated users
  feedbackCountThisSession: number;
  featuresRated: string[];
}

// Server-side frequency record (source of truth)
interface ServerFrequencyRecord {
  identifier: string;            // userId OR anonymousId (see Identity Strategy below)
  promptType: string;
  featureId?: string;
  lastShown: string;             // ISO timestamp — cooldowns key off this, not lastResponded
  lastResponded?: string;        // Only set if user actually submitted
}
```

### User Identity Strategy (Critical for Server-Side Caps)

| State | Identifier Used | Storage |
|-------|-----------------|---------|
| Logged out | `anonymousId` | Cookie + localStorage (fallback) |
| Logged in | `userId` | Server-side |
| Post-login | Link `anonymousId` → `userId` | Best-effort merge |

**Rules:**
1. **If logged in:** Key all caps to `userId`
2. **If logged out:** Key caps to `anonymousId` (persisted in cookie, localStorage as fallback)
3. **On login:** Attempt to link anonymous history to userId so users don't get re-prompted immediately after login
4. **If cookies blocked:** Degrade gracefully — **show fewer prompts, not more**. Use session-only tracking; assume user may have seen prompts before.

```typescript
function getIdentifier(user: User | null, anonymousId: string | null): string {
  if (user?.id) return `user:${user.id}`;
  if (anonymousId) return `anon:${anonymousId}`;
  // Cookies blocked: generate session-only ID, be conservative
  return `session:${sessionId}`;
}
```
```

### Backend Endpoints (Fastify)

```typescript
// POST /api/feedback
// Accepts feedback submissions
// - Enforces idempotency via `id` field (reject duplicates)
// - Applies server-side PII scrubbing to textComment
// - Auto-routes based on type (see Governance section)
{
  schema: {
    body: FeedbackSubmissionSchema,
    response: {
      200: { success: boolean, id: string },
      409: { error: 'duplicate_submission' }  // Idempotency check
    }
  },
  preHandler: [piiScrubber, idempotencyCheck]
}

// POST /api/analytics/batch
// Accepts batched implicit signals
// - Validates derived values only (no raw coordinates/selectors)
// - Short retention: 90 days default
{
  schema: {
    body: { events: ImplicitSignalSchema[] },
    response: { 200: { received: number } }
  }
}

// GET /api/feedback/eligibility  ← SOURCE OF TRUTH
// Server-side check for frequency caps (cross-device enforcement)
// Client can cache result briefly, but server decides
{
  schema: {
    querystring: {
      promptType: string,
      userId?: string,
      anonymousId: string,
      featureId?: string
    },
    response: {
      200: {
        eligible: boolean,
        reason?: string,
        cooldownEnds?: string  // ISO timestamp, for client-side caching
      }
    }
  }
}

// POST /api/feedback/eligibility/record
// Record that a prompt was shown (even if dismissed)
// Prevents showing same prompt again within cooldown
{
  schema: {
    body: {
      promptType: string,
      userId?: string,
      anonymousId: string,
      featureId?: string,
      action: 'shown' | 'dismissed' | 'responded'
    },
    response: { 200: { recorded: boolean } }
  }
}
```

### Prompt Shown vs Answered Semantics

**Critical:** Cooldowns apply to `shown`, not just `responded`. Otherwise users who dismiss get hammered.

| Event | When to Record | Affects Cooldown? |
|-------|----------------|-------------------|
| `shown` | Prompt rendered on screen | **Yes** — starts cooldown |
| `dismissed` | User closed without responding | No additional effect (shown already recorded) |
| `responded` | User submitted feedback | No additional effect, but track for response rate metrics |

```typescript
// Client-side: always record 'shown' immediately when prompt renders
onPromptMount(() => {
  recordEligibility({ promptType, action: 'shown' });
});

// Only record 'responded' on actual submission
onSubmit(() => {
  recordEligibility({ promptType, action: 'responded' });
});
```
```

---

## Privacy & Consent

### Requirements Checklist

- [ ] **Explicit consent** for session recording (if implemented)
- [ ] **Implicit consent notice** in privacy policy for behavioral analytics
- [ ] **Opt-out mechanism** for all feedback prompts
- [ ] **Data retention policy** (see table below)
- [ ] **Anonymization option** for users who prefer anonymous feedback
- [ ] **GDPR compliance** - right to deletion, data export
- [ ] **Server-side PII scrubbing** on all free-text fields (emails, phone numbers, API keys)

### Data Retention Policy

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| Explicit feedback (NPS, CSAT, text) | 2 years | Long-term trend analysis |
| Implicit signals (clicks, scrolls) | 90 days | Short-term UX analysis |
| Session recordings | 14-30 days | Quick debugging, then delete |
| Raw mouse coordinates | **Do not store** | Use derived scores only |
| Frequency/eligibility records | 1 year | Enforce caps across time |

### Session Recording Constraints (if implemented)

| Requirement | Implementation |
|-------------|----------------|
| **Opt-in only** | Explicit user consent before recording |
| **Redaction by default** | Mask all input fields, tokens, URLs with sensitive params |
| **Short retention** | 14-30 days unless flagged for investigation |
| **Role-based access** | Not everyone can watch replays; audit log access |
| **No recording in sensitive areas** | Disable in payment flows, password screens, PII forms |

### PII Scrubbing Rules

Apply server-side before storage:

```typescript
// Patterns to detect and redact in textComment fields
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,  // Emails
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,                         // Phone numbers
  /\b(sk-|pk_|sk_live_|pk_live_)[a-zA-Z0-9]{20,}\b/g,       // API keys
  /\b(password|secret|token|key)\s*[:=]\s*\S+/gi,           // Secrets in key=value
];
// Replace matches with [REDACTED]
```

### User Preferences

Allow users to control their feedback experience:

```
Settings > Privacy > Feedback Preferences

☑ Show me feedback prompts (checked by default)
☐ Include me in product surveys
☑ Allow anonymous usage analytics

[You can provide feedback anytime using the Feedback tab]
```

---

## Sampling & Bias

> **Feedback isn't truth — it's "who felt strongly enough to speak."** Without sampling strategy, you optimize for loud power users.

### Sampling Strategy

| Prompt Type | Sample Rate | Rationale |
|-------------|-------------|-----------|
| NPS | 100% of eligible | Relationship metric, need full picture |
| Feature micro-surveys | 20-50% of eligible sessions | Reduce fatigue, rotate prompts |
| Exit intent (if used) | 10-20% | Highly intrusive, sample heavily |
| Implicit signals | 100% (aggregated) | Passive, no user impact |
| Mouse thrashing | 1-5% | Experimental, privacy concerns |

### Stratification

Ensure feedback represents your full user base, not just power users:

| Dimension | Why It Matters |
|-----------|----------------|
| **New vs. power users** | New users have fresh eyes; power users know workarounds |
| **Plan tier** | Free users may have different pain points than paid |
| **Device type** | Mobile UX issues differ from desktop |
| **Locale** (at scale) | RTL, localization issues surface in specific regions |

**Implementation:** Tag all feedback with user segment; review segment distribution monthly.

### Avoiding Double-Counting Frustration

**Rule:** If a user triggers frustration signals, don't also hit them with other feedback that session.

```typescript
// In FeedbackProvider
if (sessionState.sawFrustrationPrompt) {
  // Skip NPS, exit intent, micro-surveys for this session
  return { eligible: false, reason: 'frustration_cooldown' };
}
```

### Interpreting Implicit Signals

| Signal | Positive Interpretation | Negative Interpretation |
|--------|------------------------|------------------------|
| Long time on page | Deep engagement | Confusion, stuck |
| Quick exit | Got answer fast | Gave up |
| Repeat visits to same page | Reference material | Can't find what they need |

**Best practice:** Combine implicit signals with explicit feedback to disambiguate. A "long time on page" + thumbs down = confusion. A "long time on page" + thumbs up = valuable content.

---

## Tools & Integration Options

### Build vs. Buy Analysis

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **Custom-built** | Full control, no vendor lock-in, privacy-first | Dev time, maintenance burden | Teams with strong privacy requirements |
| **Hybrid (Recommended)** | Best of both, integrate specific widgets | Some vendor dependency | Most teams |
| **Full platform** | Fast setup, analytics included | Cost, data leaves your system | Quick validation, small teams |

### Recommended Hybrid Approach

**Build yourself (privacy-first, core to product):**
- Feedback tab + inline "Was this helpful?" widgets
- Basic event pipeline for implicit signals
- Eligibility/frequency service
- Internal dashboard for review

**Optionally integrate (specialized categories):**
- **Feature voting:** Canny or Frill (it's a whole product category, don't reinvent)
- **Session replay:** PostHog self-hosted (analytics + replay without shipping data off-platform)

### Tool Comparison (if using external)

| Category | Tool | Why | Privacy Note |
|----------|------|-----|--------------|
| **Surveys** | Refiner, Survicate | Non-intrusive in-app surveys | Data leaves your system |
| **Feature voting** | Canny, Frill | Feature voting + public roadmaps | Usually acceptable (public anyway) |
| **Session replay** | **PostHog (self-hosted)** | Analytics + replay, you own the data | Self-host = privacy-first |
| **Session replay** | LogRocket, FullStory | Polished UX, more features | Data leaves your system |
| **NPS** | Delighted, AskNicely | Specialized NPS with benchmarks | Data leaves your system |

---

## Success Metrics

### Feedback Health Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Response rate** | >15% for micro-surveys | Indicates non-intrusiveness |
| **Completion rate** | >80% for started surveys | Survey is right length |
| **Dismissal rate** | <50% | Timing/placement is good |
| **NPS response rate** | >20% | Users willing to engage |
| **Feedback tab usage** | >2% of active users | Self-service working |
| **Rage click rate** | Trending down | UX improving |

### Quality Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Actionable feedback %** | >60% | Feedback leads to changes |
| **Duplicate/spam rate** | <5% | Good signal-to-noise |
| **Feature request → shipped** | Track % | Closes the loop |
| **Time to acknowledge** | <48 hours | Users feel heard |

### Anti-Self-Deception Metrics

| Metric | What to Watch | Action If Bad |
|--------|---------------|---------------|
| **Negative feedback rate by surface** | If one placement (e.g., exit intent) generates disproportionate negative responses | That surface is harming UX — remove or redesign it |
| **Fix-validation rate** | When you ship a fix for a reported pain point, do rage clicks/errors/drop-offs actually decrease? | If not, you misdiagnosed the problem or the fix didn't work |
| **Segment representation** | Is feedback coming proportionally from all user segments (new/power, free/paid, mobile/desktop)? | If skewed, you're optimizing for the loud minority |

### Performance Budget (Cost Metrics)

The feedback system shouldn't bloat the app. Set and monitor these budgets:

| Metric | Budget | Rationale |
|--------|--------|-----------|
| **Bundle size (critical path)** | < 5 KB gzipped | Feedback components lazy-loaded; only core eligibility check on critical path |
| **Event batch flush interval** | Every 30 seconds or 20 events | Balance freshness vs. network overhead |
| **Max events per minute** | 60 events/min per user | Prevents runaway loops; drop excess silently |
| **Eligibility check latency** | < 100ms p95 | Use client cache; server call only on cache miss |
| **localStorage usage** | < 10 KB | Session state, frequency cache, anonymousId |

---

## Implementation Phases

### Phase 1: Foundation + Governance ✅ COMPLETED
- [x] **Server-side eligibility service** (source of truth for frequency caps)
- [x] Create feedback API endpoints with idempotency + PII scrubbing (PII scrubber available but disabled)
- [x] Implement FeedbackProvider context (client-side, calls server for eligibility)
- [x] Build FeedbackTab component (persistent, user-initiated) — highest signal channel
- [x] Set up basic storage with retention policies
- [x] Define routing rules (bug → eng, feature request → product, etc.)

### Phase 2: Contextual Feedback ✅ COMPLETED
- [x] Implement InlineRating (thumbs up/down with optional follow-up text)
- [x] Build EmojiScale component (5-point satisfaction scale)
- [x] Build MicroSurvey component with queue priority logic
- [x] Implement hybrid frequency caps (client for speed, server for enforcement)
- [ ] Add to key features/content (help articles, feature outputs) — *integration task*

### Phase 3: Passive Signals ✅ COMPLETED
- [x] Add frustration detection (rage clicks, dead clicks)
- [x] Use `data-track` attributes (not CSS selectors)
- [x] Implement scroll depth tracking (percentage buckets)
- [x] Set up error boundary feedback prompts
- [x] Build analytics batch endpoint with 90-day retention (done in Phase 1)

### Phase 4: Relationship Metrics ✅ COMPLETED
- [x] Implement NPS survey (server-enforced 90-day cap)
- [x] Set up trigger rules (30-day active users + recent success events)
- [x] Build CSAT for support interactions
- [ ] *(Optional)* Exit intent — skipped per plan recommendation (only if severe conversion problem)

### Phase 5: Close the Loop ✅ COMPLETED
- [x] Build internal dashboard for feedback review + triage
- [x] Implement "feature shipped" / "bug fixed" notifications
- [x] Set up alerting for negative trends + fix-validation tracking
- [x] Monthly segment representation review (report API + process documentation)

### Phase 6: Iterate (Ongoing)
- [ ] Monitor negative-feedback-rate by surface; remove harmful prompts
- [ ] Validate fixes with implicit signal changes
- [ ] Adjust sampling rates based on response quality
- [ ] Review governance SLAs quarterly

---

## Implementation Progress & Discoveries

> Notes and learnings captured during Phase 1 implementation (January 2026)

### Files Created

**Database Migration:**
```
sheenappsai/supabase/migrations/20260121_feedback_system.sql
```
- 3 tables: `feedback_submissions`, `feedback_eligibility`, `feedback_implicit_signals`
- Helper functions: `check_feedback_eligibility()`, `record_feedback_shown()`, `record_feedback_responded()`
- RLS policies for security
- Retention: explicit 2 years, implicit 90 days, eligibility 1 year

**Fastify Worker (Backend):**
```
sheenapps-claude-worker/src/
├── services/feedback/
│   ├── types.ts           # Type definitions, COOLDOWN_DAYS config
│   ├── piiScrubber.ts     # Available but disabled (can enable later)
│   └── FeedbackService.ts # Core business logic (singleton)
└── routes/feedback.ts     # All endpoints in one file
```

**Next.js App (Frontend):**
```
sheenappsai/src/
├── app/api/feedback/
│   ├── route.ts                     # POST - submit feedback
│   ├── eligibility/
│   │   ├── route.ts                 # GET - check eligibility
│   │   └── record/route.ts          # POST - record shown/responded
│   └── analytics/batch/route.ts     # POST - implicit signals batch
├── lib/feedback/
│   ├── index.ts                     # Exports
│   ├── types.ts                     # Type definitions
│   └── client.ts                    # API client + helpers
└── components/feedback/
    ├── index.ts                     # Exports
    ├── FeedbackProvider.tsx         # Context provider
    └── FeedbackTab.tsx              # Persistent side tab
```

**Phase 2 Components (January 2026):**
```
sheenappsai/src/components/feedback/
├── InlineRating.tsx    # Thumbs up/down with optional follow-up text
├── EmojiScale.tsx      # 5-point emoji satisfaction scale
└── MicroSurvey.tsx     # Toast-style survey with queue priority
```

**Phase 3 Components & Hooks (January 2026):**
```
sheenappsai/src/hooks/
├── useFrustrationDetection.ts  # Rage clicks, dead clicks detection
└── useScrollDepth.ts           # Intersection Observer scroll tracking

sheenappsai/src/components/feedback/
├── FeedbackErrorBoundary.tsx   # Error boundary with bug report form
└── ImplicitSignalTracker.tsx   # Wrapper for passive tracking
```

**Phase 4 Components & Hooks (January 2026):**
```
sheenappsai/src/hooks/
└── useNPSTrigger.ts            # 30-day active + success event triggers

sheenappsai/src/components/feedback/
├── NPSSurvey.tsx               # 0-10 NPS scale with conditional follow-up
└── CSATSurvey.tsx              # 1-5 star satisfaction for support
```

**Phase 5 Admin Dashboard & Alerting (January 2026):**
```
sheenappsai/supabase/migrations/
└── 20260122_feedback_triage.sql  # Triage columns, audit log, notifications tables

sheenappsai/src/app/admin/feedback/
└── page.tsx                      # Admin feedback triage page

sheenappsai/src/components/admin/
└── FeedbackDashboard.tsx         # Full triage dashboard component

sheenappsai/src/app/api/admin/feedback/
├── route.ts                      # List feedback with filters & stats
├── [id]/route.ts                 # Update individual feedback
├── bulk/route.ts                 # Bulk status changes
├── notify/route.ts               # Close-the-loop notifications
└── segment-report/route.ts       # Monthly segment review report

sheenappsai/src/services/feedback/
└── feedback-alerting-service.ts  # Alert checks for negative trends

sheenappsai/src/app/api/cron/
└── feedback-alerts/route.ts      # Cron endpoint for automated alerting
```

### Design Decisions Made

| Decision | Rationale |
|----------|-----------|
| Single routes file for Fastify | All 4 endpoints are small and related; easier to maintain together |
| PII scrubber disabled by default | Available for future use but not needed for MVP |
| Queue priority in context | `frustration > success > NPS > exit_intent` - only highest priority shows per session |
| Signal batching: 30s or 20 events | Balances freshness vs. network overhead per performance budget |
| Eligibility cache: 1 minute TTL | Fast UX on repeated checks within same session |
| API routes use `createWorkerAuthHeaders` | Consistent with existing worker auth pattern |
| **Phase 2 additions:** | |
| Two-step InlineRating pattern | Quick binary → optional text on negative (preserves speed, captures context) |
| Record 'shown' before early returns | Ensures cooldowns apply even if user dismisses (React hook rules compliant) |
| EmojiScale with grayscale unselected | Visual hierarchy without being distracting; selected emoji pops |
| MicroSurvey checks queue priority first | Client-side `canShowPrompt()` before server eligibility (fast rejection) |
| Position classes for MicroSurvey | 4 positions supported (bottom-right default); avoids covering primary content |
| **Phase 3 additions:** | |
| Rage click: 3+ clicks in 2s same area | Industry standard threshold; fires ONE event per incident |
| Dead click: `data-track="dead-click-*"` | Explicit opt-in for elements that should-be-interactive |
| Native IntersectionObserver | No extra dependencies; good browser support |
| Scroll depth debounce 1s | Prevents recording if user immediately scrolls back |
| Error boundary stores truncated message | Max 100 chars to avoid PII in error text |
| ImplicitSignalTracker wrapper | Easy to add to layouts; combines frustration + scroll |
| **Phase 4 additions:** | |
| NPS touch-friendly buttons, NOT slider | Sliders underperform on mobile (research-backed) |
| NPS conditional follow-up by category | Promoter/Passive/Detractor get different questions |
| NPS 30-day first-seen tracking | localStorage stores first activity date |
| NPS success event delay 2s | Let user enjoy success moment before prompting |
| CSAT 1-5 star scale | Consistent, easy to understand, industry standard |
| CSAT per-ticket frequency via featureId | `csat_support_{ticketId}` prevents re-prompting same ticket |
| Exit intent skipped | Per plan: only if severe conversion problem; can add later |
| **Phase 5 additions:** | |
| Triage status workflow | `unprocessed → acknowledged → in_progress → resolved → closed` |
| Disposition labels | `actionable`, `duplicate`, `not_actionable`, `out_of_scope`, `wont_fix`, `needs_info` |
| Audit log for all actions | Track who changed what for accountability |
| Close-the-loop notification types | `feature_shipped`, `bug_fixed`, `resolved`, `acknowledged`, `in_progress` |
| Alert thresholds configurable | Detractor rate, rage clicks, backlog size all have critical/warning levels |
| Segment report auto-recommendations | Identifies under-represented segments and suggests actions |
| Bulk actions max 100 items | Prevents accidental mass updates |
| Notification record before send | Creates DB record first, updates status after send attempt |

### Patterns Followed

1. **HMAC Authentication:** All Next.js → Worker calls use `createWorkerAuthHeaders()` per project conventions
2. **Singleton Services:** `FeedbackService` follows existing worker service patterns
3. **Server-only Directive:** API routes use `import 'server-only'` to prevent client imports
4. **RLS Policies:** Database security via row-level security, not service key bypass

### UX Best Practices Applied (from Research)

| Practice | Implementation |
|----------|----------------|
| **Two-step pattern** | InlineRating: thumbs first → text only on negative |
| **Record 'shown' immediately** | Cooldowns start on view, not response |
| **3 buttons optimal for completion** | MicroSurvey follow-up has Skip, Submit |
| **Non-blocking presentation** | Toast/banner style, never modal for micro-surveys |
| **Per-feature eligibility** | Don't re-prompt same feature within cooldown |
| **Neutral copy, no guilt-tripping** | "Was this helpful?" not "Please help us improve!" |
| **Large touch targets** | EmojiScale min 44px (WCAG 2.5.5) |
| **Keyboard accessible** | All buttons focusable, Enter/Space to select |
| **Phase 3 additions:** | |
| **ONE event per rage click incident** | Fire event once when threshold hit, not per click |
| **Proximity-based rage click** | Clicks within 50px considered same area |
| **Report cooldown 5s** | Prevents event flooding from persistent frustration |
| **IntersectionObserver over scroll events** | Native browser optimization, no throttling needed |
| **Sentinel elements for scroll depth** | Invisible markers at 25/50/75/100% positions |
| **Phase 4 additions:** | |
| **Standard 0-10 NPS scale** | No modifications - enables benchmarking |
| **Discrete buttons over sliders** | Better mobile accuracy and completion rates |
| **Conditional follow-up questions** | Different Q for promoters vs detractors |
| **Trigger after success moments** | Positive context yields better responses |
| **CSAT after key interactions** | Fresh impressions, minimize recall bias |
| **Progress indication** | Users want to know how much time they're committing |
| **Phase 5 additions:** | |
| **Personal close-the-loop messages** | Reference specific feedback, not generic "thanks" |
| **Status updates during progress** | Keep users informed at acknowledgment and progress stages |
| **Alert suppression intervals** | Critical 5 min, high 15 min, medium 30 min - prevents alert fatigue |
| **Segment review monthly cadence** | Balance across device, plan, user type, time dimensions |
| **Bulk actions require confirmation** | UI includes clear item count in selection state |

**Sources:**
- [NN/g: User-Feedback Requests Guidelines](https://www.nngroup.com/articles/user-feedback/)
- [Zonka: Thumbs Up/Down Surveys](https://www.zonkafeedback.com/blog/collecting-feedback-with-thumbs-up-thumbs-down-survey)
- [Userpilot: Microsurveys Guide](https://userpilot.com/blog/microsurveys-saas-product/)
- [Chameleon: In-App Survey Design](https://www.chameleon.io/blog/in-app-survey)
- [Request Metrics: What is a Rage Click?](https://requestmetrics.com/blog/ux/what-is-a-rage-click/)
- [Fullstory: Rage Clicks Developer Guide](https://developer.fullstory.com/browser/rage-clicks/)
- [MDN: Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
- [Refiner: In-App NPS Survey Guide](https://refiner.io/blog/in-app-nps/)
- [Chameleon: NPS Survey Best Practices](https://www.chameleon.io/blog/nps-survey-best-practices-to-improve-engagement-guide-infographic)
- [Sprig: CSAT Survey Best Practices](https://sprig.com/blog/csat-survey-best-practices)
- [CustomerGauge: 16 NPS Survey Best Practices](https://customergauge.com/blog/nps-survey-best-practices)
- [Getthematic: Close the Customer Feedback Loop](https://getthematic.com/insights/close-the-customer-feedback-loop)
- [Zonka: Tips to Close the Customer Feedback Loop](https://www.zonkafeedback.com/best-practices/tips-to-close-the-customer-feedback-loop)
- [Beamer: Closing the Customer Feedback Loop](https://www.getbeamer.com/blog/closing-the-customer-feedback-loop-to-improve-your-saas-product)
- [Airfocus: How to Triage and Manage Feedback](https://airfocus.com/product-learn/how-to-triage-and-manage-feedback/)
- [Productboard: Insights Automations Triage Rules](https://support.productboard.com/hc/en-us/articles/4414943994259-Use-insights-automations-to-create-triage-rules)

### Code Review Fixes (January 2026)

Following expert code review, the following issues were identified and fixed:

| # | Issue | Severity | Fix Applied |
|---|-------|----------|-------------|
| 1 | pageUrl not sanitized for explicit feedback (privacy leak) | **High** | **Deferred** - keeping full URL for debugging at early stage; can enable later |
| 2 | `recordEligibility()` returns success even when RPC fails | **High** | Refactored to check `{ error }` from Supabase RPC instead of try/catch |
| 3 | elementId validation too weak (allows selector patterns) | Medium | Changed to allowlist regex: `/^[a-zA-Z0-9_-]{1,64}$/` |
| 5 | Admin routes missing server-only + runtime directives | Medium | Added `import 'server-only'` and `export const runtime = 'nodejs'` to all admin feedback routes |
| 6 | Bulk label operations slow and non-atomic | Medium | Created `bulk_update_feedback_labels()` Postgres function for atomic operations |
| 7 | FeedbackProvider queue logic incomplete (multiple prompts could show) | **High** | Added `PROMPT_TYPE_TO_PRIORITY` mapping, update priority in `recordPromptShown`, check `promptShownThisSession` in `canShowPrompt` |
| 8 | CSATSurvey close button positioned incorrectly | Low | Added `relative` to container classes |
| 9 | Admin PATCH accepts arbitrary values without validation | **High** | Added allowlist validation for status, priority, disposition, labels with regex pattern |
| 10 | Audit logging not atomic (loop inserts could partially fail) | Medium | Batch insert audit rows in single operation; return warning if audit fails |
| 11 | Implicit signals unreliable on page unload (async fetch killed by browser) | Medium | Added `sendBeacon` with `useBeacon` option for beforeunload; `keepalive: true` on regular fetch |
| 12 | `bulk_update_feedback_labels` audit logs unmodified rows | **High** | Used RETURNING CTE pattern to capture exactly which rows were updated, audit only those |
| 13 | SECURITY DEFINER without search_path pinning | Medium | Added `SET search_path = public, pg_temp` to prevent object shadowing attacks |
| 14 | Bulk function missing empty input guard | Low | Added early return for NULL or empty p_ids array |
| 15 | Label normalization (btrim) | Low | Defense in depth - prevents " bug" vs "bug" divergence |
| 16 | Eligibility RLS wide open - anyone can modify anyone's records | **CRITICAL** | Removed anon/auth policy, now service_role only. Clients must use API. |
| 17 | feedback_submissions allows user_id spoofing | **High** | Added RLS check: auth users can only write own user_id, anon must have NULL |
| 18 | Redundant idempotency index (PRIMARY KEY already enforces) | Low | Removed duplicate index, added explanatory comment |
| 19 | priority NOT NULL inconsistency (has DEFAULT but allows NULL in CHECK) | Medium | Added NOT NULL to column, removed NULL from CHECK constraint |
| 20 | Triage helper functions missing search_path | Medium | Added `SET search_path = public, pg_temp` to all 3 SECURITY DEFINER functions |
| 21 | Notifications can be created without recipient | Medium | Added `notification_recipient_check` - requires user_id OR email |

**Files Modified:**
- `sheenapps-claude-worker/src/services/feedback/FeedbackService.ts` - #2
- `sheenapps-claude-worker/src/routes/feedback.ts` - #3
- `sheenappsai/src/lib/feedback/types.ts` - #7 (added `PROMPT_TYPE_TO_PRIORITY`)
- `sheenappsai/src/components/feedback/FeedbackProvider.tsx` - #7, #11
- `sheenappsai/src/components/feedback/CSATSurvey.tsx` - #8
- `sheenappsai/src/app/api/admin/feedback/*.ts` - #5
- `sheenappsai/src/app/api/admin/feedback/bulk/route.ts` - #6
- `sheenappsai/src/app/api/admin/feedback/[id]/route.ts` - #9, #10
- `sheenappsai/src/lib/feedback/client.ts` - #11
- `sheenappsai/supabase/migrations/20260122_feedback_bulk_labels.sql` - #6, #12, #13, #14, #15 (rewritten with RETURNING CTE)
- `sheenappsai/supabase/migrations/20260121_feedback_system.sql` - #16, #17, #18 (RLS security hardening)
- `sheenappsai/supabase/migrations/20260122_feedback_triage.sql` - #19, #20, #21 (priority NOT NULL, search_path, recipient check)

**Not implemented (deferred):**
- #1: pageUrl sanitization for explicit feedback - keeping full URL for debugging at early stage
- #4: Body limits on all feedback endpoints - Fastify has global defaults; not critical
- Schema validation with Zod - future improvement
- PII scrubber enable - code exists, can enable when needed

**Expert review items rejected:**
- `params` typing as direct object instead of Promise - Expert was wrong; Next.js 15 App Router uses Promise params as documented in CLAUDE.md

### Future Improvements (Captured for Later)

| Improvement | Notes |
|-------------|-------|
| Enable PII scrubber | Code exists in `piiScrubber.ts`, just needs import/call in `FeedbackService.submitFeedback()` |
| Add screenshot capture to FeedbackTab | html2canvas or similar, compress before upload |
| Feature voting board integration | Consider Canny/Frill integration or build simple upvote system |
| ~~Dashboard for feedback review~~ | ✅ Done in Phase 5 |
| ~~Close-the-loop notifications~~ | ✅ Done in Phase 5 |
| ~~Conditional follow-up questions~~ | ✅ Done in Phase 4 (NPSSurvey) |
| Email template design | Create branded email templates for close-the-loop notifications |
| Slack integration for alerts | Direct Slack channel posting beyond webhook |
| Public roadmap status updates | Link feedback to public roadmap items, auto-update voters |
| Response SLA tracking | Dashboard metrics for time-to-acknowledge, time-to-resolve |

---

## References & Further Reading

- [NN/g: User-Feedback Requests Guidelines](https://www.nngroup.com/articles/user-feedback/)
- [Userpilot: In-App Feedback Best Practices](https://userpilot.com/blog/in-app-feedback/)
- [Chameleon: NPS Survey Best Practices](https://www.chameleon.io/blog/nps-survey-best-practices-to-improve-engagement-guide-infographic)
- [Userpilot: Active vs Passive Customer Feedback](https://userpilot.com/blog/active-vs-passive-customer-feedback/)
- [Zonka: Thumbs Up/Down Surveys Guide](https://www.zonkafeedback.com/blog/collecting-feedback-with-thumbs-up-thumbs-down-survey)
- [Frill: In-App Feedback Collection](https://frill.co/blog/posts/collecting-in-app-feedback-best-practices-and-top-tools)
- [InAppStory: Implicit vs Explicit Data](https://inappstory.com/blog/explicit-vs-implicit-data)

---

*Last updated: January 2026 (v13 — Triage migration: priority NOT NULL, search_path hardening, recipient check)*
