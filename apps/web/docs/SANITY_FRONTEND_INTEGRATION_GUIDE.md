# Sanity CMS Frontend Integration Guide

## Overview

This guide covers how to integrate with our Sanity CMS backend from your Next.js frontend application. The backend provides a comprehensive REST API for managing Sanity connections, content synchronization, real-time updates, and emergency access.

## Architecture Overview

```
Frontend (Next.js) → Backend Worker → Sanity CMS
                  ↗ Database (connections, content, cache)
                  ↗ Breakglass Recovery (emergency access)
```

**Key Features:**
- 🔐 **Secure Connection Management** with encrypted token storage
- 📊 **Real-time Content Sync** via webhooks
- 🚀 **GROQ Query Caching** for performance
- 🎨 **Preview System** with secure tokens
- 🆘 **Breakglass Recovery** for emergency access
- 🌍 **MENA-Optimized** with Arabic/RTL support

## API Base Configuration

```typescript
// types/sanity.ts
export interface SanityConnection {
  id: string;
  user_id: string;
  project_id?: string;
  sanity_project_id: string;
  dataset_name: string;
  project_title?: string;
  status: 'connected' | 'disconnected' | 'error' | 'revoked' | 'expired';
  api_version: string;
  use_cdn: boolean;
  perspective: 'published' | 'previewDrafts';
  realtime_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SanityDocument {
  id: string;
  connection_id: string;
  document_id: string;
  document_type: string;
  version_type: 'draft' | 'published';
  title?: string;
  slug?: string;
  language: string;
  published_at?: string;
  last_modified: string;
}

// API Configuration
const SANITY_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://your-worker.domain.com';
const SANITY_API_PREFIX = '/api/integrations/sanity';
```

## Authentication Setup

All API endpoints (except webhooks) require HMAC signature validation:

```typescript
// utils/hmacAuth.ts
import crypto from 'crypto';

export function generateHmacSignature(
  method: string,
  path: string,
  body: string,
  timestamp: string,
  apiKey: string
): string {
  const message = `${method}\n${path}\n${body}\n${timestamp}`;
  return crypto.createHmac('sha256', apiKey).update(message).digest('hex');
}

export function createAuthenticatedRequest(
  method: string,
  endpoint: string,
  body?: any
): RequestInit {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyString = body ? JSON.stringify(body) : '';
  const signature = generateHmacSignature(
    method,
    endpoint,
    bodyString,
    timestamp,
    process.env.NEXT_PUBLIC_HMAC_KEY!
  );

  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    },
    body: bodyString || undefined,
  };
}
```

## 1. Connection Management

### Create Sanity Connection

