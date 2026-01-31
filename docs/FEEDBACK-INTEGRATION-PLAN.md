# Feedback Integration Plan

> Concise plan for integrating feedback components into SheenAppsAI user journey

---

## ✅ Implementation Complete (January 2026)

### What Was Built

| Feature | Where to See It |
|---------|-----------------|
| **Feedback Tab** | Right edge of all pages - persistent "Feedback" tab for user-initiated feedback |
| **First Build Survey** | After first successful build - "How easy was it?" emoji survey |
| **Build Success CSAT** | After build completes + 2s idle - "Did this build come out as expected?" |
| **Export Satisfaction** | After successful export - "Did your export work?" binary survey |
| **Build Failure Help** | On build failure - "Report issue" / "Show what went wrong" buttons |
| **Rage Click Detection** | Builder workspace - detects frustration, offers help |
| **NPS Survey** | Dashboard for 30+ day users with successful outcomes |
| **Admin Dashboard** | `/admin/feedback` - triage queue, bulk actions, notifications, segment reports |

### Core Integration Files

| File | Description |
|------|-------------|
| `src/app/[locale]/layout.tsx` | Root layout - added `FeedbackProvider`, `FeedbackTab`, and `FeedbackErrorBoundary` wrapper |
| `src/hooks/useFeedbackOrchestrator.ts` | Central orchestrator hook - arbitrates all feedback events, enforces cooldowns, handles idempotency via seenEvents, processing lock for concurrency |
| `src/components/feedback/BuildFeedbackIntegration.tsx` | Build event integration - detects build transitions, triggers feedback on success/failure with idle detection (pointerdown/keydown/scroll) |
| `src/components/builder/enhanced-workspace-page.tsx` | Builder workspace - added `ImplicitSignalTracker` for rage/dead clicks and `BuildFeedbackIntegration` |
| `src/components/dashboard/dashboard-content.tsx` | Dashboard - added `useNPSOnLogin` hook and `NPSSurvey` for 30-day users |
| `src/components/project/ExportModal.tsx` | Export modal - added `useFeedbackOrchestrator` and `export_success` event emission |

### Admin API Routes

| File | Description |
|------|-------------|
| `src/app/api/admin/feedback/route.ts` | List feedback with filtering, search (escaped LIKE, 80 char limit), stats via RPCs |
| `src/app/api/admin/feedback/[id]/route.ts` | PATCH/GET single feedback - UUID validation, type-safe resolution_note, enum validation |
| `src/app/api/admin/feedback/bulk/route.ts` | Bulk actions - UUID validation for IDs, label regex, audit error handling |
| `src/app/api/admin/feedback/notify/route.ts` | Close-the-loop notifications - JSONB objects (not strings), email integration |
| `src/app/api/admin/feedback/segment-report/route.ts` | Monthly segment report - single query (was 7), aggregates in memory |

### Services

| File | Description |
|------|-------------|
| `src/services/feedback/feedback-alerting-service.ts` | Alerting service - uses `getServiceClient()` with `server-only` import for security |

### Database Migrations

| File | Description |
|------|-------------|
| `20260121_feedback_system.sql` | Core schema - `feedback_submissions`, `feedback_eligibility`, `feedback_implicit_signals` tables with RLS |
| `20260122_feedback_triage.sql` | Triage columns - status/disposition/priority, `feedback_notifications`, `feedback_audit_log`, helper RPCs |
| `20260122_feedback_bulk_labels.sql` | Atomic bulk label function - `bulk_update_feedback_labels()` with audit logging |
| `20260122_feedback_security_definer_grants.sql` | Security hardening - REVOKE from PUBLIC, GRANT to service_role for all SECURITY DEFINER RPCs |

### Key Fixes Applied (Expert Reviews)

