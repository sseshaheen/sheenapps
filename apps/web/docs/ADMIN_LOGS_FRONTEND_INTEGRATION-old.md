# Admin Logs - Frontend Integration Guide

## Overview

This guide covers the **Unified Multi-Tier Logging System** and migration from legacy build-specific endpoints. The new system provides comprehensive observability across all application tiers with structured query capabilities.

## ⚠️ Migration Notice

**DEPRECATED** endpoints are marked clearly below. The new Unified Logs system provides superior functionality and should be used for all new development.

## Authentication

All endpoints require admin JWT authentication via `Authorization: Bearer <admin_jwt>` header.

---

## 🆕 New Unified Logs API (Recommended)

### Multi-Tier Logging Architecture

The new system captures logs across **5 tiers**:

- **`system`** - Server-wide events (AI time balance changes, rate limits, health checks)
- **`build`** - Claude CLI process tracking (stdout/stderr)  
- **`deploy`** - Cloudflare/Vercel deployment outputs
- **`action`** - User actions (project creation, settings changes)
- **`lifecycle`** - High-level project milestones (creation, builds, deployments)

### 1. List Available Log Segments

```typescript
GET /admin/unified-logs/segments
```

**Query Parameters:**
```typescript
interface SegmentsQuery {
  startDate?: string;    // YYYY-MM-DD format
  endDate?: string;      // YYYY-MM-DD format  
  tier?: 'system' | 'build' | 'deploy' | 'action' | 'lifecycle';
  instanceId?: string;   // Filter by server instance
}
```

**Response:**
```typescript
interface SegmentsResponse {
  success: boolean;
  segments: Array<{
    path: string;         // Full path to segment file
    filename: string;     // Segment filename
    tier: string;         // Log tier
    hour: string;         // Hour segment (00-23)
    instanceId: string;   // Server instance ID
    size: number;         // File size in bytes
    modified: string;     // Last modified timestamp
  }>;
  query: {
    startDate: string;
    endDate: string;
    tier?: string;
    instanceId?: string;
  };
}
```

**Example Usage:**
```typescript
// List all build log segments from last 7 days
const segments = await fetch('/admin/unified-logs/segments?tier=build&startDate=2024-09-06', {
  headers: { 'Authorization': `Bearer ${adminJwt}` }
}).then(r => r.json());

console.log(`Found ${segments.segments.length} build log segments`);
```

### 2. Stream Unified Logs 

```typescript
GET /admin/unified-logs/stream
```

**Query Parameters:**
```typescript
interface StreamQuery {
  tier?: 'system' | 'build' | 'deploy' | 'action' | 'lifecycle';
  startDate?: string;    // YYYY-MM-DD format
  endDate?: string;      // YYYY-MM-DD format
  instanceId?: string;   // Filter by server instance
  format?: 'ndjson' | 'raw';  // Default: 'raw'
  limit?: string;        // Max entries, default: 1000, max: 10000
}
```

**Response:**
- **Content-Type:** `application/x-ndjson` (format=ndjson) or `text/plain` (format=raw)
- **Status:** `200`
- **Body:** NDJSON stream or raw text stream

**Unified NDJSON Format:**
```typescript
interface UnifiedLogEntry {
  timestamp: number;         // ms since epoch
  instanceId: string;        // server instance ID
  tier: 'system'|'build'|'deploy'|'action'|'lifecycle';
  severity: 'info'|'warn'|'error'|'debug';
  event: string;             // event type
  message: string;           // human-readable message
  
  // Tier-specific fields
  userId?: string;           // user ID if applicable
  projectId?: string;        // project ID if applicable  
  buildId?: string;          // build ID if applicable
  correlationId?: string;    // request correlation ID
  
  // Additional context data
  metadata?: Record<string, unknown>;
}
```

**Raw Text Format Examples:**
```
[2024-09-13T10:30:15.123Z] SYSTEM [worker01] INFO daily_bonus_granted: Daily bonus granted to user 01HZ8X9J2K
[2024-09-13T10:30:16.456Z] BUILD [worker01] [01HZ8X9J2K3L4M5N6P7Q8R9S0T] (stdout) npm install completed
[2024-09-13T10:30:17.789Z] DEPLOY [worker01] [01HZ8X9J2K3L4M5N6P7Q8R9S0T] started: Cloudflare deployment initiated
[2024-09-13T10:30:18.012Z] ACTION [worker01] create_preview_success POST /v1/create-preview-for-new-project (200) 2847ms
```