```typescript
// services/sanityApi.ts
export async function createSanityConnection(params: {
  sanity_project_id: string;
  dataset_name: string;
  project_title?: string;
  auth_token: string;
  robot_token?: string;
  api_version?: string;
  use_cdn?: boolean;
  perspective?: 'published' | 'previewDrafts';
  realtime_enabled?: boolean;
  i18n_strategy?: 'document' | 'field';
}): Promise<SanityConnection> {
  const response = await fetch(`${SANITY_API_BASE}${SANITY_API_PREFIX}/connect`, 
    createAuthenticatedRequest('POST', '/api/integrations/sanity/connect', params)
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create connection: ${error.error}`);
  }

  return response.json();
}
```

### Test Connection

```typescript
export async function testSanityConnection(params: {
  projectId: string;
  dataset: string;
  apiVersion?: string;
  token: string;
  useCdn?: boolean;
  perspective?: 'published' | 'previewDrafts';
}): Promise<{ success: boolean; message: string; projectInfo?: any; error?: string }> {
  const response = await fetch(`${SANITY_API_BASE}${SANITY_API_PREFIX}/test-connection`,
    createAuthenticatedRequest('POST', '/api/integrations/sanity/test-connection', params)
  );

  return response.json();
}
```

### List User Connections

```typescript
export async function listSanityConnections(projectId?: string): Promise<SanityConnection[]> {
  const url = new URL(`${SANITY_API_BASE}${SANITY_API_PREFIX}/connections`);
  if (projectId) {
    url.searchParams.set('project_id', projectId);
  }

  const response = await fetch(url.toString(),
    createAuthenticatedRequest('GET', `/api/integrations/sanity/connections${projectId ? `?project_id=${projectId}` : ''}`)
  );

  if (!response.ok) {
    throw new Error('Failed to fetch connections');
  }

  return response.json();
}
```

### Connection Health Check

```typescript
export async function checkConnectionHealth(connectionId: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const response = await fetch(
    `${SANITY_API_BASE}${SANITY_API_PREFIX}/connections/${connectionId}/health-check`,
    createAuthenticatedRequest('POST', `/api/integrations/sanity/connections/${connectionId}/health-check`)
  );

  return response.json();
}
```

## 2. Content Operations

### Sync Documents

```typescript
export async function syncSanityDocuments(
  connectionId: string, 
  options?: { force?: boolean }
): Promise<{
  success: boolean;
  documents_synced: number;
  documents_created: number;
  documents_updated: number;
  documents_deleted: number;
  sync_duration_ms: number;
  errors: string[];
}> {
  const url = new URL(`${SANITY_API_BASE}${SANITY_API_PREFIX}/connections/${connectionId}/sync`);
  if (options?.force) {
    url.searchParams.set('force', 'true');
  }

  const response = await fetch(url.toString(),
    createAuthenticatedRequest('POST', `/api/integrations/sanity/connections/${connectionId}/sync${options?.force ? '?force=true' : ''}`)
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Sync failed: ${error.error}`);
  }

  return response.json();
}
```

### Execute GROQ Queries

```typescript
export async function executeGroqQuery<T = any>(
  connectionId: string,
  query: string,
  params?: Record<string, any>,
  options?: {
    cache?: boolean;
    cache_ttl_seconds?: number;
  }
): Promise<{
  data: T;
  cached: boolean;
  query_time_ms: number;
  document_dependencies: string[];
}> {
  const body = {
    groq_query: query,
    params,
    ...options
  };

  const response = await fetch(
    `${SANITY_API_BASE}${SANITY_API_PREFIX}/connections/${connectionId}/query`,
    createAuthenticatedRequest('POST', `/api/integrations/sanity/connections/${connectionId}/query`, body)
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Query failed: ${error.error}`);
  }

  return response.json();
}
```

### Get Documents with Filtering

```typescript
export async function getSanityDocuments(
  connectionId: string,
  filters?: {
    document_type?: string;
    version_type?: 'draft' | 'published';
    language?: string;
    limit?: number;
    offset?: number;
  }
): Promise<SanityDocument[]> {
  const url = new URL(`${SANITY_API_BASE}${SANITY_API_PREFIX}/connections/${connectionId}/documents`);
  
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, value.toString());
      }
    });
  }

  const response = await fetch(url.toString(),
    createAuthenticatedRequest('GET', url.pathname + url.search)
  );

  if (!response.ok) {
    throw new Error('Failed to fetch documents');
  }

  return response.json();
}
```

## 3. Preview System

### Create Preview

```typescript
export async function createSanityPreview(
  connectionId: string,
  params: {
    document_id: string;
    document_type: string;
    groq_query?: string;
    preview_url?: string;
    ttl_hours?: number;
  }
): Promise<{
  preview_id: string;
  preview_secret: string;
  preview_url: string;
  expires_at: string;
}> {
  const response = await fetch(
    `${SANITY_API_BASE}${SANITY_API_PREFIX}/connections/${connectionId}/preview`,
    createAuthenticatedRequest('POST', `/api/integrations/sanity/connections/${connectionId}/preview`, params)
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create preview: ${error.error}`);
  }

  return response.json();
}
```

### Validate Preview

```typescript
export async function validatePreviewSecret(
  previewId: string,
  secret: string
): Promise<{ valid: boolean; preview?: any }> {
  const response = await fetch(
    `${SANITY_API_BASE}${SANITY_API_PREFIX}/preview/${previewId}/validate?secret=${encodeURIComponent(secret)}`,
    createAuthenticatedRequest('GET', `/api/integrations/sanity/preview/${previewId}/validate?secret=${encodeURIComponent(secret)}`)
  );

  return response.json();
}
```

### Get Preview Content

```typescript
export async function getPreviewContent<T = any>(
  previewId: string,
  secret: string
): Promise<T> {
  const response = await fetch(
    `${SANITY_API_BASE}${SANITY_API_PREFIX}/preview/${previewId}/content?secret=${encodeURIComponent(secret)}`,
    createAuthenticatedRequest('GET', `/api/integrations/sanity/preview/${previewId}/content?secret=${encodeURIComponent(secret)}`)
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to get preview content: ${error.error}`);
  }

  return response.json();
}
```

## 4. Webhook Integration

### Setting Up Webhooks in Sanity Studio

Add this to your `sanity.config.ts`:

```typescript
// sanity.config.ts
export default defineConfig({
  // ... other config
  webhooks: [
    {
      name: 'Frontend Sync',
      url: `${process.env.SANITY_WEBHOOK_URL}/api/integrations/sanity/webhook/{connectionId}`,
      includeBody: true,
      httpMethod: 'POST',
      apiVersion: '2023-05-03',
      // No authentication needed - uses Sanity signatures
    }
  ]
});
```

### Handling Webhook Events (Next.js API Route)

```typescript
// pages/api/sanity/webhook.ts or app/api/sanity/webhook/route.ts
export async function POST(request: Request) {
  try {
    const signature = request.headers.get('x-sanity-signature');
    const body = await request.text();

    // Forward to backend worker for processing
    const response = await fetch(
      `${process.env.BACKEND_URL}/api/integrations/sanity/webhook/${connectionId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sanity-Signature': signature,
        },
        body,
      }
    );

    if (!response.ok) {
      throw new Error('Webhook processing failed');
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Error', { status: 500 });
  }
}
```

### Real-time Updates (Client-side)

```typescript
// hooks/useSanityRealtime.ts
import { useEffect, useState } from 'react';

export function useSanityRealtime(connectionId: string) {
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    // Poll for webhook events or use WebSocket/SSE
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `${SANITY_API_BASE}${SANITY_API_PREFIX}/connections/${connectionId}/webhooks?limit=1`,
          createAuthenticatedRequest('GET', `/api/integrations/sanity/connections/${connectionId}/webhooks?limit=1`)
        );

        if (response.ok) {
          const data = await response.json();
          if (data.events.length > 0) {
            const latestEvent = new Date(data.events[0].created_at);
            if (!lastUpdate || latestEvent > lastUpdate) {
              setLastUpdate(latestEvent);
              // Trigger re-fetch of content
              // You might want to use React Query or SWR here
            }
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [connectionId, lastUpdate]);

  return { lastUpdate };
}
```

## 5. Admin Functions (Breakglass Access)

⚠️ **Admin-only functionality for emergency access**

```typescript
// services/adminApi.ts - Only for admin interfaces
export async function getBreakglassCredentials(
  connectionId: string,
  justification: string
): Promise<{
  sanity_project_id: string;
  dataset_name: string;
  auth_token: string;
  robot_token?: string;
  api_version: string;
  access_count: number;
  expires_at: string;
  max_remaining_uses: number;
  warning: string;
}> {
  const response = await fetch(
    `${SANITY_API_BASE}${SANITY_API_PREFIX}/admin/breakglass/${connectionId}/credentials`,
    createAuthenticatedRequest('GET', `/api/integrations/sanity/admin/breakglass/${connectionId}/credentials`, {
      justification
    })
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Breakglass access failed: ${error.error}`);
  }

  return response.json();
}

