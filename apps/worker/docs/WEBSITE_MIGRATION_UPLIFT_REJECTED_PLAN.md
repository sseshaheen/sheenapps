# Website Migration & Uplift Platform Feature Plan


## IMPORTANT: This plan's approach has been rejected. It has been replaced with WEBSITE_MIGRATION_TOOL_IMPLEMENTATION_PLAN.md

## Executive Summary

This document outlines a comprehensive platform feature for automatically migrating and modernizing existing websites to modern tech stacks. The system analyzes, transforms, and uplifts legacy websites into maintainable, scalable projects that users can continue building on our platform.

## Core Objectives

1. **Automated Analysis**: Crawl and analyze existing websites to understand structure, content, and technologies
2. **Intelligent Transformation**: Convert legacy code to modern frameworks and best practices
3. **Seamless Integration**: Deploy modernized projects directly to our platform
4. **Continuous Development**: Enable users to keep building and adding features post-migration

## Technical Architecture

### Phase 1: Discovery & Analysis

#### Website Crawler Module
- **Primary Tool**: Custom crawler built on Crawlee (Node.js/Python)
- **Capabilities**:
  - Full site crawling with JavaScript rendering via Puppeteer/Playwright
  - Asset extraction (images, CSS, JS, fonts, media)
  - Content structure analysis
  - Technology detection (Wappalyzer integration + local CMS markers)
  - SEO metadata extraction
  - API endpoint discovery via network trace (XHR/fetch recording)
  - Anti-bot detection (Cloudflare, auth walls) with graceful abort

#### Ownership Verification & Legal Requirements
- **Legal Consent**: User must check "I own or have rights to migrate this site" before ANALYZE
- **Verification Methods**:
  - DNS TXT record: `_sheenapps-verify=<token>`
  - File upload: `/.well-known/sheenapps-verify.txt`
- **Time-boxed validity**: 24 hours for security
- **Backend enforcement**: No UI bypass allowed

#### Crawl Configuration & Safety
```json
{
  "maxPages": 200,
  "maxDepth": 5,
  "concurrency": 4,
  "renderJS": true,
  "delayMs": 250,
  "respectRobots": true,
  "allowedHosts": ["example.com", "www.example.com"],
  "sameOriginOnly": true,
  "blockPrivateNetworks": true,
  "deniedIPs": ["10.0.0.0/8", "127.0.0.0/8", "169.254.0.0/16", "::/128"],
  "adaptiveRendering": true  // Only render JS if empty body detected
}
```

#### SSRF & Network Security
- **IP Blocking**: Deny private/loopback ranges (10.x, 127.x, 169.254.x)
- **DNS Pinning**: Resolve host → IP once per crawl and pin
- **Protocol Restrictions**: Only HTTP(S) allowed
- **Egress Control**: Per-job allowlist = allowedHosts only
- **Backoff Strategy**: Exponential + jitter on 429/403, abort if threshold exceeded

#### Crawl Session Persistence
```sql
CREATE TYPE crawl_status AS ENUM ('pending', 'crawling', 'complete', 'failed');

CREATE TABLE crawl_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,  -- Lowercase, no trailing slash, no default ports
  status crawl_status NOT NULL DEFAULT 'pending',
  content_hash TEXT,
  assets_url TEXT,        -- Object storage pointer
  har_url TEXT,          -- HAR file in object storage
  snapshots_url TEXT,    -- Screenshots in object storage
  links TEXT[],
  headers JSONB,
  canonical_url TEXT,
  robots_policy JSONB,
  sitemap_urls TEXT[],
  anti_bot_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crawl_sessions_project ON crawl_sessions(project_id, created_at DESC);
CREATE UNIQUE INDEX idx_crawl_normalized_url ON crawl_sessions(project_id, normalized_url);
```

