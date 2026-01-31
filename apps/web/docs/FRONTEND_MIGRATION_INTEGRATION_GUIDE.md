# Website Migration Tool - Frontend Integration Guide

## Overview

This guide provides everything the Next.js frontend team needs to integrate with the Website Migration Tool backend API. The tool helps users migrate existing websites to modern Next.js 14 + Tailwind CSS projects using AI-powered analysis and transformation.

## Design Philosophy: Simplicity First

**Core Principle**: Minimize user burden with prompt-first UX
- **Primary input**: URL + natural language prompt (optional)
- **No mandatory questionnaires** or complex forms
- **AI interprets** user intentions from simple descriptions
- **30-second start time** from URL to migration begin

## Authentication Pattern

**Important**: This codebase uses explicit `userId` parameters instead of authentication middleware.

- **GET requests**: `userId` passed as query parameter
- **POST/PUT requests**: `userId` passed in request body
- **No `Authorization` headers or middleware** - authentication is handled explicitly per endpoint

## Base URL

All migration endpoints are prefixed with `/api/migration`

## Complete API Reference

### Core Migration Endpoints

### 1. Start Migration

Initialize a new migration project.

**Endpoint**: `POST /api/migration/start`

**Headers**:
```typescript
{
  'Content-Type': 'application/json',
  'Idempotency-Key'?: string // Optional for duplicate prevention
}
```

**Request Body (Simplified)**:
```typescript
{
  userId: string;
  sourceUrl: string;
  prompt?: string; // Natural language: "Make it modern but keep our brand colors"
  quickPreset?: 'preserve' | 'modernize' | 'redesign'; // Optional shortcuts
}
```

**Full Request Body (Advanced)**:
```typescript
{
  userId: string;
  sourceUrl: string;
  userBrief?: {
    goals: 'preserve' | 'modernize' | 'uplift';
    style_preferences?: {
      colors?: string[];
      typography?: 'minimal' | 'expressive' | 'classic';
      spacing?: 'tight' | 'normal' | 'spacious';
      motion?: 'none' | 'subtle' | 'dynamic';
    };
    framework_preferences?: {
      strict_url_preservation?: boolean;
      allow_route_consolidation?: boolean;
      prefer_ssg?: boolean;
    };
    content_tone?: 'neutral' | 'marketing' | 'formal';
    non_negotiables?: {
      brand_colors?: string[];
      legal_text?: string[];
      tracking_ids?: string[];
    };
    risk_appetite?: 'conservative' | 'balanced' | 'bold';
    custom_instructions?: string; // Direct AI input
  };
}
```

**Response** (`201 Created`):
```typescript
{
  migrationId: string;
  status: 'analyzing' | 'questionnaire' | 'processing' | 'completed' | 'failed';
  message: string;
  verificationRequired: boolean;
  analysisStarted: boolean;
}
```

**Frontend Example (Simplified)**:
```typescript
// Simple prompt-first approach
const startMigration = async (sourceUrl: string, prompt?: string, preset?: string) => {
  const response = await fetch('/api/migration/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID()
    },
    body: JSON.stringify({
      userId: session.user.id,
      sourceUrl,
      userBrief: {
        goals: preset || 'modernize', // Default to modernize
        risk_appetite: 'balanced', // Safe default
        custom_instructions: prompt // Direct AI input
      }
    })
  });

  return response.json();
};

// Alternative: Direct prompt mapping
const startMigrationSimple = async (url: string, prompt?: string) => {
  return fetch('/api/migration/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      sourceUrl: url,
      userBrief: prompt ? {
        goals: 'modernize',
        custom_instructions: prompt
      } : undefined
    })
  });
};
```

### 2. Check Migration Status

Get current migration progress and status.

**Endpoint**: `GET /api/migration/:id/status`

**Query Parameters**:
```typescript
{
  userId: string;
}
```

**Response** (`200 OK`):
```typescript
{
  id: string;
  status: 'analyzing' | 'questionnaire' | 'processing' | 'completed' | 'failed';
  progress?: number; // 0-100
  currentPhase?: string;
  verificationStatus?: 'pending' | 'verified' | 'failed';
  targetProjectId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
```

### 3. Get User Brief

Retrieve the current user brief for the migration.

**Endpoint**: `GET /api/migration/:id/brief`

**Query Parameters**:
```typescript
{
  userId: string;
}
```

**Response** (`200 OK`):
```typescript
{
  goals: 'preserve' | 'modernize' | 'uplift';
  style_preferences: { ... };
  framework_preferences: { ... };
  // ... full user brief object
}
```

### 4. Update User Brief

Update migration preferences and requirements.

**Endpoint**: `PUT /api/migration/:id/brief`

**Request Body**:
```typescript
{
  userId: string;
  userBrief: {
    goals: 'preserve' | 'modernize' | 'uplift';
    style_preferences?: { ... };
    framework_preferences?: { ... };
    // ... same structure as start migration
  };
}
```

**Response** (`200 OK`):
```typescript
{
  success: boolean;
  message: string;
  updatedAt: string;
}
```

### 5. Verify Ownership (Submit)

Submit ownership verification for the source website.

**Endpoint**: `POST /api/migration/:id/verify`

**Request Body**:
```typescript
{
  userId: string;
  method: 'dns' | 'file';
  token?: string; // Required for file method
}
```

**Response** (`200 OK`):
```typescript
{
  method: 'dns' | 'file';
  token: string;
  instructions: string;
  expiresAt: string;
  verified: boolean;
}
```

### 6. Check Verification Status

Get current ownership verification status.

**Endpoint**: `GET /api/migration/:id/verify`

**Query Parameters**:
```typescript
{
  userId: string;
}
```

**Response** (`200 OK`):
```typescript
{
  verified: boolean;
  method?: 'dns' | 'file';
  verifiedAt?: string;
  instructions?: string;
  token?: string;
  expiresAt?: string;
}
```

### 7. Get Site Analysis

Retrieve preliminary site analysis results.

**Endpoint**: `GET /api/migration/:id/analysis`

**Query Parameters**:
```typescript
{
  userId: string;
}
```

**Response** (`200 OK`):
```typescript
{
  technologies: string[];
  pageCount: number;
  complexity: 'low' | 'medium' | 'high';
  recommendations: string[];
  crawlData?: {
    pages: Array<{
      url: string;
      title: string;
      statusCode: number;
    }>;
    assets: Array<{
      type: string;
      url: string;
      size?: number;
    }>;
  };
}
```

### 8. Get URL Mapping

Get the URL mapping for SEO preservation.

**Endpoint**: `GET /api/migration/:id/map`

**Query Parameters**:
```typescript
{
  userId: string;
}
```

