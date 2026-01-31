# Career Portal Implementation Plan (MVP)

## Implementation Status: ✅ COMPLETED (2025-09-07)

### Completed Components:
1. **Database Migration** (`migrations/081_career_portal_foundation.sql`) - ✅
2. **Validation Schemas** (`src/schemas/careers.ts`) - ✅
3. **Locale Utilities** (`src/utils/careerLocale.ts`) - ✅
4. **HTML Sanitization** (`src/utils/sanitizeHtml.ts`) - ✅
5. **CAPTCHA Plugin** (`src/plugins/recaptcha.ts`) - ✅
6. **Public API Routes** (`src/routes/careers.ts`) - ✅
7. **Admin API Routes** (`src/routes/careerAdmin.ts`) - ✅
8. **Server Registration** (routes registered in `src/server.ts`) - ✅

### Migration Improvements (2025-09-07):
Based on expert review, the following improvements were made to `081_career_portal_foundation.sql`:

**Incorporated:**
1. ✅ **Removed `SET session_replication_role`** - Unnecessary and requires superuser privileges
2. ✅ **Category FK changed to `ON DELETE SET NULL`** - Categories can be deleted without blocking jobs
3. ✅ **Added salary min/max constraint** - Prevents invalid salary ranges where min > max
4. ✅ **Fixed trigger language syntax** - Changed to `LANGUAGE plpgsql` (unquoted) for consistency

**Skipped (Over-engineering for MVP):**
- Company delete semantics change - Current `NO ACTION` is sufficient
- Total count performance optimization - Premature for MVP
- JSON shape guards - Application layer already validates
- Down migration script - Not needed for this project's pattern

### Implementation Discoveries & Notes:
- **Route Pattern Consistency**: Followed existing patterns from `advisorNetwork.ts` for authentication and error handling
- **R2 Integration**: Reused existing `cloudflareR2.ts` service for resume uploads with path `career/resumes/{yyyy}/{mm}/{uuid}-{slugified-filename.ext}`
- **Audit Logging**: Integrated with existing `admin_audit_logs` table for compliance tracking
- **HMAC Validation**: Used existing `adminAuthentication.ts` middleware for admin routes
- **Correlation IDs**: Maintained consistency with existing correlation ID middleware pattern
- **Database Connection Checks**: Added consistent database connection validation across all endpoints
- **Base64 Resume Upload**: Accepted base64 encoded files in application body for simpler frontend integration
- **Trigram Search**: Implemented PostgreSQL trigram search on generated `search_text` column
- **Rate Limiting**: 5 applications/hour/IP/job + global rate limits
- **Pagination Format**: Standard offset/limit with total count response

## Overview

A modern, professional career portal with admin control panel integration. The system follows the platform's existing patterns for multilingual support, admin authentication, and API design.

## Goals & Guardrails

- **MVP Focus**: Publish jobs, list/search jobs, accept applications, review in admin
- **Simple i18n**: Treat all ar-* variants as single Arabic (ar)
- **Not Overengineered**: Use existing patterns, avoid complex features for V1
- **Admin-First**: Full control through admin panel with audit logging
- **Security**: Rate limiting, file validation, CAPTCHA, HTML sanitization

## Scope

### In Scope (MVP)
- Public job listings with search and filtering
- Job detail pages with SEO optimization
- Application system with resume upload
- Admin CRUD for jobs, companies, categories
- Application review workflow
- Multilingual support (ar, en primarily)

### Out of Scope (V2+)
- Candidate accounts/saved jobs
- Complex analytics
- Bulk operations
- External ATS integrations
- Multiple organization support

## Technical Features
- Trigram text search (simple, fast)
- SEO with JSON-LD and sitemap
- File upload security
- Comprehensive audit logging
- Rate limiting on applications
- HTML sanitization for content

## Database Schema

### Core Tables

