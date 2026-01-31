# Solution Pages Expansion Plan

## Current State Analysis

### What We Have
- **Industry + City Model**: 15+ Arabic solution pages targeting specific businesses in specific cities (e.g., "عيادة أسنان في القاهرة")
- **Infrastructure**: Robust Sanity CMS schema, static generation, SEO optimization, RTL support
- **Conversion Path**: All solutions → `/ar/builder/new` (generic builder)

### Gap Analysis
- **Missing Use Cases**: Portfolio sites, company websites, blogs, landing pages
- **No Migration Content**: Users leaving Wix, WordPress, Squarespace have no targeted content
- **Limited Reach**: Only targeting "business type in city" searches, missing broader intent

## Expansion Strategy

### 1. Website Type Solutions (Priority: HIGH)
Create solution pages for common website types that transcend industry/location:

**Portfolio & Personal Branding**
- `portfolio-designer` - للمصممين والمبدعين
- `portfolio-developer` - للمطورين والمبرمجين
- `portfolio-photographer` - للمصورين
- `personal-brand` - بناء علامتك الشخصية

**Business Websites**
- `company-website` - موقع شركة احترافي
- `startup-website` - موقع لشركتك الناشئة
- `agency-website` - موقع وكالة تسويق/تصميم
- `consultant-website` - موقع استشاري

**Content & Commerce**
- `blog-website` - مدونة احترافية
- `news-portal` - بوابة أخبار
- `online-store` - متجر إلكتروني
- `marketplace` - منصة تجارة إلكترونية

**Specialized**
- `landing-page` - صفحة هبوط للحملات
- `event-website` - موقع مؤتمر أو حدث
- `community-platform` - منصة مجتمع
- `educational-platform` - منصة تعليمية

### 2. Migration Solutions (Priority: HIGH)
Target users looking to migrate from other platforms:

**Platform Migrations**
- `migrate-from-wix` - الانتقال من Wix
- `migrate-from-wordpress` - الانتقال من WordPress
- `migrate-from-squarespace` - الانتقال من Squarespace
- `migrate-from-shopify` - الانتقال من Shopify
- `migrate-from-webflow` - الانتقال من Webflow

**Key Messaging**
- Pain points of current platform
- Migration benefits (Arabic RTL, local payments, AI features)
- Zero downtime migration process
- Cost savings comparison

### 3. Implementation Approach

#### Phase 1: Quick Wins (Week 1)
1. Create 5 high-traffic pages:
   - `company-website` (موقع شركة)
   - `online-store` (متجر إلكتروني)
   - `portfolio-website` (موقع شخصي)
   - `migrate-from-wordpress` (الانتقال من WordPress)
   - `migrate-from-wix` (الانتقال من Wix)

2. Use unified Sanity schema with discriminated union:
   - `kind` field: 'type' | 'migration' | 'industryCity'
   - Conditional fields based on kind
   - Shared content fields (features, FAQ, pricing)

#### Phase 2: Content Expansion (Week 2-3)
1. Add next priority pages:
   - `landing-page`, `blog-website`, `consultant-website`
   - `migrate-from-shopify`, `migrate-from-webflow`
2. Ensure ≥900 words unique content per page
3. Add comparison tables, screenshots, local payment mentions

#### Phase 3: Enhanced Routing (Week 3-4)
1. **Canonical URL patterns** (no duplicates):
   - `/[locale]/solutions/type/[type]` - Website types
   - `/[locale]/solutions/migrate/[platform]` - Migrations
   - `/[locale]/solutions/industry/[industry]/[city]` - Existing
   - Legacy URLs → 308 redirect to canonical

2. Update solutions index with clear sections:
   - "حسب النوع" (By Type)
   - "حسب المجال" (By Industry) 
   - "الانتقال من منصة أخرى" (Migration)

### 4. Content Structure & Templates

#### Website Type Pages (Commercial Investigation Intent)
```yaml
H1: "إنشاء [type_ar] احترافي في ٥ دقائق"
Intro: 100-140 words covering benefits + Arabic/RTL + local payments

Modules (in order):
  1. Feature grid: 3-6 features tailored to type
  2. Live examples: 2-3 cards with screenshots
  3. Mini pricing: Type-specific with currency toggle
  4. How it works: 3-4 visual steps
  5. FAQ: 4-6 questions minimum

CTAs: 
  primary: "ابدأ الآن"
  secondary: "جرّب المنشئ" 
  support: "تحدث على واتساب"

Builder Link: /ar/builder/new?preset=[type]&lang=ar
Min Content: ≥900 words unique content
```