**Response** (`200 OK`):
```typescript
{
  mappings: Array<{
    sourceUrl: string;
    targetRoute: string;
    redirectCode: 301 | 302 | 307 | 308;
    status: 'planned' | 'generated' | 'verified';
    canonical: boolean;
  }>;
  totalMappings: number;
  preservationRate: number; // 0-100
}
```

### 9. Start Processing

Begin the AI transformation process.

**Endpoint**: `POST /api/migration/:id/process`

**Request Body**:
```typescript
{
  userId: string;
}
```

**Response** (`200 OK`):
```typescript
{
  success: boolean;
  message: string;
  jobId: string;
  estimatedDuration: number; // minutes
}
```

### 10. Cancel Migration

Cancel an in-progress migration.

**Endpoint**: `POST /api/migration/:id/cancel`

**Request Body**:
```typescript
{
  userId: string;
}
```

**Response** (`200 OK`):
```typescript
{
  success: boolean;
  message: string;
  cancelledAt: string;
}
```

### 11. Get Phase Progress

Get detailed progress for each migration phase.

**Endpoint**: `GET /api/migration/:id/phases`

**Query Parameters**:
```typescript
{
  userId: string;
}
```

**Response** (`200 OK`):
```typescript
{
  phases: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number; // 0-100
    startedAt?: string;
    completedAt?: string;
    output?: any;
    errorMessage?: string;
  }>;
  currentPhase?: string;
  overallProgress: number; // 0-100
}
```

### 12. Get Tool Audit Trail

Get audit trail of all AI tool calls and operations.

**Endpoint**: `GET /api/migration/:id/tools`

**Query Parameters**:
```typescript
{
  userId: string;
}
```

**Response** (`200 OK`):
```typescript
{
  toolCalls: Array<{
    id: string;
    agent: 'planner' | 'transformer' | 'critic' | 'executive';
    tool: string;
    args: any;
    result: any;
    tokens: number;
    createdAt: string;
  }>;
  totalTokens: number;
  totalCost: number;
}
```

### Enhanced Migration Endpoints (Phase 2 & 3)

### 13. Real-time Progress Stream (SSE)

**NEW**: Get real-time migration progress updates via Server-Sent Events.

**Endpoint**: `GET /api/migration/:id/stream`

**Query Parameters**:
```typescript
{
  userId: string;
}
```

**Headers**:
```typescript
{
  'Last-Event-ID'?: string; // Optional for resuming from specific event
}
```

**Response**: Server-Sent Events stream with these event types:
```typescript
// Event format
data: {
  type: 'migration_started' | 'verification_completed' | 'verification_failed' |
        'phase_started' | 'phase_completed' | 'migration_completed' | 'migration_failed' | 'migration_cancelled';
  migrationId: string;
  status: 'analyzing' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  phase?: string; // Current phase name
  timestamp: number;
}
```

**Frontend Implementation**:
```typescript
const connectToMigrationStream = (migrationId: string, userId: string) => {
  const eventSource = new EventSource(
    `/api/migration/${migrationId}/stream?userId=${userId}`
  );

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    updateMigrationProgress(data);
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    // Implement reconnection logic
  };

  return eventSource;
};
```

### 14. Migration Analytics

**NEW**: Get detailed analytics and metrics for a migration.

**Endpoint**: `GET /api/migration/:id/analytics`

**Query Parameters**:
```typescript
{
  userId: string;
}
```

**Response** (`200 OK`):
```typescript
{
  metrics: {
    totalDuration: number; // milliseconds
    aiTimeConsumed: number; // seconds
    phaseDurations: Record<string, number>;
    retryCount: number;
    verificationAttempts: number;
  };
  performance: {
    successRate: number; // 0-100
    averageCompletionTime: number;
    bottlenecks: string[];
  };
  costs: {
    aiTimeUsed: number; // seconds
    estimatedCost: number; // USD
    breakdown: Record<string, number>;
  };
}
```

### 15. Retry Migration

**NEW**: Retry a failed migration with enhanced options.

**Endpoint**: `POST /api/migration/:id/retry`

**Headers**:
```typescript
{
  'Content-Type': 'application/json',
  'Idempotency-Key': string // Required for duplicate prevention
}
```

**Request Body**:
```typescript
{
  userId: string;
  retryOptions?: {
    retryReason: 'tool_timeout' | 'ownership_failed' | 'budget_exceeded' |
                 'builder_incompatibility' | 'deployment_error' | 'user_request';
    newUserBrief?: UserBrief; // Updated user preferences
    increasedBudget?: {
      softBudgetSeconds: number;
      hardBudgetSeconds: number;
    };
    reuseSeeds?: boolean; // true = deterministic retry, false = new attempt
  };
}
```

**Response** (`200 OK`):
```typescript
{
  success: boolean;
  retryId: string;
  message: string;
  estimatedDuration: number; // minutes
  previousAttempts: number;
}
```

### 16. Migration Billing Breakdown

**NEW**: Get detailed AI time billing information for a migration.

**Endpoint**: `GET /api/migration/:id/billing`

**Query Parameters**:
```typescript
{
  userId: string;
}
```

**Response** (`200 OK`):
```typescript
{
  totalAITime: number; // seconds consumed
  breakdown: Array<{
    phase: string;
    aiTimeSeconds: number;
    cost: number; // USD
    startedAt: string;
    completedAt: string;
    efficiency: number; // 0-100 score
  }>;
  comparison: {
    estimated: number;
    actual: number;
    variance: number; // percentage
  };
  budget: {
    softLimit: number;
    hardLimit: number;
    remaining: number;
    exceeded: boolean;
  };
}
```

### 17. Migration Event History

**NEW**: Get paginated migration event history for backfill.

**Endpoint**: `GET /api/migration/:id/events`

**Query Parameters**:
```typescript
{
  userId: string;
  sinceId?: string; // Cursor for pagination
  limit?: number; // Default 50, max 200
}
```

**Response** (`200 OK`):
```typescript
{
  events: Array<{
    id: string;
    type: string;
    migrationId: string;
    payload: any;
    timestamp: string;
    sequence: number;
  }>;
  hasMore: boolean;
  nextCursor?: string;
}
```

### 18. Skip Verification (Development)

**NEW**: Skip ownership verification for development/testing.

**Endpoint**: `POST /api/migration/:id/verify/skip`

**Request Body**:
```typescript
{
  userId: string;
  reason?: string; // Optional reason for audit
}
```

**Response** (`200 OK`):
```typescript
{
  success: boolean;
  message: string;
  skippedAt: string;
}
```

### Enterprise Endpoints (Phase 3)

### 19. Organization Migration Config

**NEW**: Get/set organization-level migration configuration.

**Get Config**: `GET /api/migration/org/:orgId/config`
**Set Config**: `PUT /api/migration/org/:orgId/config`

