# Admin Build Logs - Frontend Integration Guide (DEPRECATED)

⚠️ **DEPRECATED**: This document covers deprecated build-specific log endpoints. 

**➡️ Use the new [Unified Logs Frontend Integration Guide](./ADMIN_LOGS_FRONTEND_INTEGRATION.md) instead.**

The new Unified Logs system provides:
- Multi-tier logging (system, build, deploy, action, lifecycle)
- Better performance with segment-based streaming
- Enhanced filtering and querying capabilities
- Future-proof architecture with R2 integration planned

---

## Overview (Legacy)
Admin-only API endpoints for accessing per-build Claude agent logs with streaming support, metadata retrieval, and build listing capabilities.

## Authentication
All endpoints require admin JWT authentication via `Authorization: Bearer <admin_jwt>` header.

## API Endpoints

### 1. Stream Build Logs
```typescript
GET /v1/admin/builds/{buildId}/logs
```

**Headers:**
```typescript
Authorization: Bearer <admin_jwt>
Range?: bytes=0-1023 | bytes=-1024  // Optional: HTTP Range for partial content
```

**Query Parameters:**
```typescript
interface LogsQuery {
  bytes?: string;  // Alternative to Range header, e.g., "-1024" for last 1KB
}
```

**Response:**
- **Content-Type:** `application/x-ndjson; charset=utf-8`
- **Status:** `200` (full file) or `206` (partial content with Range)
- **Body:** NDJSON stream

**NDJSON Format:**
```typescript
// Metadata records
{ kind: "meta", buildId: string, userId: string, projectId: string, startedAt: string, version: string }
{ kind: "meta", buildId: string, endedAt: string }

// Log line records  
{ kind: "line", ts: number, seq: number, src: "stdout"|"stderr", buildId: string, msg: string }
```

**Example Usage:**
```typescript
// Fetch full log
const response = await fetch(`/v1/admin/builds/${buildId}/logs`, {
  headers: { 'Authorization': `Bearer ${adminJwt}` }
});

// Fetch last 5KB (tail functionality)
const tailResponse = await fetch(`/v1/admin/builds/${buildId}/logs?bytes=-5120`, {
  headers: { 'Authorization': `Bearer ${adminJwt}` }
});

// Process NDJSON stream
const reader = response.body?.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line
  
  for (const line of lines) {
    if (line.trim()) {
      const logEntry = JSON.parse(line);
      if (logEntry.kind === 'line') {
        console.log(`[${logEntry.src}] ${logEntry.msg}`);
      }
    }
  }
}
```

### 2. Get Build Metadata
```typescript
GET /v1/admin/builds/{buildId}/info
```

**Response:**
```typescript
interface BuildInfo {
  buildId: string;
  projectId: string;
  userId: string;
  userEmail?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  buildDurationMs?: number;
  totalLinesProcessed?: number;
  claudeRequests?: number;
  memoryPeakMb?: number;
  errorMessage?: string;
  logExists: boolean;
  logSizeBytes: number;
}
```

**Example Usage:**
```typescript
const buildInfo = await fetch(`/v1/admin/builds/${buildId}/info`, {
  headers: { 'Authorization': `Bearer ${adminJwt}` }
}).then(r => r.json());

console.log(`Build ${buildInfo.buildId} - Status: ${buildInfo.status}`);
console.log(`Log available: ${buildInfo.logExists} (${buildInfo.logSizeBytes} bytes)`);
```

### 3. List Recent Builds
```typescript
GET /v1/admin/builds
```

**Query Parameters:**
```typescript
interface BuildsQuery {
  limit?: number;      // Default: 50, Max: 100
  offset?: number;     // Default: 0
  status?: string;     // Filter by build status
  userId?: string;     // Filter by user ID
  projectId?: string;  // Filter by project ID
}
```

**Response:**
```typescript
interface BuildsList {
  builds: Array<{
    build_id: string;
    project_id: string;
    user_id: string;
    user_email?: string;
    status: string;
    created_at: string;
    updated_at: string;
    build_duration_ms?: number;
    error_message?: string;
    logExists: boolean;
  }>;
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}
```

