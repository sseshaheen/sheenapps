# SheenApps SEO Analysis Report

**Date:** January 2026
**Prepared for:** External SEO Expert Review
**Subject:** Comprehensive SEO audit of SheenApps web application
**Version:** 2.1 (Final refinements)

---

## Executive Summary

SheenApps is a multilingual web application with a **Next.js 15 frontend** and **Fastify 5 backend**. The application targets users across multiple regions with full support for **9 locales** including Arabic (RTL), French, Spanish, and German.

### Overall SEO Health Score: **B+ (Good)**

| Category | Score | Status |
|----------|-------|--------|
| Internationalization (i18n) | A+ | Outstanding |
| Metadata & Tags | A | Excellent |
| URL Structure | A | Excellent |
| Sitemap | A | Excellent |
| Structured Data | B | Good (underutilized on key pages) |
| Rendering Strategy | B | Good (homepage dynamic tradeoff) |
| Performance/Core Web Vitals | A- | Very Good |
| Robots Configuration | B- | **Has source-of-truth conflict** |

---

## Table of Contents

1. [Application Architecture](#1-application-architecture)
2. [Current SEO Implementation](#2-current-seo-implementation)
3. [Internationalization (i18n)](#3-internationalization-i18n)
4. [Technical SEO Configuration](#4-technical-seo-configuration)
5. [Rendering Strategy](#5-rendering-strategy)
6. [Structured Data](#6-structured-data)
7. [Performance & Core Web Vitals](#7-performance--core-web-vitals)
8. [Backend SEO Considerations](#8-backend-seo-considerations)
9. [Issues & Gaps Identified](#9-issues--gaps-identified)
10. [Prioritized Recommendations](#10-prioritized-recommendations)
11. [SEO Observability](#11-seo-observability)
12. [SEO Expert Review Checklist](#12-seo-expert-review-checklist)

---

## 1. Application Architecture

### Frontend Stack
- **Framework:** Next.js 15 (App Router)
- **Directory:** `/sheenappsai`
- **Deployment:** Vercel
- **CMS:** Sanity (for blog/careers content)

### Backend Stack
- **Framework:** Fastify 5.4.0
- **Directory:** `/sheenapps-claude-worker`
- **Database:** PostgreSQL (via Supabase)
- **Real-time:** Server-Sent Events (SSE)

### URL Architecture
```
Production Domain: https://www.sheenapps.com

Frontend Routes:
├── /                          # English homepage (canonical)
├── /{locale}/                 # Localized homepages
├── /{locale}/blog/[slug]      # Blog posts (ISR)
├── /{locale}/careers/[slug]   # Job listings
├── /{locale}/solutions/[slug] # Solution pages (ISR)
├── /{locale}/advisor/         # Advisor network
├── /{locale}/builder/         # App builder (auth required)
└── /{locale}/dashboard/       # User dashboard (auth required)

Backend API Routes:
├── /api/careers/jobs          # Public job listings
├── /api/careers/jobs/:slug    # Job details + JSON-LD
├── /api/careers/sitemap       # Career sitemap (JSON, internal use)
└── /v1/*                      # Authenticated endpoints
```

---

## 2. Current SEO Implementation

### 2.1 Metadata Configuration

**Location:** `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`

#### Root Layout Metadata
```typescript
export const metadata: Metadata = {
  title: 'SheenApps - Your Tech Team',
  description: 'Your Tech Team', // ⚠️ Too short - needs expansion
  keywords: [
    'app builder', 'no-code', 'startup', 'tech team',
    'AI builder', 'business apps', 'SheenApps',
    'no-code platform', 'AI app builder'
  ],
  metadataBase: new URL('https://www.sheenapps.com'),
  authors: [{ name: 'SheenApps' }],
  creator: 'SheenApps',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}
```

#### Open Graph Tags
```typescript
openGraph: {
  type: 'website',
  locale: 'en_US',
  siteName: 'SheenApps',
  images: [{ url: '/og-image.png', width: 1536, height: 1024 }],
}
```

#### Twitter Cards
```typescript
twitter: {
  card: 'summary_large_image',
  creator: '@sheenapps',
}
```

### 2.2 Dynamic Metadata Generation

**Blog Posts:** `src/app/[locale]/blog/[slug]/page.tsx`
- Pulls `metaTitle`, `metaDescription`, `openGraphImage` from Sanity
- Implements hreflang alternates from translation relationships
- Handles `noIndex` for draft posts

**Career Pages:** `src/app/[locale]/careers/[slug]/page.tsx`
- Dynamic metadata from API
- JSON-LD JobPosting schema injection
- HTML stripping for meta descriptions (160 char limit)

**Solution Pages:** `src/app/[locale]/solutions/[slug]/page.tsx`
- ISR with 1-hour revalidation
- Pre-builds top 20 solution slugs

---

## 3. Internationalization (i18n)

### 3.1 Locale Support

**Supported Locales (9 total):**
| Code | Language | Region | Status |
|------|----------|--------|--------|
| `en` | English | Global | Canonical (root `/`) |
| `ar` | Arabic | Generic | RTL |
| `ar-eg` | Arabic | Egypt | RTL |
| `ar-sa` | Arabic | Saudi Arabia | RTL |
| `ar-ae` | Arabic | UAE | RTL |
| `fr` | French | Global | LTR |
| `fr-ma` | French | Morocco | **301 → `/fr/`** |
| `es` | Spanish | Global | LTR |
| `de` | German | Global | LTR |

### 3.2 URL Canonicalization Strategy

```
English (canonical):  https://www.sheenapps.com/
Arabic:               https://www.sheenapps.com/ar/
Arabic (Egypt):       https://www.sheenapps.com/ar-eg/
French:               https://www.sheenapps.com/fr/
Spanish:              https://www.sheenapps.com/es/
German:               https://www.sheenapps.com/de/
```

**Redirects Configured:**
- `sheenapps.com` → `www.sheenapps.com` (301)
- `/en/*` → `/*` (301) - English uses root
- `/fr-ma/*` → `/fr/*` (301) - Morocco consolidated
- Canonical trailing slash policy enforced via redirects (consistent across sitemap/canonicals)

### 3.3 hreflang Implementation

**Location:** `src/utils/i18n-seo.ts`

```typescript
// BCP-47 formatting utility
toBCP47('ar-eg') → 'ar-EG'
toBCP47('ar-sa') → 'ar-SA'

// Alternate links generated for all locales
alternates: {
  languages: {
    'en': 'https://www.sheenapps.com/',
    'ar-EG': 'https://www.sheenapps.com/ar-eg/',
    'ar-SA': 'https://www.sheenapps.com/ar-sa/',
    'x-default': 'https://www.sheenapps.com/',
  }
}
```

### 3.4 RTL Support

**RTL Locales:** `['ar', 'ar-eg', 'ar-sa', 'ar-ae']`

```html
<html lang="ar-EG" dir="rtl">
```

**Backend Content-Language Header:**
```http
Content-Language: ar-EG
Vary: x-sheen-locale, Accept-Language
```

---

## 4. Technical SEO Configuration

### 4.1 Sitemap

**Location:** `src/app/sitemap.ts`

**Type:** Dynamic TypeScript (generates at runtime)

**Structure:**
```typescript
// Static pages with priorities
{ url: '/', priority: 1.0, changeFrequency: 'weekly' }
{ url: '/advisors', priority: 0.9, changeFrequency: 'weekly' }
{ url: '/blog', priority: 0.8, changeFrequency: 'daily' }
{ url: '/careers', priority: 0.7, changeFrequency: 'weekly' }
{ url: '/about', priority: 0.6, changeFrequency: 'monthly' }
{ url: '/help', priority: 0.5, changeFrequency: 'monthly' }
{ url: '/terms', priority: 0.3, changeFrequency: 'yearly' }
{ url: '/privacy', priority: 0.3, changeFrequency: 'yearly' }

// Dynamic content from Sanity
- Blog posts with lastModified dates
- Career pages with hreflang alternates
- Locale-prefixed variants for all locales
```

**Features:**
- lastmod timestamps from CMS
- hreflang alternates on dynamic content
- Proper locale handling (excludes `en` and `fr-ma`)
- Arabic slug URI encoding handled

### 4.2 Robots Configuration

#### **CRITICAL ISSUE: Source-of-Truth Conflict**

You have **two robots files** that conflict:

| File | Purpose | What's in it |
|------|---------|--------------|
| `src/app/robots.ts` | Dynamic (Next.js Metadata API) | Basic rules only |
| `public/robots.txt` | Static file | AI crawler rules, aggressive bot blocking, crawl-delay |

**The Problem:** This is likely being served from `robots.ts` (App Router metadata route). **Verify `/robots.txt` response in production** — if it matches `robots.ts` output, then `public/robots.txt` is effectively unused.

**What crawlers currently see** (from `robots.ts`):
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /_next/
Disallow: /admin/
Disallow: /studio/
Disallow: /drafts/

Sitemap: https://www.sheenapps.com/sitemap.xml
Host: https://www.sheenapps.com
```

**What you probably want** (from `public/robots.txt`):
```
# AI/LLM Crawlers - ALLOWED
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

# Aggressive SEO Crawlers - BLOCKED
User-agent: AhrefsBot
Disallow: /

User-agent: SemrushBot
Disallow: /

# General rules
User-agent: *
Disallow: /api/
Disallow: /admin/
Disallow: /dashboard/

Sitemap: https://www.sheenapps.com/sitemap.xml
```

**Recommended Fix:** Choose one source of truth:
- **Option A (Recommended):** Delete `public/robots.txt` and move all rules into `robots.ts`
- **Option B:** Delete `robots.ts` and keep static `public/robots.txt`

**Note on `Crawl-delay`:** Currently in `public/robots.txt` but not being served. Google ignores crawl-delay anyway, and other crawlers inconsistently respect it. Recommend removing unless you've observed actual crawl pressure.

### 4.3 Domain Configuration

**Primary Domain:** `www.sheenapps.com`
- Non-www redirects to www (301)
- HTTPS enforced
- `metadataBase` correctly set

---

## 5. Rendering Strategy

### 5.1 Current Configuration

| Route Type | Rendering | Caching |
|------------|-----------|---------|
| Homepage (`/[locale]/page.tsx`) | `force-dynamic` | None |
| Blog posts | ISR | 1 hour (`revalidate: 3600`) |
| Solution pages | ISR | 1 hour |
| Career pages | Dynamic | None |
| Auth pages | `force-dynamic` | None |
| Dashboard/Builder | `force-dynamic` | None |
| Layout (`[locale]/layout.tsx`) | `force-dynamic` | None |

### 5.2 Static Params Generation

```typescript
// Blog: Pre-builds top 20 posts
export async function generateStaticParams() {
  const posts = await getTopPosts(20);
  return posts.map(post => ({ slug: post.slug }));
}

// Solutions: Pre-builds top 20 slugs
// Locales: All 9 locales pre-built
```

### 5.3 SEO Implications

**Homepage uses `force-dynamic`:**
- Every request generates fresh HTML
- May impact TTFB if not cached at CDN/edge
- Acceptable if personalization/auth is required on homepage
- Verify via PageSpeed Insights whether this affects Core Web Vitals

**Blog/Solutions use ISR:**
- Static at build time, revalidated hourly
- Excellent for SEO (fast, cacheable)
- New content appears within 1 hour

---

## 6. Structured Data

### 6.1 Available Schema Types

**Location:** `src/lib/structured-data.ts`

| Schema Type | Status | Priority for Implementation |
|-------------|--------|----------------------------|
| `Organization` | Available | **HIGH** - Homepage |
| `SoftwareApplication` | Available | **HIGH** - Homepage + Solutions |
| `BreadcrumbList` | Available | **HIGH** - All content pages |
| `Article` | Not yet | **MEDIUM** - Blog posts |
| `JobPosting` | **Implemented** | Done |
| `FAQPage` | Available | LOW - Only if FAQs exist |
| `HowTo` | Available | LOW - Tutorial pages |
| `LocalBusiness` | Available | LOW - If physical presence |
| `Product` | Available | LOW - If selling products |

### 6.2 JobPosting Schema (Implemented)

**Location:** `src/app/[locale]/careers/[slug]/page.tsx`

```json
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "Senior Developer",
  "description": "...",
  "datePosted": "2026-01-15",
  "validThrough": "2026-03-15",
  "employmentType": "FULL_TIME",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "SheenApps"
  },
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "UAE"
    }
  }
}
```

### 6.3 Recommended Schema Additions

**Homepage - Organization:**
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "SheenApps",
  "url": "https://www.sheenapps.com",
  "logo": "https://www.sheenapps.com/logo.png",
  "sameAs": [
    "https://twitter.com/sheenapps",
    "https://linkedin.com/company/sheenapps"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "availableLanguage": ["English", "Arabic", "French", "Spanish", "German"]
  }
}
```

**Homepage + Solutions - SoftwareApplication:**
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "SheenApps",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web"
}
```
*Note: Add `offers` with pricing only if you have a clear free tier or pricing model to communicate.*

**All Content Pages - BreadcrumbList:**
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.sheenapps.com" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.sheenapps.com/blog" },
    { "@type": "ListItem", "position": 3, "name": "Article Title" }
  ]
}
```

---

## 7. Performance & Core Web Vitals

### 7.1 Image Optimization

**Configuration:** `next.config.ts`
```typescript
images: {
  remotePatterns: [{ protocol: 'https', hostname: '**' }],
}

// Cache headers for images
'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400'
// (1 week with 1 day stale-while-revalidate)
```

### 7.2 Font Optimization

**Location:** `src/app/[locale]/layout.tsx`

```typescript
import { Geist, Geist_Mono } from 'next/font/google';

// Latin fonts - preloaded
const geistSans = Geist({
  preload: true,
  display: 'swap',
  fallback: ['system-ui', 'arial'],
});

// Arabic fonts - conditional preload
const cairo = Cairo({
  preload: false, // Only loads for Arabic locales
  subsets: ['arabic'],
});
```

### 7.3 Cache Headers

| Resource Type | Cache Duration | Strategy |
|---------------|----------------|----------|
| Static assets (`/static/*`) | 1 year | Immutable |
| Built assets (`/_next/static/*`) | 1 year | Immutable |
| Images | 1 week | Stale-while-revalidate (1 day) |
| HTML pages | 1 hour | Stale-while-revalidate (1 day) |
| API responses | 5 minutes | Stale-while-revalidate (60s) |
| Admin/Auth | No cache | `no-store, no-cache` |

### 7.4 Compression

**Note:** Verify compression at both edge and origin:
- **Vercel Edge:** Automatically compresses responses (gzip/brotli)
- **Backend (Fastify):** No `@fastify/compress` plugin registered

Since you're on Vercel, compression is likely handled at the edge for frontend responses. For direct backend API calls, consider adding compression if not proxied through Vercel.

**SSE endpoints:** Compression should NOT be applied to streaming endpoints. Verify streaming responses aren't being compressed by proxy/CDN.

### 7.5 Security Headers

- `X-DNS-Prefetch-Control: on`
- `X-XSS-Protection: 1; mode=block`
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: origin-when-cross-origin`

---

## 8. Backend SEO Considerations

### 8.1 Content-Language Headers

**Location:** `src/plugins/i18n.ts`

```http
Content-Language: ar-EG
Vary: x-sheen-locale, Accept-Language
```

### 8.2 Career Portal API

| Endpoint | Purpose | SEO Role |
|----------|---------|----------|
| `GET /api/careers/jobs` | Job listings | Provides data for frontend |
| `GET /api/careers/jobs/:slug` | Job details | **Provides JSON-LD structured data** |
| `GET /api/careers/sitemap` | Sitemap data | **Internal feed** (consumed by Next.js sitemap) |

**Note:** The backend `/api/careers/sitemap` returns JSON, which is appropriate since it's an internal API consumed by the Next.js sitemap generator (`CareersApiClient.getSitemapData()`). The actual crawler-facing sitemap is `https://www.sheenapps.com/sitemap.xml` generated by Next.js.

### 8.3 Rate Limiting

**Global limit:** 800 calls/hour

**Recommendation:** Ensure rate limits are crawler-friendly:
- Don't serve different content to bots (that's cloaking)
- Simply relax limits to avoid accidentally blocking legitimate crawlers
- Monitor for 429 responses in logs

---

## 9. Issues & Gaps Identified

### 9.1 High Priority Issues

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 1 | **robots.ts vs robots.txt conflict** | AI crawler rules not being served | Both files exist |
| 2 | **Meta description too short** | Poor CTR in search results | `layout.tsx` |
| 3 | **Missing Organization schema** | No brand knowledge panel | Homepage |
| 4 | **Missing SoftwareApplication schema** | No product rich results | Homepage/Solutions |
| 5 | **Canonical/hreflang needs verification** | Potential ranking loss | All locale pages |

### 9.2 Medium Priority Issues

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 6 | **OG image is static** | Generic social previews | Single `og-image.png` |
| 7 | **No BreadcrumbList schema** | No navigation snippets | Content pages |
| 8 | **No Article schema on blog** | No article rich results | Blog pages |
| 9 | **Verification tags commented out** | Can't access Search Console | `layout.tsx:73-79` |

### 9.3 Low Priority Issues

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 10 | **Missing web app manifest** | PWA/UX (not SEO critical) | `/public/manifest.json` |
| 11 | **Limited generateStaticParams** | Only top 20 pre-built | Blog/Solutions |
| 12 | **Crawl-delay in static robots.txt** | Not being served anyway | `public/robots.txt` |

---

## 10. Prioritized Recommendations

### Priority 1: True SEO Impact (Do This Week)

#### 1.1 Fix robots.txt Source-of-Truth
**Action:** Consolidate into one file

```typescript
// src/app/robots.ts - Updated with all rules
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.sheenapps.com'

  return {
    rules: [
      // AI/LLM Crawlers - Allow
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' },

      // Aggressive crawlers - Block
      { userAgent: 'AhrefsBot', disallow: '/' },
      { userAgent: 'MJ12bot', disallow: '/' },
      { userAgent: 'SemrushBot', disallow: '/' },
      { userAgent: 'BLEXBot', disallow: '/' },

      // General rules
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/_next/', '/admin/', '/studio/', '/drafts/', '/dashboard/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
```

Then **delete** `public/robots.txt`.

#### 1.2 Fix Homepage Meta Description
```typescript
// Current
description: 'Your Tech Team'

// Recommended (155 characters, keyword-rich, compelling)
description: 'Build powerful business apps without code. SheenApps AI platform helps startups and enterprises launch faster with no-code tools and expert tech support.'
```

#### 1.3 Verify Canonicals & hreflang (Critical for Multilingual)

**Manual verification checklist:**
- [ ] Every localized page has a self-referential canonical to its own URL
- [ ] hreflang alternates are reciprocal (A → B and B → A)
- [ ] `fr-ma` does NOT appear in hreflang (it redirects to `/fr/`)
- [ ] Trailing slashes are consistent: redirects, canonicals, sitemap URLs
- [ ] x-default points to root canonical

**Tool:** Use [hreflang Tags Testing Tool](https://technicalseo.com/tools/hreflang/) or Screaming Frog.

#### 1.4 Add Organization + SoftwareApplication Schema to Homepage

```typescript
// src/app/[locale]/page.tsx or via layout
const schemas = {
  organization: {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "SheenApps",
    "url": "https://www.sheenapps.com",
    "logo": "https://www.sheenapps.com/logo.png",
    "sameAs": ["https://twitter.com/sheenapps"]
  },
  software: {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "SheenApps",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web"
  }
}
```

#### 1.5 Enable Search Console Verification
```typescript
// Uncomment and fill in layout.tsx
verification: {
  google: 'YOUR_GOOGLE_VERIFICATION_CODE',
  yandex: 'YOUR_YANDEX_CODE',
  other: {
    'msvalidate.01': 'YOUR_BING_CODE',
  },
}
```

### Priority 2: Important (This Sprint)

#### 2.1 Dynamic OG Images for Blog
```typescript
// src/app/[locale]/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';

export default async function Image({ params }) {
  const post = await getPost(params.slug);
  return new ImageResponse(
    <div style={{ /* Dynamic design */ }}>
      <h1>{post.title}</h1>
    </div>,
    { width: 1200, height: 630 }
  );
}
```

#### 2.2 Add BreadcrumbList Schema
Implement on blog, careers, solutions pages.

#### 2.3 Add Article Schema to Blog Posts
```typescript
const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": post.title,
  "image": post.mainImage,
  "datePublished": post.publishedAt,
  "dateModified": post.updatedAt,
  "author": { "@type": "Person", "name": post.author.name },
  "publisher": {
    "@type": "Organization",
    "name": "SheenApps",
    "logo": { "@type": "ImageObject", "url": "https://www.sheenapps.com/logo.png" }
  }
}
```

### Priority 3: Backlog

- Add web app manifest (PWA/UX, not SEO critical)
- Implement FAQ schema (only where real FAQs exist)
- Increase `generateStaticParams` limit (only if crawl latency is an issue)
- Review 410 vs 404 handling for removed content slugs

---

## 11. SEO Observability

Since you're an engineering team, build SEO health into your monitoring:

### 11.1 Log & Track

| Metric | How to Track | Why |
|--------|--------------|-----|
| Bot traffic | Log User-Agent, anonymize IPs | Understand crawl patterns |
| Response codes by locale | Application logs | Catch soft-404s, errors |
| Sitemap fetch success | Monitor `/sitemap.xml` requests | Ensure crawlers can access |
| Crawl errors | Google Search Console API | Early warning system |

### 11.2 Alerts to Set Up

- **5xx on locale routes** → Something's broken for a region
- **Sudden drop in indexed pages** → Accidental noindex or robots change
- **Canonical mismatches** → Tools like Screaming Frog scheduled crawls
- **404 spike by locale** → Content migration issue

### 11.3 Dashboards

Create a simple dashboard tracking:
- % of pages indexed (per locale)
- Canonical consistency score
- Core Web Vitals by locale
- Crawl budget usage (pages crawled/day)

---

## 12. SEO Expert Review Checklist

### For External Expert Validation

#### Technical SEO
- [ ] Verify `https://www.sheenapps.com/robots.txt` serves expected rules
- [ ] Validate sitemap at `https://www.sheenapps.com/sitemap.xml`
- [ ] Check hreflang with [hreflang testing tool](https://technicalseo.com/tools/hreflang/)
- [ ] Verify canonical URLs across all 9 locales
- [ ] Test mobile-friendliness (Google Mobile-Friendly Test)
- [ ] Run PageSpeed Insights for each locale's homepage

#### Structured Data
- [ ] Validate JSON-LD on career pages (Google Rich Results Test)
- [ ] Review which schemas would benefit the business
- [ ] Check for schema warnings in Search Console

#### Internationalization
- [ ] Verify hreflang reciprocal links
- [ ] Confirm x-default implementation
- [ ] Check `fr-ma` doesn't appear in hreflang (should redirect)
- [ ] Assess Arabic content quality (cultural relevance, not just translation)

#### Indexation
- [ ] Review Google Search Console coverage report
- [ ] Check for index bloat (auth pages indexed?)
- [ ] Verify important pages are indexed
- [ ] Check for soft 404s

#### Content
- [ ] Review meta title/description strategy per page type
- [ ] Analyze keyword targeting for each locale
- [ ] Check content uniqueness (not just machine-translated)
- [ ] Review internal linking structure

---

## Appendix A: File Reference

| File | Purpose |
|------|---------|
| `sheenappsai/src/app/layout.tsx` | Root metadata configuration |
| `sheenappsai/src/app/[locale]/layout.tsx` | Locale-specific metadata, i18n |
| `sheenappsai/src/app/sitemap.ts` | Dynamic sitemap generation |
| `sheenappsai/src/app/robots.ts` | Programmatic robots config |
| `sheenappsai/public/robots.txt` | **Static robots (currently ignored!)** |
| `sheenappsai/src/lib/structured-data.ts` | Schema.org helpers |
| `sheenappsai/src/utils/i18n-seo.ts` | hreflang utilities |
| `sheenappsai/src/components/seo/CanonicalHead.tsx` | Canonical URL component |
| `sheenappsai/next.config.ts` | Performance, redirects, headers |
| `sheenapps-claude-worker/src/routes/careers.ts` | Career API with JSON-LD |
| `sheenapps-claude-worker/src/plugins/i18n.ts` | Content-Language headers |
| `sheenapps-claude-worker/src/lib/api/careers-api-client.ts` | Consumes backend sitemap |

---

## Appendix B: Testing URLs

```
# Homepage variants
https://www.sheenapps.com/
https://www.sheenapps.com/ar/
https://www.sheenapps.com/ar-eg/
https://www.sheenapps.com/fr/

# Technical files
https://www.sheenapps.com/sitemap.xml
https://www.sheenapps.com/robots.txt

# Sample content pages
https://www.sheenapps.com/blog
https://www.sheenapps.com/careers
https://www.sheenapps.com/about

# Rich results testing
https://search.google.com/test/rich-results?url=YOUR_CAREER_PAGE_URL
```

---

## Appendix C: Changes from v1.0

### v2.0 Changes
| Change | Reason |
|--------|--------|
| Downgraded manifest from "Critical" to "Backlog" | Not SEO-impacting; it's PWA/UX |
| Added robots.txt conflict as Priority 1 | Real bug: dynamic robots.ts shadows static file |
| Removed SearchAction schema recommendation | No public search feature exists |
| Elevated canonical/hreflang verification | Where multilingual sites actually lose rankings |
| Reframed backend sitemap as "internal feed" | It's consumed by Next.js, not crawlers |
| Added SEO Observability section | Engineering teams benefit from monitoring |
| Removed crawl-delay recommendation | Google ignores it; provides little benefit |
| Clarified compression situation | Edge handles it; backend-only if direct calls |

### v2.1 Changes
| Change | Reason |
|--------|--------|
| Softened robots precedence claim | Added "verify in production" — avoids hard claim if routing differs |
| Made disallow list consistent | Keep `/api/` blocked (not just `/api/auth/`) — APIs aren't for indexing |
| Reworded trailing slash mention | Clearer: "policy enforced via redirects" vs "removed" |
| Softened SSE compression note | Changed to "verify" — don't claim correctness without prod check |
| Removed Offer from SoftwareApplication | Avoid misleading structured data if pricing model unclear |

---

## Implementation Progress

**Last Updated:** January 2026

### Completed Tasks

| Task | Status | Notes |
|------|--------|-------|
| **1.1 Fix robots.txt source-of-truth** | ✅ Completed | Consolidated all rules into `robots.ts`, deleted `public/robots.txt`. Added AI crawler allowlist (GPTBot, ClaudeBot, Google-Extended, Amazonbot) and aggressive bot blocklist. |
| **1.2 Fix homepage meta description** | ✅ Already Good | Discovery: Current description is already comprehensive: "Build your business in 5 minutes. Add features in minutes. Real humans on standby. We're not just a builder, we're your permanent tech department." (Not "Your Tech Team" as initially reported) |
| **1.3 Verify canonicals & hreflang** | ✅ Fixed | Fixed multiple issues: (1) English canonical now uses root `/` not `/en/`, (2) Removed `fr-ma` from hreflang (it redirects to `/fr/`), (3) Added `x-default` pointing to English canonical, (4) Fixed BCP-47 formatting for locale keys |
| **1.4 Add Organization + SoftwareApplication schema** | ✅ Completed | Added to homepage via `MultiStructuredData` component. Includes social links, contact point, and feature list. |
| **1.5 Search Console verification** | ✅ Prepared | Added env var placeholders for Google, Bing, and Yandex verification codes. User needs to add actual codes. |
| **2.1 Dynamic OG images for blog** | ✅ Completed | Created `opengraph-image.tsx` with dynamic generation. Includes title, author, category, reading time. Supports RTL for Arabic. |
| **2.2 BreadcrumbList schema** | ✅ Completed | Added to blog posts, careers pages, and solutions pages. |
| **2.3 Article/BlogPosting schema** | ✅ Already Good | Blog posts already have comprehensive `BlogPosting` schema with author, publisher, datePublished, keywords, readingTime. |

### Files Modified

```
sheenappsai/src/app/robots.ts                    # Consolidated robots rules
sheenappsai/public/robots.txt                     # DELETED (was conflicting)
sheenappsai/src/app/layout.tsx                    # Added verification placeholders
sheenappsai/src/app/[locale]/layout.tsx           # Fixed hreflang, removed fr-ma
sheenappsai/src/app/[locale]/page.tsx             # Added Organization + SoftwareApplication schemas
sheenappsai/src/app/[locale]/blog/page.tsx        # Fixed hreflang, English at root
sheenappsai/src/app/[locale]/blog/[slug]/page.tsx # Fixed canonicals, added BreadcrumbList
sheenappsai/src/app/[locale]/blog/[slug]/opengraph-image.tsx  # NEW: Dynamic OG images
sheenappsai/src/app/[locale]/pricing/page.tsx     # Fixed canonical for English
sheenappsai/src/app/[locale]/solutions/[slug]/page.tsx        # Fixed canonical for English
sheenappsai/src/app/[locale]/solutions/migrate/[platform]/page.tsx  # Fixed canonical
sheenappsai/src/app/[locale]/solutions/type/[type]/page.tsx   # Fixed canonical
sheenappsai/src/app/[locale]/careers/[slug]/page.tsx          # Added BreadcrumbList
sheenappsai/src/lib/structured-data.ts            # Added new schema generators
sheenappsai/src/components/seo/StructuredData.tsx # NEW: Reusable structured data component
```

### Discoveries During Implementation

1. **Meta description was already good** — The report incorrectly stated it was "Your Tech Team". The actual implementation has a comprehensive 155-character description.

2. **Multiple canonical/hreflang bugs found:**
   - English locale was using `/en/...` instead of root `/...`
   - `fr-ma` was included in hreflang despite redirecting to `/fr/`
   - `en-XA` (dev pseudo-locale) was included in hreflang
   - Blog post x-default was pointing to `/blog` instead of the English version of the specific post

3. **Blog already had good structured data** — `BlogPosting` schema was already comprehensive with author, publisher, keywords, readingTime.

### Remaining Tasks

| Task | Priority | Status |
|------|----------|--------|
| Add verification codes to env vars | P1 | User action required |
| Verify production robots.txt output | P1 | Manual verification needed |
| Run hreflang validation tool | P1 | Manual verification needed |

### Arabic SEO Quick Wins (Implemented)

| Task | Status |
|------|--------|
| Arabic metadata for About page | ✅ Completed |
| Arabic metadata for Pricing page (with local currency) | ✅ Completed |
| Arabic metadata for Careers page | ✅ Completed |
| Arabic keywords for all Arabic locales | ✅ Completed |
| Arabic feature list in structured data | ✅ Completed |
| Egyptian colloquial (Masri) differentiation | ✅ Completed |

**Full Arabic SEO plan:** See `ARABIC_SEO_PLAN.md` for comprehensive strategy.

### Environment Variables to Add

```bash
# Search Console Verification (add to .env.local and production)
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=your-google-code
NEXT_PUBLIC_BING_VERIFICATION=your-bing-code
NEXT_PUBLIC_YANDEX_VERIFICATION=your-yandex-code
```

---

## Improvement Ideas (Discovered During Implementation)

This section captures ideas for future SEO improvements discovered during implementation.

### 1. Create a centralized SEO config

Currently, canonical URL logic (`locale === 'en' ? '/' : `/${locale}/``) is duplicated across many files. Consider creating:

```typescript
// src/lib/seo-config.ts
export function getCanonicalPath(path: string, locale: string): string {
  return locale === 'en' ? path : `/${locale}${path}`
}

export const SEO_LOCALES = ['en', 'ar-eg', 'ar-sa', 'ar-ae', 'ar', 'fr', 'es', 'de'] as const
// Excludes: fr-ma (redirects), en-XA (dev only)
```

### 2. Automated hreflang validation

Add a build-time or CI check that validates:
- All hreflang alternates are reciprocal
- No `fr-ma` appears in hreflang
- x-default is always present
- BCP-47 formatting is correct

### 3. Sitemap validation script

Create a script that:
- Fetches `/sitemap.xml` in production
- Validates all URLs return 200
- Checks for canonical consistency
- Alerts on new 404s

---

*This report was generated through comprehensive code analysis of both frontend (Next.js) and backend (Fastify) applications, refined with expert feedback to ensure accuracy and avoid overclaiming.*
