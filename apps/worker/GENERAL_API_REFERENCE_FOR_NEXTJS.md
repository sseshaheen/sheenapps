# SheenApps API Reference for Next.js Frontend

This document provides a comprehensive reference for integrating with the SheenApps Claude Worker API, specifically designed for the Next.js frontend team.

## Table of Contents

- [Authentication](#authentication)
- [Project Management](#project-management)
- [Advisor Matching System](#advisor-matching-system)
- [Integration Status](#integration-status)
- [Export System](#export-system)
- [Version Management](#version-management)
- [Chat & Planning](#chat--planning)
- [Build System](#build-system)
- [Error Handling](#error-handling)

## Authentication

All API requests require HMAC signature authentication. The API automatically derives user identity from the signed request context - **never send `userId` in request bodies or query parameters**.

### Required Headers
```
x-sheen-signature: [HMAC v1 signature]
x-sheen-sig-v2: [HMAC v2 signature] 
x-sheen-timestamp: [Unix timestamp in seconds]
x-sheen-nonce: [Random string for replay protection]
Content-Type: application/json
```

### Authentication Flow
1. Generate timestamp and nonce
2. Create HMAC signature using shared secret
3. Include headers in every API request
4. Server validates signature and derives user context

## Project Management

### Create Project
```http
POST /v1/create-preview
```

**Request:**
```json
{
  "prompt": "Create a React todo app with modern styling",
  "framework": "react",
  "projectId": "my-app"
}
```

**Response:**
```json
{
  "success": true,
  "buildId": "build_abc123",
  "projectId": "my-app",
  "versionId": "01HX...",
  "estimatedTime": "90-120 seconds"
}
```

### Update Project
```http
POST /v1/update-project
```

**Request:**
```json
{
  "projectId": "my-app", 
  "prompt": "Add a dark mode toggle",
  "framework": "react"
}
```

**Response:**
```json
{
  "success": true,
  "buildId": "build_def456",
  "projectId": "my-app",
  "versionId": "01HY...",
  "baseVersionId": "01HX...",
  "estimatedTime": "30-45 seconds"
}
```

## Advisor Matching System

The intelligent advisor matching system connects projects with suitable advisors based on expertise, availability, and preferences. Designed for startup-scale operations with admin controls and automatic algorithm scaling.

### Core Match Flow

#### 1. Create Match Request
```http
POST /api/advisor-matching/match-requests
```

**Request:**
```json
{
  "projectId": "proj_123",
  "matchCriteria": {
    "expertise": ["frontend", "react"],
    "budget_range": [1000, 5000],
    "timeline": "urgent"
  },
  "expiresInHours": 2
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "match_456",
    "projectId": "proj_123",
    "status": "pending",
    "matchedAdvisorId": "advisor_789",
    "expiresAt": "2025-01-15T16:00:00Z",
    "correlationId": "corr_abc123"
  }
}
```

#### 2. Get Project Matches
```http
GET /api/advisor-matching/projects/{projectId}/matches
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "match_456",
      "status": "pending",
      "matchedAdvisor": {
        "id": "advisor_789",
        "name": "Expert Advisor",
        "expertise": ["frontend", "react"],
        "rating": 4.8
      },
      "createdAt": "2025-01-15T14:00:00Z",
      "expiresAt": "2025-01-15T16:00:00Z"
    }
  ]
}
```

#### 3. Client Decision
```http
POST /api/advisor-matching/matches/{matchId}/client-decision
```

**Request:**
```json
{
  "decision": "approved",
  "reason": "Perfect expertise match"
}
```

#### 4. Advisor Decision
```http
POST /api/advisor-matching/matches/{matchId}/advisor-decision
```

**Request:**
```json
{
  "decision": "approved",
  "reason": "Interesting project"
}
```

### Advisor Management

#### Get Advisor Availability
```http
GET /api/advisor-matching/availability
```

#### Update Advisor Availability
```http
PUT /api/advisor-matching/availability
```

**Request:**
```json
{
  "status": "available",
  "maxConcurrentProjects": 3,
  "availabilityPreferences": {
    "timezone": "UTC",
    "preferred_hours": "9-17"
  }
}
```

#### Manage Work Hours
```http
POST /api/advisor-matching/work-hours
```

**Request:**
```json
{
  "timezone": "America/New_York",
  "schedule": {
    "monday": "09:00-17:00",
    "tuesday": "09:00-17:00",
    "friday": "09:00-15:00"
  }
}
```

#### Manage Time Off
```http
POST /api/advisor-matching/time-off
```

**Request:**
```json
{
  "timeOffPeriods": [
    {
      "start": "2025-01-20T00:00:00Z",
      "end": "2025-01-25T23:59:59Z",
      "reason": "vacation"
    }
  ]
}
```

### Authentication & Headers

All advisor matching endpoints support:
- **HMAC Authentication**: Standard x-sheen-signature headers
- **Internationalization**: Optional `x-sheen-locale` header (en|ar|fr|es|de)
- **Correlation Tracking**: All responses include correlationId for debugging

### Error Handling

Standard error responses with localized messages:
```json
{
  "success": false,
  "error": {
    "code": "ADVISOR_NOT_AVAILABLE",
    "message": "No advisors currently available for this expertise",
    "correlationId": "corr_xyz789"
  }
}
```

## Export System

The export system allows users to download their project source code as ZIP files. All exports are processed asynchronously and stored in R2 with automatic cleanup.

### Initiate Export

```http
POST /v1/projects/:projectId/export
```

**Request:**
```json
{
  "versionId": "01HX...",  // Optional: specific version, null = latest
  "exportType": "source_code"  // Optional: 'source_code' | 'full_project'  
}
```

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Export job queued successfully", 
  "estimatedTime": "30-60 seconds"
}
```

**Rate Limits:**
- 10 exports per hour per user
- Returns existing job ID if export already in progress

### Check Export Status

```http
GET /v1/export-jobs/:jobId/status
```

**Response:**
```json
{
  "status": "completed", // 'queued' | 'processing' | 'completed' | 'failed'
  "progress": {
    "phase": "scanning", // 'scanning' | 'compressing' | 'uploading' | 'complete'
    "filesScanned": 250,
    "bytesWritten": 1048576
  },
  "downloadUrl": "https://r2.example.com/signed-url...", // Only when completed
  "expiresAt": "2025-09-09T12:00:00Z",
  "error": null // Error message if status is 'failed'
}
```

### Download Export

```http
GET /v1/export-jobs/:jobId/download
```

**Response:**
- **302 Redirect** to signed R2 URL (preferred)
- **Headers:**
  - `Content-Type: application/zip`
  - `Content-Disposition: attachment; filename*=UTF-8''project-source.zip`
  - `ETag: [SHA256 checksum]`

**Error Responses:**
- `404` - Export not found or not ready
- `410` - Export expired (24h TTL)

### Export Workflow Example

```typescript
// 1. Initiate export
const exportResponse = await fetch(`/v1/projects/${projectId}/export`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // HMAC headers added by auth system
  },
  body: JSON.stringify({
    exportType: 'source_code'
  })
});

const { jobId } = await exportResponse.json();

// 2. Poll for completion  
const pollStatus = async () => {
  const statusResponse = await fetch(`/v1/export-jobs/${jobId}/status`, {
    headers: {
      // HMAC headers added by auth system
    }
  });
  
  const status = await statusResponse.json();
  
  if (status.status === 'completed') {
    return status.downloadUrl;
  } else if (status.status === 'failed') {
    throw new Error(status.error);
  }
  
  // Continue polling
  await new Promise(resolve => setTimeout(resolve, 2000));
  return pollStatus();
};

// 3. Download when ready
const downloadUrl = await pollStatus();
window.location.href = downloadUrl; // Triggers download
```

## Version Management

### List Project Versions
```http
GET /v1/projects/:projectId/versions?limit=50&offset=0
```

**Response:**
```json
{
  "success": true,
  "versions": [
    {
      "versionId": "01HY...",
      "versionName": "v1.2.0", 
      "prompt": "Add dark mode toggle",
      "previewUrl": "https://abc123.pages.dev",
      "status": "deployed",
      "createdAt": "2025-01-19T12:00:00Z",
      "parentVersionId": "01HX...",
      "framework": "react",
      "canRollback": true,
      "canExport": true,
      "artifactAvailable": true,
      "daysUntilExpiry": 28
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

### Get Version Details
```http
GET /v1/versions/:versionId
```

### Rollback to Version
```http
POST /v1/versions/rollback
```

**Request:**
```json
{
  "projectId": "my-app",
  "targetVersionId": "01HX..."
}
```

## Chat & Planning

### Chat Plan API
```http
POST /v1/chat-plan
```

**Request:**
```json
{
  "projectId": "my-app",
  "message": "Add user authentication",
  "sessionId": "session_123", // Optional: for conversation continuity
  "client_msg_id": "msg_456"  // Optional: for idempotency
}
```

**Response:**
```json
{
  "accepted": true,
  "conversationMode": "plan", // 'plan' | 'build'
  "messageId": "msg_789",
  "sessionId": "session_123",
  "response": {
    "type": "plan_response",
    "plan": "I'll help you add authentication...",
    "reasoning": "This requires setting up auth providers..."
  }
}
```

### Convert Plan to Build
```http
POST /v1/chat-plan/:sessionId/convert-to-build
```

## Build System

### Get Build Status
```http
GET /v1/build-status/:buildId
```

**Response:**
```json
{
  "buildId": "build_abc123",
  "status": "completed", // 'queued' | 'running' | 'completed' | 'failed'
  "progress": 1.0, // 0.0 to 1.0
  "events": [
    {
      "id": "evt_001",
      "type": "install_start", 
      "message": "Installing dependencies...",
      "timestamp": "2025-01-19T12:00:00Z"
    }
  ],
  "finished": true,
  "result": {
    "versionId": "01HY...",
    "previewUrl": "https://abc123.pages.dev"
  }
}
```

### Webhook Integration
```http
POST /webhook/cloudflare
```

Receives build completion notifications from Cloudflare Pages.

## Error Handling

### Common Error Responses

#### Rate Limit Exceeded
```json
{
  "error": "Export rate limit exceeded",
  "message": "Maximum 10 exports per hour allowed",
  "code": 429,
  "retryAfter": 3600
}
```

#### Authentication Failed
```json
{
  "error": "Signature validation failed", 
  "code": "INVALID_SIGNATURE",
  "details": {
    "version_checked": "v2",
    "timestamp_valid": true,
    "nonce_valid": false
  }
}
```

#### Project Not Found
```json
{
  "error": "Project not found or access denied",
  "code": 404,
  "projectId": "my-app"
}
```

#### Build Failed
```json
{
  "buildId": "build_abc123",
  "status": "failed",
  "error": {
    "type": "BUILD_ERROR",
    "message": "TypeScript compilation failed",
    "details": "src/App.tsx(10,5): error TS2322..."
  }
}
```

### Error Handling Best Practices

1. **Always check HTTP status codes** before parsing JSON
2. **Implement exponential backoff** for rate-limited requests
3. **Handle network errors gracefully** with user-friendly messages
4. **Log detailed errors** for debugging while showing simple messages to users
5. **Validate HMAC signatures** properly to avoid authentication issues

### Frontend Integration Examples

#### React Hook for Exports
```typescript
const useProjectExport = (projectId: string) => {
  const [status, setStatus] = useState<'idle' | 'exporting' | 'ready' | 'error'>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  
  const startExport = async (versionId?: string) => {
    setStatus('exporting');
    
    try {
      const response = await apiClient.post(`/v1/projects/${projectId}/export`, {
        versionId,
        exportType: 'source_code'
      });
      
      const { jobId } = response.data;
      await pollForCompletion(jobId);
      
    } catch (error) {
      setStatus('error');
      console.error('Export failed:', error);
    }
  };
  
  const pollForCompletion = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await apiClient.get(`/v1/export-jobs/${jobId}/status`);
        const { status: jobStatus, downloadUrl } = response.data;
        
        if (jobStatus === 'completed') {
          setStatus('ready');
          setDownloadUrl(downloadUrl);
          clearInterval(interval);
        } else if (jobStatus === 'failed') {
          setStatus('error');
          clearInterval(interval);
        }
      } catch (error) {
        setStatus('error'); 
        clearInterval(interval);
      }
    }, 2000);
  };
  
  return { status, downloadUrl, startExport };
};
```

#### API Client Setup
```typescript
// api-client.ts
import axios from 'axios';
import { generateHMACSignature } from './hmac-utils';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const body = config.data ? JSON.stringify(config.data) : '';
  
  const signature = generateHMACSignature(
    config.method?.toUpperCase() || 'GET',
    config.url || '',
    timestamp,
    nonce, 
    body
  );
  
  config.headers = {
    ...config.headers,
    'x-sheen-timestamp': timestamp.toString(),
    'x-sheen-nonce': nonce,
    'x-sheen-sig-v2': signature,
  };
  
  return config;
});

export { apiClient };
```

## Rate Limits & Quotas

| Operation | Limit | Window | 
|-----------|-------|---------|
| Project Creation | 10 per user | 1 hour |
| Project Updates | 50 per project | 1 hour | 
| Source Code Exports | 10 per user | 1 hour |
| Build Status Polling | 100 per build | 10 minutes |
| Chat Plan Messages | 30 per user | 1 hour |

## Data Retention

| Resource | Retention Period | Notes |
|----------|------------------|-------|
| Export ZIP Files | 24 hours | Auto-deleted via R2 lifecycle |
| Project Versions | 365 days | Configurable per plan |
| Build Artifacts | 30 days | R2 storage with cleanup job |
| Audit Logs | 90 days | Export/download activity |
| Chat Sessions | 30 days | Plan conversations |

## Security Considerations

1. **Never log shared secrets** in client-side code
2. **Validate all user inputs** before sending to API
3. **Use HTTPS only** for all API communications  
4. **Implement proper CORS policies** for your domains
5. **Sanitize downloaded filenames** to prevent directory traversal
6. **Verify ZIP file integrity** using provided checksums
7. **Handle authentication errors** gracefully without exposing secrets

## Support & Troubleshooting

### Common Issues

1. **HMAC Signature Mismatch**: Verify timestamp, nonce, and body encoding
2. **Export Timeouts**: Large projects may take up to 2 minutes  
3. **Download Failures**: Check if export has expired (24h TTL)
4. **Rate Limiting**: Implement proper retry logic with backoff
5. **Build Failures**: Check TypeScript/ESLint errors in build logs

### Debug Endpoints

```http
GET /v1/debug/signature-test
```
Test HMAC signature generation and validation.

```http
GET /v1/debug/project-status/:projectId  
```
Get detailed project status for troubleshooting.

For additional support, check the [troubleshooting guide](./TROUBLESHOOTING.md) or contact the backend team.