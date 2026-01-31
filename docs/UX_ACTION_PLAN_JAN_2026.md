# UX Action Plan (Detailed) — SheenApps MENA (Jan 2026)

Audience: Arabic‑first, non‑technical users. Competitive bar: Lovable/Replit‑level clarity and momentum.

Goals:
- Reduce cognitive load during first build and iteration loops.
- Make Easy Mode feel "guided" rather than "developer‑heavy."
- Improve RTL consistency and Arabic microcopy quality.

This document is implementation‑ready: each item includes code pointers, suggested patterns, and snippets.

---

# 🔄 IMPLEMENTATION PROGRESS

**Last Updated:** 2026-01-23

| Item | Status | Notes |
|------|--------|-------|
| 1.1 Onboarding persistence | ✅ DONE | localStorage persistence with locale-specific keys |
| 1.2 First build overlay | ✅ DONE | Shows for first build (no previous version), dismissible |
| 1.3 Arabic microcopy | ✅ DONE | i18n keys added for all new UX strings |
| 2.1 Simple Mode | ⏭️ DEFERRED | Over-engineered; workspace already usable |
| 2.2 Replace auto-switch | ✅ DONE | Removed jarring auto-switch to code view |
| 2.3 Iteration Strip | ✅ DONE | Shows after successful build with guidance |
| 3.1 CMS Guided Mode | ✅ DONE | JSON tab hidden behind "عرض المتقدم" toggle |
| 3.2 AuthKit Developer Details | ✅ DONE | JSON response hidden behind "عرض تفاصيل المطور" |
| 3.3 Deploy CTA | ⏭️ EXISTING | Deploy button already prominent |
| 3.4 Phase3 Coming Soon | ✅ DONE | All features show "قريبًا" + "اشعِرني عند التوفر" |
| 4.1 Feedback RTL | ✅ DONE | FeedbackTab, MicroSurvey, CSATSurvey use logical CSS |
| 5 i18n validation | ⏭️ DEFERRED | CI script overkill for now |

## Files Modified

**Components:**
- `src/components/builder/onboarding-wizard.tsx` - Added persistence
- `src/components/builder/enhanced-workspace-page.tsx` - Removed auto-switch, added first build overlay, added iteration strip
- `src/components/feedback/FeedbackTab.tsx` - RTL logical positioning
- `src/components/feedback/MicroSurvey.tsx` - RTL logical positioning
- `src/components/feedback/CSATSurvey.tsx` - RTL logical positioning
- `src/components/builder/infrastructure/cms/CmsManagerDialog.tsx` - Advanced toggle for JSON tab
- `src/components/builder/infrastructure/auth/AuthKitDialog.tsx` - Developer details collapsible
- `src/components/builder/infrastructure/phase3/Phase3ToolsPanel.tsx` - Coming soon + notify CTA

**i18n Message Files:**
- `src/messages/en/builder.json` - Added firstBuild, iterationStrip keys
- `src/messages/en/infrastructure.json` - Added showAdvanced, hideAdvanced, showDevDetails, hideDevDetails, comingSoon, notifyMe, notified keys
- `src/messages/ar/builder.json` - Arabic translations
- `src/messages/ar-eg/builder.json` - Egyptian Arabic translations
- `src/messages/ar-sa/builder.json` - Saudi Arabic translations
- `src/messages/ar-ae/builder.json` - UAE Arabic translations
- `src/messages/ar/infrastructure.json` - Arabic translations
- `src/messages/ar-eg/infrastructure.json` - Egyptian Arabic translations
- `src/messages/ar-sa/infrastructure.json` - Saudi Arabic translations
- `src/messages/ar-ae/infrastructure.json` - UAE Arabic translations

---

# 📝 IMPLEMENTATION NOTES & DISCOVERIES

## Critical Observations

1. **Auto-switch to code view (2.2)**: Lines 387-419 in `enhanced-workspace-page.tsx` auto-switch to code view when build starts. This is jarring for non-tech users. Changed to opt-in toast prompt.

