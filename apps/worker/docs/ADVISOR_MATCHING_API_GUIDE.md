# Advisor Matching API - Complete Integration Guide

## Quick Answers to Core Questions

### 1. **Does `/api/advisor-matching/match-requests` support automatic matching without user approval?**

**Yes, but with important nuances:**

The endpoint supports **automatic matching with deferred approval**. When you create a match request:

```typescript
POST /api/advisor-matching/match-requests
{
  "projectId": "uuid",
  "matchCriteria": {},
  "expiresInHours": 2
}
```

**What happens:**
- ✅ System **immediately** finds and assigns the best available advisor
- ✅ Match status is set to `'matched'` (not `'pending'`)
- ✅ Advisor is **not yet notified** (notification goes to outbox, requires processing)
- ❌ **Workspace access is NOT automatically granted** - requires approval workflow

**Important:** The match is created, but workspace access requires the full approval flow (see Question 2).

---

### 2. **Does `status: 'finalized'` automatically grant workspace access and enable chat?**

**✅ YES - Workspace access is now automatically provisioned! (Updated 2025-09-30)**

As of **September 2025**, the advisor matching system **automatically provisions workspace access** when matches reach `'finalized'` status.

**How it works:**
1. Client approves match → `POST /api/advisor-matching/matches/:matchId/client-decision`
2. Advisor accepts match → `POST /api/advisor-matching/matches/:matchId/advisor-decision`
3. When **both parties approve** (regardless of order), the system:
   - ✅ **Automatically moves status to `'finalized'`**
   - ✅ **Queues workspace provisioning** (queue-first pattern, resilient to failures)
   - ✅ **Grants project access** (adds to `project_advisors` table)
   - ✅ **Creates chat session** (adds to `unified_chat_sessions` table)
   - ✅ **Sends welcome message** (system message in chat)
   - ✅ **Broadcasts SSE event** (`advisor.workspace_ready`)

**API Response when both approved:**
```json
{
  "success": true,
  "data": {
    "status": "finalized",
    "workspaceProvisioning": "queued"
  },
  "correlationId": "..."
}
```

**Retry & Reliability:**
- Uses queue-first pattern (provisions even if initial attempt fails)
- Background worker retries up to 3 times with exponential backoff
- If all retries fail, match status automatically rolls back
- All operations are idempotent (safe to retry)

**Feature Flag:** Controlled by `ADVISOR_AUTO_PROVISION=true` environment variable

**No action required from frontend** - workspace access happens automatically after both parties approve!

---

### 3. **How does unified chat API route messages to matched advisors?**

**The persistent chat system uses `actor_type` and session participation:**

```typescript
// Send message in chat
POST /api/persistent-chat/v1/projects/:projectId/chat/messages
{
  "text": "Need help with authentication",
  "client_msg_id": "uuid",
  "mode": "unified",
  "actor_type": "client"  // ← Identifies sender role
}

// Chat service routes based on:
// 1. Project membership (project_advisors table)
// 2. Active chat sessions (unified_chat_sessions table)
// 3. SSE subscriptions (chat:projectId Redis channel)
```

**How it works:**
1. **Client sends message** → Saved to `unified_chat_messages` table
2. **Broadcast to Redis** → `chat:{projectId}` channel
3. **All active SSE subscribers receive** → Includes advisors subscribed via `/chat/stream`
4. **Frontend filters by actor_type** → Shows advisor messages with different UI

**Key Tables:**
- `unified_chat_messages` - Stores all messages with `actor_type`
- `unified_chat_sessions` - Tracks who's in the conversation
- `project_advisors` - Controls who has access to project chat

**Important:** Advisors must be added to `project_advisors` **before** they can see/send chat messages.

---

### 4. **What's the recommended real-time notification approach?**

**Recommendation: SSE (Server-Sent Events) - Already Production-Ready**

The persistent chat system provides **mature SSE infrastructure** that you should reuse for advisor notifications:

```typescript
// Subscribe to project events (includes advisor matches)
const eventSource = new EventSource(
  '/api/persistent-chat/v1/projects/${projectId}/chat/stream',
  { headers: { 'x-user-id': userId, 'x-sheen-locale': 'en' } }
);

eventSource.addEventListener('message.new', (event) => {
  const message = JSON.parse(event.data);
  if (message.actor_type === 'advisor') {
    // Show advisor message
  }
});

// Extend with custom advisor events (future):
eventSource.addEventListener('advisor.matched', (event) => {
  const match = JSON.parse(event.data);
  showNotification(`Advisor ${match.advisorName} matched!`);
});
```

**Why SSE over Polling/Supabase Realtime:**

| Feature | SSE (Current) | Polling | Supabase Realtime |
|---------|--------------|---------|-------------------|
| **Latency** | <100ms | 1-5s | <500ms |
| **Server Load** | Low | High | Medium |
| **Reconnection** | Automatic | Manual | Automatic |
| **Infrastructure** | ✅ Production | ❌ Inefficient | ⚠️ External dependency |
| **Chat Integration** | ✅ Native | ❌ Separate | ⚠️ Separate |

**Current Implementation:**
- ✅ SSE connection limits (max 3 per user)
- ✅ Automatic eviction of stale connections
- ✅ Last-Event-ID resumption
- ✅ Heartbeat keep-alive
- ✅ Redis broadcast for horizontal scaling

**Future Enhancement (Optional):**
```typescript
// Extend ChatBroadcastService to support advisor events
ChatBroadcastService.publish(projectId, {
  event: 'advisor.matched',
  data: {
    matchId: matchRequest.id,
    advisorId: matchRequest.matched_advisor_id,
    advisorName: 'John Doe',
    score: matchRequest.match_score,
    expiresAt: matchRequest.expires_at
  }
});
```

