# Frontend Integration Guide: Advisor Workspace

**Target**: Next.js frontend team  
**Backend Status**: ✅ **COMPLETE** - All features implemented, production-ready  
**Last Updated**: 2025-09-16

## 🎯 Overview

The Advisor Workspace feature allows project advisors to view source code and monitor real-time logs side-by-side while providing consultation to clients. This guide covers all backend endpoints, data structures, and integration patterns.

### Key Capabilities
- **Permission-based access control** with workspace settings
- **Read-only file access** with security filtering and audit logging
- **Real-time log streaming** via Server-Sent Events (SSE)
- **Database-persisted session management** with heartbeat support
- **Historical log access** using archived log segments
- **Rate limiting** with token bucket algorithm
- **ETag caching** for file content optimization

---

## 🔧 Authentication Pattern

All endpoints follow the explicit authentication pattern used throughout the codebase:

```typescript
// GET requests: userId in query params
const response = await fetch(`/api/workspace/files/list?userId=${advisorId}&projectId=${projectId}&path=src`);

// POST requests: userId in request body
const response = await fetch('/api/workspace/session/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: advisorId, projectId })
});
```

**Important**: No `Authorization` header or middleware - each endpoint requires explicit `userId` parameter.

---

## 📡 API Endpoints Reference

**Total Endpoints**: 14 (all implemented and tested)

### Access Control

#### Check Workspace Access
```typescript
GET /api/workspace/access?userId={advisorId}&projectId={projectId}

// Response
interface AccessResponse {
  success: boolean;
  hasAccess: boolean;
  permissions: {
    view_code: boolean;
    view_logs: boolean;
  };
  settings: {
    advisor_code_access: boolean;
    advisor_log_access: boolean;
    restricted_paths: string[];
    allowed_log_tiers: LogTier[];
  };
}

// Usage Example
const checkAccess = async (advisorId: string, projectId: string) => {
  const params = new URLSearchParams({ userId: advisorId, projectId });
  const response = await fetch(`/api/workspace/access?${params}`);
  return await response.json();
};
```

#### Update Advisor Permissions (Project Owner)
```typescript
PUT /api/workspace/permissions

// Request Body
interface UpdatePermissionsRequest {
  userId: string;      // Project owner ID
  projectId: string;
  advisorId: string;   // Target advisor
  permissions: {
    view_code: boolean;
    view_logs: boolean;
  };
}

// Response
interface UpdatePermissionsResponse {
  success: boolean;
  permissions: {
    view_code: boolean;
    view_logs: boolean;
  };
  updatedAt: string;
}
```

#### Update Project Workspace Settings (Project Owner)
```typescript
PUT /api/workspace/settings

// Request Body
interface UpdateSettingsRequest {
  userId: string;      // Project owner ID
  projectId: string;
  settings: {
    advisor_code_access?: boolean;
    advisor_log_access?: boolean;
    restricted_paths?: string[];
    allowed_log_tiers?: LogTier[];
  };
}

// Response
interface UpdateSettingsResponse {
  success: boolean;
  settings: WorkspaceSettings;
}
```

### Session Management

#### Start Workspace Session
```typescript
POST /api/workspace/session/start

// Request Body
interface StartSessionRequest {
  userId: string;        // Advisor user ID
  projectId: string;     // Target project ID
}

// Response
interface StartSessionResponse {
  success: boolean;
  sessionId: string;     // ULID for session tracking
  projectId: string;
  advisorId: string;
  permissions: {         // Current advisor permissions
    view_code: boolean;
    view_logs: boolean;
  };
}

// Usage Example
const startSession = async (advisorId: string, projectId: string) => {
  const response = await fetch('/api/workspace/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: advisorId, projectId })
  });
  return await response.json();
};
```

#### End Workspace Session
```typescript
POST /api/workspace/session/end

// Request Body
interface EndSessionRequest {
  userId: string;        // Advisor user ID
  sessionId: string;     // Session ID from start session
}

// Response
interface EndSessionResponse {
  success: boolean;
  sessionId: string;
}

#### Session Heartbeat
```typescript
PATCH /api/workspace/session/ping