#### URL Normalization & Deduplication
```javascript
function normalizeUrl(url: string): string {
  const parsed = new URL(url.toLowerCase());
  // Remove default ports
  if ((parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')) {
    parsed.port = '';
  }
  // Normalize path
  parsed.pathname = parsed.pathname
    .replace(/\/+/g, '/')  // Collapse duplicate slashes
    .replace(/%7E/g, '~')   // Decode tilde
    .replace(/\/index\.html?$/, '');  // Remove index.html
  // Remove trailing slash except for root
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  // Remove tracking and comment params
  ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid',
   'yclid', 'mc_cid', 'mc_eid', 'replytocom', 'fb_action_ids']
    .forEach(param => parsed.searchParams.delete(param));
  return parsed.toString();
}
```

#### Technology Detection
- **Wappalyzer Integration**: Cache results per domain
- **Local Signature Library**: Common CMS markers
  - WordPress: `/wp-content/`, `?p=`, `/wp-admin/`
  - Shopify: `/cart.js`, `Shopify.theme`
  - Drupal: `/sites/default/`, `drupal.js`
- **Stack Identification**:
  - Frontend: HTML/CSS/JS, jQuery, Angular, React, Vue
  - Backend: PHP, Python, Ruby, Java, .NET, Node.js
  - CMS: WordPress, Drupal, Joomla, Shopify
  - SPA Detection:
    - Check `performance.getEntriesByType('navigation')[0].type === 'navigate'`
    - Monitor `history.pushState` usage (not just hash anchors)
    - Large bundles (>500KB main JS)
    - Client-side routing libraries detected
  - Server: Apache, Nginx, IIS

#### Page Quality Detection
- **Soft-404 Detection**:
  - Same template with "not found", "404", "error" text
  - Identical body hashes with different URLs (>3 matches)
  - HTTP 200 but title contains "Not Found"
- **Robots & Noindex Handling**:
  - Respect `X-Robots-Tag` headers
  - Parse `<meta name="robots" content="noindex">`
  - If noindex: Include in crawl graph but exclude from migration_map
  - User option to include noindex pages
- **Consent Walls**: Detect cookie modals, auto-accept safe categories or abort
- **Canonical Handling**: If `<link rel="canonical">` differs, map to canonical

#### Content Analysis
- Page hierarchy and navigation structure
- Dynamic vs static content identification
- Form functionality mapping
- Interactive element detection
- Third-party integrations (analytics, payments, social)

### Phase 2: Transformation Engine

#### Framework Selection (MVP: Next.js Only)
For MVP, all migrations target Next.js 14+ with App Router:

```javascript
const mvpFramework = {
  target: 'Next.js 14 (App Router)',
  styling: 'Tailwind CSS',
  typescript: true,
  deployment: 'Vercel',
  strategy: 'SSG' // Static Site Generation for MVP
};

// Future phases
const frameworkSelection = {
  'blog': 'Next.js + MDX',
  'marketing': 'Astro + React Islands',
  'spa': 'React + Vite',
  'dashboard': 'Next.js + TypeScript',
  'ecommerce': 'Next.js Commerce'
};
```

#### Conversion Modules

##### HTML to Component Conversion
- Parse HTML structure into component tree
- **Deterministic Transformation DSL** with precedence:
```json
[
  {"match": "header.site-header", "as": "Header", "priority": 1, "slots": {"nav": "nav.primary"}},
  {"match": "section.hero", "as": "Hero", "priority": 2, "props": {"bg": "computed"}},
  {"match": ".card", "as": "Card", "priority": 3, "reusable": true},
  {"match": "unknown", "as": "LegacyBlock", "priority": 99, "preserveHtml": true}
]
```
- **LegacyBlock Safety**:
  ```typescript
  import DOMPurify from 'isomorphic-dompurify';

  function LegacyBlock({ html }: { html: string }) {
    const sanitized = DOMPurify.sanitize(html, {
      ADD_TAGS: ['style'],  // Allow style tags for legacy
      ADD_ATTR: ['style'],  // Allow inline styles
      KEEP_CONTENT: false   // Remove script content
    });
    return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }
  ```