**Example Usage:**
```typescript
// Stream recent build logs in raw format  
const response = await fetch('/admin/unified-logs/stream?tier=build&format=raw&limit=500', {
  headers: { 'Authorization': `Bearer ${adminJwt}` }
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.trim()) {
      console.log(line); // Raw formatted log line
    }
  }
}
```

### 3. Download Specific Log Segment

```typescript
GET /admin/unified-logs/segments/:segmentId
```

**Parameters:**
```typescript
interface SegmentParams {
  segmentId: string;  // Segment filename (e.g., "build-14-ABC123-DEF456.ndjson")
}

interface SegmentQuery {
  format?: 'ndjson' | 'raw';  // Default: 'raw'
}
```

**Response:**
- **Content-Type:** `application/x-ndjson` (format=ndjson) or `text/plain` (format=raw)  
- **Content-Length:** File size
- **Cache-Control:** `public, max-age=3600` (segments are immutable)
- **Body:** Complete segment content

**Example Usage:**
```typescript
// Download specific build segment in NDJSON format
const segment = await fetch('/admin/unified-logs/segments/build-14-ABC123-DEF456.ndjson?format=ndjson', {
  headers: { 'Authorization': `Bearer ${adminJwt}` }
});

const ndjsonContent = await segment.text();
const logEntries = ndjsonContent.split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line));
```

---

## 🚫 Legacy Build Logs API (Deprecated)

> **⚠️ DEPRECATED**: These endpoints are maintained for backward compatibility but should be migrated to the Unified Logs API above. They will be removed in a future release.

### 1. Stream Build Logs (DEPRECATED)

```typescript
GET /v1/admin/builds/{buildId}/logs  // ⚠️ DEPRECATED
```

**Migration:** Use `/admin/unified-logs/stream?tier=build&limit=10000` instead.

### 2. Get Build Metadata (DEPRECATED)

```typescript
GET /v1/admin/builds/{buildId}/info  // ⚠️ DEPRECATED  
```

**Migration:** Use database queries via admin API or `/admin/unified-logs/stream` with build-specific filtering.

### 3. List Recent Builds (DEPRECATED)

```typescript
GET /v1/admin/builds  // ⚠️ DEPRECATED
```

**Migration:** Use existing project/build admin endpoints or database queries.

---

## Frontend Components

### Multi-Tier Log Viewer Component

```typescript
interface UnifiedLogViewerProps {
  adminJwt: string;
  tier?: 'system' | 'build' | 'deploy' | 'action' | 'lifecycle';
  startDate?: string;
  endDate?: string;
  limit?: number;
  realTime?: boolean;  // Enable auto-refresh
}

const UnifiedLogViewer: React.FC<UnifiedLogViewerProps> = ({ 
  adminJwt, 
  tier = 'build', 
  startDate, 
  endDate,
  limit = 1000,
  realTime = false 
}) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({
      tier,
      format: 'raw',
      limit: limit.toString(),
      ...(startDate && { startDate }),
      ...(endDate && { endDate })
    });

    try {
      const response = await fetch(`/admin/unified-logs/stream?${params}`, {
        headers: { 'Authorization': `Bearer ${adminJwt}` }
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const newLogs: string[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            newLogs.push(line);
          }
        }
      }

      setLogs(realTime ? prev => [...prev, ...newLogs] : newLogs);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  }, [adminJwt, tier, startDate, endDate, limit, realTime]);

  useEffect(() => {
    fetchLogs();
    
    if (realTime) {
      const interval = setInterval(fetchLogs, 5000); // Refresh every 5s
      return () => clearInterval(interval);
    }
  }, [fetchLogs, realTime]);

  return (
    <div className="unified-log-viewer">
      <div className="log-header">
        <h3>
          {tier.toUpperCase()} Logs 
          {realTime && <span className="live-indicator">🔴 LIVE</span>}
        </h3>
        <div className="log-controls">
          <select value={tier} onChange={e => setTier(e.target.value)}>
            <option value="system">System</option>
            <option value="build">Build</option>
            <option value="deploy">Deploy</option>
            <option value="action">Action</option>
            <option value="lifecycle">Lifecycle</option>
          </select>
        </div>
      </div>
      
      <div className="log-content">
        {loading ? (
          <div className="loading">Loading {tier} logs...</div>
        ) : (
          <pre className="log-lines">
            {logs.map((line, i) => (
              <div key={i} className={`log-line ${getLogLevel(line)}`}>
                {line}
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
};

// Helper function to extract log level for styling
function getLogLevel(line: string): string {
  if (line.includes(' ERROR ')) return 'error';
  if (line.includes(' WARN ')) return 'warn';  
  if (line.includes(' INFO ')) return 'info';
  if (line.includes(' DEBUG ')) return 'debug';
  return 'default';
}
```