2. **CMS Dialog (3.1)**: Already has form/JSON tabs (line 638-642). Just needed to hide JSON by default behind an "Advanced" toggle.

3. **AuthKit Dialog (3.2)**: The plan misunderstands this component. Code snippets ARE the purpose - they teach developers how to integrate auth. Only the JSON response output should be hidden, not the educational snippets.

4. **Phase3 buttons (3.4)**: The buttons call placeholder APIs that return "queued" messages. These ARE placeholders and should be marked "Coming Soon" with notify CTA.

5. **Feedback RTL (4.1)**: Found physical positioning in:
   - `FeedbackTab.tsx`: lines 135, 154, 277 (`right-0`, `left-0`, `right-2`)
   - `MicroSurvey.tsx`: lines 255-258 (`right-4`, `left-4`, `left-1/2`)
   - `CSATSurvey.tsx`: line 277 (`right-2`)

## Deferred Items (with rationale)

1. **Simple Mode (2.1)**: The workspace already has a decent layout. Adding a full simpleMode toggle would require significant refactoring and testing. The current approach (hiding code by default, toast for opt-in) achieves 80% of the goal.

2. **i18n CI validation (5)**: While useful, this is infrastructure work that doesn't directly improve UX. Can be added in a future sprint.

---

# 💡 IMPROVEMENTS & FUTURE WORK

## Suggestions for Next Phase

1. ~~**Move hardcoded Arabic to i18n**~~: ✅ DONE - All strings moved to i18n message files with Arabic translations.

2. **Notify API Integration**: Phase3ToolsPanel "notify me" button currently stores state locally. Should integrate with a real waitlist/notify API to capture demand signals.

3. **First Build Overlay Personalization**: Consider showing the project name or type in the overlay message for a more personalized experience.

4. **Build Status Integration**: The iteration strip only shows for `deployed` status. Consider showing different guidance for `failed` or `building` states.

5. **RTL Testing**: The feedback components now use logical CSS properties, but should be tested on actual RTL pages to verify correct behavior.

## Technical Debt Notes

- `enhanced-workspace-page.tsx` has several unused variables (currentQuestion, flowPhase, etc.) that should be cleaned up if not needed
- The `handlePromptSubmit` function should be wrapped in `useCallback` per the ESLint warning

---

# 0) Guiding UX Principles (for all work)

1) **One primary action per step**
   - Every screen should answer: “What’s the next action I should take?”

2) **Arabic‑first clarity**
   - Avoid technical jargon; use short sentences, direct verbs.
   - Prefer Egyptian/Saudi/Emirati dialect only where necessary; otherwise use Modern Standard Arabic.

3) **Low‑trust tolerance**
   - Non‑tech users may distrust “tokens”, “JSON”, “schema.” Hide these behind “Developer details.”

4) **Momentum > Power**
   - Default to “Simple Mode” for first 7 days or first 2 builds.

5) **RTL correctness**
   - Use logical CSS properties (`start/end`, `ms/me`, `ps/pe`). Avoid `left/right` where user facing.

---

# 1) First‑Time Onboarding → First Build Success

## 1.1 Persist onboarding state (resume‑safe)

**Problem:** User loses onboarding progress on refresh or tab close.

**Action:** Persist wizard step + data to `localStorage` or user profile; restore on mount.

**Target file**: `sheenappsai/src/components/builder/onboarding-wizard.tsx`

**Suggested snippet (localStorage persistence)**
```tsx
const STORAGE_KEY = `sa_onboard_${locale}`

useEffect(() => {
  if (typeof window === 'undefined') return
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return
  try {
    const saved = JSON.parse(raw)
    if (saved?.wizardData) setWizardData(saved.wizardData)
    if (typeof saved?.currentStep === 'number') setCurrentStep(saved.currentStep)
  } catch {}
}, [STORAGE_KEY])

useEffect(() => {
  if (typeof window === 'undefined') return
  const payload = JSON.stringify({ wizardData, currentStep })
  localStorage.setItem(STORAGE_KEY, payload)
}, [wizardData, currentStep, STORAGE_KEY])
```

