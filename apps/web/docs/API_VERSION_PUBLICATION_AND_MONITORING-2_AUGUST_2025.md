
## 🌐 **Publication System API**

### Overview
The publication system provides explicit user control over version deployment. Users create versions for preview/testing, then explicitly publish them to custom domains.

**Key Features:**
- **Publication-First Architecture**: Separate version creation from publication
- **Idempotent Operations**: Publishing is idempotent and usually completes in ≤5s (200). If redeployment is needed, you'll receive 202 Accepted with a job handle
- **Multi-Domain Support**: Both sheenapps.com subdomains and custom domains
- **Automatic Domain Resolution**: CNAME records updated on publication
- **Publication Control**: Users decide what goes live

### Request Signatures
All publication endpoints require HMAC-SHA256 signatures:

**Canonical string format**: `<raw-body><path-without-query>`
- Path example: `/projects/proj123/publish/ver456` (no query params)
- Use lowercase hex SHA-256 HMAC with your shared secret
- Empty body for GET requests: `<empty-string><path>`

```typescript
// Signature generation
const canonical = requestBody + pathWithoutQuery;
const signature = crypto.createHmac('sha256', sharedSecret).update(canonical).digest('hex');
```

---------


## 📜 **Enhanced Version History API**

### Overview
Get comprehensive version history with artifact availability, action permissions, and retention information for intelligent UI decisions.

**New Features in v2.4:**
- **Artifact Availability Metadata**: Know which versions can be rolled back or previewed
- **Action Permissions**: Smart `canRollback`, `canPreview`, `canPublish` flags with business logic
- **Accessibility Hints**: Specific reasons why actions are disabled (`artifact_expired`, `already_published`, etc.)
- **Retention Information**: Days until artifact expiration for user awareness

### 1. **GET /projects/:projectId/versions**

Get version history with publication status and artifact availability.

#### Request
```typescript
const response = await fetch(`${WORKER_BASE_URL}/projects/${projectId}/versions?state=all&limit=20`, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
});
```

#### Query Parameters
- `state` *(optional)*: Filter by publication state (`published`, `unpublished`, `all`). Default: `all`
- `limit` *(optional)*: Number of versions to return (max 100). Default: `20`
- `offset` *(optional)*: Pagination offset. Default: `0`
- `includePatches` *(optional)*: Include patch versions. Default: `false`
- `showDeleted` *(optional)*: Include soft-deleted versions. Default: `false`

