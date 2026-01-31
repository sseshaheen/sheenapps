# Arabic SEO Strategy Plan - SheenApps

**Created:** January 2026
**Objective:** Dominate Arabic search results for AI/no-code app building in MENA region
**Competitive Edge:** Arabic-first approach for hundreds of millions of Arabic speakers

---

## Executive Summary

**Current Arabic SEO Score: 7.5/10** (improved from 6.8/10 after quick wins)

### Quick Wins Implemented
- [x] Arabic metadata for About, Pricing, Careers pages
- [x] Regional Arabic keywords (Egypt, Saudi, UAE specific)
- [x] Arabic feature lists in structured data
- [x] Egyptian colloquial (Masri) differentiation
- [x] Local currency mentions in pricing metadata

---

## Implementation Progress (January 2026)

### Phase 1: Technical Arabic SEO ✅ COMPLETED

| Task | Status | Files Created |
|------|--------|---------------|
| Arabic OG Images (Homepage, Pricing, Careers, Blog, No-Code Page) | ✅ Done | `[locale]/opengraph-image.tsx`, `[locale]/pricing/opengraph-image.tsx`, `[locale]/careers/opengraph-image.tsx`, `[locale]/no-code-app-builder/opengraph-image.tsx` |
| Arabic Schema.org Enhancements | ✅ Done | Updated `lib/structured-data.ts` with `areaServed`, `knowsLanguage`, `slogan` |
| Arabic font loading in OG images | ✅ Done | Using Noto Sans Arabic from Google Fonts |
| Blog OG image Arabic font fix | ✅ Done | Updated `blog/[slug]/opengraph-image.tsx` |

### Phase 2: Content & Keywords ✅ COMPLETED

| Task | Status | Files Created |
|------|--------|---------------|
| Dedicated money page `/[locale]/no-code-app-builder` | ✅ Done | `[locale]/no-code-app-builder/page.tsx` |
| Egypt landing page `/ar-eg/build-app-egypt` | ✅ Done | `[locale]/build-app-egypt/page.tsx` |
| Saudi landing page `/ar-sa/build-app-saudi` | ✅ Done | `[locale]/build-app-saudi/page.tsx` |
| UAE landing page `/ar-ae/build-app-uae` | ✅ Done | `[locale]/build-app-uae/page.tsx` |
| Internal linking component | ✅ Done | `components/seo/ArabicInternalLinks.tsx` |

### Regional Landing Pages Details

Each regional page includes:
- **Egypt** (`/ar-eg/build-app-egypt`):
  - Payment methods: Fawry, InstaPay, Vodafone Cash
  - Currency: EGP (ج.م)
  - Egyptian colloquial (Masri) language
  - Pricing: Free, 449 EGP/mo (50% off), 1,499 EGP/mo

- **Saudi** (`/ar-sa/build-app-saudi`):
  - Payment methods: Mada, Apple Pay, STC Pay
  - Currency: SAR (ر.س)
  - MSA with Vision 2030 messaging
  - Pricing: Free, 109 SAR/mo, 399 SAR/mo

- **UAE** (`/ar-ae/build-app-uae`):
  - Payment methods: Apple Pay, Samsung Pay, Cards
  - Currency: AED (د.إ)
  - MSA with VAT-inclusive pricing note
  - Pricing: Free, 107 AED/mo, 399 AED/mo

### Discoveries & Notes

1. **OG Image Font Loading**: next/og requires explicit font loading via fetch. ~~Using Noto Sans Arabic from Google Fonts CDN works well.~~ **Updated:** Now using bundled font for reliability (see Code Review Fixes below).

2. **Regional Pages Architecture**: Using redirect pattern - e.g., `/en/build-app-egypt` redirects to `/ar-eg/build-app-egypt`. Only the relevant locale shows the page.

3. **Internal Linking Component**: Created `ArabicInternalLinks` component with presets for common content types (ecommerce, booking, delivery, noCode). Auto-detects regional landing page based on locale.

4. **Content Differentiation**: Egyptian page uses Masri dialect naturally in CTAs and descriptions. Saudi/UAE use MSA but with region-specific payment methods and pricing.

### Code Review Fixes - Round 1 (January 2026)

Expert review identified the following issues, now fixed:

| Issue | Fix Applied |
|-------|-------------|
| **OG locale format wrong** - OpenGraph expects `ar_EG` not `ar-eg` | Created `toOgLocale()` helper in `src/lib/seo/locale.ts`. Now used in layout.tsx and page metadata. |
| **Runtime font fetching unreliable** - Fetching from Google Fonts at runtime in Edge is slow/unreliable | Bundled font locally and fetch from public/. |
| **Code duplication** - RTL check duplicated across files | Created `isRtlLocale()` helper in `src/lib/seo/locale.ts`. |
| **English canonical consistency** - Hardcoded `/en/` in some redirects | Fixed in `advisor/application-status/page.tsx`. Auth API fallbacks kept as-is (last-resort error handling). |

### Code Review Fixes - Round 2 (January 2026)

Additional fixes from second expert review:

| Issue | Fix Applied |
|-------|-------------|
| **blog/[slug]/page.tsx OG locale wrong** - Using raw locale instead of OG format | Added `toOgLocale()` import and applied to `locale` and `alternateLocale` in metadata. |
| **blog/page.tsx English URL mismatch** - OG URL and JSON-LD used `/en/blog` instead of `/blog` | Fixed OG url and all structured data URLs to use canonical pattern (English at root). |
| **blog/page.tsx OG locale wrong** - Using raw locale | Applied `toOgLocale()` helper. |
| **about/page.tsx missing locale validation** - Metadata generated for invalid locales | Added locale validation in `generateMetadata()`. |
| **about/page.tsx OG locale ternary chain** - Duplicated locale mapping | Replaced with `toOgLocale()` helper. |
| **Font location not Edge-optimal** - Using import.meta.url in assets/ | Moved font to `public/fonts/` and fetch from site URL with aggressive caching. |
| **solutions/[slug]/page.tsx OG locale** - Using raw locale | Applied `toOgLocale()` helper. |
| **solutions/migrate/[platform]/page.tsx OG locale** - Using raw locale | Applied `toOgLocale()` helper. |
| **solutions/type/[type]/page.tsx OG locale** - Using raw locale | Applied `toOgLocale()` helper. |
| **careers/page.tsx OG locale ternary chain** - Duplicated locale mapping | Replaced with `toOgLocale()` helper. |

**Expert suggestions evaluated but deferred:**
- **Careers pagination dead code**: Low priority cleanup, pages don't have enough items to warrant pagination yet.
- **OG template extraction**: Nice-to-have refactor, current approach works. Can consolidate when adding more OG images.

**Shared utilities:**
- `src/lib/seo/locale.ts` - `toOgLocale()`, `toBCP47()`, `isRtlLocale()`, `getCanonicalPath()`
- `src/lib/seo/og-fonts.ts` - `getOgArabicFont()`, `getOgFontConfig()`
- `public/fonts/NotoSansArabic-Bold.ttf` - Bundled font served from own origin

---

### Additional Completed Tasks

| Task | Status | Notes |
|------|--------|-------|
| FAQ Schema on regional pages | ✅ Done | Added to Egypt, Saudi, UAE pages |
| Sitemap updated | ✅ Done | Added pricing, no-code-app-builder, regional pages |

### Remaining Tasks

| Task | Priority | Status |
|------|----------|--------|
| Audit Arabic translation files (ar vs ar-eg vs ar-sa) | MEDIUM | Pending |
| Mobile UX testing for Arabic pages | HIGH | Pending |
| Core Web Vitals testing per locale | HIGH | Pending |
| Voice search Q&A blocks | MEDIUM | Pending |

### Market Opportunity

*Note: These are industry estimates from marketing reports, not primary Google sources. Treat as directional guidance.*

- **Majority of MENA Google searches are in Arabic** (commonly cited as 50-60%)
- **Mobile-dominant region** - most searches from mobile devices
- **Arabic content is underrepresented online** - only ~1% of web content is Arabic despite hundreds of millions of speakers (W3Techs)
- Voice search adoption growing in Arabic markets

The opportunity is real: Arabic speakers searching for tech/business tools often find poor or no Arabic results.

---

## Priority Stack (If You Only Do Three Things)

1. **Arabic keyword research → keyword-to-page map** (prevents wasted content, avoids cannibalization)
2. **High-quality localized landing pages** (EG/SA/UAE) with real substance (payments, testimonials, examples)
3. **Homepage + solutions schema + Arabic CWV/mobile polish**

Everything else becomes easier once those are nailed.

---

## Phase 1: Technical Arabic SEO (Week 1-2)

### 1.1 Create Arabic-Specific OG Images
**Priority: HIGH | Effort: 4-6 hours**