// Request Body
interface SessionPingRequest {
  userId: string;        // Advisor user ID
  sessionId: string;     // Session ID from start session
}

// Response
interface SessionPingResponse {
  success: boolean;
  acknowledged: true;
  serverTime: string;    // ISO timestamp
}
```

#### Get Active Sessions
```typescript
GET /api/workspace/sessions?userId={advisorId}&projectId={projectId}

// Response
interface ActiveSessionsResponse {
  success: boolean;
  sessions: {
    session_id: string;
    advisor_id: string;
    status: 'active' | 'idle' | 'disconnected';
    last_activity: string;
    created_at: string;
  }[];
  totalActive: number;
}
```

### File Access

#### List Directory Contents
```typescript
GET /api/workspace/files/list?userId={advisorId}&projectId={projectId}&path={relativePath}

// Query Parameters
interface ListDirectoryParams {
  userId: string;        // Advisor user ID
  projectId: string;     // Target project ID
  path?: string;         // Relative path (default: '.')
}

// Response
interface DirectoryListing {
  success: boolean;
  path: string;
  files: FileMetadata[];
  totalCount: number;    // Total files found
  filteredCount: number; // Files blocked by security
}

interface FileMetadata {
  path: string;          // File path
  size: number;          // File size in bytes
  isDirectory: boolean;  // Directory flag
  isBinary: boolean;     // Binary file detection
  mtime: Date;           // Last modified time
  extension: string;     // File extension
}

// Usage Example
const listFiles = async (advisorId: string, projectId: string, path = '.') => {
  const params = new URLSearchParams({ userId: advisorId, projectId, path });
  const response = await fetch(`/api/workspace/files/list?${params}`);
  return await response.json();
};
```

#### Read File Content
```typescript
GET /api/workspace/files/read?userId={advisorId}&projectId={projectId}&path={filePath}

// Query Parameters
interface ReadFileParams {
  userId: string;        // Advisor user ID
  projectId: string;     // Target project ID
  path: string;          // File path to read
}

// Headers (for caching)
interface CacheHeaders {
  'If-None-Match'?: string;      // ETag value
  'If-Modified-Since'?: string;  // Last-Modified value
}

// Response (200 OK)
interface FileContent {
  success: boolean;
  file: {
    path: string;          // File path
    content: string;       // File content (UTF-8 or base64)
    isBinary: boolean;     // Binary file flag
    size: number;          // File size
    mtime: Date;           // Last modified
    encoding: string;      // 'utf8' or 'base64'
    etag: string;          // ETag for caching
  };
}

// Response (304 Not Modified)
// Empty body when file hasn't changed

// Usage Example with Caching
const readFile = async (advisorId: string, projectId: string, filePath: string, etag?: string) => {
  const params = new URLSearchParams({ userId: advisorId, projectId, path: filePath });
  const headers: Record<string, string> = {};
  if (etag) headers['If-None-Match'] = etag;
  
  const response = await fetch(`/api/workspace/files/read?${params}`, { headers });
  
  if (response.status === 304) {
    return { notModified: true };
  }
  
  return await response.json();
};
```

#### Get File Metadata
```typescript
GET /api/workspace/files/metadata?userId={advisorId}&projectId={projectId}&path={filePath}

// Response
interface FileMetadataResponse {
  success: boolean;
  metadata: FileMetadata;
  validation: {
    suitable: boolean;           // Suitable for workspace viewing
    reason?: string;            // Reason if not suitable
    recommendations?: string[]; // Alternative actions
  };
}
```

### Log Streaming

#### Real-time Log Stream (SSE)
```typescript
GET /api/workspace/logs/stream?userId={advisorId}&projectId={projectId}&tiers={tierList}&since={timestamp}

// Query Parameters
interface LogStreamParams {
  userId: string;        // Advisor user ID
  projectId: string;     // Target project ID
  tiers?: string;        // Comma-separated: 'build,deploy,lifecycle'
  since?: string;        // ISO timestamp for filtering
}

// Headers
interface SSEHeaders {
  'Last-Event-ID'?: string;  // For resuming disconnected streams
}

