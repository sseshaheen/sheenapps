# Arabic Market Launch: Implementation Plan

**Goal:** Enable "the aunt in Cairo" to build, edit, and publish a website without developer help.

**Success Metrics:**

**Primary (Product Success):** 8/10 non-tech Arabic speakers complete the full flow without any assistance:
- Create a site
- Change logo/colors
- Add WhatsApp button + location
- Publish to domain
- Recover from one failure

**Secondary (Support Success):** If a user gets stuck, they can:
- Reach support within 30 seconds
- Resolve the issue and complete the flow
- Still count as a "recoverable" success

**Failure:** User abandons the flow entirely (neither self-completes nor recovers via support)

---

## Phase 1: Panic Prevention (Week 1)
*"When something goes wrong, do I still feel in control?"*

### 1.1 Error Message Overhaul
**Effort:** 3 days | **Impact:** Critical

Transform every error from technical to actionable Arabic:

```typescript
// Before
"CHAT_ERROR_TIMEOUT": "The request timed out. Please try again."

// After
"CHAT_ERROR_TIMEOUT": {
  message: "العملية استغرقت وقتاً أطول من المتوقع",
  action: "جرّب طلب أبسط مثل 'أضف صفحة تواصل'",
  support: "أو تحدث مع فريقنا عبر واتساب"
}
```

**Files to modify:**
- `src/messages/ar*/chat.json` - All Arabic variants
- `src/messages/ar*/toasts.json`
- `src/messages/ar*/errors.json` (create if missing)

**Pattern for each error:**
1. What happened (human terms)
2. What to try next (one action)
3. Escape hatch (support CTA)

### 1.2 Support Escape Hatch
**Effort:** 2 days | **Impact:** Critical

Add floating WhatsApp button with **locale-specific configuration**:

```typescript
// src/config/support.ts
export const supportConfig = {
  'ar-eg': {
    whatsappNumber: '+20XXXXXXXXXX',
    prefillMessage: 'محتاج مساعدة في شين ابس',
    hours: 'متاحين من ٩ص - ٩م بتوقيت القاهرة',
    timezone: 'Africa/Cairo'
  },
  'ar-sa': {
    whatsappNumber: '+966XXXXXXXXX',
    prefillMessage: 'أحتاج مساعدة في شين ابس',
    hours: 'متاحين من ٩ص - ٩م بتوقيت السعودية',
    timezone: 'Asia/Riyadh'
  },
  'ar-ae': {
    whatsappNumber: '+971XXXXXXXXX',
    prefillMessage: 'أحتاج مساعدة في شين ابس',
    hours: 'متاحين من ٩ص - ٩م بتوقيت الإمارات',
    timezone: 'Asia/Dubai'
  },
  'ar': {
    whatsappNumber: '+966XXXXXXXXX', // Default to Saudi
    prefillMessage: 'أحتاج مساعدة',
    hours: 'متاحين من ٩ص - ٩م',
    timezone: 'Asia/Riyadh'
  }
}
```

```tsx
// src/components/ui/whatsapp-support.tsx
export function WhatsAppSupport({ locale, source }: { locale: string; source?: string }) {
  const config = supportConfig[locale] || supportConfig['ar']
  if (!locale.startsWith('ar')) return null

  // UTM-style tracking to know where support requests originate
  const trackingParam = source ? `&source=${source}` : ''
  const waLink = `https://wa.me/${config.whatsappNumber.replace('+', '')}?text=${encodeURIComponent(config.prefillMessage)}${trackingParam}`

  return (
    <a
      href={waLink}
      className="fixed bottom-4 end-4 z-50 bg-green-500 rounded-full p-4 shadow-lg"
      aria-label="تواصل عبر واتساب"
    >
      <WhatsAppIcon className="w-6 h-6 text-white" />
      <span className="sr-only">{config.hours}</span>
    </a>
  )
}
```

**Usage with tracking:**
```tsx
// In error boundary:
<WhatsAppSupport locale={locale} source="builder_error_timeout" />