**Acceptance:** Refresh mid‑wizard resumes the same step and inputs.

---

## 1.2 Add explicit “First Build Started” hand‑off

**Problem:** User completes wizard then lands in a dense workspace with no clear next step.

**Action:** Show a simple overlay after wizard completion: “We’re building your app now.”

**Target:** `sheenappsai/src/components/builder/enhanced-workspace-page.tsx`

**Suggested snippet (overlay with dismiss)**
```tsx
const [showFirstBuildOverlay, setShowFirstBuildOverlay] = useState(true)

// set false after first build completes or user dismisses

{showFirstBuildOverlay && (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
    <div className="bg-background rounded-xl p-6 max-w-sm text-center">
      <h2 className="text-xl font-semibold">جارٍ بناء تطبيقك الآن</h2>
      <p className="text-sm text-muted-foreground mt-2">
        خليك معانا… هنجهز المعاينة وبعدها تقدر تعدّل بسهولة.
      </p>
      <button
        className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground"
        onClick={() => setShowFirstBuildOverlay(false)}
      >
        متابعة
      </button>
    </div>
  </div>
)}
```

**Acceptance:** Non‑tech users see a friendly transition and clear expectation.

---

## 1.3 Arabic microcopy for onboarding + build status

**Problem:** English UI strings in key flows reduce trust.

**Action:** Move strings into i18n; provide Arabic defaults.

**Target:** `sheenappsai/src/messages/ar*/builder.json`, `common.json`, `workspace.json`

**Suggested snippet (i18n usage)**
```tsx
const t = useTranslations('builder.onboarding')

<h1>{t('siteType.title')}</h1>
<p>{t('siteType.subtitle')}</p>
```

**Acceptance:** Arabic users see localized content across onboarding steps.

---

# 2) Iteration Loop (Edit → Regenerate → Preview → Deploy)

## 2.1 Introduce “Simple Mode” (default for new users)

**Problem:** Workspace shows many advanced surfaces at once.

**Action:** Add `simpleMode` flag that hides code view and advanced sidebar sections for new users.

**Target:** `sheenappsai/src/components/builder/enhanced-workspace-page.tsx`, `workspace-sidebar.tsx`

**Suggested snippet (state + toggle)**
```tsx
const [simpleMode, setSimpleMode] = useState(true)

// Example toggle button
<button onClick={() => setSimpleMode(v => !v)}>
  {simpleMode ? 'الوضع المتقدم' : 'الوضع البسيط'}
</button>
```

**Suggested gating**
```tsx
{!simpleMode && <GeneratedCodeViewer ... />}
{!simpleMode && <WorkspaceSidebar ... />}
```

**Acceptance:** New users see only preview + minimal chat, no code unless they opt in.

---

## 2.2 Replace auto‑switch to code view with opt‑in prompt

**Problem:** Auto‑switch to code view can disorient non‑tech users.

**Action:** Replace auto‑switch with a gentle prompt: “View code (advanced).”

**Target:** `sheenappsai/src/components/builder/enhanced-workspace-page.tsx`

**Suggested snippet**
```tsx
if (buildStarted && simpleMode) {
  showToast({
    title: 'تريد مشاهدة الكود؟',
    description: 'اختياري للمستخدمين المتقدمين فقط',
    action: { label: 'عرض الكود', onClick: () => setViewMode('code') }
  })
}
```

**Acceptance:** Code view appears only when user chooses.

---

## 2.3 Add “Iteration Strip” (single guidance row)

**Problem:** No single, consistent “what next” guidance.

**Action:** Add a simple progress strip above preview: “1) عدّل الوصف 2) جرّب المعاينة 3) اضغط نشر”.

**Target:** `sheenappsai/src/components/builder/workspace/workspace-preview.tsx`

