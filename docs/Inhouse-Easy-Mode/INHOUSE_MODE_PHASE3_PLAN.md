# In-House Mode: Phase 3 Analysis & Implementation Plan

**Date**: 2026-01-23
**Status**: Analysis Complete, Ready for Implementation
**Scope**: Custom Domains, Export, Eject to Pro Mode

---

## Executive Summary

Phase 3 transforms Easy Mode from a "demo/MVP platform" into a **production-ready hosting solution** by adding:

1. **Custom Domains** - Users can use their own domain instead of `*.sheenapps.com`
2. **Project Export** - Full data backup before major changes
3. **Eject to Pro Mode** - Graduation path for power users

**Current State**: ~25% complete (database schema + placeholder routes)
**Estimated Effort**: 1-2 weeks for full implementation

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Gap Analysis](#gap-analysis)
3. [Implementation Plan](#implementation-plan)
4. [Detailed Specifications](#detailed-specifications)
5. [File Reference](#file-reference)
6. [Risk Assessment](#risk-assessment)

---

## Current State Analysis

### What Already Exists

#### 1. Database Schema (95% Complete)

**Migration**: `20260116_inhouse_phase3_requests.sql`

```sql
-- Custom domains tracking
CREATE TABLE inhouse_custom_domains (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  domain VARCHAR(253) UNIQUE,
  status: 'pending' | 'active' | 'failed',
  verification_status: 'pending' | 'verified' | 'failed',
  ssl_status: 'pending' | 'active' | 'failed',
  verification_method: 'cname' | 'txt',
  verification_token TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at, updated_at
);

-- Eject request tracking
CREATE TABLE inhouse_eject_requests (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  user_id UUID,
  status: 'queued' | 'reviewing' | 'approved' | 'rejected' | 'completed' | 'failed',
  reason TEXT,
  details JSONB,
  resolved_at TIMESTAMPTZ,
  created_at, updated_at
);
```

**Assessment**: Schema is well-designed with proper indexes and RLS policies.

#### 2. Worker Routes (60% Complete)

**File**: `sheenapps-claude-worker/src/routes/inhousePhase3.ts`

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /projects/:id/domains` | ✅ Works | Lists domains + subdomain |
| `POST /projects/:id/domains` | ⚠️ Partial | Creates DB record, no CF API |
| `POST /domains/:domain/verify` | ⚠️ Stub | Updates timestamp only |
| `POST /projects/:id/exports` | ⚠️ Stub | Creates job, no processing |
| `POST /projects/:id/eject` | ⚠️ Stub | Creates request, no workflow |

**Feature Flags** (all disabled):
- `INHOUSE_CUSTOM_DOMAINS_ENABLED`
- `INHOUSE_EXPORTS_ENABLED`
- `INHOUSE_EJECT_ENABLED`

#### 3. Frontend UI (40% Complete)

**Files**: `sheenappsai/src/components/builder/infrastructure/phase3/`

- `Phase3PlaceholdersCard.tsx` - "Coming Soon" badge display
- `Phase3ToolsPanel.tsx` - Feature list with disabled buttons + "Notify me"

**Assessment**: Placeholder UI exists but no functional components.

#### 4. Services (30% Complete)

- `ExportJobsService` - Constructor exists, job collection stubbed
- No `CustomDomainsService`
- No `EjectService`

---

## Gap Analysis

### 1. Custom Domains - Critical Gaps

| Component | Current | Needed |
|-----------|---------|--------|
| Cloudflare API client | ❌ None | CF for SaaS integration |
| Hostname provisioning | ❌ None | `POST /custom_hostnames` |
| SSL automation | ❌ None | Certificate provisioning |
| DNS verification | ❌ Stub | Actual CNAME/TXT check |
| Domain deletion | ❌ None | Revoke + cleanup |
| Dispatch worker routing | ⚠️ Partial | Custom domain → project lookup |

### 2. Export - Critical Gaps

| Component | Current | Needed |
|-----------|---------|--------|
| Job queue processor | ❌ None | BullMQ worker |
| Data collection | ❌ Stub | DB schema + data + CMS + media |
| ZIP generation | ❌ None | Archive creation |
| R2 upload | ❌ None | Artifact storage |
| Download URL | ❌ None | Signed URL generation |
| Cleanup job | ❌ None | 14-day retention enforcement |

### 3. Eject - Critical Gaps

| Component | Current | Needed |
|-----------|---------|--------|
| Admin approval UI | ❌ None | Admin dashboard panel |
| Migration wizard | ❌ None | Multi-step user flow |
| Data migration | ❌ None | Easy → Pro data transfer |
| Notification system | ❌ None | Email/in-app alerts |
| Pro Mode setup | ❌ None | Supabase/Vercel connection |

---

## Implementation Plan

### Priority Order

| Priority | Feature | Effort | Business Value |
|----------|---------|--------|----------------|
| **P0** | Custom Domains | 3-4 days | Revenue enabler (Pro tier) |
| **P1** | Export | 2-3 days | Trust builder + eject prereq |
| **P2** | Eject to Pro | 2-3 days | Graduation path |

### Phase 3.1: Custom Domains (P0)

**Goal**: Users can connect their own domain with automatic SSL.

#### Tasks

1. **Cloudflare API Client** (4-6 hours)
   - Create `CloudflareCustomHostnamesService`
   - Methods: `createHostname()`, `getHostname()`, `deleteHostname()`
   - Handle API errors gracefully

2. **Domain Provisioning Flow** (4-6 hours)
   - Update `POST /domains` to call CF API
   - Store CF hostname ID in database
   - Return CNAME target for user DNS setup

3. **DNS Verification** (4-6 hours)
   - Implement actual CNAME lookup (via DNS resolver)
   - Update `POST /domains/:domain/verify`
   - Poll CF API for SSL status

4. **Dispatch Worker Update** (2-3 hours)
   - Add custom domain → project lookup in KV
   - Update hostname mapping on domain activation

5. **Frontend UI** (4-6 hours)
   - Domain input form
   - DNS instructions display
   - Status indicators (pending/verified/active)
   - Delete domain action

6. **Domain Deletion** (2-3 hours)
   - `DELETE /domains/:domain` endpoint
   - CF hostname removal
   - KV mapping cleanup

#### Success Criteria
- [ ] User can add custom domain via UI
- [ ] DNS instructions shown with correct CNAME target
- [ ] Verification detects correct DNS setup
- [ ] SSL provisioned automatically (< 5 min)
- [ ] Site accessible via custom domain
- [ ] Domain can be removed

### Phase 3.2: Project Export (P1)

**Goal**: Users can download a complete backup of their project.

#### Tasks

1. **Export Job Processor** (4-6 hours)
   - BullMQ worker for export jobs
   - Job states: queued → processing → complete/failed

2. **Data Collection** (4-6 hours)
   - Database schema export (CREATE TABLE statements)
   - Data export (INSERT statements or JSON)
   - CMS content export
   - Media files list (R2 keys)

3. **ZIP Generation** (2-3 hours)
   - Create archive with folder structure
   - Include README with restore instructions

4. **Artifact Storage** (2-3 hours)
   - Upload ZIP to R2 (separate bucket or prefix)
   - Generate signed download URL (24-hour expiry)

5. **Status Polling** (2-3 hours)
   - `GET /exports/:jobId` endpoint
   - Return progress, status, download URL

6. **Frontend UI** (3-4 hours)
   - Export button in Infrastructure panel
   - Progress indicator
   - Download link when ready

7. **Cleanup Job** (1-2 hours)
   - Scheduled job to delete exports > 14 days

#### Success Criteria
- [ ] User can trigger export from UI
- [ ] Progress shown during export
- [ ] Download link provided when complete
- [ ] ZIP contains schema, data, CMS, media list
- [ ] Old exports automatically cleaned up

### Phase 3.3: Eject to Pro Mode (P2)

**Goal**: Power users can migrate to Pro Mode with their own infrastructure.

#### Tasks

1. **Eject Request Flow** (2-3 hours)
   - Improve `POST /eject` with more metadata
   - Email notification to admin

2. **Admin Dashboard** (4-6 hours)
   - Eject requests list in `/admin`
   - Review details (project, user, reason)
   - Approve/reject actions

3. **Migration Wizard UI** (4-6 hours)
   - Step 1: Confirm intention + export data
   - Step 2: Connect Supabase
   - Step 3: Connect Vercel
   - Step 4: Confirm migration

4. **Data Migration** (4-6 hours)
   - Transfer schema to user's Supabase
   - Export and provide data import instructions
   - Update project `infra_mode` to 'pro'

5. **Notification System** (2-3 hours)
   - Email when eject approved/rejected
   - In-app notification

#### Success Criteria
- [ ] User can request eject with reason
- [ ] Admin can review and approve/reject
- [ ] Approved users see migration wizard
- [ ] Data successfully migrates to Pro Mode
- [ ] Project switches to Pro Mode UI

---

## Detailed Specifications

### Custom Domains Architecture

```
User adds domain "app.example.com"
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ POST /api/inhouse/projects/:id/domains                      │
│   1. Validate domain format                                 │
│   2. Check uniqueness                                       │
│   3. Call CF Custom Hostnames API                           │
│   4. Store in inhouse_custom_domains                        │
│   5. Return CNAME target                                    │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
User configures DNS: app.example.com CNAME → proxy.sheenapps.com
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ POST /api/inhouse/projects/:id/domains/:domain/verify       │
│   1. DNS lookup for CNAME                                   │
│   2. Poll CF API for SSL status                             │
│   3. Update verification_status + ssl_status                │
│   4. If active: update KV hostname mapping                  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Dispatch Worker (on request to app.example.com)             │
│   1. Lookup hostname in KV                                  │
│   2. Get project_id                                         │
│   3. Route to project's build                               │
└─────────────────────────────────────────────────────────────┘
```

### Cloudflare for SaaS API

```typescript
// CF Custom Hostnames API
interface CFCustomHostname {
  id: string
  hostname: string
  ssl: {
    status: 'pending_validation' | 'pending_issuance' | 'active' | 'deleted'
    method: 'cname' | 'http'
    validation_records?: Array<{
      txt_name: string
      txt_value: string
    }>
  }
  status: 'pending' | 'active' | 'moved' | 'deleted'
  verification_errors?: string[]
}

// Create hostname
POST /zones/{zone_id}/custom_hostnames
{
  "hostname": "app.example.com",
  "ssl": {
    "method": "cname",
    "type": "dv"
  }
}

// Get hostname status
GET /zones/{zone_id}/custom_hostnames/{hostname_id}

// Delete hostname
DELETE /zones/{zone_id}/custom_hostnames/{hostname_id}
```

### Export ZIP Structure

```
project-export-{projectId}-{timestamp}/
├── README.md                    # Restore instructions
├── schema/
│   └── tables.sql               # CREATE TABLE statements
├── data/
│   ├── {table1}.json            # Table data as JSON
│   ├── {table2}.json
│   └── ...
├── cms/
│   ├── content-types.json       # CMS schema
│   └── entries/
│       ├── {type1}.json         # Entries by type
│       └── ...
├── media/
│   └── manifest.json            # R2 keys + URLs for media files
└── metadata.json                # Project info, export timestamp
```

### Eject Request Flow

```
User clicks "Eject to Pro Mode"
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Confirmation                                        │
│   - Warning about what changes                              │
│   - Trigger export (ensure backup exists)                   │
│   - Enter reason for ejecting                               │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ POST /api/inhouse/projects/:id/eject                        │
│   - Create eject_request with status='queued'               │
│   - Notify admin                                            │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Admin reviews in /admin/eject-requests                      │
│   - See project details, user, reason                       │
│   - Approve or Reject                                       │
└─────────────────────────────────────────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
Rejected   Approved
    │         │
    ▼         ▼
Notify    ┌─────────────────────────────────────────────────┐
user      │ Migration Wizard                                │
          │   Step 1: Connect Supabase                      │
          │   Step 2: Connect Vercel                        │
          │   Step 3: Data migration                        │
          │   Step 4: Switch infra_mode to 'pro'            │
          └─────────────────────────────────────────────────┘
```

---

## File Reference

### Files to Create

```
sheenapps-claude-worker/
├── src/services/
│   ├── cloudflareCustomHostnamesService.ts    # CF API client
│   └── exportJobProcessor.ts                   # BullMQ worker
├── src/routes/
│   └── inhousePhase3.ts                        # Update existing

sheenappsai/
├── src/components/builder/infrastructure/phase3/
│   ├── CustomDomainsPanel.tsx                  # Domain management UI
│   ├── AddDomainDialog.tsx                     # Domain input form
│   ├── DomainStatusCard.tsx                    # Per-domain status
│   ├── ExportPanel.tsx                         # Export UI
│   └── EjectWizard.tsx                         # Migration wizard
├── src/app/api/inhouse/projects/[id]/
│   ├── domains/
│   │   ├── route.ts                            # List + create
│   │   └── [domain]/
│   │       ├── route.ts                        # Delete
│   │       └── verify/route.ts                 # Verify
│   └── exports/
│       ├── route.ts                            # Create export
│       └── [jobId]/route.ts                    # Get status
├── src/app/[locale]/admin/
│   └── eject-requests/
│       └── page.tsx                            # Admin review UI
└── src/hooks/
    ├── useCustomDomains.ts                     # Domain management
    └── useExportJob.ts                         # Export status polling
```

### Files to Modify

```
sheenapps-claude-worker/
├── src/routes/inhousePhase3.ts                 # Add real implementations

packages/dispatch-worker/
└── src/index.ts                                # Custom domain routing

sheenappsai/
├── src/components/builder/infrastructure/
│   └── InfrastructurePanel.tsx                 # Add Phase 3 sections
└── src/messages/*/infrastructure.json          # Translations
```

### Database Migrations Needed

```sql
-- 1. Add CF hostname ID to domains table
ALTER TABLE inhouse_custom_domains
ADD COLUMN cf_hostname_id VARCHAR(64);

-- 2. Export artifacts tracking
CREATE TABLE inhouse_export_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'processing',
  r2_key TEXT,
  size_bytes BIGINT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_export_artifacts_project ON inhouse_export_artifacts(project_id);
CREATE INDEX idx_export_artifacts_expires ON inhouse_export_artifacts(expires_at);
```

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CF API rate limits | Medium | High | Implement backoff, cache hostname status |
| SSL provisioning delays | Medium | Medium | Set user expectations (up to 24h), show status |
| Large export failures | Medium | Medium | Chunked processing, resume capability |
| Eject data loss | Low | Critical | Require export before eject, confirmation steps |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Low custom domain adoption | Medium | Low | Include in Pro tier, market the feature |
| Eject abuse (free hosting then leave) | Low | Medium | Admin review gate, minimum usage period |
| Support burden from DNS issues | High | Medium | Clear documentation, DNS checker tool |

---

## Environment Variables Needed

```env
# Cloudflare for SaaS
CF_ZONE_ID=                          # Zone for custom hostnames
CF_API_TOKEN_HOSTNAMES=              # Token with Custom Hostnames permission

# Feature Flags (enable when ready)
INHOUSE_CUSTOM_DOMAINS_ENABLED=true
INHOUSE_EXPORTS_ENABLED=true
INHOUSE_EJECT_ENABLED=true

# Export settings
EXPORT_RETENTION_DAYS=14
EXPORT_MAX_SIZE_MB=500
```

---

## Success Metrics

### Custom Domains
- Time to SSL active: < 5 minutes (after DNS configured)
- Domain setup success rate: > 95%
- Support tickets for DNS issues: < 10% of domain additions

### Export
- Export completion rate: > 99%
- Average export time: < 2 minutes
- Export download success: > 99%

### Eject
- Eject request → completion time: < 48 hours
- Data migration success rate: > 99%
- User satisfaction with migration: > 4/5

---

## Implementation Progress

### Phase 3.1: Custom Domains
- [ ] Task 1: Cloudflare API Client
- [ ] Task 2: Domain Provisioning Flow
- [ ] Task 3: DNS Verification
- [ ] Task 4: Dispatch Worker Update
- [ ] Task 5: Frontend UI
- [ ] Task 6: Domain Deletion

### Phase 3.2: Project Export
- [ ] Task 1: Export Job Processor
- [ ] Task 2: Data Collection
- [ ] Task 3: ZIP Generation
- [ ] Task 4: Artifact Storage
- [ ] Task 5: Status Polling
- [ ] Task 6: Frontend UI
- [ ] Task 7: Cleanup Job

### Phase 3.3: Eject to Pro Mode
- [ ] Task 1: Eject Request Flow
- [ ] Task 2: Admin Dashboard
- [ ] Task 3: Migration Wizard UI
- [ ] Task 4: Data Migration
- [ ] Task 5: Notification System

---

*Analysis completed: 2026-01-23*
*Ready for implementation review and prioritization*