1. **Concurrency**: Processing lock acquired BEFORE marking events as seen
2. **Event Key Stability**: Global events (`first_build_ever`, `nps_due`) use `:global` suffix consistently
3. **Listener Leak**: Cleanup existing listeners before adding new ones in idle detection
4. **Security**: `createBrowserClient` replaced with `getServiceClient()` + `server-only`
5. **Performance**: Segment report consolidated from 7 queries to 1
6. **Validation**: UUID validation for route params, type validation for resolution_note, label regex in bulk
7. **JSONB**: Objects passed directly to JSONB columns (not JSON.stringify)
8. **LIKE Escaping**: Search queries escaped for `%`, `_`, `\` with 80 char limit

---

## Analysis Summary

### What We Have
- **9 feedback components** built and ready (`FeedbackProvider`, `FeedbackTab`, `NPSSurvey`, `CSATSurvey`, `MicroSurvey`, `InlineRating`, `EmojiScale`, `ImplicitSignalTracker`, `FeedbackErrorBoundary`)
- **Backend infrastructure** complete (APIs, database, eligibility system, admin dashboard)
- **Existing UI patterns** we can hook into:
  - Sonner toast system (already in root layout)
  - Radix UI modals
  - `MilestoneToast` for build celebrations
  - Build event streaming via `useCleanBuildEvents`

### User Journey Map

```
Landing → Auth → Dashboard → Builder Workspace → Build → Export/Deploy
                    ↓              ↓                ↓
              Empty state    Chat + AI       Success/Failure
                    ↓              ↓                ↓
               [Feedback?]   [Feedback?]      [Feedback!]
```

---

## Core Architecture: Central Orchestrator

**Key principle:** Don't let each component decide independently whether to show feedback. Use a single orchestrator that receives events and decides what (if anything) to show.

```
┌─────────────────────────────────────────────────────────────┐
│                    FeedbackOrchestrator                      │
│                                                              │
│  Events In:                    Decision Out:                 │
│  • build_success              → CSAT (if eligible)          │
│  • first_build_ever           → Onboarding survey (priority)│
│  • export_success             → Satisfaction check          │
│  • build_failure              → Help offer (NOT survey)     │
│  • rage_clicks_detected       → "Need help?" (after cooldown)│
│  • nps_due                    → NPS (if no recent survey)   │
│                                                              │
│  Rules enforced HERE:                                        │
│  • Max 1 prompt per session                                  │
│  • Max 1 success survey per 14 days                         │
│  • Priority ranking (first_build > export > build > nps)    │
│  • No survey within 48h of another                          │
└─────────────────────────────────────────────────────────────┘
```

### Trigger Priority Ranking

When multiple events fire, pick ONE based on this order:

1. **First build ever** (once per user lifetime)
2. **Export success** (user achieved deployment goal)
3. **Build success CSAT** (general satisfaction)
4. **NPS** (only when due per 90-day cycle)

---

## Integration Points (Prioritized)

### Tier 1: High Impact (Do First)

| Touchpoint | Trigger | Feedback Type | Copy | Cooldown |
|------------|---------|---------------|------|----------|
| **First Build Ever** | Server-confirmed first successful build | Onboarding ease (1-5) | "How easy was it to get your first build?" | Once per user lifetime (never expires) |
| **Build Success** | Milestone `complete` + user idle | CSAT | "Did this build come out the way you expected?" | 14 days per user |
| **Export Success** | Export status → `completed` | Quick satisfaction | "Did your export work the way you expected?" (Yes / Not really) | 14 days per user |

### Tier 2: Medium Impact

| Touchpoint | Trigger | Feedback Type | Copy | Notes |
|------------|---------|---------------|------|-------|
| **Build Failure** | Status → `failed` | Help offer (NOT survey) | Two buttons: "Report issue" / "Show me what went wrong" | Link to logs |
| **NPS** | 30 days active + 2-3 successful outcomes | NPS (0-10) | Standard NPS | Not within 48h of other survey |
| **Frustration Detected** | Rage clicks + cooldown passed | Help offer | "Need help with something?" | 60s cooldown between offers |

### Tier 3: Passive/Always-On

| Touchpoint | Location | Feedback Type | Action Loop |
|------------|----------|---------------|-------------|
| **Feedback Tab** | All pages (right edge) | Open feedback | User-initiated, highest quality |
| **Implicit Signals** | Builder workspace | Rage clicks, scroll depth | High thrashing → trigger help offer |
| **Error Boundary** | App-wide | Bug report prompt | Prefill context, offer to report |

---

## Recommended Implementation

### Step 1: Foundation (Root Layout)

Add `FeedbackProvider` to wrap the app:

```tsx
// src/app/[locale]/layout.tsx
import { FeedbackProvider, FeedbackTab } from '@/components/feedback';