**Query Parameters** (GET):
```typescript
{
  userId: string;
}
```

**Request Body** (PUT):
```typescript
{
  userId: string;
  config: {
    customBudgets?: {
      softBudgetSeconds: number;
      hardBudgetSeconds: number;
      perPhaseCapSeconds: number;
      monthlyAllowanceSeconds: number;
    };
    migrationLimits?: {
      concurrentMigrations: number;
      dailyMigrations: number;
      monthlyMigrations: number;
    };
    advancedFeatures?: {
      bulkMigrations: boolean;
      whiteGloveService: boolean;
      customIntegrations: boolean;
      advancedAnalytics: boolean;
    };
  };
}
```

**Response** (`200 OK`):
```typescript
{
  orgId: string;
  config: OrganizationMigrationConfig;
  updatedAt: string;
}
```

### 20. Bulk Migration Operations

**NEW**: Start and manage bulk migrations for enterprise customers.

**Start Bulk**: `POST /api/migration/bulk/start`
**Get Status**: `GET /api/migration/bulk/:bulkId/status`

**Request Body** (Start):
```typescript
{
  userId: string;
  orgId: string;
  bulkRequest: {
    name: string;
    description?: string;
    urls: string[]; // Array of URLs to migrate
    userBrief: UserBrief; // Applied to all migrations
    scheduling: {
      immediate: boolean;
      scheduledFor?: string; // ISO date
      batchSize?: number; // URLs per batch
      delayBetweenBatches?: number; // seconds
    };
    notifications: {
      email?: string;
      webhook?: string;
      slackChannel?: string;
    };
  };
}
```

**Response** (`201 Created`):
```typescript
{
  success: boolean;
  bulkId: string;
  totalUrls: number;
  estimatedCompletionTime: string;
  message: string;
}
```

**Bulk Status Response**:
```typescript
{
  bulkId: string;
  name: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  totalUrls: number;
  completedMigrations: number;
  failedMigrations: number;
  currentBatch: number;
  totalBatches: number;
  estimatedCompletionTime?: string;
  migrations: Array<{
    migrationId: string;
    url: string;
    status: string;
    progress: number;
    aiTimeConsumed: number;
  }>;
}
```

### 21. Organization Analytics

**NEW**: Get comprehensive analytics for an organization.

**Endpoint**: `GET /api/migration/org/:orgId/analytics`

**Query Parameters**:
```typescript
{
  userId: string;
  timeRange?: {
    from: string; // ISO date
    to: string; // ISO date
  };
}
```

**Response** (`200 OK`):
```typescript
{
  metrics: {
    totalMigrations: number;
    successRate: number; // 0-100
    averageCompletionTime: number; // milliseconds
    totalAITimeConsumed: number; // seconds
    costSavings: number; // USD
  };
  performanceReport: {
    trends: Array<{
      date: string;
      migrations: number;
      successRate: number;
      avgTime: number;
    }>;
    topFailureReasons: string[];
    optimizationOpportunities: string[];
  };
  recommendations: string[];
}
```

## Error Response Format

All endpoints return consistent error responses:

```typescript
{
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  details?: any;
}
```

**Common Error Codes**:
- `400` - Bad Request (validation errors)
- `404` - Migration not found or access denied
- `409` - Conflict (migration already processing)
- `429` - Rate limit exceeded
- `500` - Internal server error

## Recommended UI Patterns

### Simple Migration Form (Recommended)

**30-Second Start Experience**:
```jsx
function MigrationStart() {
  const [url, setUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState(null);

  return (
    <form onSubmit={handleStart} className="max-w-2xl space-y-6">
      {/* Primary Input */}
      <div>
        <label className="text-lg font-medium">Website URL</label>
        <input
          type="url"
          placeholder="https://your-website.com"
          value={url}
          onChange={e => setUrl(e.target.value)}
          className="w-full p-3 border rounded-lg"
          required
        />
      </div>

      {/* Optional Prompt */}
      <div>
        <label className="text-lg font-medium">
          What would you like? <span className="text-gray-500">(optional)</span>
        </label>
        <textarea
          placeholder="Examples:
• Make it more modern but keep our brand colors
• Convert to a clean, minimal design
• Keep everything the same but make it mobile-friendly
• Complete redesign with a professional look"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          className="w-full p-3 border rounded-lg h-32"
        />
      </div>

      {/* Quick Presets (Optional) */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setPreset('preserve')}
          className={preset === 'preserve' ? 'btn-selected' : 'btn-option'}
        >
          Keep Current Design
        </button>
        <button
          type="button"
          onClick={() => setPreset('modernize')}
          className={preset === 'modernize' ? 'btn-selected' : 'btn-option'}
        >
          Make It Modern
        </button>
        <button
          type="button"
          onClick={() => setPreset('redesign')}
          className={preset === 'redesign' ? 'btn-selected' : 'btn-option'}
        >
          Complete Redesign
        </button>
      </div>

      {/* Start Button */}
      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-3 rounded-lg text-lg font-medium"
      >
        Start Migration
      </button>
    </form>
  );
}
```

### Advanced Options (Collapsible)