Current: Single `og-image.png` for all locales
Target: Dynamic Arabic OG images with RTL text

```typescript
// src/app/[locale]/opengraph-image.tsx
// Generate locale-specific OG images with:
// - RTL text direction for Arabic
// - Arabic typography (Cairo/IBM Plex Arabic fonts)
```

**Files to create:**
- `src/app/[locale]/opengraph-image.tsx` - Homepage OG
- `src/app/[locale]/pricing/opengraph-image.tsx` - Pricing OG
- `src/app/[locale]/careers/opengraph-image.tsx` - Careers OG

**Font rendering check:** Confirm Arabic text renders with intended font in OG images (no tofu □□□ boxes) and that RTL layout is correct. Load Arabic fonts explicitly in the OG route - next/og often falls back to system fonts otherwise.

### ~~1.2 Add Geo-Targeting Meta Tags~~
**Priority: LOW (Skip) | Effort: 1 hour**

~~Add regional signals for Google.~~

**Expert review:** Meta tags like `geo.region` / `geo.placename` are **not part of Google's documented supported meta tags** for indexing/ranking. Skip this.

Real geo-relevance levers that matter:
- Localized content with regional entities (Egypt/Saudi/UAE mentions)
- hreflang (already implemented)
- Localized landing pages (Phase 2)
- Real local backlinks/mentions (Phase 5)

### 1.3 Arabic Schema.org Enhancements
**Priority: HIGH | Effort: 2-3 hours**

Add Arabic-specific schema fields:

```typescript
// Add to homepage structured data:
{
  "@type": "Organization",
  "areaServed": [
    {"@type": "Country", "name": "Egypt"},
    {"@type": "Country", "name": "Saudi Arabia"},
    {"@type": "Country", "name": "United Arab Emirates"}
  ],
  "knowsLanguage": ["ar", "ar-EG", "ar-SA", "en"],
  "slogan": "فريقك التقني الدائم"  // Arabic slogan
}
```

---

## Phase 2: Content & Keywords (Week 2-4)

### 2.1 Arabic Keyword Research + Keyword-to-Page Map
**Priority: CRITICAL | Effort: 8-12 hours**

**Target Keywords by Intent:**

| Intent | Arabic Keyword | English | Search Volume Est. |
|--------|----------------|---------|-------------------|
| Transactional | بناء تطبيق بدون كود | build app no code | High |
| Transactional | منشئ مواقع بالذكاء الاصطناعي | AI website builder | High |
| Informational | كيف أعمل تطبيق | how to make an app | Very High |
| Commercial | أفضل منصة بناء تطبيقات | best app builder platform | Medium |
| Local | تطبيقات مصر | apps Egypt | Medium |
| Local | شركة تقنية السعودية | tech company Saudi | Medium |

**Keyword-to-Page Map (Prevents Cannibalization)**

Create a clear "who owns what query" layer:

| Topic Cluster | Primary Page | Supporting Content |
|---------------|--------------|-------------------|
| بناء تطبيق بدون كود (no-code app) | `/ar/no-code-app-builder` **← dedicated money page** | Comparison page, beginner guide blog |
| منشئ مواقع بالذكاء الاصطناعي (AI builder) | `/ar/solutions/ai-builder` | "How it works" page, templates |
| نظام حجوزات (booking system) | `/ar/solutions/booking` | Arabic case study, FAQ blocks |
| متجر إلكتروني (e-commerce) | `/ar/solutions/ecommerce` | Regional payment guide, testimonials |
| إدارة عملاء (CRM) | `/ar/solutions/crm` | Arabic demo, feature comparison |

**Important:** Keep `/ar/` homepage as a broad brand/overview page. Create `/ar/no-code-app-builder` (or `/ar/build-app`) as the dedicated page for the main transactional keyword. This lets you optimize aggressively without making the homepage weird.

**Regional Keyword Variants (Internal Reference):**

| Standard Arabic (MSA) | Egyptian (Masri) | Gulf |
|-----------------------|------------------|------|
| أريد | عايز | أبغى |
| تطبيق | أبليكيشن | تطبيق |
| متجر إلكتروني | متجر أونلاين | متجر الكتروني |
| مجاني | ببلاش | مجاني |

*Use this table for internal guidance, not keyword-stuffing.*

### 2.2 Arabic Content Strategy
**Priority: HIGH | Effort: Ongoing**

**Blog Topics for Arabic SEO:**