#### Enhanced Response Format
```typescript
{
  "success": true,
  "versions": [
    {
      "id": "ver_abc123",
      "semver": "1.2.3",
      "name": "Bug fixes and mobile improvements",
      "description": "Fixed layout issues on mobile devices",
      "type": "patch",
      "createdAt": "2025-08-03T10:30:00Z",
      "deployedAt": "2025-08-03T10:32:15Z",
      "stats": {
        "filesChanged": 8,
        "linesAdded": 45,
        "linesRemoved": 12
      },

      // Publication information
      "isPublished": true,
      "publishedAt": "2025-08-03T11:00:00Z",
      "publishedBy": "user_456",
      "userComment": "Emergency mobile fix",
      "previewUrl": "https://abc123.pages.dev",

      // 🆕 Artifact availability metadata
      "hasArtifact": true,
      "artifactSize": 15728640,

      // 🆕 Smart action permissions with business logic
      "canPreview": true,
      "canRollback": false,  // Published versions can't be rolled back
      "canPublish": false,   // Already published
      "canUnpublish": true,

      // 🆕 Accessibility hints for UI decisions
      "accessibility": {
        "rollbackDisabledReason": "already_published",
        "previewDisabledReason": null
      },

      // 🆕 Retention information for user awareness
      "retention": {
        "expiresAt": "2025-09-02T10:30:00Z",
        "daysRemaining": 30
      }
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

#### Frontend Integration Example
```typescript
// Smart UI decisions based on artifact availability
function VersionRow({ version }: { version: Version }) {
  return (
    <div className="flex items-center justify-between p-3 border-b">
      <div>
        <h4>{version.name}</h4>
        <p className="text-sm text-gray-600">{version.description}</p>
        {!version.hasArtifact && (
          <p className="text-xs text-amber-600">
            ⚠️ Artifact expired ({version.retention.daysRemaining} days ago)
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          disabled={!version.canPreview}
          title={version.accessibility.previewDisabledReason
            ? `Cannot preview: ${version.accessibility.previewDisabledReason.replace('_', ' ')}`
            : "Preview this version"
          }
        >
          Preview
        </Button>
        <Button
          disabled={!version.canRollback}
          title={version.accessibility.rollbackDisabledReason
            ? `Cannot rollback: ${version.accessibility.rollbackDisabledReason.replace('_', ' ')}`
            : "Rollback to this version"
          }
        >
          Rollback
        </Button>
      </div>
    </div>
  );
}
```

#### Accessibility Reason Codes
- `"artifact_missing"`: Version has no artifact URL
- `"artifact_expired"`: Artifact pruned due to retention policy
- `"already_published"`: Cannot rollback published versions
- `"deployment_failed"`: Version deployment failed
- `null`: No restrictions, action is available





---------

### 1. **POST /projects/:projectId/publish/:versionId**

Publish a version to make it live on all configured domains.

#### Request
```typescript
const projectId = 'proj_abc123';
const versionId = 'ver_def456';
const body = JSON.stringify({
  userId: 'user_789',
  comment: 'Publishing stable version with bug fixes'
});

const response = await fetch(`${WORKER_BASE_URL}/projects/${projectId}/publish/${versionId}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateSignature(body, `/projects/${projectId}/publish/${versionId}`, WORKER_SHARED_SECRET),
    'Idempotency-Key': 'unique-key-123' // Optional: Prevents double-publishing
  },
  body
});
```

#### Response

**Success (200) - Immediate completion:**
```typescript
{
  "success": true,
  "message": "Version published successfully",
  "publication": {
    "versionId": "ver_def456",
    "publishedAt": "2025-08-02T10:30:00Z",
    "publishedBy": "user_789",
    "comment": "Publishing stable version with bug fixes"
  },
  "domains": {
    "updated": [
      {
        "domain": "myapp.sheenapps.com",
        "type": "sheenapps",
        "status": "active",
        "previewUrl": "https://abc123.pages.dev"
      },
      {
        "domain": "app.example.com",
        "type": "custom",
        "status": "pending_verification",
        "previewUrl": "https://abc123.pages.dev"
      }
    ],
    "failed": []
  }
}
```

**Queued (202) - Async processing:**
```typescript
{
  "success": true,
  "state": "queued",
  "jobId": "job_xyz789",
  "estimatedTime": "30-60s",
  "message": "Publication queued for processing"
}
```

### 2. **POST /projects/:projectId/unpublish**

Unpublish the current live version.

#### Request
```typescript
const body = JSON.stringify({ userId: 'user_789' });

const response = await fetch(`${WORKER_BASE_URL}/projects/${projectId}/unpublish`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateSignature(body, `/projects/${projectId}/unpublish`, WORKER_SHARED_SECRET)
  },
  body
});
```

#### Response
```typescript
{
  "success": true,
  "message": "Version unpublished successfully",
  "unpublishedVersion": "ver_def456",
  "notice": "Project has no published version until you publish a new one"
}
```

**Important**: Unpublishing removes the current live version entirely. The project will have no public site until you explicitly publish another version.

### 3. **GET /projects/:projectId/versions**

Get version history with publication status.

#### Request
```typescript
const params = new URLSearchParams({
  state: 'all', // 'published' | 'unpublished' | 'all'
  limit: '20',
  offset: '0'
});

const path = `/projects/${projectId}/versions?${params}`;
const response = await fetch(`${WORKER_BASE_URL}${path}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': generateSignature('', path, WORKER_SHARED_SECRET)
  }
});
```

#### Response
```typescript
{
  "success": true,
  "versions": [
    {
      "id": "ver_def456",
      "name": "v2.4.3",
      "description": "Bug fixes and performance improvements",
      "type": "patch",
      "createdAt": "2025-08-02T09:15:00Z",
      "isPublished": true,
      "publishedAt": "2025-08-02T10:30:00Z",
      "publishedBy": "user_789",
      "previewUrl": "https://abc123.pages.dev",
      "canPreview": true,
      "canPublish": false,
      "canUnpublish": true
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

### Publication Action Rules

The `canPublish`, `canUnpublish`, and `canPreview` flags follow these rules:

- **`canPublish: true`** - Version is deployed, not soft-deleted, and not currently published
- **`canPublish: false`** - Version is already published, soft-deleted, or build failed
- **`canUnpublish: true`** - Version is currently published
- **`canPreview: true`** - Version has a valid preview URL and deployment succeeded

### 4. **POST /projects/:projectId/domains**

Add a domain to the project.

**Domain Verification States:**
- **`pending_verification`** → Show DNS setup banner
- **`failed`** → Surface error & retry button
- **`active`** → Normal operation

#### Request
```typescript
const body = JSON.stringify({
  userId: 'user_789',
  domain: 'app.example.com',
  type: 'custom' // 'sheenapps' | 'custom'
});

const response = await fetch(`${WORKER_BASE_URL}/projects/${projectId}/domains`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateSignature(body, `/projects/${projectId}/domains`, WORKER_SHARED_SECRET)
  },
  body
});
```

---

## ↩️ **Rollback System API**

### Overview
The rollback system provides immediate version rollback with production-ready reliability. Users can instantly revert to any previous version while background processes handle working directory synchronization.

**Key Features:**
- **Immediate Response**: Preview URL updated instantly (< 1 second)
- **Background Sync**: Working directory synchronization handled asynchronously
- **Production Safety**: Redis locking, idempotency, and failure recovery
- **Build Queue Management**: Queues new builds during rollback, processes after completion
- **Publication Control**: Rollbacks create unpublished versions requiring explicit publication

### Request Signatures
All rollback endpoints require HMAC-SHA256 signatures with timing-safe comparison:

**Canonical string format**: `<raw-body><path-without-query>`
- Example: `{"userId":"user123","projectId":"proj456","targetVersionId":"ver789"}/v1/versions/rollback`
- Use lowercase hex SHA-256 HMAC with your shared secret

### 1. **POST /v1/versions/rollback**

Rollback to a previous version with immediate preview update and background working directory sync.

#### Request
```typescript
const body = JSON.stringify({
  userId: 'user_123',
  projectId: 'proj_456',
  targetVersionId: 'ver_789',
  skipWorkingDirectory: false // Optional: true for CI/CD scenarios
});

const response = await fetch(`${WORKER_BASE_URL}/v1/versions/rollback`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateSignature(body, '/v1/versions/rollback', WORKER_SHARED_SECRET),
    'Idempotency-Key': 'rollback-unique-key-123' // Optional: Prevents duplicate rollbacks
  },
  body
});
```

#### Request Body
- `userId` *(required)*: User ID for ownership verification
- `projectId` *(required)*: Project identifier
- `targetVersionId` *(required)*: Version to rollback to
- `skipWorkingDirectory` *(optional)*: Skip working directory sync (useful for CI/CD)

#### Response

**Success (200) - Immediate response:**
```typescript
{
  "success": true,
  "message": "Rollback initiated - preview updated immediately",
  "rollbackVersionId": "ver_rollback_123",
  "targetVersionId": "ver_789",
  "previewUrl": "https://abc123.pages.dev",
  "status": "rollingBack", // or "deployed" if skipWorkingDirectory: true
  "jobId": "job_456", // Present if background sync is running
  "workingDirectory": {
    "synced": false, // true if skipWorkingDirectory: true
    "message": "Background sync queued", // or "Working directory sync skipped"
    "extractedFiles": 0
  },
  "publishInfo": {
    "isPublished": false,
    "canPublish": true,
    "publishEndpoint": "/projects/proj_456/publish/ver_rollback_123",
    "notice": "This rollback version is available for preview but not published. Use the publish endpoint to make it live."
  }
}
```

**Error Responses:**
- **401 Unauthorized**: Invalid HMAC signature
- **404 Not Found**: Target version not found or no artifact available
- **409 Conflict**: Another rollback already in progress for this project
- **422 Unprocessable Entity**: Target version has no preview URL (never deployed)

```typescript
// Example error response
{
  "error": "rollback_in_progress",
  "message": "Another rollback is already in progress for this project"
}
```

### 2. **Build Request Behavior During Rollback**

When a project is in `rollingBack` status, new build requests are automatically queued and processed after rollback completion:

#### Automatic Queuing Response
```typescript
{
  "success": true,
  "queued": true,
  "jobId": "job_789",
  "buildId": "build_456",
  "status": "queued_rollback_pending",
  "message": "Request queued - rollback in progress. Build will start when rollback completes."
}
```

### 3. **Project Status States**

The rollback system introduces new project status states:

- **`rollingBack`**: Transitional state during background sync
- **`rollbackFailed`**: Final error state when rollback sync fails
- **`deployed`**: Normal state after successful rollback completion

When status is `rollbackFailed`, new build requests are rejected:
```typescript
{
  "error": "rollback_failed",
  "message": "Recent rollback failed. Please resolve issues before building.",
  "status": "rollbackFailed"
}
```

### 4. **Idempotency and Rate Limiting**

#### Idempotency Protection
- Use `Idempotency-Key` header to prevent duplicate rollbacks
- Keys are cached for 24 hours for successful rollbacks only
- Failed rollbacks are not cached to allow retries

#### Lock Protection
- Redis-based locking prevents concurrent rollbacks per project
- Lock TTL is configurable via `MAX_ROLLBACK_DURATION_SECONDS` (default: 300s)
- Lock automatically renewed for large artifacts during background sync

### 5. **Migration from Deprecated Endpoint**

**⚠️ Deprecated Endpoint**: `POST /projects/:projectId/versions/:versionId/rollback`

The old async endpoint has been removed. Requests to the deprecated endpoint return:

```typescript
// HTTP 410 Gone
{
  "error": "endpoint_deprecated",
  "message": "This endpoint has been deprecated and removed",
  "replacement": {
    "endpoint": "POST /v1/versions/rollback",
    "documentation": "/docs/API_REFERENCE_FOR_NEXTJS.md",
    "changes": [
      "Requires HMAC signature authentication",
      "Immediate response with background processing",
      "Enhanced error handling and idempotency"
    ]
  },
  "deprecatedSince": "2025-08-03",
  "removedSince": "2025-08-03"
}
```

### Integration Example

```typescript
// Complete rollback flow with status polling
export async function rollbackVersion(
  projectId: string,
  targetVersionId: string,
  userId: string
) {
  const rollbackBody = JSON.stringify({
    userId,
    projectId,
    targetVersionId,
    skipWorkingDirectory: false
  });

  // 1. Initiate rollback
  const rollbackResponse = await fetch(`${WORKER_BASE_URL}/v1/versions/rollback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': generateSignature(rollbackBody, '/v1/versions/rollback', WORKER_SHARED_SECRET),
      'Idempotency-Key': `rollback-${projectId}-${Date.now()}`
    },
    body: rollbackBody
  });

  const rollback = await rollbackResponse.json();

  if (!rollback.success) {
    throw new Error(rollback.message);
  }

  // 2. Preview is immediately available
  console.log('Preview updated:', rollback.previewUrl);

  // 3. Poll job status if background sync is running
  if (rollback.jobId && rollback.status === 'rollingBack') {
    await pollRollbackCompletion(rollback.jobId);
  }

  return rollback;
}