### Log Segments Browser Component

```typescript
const LogSegmentsBrowser: React.FC<{ adminJwt: string }> = ({ adminJwt }) => {
  const [segments, setSegments] = useState<SegmentsResponse | null>(null);
  const [selectedTier, setSelectedTier] = useState<string>('build');
  
  useEffect(() => {
    const fetchSegments = async () => {
      const response = await fetch(`/admin/unified-logs/segments?tier=${selectedTier}`, {
        headers: { 'Authorization': `Bearer ${adminJwt}` }
      });
      
      const data = await response.json();
      setSegments(data);
    };
    
    fetchSegments();
  }, [adminJwt, selectedTier]);

  return (
    <div className="segments-browser">
      <div className="tier-selector">
        <select value={selectedTier} onChange={e => setSelectedTier(e.target.value)}>
          <option value="system">System Logs</option>
          <option value="build">Build Logs</option>
          <option value="deploy">Deploy Logs</option>
          <option value="action">Action Logs</option>
          <option value="lifecycle">Lifecycle Logs</option>
        </select>
      </div>
      
      <div className="segments-list">
        {segments?.segments.map(segment => (
          <div key={segment.filename} className="segment-item">
            <div className="segment-info">
              <strong>{segment.filename}</strong>
              <span className="segment-meta">
                {segment.tier} • {formatBytes(segment.size)} • {formatDate(segment.modified)}
              </span>
            </div>
            <div className="segment-actions">
              <a 
                href={`/admin/unified-logs/segments/${segment.filename}?format=raw`}
                target="_blank"
                className="btn btn-sm"
              >
                View Raw
              </a>
              <a 
                href={`/admin/unified-logs/segments/${segment.filename}?format=ndjson`}
                target="_blank"
                className="btn btn-sm"
              >
                Download NDJSON
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## Migration Guide

### From Legacy Build Logs to Unified Logs

**Old Pattern (Deprecated):**
```typescript
// ❌ Old way - deprecated
const buildLogs = await fetch(`/v1/admin/builds/${buildId}/logs`, {
  headers: { 'Authorization': `Bearer ${adminJwt}` }
});
```

**New Pattern (Recommended):**
```typescript
// ✅ New way - unified logs
const buildLogs = await fetch(`/admin/unified-logs/stream?tier=build&limit=5000&format=raw`, {
  headers: { 'Authorization': `Bearer ${adminJwt}` }
});
```

### Key Migration Benefits

1. **Multi-Tier Access** - View system, deploy, action, and lifecycle logs in addition to builds
2. **Better Performance** - Segment-based streaming with configurable limits
3. **Enhanced Filtering** - Time ranges, instance filtering, tier-specific queries
4. **Structured Data** - NDJSON format with consistent schema across all tiers
5. **Future-Proof** - Built for scalability with R2 integration planned

### Migration Checklist

- [ ] Replace `/v1/admin/builds/:buildId/logs` calls with `/admin/unified-logs/stream?tier=build`
- [ ] Replace `/v1/admin/builds/:buildId/info` calls with database queries or admin endpoints
- [ ] Replace `/v1/admin/builds` calls with existing project/build admin APIs
- [ ] Update log parsing logic to handle unified log format
- [ ] Add tier selection UI to take advantage of multi-tier logging
- [ ] Implement time-based filtering using `startDate`/`endDate` parameters

---

## Error Handling

**Common Error Responses:**
```typescript
// 404 - Segment not found
{ success: false, error: "Segment not found" }

// 403 - Insufficient permissions
{ success: false, error: "Insufficient permissions" }

// 400 - Invalid parameters
{ success: false, error: "Invalid segment ID format" }

