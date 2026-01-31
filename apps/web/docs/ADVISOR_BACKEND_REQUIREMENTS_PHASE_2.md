# Advisor Network - Phase 2 Backend Requirements

## Overview

Phase 2 of the Advisor Network implementation introduces multi-step application forms with auto-save drafts and enhanced status tracking. This document outlines the specific backend requirements needed to support these frontend features.

## Database Schema Requirements

### 1. Application Drafts Table

```sql
-- Store partial application data for auto-save functionality
CREATE TABLE advisor_application_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Step 1: Personal Information
  personal_data JSONB DEFAULT '{}',
  -- Fields: display_name, bio, years_experience, portfolio_url
  -- Validation: bio length <= 2000 chars, display_name <= 100 chars
  
  -- Step 2: Professional Background  
  professional_data JSONB DEFAULT '{}',
  -- Fields: skills[], specialties[], languages[], linkedin_url, github_url
  -- Validation: arrays <= 20 items each, URLs properly formatted
  
  -- Step 3: Consultation Preferences
  consultation_data JSONB DEFAULT '{}',
  -- Fields: availability_hours[], availability_days[], consultation_types[], time_zones[]
  -- Validation: arrays within reasonable limits
  
  -- Metadata
  current_step INTEGER DEFAULT 1,
  last_saved_step INTEGER DEFAULT 1,
  is_complete BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL -- Soft delete support
);

-- EXPERT FIX: Partial unique index for soft-delete compatibility
-- (One ACTIVE draft per user, allows new draft after soft-delete)
CREATE UNIQUE INDEX uq_drafts_user_active
  ON advisor_application_drafts(user_id)
  WHERE deleted_at IS NULL;

-- EXPERT FIX: Add JSONB validation to prevent abuse
ALTER TABLE advisor_application_drafts
  ADD CONSTRAINT chk_personal_size CHECK (pg_column_size(personal_data) < 10000),
  ADD CONSTRAINT chk_professional_size CHECK (pg_column_size(professional_data) < 10000),
  ADD CONSTRAINT chk_consultation_size CHECK (pg_column_size(consultation_data) < 10000);

-- Indexes for performance
CREATE INDEX idx_advisor_drafts_user_id ON advisor_application_drafts(user_id);
CREATE INDEX idx_advisor_drafts_updated_at ON advisor_application_drafts(updated_at);
CREATE INDEX idx_advisor_drafts_active ON advisor_application_drafts(user_id) WHERE deleted_at IS NULL;

-- EXPERT FIX: GIN index for skills searches (future-proofs admin filtering)
CREATE INDEX idx_drafts_professional_gin
  ON advisor_application_drafts USING GIN (professional_data jsonb_path_ops);
-- Example query: professional_data @> '{"skills":["React"]}'

-- EXPERT FIX: Proper updated_at trigger (DEFAULT doesn't fire on UPDATE)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END; 
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_drafts_updated 
  BEFORE UPDATE ON advisor_application_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS Policies
ALTER TABLE advisor_application_drafts ENABLE ROW LEVEL SECURITY;

-- EXPERT FIX: Separate policies for better security
CREATE POLICY "Users can view their own drafts" ON advisor_application_drafts
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can create their own drafts" ON advisor_application_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own drafts" ON advisor_application_drafts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- EXPERT FIX: Allow users to soft-delete their own drafts
CREATE POLICY "Users can soft-delete their own drafts" ON advisor_application_drafts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- EXPERT FIX: Role-scoped policy (cleaner than current_setting checks)
CREATE POLICY "Service role full access to drafts" ON advisor_application_drafts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 2. Enhanced Advisors Table

```sql
-- Add new fields to existing advisors table for enhanced tracking
-- EXPERT FIX: Remove problematic JSONB timeline array (moved to separate table below)

-- EXPERT FIX: Add URL columns first (before CHECK constraints)
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS portfolio_url TEXT;
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS github_url TEXT;

ALTER TABLE advisors ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS review_completed_at TIMESTAMP WITH TIME ZONE;

-- Onboarding progress tracking (server-controlled flags)
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS onboarding_steps JSONB DEFAULT '{
  "stripe_connected": false,
  "calcom_connected": false, 
  "profile_complete": false
}';

ALTER TABLE advisors ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP WITH TIME ZONE;