- Track sanitization delta (removed nodes/attrs) as XSS risk metric
- Generate route groups based on DSL matches for clean App Router structure

##### Style Migration
- **PostCSS Parsing** for intelligent conversion:
  - Utility-like rules → Tailwind classes (where obvious)
  - Complex styles → CSS Modules (co-located)
  - Global styles → `global.css` fallback
  - **Tailwind Limit Fallback**: When >1000 unmapped utilities, keep CSS Modules
- **CSS Coverage Analysis** to trim unused rules
- **Font & Asset Handling**:
  - Self-host with `next/font` where licensing allows
  - License warning in report for restricted fonts/images
  - Don't import third-party licensed assets without warning
- Preserve responsive design
- Generate theme configuration from common values

##### JavaScript Modernization (MVP: Safe Patterns Only)
- **Script Classification**:
  ```javascript
  const scriptTypes = {
    third_party: /google-analytics|facebook|twitter|gtag/,
    inline_small: (content) => content.length < 2048,
    inline_large: (content) => content.length >= 2048,
    site_bundle: /bundle\.|app\.|main\./
  };
  ```
  - Third-party → `<Script strategy="afterInteractive" nonce={nonce}>`
  - Inline small → Inline in component with sanitization
  - Inline large → Island component with useEffect + ref:
    ```typescript
    useEffect(() => {
      if (ref.current && sanitizedCode) {
        // Execute against ref, limit to safe DOM APIs
        const sandboxedExec = new Function('element', sanitizedCode);
        sandboxedExec(ref.current);
      }
    }, []);
    ```
  - Site bundles → Analyze for SPA patterns, add surcharge flag if detected
- **CSP Planning**: Document nonce requirements in README
- **Complex Plugin Ecosystems**: Generate migration TODOs

##### Backend Transformation (Deferred to Phase 2)
For MVP, focus on static content only:
- **Forms Detection & Handling**:
  ```javascript
  const formAnalysis = {
    hasMultipart: form.enctype === 'multipart/form-data',
    hasHoneypot: !!form.querySelector('input[type="hidden"][name*="honey"]'),
    hasRecaptcha: !!form.querySelector('.g-recaptcha'),
    fingerprint: crypto.createHash('sha256')
      .update(`${form.action}|${form.method}|${fieldNames.join(',')}`)
      .digest('hex')
  };
  ```
  - Multipart/honeypot/reCAPTCHA → Default to proxy_passthrough with warning
  - Store form fingerprints for regression detection
- Dynamic content → Static snapshots
- API calls → Document endpoints for Phase 2

Future phases:
- API extraction from server-side code
- RESTful/GraphQL API generation
- Database schema migration
- Authentication system modernization

### Phase 3: URL Preservation & SEO

#### Migration Map (Critical for SEO)
```sql
CREATE TABLE migration_map (
  id SERIAL PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  src_url TEXT NOT NULL,
  target_route TEXT NOT NULL,
  redirect_code INT NOT NULL DEFAULT 301,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'generated', 'verified', 'redirected', 'skipped')),
  src_http_status SMALLINT,
  soft_404 BOOLEAN DEFAULT false,
  canonical_src BOOLEAN DEFAULT false,
  canonical_url TEXT,
  meta_data JSONB, -- OG tags, Twitter cards, structured data
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(project_id, src_url)
);

CREATE INDEX idx_migration_map_project_status ON migration_map(project_id, status);
CREATE UNIQUE INDEX idx_migration_map_target ON migration_map(project_id, target_route)
  WHERE status != 'skipped';  -- Prevent duplicate targets
```