// 500 - Server error
{ success: false, error: "Internal server error" }
```

**Error Handling Pattern:**
```typescript
const fetchUnifiedLogs = async (tier: string) => {
  try {
    const response = await fetch(`/admin/unified-logs/stream?tier=${tier}`, {
      headers: { 'Authorization': `Bearer ${adminJwt}` }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Logs not found or access denied');
      }
      if (response.status === 403) {
        throw new Error('Insufficient admin permissions');
      }
      throw new Error('Failed to load unified logs');
    }

    return response;
  } catch (error) {
    console.error('Unified logs fetch error:', error);
    throw error;
  }
};
```

---

## Performance & Security

### Performance Tips

1. **Use Appropriate Limits** - Start with `limit=1000` and increase as needed (max 10,000)
2. **Stream Processing** - Process logs line-by-line to avoid memory issues
3. **Time Filtering** - Use `startDate`/`endDate` to limit query scope
4. **Tier Filtering** - Specify `tier` parameter to reduce data transfer
5. **Caching** - Segments are immutable and can be cached aggressively

### Security Notes

- All endpoints require valid admin JWT tokens
- Log access is validated server-side with permissions checking
- Log content is automatically redacted for secrets/tokens
- Admin access is audited and logged with correlation IDs
- Segments use path traversal protection for security

### Log Directory Structure
```
./logs/unified/
├── 2024-09-13/
│   ├── system-08-ABC123-DEF456.ndjson     # System logs for hour 08
│   ├── build-08-ABC123-DEF456.ndjson      # Build logs for hour 08
│   ├── deploy-08-ABC123-DEF456.ndjson     # Deploy logs for hour 08
│   ├── action-08-ABC123-DEF456.ndjson     # Action logs for hour 08
│   └── lifecycle-08-ABC123-DEF456.ndjson  # Lifecycle logs for hour 08
└── 2024-09-14/
    └── ...