**Snippet**
```tsx
<div className="mb-3 rounded-lg bg-muted/50 p-3 text-sm">
  <strong>الخطوة التالية:</strong> عدّل الوصف → جرّب المعاينة → انشر التطبيق
</div>
```

**Acceptance:** Users see a simple loop on every iteration.

---

# 3) Easy Mode (Auth, CMS, Deploy, Custom Domains)

## 3.1 CMS: Add Guided Mode (hide JSON by default)

**Problem:** Schema/JSON editor is intimidating for non‑tech users.

**Action:** Default to “Form” editor, hide JSON tab behind “Advanced.”

**Target:** `sheenappsai/src/components/builder/infrastructure/cms/CmsManagerDialog.tsx`

**Suggested snippet (tab gating)**
```tsx
const [showAdvanced, setShowAdvanced] = useState(false)

<TabsList>
  <TabsTrigger value="form">{t('entries.editorTabs.form')}</TabsTrigger>
  {showAdvanced && (
    <TabsTrigger value="json">{t('entries.editorTabs.json')}</TabsTrigger>
  )}
</TabsList>

<button onClick={() => setShowAdvanced(v => !v)}>
  {showAdvanced ? 'إخفاء المتقدم' : 'عرض المتقدم'}
</button>
```

**Acceptance:** New users never see JSON unless they explicitly enable it.

---

## 3.2 AuthKit: Hide tokens/JSON behind “Developer details”

**Problem:** Tokens and JSON responses reduce trust for non‑tech users.

**Action:** Wrap technical outputs in a collapsible section.

**Target:** `sheenappsai/src/components/builder/infrastructure/auth/AuthKitDialog.tsx`

**Suggested snippet**
```tsx
const [showDevDetails, setShowDevDetails] = useState(false)

<button onClick={() => setShowDevDetails(v => !v)}>
  {showDevDetails ? 'إخفاء تفاصيل المطور' : 'عرض تفاصيل المطور'}
</button>

{showDevDetails && (
  <div className="mt-3 rounded-lg bg-muted p-3 text-xs">
    <pre>{previewResponse}</pre>
  </div>
)}
```

**Acceptance:** Non‑tech users see “login success” without seeing tokens.

---

## 3.3 Deploy: Provide a “One‑click publish” CTA post‑build

**Problem:** Non‑tech users don’t know when it’s safe to deploy.

**Action:** After build success, show a single CTA: “Publish now.”

**Target:** `sheenappsai/src/components/builder/infrastructure/DeployButton.tsx` and build status tracking

**Suggested snippet**
```tsx
{buildStatus === 'deployed' || buildStatus === 'ready' ? (
  <Button onClick={() => setDeployOpen(true)}>
    انشر التطبيق الآن
  </Button>
) : null}
```

**Acceptance:** Clear, singular next step after build success.

---

## 3.4 Phase‑3 placeholders → “Coming Soon” with notify CTA

**Problem:** “Domains / Eject” appear real but are placeholders.

**Action:** Replace action buttons with “coming soon” + “notify me.”

**Target:** `sheenappsai/src/components/builder/infrastructure/phase3/Phase3ToolsPanel.tsx`

**Suggested snippet**
```tsx
<Button variant="outline" disabled>
  قريبًا
</Button>
<Button variant="ghost" onClick={openNotifyDialog}>
  اشعِرني عند التوفر
</Button>
```

**Acceptance:** Users aren’t misled, and you capture demand signals.

---

# 4) RTL & Arabic Consistency (Global Fixes)

## 4.1 Convert feedback UI to logical positioning

**Problem:** physical left/right breaks RTL.

**Target files:**
- `sheenappsai/src/components/feedback/FeedbackTab.tsx`
- `sheenappsai/src/components/feedback/MicroSurvey.tsx`
- `sheenappsai/src/components/feedback/CSATSurvey.tsx`

**Suggested replacements**
```tsx
// BEFORE
'right-0', 'left-0', 'text-left', 'pr-6'

// AFTER
'start-0', 'end-0', 'text-start', 'pe-6'
```