export async function listBreakglassEntries(options?: {
  user_id?: string;
  expired?: boolean;
  project_id?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: any[]; total: number }> {
  const url = new URL(`${SANITY_API_BASE}${SANITY_API_PREFIX}/admin/breakglass`);
  
  if (options) {
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, value.toString());
      }
    });
  }

  const response = await fetch(url.toString(),
    createAuthenticatedRequest('GET', url.pathname + url.search)
  );

  if (!response.ok) {
    throw new Error('Failed to fetch breakglass entries');
  }

  return response.json();
}
```

## 6. Error Handling

```typescript
// utils/errorHandling.ts
export class SanityApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'SanityApiError';
  }
}

export async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new SanityApiError(
      errorData.error || 'API request failed',
      errorData.code || 'UNKNOWN_ERROR',
      response.status,
      errorData
    );
  }

  return response.json();
}

// Common error codes to handle:
// - CONNECTION_NOT_FOUND: Connection doesn't exist or unauthorized
// - SANITY_API_ERROR: Error from Sanity API
// - INVALID_SIGNATURE: HMAC validation failed
// - RATE_LIMITED: Too many requests
// - TOKEN_EXPIRED: Sanity token has expired
// - CIRCUIT_BREAKER_OPEN: Connection has too many failures
```

## 7. React Hooks & Components

### Connection Management Hook

```typescript
// hooks/useSanityConnection.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useSanityConnection(connectionId?: string) {
  const queryClient = useQueryClient();

  const { data: connection, isLoading, error } = useQuery({
    queryKey: ['sanity-connection', connectionId],
    queryFn: () => connectionId ? getSanityConnection(connectionId) : null,
    enabled: !!connectionId,
  });

  const createConnectionMutation = useMutation({
    mutationFn: createSanityConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sanity-connections'] });
    },
  });

  const healthCheckMutation = useMutation({
    mutationFn: (id: string) => checkConnectionHealth(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sanity-connection', connectionId] });
    },
  });

  return {
    connection,
    isLoading,
    error,
    createConnection: createConnectionMutation.mutate,
    checkHealth: healthCheckMutation.mutate,
    isCreating: createConnectionMutation.isPending,
    isCheckingHealth: healthCheckMutation.isPending,
  };
}
```

### Content Query Hook

```typescript
// hooks/useSanityQuery.ts
export function useSanityQuery<T = any>(
  connectionId: string,
  query: string,
  params?: Record<string, any>,
  options?: {
    cache?: boolean;
    cache_ttl_seconds?: number;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: ['sanity-query', connectionId, query, params],
    queryFn: () => executeGroqQuery<T>(connectionId, query, params, options),
    enabled: !!connectionId && (options?.enabled !== false),
    staleTime: options?.cache_ttl_seconds ? options.cache_ttl_seconds * 1000 : 5 * 60 * 1000, // 5 minutes default
  });
}
```

### Document List Component

```typescript
// components/SanityDocumentList.tsx
interface SanityDocumentListProps {
  connectionId: string;
  documentType?: string;
  versionType?: 'draft' | 'published';
  language?: string;
}