---

### 5. **What match criteria fields are required vs optional?**

**All fields are optional - the system uses intelligent defaults:**

```typescript
interface MatchCriteria {
  // Optional - System uses project's technology_stack if not provided
  techStack?: {
    framework?: string;      // 'react', 'nextjs', 'vue'
    languages?: string[];    // ['typescript', 'javascript']
    complexity_factors?: string[];  // ['authentication', 'payments']
  };

  // Optional - Defaults from environment variables
  scoringWeights?: {
    availability: number;    // Default: 40
    skills: number;          // Default: 35
    timezone: number;        // Default: 15
    preference: number;      // Default: 10
  };

  // Optional - System determines from project metadata
  projectComplexity?: 'simple' | 'medium' | 'complex';

  // Optional - For excluding specific advisors
  excludeAdvisors?: string[];  // Advisor IDs to exclude
}
```

**How it works:**
```typescript
// Minimal request (recommended):
POST /api/advisor-matching/match-requests
{
  "projectId": "uuid",
  "matchCriteria": {}  // ← Empty is fine!
}

// System automatically:
// 1. Reads project.technology_stack from database
// 2. Applies DEFAULT_SCORING_WEIGHTS
// 3. Uses admin preference rules if they exist
// 4. Falls back to simple availability-based matching for small teams (<50 advisors)
```

**Automatic Technology Detection:**
```typescript
// Project table already stores:
projects {
  id: UUID
  technology_stack: JSONB  // Auto-detected from package.json
  project_complexity: TEXT // 'simple' | 'medium' | 'complex'
}

// The service reads this automatically:
const projectData = await pool.query(`
  SELECT technology_stack, project_complexity
  FROM projects WHERE id = $1
`, [projectId]);
```

**When to provide criteria:**
- ❌ **Don't** provide for normal project creation (let system auto-detect)
- ✅ **Do** provide when testing specific matching scenarios
- ✅ **Do** provide when overriding default scoring weights
- ✅ **Do** provide when excluding specific advisors

---

### 6. **Who manages the `advisor_assignments` table - your backend or ours?**

**Both, but for different purposes:**

There are **TWO separate systems:**

#### **A. Production Matching: `advisor_match_requests` (Managed by Matching Service)**
```sql
-- This is the PRIMARY system for automatic matching
CREATE TABLE advisor_match_requests (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  status TEXT,  -- 'pending' → 'matched' → 'finalized'
  matched_advisor_id UUID,
  match_score DECIMAL(5,2),
  created_at TIMESTAMPTZ
);
```
**Used by:** Automatic matching algorithm
**You interact with:** `/api/advisor-matching/match-requests` endpoints

#### **B. Admin Override: `admin_advisor_assignments` (Managed by Admin Panel)**
```sql
-- This is for MANUAL admin assignments (highest priority)
CREATE TABLE admin_advisor_assignments (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  advisor_id UUID,
  assignment_type TEXT,  -- 'manual_assignment' | 'emergency_assignment'
  assigned_by UUID,      -- Admin user ID
  priority INTEGER,
  status TEXT,           -- 'active' | 'cancelled'
  reason TEXT
);
```
**Used by:** Admin panel for manual overrides
**You interact with:** `/api/advisor-matching/admin/assign-advisor`

#### **C. Workspace Access: `project_advisors` (You must manage)**
```sql
-- This is the WORKSPACE PERMISSION table (you must populate)
CREATE TABLE project_advisors (
  project_id UUID REFERENCES projects(id),
  advisor_id UUID REFERENCES auth.users(id),
  status TEXT,  -- 'active' | 'inactive'
  role TEXT,    -- 'advisor' | 'consultant'
  PRIMARY KEY (project_id, advisor_id)
);
```
**Used by:** Workspace access control, chat permissions
**You interact with:** Direct SQL or create an endpoint

**Integration Flow:**
```typescript
// 1. Automatic matching creates advisor_match_requests
await POST('/api/advisor-matching/match-requests', { projectId });

// 2. When status reaches 'finalized', YOU copy to project_advisors:
await pool.query(`
  INSERT INTO project_advisors (project_id, advisor_id, status, role)
  SELECT project_id, matched_advisor_id, 'active', 'advisor'
  FROM advisor_match_requests
  WHERE id = $1 AND status = 'finalized'
`, [matchRequestId]);

// 3. Now advisor has workspace + chat access
```

**Summary:**
| Table | Purpose | Managed By | Automatic? |
|-------|---------|------------|------------|
| `advisor_match_requests` | Matching algorithm | Backend service | ✅ Yes |
| `admin_advisor_assignments` | Admin overrides | Admin panel | ❌ Manual |
| `project_advisors` | Workspace access | **Your integration code** | ⚠️ You must implement |

---

### 7. **What error handling is expected when no advisors are available?**

**The system returns a `'pending'` match for later processing:**

```typescript
// Request a match when no advisors are available:
POST /api/advisor-matching/match-requests
{
  "projectId": "uuid",
  "expiresInHours": 2
}

// Response (status 200):
{
  "success": true,
  "data": {
    "id": "match-uuid",
    "projectId": "project-uuid",
    "status": "pending",  // ← No advisor matched yet
    "score": null,
    "matchedAdvisor": null,
    "expiresAt": "2025-10-01T12:00:00Z",
    "createdAt": "2025-10-01T10:00:00Z"
  },
  "correlationId": "correlation-uuid"
}
```