```sql
-- Job categories with multilingual support
CREATE TABLE career_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  multilingual_name JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"ar": "التكنولوجيا", "en": "Technology"}
  multilingual_description JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Companies (even for single org, keeps structure flexible)
CREATE TABLE career_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  multilingual_name JSONB NOT NULL DEFAULT '{}'::jsonb,
  multilingual_description JSONB NOT NULL DEFAULT '{}'::jsonb,
  logo_url TEXT,
  website_url TEXT,
  industry TEXT,
  company_size TEXT, -- "1-10", "11-50", "51-200", etc.
  location JSONB, -- {"country": "EG", "city": "Cairo", "remote_ok": true}
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"linkedin": "url", "twitter": "url"}
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Job postings
CREATE TABLE career_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  company_id UUID NOT NULL REFERENCES career_companies(id),
  category_id UUID REFERENCES career_categories(id),
  
  -- Multilingual content (following existing pattern)
  multilingual_title JSONB NOT NULL DEFAULT '{}'::jsonb,
  multilingual_description JSONB NOT NULL DEFAULT '{}'::jsonb, -- Sanitized HTML
  multilingual_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  multilingual_benefits JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Job details
  employment_type TEXT NOT NULL, -- "full_time", "part_time", "contract", "internship"
  experience_level TEXT, -- "entry", "mid", "senior", "executive"
  salary JSONB, -- {"min": 15000, "max": 25000, "currency": "EGP", "period": "monthly"}
  location JSONB, -- {"country": "EG", "city": "Cairo", "remote_ok": true}
  
  -- Status and metadata
  status TEXT NOT NULL DEFAULT 'draft', -- "draft", "published", "paused", "closed", "expired"
  is_featured BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  application_count INTEGER NOT NULL DEFAULT 0,
  
  -- Admin fields
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Generated search column for fast trigram search (ar + en combined)
  search_text TEXT GENERATED ALWAYS AS (
    COALESCE(multilingual_title->>'ar', '') || ' ' ||
    COALESCE(multilingual_title->>'en', '') || ' ' ||
    COALESCE(multilingual_description->>'ar', '') || ' ' ||
    COALESCE(multilingual_description->>'en', '')
  ) STORED
);

-- Job applications
CREATE TABLE career_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES career_jobs(id) ON DELETE CASCADE,
  applicant_email TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  applicant_phone TEXT,
  
  -- Application content
  cover_letter TEXT,
  resume_url TEXT, -- R2/S3 storage URL
  resume_filename TEXT,
  portfolio_url TEXT,
  linkedin_url TEXT,
  
  -- Application metadata
  status TEXT NOT NULL DEFAULT 'pending', -- "pending", "reviewing", "shortlisted", "rejected", "hired"
  source TEXT NOT NULL DEFAULT 'direct', -- "direct", "linkedin", "indeed", etc.
  
  -- Admin review
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  
  -- Timestamps
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Note: Saved jobs deferred to V2 (requires user accounts)
-- Note: Job views tracked via simple counter, detailed analytics deferred to V2
```

### Indexes and Constraints