#### Migration Pages (Replacement Intent)
```yaml
H1: "الانتقال من [platform] إلى SheenApps خلال يوم واحد"
Intro: Focus on pain points (Arabic/RTL، التكلفة، التحديثات)

Modules (in order):
  1. Comparison table: [platform] vs SheenApps
  2. Migration timeline: 0-24h visual process
  3. What we migrate: Pages, redirects, blog, products
  4. Transparent costs & time
  5. FAQ: 301s, downtime, plugins, e-commerce, rollback

CTAs:
  primary: "اطلب الهجرة اليوم"
  secondary: "تحدث مع مستشار الهجرة"

Builder Link: /ar/builder/new?preset=migrate&from=[platform]&lang=ar
Min Content: ≥900 words with comparison table
```

#### Content Quality Requirements
- Unique content per page (no duplication)
- Include RTL UI screenshots
- Mention local payment gateways by name
- Add internal links: Pricing, Builder(preset), 2-3 related solutions
- Structured data: WebPage + FAQPage (HowTo for migrations)

### 5. SEO Strategy & Keyword Separation

#### Preventing Cannibalization
- **Type pages**: Target generic build-intent ("موقع شركة"، "متجر إلكتروني")
- **Industry-city pages**: Target local business queries ("مطعم الرياض")
- **Migration pages**: Target brand + replace intent ("الانتقال من WordPress")

Each page gets unique H1, intro, features, and FAQ to avoid content overlap.

#### Target Keywords
**Website Types:**
- "إنشاء موقع portfolio"
- "بناء موقع شركة"
- "عمل متجر إلكتروني"
- "تصميم موقع شخصي"

**Migrations:**
- "بديل Wix عربي"
- "الانتقال من WordPress"
- "أفضل من Squarespace للعرب"
- "منصة بديلة لـ Shopify"

#### Canonical URL Structure
```
/ar/solutions/type/company-website
/ar/solutions/type/online-store
/ar/solutions/migrate/wordpress
/ar/solutions/industry/مطعم/الرياض (existing)
```

Legacy URLs get 308 permanent redirects to canonical paths.

### 6. Technical Implementation

#### Unified Sanity Schema (Discriminated Union)
```typescript
// Single solution document type with conditional fields
{
  kind: 'type' | 'migration' | 'industryCity' // Required discriminator
  title_ar: string // Required, 10-70 chars
  slug: string // Auto-generated from title_ar
  
  // Type-specific (hidden when kind !== 'type')
  website_type?: 'portfolio' | 'company-website' | 'online-store' | 
                 'blog-website' | 'landing-page' | 'marketplace'
  
  // Migration-specific (hidden when kind !== 'migration')
  migration_from?: 'wordpress' | 'wix' | 'squarespace' | 'shopify' | 'webflow'
  
  // Industry-City (hidden when kind !== 'industryCity')
  industry_ar?: string
  city_ar?: string
  
  // Shared fields
  subtitle_ar: string
  features_ar: string[] // Min 3
  faq_ar: {q: string, a: string}[] // Min 3
  builder_preset: string // e.g., "company", "migrate:wordpress"
  currency: 'EGP' | 'SAR' | 'AED' | 'USD'
  payment_gateways: string[]
}
```

#### Builder Deep Links & Tracking
```typescript
// Add preset parameter to builder URLs
const builderUrl = `/ar/builder/new?preset=${preset}&lang=${locale}`

// Track with GA4 events
gtag('event', 'builder_preset_click', {
  preset_type: 'company-website',
  source: 'solutions',
  locale: 'ar'
})
```

### 7. Quick Implementation Checklist

**Week 1 (Priority Launch)**
- [ ] Create unified Sanity schema with `kind` discriminator
- [ ] Generate content for 5 priority pages (≥900 words each)
- [ ] Implement canonical routing: `/type/`, `/migrate/`, `/industry/`
- [ ] Add builder preset parameters and tracking
- [ ] Update solutions index with clear categorization
- [ ] Set up 308 redirects for any legacy URLs

**Week 2-3 (Expansion)**
- [ ] Add remaining type pages (landing-page, blog-website, consultant)
- [ ] Complete migration pages (shopify, webflow)
- [ ] Create comparison table component for migrations
- [ ] Add WhatsApp CTA for Arabic markets
- [ ] Implement structured data (FAQPage, HowTo)

### 8. Success Metrics & Tracking

**Events to Track:**
- `builder_preset_click` - Which presets convert best
- `whatsapp_click_ar` - WhatsApp engagement (often higher in AR)
- `pricing_view_ar` - Pricing interest by type
- `solution_example_view` - Which examples resonate

**Week 1 Goals:**
- 5 new solution pages live with ≥900 words
- Builder presets functional
- No cannibalization with existing pages

**Month 1 Goals:**
- 15+ total new pages
- 10% increase in organic traffic
- Higher conversion rate from preset links

**Quarter 1 Goals:**
- Full migration section with comparison tools
- 25% of new signups from solution pages
- Top 3 ranking for "بديل [platform] عربي" queries

## Implementation Progress (Updated)