**Acceptance:** Feedback elements render correctly in RTL and LTR.

---

# 5) i18n Shape Validation (Prevent Drift)

**Problem:** Locale JSON shapes are inconsistent; this causes missing or extra keys.

**Action:** Add CI check that compares locale files against `en`.

**Example script** (Node / TS)
```ts
// scripts/check-i18n-shape.ts
import fs from 'fs'
import path from 'path'

const base = path.join(process.cwd(), 'src/messages')
const locales = fs.readdirSync(base).filter(d => fs.statSync(path.join(base, d)).isDirectory())

function flatten(obj: any, prefix = ''): string[] {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k))
  }
  return [prefix]
}

const ref = 'en'
const refFiles = fs.readdirSync(path.join(base, ref)).filter(f => f.endsWith('.json'))

let failed = false
for (const loc of locales) {
  for (const f of refFiles) {
    const refKeys = new Set(flatten(JSON.parse(fs.readFileSync(path.join(base, ref, f), 'utf-8'))))
    const locKeys = new Set(flatten(JSON.parse(fs.readFileSync(path.join(base, loc, f), 'utf-8'))))
    const missing = [...refKeys].filter(k => !locKeys.has(k))
    const extra = [...locKeys].filter(k => !refKeys.has(k))
    if (missing.length || extra.length) {
      failed = true
      console.error(`[${loc}/${f}] missing=${missing.length} extra=${extra.length}`)
    }
  }
}

if (failed) process.exit(1)
```

**Acceptance:** CI fails if locale shapes diverge.

---

# 6) Suggested Microcopy (Arabic‑first)

These are safe defaults to use in UI surfaces:

**Onboarding**
- “اختر نوع موقعك”
- “اكتب اسم مشروعك (اختياري)”
- “اختر المجال”
- “اختر الأسلوب”

**Build start**
- “بنجهّز تطبيقك الآن…”
- “سيظهر لك المعاينة بعد ثوانٍ”

**Iteration strip**
- “عدّل الوصف → جرّب المعاينة → انشر التطبيق”

**Deploy**
- “انشر التطبيق الآن”
- “جاهز للنشر”

---

# 7) Implementation Roadmap (Suggested)

**Phase P0 (1–2 weeks)**
- Localize feedback components + apply RTL logical positioning.
- Add onboarding persistence + first build hand‑off overlay.
- Introduce Simple Mode + remove auto‑switch to code view.

**Phase P1 (2–4 weeks)**
- Guided CMS mode + AuthKit “developer details” accordion.
- Iteration strip + deploy CTA on success.

**Phase P2 (4–6 weeks)**
- Lifecycle coach panel + “notify me” CTA for Phase‑3 features.
- i18n shape validation in CI.

---

# 8) QA & Validation

**User Testing Checklist (Arabic‑first)**
- Can a new user finish onboarding without help in <3 minutes?
- Do they see an obvious “Build started” confirmation?
- Can they find preview and regenerate without opening code?
- Can they deploy without reading technical details?
- Are all prompts fully Arabic and RTL‑correct?

**Analytics Suggestions**
- Track time‑to‑first‑build (TTFB)
- Track onboarding completion rate (per locale)
- Track “Simple Mode” opt‑out rate
- Track deploy success rate

---

# 9) File Map (for dev team)

- Onboarding: `sheenappsai/src/components/builder/onboarding-wizard.tsx`
- Workspace shell: `sheenappsai/src/components/builder/enhanced-workspace-page.tsx`
- Feedback UI: `sheenappsai/src/components/feedback/*`
- Easy Mode panel: `sheenappsai/src/components/builder/infrastructure/*`
- CMS manager: `sheenappsai/src/components/builder/infrastructure/cms/CmsManagerDialog.tsx`
- Auth kit: `sheenappsai/src/components/builder/infrastructure/auth/AuthKitDialog.tsx`
- i18n: `sheenappsai/src/messages/*/*.json`