```sql
-- Enable trigram extension for search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Optimized indexes (corrected for JSONB extraction)
CREATE INDEX IF NOT EXISTS idx_jobs_status_published ON career_jobs(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON career_jobs(company_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON career_jobs(category_id, status) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_country ON career_jobs((location->>'country'));
CREATE INDEX IF NOT EXISTS idx_jobs_remote ON career_jobs(((location->>'remote_ok')::boolean)) WHERE location->>'remote_ok' IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_featured ON career_jobs(is_featured, published_at DESC) WHERE status = 'published';

-- Trigram search index on generated search_text column
CREATE INDEX IF NOT EXISTS idx_jobs_search_trgm ON career_jobs USING GIN (search_text gin_trgm_ops);

-- Application indexes
CREATE INDEX IF NOT EXISTS idx_apps_job ON career_applications(job_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_apps_status ON career_applications(status, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_apps_email ON career_applications(applicant_email);

-- Constraints
ALTER TABLE career_jobs ADD CONSTRAINT job_title_has_arabic 
  CHECK (multilingual_title ? 'ar'); -- Ensure Arabic is always present

ALTER TABLE career_jobs ADD CONSTRAINT valid_status 
  CHECK (status IN ('draft', 'published', 'paused', 'closed', 'expired'));

ALTER TABLE career_applications ADD CONSTRAINT valid_application_status
  CHECK (status IN ('pending', 'reviewing', 'shortlisted', 'rejected', 'hired'));

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_career_categories_updated_at BEFORE UPDATE ON career_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  
CREATE TRIGGER update_career_companies_updated_at BEFORE UPDATE ON career_companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  
CREATE TRIGGER update_career_jobs_updated_at BEFORE UPDATE ON career_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  
CREATE TRIGGER update_career_applications_updated_at BEFORE UPDATE ON career_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Locale Normalization

```typescript
// utils/careerLocale.ts
export function normalizeCareerLocale(input?: string): 'ar' | 'en' {
  if (!input) return 'ar';
  const lc = input.toLowerCase();
  // Treat all Arabic variants as single Arabic
  if (lc === 'ar' || lc.startsWith('ar-')) return 'ar';
  // Default to Arabic for unsupported locales
  return lc.startsWith('en') ? 'en' : 'ar';
}

export function pickLocalizedField<T extends Record<string, any>>(
  obj: T | null | undefined,
  locale: 'ar' | 'en'
): string | null {
  if (!obj) return null;
  // Try requested locale, fallback to ar, then en
  return obj[locale] ?? obj['ar'] ?? obj['en'] ?? null;
}
```

## API Endpoints

### Public API (Frontend Integration)

```typescript
// Job Listings with search
GET /v1/public/careers/jobs
  ?q=keyword              // Trigram search on search_text
  &category=uuid
  &company=uuid  
  &country=EG             // 2-letter country code
  &employment_type=full_time
  &experience_level=mid
  &remote_ok=true
  &featured=true
  &limit=20               // Max 50
  &offset=0               // For pagination

GET /v1/public/careers/jobs/:slug
GET /v1/public/careers/categories
GET /v1/public/careers/companies/:slug

// Applications (rate limited: 5/hour/IP)
POST /v1/public/careers/jobs/:slug/apply
  Content-Type: multipart/form-data
  Fields:
    - applicant_name (required)
    - applicant_email (required)
    - applicant_phone (optional)
    - cover_letter (optional, max 5000 chars)
    - resume (file, required, PDF/DOC/DOCX, max 5MB)
    - portfolio_url (optional)
    - linkedin_url (optional)
    - captcha_token (required)

// SEO
GET /v1/public/careers/sitemap.xml
```

### Admin API (Lean & Auditable)

```typescript
// Jobs CRUD
GET    /v1/admin/careers/jobs
POST   /v1/admin/careers/jobs
GET    /v1/admin/careers/jobs/:id
PATCH  /v1/admin/careers/jobs/:id
DELETE /v1/admin/careers/jobs/:id
POST   /v1/admin/careers/jobs/:id/status
  Body: { status: "published" | "paused" | "closed" }
  Headers: x-reason (required for audit)

// Categories
GET    /v1/admin/careers/categories
POST   /v1/admin/careers/categories
PATCH  /v1/admin/careers/categories/:id
DELETE /v1/admin/careers/categories/:id

// Companies  
GET    /v1/admin/careers/companies
POST   /v1/admin/careers/companies
PATCH  /v1/admin/careers/companies/:id
DELETE /v1/admin/careers/companies/:id

// Applications
GET    /v1/admin/careers/applications
  ?status=pending
  &job_id=uuid
  &rating=4
  &limit=50
  &offset=0

PATCH  /v1/admin/careers/applications/:id
  Body: { status?, rating?, admin_notes? }
  Headers: x-reason (required for status changes)