#### Redirect & Rewrite Generation
```javascript
// next.config.js generation
module.exports = {
  async redirects() {
    return migrations.slice(0, 500).map(m => ({
      source: m.src_path,
      destination: m.target_route,
      permanent: m.redirect_code === 301
    }));
  },
  async rewrites() {
    // For legacy querystring behaviors
    return legacyQueries.map(q => ({
      source: q.pattern,
      destination: q.rewrite
    }));
  },
  images: {
    remotePatterns: discoveredHosts.map(h => ({
      protocol: 'https',
      hostname: h
    }))
  },
  i18n: null, // Explicitly disabled for MVP
  async headers() {
    return [{
      source: '/assets/:path*',
      headers: [{
        key: 'Cache-Control',
        value: 'public, max-age=31536000, immutable'
      }]
    }];
  }
};
```
- For >500 redirects, deploy Edge function
- Preserve trailing slashes, case, query params

### Phase 4: Project Generation

#### Modern Project Structure
```
project/
├── src/
│   ├── components/
│   ├── pages/
│   ├── styles/
│   ├── lib/
│   └── api/
├── public/
│   └── assets/
├── .env.local
├── package.json
├── next.config.js
└── README.md
```

#### Automated Features
- TypeScript configuration
- ESLint/Prettier setup
- Git initialization
- CI/CD pipeline configuration
- Environment variable management
- Build optimization

## User Input & Preferences

### Required Information

#### 1. Website URL
- Primary domain to migrate
- Ownership verification method (DNS or file upload)
- Sitemap URL (if available)

#### 2. Access Credentials (Phase 2+)
For MVP, only public content is migrated. Future phases:
- FTP/SFTP access for server-side code
- Database credentials for data migration
- Admin panel access for CMS platforms
- API keys for third-party services
- Credentials encrypted with time-boxed validity

### Migration Preferences

#### MVP Configuration (Fixed)
```yaml
mvp_config:
  framework: next_js_14_app_router
  styling: tailwind_css
  typescript: true
  deployment: vercel
```

#### Future Framework Options (Phase 3+)
```yaml
framework_preference:
  type: select
  options:
    - next_js        # Next.js 14+
    - react_vite     # React + Vite
    - vue_nuxt       # Vue 3 + Nuxt
    - astro          # Astro (static/hybrid)
    - remix          # Remix
    - sveltekit      # SvelteKit
```

#### Forms & Dynamic Behavior (MVP)
```yaml
form_handling:
  type: select
  options:
    - email_handler      # Send to configured email
    - proxy_passthrough  # Proxy to original endpoint
    - netlify_forms      # Netlify form handling
    - generate_contract  # Document for Phase 2
```

**Form Contract Generation** (per form):
```json
{
  "formId": "contact-form",
  "fields": [
    {"name": "email", "type": "email", "required": true},
    {"name": "message", "type": "textarea", "required": true}
  ],
  "validation": {"email": "email", "message": "minLength:10"},
  "originalAction": "/contact.php",
  "method": "POST",
  "migrationNotes": "Needs email service integration"
}
```

### Advanced Configuration (Phase 2+)

These options become available after MVP:

#### Performance Optimization
```yaml
optimization:
  image_optimization: true      # Next/Image, lazy loading (MVP)
  code_splitting: true          # Dynamic imports (MVP)
  third_party_budget: true      # Script analysis (MVP)
  progressive_enhancement: false # PWA (Phase 3)
```

#### Asset Handling
```yaml
assets:
  download_images: true         # Re-host all images
  convert_formats: true         # WebP/AVIF conversion
  optimize_fonts: true          # next/font integration
  lazy_loading: true            # Default for all images
  cdn_integration: false        # Future enhancement
```

## Migration Workflow

### Stage 1: Analysis & Planning (Automated)
1. Verify ownership (DNS/file method)
2. Crawl website with safety limits
3. Generate technology report
4. Calculate complexity score:
   ```javascript
   complexity = {
     pages: crawledPages.length,
     jsFiles: scripts.filter(s => !s.thirdParty).length,
     forms: forms.length,
     cmsIndicators: cmsMarkers.length,
     thirdPartyWidgets: widgets.length,
     estimatedHours: calculateHours(factors)
   }
   ```