-- EXPERT FIX: URL validation constraints (applied after columns exist)
ALTER TABLE advisors ADD CONSTRAINT chk_portfolio_url 
  CHECK (portfolio_url IS NULL OR portfolio_url ~* '^https?://');
ALTER TABLE advisors ADD CONSTRAINT chk_linkedin_url 
  CHECK (linkedin_url IS NULL OR linkedin_url ~* '^https://([a-z]{2,3}\.)?linkedin\.com/');
ALTER TABLE advisors ADD CONSTRAINT chk_github_url 
  CHECK (github_url IS NULL OR github_url ~* '^https://github\.com/');

-- EXPERT FIX: Column-level UPDATE grants for server-controlled flags
-- Users can only update specific columns, not onboarding_steps
REVOKE UPDATE ON advisors FROM authenticated;
GRANT UPDATE (
  display_name, bio, avatar_url, skills, specialties, languages, 
  portfolio_url, linkedin_url, github_url, is_accepting_bookings
) ON advisors TO authenticated;

-- Only admin/service can control onboarding and review workflow
GRANT UPDATE (
  onboarding_steps, review_started_at, review_completed_at,
  onboarding_started_at, onboarding_completed_at, approval_status
) ON advisors TO admin, service_role;
```

### 2.5. Admin Notes Table (EXPERT FIX)

```sql
-- EXPERT CRITICAL FIX: Separate admin notes table to prevent row hiding
-- This prevents the RLS bug where entire advisor rows disappear for non-admins
CREATE TABLE advisor_admin_notes (
  advisor_id UUID PRIMARY KEY REFERENCES advisors(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin-only access to notes
ALTER TABLE advisor_admin_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only access to admin notes" ON advisor_admin_notes
  FOR ALL TO admin USING (true) WITH CHECK (true);

-- Service role full access
CREATE POLICY "Service role full access to admin notes" ON advisor_admin_notes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Updated trigger for admin notes
CREATE TRIGGER trg_admin_notes_updated 
  BEFORE UPDATE ON advisor_admin_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 3. Application Timeline Table (EXPERT FIX)

```sql
-- EXPERT CRITICAL FIX: Normalize timeline to avoid JSONB array races
-- This replaces the problematic application_timeline JSONB column
CREATE TABLE advisor_application_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  
  -- Timeline event details
  event TEXT NOT NULL, -- 'submitted', 'review_started', 'approved', 'rejected', 'activated'
  title TEXT NOT NULL,
  description TEXT,
  
  -- Actor tracking for audit
  actor_type TEXT CHECK (actor_type IN ('system', 'admin')) DEFAULT 'system',
  actor_id UUID, -- admin user id when relevant
  
  -- Metadata
  metadata JSONB DEFAULT '{}', -- flexible storage for event-specific data
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_advisor_timeline_advisor ON advisor_application_timeline(advisor_id, created_at);
CREATE INDEX idx_advisor_timeline_event ON advisor_application_timeline(event);
CREATE INDEX idx_advisor_timeline_actor ON advisor_application_timeline(actor_type, actor_id);

-- RLS Policies for timeline
ALTER TABLE advisor_application_timeline ENABLE ROW LEVEL SECURITY;

-- Applicants can read their own timeline
CREATE POLICY "Users can view their own timeline" ON advisor_application_timeline
  FOR SELECT USING (
    advisor_id IN (
      SELECT id FROM advisors WHERE user_id = auth.uid()
    )
  );

-- EXPERT FIX: Role-scoped policies (cleaner than current_setting checks)
CREATE POLICY "Service role full access to timeline" ON advisor_application_timeline
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admins can create timeline events
CREATE POLICY "Admins can manage timeline" ON advisor_application_timeline
  FOR ALL TO admin USING (true) WITH CHECK (true);
```

## API Endpoints

### 1. Draft Management Endpoints

#### `POST /api/v1/advisors/drafts`
Save or update application draft (EXPERT FIX: Uses UPSERT by user_id)

**Request Body:**
```json
{
  "step": 1,
  "data": {
    "personal": {
      "display_name": "John Doe",
      "bio": "Full-stack developer with 5 years experience...",
      "years_experience": 5,
      "portfolio_url": "https://johndoe.dev"
    }
  }
}
```

**Backend Implementation (EXPERT FIX):**
```sql
-- Use UPSERT to prevent duplicate drafts from rapid auto-saves
INSERT INTO advisor_application_drafts (
  user_id, current_step, last_saved_step, personal_data, professional_data, consultation_data
) VALUES (
  $1, $2, $3, $4, $5, $6
) ON CONFLICT (user_id) DO UPDATE SET
  current_step = EXCLUDED.current_step,
  last_saved_step = EXCLUDED.last_saved_step,
  personal_data = CASE WHEN $2 = 1 THEN EXCLUDED.personal_data ELSE advisor_application_drafts.personal_data END,
  professional_data = CASE WHEN $2 = 2 THEN EXCLUDED.professional_data ELSE advisor_application_drafts.professional_data END,
  consultation_data = CASE WHEN $2 = 3 THEN EXCLUDED.consultation_data ELSE advisor_application_drafts.consultation_data END,
  updated_at = NOW()
RETURNING id, current_step, updated_at;
```

**Response:**
```json
{
  "success": true,
  "data": {
    "draft_id": "uuid",
    "current_step": 1,
    "last_saved": "2025-08-27T12:00:00Z",
    "is_complete": false
  }
}
```

#### `GET /api/v1/advisors/drafts/current`
Retrieve current user's draft

**Response:**
```json
{
  "success": true,
  "data": {
    "draft_id": "uuid",
    "personal_data": { ... },
    "professional_data": { ... },
    "consultation_data": { ... },
    "current_step": 2,
    "last_saved": "2025-08-27T12:00:00Z",
    "is_complete": false
  }
}
```

#### `DELETE /api/v1/advisors/drafts/current`
Delete current draft (when application is submitted)

### 2. Application Submission Endpoint

#### `POST /api/v1/advisors/applications`
Submit complete application from draft

**Request Body:**
```json
{
  "draft_id": "uuid",
  "final_data": {
    "personal": { ... },
    "professional": { ... },
    "consultation": { ... }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "application_id": "uuid",
    "status": "submitted",
    "submitted_at": "2025-08-27T12:00:00Z"
  }
}
```

### 3. Enhanced Status Tracking

#### `GET /api/v1/advisors/application-status`
Get current application status with normalized timeline (EXPERT FIX)

**Backend Implementation:**
```sql
-- Query advisor with timeline from normalized table
SELECT 
  a.id as advisor_id,
  a.approval_status,
  a.onboarding_steps,
  a.review_started_at,
  a.review_completed_at,
  a.onboarding_completed_at,
  -- Get timeline from normalized table
  (
    SELECT json_agg(
      json_build_object(
        'event', t.event,
        'timestamp', t.created_at,
        'title', t.title,
        'description', t.description,
        'actor_type', t.actor_type
      ) ORDER BY t.created_at
    )
    FROM advisor_application_timeline t 
    WHERE t.advisor_id = a.id
  ) as timeline
FROM advisors a 
WHERE a.user_id = $1;
```

**Response (EXPERT FIX: Machine keys for i18n):**
```json
{
  "success": true,
  "data": {
    "state": "UNDER_REVIEW",
    "advisor_id": "uuid",
    "timeline": [
      {
        "event": "submitted",
        "timestamp": "2025-08-27T10:00:00Z",
        "title": "Application Submitted",
        "description": "Your application has been received",
        "actor_type": "system"
      },
      {
        "event": "review_started", 
        "timestamp": "2025-08-27T14:00:00Z",
        "title": "Review Started",
        "description": "Our team is reviewing your application",
        "actor_type": "admin"
      }
    ],
    "metadata": {
      "submitted_at": "2025-08-27T10:00:00Z",
      "review_started_at": "2025-08-27T14:00:00Z",
      "estimated_completion": "2025-08-29T17:00:00Z"
    },
    "onboarding_progress": {
      "stripe_connected": false,
      "calcom_connected": false,
      "profile_complete": true
    }
  }
}
```

### 4. Admin Timeline Management

#### `POST /api/v1/admin/advisors/{id}/timeline`
Add timeline event (admin only) - EXPERT FIX: Uses normalized timeline table

**Request Body:**
```json
{
  "event": "review_completed",
  "title": "Application Approved", 
  "description": "Application meets all requirements",
  "admin_notes": "Strong technical background, good communication skills"
}
```

**Backend Implementation (EXPERT FIX):**
```sql
-- Insert into normalized timeline table
INSERT INTO advisor_application_timeline (
  advisor_id, event, title, description, actor_type, actor_id, metadata
) VALUES (
  $1, $2, $3, $4, 'admin', $5, 
  CASE WHEN $6 IS NOT NULL 
    THEN json_build_object('admin_notes', $6)::jsonb 
    ELSE '{}'::jsonb 
  END
);

-- Update advisor table if needed (e.g., review timestamps)
UPDATE advisors 
SET 
  review_completed_at = CASE WHEN $2 = 'review_completed' THEN NOW() ELSE review_completed_at END,
  admin_notes = COALESCE($6, admin_notes)
WHERE id = $1;
```

#### `PUT /api/v1/admin/advisors/{id}/status`
Update application status with timeline event

**Request Body:**
```json
{
  "status": "approved",
  "rejection_reason": null,
  "admin_notes": "Excellent candidate",
  "next_step": "onboarding"
}
```

## Backend Logic Requirements

### 1. Auto-Save Logic

```typescript
// Pseudo-code for auto-save implementation
async function saveDraft(userId: string, step: number, data: any) {
  // Validate data for current step
  const validationResult = validateStepData(step, data)
  
  if (!validationResult.isValid) {
    throw new Error(validationResult.errors.join(', '))
  }
  
  // Upsert draft record
  const draft = await upsertDraft(userId, {
    [`${getStepName(step)}_data`]: data,
    current_step: step,
    last_saved_step: step,
    updated_at: new Date()
  })
  
  return draft
}
```

### 2. Application State Transitions

```typescript
// State transition rules
const STATE_TRANSITIONS = {
  'DRAFT': ['SUBMITTED'],
  'SUBMITTED': ['UNDER_REVIEW', 'REJECTED_COOLDOWN'],
  'UNDER_REVIEW': ['APPROVED_PENDING_ONBOARDING', 'REJECTED_COOLDOWN'],
  'APPROVED_PENDING_ONBOARDING': ['LIVE'],
  'LIVE': [], // Terminal state
  'REJECTED_COOLDOWN': ['NO_APPLICATION'] // After cooldown period
}

async function updateApplicationStatus(applicationId: string, newStatus: string, metadata: any) {
  const current = await getApplication(applicationId)
  
  if (!isValidTransition(current.status, newStatus)) {
    throw new Error(`Invalid status transition from ${current.status} to ${newStatus}`)
  }
  
  // Update status and add timeline event
  await Promise.all([
    updateApplication(applicationId, { status: newStatus, ...metadata }),
    addTimelineEvent(applicationId, {
      event: newStatus.toLowerCase(),
      timestamp: new Date(),
      title: getStatusTitle(newStatus),
      description: getStatusDescription(newStatus)
    })
  ])
}
```

### 3. Timeline Event Management (EXPERT FIX)

```typescript
// EXPERT FIX: Use normalized timeline table instead of JSONB arrays
async function addTimelineEvent(advisorId: string, event: TimelineEvent, actorId?: string) {
  await supabase
    .from('advisor_application_timeline')
    .insert({
      advisor_id: advisorId,
      event: event.event,
      title: event.title,
      description: event.description,
      actor_type: event.actorType || 'system',
      actor_id: actorId,
      metadata: event.metadata || {}
    })
}

// Helper function to get timeline for an advisor
async function getAdvisorTimeline(advisorId: string) {
  const { data, error } = await supabase
    .from('advisor_application_timeline')
    .select('*')
    .eq('advisor_id', advisorId)
    .order('created_at', { ascending: true })
  
  if (error) throw error
  return data
}

// Batch timeline operations for complex state changes
async function addTimelineEvents(advisorId: string, events: TimelineEvent[], actorId?: string) {
  const timelineEntries = events.map(event => ({
    advisor_id: advisorId,
    event: event.event,
    title: event.title,
    description: event.description,
    actor_type: event.actorType || 'system',
    actor_id: actorId,
    metadata: event.metadata || {}
  }))
  
  await supabase
    .from('advisor_application_timeline')
    .insert(timelineEntries)
}
```

## Notification Requirements

### 1. Email Notifications

- **Draft Auto-Save Confirmation**: Optional email when draft is saved
- **Application Submitted**: Confirmation email with timeline
- **Status Updates**: Email when status changes (review started, approved, rejected)
- **Onboarding Reminders**: Email reminders for incomplete onboarding steps

### 2. In-App Notifications

- Real-time status updates via websockets or polling
- Draft save confirmations
- Next step guidance

## Security Considerations

### 1. Data Validation

- Validate all form data on the server side
- Sanitize HTML content in bio and description fields
- Validate URLs for portfolio, LinkedIn, GitHub
- Rate limit draft save operations

### 2. Access Control

- Users can only access their own drafts and applications
- Admin endpoints require proper role verification
- Timeline events can only be added by admins or system processes

### 3. Data Privacy

- Draft data should be automatically cleaned up after successful application submission
- Failed drafts should be cleaned up after 30 days of inactivity
- Admin notes should not be visible to applicants

## Performance Considerations

### 1. Database Optimization

- Index user_id columns for fast lookups
- Use JSONB for flexible schema while maintaining query performance
- Implement database-level constraints for data integrity

### 2. API Optimization

- Cache application status responses for 5 minutes
- Use database triggers for automatic timeline event creation
- Implement pagination for admin timeline views

### 3. Auto-Save Optimization

- Debounce auto-save requests on frontend (30 seconds)
- Use optimistic updates for better UX
- Batch multiple field updates into single API call

## Migration Strategy

### 1. Backward Compatibility

- Existing advisors table structure remains unchanged
- New fields added with default values
- Old application submissions continue to work

### 2. Data Migration

- Convert existing application data to new timeline format
- Create initial timeline events for existing applications
- Migrate any existing draft data if applicable

### 3. Feature Flags

- `ENABLE_MULTI_STEP_APPLICATION`: Controls new form vs old form
- `ENABLE_AUTO_SAVE`: Controls auto-save functionality
- `ENABLE_ENHANCED_TIMELINE`: Controls timeline display

## Testing Requirements

### 1. Unit Tests

- Draft save/load operations
- State transition validation
- Timeline event creation
- Data validation logic

### 2. Integration Tests

- Complete application flow (draft → submit → approve → onboard)
- Auto-save functionality under various conditions
- Admin status update workflows
- Email notification delivery

### 3. Performance Tests

- Auto-save under high load
- Timeline query performance with large datasets
- Concurrent draft modifications

This document provides a comprehensive foundation for implementing the Phase 2 backend requirements. The frontend components created in this phase are designed to work seamlessly with these backend specifications.

---

## 🔄 **Expert Review Integration (August 2025)**

### ✅ **Expert Round 1 Recommendations Adopted**

**Critical Database Fixes:**
1. **Normalized Timeline Table** - Replaced problematic JSONB array with proper `advisor_application_timeline` table
2. **One Draft Per User** - Added `UNIQUE (user_id)` constraint to prevent duplicate drafts  
3. **Proper RLS Policies** - Split into separate SELECT/INSERT/UPDATE policies for better security
4. **updated_at Trigger** - Fixed the classic "DEFAULT doesn't fire on UPDATE" bug
5. **JSONB Size Limits** - Added CHECK constraints to prevent abuse (10KB per field)
6. **URL Validation** - Added regex constraints for portfolio, LinkedIn, GitHub URLs
7. **Admin Notes Privacy** - Separate RLS policies to hide admin notes from applicants
8. **Soft Delete Support** - Added `deleted_at` for draft cleanup without data loss

**API & Logic Improvements:**
9. **UPSERT Drafts** - Prevents race conditions from rapid auto-save requests
10. **Timeline Normalization** - Enables pagination, audit trails, and proper querying
11. **Machine Keys for i18n** - Returns event keys for client-side localization  
12. **Actor Tracking** - Timeline includes system vs admin attribution for audit

### ✅ **Expert Round 2 Critical Bug Fixes**

**CRITICAL BUGS CAUGHT:**
13. **Admin Notes Row Hiding Bug** ⚠️ - Fixed RLS that would hide entire advisor rows from non-admins
14. **Soft-Delete + Unique Constraint Conflict** ⚠️ - Fixed with partial unique index `WHERE deleted_at IS NULL`
15. **Column Before Constraints** ⚠️ - Fixed migration order: add URL columns first, then CHECK constraints

**MAJOR IMPROVEMENTS:**
16. **Role-Scoped Policies** - Cleaner `FOR ALL TO service_role` vs `current_setting()` checks
17. **Column-Level UPDATE Grants** - Elegant server-controlled flags via PostgreSQL column permissions  
18. **Separate Admin Notes Table** - Prevents RLS row-hiding bug with clean data separation
19. **GIN Index for Skills** - Performance optimization for JSONB queries (`@>` operator)
20. **Explicit Soft-Delete Policy** - Complete RLS coverage for soft-delete operations

### 🤔 **Expert Recommendations Deferred (MVP Scope)**

**Webhook Integration:**
- **Recommendation**: Server-controlled onboarding flags via Stripe/Cal.com webhooks  
- **MVP Decision**: Start with admin-controlled flags, add webhooks in Phase 4
- **Reason**: Webhook infrastructure adds significant complexity for MVP launch

**Application Abstraction:**  
- **Recommendation**: Use `application_id` instead of `advisor_id` for reapplication support
- **MVP Decision**: Use `advisor_id` directly, add applications table later if needed
- **Reason**: No reapplication requirement in MVP scope

**Advanced API Features:**
- **Recommendation**: Idempotency headers and rate limiting
- **MVP Decision**: Frontend debouncing (30s) is sufficient for MVP
- **Reason**: Infrastructure overhead vs. benefit for launch timeline

**Database State Views:**
- **Recommendation**: PostgreSQL views for state computation
- **MVP Decision**: Keep state logic in TypeScript state machine  
- **Reason**: Existing logic is tested, debuggable, and maintainable

### 🚀 **Implementation Priority**

**Phase 2 (Immediate):**
- ✅ All critical database fixes (normalized timeline, constraints, triggers)
- ✅ Improved API implementations (UPSERT, proper queries)
- ✅ Security hardening (RLS, admin note privacy, URL validation)

**Phase 4 (Future Enhancement):**
- 🔄 Webhook-driven onboarding status
- 🔄 Advanced rate limiting and idempotency  
- 🔄 Application abstraction for reapplication support
- 🔄 Database feature flag management

The expert's feedback significantly improved the robustness and scalability of our backend architecture while maintaining appropriate scope for MVP launch.

---

## 🚀 **Quick Implementation Patch (Drop-in Ready)**

For immediate implementation, here's the expert's surgical patch that can be applied today:

```sql
-- 1) Fix soft-delete unique constraint conflict
ALTER TABLE advisor_application_drafts DROP CONSTRAINT IF EXISTS uq_drafts_user;
CREATE UNIQUE INDEX uq_drafts_user_active
  ON advisor_application_drafts(user_id)
  WHERE deleted_at IS NULL;

-- 2) Role-scoped policies (cleaner than current_setting)
CREATE POLICY drafts_service_all ON advisor_application_drafts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY timeline_service_all ON advisor_application_timeline
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Add URL columns (if missing) before CHECK constraints
ALTER TABLE advisors
  ADD COLUMN IF NOT EXISTS portfolio_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url  TEXT,
  ADD COLUMN IF NOT EXISTS github_url    TEXT;

-- 4) Column-level UPDATE control for server-controlled flags
REVOKE UPDATE ON advisors FROM authenticated;
GRANT  UPDATE (display_name, bio, avatar_url, skills, specialties, languages, 
               portfolio_url, linkedin_url, github_url, is_accepting_bookings)
  ON advisors TO authenticated;
GRANT  UPDATE (onboarding_steps, review_started_at, review_completed_at,
               onboarding_started_at, onboarding_completed_at, approval_status)
  ON advisors TO admin, service_role;

-- 5) Admin notes separate table (prevents row-hiding RLS bug)
CREATE TABLE advisor_admin_notes (
  advisor_id UUID PRIMARY KEY REFERENCES advisors(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE advisor_admin_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_only ON advisor_admin_notes
  FOR ALL TO admin USING (true) WITH CHECK (true);

-- 6) Performance: GIN index for skills queries
CREATE INDEX idx_drafts_professional_gin
  ON advisor_application_drafts USING GIN (professional_data jsonb_path_ops);
```

This patch addresses all critical bugs and provides the foundation for a robust, production-ready advisor backend system.