// Metrics Widget
GET    /v1/admin/careers/metrics
  Returns: { active_jobs, total_applications, pending_reviews }
```

## Validation Schemas (Zod)

```typescript
// schemas/careers.ts
import { z } from 'zod';

export const CareerLocale = z.enum(['ar', 'en']);

export const CreateJobSchema = z.object({
  slug: z.string().min(3).max(200).regex(/^[a-z0-9-]+$/),
  company_id: z.string().uuid(),
  category_id: z.string().uuid().optional(),
  multilingual_title: z.object({ 
    ar: z.string().min(3).max(200),
    en: z.string().min(3).max(200).optional()
  }),
  multilingual_description: z.object({ 
    ar: z.string().min(10),
    en: z.string().min(10).optional()
  }),
  multilingual_requirements: z.object({ 
    ar: z.string().optional(),
    en: z.string().optional()
  }).default({}),
  multilingual_benefits: z.object({ 
    ar: z.string().optional(),
    en: z.string().optional()
  }).default({}),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'internship']),
  experience_level: z.enum(['entry', 'mid', 'senior', 'executive']).optional(),
  salary: z.object({
    min: z.number().int().positive().optional(),
    max: z.number().int().positive().optional(),
    currency: z.string().length(3).default('EGP'),
    period: z.enum(['hourly', 'monthly', 'yearly']).default('monthly')
  }).optional(),
  location: z.object({
    country: z.string().length(2),
    city: z.string().optional(),
    remote_ok: z.boolean().default(false)
  }).optional(),
  is_featured: z.boolean().default(false),
  expires_at: z.string().datetime().optional()
});

export const UpdateJobSchema = CreateJobSchema.partial()
  .extend({ 
    status: z.enum(['draft', 'published', 'paused', 'closed', 'expired']).optional()
  });

export const JobQuerySchema = z.object({
  q: z.string().max(100).optional(),
  category: z.string().uuid().optional(),
  company: z.string().uuid().optional(),
  country: z.string().length(2).optional(),
  remote_ok: z.coerce.boolean().optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'internship']).optional(),
  experience_level: z.enum(['entry', 'mid', 'senior', 'executive']).optional(),
  featured: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

export const ApplicationSchema = z.object({
  applicant_name: z.string().min(2).max(120),
  applicant_email: z.string().email(),
  applicant_phone: z.string().max(50).optional(),
  cover_letter: z.string().max(5000).optional(),
  portfolio_url: z.string().url().optional(),
  linkedin_url: z.string().url().optional(),
  captcha_token: z.string().min(10)
});
```

## Security & File Upload

### File Upload Security
```typescript
// Resume upload validation
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// R2/S3 path structure
// career/resumes/{yyyy}/{mm}/{uuid}-{slugified-filename.ext}

// Upload flow:
// 1. Validate MIME/size/filename
// 2. Upload to R2/S3
// 3. Store sha256, content_type, size
// 4. Save application row with status='pending'
// 5. Generate signed URLs for admin preview (10 min TTL)
```

### Security Controls
- **Rate Limiting**: 5 applications/hour/IP/job (route-level) + 60/min/IP global
- **CAPTCHA**: reCAPTCHA server-side verification required
- **HTML Sanitization**: Strict allowlist (p, ul/ol/li, a, b/strong, i/em, h1-h4, br)
- **File Validation**: Type, size, filename sanitization
- **Audit Logging**: All admin actions with correlation ID and reason
- **Signed URLs**: Time-limited access to resume files

### HTML Sanitization
```typescript
// utils/sanitizeHtml.ts
const ALLOWED_TAGS = ['p', 'ul', 'ol', 'li', 'a', 'b', 'strong', 'i', 'em', 'h1', 'h2', 'h3', 'h4', 'br'];
const ALLOWED_ATTRS = { a: ['href', 'target'] };