### ✅ Completed (Technical Foundation)
1. **Unified Sanity Schema** (`schemas/solution.ts`)
   - Discriminated union with `kind` field ('type' | 'migration' | 'industryCity')
   - Conditional field visibility based on kind
   - Support for builder presets, comparison tables, examples gallery
   - Backward compatible with existing solutionLanding schema

2. **Routing Structure**
   - `/[locale]/solutions/type/[type]/page.tsx` - Website type solutions
   - `/[locale]/solutions/migrate/[platform]/page.tsx` - Migration solutions
   - Existing `/[locale]/solutions/[slug]/page.tsx` - Industry × City solutions

3. **Solutions Index Page**
   - Tabbed navigation: "حسب النوع" | "حسب المجال" | "الانتقال من منصة أخرى"
   - Client-side rendering for interactive tab switching
   - Fetches from both old (solutionLanding) and new (solution) schemas
   - Placeholder messages for empty categories

### ✅ Complete Implementation (All Done!)
- Created and seeded 5 priority pages with rich Arabic content
- All routes tested and working (returning 200 status)
- Solution pages live and accessible

### 📝 Important Discoveries

1. **Schema Compatibility**
   - Created new `solution` schema alongside existing `solutionLanding`
   - Solutions index fetches from both schemas for backward compatibility
   - No need to migrate existing content immediately

2. **URL Encoding**
   - Arabic slugs work correctly with URL encoding/decoding
   - Fixed 404 issues for Arabic URLs in previous implementation

3. **Client-Side Tabs**
   - Converted solutions index to client component for interactive tabs
   - Better UX with instant tab switching vs page reloads

4. **Builder Presets**
   - URLs ready: `?preset=company&lang=ar` for types
   - Migration: `?preset=migrate&from=wordpress&lang=ar`

### ✅ Content Created (5 Priority Pages)

**Website Type Solutions:**
1. **Company Website** (`/ar/solutions/type/company-website`)
   - 6 features, 5 FAQs, builder preset: `company`
   - Price range: 999-4999 EGP
   - Target: Startups, consulting firms, law offices

2. **Online Store** (`/ar/solutions/type/online-store`)
   - 8 features, 6 FAQs, builder preset: `ecommerce`
   - Price range: 1499-9999 EGP
   - Full payment gateway integration

3. **Portfolio** (`/ar/solutions/type/portfolio`)
   - 6 features, 4 FAQs, builder preset: `portfolio`
   - Price range: 499-1999 EGP
   - Target: Designers, developers, photographers

**Migration Solutions:**
4. **WordPress Migration** (`/ar/solutions/migrate/wordpress`)
   - 8 features, 6 FAQs, comparison table
   - Price range: 1999-9999 EGP
   - Zero downtime migration promise

5. **Wix Migration** (`/ar/solutions/migrate/wix`)
   - 8 features, 6 FAQs, comparison table
   - Price range: 1499-4999 EGP
   - 40% cost savings emphasis

### 🎯 Achieved Goals
- ✅ Each page has >900 words of unique Arabic content
- ✅ Builder presets configured for conversion tracking
- ✅ Comparison tables for migration pages
- ✅ Local payment gateways featured (Fawry, Paymob, etc.)
- ✅ WhatsApp CTAs included
- ✅ SEO metadata and structured data ready

### 🚀 Next Steps
1. **Monitor Performance**
   - Track organic traffic growth
   - Monitor conversion rates from preset links
   - A/B test CTAs

2. **Expand Content**
   - Add remaining website types (blog, landing-page, etc.)
   - Create more migration pages (Shopify, Squarespace, Webflow)
   - Add industry×city solutions for new markets

3. **Optimize Based on Data**
   - Analyze which pages convert best
   - Refine content based on user feedback
   - Improve internal linking structure

## Implementation Notes

### What I Like from Expert Feedback (Incorporated)
✅ **Canonical URL structure** - Cleaner, prevents duplicates
✅ **Builder presets** - Smart conversion optimization
✅ **Content quality floor** (≥900 words) - Avoids thin content penalties
✅ **Discriminated union schema** - More maintainable than separate types
✅ **WhatsApp CTAs** - Critical for Arabic market conversion
✅ **Clear keyword separation** - Prevents cannibalization

### What I'm Keeping Simple (Not Overengineering)
❌ **Complex structured data** - Starting with FAQ, adding HowTo later if needed
❌ **Extensive A/B testing setup** - Focus on shipping first, optimize later
❌ **Full Sanity schema rewrite** - Extending existing schema incrementally
❌ **Immediate sitemap updates** - Will update after pages are live and tested

## Next Steps

1. **Today**: Start creating content in Sanity (5 priority pages)
2. **Tomorrow**: Implement routing changes and builder presets
3. **This Week**: Launch first 5 pages and monitor performance
4. **Next Week**: Expand based on initial data and feedback

---

*This plan balances expert SEO recommendations with practical implementation speed. Focus is on shipping quality content quickly while maintaining clean architecture.*