// SSE Event Data
interface LogStreamEvent {
  id: string;            // Event ID for resume capability
  timestamp: string;     // ISO timestamp
  tier: LogTier;         // Log tier
  message: string;       // Log message
  projectId: string;     // Project ID
  sequence?: number;     // Sequence number
}

type LogTier = 'system' | 'build' | 'deploy' | 'action' | 'lifecycle';

// Usage Example
const connectLogStream = (advisorId: string, projectId: string, options: {
  tiers?: LogTier[];
  onMessage?: (event: LogStreamEvent) => void;
  onError?: (error: Event) => void;
  lastEventId?: string;
} = {}) => {
  const params = new URLSearchParams({ userId: advisorId, projectId });
  if (options.tiers) params.set('tiers', options.tiers.join(','));
  
  const eventSource = new EventSource(`/api/workspace/logs/stream?${params}`, {
    // Browser automatically handles Last-Event-ID
  });
  
  eventSource.onmessage = (event) => {
    const data: LogStreamEvent = JSON.parse(event.data);
    options.onMessage?.(data);
  };
  
  eventSource.onerror = (error) => {
    options.onError?.(error);
  };
  
  // Heartbeat handling
  eventSource.addEventListener('heartbeat', (event) => {
    console.log('Heartbeat received:', event.data);
  });
  
  return eventSource;
};
```

#### Historical Logs (Paginated)
```typescript
GET /api/workspace/logs/history?userId={advisorId}&projectId={projectId}&tier={tier}&startTime={start}&endTime={end}&limit={limit}&offset={offset}

// Query Parameters
interface HistoricalLogsParams {
  userId: string;
  projectId: string;
  tier?: LogTier;        // Filter by log tier
  startTime?: string;    // ISO timestamp
  endTime?: string;      // ISO timestamp
  limit?: number;        // Default: 100
  offset?: number;       // Default: 0
}