// In pricing page:
<WhatsAppSupport locale={locale} source="pricing_question" />
```

**Add to:** `src/app/[locale]/layout.tsx`

**Why locale-specific matters:** Showing +966 to Egyptians = "ده مش مصري" distrust

### 1.3 One-Button Recovery
**Effort:** 2 days | **Impact:** High

When builds fail, show:
```
حدث خطأ - لا تقلق!
[🔄 حاول مرة ثانية] [💬 تحدث مع الدعم]

ما حصل: النظام واجه مشكلة مؤقتة
ما نقترحه: جرب طلب أبسط أو تحدث معنا
```

**Files:**
- `src/components/builder/build-progress-error-boundary.tsx`
- `src/components/builder/clean-build-progress.tsx`

---

## Phase 2: Blank Page Problem (Week 1-2)
*"I don't know what to type"*

### 2.1 Prompt Examples (Clickable)
**Effort:** 2 days | **Impact:** Critical

Replace empty textarea with structured input:

```tsx
// src/components/builder/new-project-page.tsx
const arabicExamples = [
  { icon: "💇", text: "صالون تجميل يقبل حجوزات واتساب", category: "خدمات" },
  { icon: "🍰", text: "متجر حلويات منزلية مع توصيل", category: "متاجر" },
  { icon: "🦷", text: "عيادة أسنان تحتاج موقع بسيط", category: "طبي" },
  { icon: "👗", text: "بوتيك ملابس نسائية مع كتالوج", category: "أزياء" },
]

// Show as clickable chips above input
<div className="flex flex-wrap gap-2 mb-4">
  {arabicExamples.map(ex => (
    <button
      onClick={() => setPrompt(ex.text)}
      className="px-3 py-2 bg-muted rounded-full text-sm"
    >
      {ex.icon} {ex.text}
    </button>
  ))}
</div>
```

### 2.2 4-Question Wizard Alternative
**Effort:** 4 days | **Impact:** High

For users who prefer guidance over blank input:

```
الخطوة 1: فين مشروعك؟ (Location = identity in MENA)
[القاهرة] [الرياض] [جدة] [دبي] [أبوظبي] [غير ذلك]

الخطوة 2: ما نوع مشروعك؟
[متجر] [خدمات] [مطعم] [عيادة] [غير ذلك]

الخطوة 3: ما أهم شي تحتاجه؟
[حجوزات] [كتالوج منتجات] [نموذج تواصل] [موقع تعريفي فقط]

الخطوة 4: ما اسم مشروعك؟
[________________]

← رجوع                    [ابدأ البناء →]
```

**Why location matters:**
- Sets currency display automatically
- Pre-fills contact defaults (country code)
- Enables map embed with correct area
- Adjusts copy tone ("توصيل داخل القاهرة" vs "توصيل داخل الرياض")
- Builds trust ("they know my market")

**Implementation note:** Location should be optional (allow skip) but encouraged.

**Create:** `src/components/builder/guided-wizard.tsx`

---

## Phase 3: Waiting Problem (Week 2)
*"Installing dependencies" means nothing to me*

### 3.1 Human Progress UI
**Effort:** 3 days | **Impact:** High

Replace technical build steps with outcomes:

```typescript
// Before (technical)
const steps = [
  "Installing dependencies...",
  "Building application...",
  "Optimizing assets...",
  "Deploying to edge..."
]

// After (human)
const arabicSteps = [
  { label: "نصمم الصفحة الرئيسية", icon: "🏠" },
  { label: "نضيف صور ومحتوى", icon: "🖼️" },
  { label: "نجهز صفحة التواصل", icon: "📞" },
  { label: "ننشر موقعك للعالم", icon: "🚀" },
]
```

**Files:**
- `src/components/builder/build-steps-display.tsx`
- `src/components/builder/clean-build-progress.tsx`
- `src/messages/ar*/builder.json`

### 3.2 Instant Wireframe Preview
**Effort:** 5 days | **Impact:** Medium

Show a skeleton/wireframe immediately while AI works:

```tsx
// While building, show:
<div className="relative">
  {/* Label clearly to manage expectations */}
  <div className="absolute top-2 start-2 bg-amber-100 text-amber-800 px-2 py-1 rounded text-sm z-10">
    معاينة مبدئية - الشكل النهائي قد يختلف قليلاً
  </div>

  <WireframeSkeleton template={inferredTemplate} />
  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
    <BuildProgress steps={arabicSteps} currentStep={2} />
  </div>