export function SanityDocumentList({ 
  connectionId, 
  documentType, 
  versionType, 
  language 
}: SanityDocumentListProps) {
  const { data: documents, isLoading, error } = useQuery({
    queryKey: ['sanity-documents', connectionId, documentType, versionType, language],
    queryFn: () => getSanityDocuments(connectionId, {
      document_type: documentType,
      version_type: versionType,
      language,
      limit: 50,
    }),
    enabled: !!connectionId,
  });

  if (isLoading) return <div>Loading documents...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="space-y-4">
      {documents?.map(doc => (
        <div key={doc.id} className="border p-4 rounded">
          <h3 className="font-bold">{doc.title || doc.document_id}</h3>
          <p className="text-sm text-gray-600">
            Type: {doc.document_type} | Version: {doc.version_type} | Language: {doc.language}
          </p>
          <p className="text-xs text-gray-500">
            Modified: {new Date(doc.last_modified).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
```

## 8. Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_BASE_URL=https://your-backend-worker.domain.com
NEXT_PUBLIC_HMAC_KEY=your-hmac-signing-key
BACKEND_URL=https://your-backend-worker.domain.com
SANITY_WEBHOOK_URL=https://your-frontend.vercel.app
```

## 9. Best Practices

### Performance
- **Use caching** for GROQ queries when possible
- **Batch operations** instead of individual requests
- **Implement pagination** for large document lists
- **Use React Query/SWR** for automatic caching and revalidation

### Security  
- **Never expose HMAC keys** in client-side code
- **Validate webhook signatures** on your API routes
- **Implement rate limiting** on your endpoints
- **Use HTTPS** for all communications

### Error Handling
- **Implement retry logic** with exponential backoff
- **Handle circuit breaker states** gracefully
- **Show user-friendly error messages**
- **Log errors** for debugging

### Real-time Updates
- **Use webhook polling** or WebSocket connections
- **Implement optimistic updates** where appropriate
- **Handle connection failures** gracefully
- **Debounce frequent updates**

## 10. Common Patterns

### Connection Setup Flow

```typescript
// components/SanitySetup.tsx
export function SanityConnectionSetup() {
  const [step, setStep] = useState(1);
  const [connectionData, setConnectionData] = useState({
    sanity_project_id: '',
    dataset_name: 'production',
    auth_token: '',
  });

  const testMutation = useMutation({
    mutationFn: testSanityConnection,
    onSuccess: () => setStep(2),
  });

  const createMutation = useMutation({
    mutationFn: createSanityConnection,
    onSuccess: () => setStep(3),
  });

  return (
    <div className="max-w-md mx-auto space-y-6">
      {step === 1 && (
        <div>
          <h2>Test Sanity Connection</h2>
          {/* Form fields for connection data */}
          <button onClick={() => testMutation.mutate(connectionData)}>
            Test Connection
          </button>
        </div>
      )}
      
      {step === 2 && (
        <div>
          <h2>Create Connection</h2>
          <p>Connection test successful! Create the connection?</p>
          <button onClick={() => createMutation.mutate(connectionData)}>
            Create Connection
          </button>
        </div>
      )}
      
      {step === 3 && (
        <div>
          <h2>Success!</h2>
          <p>Your Sanity connection has been created successfully.</p>
        </div>
      )}
    </div>
  );
}
```

### Content Dashboard

```typescript
// pages/sanity/dashboard.tsx
export default function SanityDashboard() {
  const { data: connections } = useQuery({
    queryKey: ['sanity-connections'],
    queryFn: () => listSanityConnections(),
  });

  const [selectedConnection, setSelectedConnection] = useState<string>('');
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Sanity CMS Dashboard</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Connection Selector */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Connections</h2>
          {connections?.map(conn => (
            <button
              key={conn.id}
              onClick={() => setSelectedConnection(conn.id)}
              className={`block w-full p-3 mb-2 text-left rounded ${
                selectedConnection === conn.id ? 'bg-blue-100' : 'bg-gray-50'
              }`}
            >
              <div className="font-medium">{conn.project_title}</div>
              <div className="text-sm text-gray-600">{conn.sanity_project_id}</div>
              <div className={`text-xs ${
                conn.status === 'connected' ? 'text-green-600' : 'text-red-600'
              }`}>
                {conn.status}
              </div>
            </button>
          ))}
        </div>

        {/* Content Operations */}
        <div className="lg:col-span-2">
          {selectedConnection ? (
            <>
              <SanityConnectionHealth connectionId={selectedConnection} />
              <SanityDocumentList connectionId={selectedConnection} />
            </>
          ) : (
            <div className="text-gray-500 text-center py-8">
              Select a connection to view content
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

## Troubleshooting

### Common Issues

1. **HMAC Signature Errors**
   - Ensure timestamp is within 300 seconds
   - Check that the signing process matches exactly
   - Verify the API key is correct

2. **Connection Failures**
   - Check that Sanity tokens have proper permissions
   - Verify project ID and dataset name
   - Test with Sanity's management API directly

3. **Webhook Not Working**
   - Verify webhook URL is accessible
   - Check Sanity webhook configuration
   - Ensure signature validation is working

4. **Cache Issues**
   - Clear query cache when needed
   - Check TTL settings
   - Verify cache invalidation logic

### Debug Mode

```typescript
// Enable debug logging
const DEBUG = process.env.NODE_ENV === 'development';

export async function debugLog(operation: string, data: any) {
  if (DEBUG) {
    console.log(`[Sanity API] ${operation}:`, data);
  }
}
```

---

## Support

For backend API issues, check the worker logs. For integration questions, refer to the source code in `/src/routes/sanity.ts` and `/src/services/sanity*.ts`.

**Key Backend Files:**
- `src/routes/sanity.ts` - Main API endpoints
- `src/services/sanityService.ts` - Connection management
- `src/services/sanityWebhookService.ts` - Webhook processing
- `src/services/sanityContentService.ts` - Content operations
- `src/services/sanityPreviewService.ts` - Preview system
- `src/services/sanityBreakglassService.ts` - Emergency access

Remember: The backend handles all the heavy lifting (encryption, caching, webhooks) - your frontend just needs to make authenticated API calls!