5. Present migration plan with pricing tier

### Stage 2: User Review & Configuration
1. Review analysis report
2. Select target framework
3. Configure preferences
4. Approve migration plan
5. Provide additional access if needed

### Stage 3: Transformation Process
1. Content extraction and structuring
2. Component generation via DSL rules
3. Style system creation (PostCSS → Tailwind/Modules)
4. Forms handling:
   - Generate "Form Contract" per form
   - Email handler or proxy setup
5. Asset optimization:
   - Download and re-host images
   - Convert to WebP/AVIF where safe
   - Implement lazy loading
6. Third-party script analysis:
   - Generate script budget report
   - Offer defer/remove toggles

### Stage 4: Quality Assurance (Automated Gates)
1. **Smart Sampling**:
   - Use sitemap priority if available
   - Otherwise, rank by inlink count (graph metric)
   - Select top N pages for testing (not random)
2. **Visual Regression** (Flake Control):
   ```javascript
   // Stable viewport and network for consistency
   const config = {
     viewport: { width: 1920, height: 1080 },
     deviceScaleFactor: 1,
     network: '4g-consistent',  // Fixed throttling
     runs: 2,  // Run twice, take median
     threshold: 0.02  // 2% difference tolerance
   };
   ```
3. **Performance Gates**:
   - Lighthouse CI (fail if CLS/LCP/INP regress >10%)
   - Run twice, take median to reduce noise
   - Track perf delta on 10 sample pages
4. **SEO Verification**:
   - Redirect correctness: % of old URLs that 301→new→200
   - All migration_map entries verified
   - Canonical/meta/OG preservation check
5. **Accessibility**: axe-core WCAG violations
6. **Build Quality**: `next build` with ≤5 warnings, 0 errors

### Stage 5: Deployment & Handoff
1. **Git Repository**:
   - Initial commit: scaffolding
   - Commit per major step (pages, assets, redirects)
   - Clear commit messages for traceability
2. **Vercel Deployment**:
   - Auto-deploy to preview URL
   - Environment variables configured
3. **Migration Report** (Markdown):
   - Coverage: X% of pages migrated
   - Redirects: List of all 301s
   - Performance delta: Before/after metrics
   - Known gaps: TODOs and manual tasks
   - Next steps: Clear action items
4. **DNS Configuration**: Step-by-step guide
5. **Post-migration**: 7-day monitoring included

## AI-Powered Enhancements

### Intelligent Assistance (Supporting Role)
AI enhances but doesn't replace deterministic rules:

#### Code Understanding
- Complex jQuery plugin analysis
- Business logic extraction
- Pattern recognition for similar components
- Naming convention suggestions

#### Content Enhancement
- Image alt text generation for accessibility
- Meta description suggestions
- Schema markup recommendations
- SEO improvement hints

#### Quality Improvements
- Code smell detection in legacy scripts
- Performance bottleneck identification
- Security vulnerability flagging
- Accessibility issue detection

## Platform Integration

### Job Queue System
```sql
CREATE TYPE job_status AS ENUM ('queued', 'running', 'needs_input', 'failed', 'complete', 'cancelled');
CREATE TYPE job_stage AS ENUM ('ANALYZE', 'PLAN', 'TRANSFORM', 'VERIFY', 'DEPLOY');

CREATE TABLE migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  status job_status NOT NULL DEFAULT 'queued',
  stage job_stage NOT NULL,
  idempotency_key TEXT UNIQUE,  -- Prevent duplicate job creation
  progress INT DEFAULT 0,
  complexity_score JSONB,
  legacy_block_ratio NUMERIC(3,2),  -- For pricing calc
  spa_detected BOOLEAN DEFAULT false,
  error_message TEXT,
  last_checkpoint TEXT,  -- For resume capability
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_migration_jobs_project ON migration_jobs(project_id, created_at DESC);

-- Enable RLS for multitenancy
ALTER TABLE migration_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY jobs_project_access ON migration_jobs
  FOR ALL USING (project_id IN (
    SELECT id FROM projects WHERE owner_id = auth.uid()
  ));
```