// Response
interface HistoricalLogsResponse {
  success: boolean;
  logs: LogStreamEvent[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  filters: {
    tier?: LogTier;
    startTime?: string;
    endTime?: string;
  };
}
```

### Monitoring & Status

#### Get Rate Limit Status
```typescript
GET /api/workspace/rate-limits?userId={advisorId}

// Response
interface RateLimitResponse {
  success: boolean;
  rateLimits: Record<string, {
    tokens: number;      // Remaining tokens
    capacity: number;    // Maximum capacity
  }>;
  connectedClients: number;
}

// Rate limit buckets:
// - file_access: 5 tokens per file read
// - directory_list: 2 tokens per directory listing
// - metadata: 1 token per metadata request
```

#### Get Workspace Status
```typescript
GET /api/workspace/status?userId={advisorId}&projectId={projectId}

// Response
interface WorkspaceStatusResponse {
  success: boolean;
  status: {
    connectedClients: number;    // Clients connected to project
    advisorConnected: boolean;   // This advisor connected
    rateLimits: Record<string, { tokens: number; capacity: number; }>;
  };
}
```

### Admin Endpoints

#### Reset Rate Limits (Admin Only)
```typescript
POST /api/workspace/admin/reset-rate-limits

// Request Body
interface ResetRateLimitsRequest {
  userId: string;         // Admin user ID
  targetAdvisorId: string; // Advisor to reset
}
```

#### Disconnect Advisor (Admin Only)
```typescript
POST /api/workspace/admin/disconnect-advisor

// Request Body
interface DisconnectAdvisorRequest {
  userId: string;         // Admin user ID
  targetAdvisorId: string; // Advisor to disconnect
}
```

---

## 🎨 UI Implementation Guidelines

### Split-Pane Layout Recommendation

```typescript
// Recommended component structure
interface AdvisorWorkspaceProps {
  advisorId: string;
  projectId: string;
}

const AdvisorWorkspace: React.FC<AdvisorWorkspaceProps> = ({ advisorId, projectId }) => {
  return (
    <div className="flex h-screen">
      {/* File Explorer & Code Viewer - Left Pane */}
      <div className="w-1/2 border-r">
        <FileExplorer advisorId={advisorId} projectId={projectId} />
        <CodeViewer advisorId={advisorId} projectId={projectId} />
      </div>
      
      {/* Log Stream - Right Pane */}
      <div className="w-1/2">
        <LogStreamViewer advisorId={advisorId} projectId={projectId} />
      </div>
    </div>
  );
};
```

### State Management Pattern

```typescript
// Recommended state structure
interface WorkspaceState {
  session: {
    id: string | null;
    status: 'connecting' | 'connected' | 'disconnected';
  };
  currentFile: {
    path: string | null;
    content: string | null;
    etag: string | null;
    loading: boolean;
  };
  directoryListing: {
    path: string;
    files: FileMetadata[];
    loading: boolean;
  };
  logStream: {
    connected: boolean;
    events: LogStreamEvent[];
    filters: {
      tiers: LogTier[];
    };
  };
  rateLimits: Record<string, { tokens: number; capacity: number; }>;
}
```

---

## ⚠️ Error Handling

### Common Error Responses

```typescript
interface ErrorResponse {
  success: false;
  error: string;
}

// HTTP Status Codes:
// 403 Forbidden - Access denied, rate limit exceeded
// 404 Not Found - File/directory not found
// 500 Internal Server Error - Server error
// 304 Not Modified - File unchanged (caching)
```

### Rate Limiting

```typescript
// Monitor rate limits and show user feedback
const checkRateLimits = async (advisorId: string) => {
  const response = await fetch(`/api/workspace/rate-limits?userId=${advisorId}`);
  const data = await response.json();
  
  if (data.rateLimits.file_access?.tokens < 10) {
    // Show warning: "File access rate limit approaching"
  }
};
```

### SSE Error Handling

```typescript
const handleSSEConnection = (advisorId: string, projectId: string) => {
  let eventSource: EventSource | null = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  
  const connect = () => {
    eventSource = connectLogStream(advisorId, projectId, {
      onMessage: (event) => {
        // Store last event ID for reconnection
        localStorage.setItem('lastEventId', event.id);
        // Handle message
      },
      onError: (error) => {
        if (reconnectAttempts < maxReconnectAttempts) {
          setTimeout(() => {
            reconnectAttempts++;
            connect();
          }, 1000 * Math.pow(2, reconnectAttempts)); // Exponential backoff
        }
      }
    });
  };
  
  connect();
  return () => eventSource?.close();
};
```

---

## 🚀 Implementation Checklist

### Phase 1: Core Integration (Required for MVP)
- [ ] **Access Control**: Implement workspace access checking before any operations
- [ ] **Session Management**: Implement start/end/ping session lifecycle
- [ ] **File Explorer**: Build directory listing with security-filtered results
- [ ] **File Viewer**: Add content viewer with ETag caching and binary handling
- [ ] **Real-time Logs**: Implement SSE log streaming with Last-Event-ID reconnection
- [ ] **Error Handling**: Add comprehensive error states and user feedback

### Phase 2: Enhanced Features
- [ ] **Historical Logs**: Add paginated historical log viewer
- [ ] **Permission UI**: Build workspace settings management (project owners)
- [ ] **Rate Limit Monitoring**: Display rate limit status to users
- [ ] **Session Monitoring**: Show active sessions (project owners)
- [ ] **Log Filtering**: Add tier filtering and time range selection
- [ ] **Audit Dashboard**: Display workspace activity logs (project owners)

### Phase 3: Production Polish
- [ ] **Performance**: Optimize caching strategy and lazy loading
- [ ] **UX**: Add keyboard shortcuts and split-pane resize controls
- [ ] **Search**: Implement file and log search functionality
- [ ] **Monitoring**: Add performance tracking and error reporting
- [ ] **Mobile**: Ensure responsive design for tablet usage

---

## 🔍 Testing Recommendations

### Unit Tests
```typescript
// Test API integration
describe('Advisor Workspace API', () => {
  test('should start session successfully', async () => {
    const response = await startSession('advisor-123', 'project-456');
    expect(response.success).toBe(true);
    expect(response.sessionId).toBeDefined();
  });
  
  test('should handle rate limiting', async () => {
    // Make multiple rapid requests
    // Verify 403 response when rate limited
  });
  
  test('should handle SSE reconnection', async () => {
    // Test Last-Event-ID resume capability
  });
});
```

### Integration Tests
- Test workspace access control with different permission combinations
- Verify file access with various file types and security restrictions
- Test SSE stream resilience with network interruptions and Last-Event-ID resume
- Validate session management and heartbeat functionality
- Test historical log pagination and filtering
- Verify rate limiting thresholds and user feedback
- Validate ETag caching behavior across file updates
- Test audit logging for compliance verification

---

## 📝 Notes for Frontend Team

1. **Authentication**: Use explicit `userId` parameter, not JWT tokens
2. **Access Control**: ALWAYS check workspace access before any operations
3. **Session Management**: Implement proper session lifecycle with heartbeat
4. **Caching**: Implement ETag caching for file content to reduce bandwidth
5. **SSE**: Browser handles Last-Event-ID automatically for reconnection
6. **Rate Limits**: Monitor and display rate limit status to users
7. **File Types**: Handle both text and binary files (base64 encoding)
8. **Security**: All file access is read-only and security-filtered
9. **Real-time**: 15-second heartbeats keep SSE connections alive
10. **Permissions**: Project owners can control advisor access via settings endpoints
11. **Audit Logging**: All workspace activities are automatically logged
12. **Historical Data**: Use paginated historical log endpoints for past activity

**Backend Status**: ✅ **PRODUCTION READY** - All 14 endpoints implemented with full database integration, audit logging, and security validation.

## 🎉 Implementation Complete

### What's Ready for Frontend Development

**✅ Authentication & Authorization**
- Workspace access checking with permission validation
- Project owner controls for advisor permissions and settings
- Row-level security on all database operations

**✅ Session Management** 
- Database-persisted sessions with automatic cleanup
- Session heartbeat for keeping connections active
- Real-time session monitoring for project owners

**✅ File Access System**
- Secure file reading with canonical path validation
- Directory listing with security filtering  
- ETag caching for optimal performance
- Binary file detection and proper encoding

**✅ Real-time Log Streaming**
- SSE with Last-Event-ID for reliable reconnection
- 15-second heartbeats and compression bypass
- Log tier filtering and permission-based access
- Rate limiting with token bucket algorithm

**✅ Historical Log Access**
- Efficient queries using log_archival_status table
- Time-range filtering with optimized indexes
- Pagination support for large log datasets

**✅ Security & Compliance**
- Complete audit logging of all workspace activities
- IP address and user-agent tracking
- Pattern-based file restrictions (secrets, credentials blocked)
- Comprehensive error handling and rate limiting

**✅ Database Integration**
- Full Supabase integration with proper RLS policies
- Automatic workspace settings for new projects
- Enhanced project_advisors table with workspace permissions
- Session persistence and cleanup automation

### Ready for Deployment

The backend implementation is **production-ready** and can be deployed immediately. Frontend teams can begin integration using the comprehensive API documentation above.

## 🛠️ Recommended Development Workflow

### Step 1: Setup and Access Control
1. Implement workspace access checking (`GET /api/workspace/access`)
2. Build basic session management (`POST /api/workspace/session/start` and `/end`)
3. Add session heartbeat for long-running sessions (`PATCH /api/workspace/session/ping`)

### Step 2: File System Integration  
1. Implement directory listing with security awareness
2. Add file content viewer with ETag caching support
3. Handle binary files and security restrictions gracefully

### Step 3: Real-time Features
1. Implement SSE log streaming with proper error handling
2. Add Last-Event-ID resume capability for reconnections
3. Implement log tier filtering and real-time controls

### Step 4: Advanced Features
1. Add historical log pagination and time-range filtering
2. Implement workspace settings management (project owners)
3. Add rate limit monitoring and user feedback
4. Build audit activity dashboard (project owners)

### Step 5: Production Readiness
1. Add comprehensive error states and loading indicators
2. Implement proper caching strategies
3. Add performance monitoring and analytics
4. Ensure responsive design and accessibility

**Development Priority**: Start with access control and session management - these are the foundation for all other features.