// Inside the provider stack, after AuthProvider:
<FeedbackProvider
  buildVersion={process.env.NEXT_PUBLIC_BUILD_VERSION}
  locale={locale}
>
  <FeedbackTab position="right" />
  {children}
</FeedbackProvider>
```

### Step 2: Feedback Orchestrator Hook

Create a central hook that components call to emit events:

```tsx
// src/hooks/useFeedbackOrchestrator.ts
export function useFeedbackOrchestrator() {
  const feedback = useFeedbackSafe();
  const seenEventsRef = useRef<Set<string>>(new Set());

  const emitEvent = useCallback((event: FeedbackEvent) => {
    // 1. IDEMPOTENCY: Dedupe by stable key (React effects re-fire)
    const eventKey = `${event.type}:${event.buildId || event.exportId || 'global'}`;
    if (seenEventsRef.current.has(eventKey)) return;
    seenEventsRef.current.add(eventKey);

    // 2. Orchestrator decides what to show based on:
    // - Event priority (first_build > export > build > nps)
    // - Session state (already shown something? includes help offers)
    // - Server-side eligibility (cooldowns, 48h gap, device-safe)
  }, [feedback]);

  return { emitEvent };
}
```

**Key:** Build streams and effects love to re-fire. The `seenEvents` set prevents double prompts from duplicated events.

### Step 3: Build Success with Idle Detection (Debounced)

Use debounce pattern - reset timer on activity, fire after N ms of silence:

```tsx
// src/components/builder/clean-build-progress.tsx
const { emitEvent } = useFeedbackOrchestrator();