export function sanitizeHtmlStrict(html: string): string {
  // Implementation using DOMPurify or similar
  // Applied to multilingual_description, multilingual_requirements, multilingual_benefits
}
```

### reCAPTCHA Verification
```typescript
// plugins/recaptcha.ts
export async function verifyRecaptcha(token: string): Promise<boolean> {
  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const data = await response.json();
  return data.success && data.score > 0.5;
}
```

## SEO Implementation

### JSON-LD for Job Postings
```json
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "مهندس واجهات أمامية",
  "description": "...",
  "datePosted": "2025-09-08",
  "validThrough": "2025-10-08",
  "employmentType": "FULL_TIME",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "SheenApps",
    "sameAs": "https://sheenapps.com"
  },
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Cairo",
      "addressCountry": "EG"
    }
  },
  "baseSalary": {
    "@type": "MonetaryAmount",
    "currency": "EGP",
    "value": {
      "@type": "QuantitativeValue",
      "minValue": 15000,
      "maxValue": 25000,
      "unitText": "MONTH"
    }
  }
}
```

### Sitemap Generation
- Dynamic XML sitemap at `/v1/public/careers/sitemap.xml`
- Include all published jobs with lastmod from updated_at
- Submit to Google Search Console

## Implementation Phases

### Phase 1: Database & Core API (Days 1-3)
1. Create migration with tables, indexes, and triggers
2. Implement locale normalization utilities
3. Set up validation schemas with Zod
4. Create public job listing endpoints

### Phase 2: Admin Panel (Days 4-6)
1. Job/Company/Category CRUD operations
2. Audit logging integration
3. Dashboard metrics widget
4. Application review interface

### Phase 3: Application System (Days 7-9)
1. File upload with validation
2. Rate limiting setup
3. CAPTCHA integration
4. Application submission endpoint

### Phase 4: Search & SEO (Days 10-12)
1. Trigram search implementation
2. JSON-LD structured data
3. Sitemap generation
4. Performance optimization

### Phase 5: Testing & Documentation (Days 13-14)
1. API testing and validation
2. Security audit
3. Performance testing
4. Frontend integration guide updates

## Implementation Details

### Middleware Setup
```typescript
// Locale middleware - apply to all career routes
async function careerLocaleMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const locale = getLocaleFromHeaders(request.headers);
  (request as any).locale = locale;
}

// Apply to routes
fastify.addHook('preHandler', careerLocaleMiddleware);
```

### Search Query Implementation
```sql
-- Trigram search with filters
SELECT j.*, COUNT(*) OVER() as total_count
FROM career_jobs j
LEFT JOIN career_categories c ON c.id = j.category_id
WHERE j.status = 'published'
  AND ($1::uuid IS NULL OR j.category_id = $1)
  AND ($2::uuid IS NULL OR j.company_id = $2)
  AND ($3::text IS NULL OR j.location->>'country' = $3)
  AND ($4::boolean IS NULL OR (j.location->>'remote_ok')::boolean = $4)
  AND ($5::text IS NULL OR j.employment_type = $5)
  AND ($6::text IS NULL OR j.experience_level = $6)
  AND ($7::boolean IS NULL OR j.is_featured = $7)
  AND ($8::text IS NULL OR (
    j.search_text ILIKE '%' || $8 || '%'
    OR j.search_text % $8  -- trigram similarity
  ))
ORDER BY
  j.is_featured DESC,
  j.published_at DESC NULLS LAST