For users who want more control:
```jsx
function AdvancedOptions({ userBrief, onChange }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-t pt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center text-sm text-gray-600"
      >
        Advanced Options {isOpen ? '▲' : '▼'}
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4 text-sm">
          <div>
            <label>Risk Level</label>
            <select
              value={userBrief.risk_appetite || 'balanced'}
              onChange={e => onChange({...userBrief, risk_appetite: e.target.value})}
            >
              <option value="conservative">Conservative (safer changes)</option>
              <option value="balanced">Balanced</option>
              <option value="bold">Bold (more dramatic changes)</option>
            </select>
          </div>

          <div>
            <label>URL Preservation</label>
            <input
              type="checkbox"
              checked={userBrief.framework_preferences?.strict_url_preservation ?? true}
              onChange={e => onChange({
                ...userBrief,
                framework_preferences: {
                  ...userBrief.framework_preferences,
                  strict_url_preservation: e.target.checked
                }
              })}
            />
            <span className="ml-2">Keep all URLs exactly the same</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Enhanced Progress Monitoring (Real-time SSE)

**NEW**: Real-time progress display with Server-Sent Events:
```jsx
function EnhancedMigrationProgress({ migrationId, userId }) {
  const [progress, setProgress] = useState(null);
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Connect to SSE stream for real-time updates
    const eventSource = new EventSource(
      `/api/migration/${migrationId}/stream?userId=${userId}`
    );

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);
      setEvents(prev => [...prev, data].slice(-10)); // Keep last 10 events
    };

    eventSource.onerror = (error) => {
      setConnected(false);
      console.error('SSE connection error:', error);

      // Fallback to polling if SSE fails
      setTimeout(() => {
        if (eventSource.readyState === EventSource.CLOSED) {
          pollMigrationStatus();
        }
      }, 5000);
    };

    return () => {
      eventSource.close();
    };
  }, [migrationId, userId]);

  const pollMigrationStatus = async () => {
    try {
      const response = await fetch(`/api/migration/${migrationId}/status?userId=${userId}`);
      const status = await response.json();
      setProgress({
        type: 'status_update',
        ...status,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Polling failed:', error);
    }
  };

  if (!progress) return <div>Connecting to migration stream...</div>;

  return (
    <div className="max-w-2xl space-y-4">
      {/* Connection Status */}
      <div className="flex items-center space-x-2 text-sm">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-orange-500'}`} />
        <span>{connected ? 'Live updates' : 'Reconnecting...'}</span>
      </div>

      {/* Main Status */}
      <div className="flex items-center space-x-3">
        <div className={`w-4 h-4 rounded-full ${
          progress.status === 'completed' ? 'bg-green-500' :
          progress.status === 'failed' ? 'bg-red-500' : 'bg-blue-500 animate-pulse'
        }`} />
        <span className="font-medium capitalize">{progress.status}</span>
        {progress.phase && (
          <span className="text-sm text-gray-600">• {progress.phase.replace('_', ' ')}</span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-blue-600 h-3 rounded-full transition-all duration-500"
          style={{ width: `${progress.progress || 0}%` }}
        />
      </div>
      <div className="text-sm text-gray-600">{progress.progress || 0}% complete</div>

      {/* Current Message */}
      {progress.message && (
        <div className="bg-blue-50 p-3 rounded-lg">
          <p className="text-sm">{progress.message}</p>
        </div>
      )}

      {/* Recent Events */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700">Recent Activity</h4>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {events.map((event, index) => (
            <div key={index} className="text-xs text-gray-600 flex justify-between">
              <span>{event.type.replace('_', ' ')}</span>
              <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      {progress.status === 'completed' && progress.targetProjectId && (
        <a
          href={`/projects/${progress.targetProjectId}`}
          className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg"
        >
          View Your New Project →
        </a>
      )}

      {progress.status === 'failed' && (
        <div className="flex space-x-3">
          <button
            onClick={() => retryMigration(migrationId)}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm"
          >
            Retry Migration
          </button>
          <button
            onClick={() => viewAnalytics(migrationId)}
            className="bg-gray-600 text-white px-4 py-2 rounded text-sm"
          >
            View Details
          </button>
        </div>
      )}
    </div>
  );
}
```

### Enhanced Verification UX

**NEW**: Improved verification with provider detection:
```jsx
function EnhancedVerification({ migrationId, userId }) {
  const [verification, setVerification] = useState(null);
  const [provider, setProvider] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    loadVerificationStatus();
  }, [migrationId]);

  const loadVerificationStatus = async () => {
    try {
      const response = await fetch(`/api/migration/${migrationId}/verify?userId=${userId}`);
      const data = await response.json();
      setVerification(data);

      // If not verified, detect DNS provider for better UX
      if (!data.verified && data.domain) {
        detectDNSProvider(data.domain);
      }
    } catch (error) {
      console.error('Failed to load verification status:', error);
    }
  };

  const detectDNSProvider = async (domain) => {
    try {
      // This would call our DNS provider detection service
      const response = await fetch(`/api/migration/dns/detect?domain=${domain}`);
      const providerInfo = await response.json();
      setProvider(providerInfo);
    } catch (error) {
      console.error('Failed to detect DNS provider:', error);
    }
  };

  const startVerification = async (method) => {
    try {
      const response = await fetch(`/api/migration/${migrationId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, method })
      });
      const data = await response.json();
      setVerification(data);

      // Start automatic polling for DNS verification
      if (method === 'dns') {
        startPolling();
      }
    } catch (error) {
      console.error('Failed to start verification:', error);
    }
  };

  const startPolling = () => {
    setPolling(true);
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/migration/${migrationId}/verify?userId=${userId}`);
        const data = await response.json();

        if (data.verified) {
          setVerification(data);
          setPolling(false);
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Polling failed:', error);
      }
    }, 5000); // Poll every 5 seconds

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setPolling(false);
    }, 300000);
  };

  if (verification?.verified) {
    return (
      <div className="bg-green-50 p-4 rounded-lg">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-green-500 rounded-full" />
          <span className="font-medium text-green-800">Domain Verified</span>
        </div>
        <p className="text-sm text-green-700 mt-1">
          Verified via {verification.method} on {new Date(verification.verifiedAt).toLocaleString()}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h3 className="text-lg font-medium">Verify Domain Ownership</h3>

      {provider && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <span className="font-medium">Detected: {provider.provider}</span>
          </div>
          <p className="text-sm text-blue-700">{provider.instructions}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* DNS Verification */}
        <div className="border rounded-lg p-4">
          <h4 className="font-medium mb-2">DNS Record (Recommended)</h4>
          <p className="text-sm text-gray-600 mb-3">
            Add a TXT record to your domain's DNS settings
          </p>
          <button
            onClick={() => startVerification('dns')}
            disabled={polling}
            className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
          >
            {polling ? 'Checking DNS...' : 'Start DNS Verification'}
          </button>
        </div>

        {/* File Verification */}
        <div className="border rounded-lg p-4">
          <h4 className="font-medium mb-2">File Upload</h4>
          <p className="text-sm text-gray-600 mb-3">
            Upload a verification file to your website
          </p>
          <button
            onClick={() => startVerification('file')}
            className="w-full bg-gray-600 text-white py-2 rounded"
          >
            Start File Verification
          </button>
        </div>
      </div>

      {verification?.token && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium mb-2">Verification Instructions</h4>
          <div className="bg-white p-3 rounded border font-mono text-sm break-all">
            {verification.method === 'dns' ? (
              <>
                <strong>TXT Record:</strong><br />
                Name: _sheenapps-verify<br />
                Value: {verification.token}
              </>
            ) : (
              <>
                <strong>File Path:</strong> /.well-known/sheenapps-verify.txt<br />
                <strong>Content:</strong> {verification.token}
              </>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {verification.instructions}
          </p>
        </div>
      )}

      {/* Development Skip Option */}
      {process.env.NODE_ENV === 'development' && (
        <div className="border-t pt-4">
          <button
            onClick={() => skipVerification()}
            className="text-sm text-gray-500 underline"
          >
            Skip verification (development only)
          </button>
        </div>
      )}
    </div>
  );
}
```

### Enterprise Bulk Migration UI

**NEW**: Interface for enterprise bulk operations:
```jsx
function BulkMigrationManager({ orgId, userId }) {
  const [bulkJobs, setBulkJobs] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const createBulkMigration = async (formData) => {
    try {
      const response = await fetch('/api/migration/bulk/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          orgId,
          bulkRequest: formData
        })
      });

      const result = await response.json();
      if (result.success) {
        loadBulkJobs();
        setShowCreateForm(false);
      }
    } catch (error) {
      console.error('Failed to create bulk migration:', error);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Bulk Migrations</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          New Bulk Migration
        </button>
      </div>

      {/* Bulk Jobs List */}
      <div className="space-y-4">
        {bulkJobs.map((job) => (
          <div key={job.bulkId} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium">{job.name}</h3>
                <p className="text-sm text-gray-600">{job.description}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${
                job.status === 'completed' ? 'bg-green-100 text-green-800' :
                job.status === 'failed' ? 'bg-red-100 text-red-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {job.status}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Total URLs:</span>
                <div className="font-medium">{job.totalUrls}</div>
              </div>
              <div>
                <span className="text-gray-500">Completed:</span>
                <div className="font-medium text-green-600">{job.completedMigrations}</div>
              </div>
              <div>
                <span className="text-gray-500">Failed:</span>
                <div className="font-medium text-red-600">{job.failedMigrations}</div>
              </div>
              <div>
                <span className="text-gray-500">Progress:</span>
                <div className="font-medium">
                  {Math.round((job.completedMigrations / job.totalUrls) * 100)}%
                </div>
              </div>
            </div>

            {job.status === 'running' && (
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${(job.completedMigrations / job.totalUrls) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <BulkMigrationForm
          onSubmit={createBulkMigration}
          onCancel={() => setShowCreateForm(false)}
        />
      )}
    </div>
  );
}
```

### Migration Analytics Dashboard

**NEW**: Analytics and insights for individual migrations:
```jsx
function MigrationAnalytics({ migrationId, userId }) {
  const [analytics, setAnalytics] = useState(null);
  const [billing, setBilling] = useState(null);

  useEffect(() => {
    loadAnalytics();
    loadBilling();
  }, [migrationId]);

  const loadAnalytics = async () => {
    try {
      const response = await fetch(`/api/migration/${migrationId}/analytics?userId=${userId}`);
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  const loadBilling = async () => {
    try {
      const response = await fetch(`/api/migration/${migrationId}/billing?userId=${userId}`);
      const data = await response.json();
      setBilling(data);
    } catch (error) {
      console.error('Failed to load billing:', error);
    }
  };

  if (!analytics || !billing) return <div>Loading analytics...</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-xl font-bold">Migration Analytics</h2>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-blue-600">
            {Math.round(analytics.metrics.totalDuration / 60000)}m
          </div>
          <div className="text-sm text-gray-600">Total Time</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-green-600">
            {analytics.metrics.aiTimeConsumed}s
          </div>
          <div className="text-sm text-gray-600">AI Time Used</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-purple-600">
            ${billing.costs.estimatedCost.toFixed(2)}
          </div>
          <div className="text-sm text-gray-600">Estimated Cost</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-orange-600">
            {analytics.metrics.retryCount}
          </div>
          <div className="text-sm text-gray-600">Retries</div>
        </div>
      </div>

      {/* AI Time Breakdown */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="text-lg font-medium mb-4">AI Time Breakdown by Phase</h3>
        <div className="space-y-3">
          {billing.breakdown.map((phase) => (
            <div key={phase.phase} className="flex justify-between items-center">
              <span className="font-medium">{phase.phase.replace('_', ' ')}</span>
              <div className="flex items-center space-x-4 text-sm">
                <span>{phase.aiTimeSeconds}s</span>
                <span className="text-gray-500">${phase.cost.toFixed(2)}</span>
                <div className={`px-2 py-1 rounded ${
                  phase.efficiency > 80 ? 'bg-green-100 text-green-800' :
                  phase.efficiency > 60 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {phase.efficiency}% efficient
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Insights */}
      {analytics.performance.bottlenecks.length > 0 && (
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <h3 className="font-medium text-yellow-800 mb-2">Performance Insights</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            {analytics.performance.bottlenecks.map((bottleneck, index) => (
              <li key={index}>• {bottleneck}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Budget Status */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="text-lg font-medium mb-4">Budget Status</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span>Estimated vs Actual</span>
            <span className={billing.comparison.variance > 0 ? 'text-red-600' : 'text-green-600'}>
              {billing.comparison.variance > 0 ? '+' : ''}{billing.comparison.variance}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full"
              style={{ width: `${(billing.comparison.actual / billing.budget.softLimit) * 100}%` }}
            />
          </div>
          <div className="text-sm text-gray-600">
            {billing.comparison.actual}s / {billing.budget.softLimit}s soft limit
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Frontend Integration Examples

### Complete Migration Workflow (Simplified)

```typescript
// Simple 3-step process
async function startSimpleMigration(url: string, prompt?: string) {
  // 1. Start migration with prompt
  const migration = await fetch('/api/migration/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      sourceUrl: url,
      userBrief: prompt ? {
        goals: 'modernize',
        custom_instructions: prompt
      } : { goals: 'modernize' }
    })
  });

  const { migrationId } = await migration.json();

  // 2. Handle verification if needed
  await handleVerification(migrationId);

  // 3. Monitor progress
  return monitorProgress(migrationId);
}

async function handleVerification(migrationId: string) {
  // Check verification status
  const verifyResponse = await fetch(`/api/migration/${migrationId}/verify?userId=${userId}`);
  const { verified } = await verifyResponse.json();

  if (!verified) {
    // Start DNS verification (simplest method)
    const startVerify = await fetch(`/api/migration/${migrationId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, method: 'dns' })
    });

    const { token, instructions } = await startVerify.json();

    // Show user simple instructions
    showVerificationInstructions(instructions, token);

    // Poll for completion
    return pollVerification(migrationId);
  }
}

async function monitorProgress(migrationId: string) {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/migration/${migrationId}/status?userId=${userId}`);
        const status = await response.json();

        updateProgressUI(status);

        if (status.status === 'completed') {
          resolve(status);
        } else if (status.status === 'failed') {
          reject(new Error('Migration failed'));
        } else {
          setTimeout(poll, 2000); // Poll every 2 seconds
        }
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}
```

### Enhanced React Hooks

**NEW**: Enhanced hooks with SSE support and analytics:

```typescript
import { useState, useEffect, useRef } from 'react';

// Main migration hook with SSE support
export function useMigration(migrationId: string, userId: string) {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    // Try SSE first, fallback to polling
    connectToSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [migrationId, userId]);

  const connectToSSE = () => {
    try {
      const eventSource = new EventSource(
        `/api/migration/${migrationId}/stream?userId=${userId}`
      );
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setConnected(true);
        setLoading(false);
      };

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setStatus(data);
        setEvents(prev => [...prev, data].slice(-20)); // Keep last 20 events

        // Stop loading on first message
        setLoading(false);
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setConnected(false);

        // Fallback to polling after SSE fails
        setTimeout(() => {
          if (eventSource.readyState === EventSource.CLOSED) {
            startPolling();
          }
        }, 2000);
      };

    } catch (error) {
      console.error('Failed to connect to SSE:', error);
      startPolling();
    }
  };

  const startPolling = async () => {
    try {
      const response = await fetch(`/api/migration/${migrationId}/status?userId=${userId}`);
      if (!response.ok) throw new Error('Failed to fetch status');

      const data = await response.json();
      setStatus(data);
      setLoading(false);

      // Continue polling if still processing
      if (['analyzing', 'processing'].includes(data.status)) {
        setTimeout(startPolling, 3000);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const retry = async (retryOptions = {}) => {
    try {
      const response = await fetch(`/api/migration/${migrationId}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify({
          userId,
          retryOptions
        })
      });

      if (!response.ok) throw new Error('Retry failed');

      const result = await response.json();
      return result;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  const cancel = async () => {
    try {
      const response = await fetch(`/api/migration/${migrationId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (!response.ok) throw new Error('Cancel failed');

      const result = await response.json();
      return result;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  return {
    status,
    events,
    loading,
    error,
    connected,
    retry,
    cancel,
    isProcessing: status?.status && ['analyzing', 'processing'].includes(status.status),
    isCompleted: status?.status === 'completed',
    isFailed: status?.status === 'failed'
  };
}

// Analytics hook for detailed insights
export function useMigrationAnalytics(migrationId: string, userId: string) {
  const [analytics, setAnalytics] = useState(null);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (migrationId && userId) {
      loadAnalytics();
    }
  }, [migrationId, userId]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);

      const [analyticsResponse, billingResponse] = await Promise.all([
        fetch(`/api/migration/${migrationId}/analytics?userId=${userId}`),
        fetch(`/api/migration/${migrationId}/billing?userId=${userId}`)
      ]);

      if (!analyticsResponse.ok || !billingResponse.ok) {
        throw new Error('Failed to load analytics data');
      }

      const [analyticsData, billingData] = await Promise.all([
        analyticsResponse.json(),
        billingResponse.json()
      ]);

      setAnalytics(analyticsData);
      setBilling(billingData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    analytics,
    billing,
    loading,
    error,
    refresh: loadAnalytics
  };
}

// Enterprise bulk migration hook
export function useBulkMigration(orgId: string, userId: string) {
  const [bulkJobs, setBulkJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (orgId && userId) {
      loadBulkJobs();
    }
  }, [orgId, userId]);

  const loadBulkJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/migration/org/${orgId}/bulk?userId=${userId}`);
      if (!response.ok) throw new Error('Failed to load bulk jobs');

      const data = await response.json();
      setBulkJobs(data.jobs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createBulkMigration = async (bulkRequest) => {
    try {
      const response = await fetch('/api/migration/bulk/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          orgId,
          bulkRequest
        })
      });

      if (!response.ok) throw new Error('Failed to create bulk migration');

      const result = await response.json();
      await loadBulkJobs(); // Refresh the list
      return result;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  const getBulkStatus = async (bulkId) => {
    try {
      const response = await fetch(`/api/migration/bulk/${bulkId}/status?userId=${userId}`);
      if (!response.ok) throw new Error('Failed to get bulk status');

      return await response.json();
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  return {
    bulkJobs,
    loading,
    error,
    createBulkMigration,
    getBulkStatus,
    refresh: loadBulkJobs
  };
}

// Organization analytics hook
export function useOrganizationAnalytics(orgId: string, userId: string, timeRange = null) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (orgId && userId) {
      loadAnalytics();
    }
  }, [orgId, userId, timeRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);

      let url = `/api/migration/org/${orgId}/analytics?userId=${userId}`;
      if (timeRange) {
        const params = new URLSearchParams({
          'timeRange.from': timeRange.from,
          'timeRange.to': timeRange.to
        });
        url += `&${params.toString()}`;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load organization analytics');

      const data = await response.json();
      setAnalytics(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    analytics,
    loading,
    error,
    refresh: loadAnalytics
  };
}

// Verification hook with provider detection
export function useVerification(migrationId: string, userId: string) {
  const [verification, setVerification] = useState(null);
  const [provider, setProvider] = useState(null);
  const [polling, setPolling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (migrationId && userId) {
      loadVerificationStatus();
    }
  }, [migrationId, userId]);

  const loadVerificationStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/migration/${migrationId}/verify?userId=${userId}`);
      if (!response.ok) throw new Error('Failed to load verification status');

      const data = await response.json();
      setVerification(data);

      // Auto-detect DNS provider if not verified
      if (!data.verified && data.domain) {
        await detectDNSProvider(data.domain);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const detectDNSProvider = async (domain) => {
    try {
      const response = await fetch(`/api/migration/dns/detect?domain=${domain}`);
      if (response.ok) {
        const providerInfo = await response.json();
        setProvider(providerInfo);
      }
    } catch (error) {
      console.warn('DNS provider detection failed:', error);
    }
  };

  const startVerification = async (method) => {
    try {
      const response = await fetch(`/api/migration/${migrationId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, method })
      });

      if (!response.ok) throw new Error('Failed to start verification');

      const data = await response.json();
      setVerification(data);

      // Start polling for DNS verification
      if (method === 'dns') {
        startPolling();
      }

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const startPolling = () => {
    setPolling(true);

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/migration/${migrationId}/verify?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          setVerification(data);

          if (data.verified) {
            setPolling(false);
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error('Verification polling failed:', error);
      }
    }, 5000);

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setPolling(false);
    }, 300000);
  };

  const skipVerification = async () => {
    try {
      const response = await fetch(`/api/migration/${migrationId}/verify/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason: 'Development testing' })
      });

      if (!response.ok) throw new Error('Failed to skip verification');

      const data = await response.json();
      setVerification({ ...verification, verified: true, skipped: true });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return {
    verification,
    provider,
    polling,
    loading,
    error,
    startVerification,
    skipVerification,
    refresh: loadVerificationStatus,
    isVerified: verification?.verified || false
  };
}
```

## Rate Limiting

- **Migration start**: 3 per hour per user
- **Status checks**: 60 per minute per user
- **Other operations**: 30 per minute per user

## File Upload (Future)

For file-based ownership verification, implement:
```typescript
const uploadVerificationFile = async (migrationId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('userId', userId);

  const response = await fetch(`/api/migration/${migrationId}/verify/upload`, {
    method: 'POST',
    body: formData
  });

  return response.json();
};
```

## Implementation Checklist

### Phase 1: Core Migration (MVP)
- [ ] **Basic form**: URL input + optional prompt textarea
- [ ] **Quick presets**: 3 buttons (Preserve/Modernize/Redesign)
- [ ] **Start endpoint**: POST to `/api/migration/start` with prompt
- [ ] **Progress polling**: Simple status checks every 2 seconds
- [ ] **Success redirect**: Link to completed project
- [ ] **Error handling**: Basic retry and cancel functionality

### Phase 2: Enhanced UX ✅ BACKEND READY
- [ ] **Real-time SSE**: Connect to `/api/migration/:id/stream` for live updates
- [ ] **Enhanced verification**: DNS provider detection and automated polling
- [ ] **Advanced retry**: Retry with options using `/api/migration/:id/retry`
- [ ] **Analytics dashboard**: Migration insights with `/api/migration/:id/analytics`
- [ ] **Billing breakdown**: AI time tracking with `/api/migration/:id/billing`
- [ ] **Event history**: Backfill support with `/api/migration/:id/events`
- [ ] **Progress visualization**: Enhanced phase indicators and progress bars

### Phase 3: Enterprise Features ✅ BACKEND READY
- [ ] **Organization config**: Enterprise settings with `/api/migration/org/:orgId/config`
- [ ] **Bulk migrations**: Mass migration UI with `/api/migration/bulk/start`
- [ ] **Organization analytics**: Company-wide insights and reporting
- [ ] **Advanced monitoring**: Performance tracking and optimization recommendations
- [ ] **Custom budgets**: Organization-level AI time management

### Phase 4: Production Polish
- [ ] **Migration history**: List of user's past migrations with analytics
- [ ] **Result preview**: Before/after comparison views
- [ ] **Audit trail**: Show AI decisions and tool usage
- [ ] **Advanced search**: Filter and search migration history
- [ ] **Export capabilities**: Download migration reports and data

### Implementation Priority

**Start with Phase 1** - Basic migration workflow:
1. Simple form with URL + prompt
2. SSE connection for real-time progress (recommended over polling)
3. Basic error handling and retry

**Add Phase 2** - Enhanced features:
1. Verification flow with provider detection
2. Analytics dashboard for insights
3. Enhanced retry options with reason tracking

**Enterprise customers get Phase 3**:
1. Bulk migration management
2. Organization-level analytics and configuration
3. Advanced monitoring and cost tracking

### Frontend Architecture Recommendations

#### Real-time Communication Strategy
```typescript
// Recommended: SSE-first with polling fallback
const useRealtimeMigration = (migrationId, userId) => {
  // Try SSE first
  const eventSource = new EventSource(`/api/migration/${migrationId}/stream?userId=${userId}`);

  // Fallback to polling if SSE fails
  eventSource.onerror = () => {
    console.log('SSE failed, falling back to polling');
    startPollingFallback();
  };
};
```

#### State Management Pattern
```typescript
// Use dedicated hooks for each concern
const migration = useMigration(migrationId, userId);       // Core status & events
const analytics = useMigrationAnalytics(migrationId, userId); // Detailed insights
const verification = useVerification(migrationId, userId);     // Ownership verification

// For enterprise customers
const bulkOps = useBulkMigration(orgId, userId);           // Bulk operations
const orgAnalytics = useOrganizationAnalytics(orgId, userId); // Organization insights
```

#### Error Handling Strategy
```typescript
// Comprehensive error handling with user-friendly messages
const handleMigrationError = (error, migrationId) => {
  switch (error.type) {
    case 'verification_failed':
      return 'Domain verification failed. Please check your DNS settings.';
    case 'budget_exceeded':
      return 'Migration exceeded AI time budget. Consider upgrading your plan.';
    case 'builder_incompatibility':
      return 'Site has compatibility issues. Our team will review manually.';
    default:
      return 'Migration failed. Click retry or contact support.';
  }
};
```

## Key UX Principles

1. **Start Simple**: URL + prompt = 30-second migration start
2. **Progressive Enhancement**: Advanced options are hidden by default
3. **AI Does the Work**: Users describe intent, AI figures out implementation
4. **Clear Feedback**: Show what's happening and why at each step
5. **Quick Success**: Get users to a working result as fast as possible

## Testing Strategy

### API Testing Checklist

**Core Migration Flow**:
```bash
# Test migration start
curl -X POST "/api/migration/start" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-123" \
  -d '{"userId":"user-123","sourceUrl":"https://example.com","userBrief":{"goals":"modernize"}}'

# Test SSE connection
curl -N -H "Accept: text/event-stream" \
  "/api/migration/migration-123/stream?userId=user-123"

# Test analytics
curl "/api/migration/migration-123/analytics?userId=user-123"

# Test retry with options
curl -X POST "/api/migration/migration-123/retry" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: retry-456" \
  -d '{"userId":"user-123","retryOptions":{"retryReason":"user_request"}}'
```

**Enterprise Features**:
```bash
# Test bulk migration
curl -X POST "/api/migration/bulk/start" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-123","orgId":"org-456","bulkRequest":{"name":"Test Bulk","urls":["https://site1.com","https://site2.com"]}}'

# Test organization analytics
curl "/api/migration/org/org-456/analytics?userId=user-123"

# Test organization config
curl -X PUT "/api/migration/org/org-456/config" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-123","config":{"customBudgets":{"softBudgetSeconds":3600}}}'
```

### Frontend Integration Testing

**SSE Connection Testing**:
```typescript
// Test SSE connection and fallback
const testSSEConnection = async (migrationId, userId) => {
  let sseWorking = false;
  let fallbackWorking = false;

  // Test SSE
  const eventSource = new EventSource(`/api/migration/${migrationId}/stream?userId=${userId}`);

  eventSource.onmessage = () => {
    sseWorking = true;
    console.log('✅ SSE working');
  };

  eventSource.onerror = async () => {
    console.log('❌ SSE failed, testing fallback');

    // Test polling fallback
    try {
      const response = await fetch(`/api/migration/${migrationId}/status?userId=${userId}`);
      if (response.ok) {
        fallbackWorking = true;
        console.log('✅ Polling fallback working');
      }
    } catch (error) {
      console.log('❌ Polling fallback failed:', error);
    }
  };

  // Cleanup after test
  setTimeout(() => {
    eventSource.close();
    console.log('Test results:', { sseWorking, fallbackWorking });
  }, 10000);
};
```

**Hook Testing Pattern**:
```typescript
// Test migration hook with mock data
import { renderHook, act } from '@testing-library/react';
import { useMigration } from './hooks/useMigration';

// Mock fetch and EventSource
global.fetch = jest.fn();
global.EventSource = jest.fn(() => ({
  onopen: null,
  onmessage: null,
  onerror: null,
  close: jest.fn()
}));

test('useMigration hook handles SSE and fallback', async () => {
  const { result } = renderHook(() => useMigration('migration-123', 'user-123'));

  // Test initial state
  expect(result.current.loading).toBe(true);
  expect(result.current.connected).toBe(false);

  // Simulate SSE connection
  act(() => {
    const mockEventSource = EventSource.mock.instances[0];
    mockEventSource.onopen();
  });

  expect(result.current.connected).toBe(true);
  expect(result.current.loading).toBe(false);
});
```

## Performance Optimization

### SSE Connection Management
```typescript
// Optimize SSE connections for performance
class MigrationSSEManager {
  private connections = new Map();
  private reconnectAttempts = new Map();

  connect(migrationId, userId) {
    // Reuse existing connection if available
    const existingConnection = this.connections.get(migrationId);
    if (existingConnection && existingConnection.readyState === EventSource.OPEN) {
      return existingConnection;
    }

    const eventSource = new EventSource(`/api/migration/${migrationId}/stream?userId=${userId}`);

    eventSource.onopen = () => {
      this.reconnectAttempts.delete(migrationId);
    };

    eventSource.onerror = () => {
      this.handleReconnect(migrationId, userId);
    };

    this.connections.set(migrationId, eventSource);
    return eventSource;
  }

  private handleReconnect(migrationId, userId) {
    const attempts = this.reconnectAttempts.get(migrationId) || 0;

    if (attempts < 3) {
      setTimeout(() => {
        this.reconnectAttempts.set(migrationId, attempts + 1);
        this.connect(migrationId, userId);
      }, Math.pow(2, attempts) * 1000); // Exponential backoff
    } else {
      console.log('Max reconnection attempts reached, falling back to polling');
      this.startPollingFallback(migrationId, userId);
    }
  }
}
```

### State Management Optimization
```typescript
// Use React.memo and useMemo for expensive operations
const MigrationAnalytics = React.memo(({ migrationId, userId }) => {
  const { analytics, billing } = useMigrationAnalytics(migrationId, userId);

  const chartData = useMemo(() => {
    if (!billing?.breakdown) return [];

    return billing.breakdown.map(phase => ({
      phase: phase.phase.replace('_', ' '),
      time: phase.aiTimeSeconds,
      cost: phase.cost,
      efficiency: phase.efficiency
    }));
  }, [billing?.breakdown]);

  return <AnalyticsChart data={chartData} />;
});
```

## Deployment Guide

### Environment Configuration
```typescript
// Environment-specific configuration
const migrationConfig = {
  development: {
    baseUrl: 'http://localhost:3000',
    enableSkipVerification: true,
    sseReconnectInterval: 2000,
    pollingInterval: 5000
  },
  staging: {
    baseUrl: 'https://staging.sheenapps.com',
    enableSkipVerification: false,
    sseReconnectInterval: 3000,
    pollingInterval: 10000
  },
  production: {
    baseUrl: 'https://sheenapps.com',
    enableSkipVerification: false,
    sseReconnectInterval: 5000,
    pollingInterval: 15000
  }
};
```

### Feature Flags Integration
```typescript
// Gradual rollout with feature flags
const useFeatureFlags = () => {
  return {
    enableRealTimeSSE: featureFlag('migration-sse-enabled', true),
    enableEnterpriseFeatures: featureFlag('migration-enterprise-enabled', false),
    enableAdvancedAnalytics: featureFlag('migration-analytics-v2', false),
    enableBulkOperations: featureFlag('migration-bulk-enabled', false)
  };
};

// Usage in components
const MigrationDashboard = ({ migrationId, userId, orgId }) => {
  const flags = useFeatureFlags();

  return (
    <div>
      {flags.enableRealTimeSSE ? (
        <EnhancedMigrationProgress migrationId={migrationId} userId={userId} />
      ) : (
        <BasicMigrationProgress migrationId={migrationId} userId={userId} />
      )}

      {flags.enableEnterpriseFeatures && orgId && (
        <BulkMigrationManager orgId={orgId} userId={userId} />
      )}
    </div>
  );
};
```

### Error Monitoring Setup
```typescript
// Comprehensive error tracking
const migrationErrorTracker = {
  trackSSEError: (migrationId, error) => {
    analytics.track('migration_sse_error', {
      migrationId,
      error: error.message,
      timestamp: Date.now(),
      userAgent: navigator.userAgent
    });
  },

  trackMigrationFailure: (migrationId, phase, error) => {
    analytics.track('migration_failed', {
      migrationId,
      phase,
      error: error.message,
      timestamp: Date.now()
    });
  },

  trackPerformanceMetrics: (migrationId, metrics) => {
    analytics.track('migration_performance', {
      migrationId,
      ...metrics,
      timestamp: Date.now()
    });
  }
};
```

## Next Steps

### Implementation Roadmap

**Week 1-2: Core Migration (Phase 1)**
1. Implement basic migration form with URL + prompt
2. Set up SSE connection with polling fallback
3. Create basic progress visualization
4. Add simple error handling and retry

**Week 3-4: Enhanced UX (Phase 2)**
1. Implement enhanced verification flow with provider detection
2. Add analytics dashboard for migration insights
3. Create advanced retry options with reason tracking
4. Build comprehensive error handling system

**Week 5-6: Enterprise Features (Phase 3)**
1. Add organization configuration management
2. Implement bulk migration operations
3. Create organization-level analytics dashboard
4. Add advanced monitoring and alerting

**Week 7-8: Production Polish (Phase 4)**
1. Implement migration history and search
2. Add result preview and comparison views
3. Create audit trail and detailed logging
4. Add export capabilities and reporting

### Testing and Quality Assurance

**Testing Priorities**:
1. **SSE Connection Reliability**: Test connection stability under various network conditions
2. **Performance**: Ensure smooth performance with multiple concurrent migrations
3. **Error Recovery**: Validate graceful degradation and error handling
4. **Enterprise Scale**: Test bulk operations with hundreds of URLs
5. **Cross-browser Compatibility**: Verify SSE support across all target browsers

**Quality Metrics**:
- SSE connection success rate >95%
- Migration start time <30 seconds
- Analytics load time <2 seconds
- Error recovery success rate >90%
- Mobile responsiveness score >90

This comprehensive frontend integration guide provides everything needed to implement the enhanced migration system with real-time updates, advanced analytics, and enterprise features.

## Support

For questions about integration or API behavior, check:
- Backend logs for detailed error messages
- `/api/migration/:id/tools` endpoint for AI operation audit trails
- Migration phases endpoint for detailed progress information