useEffect(() => {
  if (milestone?.type === 'complete') {
    let idleTimer: ReturnType<typeof setTimeout>;
    const IDLE_MS = 2000;

    const startIdleTimer = () => {
      idleTimer = setTimeout(() => {
        // User has been idle for 2s - safe to prompt
        emitEvent({ type: 'build_success', projectId, buildId });
        cleanup();
      }, IDLE_MS);
    };

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      startIdleTimer(); // Restart on activity
    };

    const cleanup = () => {
      clearTimeout(idleTimer);
      window.removeEventListener('click', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('mousemove', resetIdleTimer);
    };

    // Listen for ongoing activity (NOT { once: true })
    window.addEventListener('click', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('mousemove', resetIdleTimer);

    startIdleTimer();
    return cleanup;
  }
}, [milestone]);
```

### Step 4: First Build Detection (Server-Confirmed, Never Expires)

Use server-side eligibility with NO cooldown expiry for this specific case:

```tsx
// First build = check eligibility with featureId 'first_build_ever'
// prompt_type: 'onboarding_ease'
// feature_id: 'first_build_ever'
const isFirstBuild = await feedback.checkPromptEligibility('onboarding_ease', 'first_build_ever');
// Server returns eligible: true only if NO record exists

// IMPORTANT: When recording 'shown', this row should NEVER expire
// Unlike other cooldowns (14 days, 90 days), first_build_ever is permanent
// Achieved by: special handling in cleanup job OR very long cooldown (10 years)
```

**DB consideration:** Ensure `first_build_ever` eligibility record doesn't get deleted by retention cleanup.

### Step 5: Implicit Signals with Action Loop

Don't just collect - respond:

```tsx
// When frustration detected:
if (rageClickCount >= 3 && !helpOfferShownRecently) {
  // Show help offer, NOT a survey
  showHelpOffer({
    title: "Need help with something?",
    actions: [
      { label: "Report issue", onClick: openBugReport },
      { label: "Show me what went wrong", onClick: openLogs }
    ]
  });
}
```

### Step 6: NPS with Outcome Requirements

```tsx
// src/hooks/useNPSTrigger.ts
const { shouldShowNPS } = useNPSTrigger({
  minDaysActive: 30,
  minSuccessfulOutcomes: 3,  // Require actual usage
  noSurveyWithin48h: true,   // Avoid survey fatigue
});
```

---

## Hard Rules (Enforced by Orchestrator)

| Rule | Enforcement | Where |
|------|-------------|-------|
| Max 1 prompt per session | `promptShownThisSession` flag | Client (FeedbackProvider) |
| Max 1 success survey per 14 days | Eligibility check with cooldown | **Server** |
| No survey within 48h of another | Check `last_shown` across ALL prompt types | **Server** (multi-device safe) |
| Priority ranking | Orchestrator picks highest priority only | Client |
| First build = never expires | Eligibility record permanent (no cleanup) | **Server** |
| Event idempotency | `seenEvents` set keyed by `type:id` | Client (orchestrator) |
| Help offers follow same rules | Count toward "1 prompt per session" | Client + Server |

**Note:** Server-side enforcement is critical for multi-device users. Client checks are for UX smoothness only.

## What NOT To Do

| Anti-Pattern | Why |
|--------------|-----|
| Survey on every page load | Survey fatigue, annoys users |
| Survey during active task | Interrupts flow, low completion |
| Multiple surveys per session | Plan enforces 1 per session max |
| Survey on build failure | Wrong moment - offer help instead |
| Exit intent popup | Feels desperate (per plan: skip unless severe conversion problem) |
| Decentralized trigger decisions | Each component deciding = chaos. Use orchestrator. |
| Fixed delay for prompts | Use idle detection instead of hardcoded 3s |
| NPS for barely-engaged users | Require 2-3 successful outcomes first |

---

## Integration Files

| File | What to Add |
|------|-------------|
| `src/app/[locale]/layout.tsx` | `FeedbackProvider`, `FeedbackTab` |
| `src/components/builder/clean-build-progress.tsx` | Build success CSAT trigger |
| `src/components/builder/enhanced-workspace-page.tsx` | `ImplicitSignalTracker` |
| `src/app/[locale]/dashboard/page.tsx` | NPS trigger for 30-day users |
| `src/components/project/ExportList.tsx` | Export success feedback |

---

## Success Metrics to Track

| Metric | Target | Why |
|--------|--------|-----|
| Response rate | >15% | Non-intrusiveness check (don't chase higher by getting annoying) |
| Dismissal rate | <50% | Timing/placement quality |
| NPS response rate | >20% | Engagement health |
| Feedback tab usage | >2% of active users | Self-service working |
| **Time-to-submit** | <30s median | UX clarity - long = confusing |
| **Follow-up comment rate** | >20% of responses | Quality proxy - engaged users add context |
| **Prompts per WAU** | <1.0 | Annoyance guardrail - if creeping up, expect churn |

---

## Implementation Checklist

### Foundation
- [x] Add `FeedbackProvider` to root layout
- [x] Add `FeedbackTab` (persistent, user-initiated)
- [x] Create `useFeedbackOrchestrator` hook (central arbitration)
- [x] Add `ImplicitSignalTracker` to builder workspace
- [x] Wrap app with `FeedbackErrorBoundary`

### Success Moments (via Orchestrator)
- [x] First build → Onboarding ease survey (server-confirmed, highest priority)
- [x] Build success → CSAT prompt (idle detection, 14-day cooldown)
- [x] Export success → Satisfaction check (14-day cooldown)

### Frustration Response (NOT surveys)
- [x] Build failure → Help offer with "Report issue" / "Show what went wrong"
- [x] Rage clicks detected → "Need help?" offer (60s cooldown)
- [x] Error boundary → Bug report with prefilled context

### Relationship Metrics
- [x] NPS trigger (30 days + 3 successful outcomes + no survey in 48h)

### UX Polish
- [x] All prompts keyboard-accessible
- [x] All prompts RTL-safe
- [x] Context-aware copy (reference the moment)

### Admin & Backend
- [x] Admin feedback list with filtering/search
- [x] Triage workflow (status, disposition, priority, assignment)
- [x] Bulk operations with atomic label updates
- [x] Close-the-loop notifications
- [x] Segment representation report
- [x] Alerting service for negative trends
- [x] SECURITY DEFINER function grants

---

*Created: January 2026 | Implementation completed January 22, 2026*