async function pollRollbackCompletion(jobId: string) {
  // Poll build events API for job completion
  // Implementation depends on your event polling system
}
```

---

## 🔍 **Audit & Monitoring API**

### Overview
Audit endpoints provide operational visibility for incident response and security monitoring.

**All Audit endpoints are read-only; they never mutate the working directory or deployment state.**

**Key Features:**
- **Automatic audit logging** - Every rollback/sync automatically appears in the audit log (no opt-in required)
- **Strict security limits** - Pagination and date-range limits prevent abuse
- **Classic offset pagination** - Uses standard `limit`/`offset` parameters (not cursor tokens)

### Common Error Responses

| Code | Error | When it happens |
|------|-------|----------------|
| 401 | `invalid_signature` | HMAC doesn't match |
| 404 | `not_found` | Project / version / domain missing |
| 409 | `publish_in_progress` | A publish/unpublish already running |
| 422 | `domain_unverified` | Custom domain hasn't passed DNS check |
| 422 | `version_not_deployable` | Version lacks required artifact or metadata |

### 1. **GET /audit/working-directory/changes**

Investigate file changes for incident response.

**⚠️ Note**: Rows appear only after automatic checksum verification passes; you may see a ~1-2s delay after a rollback.

#### Request
```typescript
const params = new URLSearchParams({
  projectId: 'proj_abc123',
  filename: 'main.css', // Optional: specific file
  fromDate: '2025-08-02T03:00:00Z',
  toDate: '2025-08-02T06:00:00Z',
  limit: '50',
  offset: '0'
});