1. **Beginner guides** (highest search volume):
   - "كيف تبني تطبيق بدون برمجة في 2026"
   - "دليل المبتدئين لبناء المواقع بالذكاء الاصطناعي"

2. **Regional business content**:
   - "أفضل طرق الدفع الإلكتروني في مصر"
   - "كيف تبدأ متجر إلكتروني في السعودية"
   - "قوانين التجارة الإلكترونية في الإمارات"

3. **Comparison content**:
   - "شين آبس vs ويكس: أيهما أفضل للعربية؟"
   - "مقارنة منصات بناء التطبيقات 2026"

4. **Seasonal content** (Ramadan, Eid):
   - "أفكار تطبيقات لشهر رمضان"
   - "عروض العيد لبناء التطبيقات"

### 2.4 Internal Linking Rules (Arabic Content)
**Priority: HIGH | Effort: Ongoing**

Internal links turn content into rankings and leads. Follow these rules:

**Every Arabic blog post links to:**
- 1 solution page (relevant to topic)
- 1 regional landing page (match reader's locale if possible)
- 1 conversion page (pricing or demo)

**Every solution page links to:**
- 1-2 relevant guides/blog posts
- Regional landing pages
- Pricing page

**Example:** Blog post "كيف تبني متجر إلكتروني" links to:
- `/ar/solutions/ecommerce` (solution)
- `/ar-eg/build-app-egypt` (regional, if reader is Egyptian)
- `/ar/pricing` (conversion)

### 2.3 Arabic Landing Pages
**Priority: HIGH | Effort: 4-6 hours per page**

Create dedicated Arabic landing pages with **real substance** (not thin copies):

1. `/ar-eg/build-app-egypt` - "ابني تطبيقك في مصر"
2. `/ar-sa/build-app-saudi` - "ابني تطبيقك في السعودية"
3. `/ar-ae/build-app-uae` - "ابني تطبيقك في الإمارات"

**Each page MUST include:**
- Local payment methods (Fawry, Mada, Apple Pay)
- Local currency pricing with actual numbers
- Regional testimonials from real users
- Local business examples/case studies
- Region-specific CTAs

**Collision Prevention Rules:**
- Each regional landing page must have **distinct primary intent** (not duplicate homepage messaging)
- Canonical must be **self-referential** per locale page
- hreflang alternates must include matching versions (no redirect-locale equivalents like fr-ma)
- Content overlap with `/ar-eg/` homepage should be <30%

**Don't:** Create thin pages that are just MSA copies with different URLs.

---

## Phase 3: Regional Dialect Optimization (Week 4-6)

### Dialect Strategy: MSA Core, Dialect Accents

**Key principle:** Keep core pages in clear Modern Standard Arabic (MSA). Use dialect phrases sparingly in conversational content where it feels natural.

**Do:**
- MSA for homepage, pricing, solutions pages (professional, trustworthy)
- Masri/Gulf touches in FAQs, testimonials, examples, blog content
- Dialect in UI microcopy (CTAs, button text) for conversion

**Don't:**
- Turn pages into slang-heavy meme content
- Keyword-stuff with dialect variants
- Make the site feel unprofessional

### 3.1 Egyptian Arabic (Masri) Enhancement
**Priority: MEDIUM | Effort: 6-8 hours**

Egyptian Arabic is the most widely understood Arabic dialect (due to Egyptian media).

**Current:** Using some Masri in ar-eg translations
**Enhance:**
- Egypt-specific testimonials in natural Masri
- Egyptian payment methods (Fawry, InstaPay, Vodafone Cash)
- Egyptian Pound pricing prominently displayed

**Example natural usage:**
```json
// ar-eg/hero.json - conversational CTAs
{
  "cta": "ابدأ ببلاش",  // Natural Masri
  "paymentMethods": "ادفع بفوري أو إنستاباي"
}
```

### 3.2 Gulf Arabic Enhancement
**Priority: MEDIUM | Effort: 4-6 hours**

Saudi and UAE users generally prefer more formal Arabic.

**Enhance:**
- Reference local payment (Mada for Saudi, Apple Pay for UAE)
- VAT-compliant messaging for UAE
- Keep language professional with subtle Gulf touches where natural

### 3.3 Translation Quality Audit
**Priority: MEDIUM | Effort: 4-6 hours**

Review and differentiate currently identical translation files:
- `ar/advisors.json` vs `ar-eg/advisors.json` vs `ar-sa/advisors.json`
- Ensure regional authenticity, not just MSA copies with different URLs

---

## Phase 4: Technical Performance (Week 6-8)

### 4.1 Arabic Font Optimization
**Priority: MEDIUM | Effort: 2-3 hours**

Current: Cairo + IBM Plex Arabic (preload: false for non-Arabic)

**Optimize:**
- Subset Arabic fonts to reduce payload
- Prioritize ar-eg (largest market) font loading
- Consider variable fonts for better performance

### 4.2 Mobile-First Arabic UX
**Priority: HIGH | Effort: 8-12 hours**

Mobile is the primary device in MENA.

**Checklist:**
- [ ] Test all Arabic pages on mobile viewport
- [ ] Ensure RTL touch targets are correct size
- [ ] Verify Arabic text doesn't overflow on small screens
- [ ] Test Arabic form inputs (keyboard, validation messages)
- [ ] Check Arabic number formatting (٠١٢ vs 012)

### 4.3 Core Web Vitals for Arabic Pages
**Priority: HIGH | Effort: 4-6 hours**

Run PageSpeed Insights for each Arabic locale:
- `https://www.sheenapps.com/ar/`
- `https://www.sheenapps.com/ar-eg/`
- `https://www.sheenapps.com/ar-sa/`
- `https://www.sheenapps.com/ar-ae/`

Target: All metrics in "Good" range.

---

## Phase 5: Link Building & Authority (Ongoing)

### Quality Over Quantity

**Focus on credible ecosystem links, not random directories.**

### 5.1 High-Value Link Targets
**Priority: MEDIUM | Effort: Ongoing**

**MENA Startup Ecosystem:**
- Wamda (startup community + directory)
- Flat6Labs portfolio/tools pages
- AstroLabs partner mentions
- 500 Global MENA portfolio

**Arabic Product Reviews/Roundups:**
- Arabic tech review sites featuring no-code tools
- "Best app builders for Arabic" roundup articles

**Payment/Commerce Partners:**
- Fawry ecosystem blog/partner page
- Mada merchant resources
- PayTabs/Hyperpay integration mentions

### 5.2 Media Outreach
**Priority: LOW | Effort: Opportunistic**

Target Arabic tech publications when you have news:
- Wamda
- Arabnet
- Arabic tech sections of major outlets

**Pitch angles:**
- "No-code platform with native Arabic support"
- "AI app builder with local currency pricing for MENA"

### ~~5.3 Generic Directory Listings~~
**Priority: LOW (Skip most)**

Generic directories (Yellow Pages Arabia, Daleeli, etc.) are low ROI and time sinks. Only pursue if they're clearly relevant and credible.

---

## Phase 6: Featured Snippet & Voice Optimization (Week 8-10)

*Note: "Voice search optimization" is essentially featured snippet optimization. FAQ schema helps eligibility, but the bigger drivers are concise Q→A blocks, strong headings, and page authority.*

### 6.1 Arabic Q&A Content Blocks
**Priority: MEDIUM | Effort: 4-6 hours**

Structure content with clear question headings and concise answers:

```markdown
## كيف أبني تطبيق بدون برمجة؟

مع شين آبس، تقدر تبني تطبيقك في 5 دقائق. اوصف فكرتك بالعربي والذكاء الاصطناعي يبني التطبيق.
```

### 6.2 FAQ Schema
**Priority: MEDIUM | Effort: 2-3 hours**

Add FAQ structured data where appropriate:

```json
{
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "كيف أبني تطبيق بدون برمجة؟",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "مع شين آبس، تقدر تبني تطبيقك في 5 دقائق باستخدام الذكاء الاصطناعي..."
      }
    }
  ]
}
```

*Note: Google has reduced FAQ rich result display over time. Treat as helpful-but-not-guaranteed.*

---

## Metrics & KPIs

### Track Weekly:
- Google Search Console impressions/clicks for Arabic queries
- Ranking positions for target Arabic keywords
- Arabic page traffic by locale (ar, ar-eg, ar-sa, ar-ae)
- Bounce rate by Arabic locale

### Track Monthly:
- Arabic organic traffic growth
- Arabic keyword rankings (top 20)
- Arabic backlink acquisition
- Arabic content engagement (time on page, scroll depth)

### Critical KPI: Brand vs Non-Brand Arabic Queries

Track Arabic traffic separately for:
- **Brand:** شين آبس, SheenApps, sheenapps
- **Non-brand:** بناء تطبيق بدون كود, منشئ مواقع بالذكاء الاصطناعي, كيف أعمل تطبيق, etc.

**Non-brand growth is the real "domination" signal.** Brand queries will grow with marketing; non-brand queries grow with SEO success.

### Tools:
- Google Search Console (filter by ar, ar-eg, ar-sa, ar-ae)
- Ahrefs/SEMrush (Arabic keyword tracking)
- PageSpeed Insights (per-locale)

---

## Budget Estimates

| Phase | Task | Estimated Hours | Priority |
|-------|------|-----------------|----------|
| 1 | Arabic OG Images (with font check) | 4-6 | HIGH |
| 1 | ~~Geo-targeting~~ | ~~1~~ | ~~Skip~~ |
| 1 | Schema enhancements | 2-3 | HIGH |
| 2 | Keyword research + page map | 8-12 | CRITICAL |
| 2 | Dedicated money page (`/ar/no-code-app-builder`) | 4-6 | HIGH |
| 2 | Internal linking rules setup | 2-3 | HIGH |
| 2 | Content strategy | Ongoing | HIGH |
| 2 | Arabic landing pages (3 regional) | 12-18 | HIGH |
| 3 | Dialect optimization | 10-14 | MEDIUM |
| 4 | Mobile UX | 8-12 | HIGH |
| 4 | Core Web Vitals | 4-6 | HIGH |
| 5 | Quality link building | Ongoing | MEDIUM |
| 6 | Featured snippet/FAQ | 6-9 | MEDIUM |

**Total estimated: 60-90 hours** for full implementation

---

## Quick Reference: Arabic Locale Mapping

| Locale | Region | Dialect | Currency | Payment Methods |
|--------|--------|---------|----------|-----------------|
| ar | Generic MENA | MSA | USD | Varies |
| ar-eg | Egypt | Masri (Egyptian) | EGP | Fawry, InstaPay, Vodafone Cash |
| ar-sa | Saudi Arabia | MSA | SAR | Mada, Apple Pay, STC Pay |
| ar-ae | UAE | MSA | AED | Apple Pay, Samsung Pay, Cards |

---

## Sources

### Primary/Technical
- [Google: Supported meta tags](https://developers.google.com/search/docs/crawling-indexing/special-tags)
- [Google: Structured data documentation](https://developers.google.com/search/docs/appearance/structured-data)
- [Google: Tell Google about localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [W3Techs: Usage statistics of content languages](https://w3techs.com/technologies/overview/content_language)

### Industry/Directional
- Arabic SEO guides from regional agencies (treat stats as estimates)
- MENA startup ecosystem reports

---

## Potential Improvements Identified During Implementation

### 1. Centralize Canonical URL Generation ✅ DONE

~~**Issue:** The pattern `locale === 'en' ? '/path' : `/${locale}/path`` is duplicated across many files.~~

**Implemented:** Created `getCanonicalPath()` in `src/lib/seo/locale.ts`.

### 2. Reusable Arabic OG Image Component ✅ DONE

~~**Issue:** Each OG image file has similar font loading and RTL logic duplicated.~~

**Implemented:** Created shared utilities in `src/lib/seo/`:
- `locale.ts` - `isRtlLocale()`, `toOgLocale()`
- `og-fonts.ts` - `getOgArabicFont()`, `getOgFontConfig()`

### 3. Regional Pricing Data Source

**Issue:** Regional prices are hardcoded in landing pages. Should sync with actual pricing config.

**Suggestion:** Import pricing from `i18n/config.ts` regional multipliers and calculate dynamically.

### 4. Add Sitemap Entries for New Pages ✅ DONE

~~**Issue:** New pages (`no-code-app-builder`, `build-app-egypt`, etc.) may not be in sitemap.~~

**Implemented:** Sitemap updated with pricing, no-code-app-builder, and regional pages.

### 5. Navigation Links to Regional Pages

**Issue:** Regional landing pages exist but aren't linked from main navigation.

**Suggestion:** Consider adding regional dropdown in footer for Arabic locales, or add internal links from solutions/pricing pages.

### 6. FAQ Schema on Regional Pages ✅ DONE

~~**Issue:** Regional pages have FAQ content but no FAQ schema for rich snippets.~~

**Implemented:** Added FAQ schema to Egypt, Saudi, and UAE regional pages.

---

*This plan focuses on SheenApps' competitive edge: being the Arabic-first AI app builder for the MENA region. Prioritize substance over thin localization.*