**What happens next:**
1. **Match request created** with `status: 'pending'`
2. **Expires in 2 hours** (or custom `expiresInHours`)
3. **Background worker** can retry matching periodically
4. **Advisors can self-assign** if they become available

**Retry Strategy (Recommended):**
```typescript
// Implement a background job:
setInterval(async () => {
  // Find pending matches
  const pendingMatches = await pool.query(`
    SELECT * FROM advisor_match_requests
    WHERE status = 'pending'
      AND expires_at > now()
      AND created_at < now() - interval '5 minutes'  -- Don't retry immediately
  `);

  for (const match of pendingMatches.rows) {
    // Retry matching (backend handles race safety)
    await POST('/api/advisor-matching/match-requests', {
      projectId: match.project_id
    });
  }
}, 5 * 60 * 1000); // Every 5 minutes
```

**Error Codes:**
```typescript
interface MatchingError {
  success: false;
  error: string;
  code:
    | 'NO_ADVISORS_AVAILABLE'      // No advisors in system
    | 'ALL_ADVISORS_BUSY'          // All advisors at capacity
    | 'PROJECT_NOT_FOUND'          // Invalid projectId
    | 'DUPLICATE_MATCH_REQUEST'    // Already has open match
    | 'AUTHENTICATION_ERROR'       // Invalid auth claims
    | 'DATABASE_ERROR';            // Internal error
  correlationId: string;
}
```

**Production Handling:**
```typescript
try {
  const response = await createMatchRequest(projectId);

  if (response.data.status === 'pending') {
    // Show user: "Looking for available advisor..."
    showNotification({
      type: 'info',
      message: 'Searching for an available advisor. You\'ll be notified when matched.',
      duration: 5000
    });

    // Poll or wait for SSE event
    subscribeToMatchUpdates(projectId);
  } else if (response.data.status === 'matched') {
    // Show success
    showNotification({
      type: 'success',
      message: `Matched with ${response.data.matchedAdvisor.displayName}!`,
      action: 'View Profile'
    });
  }
} catch (error) {
  if (error.code === 'NO_ADVISORS_AVAILABLE') {
    showNotification({
      type: 'warning',
      message: 'No advisors available right now. We\'ll notify you when someone is ready.',
      duration: 10000
    });
  }
}
```

---

## Complete API Reference

### Base URL
```
/api/advisor-matching
```

### Authentication
All endpoints require:
- **HMAC signature validation** (via `requireHmacSignature()` middleware)
- **User claims header**: `x-sheen-claims` (JSON with `userId`, `email`, `roles`, `expires`)

---

## Match Request Management

### Create Match Request
```http
POST /api/advisor-matching/match-requests
```

**Request:**
```typescript
{
  projectId: string;           // UUID (required)
  matchCriteria?: {            // Optional - uses project defaults
    techStack?: TechnologyStack;
    scoringWeights?: ScoringWeights;
    excludeAdvisors?: string[];
  };
  expiresInHours?: number;     // Default: 2 hours
}
```

**Response (Success):**
```typescript
{
  success: true;
  data: {
    id: string;                // Match request UUID
    projectId: string;
    status: 'pending' | 'matched';
    matchedAdvisor?: {
      id: string;
      displayName: string;
      skills: string[];
      specialties: string[];
      rating: number;
    };
    score?: number;            // 0-100 match score
    expiresAt: string;         // ISO timestamp
    createdAt: string;
  };
  correlationId: string;
}
```

**Idempotency:**
- Returns existing match if one is already open for the project
- Use `correlationId` for request tracing

---

### Get Match Requests for Project
```http
GET /api/advisor-matching/projects/:projectId/matches
```

**Response:**
```typescript
{
  success: true;
  data: MatchRequestResponse[];
  correlationId: string;
}
```

---

## Approval Workflow

### Client Decision
```http
POST /api/advisor-matching/matches/:matchId/client-decision
```

**Request:**
```typescript
{
  decision: 'approved' | 'declined';
  reason?: string;  // Optional explanation
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    status: 'client_approved' | 'client_declined';
  };
  correlationId: string;
}
```

---

### Advisor Decision
```http
POST /api/advisor-matching/matches/:matchId/advisor-decision
```

Same interface as client decision, sets status to `'advisor_accepted'` or `'advisor_declined'`.

---

## Match Lifecycle States

```
pending → matched → client_approved → advisor_accepted → finalized
           ↓              ↓                   ↓
        expired    client_declined    advisor_declined
```

**State Descriptions:**
- `pending` - No advisor matched yet (waiting for availability)
- `matched` - Advisor found and assigned, awaiting approval
- `client_approved` - Client approved, waiting for advisor response
- `client_declined` - Client rejected the match
- `advisor_accepted` - Advisor accepted, waiting for client approval
- `advisor_declined` - Advisor rejected the match
- `finalized` - Both parties approved (**workspace access automatically provisioned**)
- `expired` - Match request expired before completion

**✅ Automatic Workspace Provisioning (Updated 2025-09-30):**

When status reaches `finalized`, the backend **automatically**:
1. Adds advisor to `project_advisors` table (status: 'active')
2. Creates `unified_chat_sessions` entry for advisor
3. Sends welcome system message to project chat
4. Broadcasts `advisor.workspace_ready` SSE event to all project subscribers

**No manual SQL required** - the approval endpoints handle everything via a queue-first pattern with automatic retry on failure.

**Feature Flag:** Controlled by `ADVISOR_AUTO_PROVISION=true` environment variable (enabled by default in production).