</div>
```

**Expectation Management (Critical):**
- Label as "معاينة مبدئية" (preliminary preview)
- Keep wireframe very generic (don't show specific content)
- Ensure final site preserves same page structure
- If wireframe shows 3 sections, final should have ~3 sections

**Risk:** If wireframe looks great but final doesn't match, users feel tricked.

**Mitigation:**
- Use abstract shapes, not realistic content
- Match section count between wireframe and final
- Add subtle disclaimer about final appearance

---

## Phase 4: Vocabulary Problem (Week 2)
*"Workspace", "deploy", "build mode" - what?*

### 4.1 Term Replacement Map
**Effort:** 2 days | **Impact:** High

| English Term | Current Arabic | Better Arabic |
|--------------|----------------|---------------|
| Workspace | مساحة العمل | موقعك |
| Deploy | نشر | نشر موقعك |
| Build | بناء | تنفيذ |
| Build mode | وضع البناء | تنفيذ فوري |
| Plan mode | وضع التخطيط | مراجعة أولاً |
| Preview | معاينة | شاهد موقعك |
| Rollback | استرجاع | رجوع لنسخة سابقة |

**Files to update:**
- All `src/messages/ar*/*.json` files
- Component labels in builder
- Navigation items

### 4.2 Tooltip Explanations
**Effort:** 3 days | **Impact:** Medium

**WARNING:** Don't use `title` attribute - it doesn't work on mobile/touch devices.

Use actual Tooltip component or inline helper text:

```tsx
// ❌ WRONG - doesn't work on mobile
<Button title="انشر موقعك ليراه الجميع">
  نشر
</Button>

// ✅ CORRECT - use Radix Tooltip component
<Tooltip>
  <TooltipTrigger asChild>
    <Button>نشر</Button>
  </TooltipTrigger>
  <TooltipContent>انشر موقعك ليراه الجميع</TooltipContent>
</Tooltip>

// ✅ ALSO CORRECT - inline helper for important actions (first-run)
<div className="space-y-1">
  <Button>نشر</Button>
  <p className="text-xs text-muted-foreground">موقعك سيكون متاح للجميع</p>
</div>

// ✅ For switches/toggles - use inline description
<div className="flex items-center justify-between">
  <div>
    <Label>تنفيذ فوري</Label>
    <p className="text-xs text-muted-foreground">التعديلات ستظهر مباشرة</p>
  </div>
  <Switch checked={buildMode} />
</div>
```

**First-run vs. Returning users:**
- First-run: Show inline helper text for critical actions
- Returning users: Can hide helpers after first use (localStorage flag)

---

## Phase 5: Pricing Simplification (Week 3)
*"AI time" is metered magic - humans hate invisible meters*

### 5.1 Plan-Based Pricing (Kill the Meter)
**Effort:** 5 days | **Impact:** Critical

**CRITICAL:** UI promises must match backend enforcement. If you say "تعديلات غير محدودة" but the backend blocks on AI minutes, trust dies instantly.

**Two valid approaches:**

**Option A: True Unlimited (Recommended)**
- Remove per-request limits for paid plans
- Use fair-use policy for abuse prevention
- Backend tracks usage for analytics, not enforcement

**Option B: Honest Quotas**
- Show limits in human terms: "50 تعديل شهرياً"
- Map internal AI minutes → external "edits" or "builds"
- Add fair-use language: "سياسة استخدام عادل"

**Never do:** Say "unlimited" in UI but enforce limits in backend.

**New pricing structure:**

```typescript
// src/config/pricing-plans.ts
export const arabicPlans = {
  free: {
    name: "مجاني",
    price: 0,
    features: [
      "موقع واحد",
      "10 تعديلات شهرياً",
      "رابط sheenapps.com",
    ],
    limits: {
      editsPerMonth: 10,
      sites: 1,
      customDomain: false
    },
    cta: "ابدأ مجاناً"
  },
  starter: {
    name: "البداية",
    priceEGP: 149,
    priceSAR: 49,
    priceAED: 49,
    features: [
      "موقع واحد",
      "تعديلات سخية", // NOT "غير محدودة" unless truly unlimited
      "دومين مخصص",
      "دعم واتساب",
    ],
    limits: {
      editsPerMonth: 100, // Or null if truly unlimited
      sites: 1,
      customDomain: true
    },
    fairUseNote: "استخدام عادل - للمشاريع الحقيقية",
    cta: "ابدأ الآن"
  },
  business: {
    name: "الأعمال",
    priceEGP: 399,
    priceSAR: 149,
    priceAED: 149,
    features: [
      "3 مواقع",
      "تعديلات سخية",
      "دومين مخصص",
      "دعم أولوية",
      "تحليلات متقدمة",
    ],
    limits: {
      editsPerMonth: null, // Truly unlimited with fair use
      sites: 3,
      customDomain: true
    },
    fairUseNote: "استخدام عادل - للمشاريع الحقيقية",
    cta: "للشركات",
    popular: true
  }
}
```

**Backend sync required:**
- Map AI minutes → "edits" (1 edit ≈ X minutes)
- Enforcement must match UI promises exactly
- Add soft warnings before hard blocks

### 5.2 Usage Display (If Needed)
If you must show limits, show human metrics:

```tsx
// Instead of: "12 minutes remaining"
// Show:
<UsageBar
  label="التعديلات هذا الشهر"
  used={7}
  total={10}
  icon="✏️"
/>
```

---

## Phase 6: Trust Building (Week 3)
*MENA trust is personal, not statistical*

### 6.1 Case Studies Page
**Effort:** 3 days | **Impact:** High

Create `/ar/success-stories` with:

**WARNING:** Don't make claims you can't prove. "40% increase" without data = credibility grenade.

```tsx
const caseStudies = [
  {
    name: "سارة",
    business: "صالون سارة للتجميل",
    location: "جدة",
    image: "/images/case-studies/sarah-salon.jpg",
    // ❌ WRONG: "حجوزاتي زادت 40%" (unprovable)
    // ✅ CORRECT: Believable, soft claims
    quote: "بقى عندي موقع محترم والزبائن يوصلوني بسهولة",
    websiteScreenshot: "/images/case-studies/sarah-site.png"
  },
  {
    name: "أحمد",
    business: "حلويات أم أحمد",
    location: "القاهرة",
    image: "/images/case-studies/ahmed-sweets.jpg",
    quote: "الطلبات بقت منظمة على واتساب - مش محتاج مبرمج",
    websiteScreenshot: "/images/case-studies/ahmed-site.png"
  },
  {
    name: "فاطمة",
    business: "عيادة د. فاطمة للأسنان",
    location: "الرياض",
    image: "/images/case-studies/fatima-clinic.jpg",
    quote: "المرضى يحجزون أونلاين الآن - وفّرت وقت كثير",
    websiteScreenshot: "/images/case-studies/fatima-site.png"
  }
]
```

**Soft claims that work:**
- "بقى عندي موقع محترم"
- "الناس بقت تعرف توصلني بسرعة"
- "الطلبات بقت منظمة"
- "وفّرت وقت ومجهود"
- "زيادة ملحوظة في الاستفسارات"

**Claims to avoid (unless proven):**
- "زادت المبيعات X%"
- "أكثر من X عميل جديد"
- Specific numbers without data source

### 6.2 About Page with Faces
**Effort:** 2 days | **Impact:** Medium

Show team with Arabic names:
- Photos (real, not stock)
- Arabic names prominently
- "نحن من السعودية/مصر" origin story
- Commercial registration number (if applicable)

### 6.3 Footer Trust Signals
**Effort:** 1 day | **Impact:** Medium

```tsx
<footer>
  <div className="trust-signals">
    <span>📞 واتساب: +966-XXX-XXXX</span>
    <span>⏰ متاحين ٩ص - ٩م</span>
    <span>💳 دفع آمن عبر Stripe</span>
    <span>↩️ استرداد خلال 14 يوم</span>
  </div>
</footer>
```

---

## Phase 7: Video Tutorials (Week 3-4)
*Video builds trust fast in MENA*

### 7.1 Three Core Videos (90 seconds each)

1. **"كيف تبني موقعك في 5 دقائق"**
   - Screen recording with Arabic voiceover
   - Show the full flow: idea → site → publish

2. **"كيف تعدل موقعك"**
   - Change colors, logo, text
   - Add WhatsApp button

3. **"كيف تحل مشكلة"**
   - Show an error happening
   - Show recovery + support contact

**Placement:**
- Homepage hero section
- Dashboard empty state
- Help page
- YouTube channel

---

## Phase 8: Dialect Strategy
*MSA for UI, dialect for warmth - but don't mix dialects across locales*

### 8.1 Where to Use MSA (Modern Standard Arabic)
- All UI labels
- Error messages
- Pricing
- Legal/terms
- Documentation

### 8.2 Dialect Rules Per Locale

**Critical:** Don't use Egyptian dialect for Saudi users or vice versa.

**ar-eg (Egyptian):**
- Warmth words: "يلا نبدأ!"، "تمام!"، "ممتاز!"
- Celebrations: "تمام! موقعك جاهز"
- Loading: "ثواني وجاهز..."
- Support: Egyptian Arabic conversational

**ar-sa / ar-ae (Gulf):**
- Warmth words: "يلا نبدأ!"، "تمام!" (these work across Arabic)
- Keep mostly MSA with light Gulf warmth
- Avoid distinctly Egyptian phrases like "إزيك" or "الحمد لله"
- Support: Gulf Arabic or neutral MSA

**ar (MSA - pan-regional):**
- Stick to formal MSA everywhere
- Warmth through exclamation, not dialect: "رائع!" not "تمام!"

### 8.3 Dialect Implementation

```typescript
// src/config/dialect.ts
export const dialectConfig = {
  'ar-eg': {
    success: 'تمام! موقعك جاهز',
    loading: 'ثواني وجاهز...',
    welcome: 'يلا نبدأ!',
    great: 'ممتاز!',
  },
  'ar-sa': {
    success: 'تم! موقعك جاهز',
    loading: 'لحظات...',
    welcome: 'يلا نبدأ!',
    great: 'ممتاز!',
  },
  'ar-ae': {
    success: 'تم! موقعك جاهز',
    loading: 'لحظات...',
    welcome: 'يلا نبدأ!',
    great: 'رائع!',
  },
  'ar': {
    success: 'تم بنجاح! موقعك جاهز',
    loading: 'جارٍ التحميل...',
    welcome: 'لنبدأ!',
    great: 'رائع!',
  }
}
```

---

## Phase 9: Undo & Recovery UX
*"Non-tech users become brave when there's a big safe button"*

### 9.1 Prominent Undo Button
**Effort:** 1 day | **Impact:** High

The version history exists (`version-history-modal.tsx`, `version-restore-modal.tsx`) but it's not discoverable.

Add a prominent "تراجع" button in the workspace header:

```tsx
// Add to workspace header actions
<Button
  variant="ghost"
  onClick={() => setShowVersionHistory(true)}
  className="flex items-center gap-2"
>
  <Undo2 className="h-4 w-4" />
  <span>تراجع / رجّع زي ما كان</span>
</Button>
```

**Placement options:**
1. Workspace header (always visible) - Recommended
2. After every successful edit (toast with undo)
3. Floating action button on mobile

### 9.2 Post-Edit Recovery Toast
**Effort:** 2 days | **Impact:** Medium

After every successful change, show a toast with undo option:

```tsx
toast({
  title: "تم التعديل",
  description: "غيّرت اللون إلى أزرق",
  action: (
    <Button variant="outline" size="sm" onClick={handleUndo}>
      تراجع
    </Button>
  ),
  duration: 5000, // 5 seconds to undo
})
```

**Why this matters:**
- Reduces fear of experimentation
- Cuts support load ("I broke my site!")
- Builds confidence in the tool

---

## Implementation Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Panic Prevention | Error messages, locale-specific WhatsApp, recovery UX, undo button |
| 2 | Blank Page + Waiting | Examples, 4-question wizard with location, human progress UI, wireframe |
| 3 | Vocabulary + Pricing | Term replacement, mobile tooltips, plan-based pricing, backend sync |
| 4 | Trust + Videos + Dialect | Case studies (soft claims), about page, 3 videos, locale-specific dialect |

---

## Validation: 10-User Test Protocol

After each phase, test with 2-3 non-tech Arabic speakers:

**Test Script:**
1. "Create a website for a bakery that delivers"
2. "Change the main color to pink"
3. "Add a WhatsApp contact button"
4. *Intentionally trigger an error*
5. "Publish your website"

**In-Flow Comprehension Checks (Critical):**
Don't wait until the end. Ask during the flow:

| Moment | Question to Ask |
|--------|-----------------|
| When they see "تنفيذ فوري / مراجعة أولاً" | "What do you think will happen if you click each?" |
| When progress UI shows | "What's happening right now?" |
| When they see pricing | "What happens if you run out of edits?" |
| After an error appears | "What would you do next?" |

**If they can't explain it → rename it.**

**Measure:**
- Time to first publish
- Number of "stuck" moments (user stops, looks confused)
- Support requests
- Comprehension accuracy (can they predict what buttons do?)
- Recovery success (do they complete after an error?)

**Success Criteria:**
- **Primary:** 8/10 users complete all tasks without human help
- **Secondary:** Users who get stuck recover within 30 seconds
- **Comprehension:** 90%+ can correctly explain key actions

---

## Files to Create/Modify

### New Files
- `src/config/support.ts` - Locale-specific WhatsApp config with tracking
- `src/config/dialect.ts` - Locale-specific warmth phrases
- `src/components/ui/whatsapp-support.tsx` - Floating support button
- `src/components/builder/guided-wizard.tsx` - 4-question onboarding wizard
- `src/components/builder/wireframe-skeleton.tsx` - Instant preview skeleton
- `src/app/[locale]/success-stories/page.tsx` - Case studies page
- `src/messages/ar*/errors.json` - Actionable Arabic error messages

### Major Modifications
- `src/messages/ar*/*.json` (all translation files - vocabulary + dialect per locale)
- `src/components/builder/new-project-page.tsx` - Add clickable examples
- `src/components/builder/build-steps-display.tsx` - Human progress labels
- `src/components/builder/clean-build-progress.tsx` - Wireframe + expectation labels
- `src/components/builder/workspace/*.tsx` - Add prominent undo button
- `src/config/pricing-plans.ts` - Plan-based with honest limits
- `src/app/[locale]/layout.tsx` - Add WhatsApp support component
- All tooltip usages - Replace `title` with Tooltip component

### Backend Sync Required
- Map AI minutes → "edits" quota
- Ensure enforcement matches UI promises
- Add soft warnings before hard blocks

---

## Success Criteria

**"Aunt in Cairo" Test Passed When:**
- [ ] User creates site without asking "what do I type?"
- [ ] User understands progress without technical terms
- [ ] User recovers from error without panic
- [ ] User finds help within 2 clicks
- [ ] User publishes without confusion about pricing
- [ ] User would recommend to a friend

---

*This plan prioritizes friction removal over feature addition. The technical foundation is strong - now add the human layer.*