### Resource Quotas & Optimization
- **CPU/Memory Limits**: 2GB RAM for crawler, 10min timeout
- **Concurrent Jobs**: Max 2 per user
- **Retry Policy**: 3 attempts with exponential backoff
- **Browser Pool**: Reuse Playwright instances per domain
- **Request Interception**: Block media/video during analysis
- **Adaptive Rendering**:
  ```javascript
  const needsJS = await page.evaluate(() =>
    document.body.textContent.trim().length < 100
  );
  if (!needsJS) {
    // Use simple fetch instead of full render
    return await fetch(url).then(r => r.text());
  }
  ```

### Git Integration
- Repository creation with clear history
- Branch protection on main
- Auto-generated README with migration details

### Vercel Integration
- Automatic project creation
- Preview deployments per commit
- Environment variables setup
- Custom domain configuration

## Success Metrics

### Technical Metrics
- Page load speed improvement (target: 50%+ faster)
- Lighthouse score (target: 90+ all categories)
- Bundle size reduction (target: 40% smaller)
- SEO score maintenance (100% URL preservation)

### User Satisfaction
- Migration completion rate
- Post-migration engagement
- Feature adoption rate
- Support ticket reduction
- User retention metrics

## Implementation Roadmap

### Phase 1: MVP (Months 1-3)
**Golden Path: Static HTML/CSS/JS → Next.js SSG**
- Public, unauthenticated sites only
- Next.js 14 App Router + TypeScript + Tailwind
- Deterministic component transformation
- Form passthrough (email or proxy)
- Quality gates (visual diff, Lighthouse)
- Vercel deployment

### Phase 2: CMS Support (Months 4-6)
- WordPress REST API import
- Media library migration
- Slug/taxonomy mapping
- Headless CMS option (Sanity mapper)
- Comment migration (optional)

### Phase 3: Dynamic Sites (Months 7-9)
- SPA re-platforming
- Backend API extraction
- Database migration
- Auth modernization
- Multiple framework targets

### Phase 4: Enterprise (Months 10-12)
- Large-scale migrations (>1000 pages)
- Custom transformation rules DSL
- White-label deployment options
- Priority support & consulting

## Risk Mitigation

### Technical Risks
- **Complex Legacy Code**: LegacyBlock wrapper + manual TODO generation
- **Data Loss**: Complete crawl session persistence before transformation
- **SEO Impact**: Migration map enforcement + automated verification
- **Performance Degradation**: Lighthouse gates prevent regression
- **Anti-bot Systems**: Detect and abort with clear messaging

### Security & Compliance
- **Ownership Verification**: Required before any deep crawl
- **Robots.txt Compliance**: Always respected
- **Rate Limiting**: 250ms delay, max 4 concurrent
- **License Compliance**: Font/image license warnings
- **Data Privacy**: No PII storage beyond project files
- **Credential Security**: Encrypted, time-boxed (24h max)

### Business Risks
- **User Trust**: Preview deployments + migration reports
- **Support Burden**: Automated quality gates reduce issues
- **Scalability**: Queue system with clear resource limits
- **Cost Predictability**: Complexity scoring upfront

## Cost Structure

### Pricing Model
Base price determined by complexity score:
```javascript
function calculatePrice(complexity) {
  const base = 99;
  const factors = {
    pages: complexity.pages * 2,
    jsFiles: complexity.jsFiles * 10,
    forms: complexity.forms * 20,
    widgets: complexity.widgets * 15,
    spaDetected: complexity.spaDetected ? 200 : 0  // SPA surcharge
  };
  const total = base + Object.values(factors).reduce((a,b) => a+b, 0);

  // Discount if high LegacyBlock usage (manual work needed)
  const legacyDiscount = complexity.legacyBlockRatio > 0.3 ? 0.8 : 1;

  return Math.min(total * legacyDiscount, 999);
}
```