```

---

## Troubleshooting

### Common Issues

**Empty Log Stream**
- Check if the tier has recent activity
- Verify time range with `startDate`/`endDate` parameters
- Ensure proper admin permissions

**Large Memory Usage**
- Use smaller `limit` values (default: 1000)
- Process streams line-by-line instead of loading all into memory
- Use time-based filtering to reduce scope

**Missing Recent Logs**
- Logs are written in segments - very recent activity may still be buffering
- Check multiple segments or use real-time refresh

**Slow Response Times**
- Use tier-specific filtering to reduce data scanning
- Implement time-based filtering to limit query scope
- Consider using segments browser for large log exploration

---

# 🚀 FRONTEND IMPLEMENTATION PLAN

## Current Implementation Analysis

### ✅ What We Have (Build-Specific Logs)

**Existing Components:**
- `/src/app/admin/build-logs/[buildId]/page.tsx` - Individual build log viewer page
- `/src/components/admin/BuildLogViewer.tsx` - Build log viewer with NDJSON/raw downloads
- `/src/app/api/admin/builds/[buildId]/logs/route.ts` - NDJSON logs API proxy
- `/src/app/api/admin/builds/[buildId]/logs/raw/route.ts` - Raw logs API proxy

**Current Features:**
- ✅ Build-specific log streaming (NDJSON format)
- ✅ Real-time polling for active builds
- ✅ Dual download options (NDJSON + Raw)
- ✅ Authentication & permissions handling
- ✅ Cache-busting and error handling

### ⚠️ Migration Required

**Deprecated Endpoints We Use:**
- `GET /v1/admin/builds/{buildId}/logs` → **DEPRECATED**
- `GET /v1/admin/builds/{buildId}/info` → **DEPRECATED**

**Impact:** Our existing build log viewer will break when these endpoints are removed.

## Implementation Strategy

### Phase 1: Maintain Build-Specific Functionality (Week 1)

**Objective:** Ensure existing build log pages continue working with unified API

**Tasks:**

1. **Migrate Build Log API Routes**
   ```typescript
   // Update: /src/app/api/admin/builds/[buildId]/logs/route.ts
   // OLD: GET /v1/admin/builds/${buildId}/logs
   // NEW: GET /admin/unified-logs/stream?tier=build&buildId=${buildId}&format=ndjson
   ```

2. **Update Raw Logs API Route**
   ```typescript
   // Update: /src/app/api/admin/builds/[buildId]/logs/raw/route.ts
   // OLD: GET /v1/admin/builds/${buildId}/logs?raw=true
   // NEW: GET /admin/unified-logs/stream?tier=build&buildId=${buildId}&format=raw
   ```

3. **Build Info Migration**
   ```typescript
   // Update: /src/app/admin/build-logs/[buildId]/page.tsx
   // Replace adminApiClient.getBuildInfo() with direct database query
   // Or create new admin API endpoint for build metadata
   ```

**Questions for Backend:**
- Does the unified API support `buildId` filtering parameter?
- How do we get build metadata (status, duration, etc.) without `/builds/{buildId}/info`?
- Are there any breaking changes in the response format we should know about?

### Phase 2: Enhanced Multi-Tier Log Viewer (Week 2)

**Objective:** Add comprehensive log browsing with all 5 tiers

**New Components to Create:**

1. **Unified Log Dashboard** - `/src/app/admin/logs/page.tsx`
   ```typescript
   interface LogDashboardProps {
     // Multi-tier log browser with filtering
     tiers: ['system', 'build', 'deploy', 'action', 'lifecycle'];
     dateRange: [Date, Date];
     realTime: boolean;
   }
   ```

2. **Multi-Tier Log Viewer** - `/src/components/admin/UnifiedLogViewer.tsx`
   ```typescript
   // Based on provided example component
   // Features: Tier selection, real-time streaming, date filtering
   ```

3. **Log Segments Browser** - `/src/components/admin/LogSegmentsBrowser.tsx`
   ```typescript
   // Browse and download historical log segments
   // Features: Tier filtering, segment download (raw/NDJSON)
   ```

4. **New API Routes:**
   ```typescript
   // /src/app/api/admin/unified-logs/segments/route.ts
   // /src/app/api/admin/unified-logs/stream/route.ts
   // /src/app/api/admin/unified-logs/segments/[segmentId]/route.ts
   ```

### Phase 3: Enhanced Navigation & Integration (Week 3)

**Objective:** Integrate unified logs into existing admin interface

**Updates Required:**

1. **Admin Navigation Enhancement**
   ```typescript
   // /src/components/admin/AdminLayout.tsx or similar
   // Add "Unified Logs" section with tier-based navigation:
   // - System Logs
   // - Build Logs (existing + enhanced)
   // - Deploy Logs
   // - Action Logs
   // - Lifecycle Logs
   ```

2. **Build-Specific Deep Links**
   ```typescript
   // Maintain existing URLs but enhance functionality:
   // /admin/build-logs/[buildId] → Enhanced with unified API
   // /admin/logs → New unified log dashboard
   // /admin/logs/build → Build-specific log browser
   // /admin/logs/system → System log browser
   // etc.
   ```

3. **Cross-Tier Navigation**
   ```typescript
   // From build log page: "View related deploy logs"
   // From action logs: "View related build logs"
   // Correlation ID linking across tiers
   ```

### Phase 4: Advanced Features (Week 4)

**Objective:** Add power-user features and optimizations

**Advanced Features:**

1. **Smart Filtering & Search**
   ```typescript
   interface AdvancedLogFilter {
     tier: string[];
     dateRange: [Date, Date];
     severity: ['info', 'warn', 'error', 'debug'];
     search: string;  // Text search across log messages
     correlationId?: string;  // Cross-tier correlation
     userId?: string;
     projectId?: string;
   }
   ```

2. **Log Analytics Dashboard**
   ```typescript
   // Aggregate view:
   // - Error rates by tier
   // - Build success/failure trends
   // - System health metrics
   // - User activity patterns
   ```

3. **Export & Sharing**
   ```typescript
   // Features:
   // - Export filtered log sets
   // - Share log views with URLs
   // - Email log summaries
   // - Slack/Discord integration for critical errors
   ```

## Technical Implementation Details

### API Route Updates

**1. Unified Stream Route**
```typescript
// /src/app/api/admin/unified-logs/stream/route.ts
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tier = searchParams.get('tier') || 'build';
  const format = searchParams.get('format') || 'raw';
  const limit = searchParams.get('limit') || '1000';

  // Proxy to unified API with authentication
  const workerUrl = `${WORKER_BASE_URL}/admin/unified-logs/stream`;
  const params = new URLSearchParams({ tier, format, limit });

  const response = await fetch(`${workerUrl}?${params}`, {
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Accept': format === 'ndjson' ? 'application/x-ndjson' : 'text/plain'
    }
  });

  return new NextResponse(response.body, {
    headers: {
      'Content-Type': format === 'ndjson' ? 'application/x-ndjson' : 'text/plain',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}
```

**2. Build-Specific Compatibility Layer**
```typescript
// /src/app/api/admin/builds/[buildId]/logs/route.ts (updated)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { buildId } = await params;

  // NEW: Use unified API with build filtering
  const searchParams = request.nextUrl.searchParams;
  const bytes = searchParams.get('bytes');

  const unifiedParams = new URLSearchParams({
    tier: 'build',
    format: 'ndjson',
    ...(bytes && { limit: '10000' }), // Handle bytes parameter
    ...(buildId && { buildId }) // Filter by specific build
  });

  const workerUrl = `${WORKER_BASE_URL}/admin/unified-logs/stream?${unifiedParams}`;
  // ... rest of proxy logic
}
```

### Component Architecture

**1. Hierarchical Component Structure**
```
/src/components/admin/logs/
├── UnifiedLogViewer.tsx          # Main multi-tier log viewer
├── BuildLogViewer.tsx            # Enhanced build-specific viewer (existing)
├── LogSegmentsBrowser.tsx        # Historical segment browser
├── LogFilterPanel.tsx            # Advanced filtering UI
├── LogExportDialog.tsx           # Export functionality
└── LogAnalyticsDashboard.tsx     # Metrics and trends
```

**2. State Management**
```typescript
// /src/hooks/use-unified-logs.ts
interface UnifiedLogsState {
  selectedTier: LogTier;
  dateRange: [Date, Date];
  filters: LogFilter;
  realTime: boolean;
  logs: UnifiedLogEntry[];
  loading: boolean;
  error: string | null;
}

export const useUnifiedLogs = (config: UnifiedLogsConfig) => {
  // React Query integration for caching
  // Real-time streaming logic
  // Filter management
  // Error handling
};
```

### Database Integration

**Build Metadata Solution:**
```typescript
// Since /v1/admin/builds/{buildId}/info is deprecated, we need:

// Option 1: Direct database query via existing admin API
const buildInfo = await adminApiClient.getBuildById(buildId);

// Option 2: New admin endpoint for build metadata
// /src/app/api/admin/builds/[buildId]/metadata/route.ts

// Option 3: Extract from unified logs metadata
const buildLogs = await fetch(`/admin/unified-logs/stream?tier=build&buildId=${buildId}`);
// Parse log metadata for build info
```

## Migration Timeline

### Week 1: Critical Path (Maintain Existing Functionality)
- [ ] Update build log API routes to use unified endpoint
- [ ] Test existing build log pages work without changes
- [ ] Handle build metadata retrieval without deprecated info endpoint
- [ ] Ensure raw/NDJSON download options continue working

### Week 2: Multi-Tier Foundation
- [ ] Create unified log dashboard page (`/admin/logs`)
- [ ] Implement UnifiedLogViewer component
- [ ] Add tier selection and basic filtering
- [ ] Create segments browser for historical logs

### Week 3: Navigation & Integration
- [ ] Update admin navigation with unified logs section
- [ ] Maintain existing build-specific URLs with enhanced functionality
- [ ] Add cross-tier correlation and deep linking
- [ ] Performance testing and optimization

### Week 4: Polish & Advanced Features
- [ ] Advanced filtering and search capabilities
- [ ] Log analytics and metrics dashboard
- [ ] Export functionality and sharing features
- [ ] Documentation and user training

## Questions for Backend Team

1. **Build-Specific Filtering:**
   - Does `/admin/unified-logs/stream?tier=build` support `buildId` parameter filtering?
   - How do we get logs for a specific build ID using the unified API?

2. **Build Metadata:**
   - What's the recommended replacement for `/v1/admin/builds/{buildId}/info`?
   - Should we create a new admin API endpoint for build metadata?
   - Or can we extract build info from unified log metadata?

3. **Response Format Compatibility:**
   - Are there any breaking changes in log entry format between legacy and unified APIs?
   - Does the unified API maintain the same NDJSON structure for build logs?

4. **Performance Considerations:**
   - What are recommended limit values for different use cases?
   - How should we handle large log sets (>10MB) efficiently?
   - Any caching strategies we should implement?

5. **Timeline:**
   - When will the deprecated endpoints be removed?
   - Is there a grace period for migration?
   - Can we run both systems in parallel during transition?

## Success Metrics

### Functional Requirements
- [ ] All existing build log functionality preserved
- [ ] New multi-tier log access working
- [ ] Performance equal or better than legacy system
- [ ] Zero downtime during migration

### User Experience
- [ ] Intuitive tier selection and filtering
- [ ] Fast log loading and streaming
- [ ] Clear visual distinction between log types
- [ ] Helpful error messages and loading states

### Technical Requirements
- [ ] Proper authentication and permissions
- [ ] Efficient memory usage for large log streams
- [ ] Responsive design for mobile access
- [ ] Comprehensive error handling and logging