**Example Usage:**
```typescript
// List recent failed builds with logs
const failedBuilds = await fetch('/v1/admin/builds?status=failed&limit=20', {
  headers: { 'Authorization': `Bearer ${adminJwt}` }
}).then(r => r.json());

const buildsWithLogs = failedBuilds.builds.filter(build => build.logExists);
```

## Frontend Components

### Log Viewer Component
```typescript
interface LogViewerProps {
  buildId: string;
  adminJwt: string;
  tailMode?: boolean;  // Start from end of file
}

const LogViewer: React.FC<LogViewerProps> = ({ buildId, adminJwt, tailMode }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const url = `/v1/admin/builds/${buildId}/logs${tailMode ? '?bytes=-10240' : ''}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${adminJwt}` }
      });

      // Process NDJSON stream (see example above)
    };

    fetchLogs();
  }, [buildId, adminJwt, tailMode]);

  return (
    <div className="log-viewer">
      {logs.map((entry, i) => (
        <div key={i} className={`log-line ${entry.src}`}>
          <span className="timestamp">{new Date(entry.ts).toISOString()}</span>
          <span className="source">[{entry.src}]</span>
          <span className="message">{entry.msg}</span>
        </div>
      ))}
    </div>
  );
};
```

### Build List Component
```typescript
const BuildsList: React.FC<{ adminJwt: string }> = ({ adminJwt }) => {
  const [builds, setBuilds] = useState<BuildsList | null>(null);

  useEffect(() => {
    fetch('/v1/admin/builds?limit=50', {
      headers: { 'Authorization': `Bearer ${adminJwt}` }
    })
    .then(r => r.json())
    .then(setBuilds);
  }, [adminJwt]);

  return (
    <table>
      <thead>
        <tr>
          <th>Build ID</th>
          <th>Status</th>
          <th>User</th>
          <th>Created</th>
          <th>Logs</th>
        </tr>
      </thead>
      <tbody>
        {builds?.builds.map(build => (
          <tr key={build.build_id}>
            <td>{build.build_id.slice(0, 8)}...</td>
            <td>{build.status}</td>
            <td>{build.user_email}</td>
            <td>{new Date(build.created_at).toLocaleDateString()}</td>
            <td>
              {build.logExists ? (
                <a href={`/admin/builds/${build.build_id}/logs`}>View Logs</a>
              ) : (
                'No logs'
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
```

## Error Handling

**Common Error Responses:**
```typescript
// 404 - Build not found or no access
{ error: "Build log not found" }

// 403 - Insufficient permissions  
{ error: "Insufficient permissions" }

// 500 - Server error
{ error: "Failed to retrieve build log" }
```

**Error Handling Pattern:**
```typescript
const fetchBuildLogs = async (buildId: string) => {
  try {
    const response = await fetch(`/v1/admin/builds/${buildId}/logs`, {
      headers: { 'Authorization': `Bearer ${adminJwt}` }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Build logs not found or access denied');
      }
      if (response.status === 403) {
        throw new Error('Insufficient admin permissions');
      }
      throw new Error('Failed to load build logs');
    }

    return response;
  } catch (error) {
    console.error('Build logs fetch error:', error);
    throw error;
  }
};
```

## Performance Tips

1. **Use Range Requests**: For large logs, use `?bytes=-5120` to fetch only recent entries
2. **Stream Processing**: Process NDJSON line-by-line to avoid memory issues
3. **Pagination**: Use `limit` and `offset` for build lists to improve load times
4. **Caching**: Cache build metadata but not log content (logs may grow)

## Security Notes

- All endpoints require valid admin JWT tokens
- Build access is validated server-side - no client-side filtering needed  
- Log content is automatically redacted for secrets/tokens
- Admin access is audited and logged with correlation IDs

## Log Directory Structure
```
./logs/builds/
├── 2025-09-13/
│   ├── 01HZ8X9J2K3L4M5N6P7Q8R9S0T.log
│   └── 01HZ8X9J2K3L4M5N6P7Q8R9S0U.log
└── 2025-09-14/
    └── ...
```