### Pricing Tiers
```yaml
starter:
  price: $99-199
  pages: up to 20
  jsRendering: up to 10 pages
  features: basic

professional:
  price: $199-499
  pages: up to 100
  jsRendering: up to 50 pages
  features: advanced
  support: email

enterprise:
  price: $499+
  pages: up to 200 (MVP limit)
  jsRendering: all pages
  features: all
  support: priority
```

### Pricing Tiers & Overage
- **Included**: One re-crawl within 7 days
- **Overage Charges**:
  - JS rendering beyond tier: $0.50/page
  - Manual intervention: $50/hour
  - Rush processing (24h): 2x base price
  - Additional crawl attempts: $25 each
- **"No-code fix" Discount**: 20% off when >30% pages use LegacyBlock

## Success Metrics & Monitoring

### Key Performance Indicators
```javascript
const metrics = {
  coverage: {  // % of pages without LegacyBlock
    target: 0.8,
    calculation: (totalPages - legacyBlockPages) / totalPages
  },
  sanitizationRisk: {  // XSS risk proxy
    target: < 5,  // Avg removed nodes per page
    calculation: totalRemovedNodes / totalPages
  },
  redirectCorrectness: {  // SEO preservation
    target: 0.95,
    calculation: successful301s / totalRedirects
  },
  performanceDelta: {  // Speed improvement
    target: 0.5,  // 50% faster
    calculation: (beforeLCP - afterLCP) / beforeLCP
  },
  assetSavings: {  // Image optimization
    target: 0.4,  // 40% reduction
    calculation: (beforeBytes - afterBytes) / beforeBytes
  }
};
```

### Immediate Value Deliveries
1. **Technology Detection Cache**: Reuse Wappalyzer results across similar domains
2. **Network Trace Value**: Record XHR/fetch endpoints (no PII) for API discovery
3. **Asset Pipeline**: Batch process images through sharp for WebP/AVIF
4. **Script Classification**: Auto-categorize and report third-party script budget
5. **Form Detection**: Extract fields and generate contracts for future migration

### MVP Release Checklist
- [ ] Ownership verification enforced (no UI bypass)
- [ ] SSRF denylist & DNS pinning active
- [ ] Visual-diff flake rate <2% across 2 CI runs
- [ ] Migration map → redirects() diff is zero after verification
- [ ] `next build` succeeds with ≤5 warnings on 95% of test sites
- [ ] Report renders with red/yellow/green metric badges
- [ ] Form fingerprints stored for regression detection
- [ ] Sanitization tracking in place

### Sprint 1 Implementation Tasks
1. **Security Layer**: SSRF protection, ownership verification, legal checkbox
2. **Crawl Engine**: Crawlee setup with deduplication, soft-404 detection
3. **Data Models**: migration_map, crawl_sessions tables with proper indexes
4. **Transform DSL**: Parser, priority system, LegacyBlock sanitization
5. **Quality Gates**: Playwright config, Lighthouse median runs
6. **Deployment**: Vercel integration, next.config.js generation
7. **Reporting**: Metrics calculation, badge generation, deliverables

## Conclusion

This website migration feature focuses on shipping a reliable MVP that converts static HTML/CSS/JS sites to modern Next.js applications. By constraining initial scope, implementing strong safety measures, and ensuring SEO preservation through migration maps, we can deliver immediate value while building toward a comprehensive migration platform.

The combination of deterministic transformation rules, automated quality gates, and clear deliverables creates a predictable, trustworthy migration experience. Success metrics focus on completed migrations, preserved SEO, and improved performance—all measurable and meaningful to users.