See [Question 2](#2-does-status-finalized-automatically-grant-workspace-access-and-enable-chat) for complete details on auto-provisioning behavior.

---

## Advisor Availability Management

### Update Availability
```http
PUT /api/advisor-matching/availability
```

**Request:**
```typescript
{
  status: 'available' | 'busy' | 'offline';
  maxConcurrentProjects?: number;  // Default: 3
  availabilityPreferences?: {
    autoAccept?: boolean;
    preferredComplexity?: ('simple' | 'medium' | 'complex')[];
    preferredFrameworks?: string[];
  };
}
```

---

### Get Availability Status
```http
GET /api/advisor-matching/availability
```

**Response:**
```typescript
{
  success: true;
  data: {
    advisor_id: string;
    is_available: boolean;
    status: 'available' | 'busy' | 'offline';
    current_capacity: number;   // Current active projects
    max_capacity: number;       // Max concurrent projects
    reason?: string;            // Why not available (if false)
  };
}
```

---

## Admin Endpoints

### Manual Assignment (Admin Only)
```http
POST /api/advisor-matching/admin/assign-advisor
```

**Request:**
```typescript
{
  projectId: string;
  advisorId: string;
  reason?: string;
  assignmentType?: 'manual_assignment' | 'emergency_assignment';
}
```

**Priority:** Admin assignments take **highest priority** over automatic matching.

---

### Pool Status Dashboard (Admin Only)
```http
GET /api/advisor-matching/admin/dashboard/pool-status
```

**Response:**
```typescript
{
  success: true;
  data: {
    totalAdvisors: number;
    statusBreakdown: {
      available: number;
      busy: number;
      offline: number;
    };
    workloadBreakdown: {
      idle: number;
      available: number;
      at_capacity: number;
    };
    poolSize: 'small' | 'medium' | 'large';
    algorithm: 'simple_availability' | 'complex_scoring';
  };
}
```

**Algorithm Selection:**
- `small` (<10 advisors): Simple availability-based matching
- `medium` (10-49 advisors): Simple availability-based matching
- `large` (50+ advisors): Complex skill-based scoring

---

## Database Schema

### Key Tables

#### advisor_match_requests
```sql
CREATE TABLE advisor_match_requests (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  requested_by UUID REFERENCES auth.users(id),
  match_criteria JSONB,
  status TEXT,                      -- See lifecycle states above
  matched_advisor_id UUID REFERENCES auth.users(id),
  match_score DECIMAL(5,2),
  match_reason TEXT,
  expires_at TIMESTAMPTZ,
  scoring_features JSONB,           -- Explainability data
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### advisor_availability
```sql
CREATE TABLE advisor_availability (
  advisor_id UUID PRIMARY KEY,
  status TEXT,                      -- 'available' | 'busy' | 'offline'
  max_concurrent_projects INTEGER,
  current_projects INTEGER,         -- Real-time count
  last_active TIMESTAMPTZ,
  availability_preferences JSONB,
  updated_at TIMESTAMPTZ
);
```

#### project_advisors (Workspace Access)
```sql
CREATE TABLE project_advisors (
  project_id UUID REFERENCES projects(id),
  advisor_id UUID REFERENCES auth.users(id),
  status TEXT,                      -- 'active' | 'inactive'
  role TEXT,                        -- 'advisor' | 'consultant'
  assigned_at TIMESTAMPTZ,
  PRIMARY KEY (project_id, advisor_id)
);
```

---

## Integration Checklist

### Phase 1: Basic Matching
- [ ] Create match request on project creation
- [ ] Display match status in UI
- [ ] Handle `'pending'` state with retry logic
- [ ] Show advisor profile when matched

### Phase 2: Approval Workflow
- [ ] Implement client approval UI
- [ ] Implement advisor notification flow
- [ ] Add advisor acceptance UI
- [ ] Handle all status transitions

### Phase 3: Workspace Integration
- [ ] Listen for `'finalized'` status
- [ ] Add advisor to `project_advisors` table
- [ ] Grant workspace access
- [ ] Create unified chat session
- [ ] Test end-to-end collaboration

### Phase 4: Real-time Notifications
- [ ] Extend SSE subscriptions for advisor events
- [ ] Add `advisor.matched` event handling
- [ ] Add `advisor.accepted` event handling
- [ ] Implement browser notifications

---

## Testing Endpoints

### Health Check
```http
GET /api/advisor-matching/health
```

**Response:**
```typescript
{
  success: true;
  service: 'advisor-matching';
  status: 'healthy';
  timestamp: string;
}
```

---

## Error Handling Best Practices

```typescript
interface ErrorResponse {
  success: false;
  error: string;              // Human-readable message
  code?: string;              // Machine-readable code
  correlationId: string;      // For support tickets
}

// Example error handling:
try {
  const match = await createMatch(projectId);
} catch (error) {
  if (error.code === 'NO_ADVISORS_AVAILABLE') {
    // Show "searching" UI
    showSearchingState();
  } else if (error.code === 'DUPLICATE_MATCH_REQUEST') {
    // Fetch existing match
    const existing = await getMatches(projectId);
    showExistingMatch(existing[0]);
  } else {
    // Generic error handling
    showError(error.message);
    logToSentry(error, { correlationId: error.correlationId });
  }
}
```

---

## Performance Considerations

### Connection Limits
- SSE connections: **3 per user** (automatic eviction)
- Match requests: **1 open per project** (idempotency)
- Notification retries: **3 attempts** (exponential backoff)

### Response Times
- Match creation: **< 500ms** (single DB transaction)
- Availability check: **< 100ms** (Redis-backed)
- SSE connection: **< 200ms** (persistent stream)

### Scalability
- Matching algorithm: **O(n log n)** where n = available advisors
- Algorithm switches to simple mode for **< 50 advisors**
- Uses `FOR UPDATE SKIP LOCKED` for **race-safe advisor selection**

---

## Support & Debugging

### Correlation IDs
All responses include `correlationId` for tracing:
```typescript
{
  success: true,
  data: { ... },
  correlationId: "550e8400-e29b-41d4-a716-446655440000"
}
```

### Logging
Server logs include:
- Match request creation
- Advisor selection rationale
- Approval state transitions
- Notification delivery attempts

### Common Issues

**"No advisors available"**
- Check advisor pool status: `GET /admin/dashboard/pool-status`
- Verify advisors have `status: 'available'`
- Check capacity: `current_projects < max_concurrent_projects`

**"Match expires before approval"**
- Increase `expiresInHours` (default 2)
- Implement SSE for real-time approval notifications
- Add email/SMS notifications via notification outbox

**"Workspace access not working"**
- Verify advisor added to `project_advisors` table
- Check RLS policies on workspace tables
- Confirm chat session created in `unified_chat_sessions`

---

## Next Steps

1. **Start with health check:** `GET /api/advisor-matching/health`
2. **Create test match:** `POST /api/advisor-matching/match-requests`
3. **Check pool status:** `GET /api/advisor-matching/admin/dashboard/pool-status`
4. **Implement approval flow:** Client/advisor decision endpoints
5. **Subscribe to SSE events:** Extend chat stream subscriptions for `advisor.workspace_ready` event
6. **Handle finalization UI:** Display advisor join notifications when workspace is provisioned

For questions or issues, include the `correlationId` from API responses.

---

## Technical Reference: Auto-Provisioning Details

### SSE Event Structure

When workspace provisioning completes, the backend broadcasts this event to all project subscribers:

**Event Name:** `advisor.workspace_ready`

**Event Payload:**
```typescript
{
  id: string;              // Event sequence ID (monotonic, Redis-based)
  event: 'advisor.workspace_ready';
  data: {
    matchId: string;       // advisor_match_requests.id
    advisorId: string;     // Advisor's user_id (UUID)
    projectId: string;     // Project UUID
    timestamp: string;     // ISO 8601 timestamp
    seq: number;           // Monotonic sequence number for ordering
    userId: 'system';      // Always 'system' for provisioning events
    content: {             // Same as data (for backwards compatibility)
      matchId: string;
      advisorId: string;
      projectId: string;
      timestamp: string;
    }
  }
}
```

**How to Listen:**
```typescript
// Reuse existing persistent chat SSE connection
const eventSource = new EventSource(
  `/api/persistent-chat/v1/projects/${projectId}/chat/stream`,
  {
    headers: {
      'x-user-id': userId,
      'x-sheen-locale': 'en'
    }
  }
);

// Add listener for workspace ready event
eventSource.addEventListener('advisor.workspace_ready', (event) => {
  const payload = JSON.parse(event.data);

  console.log(`Advisor ${payload.data.advisorId} joined project!`);
  showNotification('Your advisor is ready to help!');

  // Optionally fetch advisor details:
  // await GET(`/api/advisors/${payload.data.advisorId}`)
});
```

**When is this event sent?**
- After workspace provisioning transaction commits successfully
- Before the approval endpoint returns its response
- Broadcast is non-blocking (won't delay API response)

---

### Chat Session Structure

**Table:** `unified_chat_sessions`

**Fields Created by Auto-Provisioning:**
```sql
CREATE TABLE unified_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,              -- Project being advised
  user_id UUID NOT NULL,                 -- Advisor's user ID
  actor_type TEXT NOT NULL,              -- Always 'advisor' for advisors
  session_state TEXT NOT NULL,           -- Always 'active' on provision
  preferred_locale TEXT,                 -- Copied from project owner's locale
  session_id VARCHAR(255) NOT NULL,      -- Auto-generated session identifier
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',

  -- Unique constraint: One session per (project, user)
  UNIQUE(project_id, user_id)
);
```

**What Gets Inserted:**
```sql
INSERT INTO unified_chat_sessions (
  project_id, user_id, actor_type, session_state, preferred_locale
) VALUES (
  'project-uuid',
  'advisor-uuid',
  'advisor',
  'active',
  'en'  -- or 'ar', 'fr', etc. from project owner
)
ON CONFLICT (project_id, user_id)
DO UPDATE SET session_state = 'active';
```

**Chat Access:**
- ✅ Advisor automatically gets chat access (via `project_advisors` RLS policies)
- ✅ Advisor can immediately send/receive messages
- ✅ No additional subscription step needed
- ✅ SSE connection automatically includes advisor in broadcasts

---

### Welcome Message Details

**Message Sent to Chat:**
```
"Advisor has joined the workspace and is ready to help!"
```

**Message Metadata (response_data field):**
```json
{
  "event_code": "advisor_joined",
  "advisor_id": "advisor-uuid",
  "match_id": "match-request-uuid",
  "timestamp": "2025-09-30T12:34:56.789Z"
}
```

**Message Properties:**
- **Table:** `project_chat_log_minimal`
- **user_id:** `NULL` (system messages have no user)
- **actor_type:** `'system'`
- **message_type:** `'system'`
- **mode:** `'plan'`

**Localization:**
- Message text is currently **English only**
- Frontend can localize using `event_code: "advisor_joined"` from `response_data`
- Recommended: Detect `message_type: 'system'` and `event_code`, then display localized text client-side

**Example Frontend Localization:**
```typescript
if (message.message_type === 'system' && message.response_data?.event_code === 'advisor_joined') {
  const localizedText = i18n.t('chat.advisor_joined', {
    en: 'Advisor has joined the workspace and is ready to help!',
    ar: 'انضم المستشار إلى مساحة العمل وهو جاهز للمساعدة!',
    fr: 'Le conseiller a rejoint l\'espace de travail et est prêt à aider!',
    // ... other locales
  });
  displaySystemMessage(localizedText, message.response_data.advisor_id);
}
```

---

### Rollback Behavior (Failure Handling)

**What Happens When Provisioning Fails After 3 Retries:**

1. **Status Rollback:**
   - Match status automatically reverts to its **previous state** (captured by database trigger)
   - Rollback uses: `COALESCE(previous_status, 'matched')`
   - Examples:
     - If finalized from `advisor_accepted` → rolls back to `advisor_accepted`
     - If finalized from `client_approved` → rolls back to `client_approved`
     - If previous_status is NULL → rolls back to `matched`

2. **Admin Notification:**
   - High-priority alert sent to all admins via `notification_outbox` table
   - Alert payload includes: `matchId`, `projectId`, `reason`, `timestamp`
   - Alert type: `'workspace_provisioning_failure'`

3. **Intervention Log:**
   - Entry created in `admin_matching_interventions` table
   - `intervention_type`: `'workspace_provisioning_failure'`
   - Includes rollback metadata and failure reason

4. **Client Notification:**
   - ❌ **Currently NOT implemented** - no SSE event sent to client/advisor
   - Status simply reverts, parties can re-approve
   - **Recommended Frontend Handling:**
     ```typescript
     // Poll match status if waiting for finalization
     const pollInterval = setInterval(async () => {
       const match = await GET(`/api/advisor-matching/matches/${matchId}`);

       if (match.status === 'finalized') {
         clearInterval(pollInterval);
         showSuccess('Workspace ready!');
       } else if (match.status !== 'pending') {
         // Status changed from finalized back to previous - provisioning failed
         clearInterval(pollInterval);
         showWarning('Setup incomplete. Please contact support or re-approve.');
       }
     }, 5000);
     ```

5. **Manual Retry:**
   - ❌ No dedicated retry endpoint currently exists
   - Workaround: Both parties can simply re-approve the match
   - Re-approval triggers new provisioning attempt with fresh retry counter

**Failure Reasons Logged:**
- Database connection errors
- Foreign key violations (advisor deleted during provisioning)
- Chat session creation failures
- SSE broadcast errors (non-critical, won't fail provisioning)

---

### Feature Flag Status

**Environment Variable:** `ADVISOR_AUTO_PROVISION`

**Accepted Values:**
- `'true'` or `'1'` → Auto-provisioning **enabled**
- `'false'` or `'0'` or unset → Auto-provisioning **disabled**

**Default in Production:** ✅ **ENABLED** (`ADVISOR_AUTO_PROVISION=true`)

**How to Check if Enabled (Frontend):**
- **Option 1:** Check API response on approval:
  ```json
  {
    "success": true,
    "data": {
      "status": "finalized",
      "workspaceProvisioning": "queued"  // ← Present if enabled
    }
  }
  ```

- **Option 2:** Backend health check (if needed):
  ```typescript
  GET /api/advisor-matching/health
  // Response includes feature flags in metadata (if exposed)
  ```

**Behavior When Disabled:**
- Approval endpoints work normally (update status to `finalized`)
- `workspaceProvisioning` field not present in response
- No automatic provisioning occurs
- Manual SQL required (old behavior documented in archives)

**Deployment Note:**
- Feature is production-ready as of migration 096
- Queue-first pattern ensures resilience even on first deployment
- Background worker auto-starts with server (`server.ts` integration)

---

### Queue Monitoring (For Debugging)

**Queue Table:** `workspace_provisioning_queue`

**Useful Admin Queries:**

```sql
-- Check pending provisioning jobs
SELECT id, match_id, status, attempt_count, next_retry_at, last_error
FROM workspace_provisioning_queue
WHERE status IN ('pending', 'processing', 'rollback_needed')
ORDER BY created_at DESC;