LIMIT $9 OFFSET $10;
```

### Pagination Response Format
```typescript
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// Usage in route
const result = await pool.query(searchQuery, params);
return reply.send({
  items: result.rows.map(job => transformJobForResponse(job, request.locale)),
  total: result.rows[0]?.total_count || 0,
  limit,
  offset
});
```

## Admin Panel Integration

```typescript
// src/routes/careerAdmin.ts
export async function registerCareerAdminRoutes(fastify: FastifyInstance) {
  // Use existing middleware
  fastify.addHook('preHandler', correlationIdMiddleware);
  fastify.addHook('preHandler', careerLocaleMiddleware);
  
  // Metrics widget
  fastify.get('/v1/admin/careers/metrics', {
    preHandler: requireAdminAuth({ permissions: ['admin.read'] })
  }, async (request, reply) => {
    const metrics = await getCareerMetrics();
    return reply.send(withCorrelationId({
      success: true,
      active_jobs: metrics.active_jobs,
      total_applications: metrics.total_applications,
      pending_reviews: metrics.pending_reviews
    }, request));
  });

  // Job management with audit
  fastify.post('/v1/admin/careers/jobs', {
    preHandler: [
      requireAdminAuth({ permissions: ['admin.write'] }), 
      enforceReason
    ],
    schema: { body: CreateJobSchema }
  }, async (request, reply) => {
    // Sanitize HTML content before save
    const sanitized = {
      ...request.body,
      multilingual_description: sanitizeMultilingualHtml(request.body.multilingual_description),
      multilingual_requirements: sanitizeMultilingualHtml(request.body.multilingual_requirements),
      multilingual_benefits: sanitizeMultilingualHtml(request.body.multilingual_benefits)
    };
    
    // Insert with audit logging
    await logAdminAction(request, 'career.job.create', jobId, reason);
  });
}
```

## Monitoring & Lifecycle

### Background Jobs
- **Daily Cron**: Set status='expired' where expires_at < NOW()
- **Application Counter**: Increment on successful application
- **View Counter**: Increment via lightweight endpoint or log ingestion

### Observability
- Structured logs with correlation IDs
- Metrics: request rate, p95 latency, application success rate
- Alerts: Error spikes, rate limit violations, file upload failures

## Test Checklist (MVP Validation)

**Implementation Note**: All endpoints have been implemented and are ready for testing. Use the migration file `081_career_portal_foundation.sql` to set up the database schema first.

### Locale Testing
- [ ] `x-sheen-locale: ar` returns Arabic content
- [ ] `x-sheen-locale: ar-EG` normalizes to Arabic
- [ ] `x-sheen-locale: en-US` returns English content
- [ ] Missing locale header defaults to Arabic
- [ ] Fallback chain works: requested → ar → en

### Search & Filtering
- [ ] Arabic text search returns expected matches
- [ ] English text search returns expected matches
- [ ] Trigram similarity works for partial matches
- [ ] Filters combine correctly (AND logic)
- [ ] Pagination maintains result consistency

### File Upload
- [ ] Reject files >5MB with 400 error
- [ ] Reject non-PDF/DOC/DOCX with 400 error
- [ ] Accept valid PDF uploads
- [ ] Filename sanitization removes special characters
- [ ] SHA256 hash stored correctly

### Rate Limiting
- [ ] 6th application within hour → 429 error
- [ ] Rate limit is per IP/job combination
- [ ] Global rate limit (60/min) enforced

### CAPTCHA
- [ ] Invalid token → 422 error
- [ ] Valid token allows submission
- [ ] Server-side verification with reCAPTCHA API

### Admin Operations
- [ ] Status changes require `x-reason` header
- [ ] Audit records created for all mutations
- [ ] Correlation IDs tracked throughout
- [ ] HTML sanitized before storage

### SEO & Discovery
- [ ] Sitemap contains only published jobs
- [ ] Valid XML format
- [ ] JSON-LD structured data present
- [ ] lastmod reflects latest update

### Error Handling
- [ ] 400 for validation errors
- [ ] 422 for CAPTCHA failures
- [ ] 429 for rate limit exceeded
- [ ] 500 errors don't leak sensitive info

## Success Criteria

- **Performance**: <200ms p95 API response time
- **Scale**: Support 10K+ active jobs, 100K+ applications
- **Security**: Pass security audit, no critical vulnerabilities
- **SEO**: Jobs indexed within 48 hours of publishing
- **Reliability**: 99.9% uptime for public endpoints

This lean MVP implementation provides a professional career portal that integrates seamlessly with your existing platform while avoiding overengineering.