const path = `/audit/working-directory/changes?${params}`;
const response = await fetch(`${WORKER_BASE_URL}${path}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': generateSignature('', path, WORKER_SHARED_SECRET) // GET requests always sign an empty body
  }
});
```

#### Response
```typescript
{
  "success": true,
  "changes": [
    {
      "timestamp": "2025-08-02T03:15:42Z",
      "userId": "user_123",
      "projectId": "proj_456",
      "versionId": "ver_789",
      "action": "working_dir_sync",
      "filesWritten": 147, // count of filesystem entries created/overwritten
      "gitCommit": "a1b2c3d",
      "syncSource": "rollback"
    }
  ],
  "pagination": {
    "total": 3,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

**Rate Limits**:
- Max 100 entries per request
- Max 30-day date range
- Default: 7 days if no dates specified

### 2. **GET /audit/working-directory/suspicious**

Security monitoring for unusual activity.

**⚠️ Note**: Heuristics run hourly; querying more often will return identical data and may count against rate limits.

#### Response
```typescript
{
  "success": true,
  "suspicious": [
    {
      "timestamp": "2025-08-02T03:15:42Z",
      "userId": "user_123",
      "projectId": "proj_456",
      "suspiciousReasons": [
        "Operation performed outside business hours",
        "Unusually large number of files written"
      ],
      "filesWritten": 1247 // count of filesystem entries created/overwritten
    }
  ]
}
```

**Rate Limits**:
- Max 7-day date range for security queries
- Default: 24 hours if no dates specified

### 3. **GET /audit/working-directory/performance**

Performance monitoring for sync operations.

#### Response
```typescript
{
  "success": true,
  "performance": {
    "totalOperations": 156,
    "avgSyncTimeMs": 2340,
    "avgFilesWritten": 89,
    "successRate": 0.987, // success rate (0-1)
    "slowOperations": [
      {
        "timestamp": "2025-08-02T02:30:00Z",
        "userId": "user_123",
        "projectId": "proj_456",
        "elapsedMs": 45000,
        "filesWritten": 2100
      }
    ]
  }
}
```

**Rate Limits**:
- Max 14-day date range for performance queries
- Default: 24 hours if no dates specified