-- Check failed provisions
SELECT match_id, last_error, attempt_count, created_at
FROM workspace_provisioning_queue
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- Success rate (last 24 hours)
SELECT
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) as percentage
FROM workspace_provisioning_queue
WHERE created_at > now() - interval '24 hours'
GROUP BY status;
```

**Admin Dashboard Endpoint (if implemented):**
```typescript
GET /api/advisor-matching/admin/dashboard/provisioning-stats
// Returns queue metrics: success rate, avg retry count, failure reasons
```

---

## Frontend Implementation Guidance

### When to Trigger Match Requests?

**Recommended: Client-side immediately after project creation (Option B+)**

**Why client-side?**
- ✅ Fastest project creation response (<200ms instead of <700ms)
- ✅ Independent failure handling (project succeeds even if match fails)
- ✅ Separation of concerns (project creation ≠ advisor matching)
- ✅ Easier to show loading states separately

**Implementation Pattern:**
```typescript
// ✅ RECOMMENDED: Client-side with immediate trigger
async function handleProjectCreation(projectData) {
  try {
    // 1. Create project first (fast)
    const project = await POST('/api/projects', projectData);

    // 2. Navigate to workspace immediately (user sees project)
    router.push(`/workspace/${project.id}`);

    // 3. Trigger match in background (don't await)
    triggerAdvisorMatch(project.id).catch(err => {
      console.error('Match request failed:', err);
      // Show non-blocking error (user can retry manually)
      toast.error('Could not find advisor. Click "Request Advisor" to retry.');
    });

  } catch (error) {
    // Handle project creation failure
    toast.error('Failed to create project');
  }
}

async function triggerAdvisorMatch(projectId: string) {
  const response = await POST('/api/advisor-matching/match-requests', {
    projectId,
    matchCriteria: {},  // Auto-detect from project metadata
    expiresInHours: 2
  });

  if (response.data.status === 'matched') {
    // Show match notification (advisor found)
    showMatchNotification(response.data);
  } else if (response.data.status === 'pending') {
    // Show "searching for advisor" message
    showSearchingUI();
  }
}
```

**❌ Avoid: Server-side blocking**
```typescript
// ❌ BAD: Delays project creation response
app.post('/api/projects', async (req, res) => {
  const project = await createProject(req.body);
  await triggerAdvisorMatch(project.id);  // ← Blocks response
  res.json(project);
});
```

**⚠️ Acceptable: Server-side fire-and-forget**
```typescript
// ⚠️ OKAY but not ideal: Server-side non-blocking
app.post('/api/projects', async (req, res) => {
  const project = await createProject(req.body);

  // Fire and forget - don't await
  triggerAdvisorMatch(project.id).catch(err =>
    logger.error('Auto-match failed', { projectId: project.id, err })
  );

  res.json(project);  // Returns immediately
});
```

**Performance Impact:**
- Project creation alone: **~200ms**
- Match request: **~500ms** (parallel DB query + scoring)
- **Total if sequential:** ~700ms ❌
- **Client-side approach:** User sees project in ~200ms, match happens in background ✅

---

### UI Pattern: Show Matches for All Projects or Just New Ones?

**Recommended: Hybrid Approach (Option B + C)**

**Pattern:**
1. **New projects** (created <48 hours ago): Auto-trigger matching, show "Finding advisor..." UI
2. **Old projects** (>48 hours, no advisor): Show "Request Advisor" button (opt-in)
3. **Projects with advisor**: Show advisor card

**Why hybrid?**
- ✅ Seamless onboarding for new users (automatic)
- ✅ Respects existing workflow (no spam for old projects)
- ✅ Allows opt-in for users who didn't want advisors initially

**Implementation:**
```typescript
function ProjectCard({ project }: { project: Project }) {
  const hasAdvisor = project.advisors?.length > 0;
  const isNewProject = Date.now() - new Date(project.created_at).getTime() < 48 * 60 * 60 * 1000;
  const [matchStatus, setMatchStatus] = useState<'idle' | 'searching' | 'found' | 'declined'>('idle');

  useEffect(() => {
    // Auto-trigger for new projects without advisors
    if (isNewProject && !hasAdvisor && matchStatus === 'idle') {
      setMatchStatus('searching');
      triggerAdvisorMatch(project.id)
        .then(match => {
          if (match.status === 'matched') {
            setMatchStatus('found');
            showMatchNotification(match);
          }
        })
        .catch(() => setMatchStatus('idle'));
    }
  }, [project.id, isNewProject, hasAdvisor, matchStatus]);

  // Render logic
  if (hasAdvisor) {
    return <AdvisorCard advisor={project.advisors[0]} />;
  }

  if (matchStatus === 'searching') {
    return (
      <div className="advisor-search">
        <Spinner />
        <p>Finding the perfect advisor for your project...</p>
      </div>
    );
  }

  if (matchStatus === 'found') {
    return <MatchFoundCard matchId={currentMatch.id} />;
  }

  // Old projects or manual request
  return (
    <button onClick={() => {
      setMatchStatus('searching');
      triggerAdvisorMatch(project.id);
    }}>
      <Icon name="sparkles" />
      Request Expert Advisor
    </button>
  );
}
```

**Dashboard View (Multiple Projects):**
```typescript
function ProjectDashboard({ projects }: { projects: Project[] }) {
  const projectsNeedingAdvisors = projects.filter(p => !p.advisors?.length);
  const newProjectsCount = projectsNeedingAdvisors.filter(p =>
    Date.now() - new Date(p.created_at).getTime() < 48 * 60 * 60 * 1000
  ).length;

  return (
    <div>
      {/* Only show banner for new projects (not overwhelming) */}
      {newProjectsCount > 0 && (
        <Banner>
          We're finding expert advisors for your {newProjectsCount} new {newProjectsCount === 1 ? 'project' : 'projects'}...
        </Banner>
      )}

      {/* Individual project cards handle their own UI */}
      {projects.map(project => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
```

**Alternative: Full Auto-trigger (if advisors are mandatory)**
```typescript
// If every project MUST have an advisor:
useEffect(() => {
  projects
    .filter(p => !p.advisors?.length)
    .forEach(project => {
      triggerAdvisorMatch(project.id);
    });
}, [projects]);
```

**Recommendation:** Start with **hybrid approach** (new projects only). Expand to auto-trigger for all projects later if product metrics show high opt-in rates on manual button.

---

### Handling Match Declines

**Recommended: Dialog with Options (Combination Approach)**

**Why show options?**
- ✅ Respects user intent (different reasons for declining)
- ✅ Offers immediate solution (retry or browse)
- ✅ Allows "not right now" without blocking workflow

**Implementation:**
```typescript
async function handleMatchDecision(matchId: string, decision: 'approve' | 'decline') {
  const response = await POST(`/api/advisor-matching/matches/${matchId}/client-decision`, {
    decision,
    userId: currentUser.id
  });

  if (decision === 'decline') {
    showDeclineDialog({
      title: "Match Declined",
      message: "Would you like to:",
      options: [
        {
          icon: "🔄",
          label: "Find a different advisor",
          description: "We'll search for another expert",
          action: async () => {
            // ✅ Immediate retry is fine (no artificial delay)
            const newMatch = await POST('/api/advisor-matching/match-requests', {
              projectId: response.data.projectId,
              matchCriteria: {},
              excludeAdvisors: [response.data.advisorId]  // ← Exclude declined advisor
            });
            showMatchNotification(newMatch);
          }
        },
        {
          icon: "👥",
          label: "Browse all advisors",
          description: "Choose from our full expert directory",
          action: () => {
            // ✅ Fallback to manual browsing
            router.push(`/advisors?project=${response.data.projectId}`);
          }
        },
        {
          icon: "⏰",
          label: "Maybe later",
          description: "You can request an advisor anytime",
          action: () => {
            // Just close dialog - no action needed
            // User can use "Request Advisor" button later
          }
        }
      ]
    });
  } else {
    // Approval flow (already documented)
    showApprovalSuccess();
  }
}
```

**Rate Limiting:**
- ❌ **NO artificial delays needed** (Option B rejected)
- ✅ Rely on `excludeAdvisors` to avoid re-matching same person
- ✅ If advisor pool is small, backend will return `status: 'pending'` naturally

**Backend Handles Edge Cases:**
```typescript
// Backend already handles:
// - Same advisor matched again → excluded via excludeAdvisors parameter
// - No available advisors → returns status: 'pending'
// - Too many rapid requests → idempotency via project_id unique constraint
```

**SSE Event for Declined Matches (Future Enhancement):**
```typescript
// Optional: Track decline count for analytics
eventSource.addEventListener('advisor.match_declined', (event) => {
  const { matchId, advisorId, projectId } = JSON.parse(event.data).data;

  // Log to analytics
  analytics.track('Match Declined', {
    matchId,
    advisorId,
    projectId,
    source: 'client_decision'
  });
});
```

**Auto-redirect to Browsing (Not Recommended):**
```typescript
// ❌ AVOID: Automatic redirect without user choice
if (decision === 'decline') {
  router.push(`/advisors?project=${projectId}`);  // ← Interrupts workflow
}

// ✅ BETTER: Show dialog, let user choose
showDeclineDialog({ ... });
```

**Error Handling:**
```typescript
// Handle advisor unavailability after decline
async function retryMatch(projectId: string, excludedAdvisors: string[]) {
  try {
    const match = await POST('/api/advisor-matching/match-requests', {
      projectId,
      matchCriteria: {},
      excludeAdvisors: excludedAdvisors
    });

    if (match.data.status === 'pending') {
      // No advisors available right now
      toast.warning('No advisors available at the moment. We\'ll notify you when someone becomes available.');

      // Optional: Set up polling or wait for SSE event
      pollForAvailableAdvisor(projectId);
    } else if (match.data.status === 'matched') {
      showMatchNotification(match.data);
    }
  } catch (error) {
    toast.error('Failed to find advisor. Please try browsing manually.');
  }
}
```

---

### Complete Flow Example

**End-to-End Implementation:**
```typescript
// 1. Project Creation Flow
async function createNewProject(data: ProjectData) {
  const project = await POST('/api/projects', data);
  router.push(`/workspace/${project.id}`);

  // Auto-trigger match for new project
  await triggerAdvisorMatch(project.id);
}

// 2. Match Notification
function MatchNotification({ match }: { match: Match }) {
  return (
    <Toast>
      <Avatar src={match.advisorProfile.avatar} />
      <div>
        <strong>{match.advisorProfile.displayName}</strong>
        <p>Expert in {match.advisorProfile.specialties.join(', ')}</p>
        <div className="actions">
          <button onClick={() => handleApproval(match.id)}>
            Approve Match
          </button>
          <button onClick={() => handleDecline(match.id)}>
            Find Someone Else
          </button>
        </div>
      </div>
    </Toast>
  );
}

// 3. Approval Handler
async function handleApproval(matchId: string) {
  const response = await POST(`/api/advisor-matching/matches/${matchId}/client-decision`, {
    decision: 'approve',
    userId: currentUser.id
  });

  if (response.data.workspaceProvisioning === 'queued') {
    showToast('Workspace being set up... Your advisor will join shortly!');

    // Listen for workspace ready event
    eventSource.addEventListener('advisor.workspace_ready', (event) => {
      showToast('Your advisor has joined! Start chatting now.');
      refreshProjectData();
    });
  }
}

// 4. Decline Handler
async function handleDecline(matchId: string) {
  await POST(`/api/advisor-matching/matches/${matchId}/client-decision`, {
    decision: 'decline',
    userId: currentUser.id
  });

  const choice = await showDeclineDialog();

  switch (choice) {
    case 'retry':
      await retryMatch(projectId, [declinedAdvisorId]);
      break;
    case 'browse':
      router.push(`/advisors?project=${projectId}`);
      break;
    case 'later':
      // Do nothing
      break;
  }
}

// 5. SSE Connection (Shared with Chat)
const eventSource = new EventSource(`/api/persistent-chat/v1/projects/${projectId}/chat/stream`);

eventSource.addEventListener('advisor.workspace_ready', (event) => {
  const { advisorId, matchId } = JSON.parse(event.data).data;
  showNotification(`Your advisor has joined! Start collaborating now.`);
  refreshAdvisorList();
});
```

---

For questions or issues, include the `correlationId` from API responses.