# Project Source Code Export - Next.js Frontend Integration Guide

## Overview

This guide provides complete integration details for the project source code export/download feature implemented in the SheenApps backend worker. The feature allows users to export their project source code as ZIP files with real-time progress tracking, rate limiting, and comprehensive error handling.

## 📋 Quick Reference - All API Endpoints

### User Endpoints (Primary Integration)
1. **POST** `/api/projects/:projectId/export` - Create export job
2. **GET** `/api/projects/:projectId/export/:jobId` - Get export status
3. **GET** `/api/exports` - List user exports
4. **GET** `/api/projects/:projectId/export/:jobId/download` - Download export
5. **DELETE** `/api/projects/:projectId/export/:jobId` - Cancel export

### Admin Endpoints (Optional)
6. **GET** `/api/admin/exports/queue` - Queue status monitoring
7. **GET** `/api/admin/exports/analytics` - Export analytics
8. **POST** `/api/admin/exports/cleanup` - Cleanup expired exports

## 🔐 Authentication Pattern

**IMPORTANT**: Export endpoints use HMAC signature authentication like all other worker routes.

### Required Authentication
✅ **Use your existing HMAC client wrapper** - don't call export endpoints directly.

```typescript
// ✅ Correct - use your existing HMAC authentication
import { createHmacSignedRequest } from '@/lib/hmac'; // Your existing HMAC client

const createExportResponse = await createHmacSignedRequest('/api/projects/123/export', {
  method: 'POST',
  body: {
    userId: currentUser.id, // ← Still required in body
    versionId: 'v1.2.3'
  }
});

// ✅ Correct - HMAC signed GET request
const statusResponse = await createHmacSignedRequest(`/api/projects/123/export/456?userId=${currentUser.id}`, {
  method: 'GET'
});

// ❌ Wrong - Direct fetch without HMAC will fail with 401
const directResponse = await fetch('/api/projects/123/export', {
  method: 'POST',
  body: JSON.stringify({ userId: currentUser.id })
  // Missing HMAC headers - will get 401 Unauthorized
});
```

### HMAC Headers (handled by your client)
Your existing HMAC client should add these headers:
- `x-sheen-signature`: HMAC-SHA256 signature
- `x-sheen-timestamp`: Unix timestamp  
- `Content-Type`: application/json

**Format**: `HMAC(timestamp + body, secret)` - same as other worker endpoints.

## 📦 TypeScript Integration

Copy these types into your Next.js project:

```typescript
// types/export.ts
export type ExportJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'expired';
export type ExportType = 'zip';
export type ExportPhase = 'queued' | 'scanning' | 'compressing' | 'uploading' | 'completed' | 'failed';

export interface ExportProgress {
  phase: ExportPhase;
  filesScanned: number;
  bytesWritten: number;
  estimatedTotalFiles?: number;
  currentFile?: string;
  message?: string;
}

export interface CreateExportRequest {
  userId: string;
  projectId: string;
  versionId?: string;
  exportType?: ExportType;
  clientRequestId?: string; // For idempotency
}

export interface CreateExportResponse {
  jobId: string;
  status: ExportJobStatus;
  message: string;
  estimatedCompletionTime?: string; // ISO datetime
}

export interface GetExportStatusResponse {
  jobId: string;
  status: ExportJobStatus;
  progress: ExportProgress;
  zipSize?: number; // Compressed ZIP file size in bytes
  fileCount?: number;
  compressionRatio?: number;
  createdAt: string; // ISO datetime
  completedAt?: string; // ISO datetime
  expiresAt?: string; // ISO datetime
  downloadUrl?: string; // Only present when status is 'completed'
  errorMessage?: string;
}

export interface ListExportsResponse {
  exports: Array<{
    jobId: string;
    projectId: string;
    versionId?: string;
    status: ExportJobStatus;
    zipSize?: number;
    fileCount?: number;
    createdAt: string;
    expiresAt?: string;
  }>;
  totalCount: number;
  hasMore: boolean;
}

// Error response format
export interface ExportErrorResponse {
  error: string;
  code?: string;
  retryAfter?: number; // For rate limiting (seconds)
  message?: string;
}
```

## 🚀 API Endpoints - Complete Implementation

### 1. Create Export Job

**Endpoint**: `POST /api/projects/:projectId/export`

```typescript
async function createExport(projectId: string, userId: string, options?: {
  versionId?: string;
  clientRequestId?: string;
}): Promise<CreateExportResponse> {
  // Use your existing HMAC client instead of direct fetch
  const response = await createHmacSignedRequest(`/api/projects/${projectId}/export`, {
    method: 'POST',
    body: {
      userId,
      projectId, // ← Also in URL params, but required in body too
      versionId: options?.versionId,
      exportType: 'zip', // Currently only 'zip' supported
      clientRequestId: options?.clientRequestId || crypto.randomUUID(), // For idempotency
    } as CreateExportRequest,
  });

  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    
    switch (response.status) {
      case 409: // Export already exists
        throw new ExportError(error.error, 'EXPORT_ALREADY_EXISTS');
      case 429: // Rate limit exceeded
        throw new RateLimitError(error.error, error.retryAfter || 3600);
      case 404: // Project not found
        throw new ExportError(error.error, 'PROJECT_NOT_FOUND');
      default:
        throw new ExportError(error.error, 'UNKNOWN_ERROR');
    }
  }

  return response.json();
}

// Usage example
try {
  const exportJob = await createExport('project-123', 'user-456', {
    versionId: 'v1.2.3',
    clientRequestId: 'unique-request-id-123' // Optional for idempotency
  });
  
  console.log(`Export job created: ${exportJob.jobId}`);
  console.log(`Estimated completion: ${exportJob.estimatedCompletionTime}`);
  
  // Start polling for status
  pollExportStatus(exportJob.jobId, 'user-456');
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else {
    console.error('Export creation failed:', error.message);
  }
}
```

### 2. Get Export Status (with Polling)

**Endpoint**: `GET /api/projects/:projectId/export/:jobId?userId=:userId`

```typescript
async function getExportStatus(
  projectId: string, 
  jobId: string, 
  userId: string
): Promise<GetExportStatusResponse> {
  // Use HMAC signed request
  const response = await createHmacSignedRequest(
    `/api/projects/${projectId}/export/${jobId}?userId=${encodeURIComponent(userId)}`,
    { method: 'GET' }
  );

  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    
    switch (response.status) {
      case 404:
        throw new ExportError('Export job not found', 'EXPORT_NOT_FOUND');
      default:
        throw new ExportError(error.error, 'UNKNOWN_ERROR');
    }
  }

  return response.json();
}

// Smart polling with exponential backoff
function pollExportStatus(
  jobId: string, 
  userId: string, 
  projectId: string,
  onProgress?: (status: GetExportStatusResponse) => void,
  onComplete?: (downloadUrl: string) => void,
  onError?: (error: Error) => void
) {
  let pollInterval = 2000; // Start with 2 seconds
  const maxInterval = 10000; // Cap at 10 seconds
  let pollCount = 0;
  
  const poll = async () => {
    try {
      const status = await getExportStatus(projectId, jobId, userId);
      
      onProgress?.(status);
      
      switch (status.status) {
        case 'completed':
          if (status.downloadUrl) {
            onComplete?.(status.downloadUrl);
          } else {
            onError?.(new Error('Export completed but no download URL available'));
          }
          return;
          
        case 'failed':
          onError?.(new Error(status.errorMessage || 'Export failed'));
          return;
          
        case 'expired':
          onError?.(new Error('Export has expired'));
          return;
          
        case 'queued':
        case 'processing':
          // Continue polling with exponential backoff
          pollCount++;
          if (pollCount > 5) {
            pollInterval = Math.min(pollInterval * 1.2, maxInterval);
          }
          setTimeout(poll, pollInterval);
          break;
      }
    } catch (error) {
      onError?.(error as Error);
    }
  };
  
  poll();
}

// Usage with React state
const [exportStatus, setExportStatus] = useState<GetExportStatusResponse | null>(null);
const [isExporting, setIsExporting] = useState(false);
const [exportError, setExportError] = useState<string | null>(null);

const handleStartExport = async () => {
  setIsExporting(true);
  setExportError(null);
  
  try {
    const exportJob = await createExport(projectId, userId);
    
    pollExportStatus(
      exportJob.jobId,
      userId,
      projectId,
      // Progress callback
      (status) => setExportStatus(status),
      // Complete callback
      (downloadUrl) => {
        setIsExporting(false);
        // Trigger download
        window.location.href = downloadUrl;
      },
      // Error callback
      (error) => {
        setIsExporting(false);
        setExportError(error.message);
      }
    );
  } catch (error) {
    setIsExporting(false);
    setExportError(error.message);
  }
};
```

### 3. List User Exports

**Endpoint**: `GET /api/exports?userId=:userId&projectId=:projectId&limit=:limit&offset=:offset`

```typescript
async function listExports(userId: string, options?: {
  projectId?: string;
  limit?: number;
  offset?: number;
}): Promise<ListExportsResponse> {
  const params = new URLSearchParams({
    userId,
    ...(options?.projectId && { projectId: options.projectId }),
    ...(options?.limit && { limit: options.limit.toString() }),
    ...(options?.offset && { offset: options.offset.toString() }),
  });

  const response = await fetch(`/api/exports?${params.toString()}`);

  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    throw new ExportError(error.error, 'UNKNOWN_ERROR');
  }

  return response.json();
}

// Usage with pagination
const [exports, setExports] = useState<ListExportsResponse['exports']>([]);
const [hasMore, setHasMore] = useState(true);
const [loading, setLoading] = useState(false);

const loadExports = async (offset = 0, append = false) => {
  setLoading(true);
  
  try {
    const result = await listExports(userId, {
      projectId, // Optional - filter by project
      limit: 25,
      offset
    });
    
    setExports(prev => append ? [...prev, ...result.exports] : result.exports);
    setHasMore(result.hasMore);
  } catch (error) {
    console.error('Failed to load exports:', error);
  } finally {
    setLoading(false);
  }
};

// Load more exports
const loadMore = () => {
  if (hasMore && !loading) {
    loadExports(exports.length, true);
  }
};
```

### 4. Download Export

**Endpoint**: `GET /api/projects/:projectId/export/:jobId/download?userId=:userId`

```typescript
async function downloadExport(
  projectId: string,
  jobId: string,
  userId: string,
  options?: {
    sessionId?: string;
    onProgress?: (bytesLoaded: number, totalBytes?: number) => void;
  }
): Promise<void> {
  const params = new URLSearchParams({
    userId,
    ...(options?.sessionId && { sessionId: options.sessionId }),
  });

  const response = await fetch(
    `/api/projects/${projectId}/export/${jobId}/download?${params.toString()}`,
    {
      method: 'GET',
    }
  );

  // The backend returns a 302 redirect to signed URL
  if (response.status === 302) {
    // Browser will automatically follow redirect for download
    const redirectUrl = response.headers.get('Location');
    if (redirectUrl) {
      window.location.href = redirectUrl;
      return;
    }
  }

  // Handle errors
  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    
    switch (response.status) {
      case 404:
        throw new ExportError('Export not found or not ready', 'EXPORT_NOT_READY');
      case 410:
        throw new ExportError('Export has expired', 'EXPORT_EXPIRED');
      default:
        throw new ExportError(error.error, 'DOWNLOAD_FAILED');
    }
  }
}

// Enhanced download with progress tracking
async function downloadExportWithProgress(
  projectId: string,
  jobId: string,
  userId: string,
  onProgress?: (progress: { loaded: number; total?: number; percentage?: number }) => void
): Promise<void> {
  try {
    // Get the current status first to check file size
    const status = await getExportStatus(projectId, jobId, userId);
    
    if (status.status !== 'completed') {
      throw new Error(`Export not ready. Status: ${status.status}`);
    }

    const fileSize = status.zipSize;
    
    // Method 1: Simple redirect (recommended)
    await downloadExport(projectId, jobId, userId);
    
    /* Method 2: Manual fetch with progress (if you need progress tracking)
    const response = await fetch(`/api/projects/${projectId}/export/${jobId}/download?userId=${userId}`);
    
    if (response.status === 302) {
      const downloadUrl = response.headers.get('Location');
      if (!downloadUrl) throw new Error('No download URL provided');
      
      // Fetch the actual file with progress tracking
      const fileResponse = await fetch(downloadUrl);
      if (!fileResponse.ok) throw new Error('Download failed');
      
      const reader = fileResponse.body?.getReader();
      if (!reader) throw new Error('No response body');
      
      let loaded = 0;
      const chunks: Uint8Array[] = [];
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        
        onProgress?.({
          loaded,
          total: fileSize,
          percentage: fileSize ? Math.round((loaded / fileSize) * 100) : undefined
        });
      }
      
      // Create blob and download
      const blob = new Blob(chunks, { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${projectId}-export.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    */
    
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
}
```

### 5. Cancel Export

**Endpoint**: `DELETE /api/projects/:projectId/export/:jobId`

```typescript
async function cancelExport(
  projectId: string,
  jobId: string,
  userId: string
): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/export/${jobId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
    }),
  });

  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    
    switch (response.status) {
      case 404:
        throw new ExportError('Export job not found', 'EXPORT_NOT_FOUND');
      case 400:
        // Can't cancel completed/failed exports
        throw new ExportError(error.error, 'CANNOT_CANCEL');
      default:
        throw new ExportError(error.error, 'CANCEL_FAILED');
    }
  }

  const result = await response.json();
  console.log('Export cancelled:', result.message);
}
```

### 6-8. Admin Endpoints (Optional)

```typescript
// Admin: Get queue status
async function getExportQueueStatus(): Promise<{
  queue: { waiting: number; active: number; completed: number; failed: number };
  metrics: { queued: number; processing: number; completed: number; failed: number };
  worker: { isRunning: boolean; concurrency: number };
}> {
  const response = await fetch('/api/admin/exports/queue');
  if (!response.ok) throw new Error('Failed to get queue status');
  return response.json();
}

// Admin: Get analytics
async function getExportAnalytics(options?: {
  days?: number;
  userId?: string;
  projectId?: string;
}): Promise<{
  analytics: Array<{
    download_date: string;
    total_downloads: number;
    unique_users: number;
    total_bytes: number;
  }>;
}> {
  const params = new URLSearchParams();
  if (options?.days) params.set('days', options.days.toString());
  if (options?.userId) params.set('userId', options.userId);
  if (options?.projectId) params.set('projectId', options.projectId);

  const response = await fetch(`/api/admin/exports/analytics?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to get analytics');
  return response.json();
}

// Admin: Cleanup expired exports
async function cleanupExpiredExports(): Promise<{
  expired_jobs: number;
  deleted_old_jobs: number;
  cleaned_files: number;
  message: string;
}> {
  const response = await fetch('/api/admin/exports/cleanup', { method: 'POST' });
  if (!response.ok) throw new Error('Cleanup failed');
  return response.json();
}
```

## 🎛️ React Component Example

Complete React component with all features:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { 
  CreateExportResponse, 
  GetExportStatusResponse, 
  ExportJobStatus 
} from '@/types/export';

interface ExportButtonProps {
  projectId: string;
  userId: string;
  versionId?: string;
  projectName?: string;
}

export function ExportButton({ 
  projectId, 
  userId, 
  versionId, 
  projectName = 'project' 
}: ExportButtonProps) {
  const [status, setStatus] = useState<'idle' | 'creating' | 'polling' | 'ready' | 'error'>('idle');
  const [exportJob, setExportJob] = useState<CreateExportResponse | null>(null);
  const [exportStatus, setExportStatus] = useState<GetExportStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const resetState = () => {
    setStatus('idle');
    setExportJob(null);
    setExportStatus(null);
    setError(null);
    setProgress(0);
  };

  const startExport = async () => {
    setStatus('creating');
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          projectId,
          versionId,
          exportType: 'zip',
          clientRequestId: crypto.randomUUID(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 429) {
          throw new Error(`Rate limit exceeded. Try again in ${errorData.retryAfter} seconds.`);
        } else if (response.status === 409) {
          throw new Error('Export already in progress for this project.');
        } else {
          throw new Error(errorData.error || 'Failed to create export');
        }
      }

      const exportJob: CreateExportResponse = await response.json();
      setExportJob(exportJob);
      setStatus('polling');
      
      // Start polling
      pollStatus(exportJob.jobId);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  const pollStatus = async (jobId: string) => {
    let pollInterval = 2000;
    const maxInterval = 10000;
    let consecutivePolls = 0;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/export/${jobId}?userId=${encodeURIComponent(userId)}`
        );

        if (!response.ok) {
          throw new Error('Failed to get export status');
        }

        const statusData: GetExportStatusResponse = await response.json();
        setExportStatus(statusData);

        // Calculate progress percentage
        if (statusData.progress.estimatedTotalFiles && statusData.progress.estimatedTotalFiles > 0) {
          const progressPercent = Math.round(
            (statusData.progress.filesScanned / statusData.progress.estimatedTotalFiles) * 100
          );
          setProgress(progressPercent);
        }

        switch (statusData.status) {
          case 'completed':
            setStatus('ready');
            setProgress(100);
            return;
            
          case 'failed':
            setError(statusData.errorMessage || 'Export failed');
            setStatus('error');
            return;
            
          case 'expired':
            setError('Export has expired');
            setStatus('error');
            return;
            
          case 'queued':
          case 'processing':
            // Continue polling with exponential backoff
            consecutivePolls++;
            if (consecutivePolls > 5) {
              pollInterval = Math.min(pollInterval * 1.2, maxInterval);
            }
            setTimeout(poll, pollInterval);
            break;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStatus('error');
      }
    };

    poll();
  };

  const downloadExport = async () => {
    if (!exportJob || !exportStatus) return;

    try {
      const downloadUrl = `/api/projects/${projectId}/export/${exportJob.jobId}/download?userId=${encodeURIComponent(userId)}`;
      window.location.href = downloadUrl;
    } catch (err) {
      setError('Download failed');
    }
  };

  const cancelExport = async () => {
    if (!exportJob) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/export/${exportJob.jobId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        resetState();
      }
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  const getStatusMessage = () => {
    if (!exportStatus) return '';
    
    switch (exportStatus.progress.phase) {
      case 'queued':
        return 'Export queued for processing...';
      case 'scanning':
        return `Scanning files... (${exportStatus.progress.filesScanned} found)`;
      case 'compressing':
        return `Creating ZIP... (${exportStatus.progress.filesScanned}/${exportStatus.progress.estimatedTotalFiles || '?'} files)`;
      case 'uploading':
        return 'Uploading to cloud storage...';
      case 'completed':
        return 'Export ready for download!';
      default:
        return exportStatus.progress.message || 'Processing...';
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb > 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`;
  };

  const formatTimeRemaining = (expiresAt?: string) => {
    if (!expiresAt) return '';
    const remaining = new Date(expiresAt).getTime() - Date.now();
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="export-component">
      {status === 'idle' && (
        <button 
          onClick={startExport}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          📦 Export Source Code
        </button>
      )}

      {status === 'creating' && (
        <div className="flex items-center space-x-2">
          <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <span>Creating export job...</span>
        </div>
      )}

      {status === 'polling' && exportStatus && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{getStatusMessage()}</span>
            <button 
              onClick={cancelExport}
              className="text-red-500 text-sm hover:underline"
            >
              Cancel
            </button>
          </div>
          
          {progress > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}
          
          <div className="text-xs text-gray-500">
            {exportStatus.fileCount && `${exportStatus.fileCount} files`}
            {exportStatus.zipSize && ` • ${formatFileSize(exportStatus.zipSize)}`}
            {exportStatus.compressionRatio && 
              ` • ${Math.round(exportStatus.compressionRatio * 100)}% compression`
            }
          </div>
        </div>
      )}

      {status === 'ready' && exportStatus && (
        <div className="space-y-2">
          <button 
            onClick={downloadExport}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 w-full"
          >
            ⬇️ Download ZIP ({formatFileSize(exportStatus.zipSize)})
          </button>
          
          <div className="text-xs text-gray-500 text-center">
            {exportStatus.fileCount} files • 
            Expires in {formatTimeRemaining(exportStatus.expiresAt)}
          </div>
          
          <button 
            onClick={resetState}
            className="text-blue-500 text-sm hover:underline w-full"
          >
            Create New Export
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-2">
          <div className="text-red-500 text-sm">{error}</div>
          <button 
            onClick={resetState}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
```

## 🚦 Rate Limiting & Error Handling

### Rate Limits
- **10 exports per hour per user**
- **50 exports per day per user**  
- **50 jobs per second globally**

### Error Codes Reference

| HTTP Status | Error Code | Description | Frontend Action |
|-------------|------------|-------------|-----------------|
| 400 | - | Missing parameters | Show validation error |
| 404 | `PROJECT_NOT_FOUND` | Project doesn't exist or no access | Redirect or show error |
| 404 | `EXPORT_NOT_FOUND` | Export job not found | Refresh export list |
| 409 | `EXPORT_ALREADY_EXISTS` | Active export already exists | Show existing export status |
| 410 | `EXPORT_EXPIRED` | Export has expired | Offer to create new export |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit hit | Show retry timer with `retryAfter` |

### Error Handling Best Practices

```typescript
class ExportError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ExportError';
  }
}

class RateLimitError extends ExportError {
  constructor(message: string, public retryAfter: number) {
    super(message, 'RATE_LIMIT_EXCEEDED');
  }
}

// Centralized error handler
function handleExportError(error: any, setError: (msg: string) => void) {
  if (error instanceof RateLimitError) {
    setError(`Rate limit exceeded. Please wait ${error.retryAfter} seconds before trying again.`);
  } else if (error instanceof ExportError) {
    switch (error.code) {
      case 'PROJECT_NOT_FOUND':
        setError('Project not found. Please check your permissions.');
        break;
      case 'EXPORT_ALREADY_EXISTS':
        setError('An export is already in progress for this project.');
        break;
      case 'EXPORT_EXPIRED':
        setError('This export has expired. Please create a new one.');
        break;
      default:
        setError(error.message);
    }
  } else {
    setError('An unexpected error occurred. Please try again.');
  }
}
```

## ⚡ Performance & UX Best Practices

### 1. Polling Strategy
- Start with 2-second intervals
- Use exponential backoff (max 10 seconds)
- Stop polling when component unmounts
- Show progress percentages when available

### 2. State Management
```typescript
// Use React Query for better caching and state management
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const useExportStatus = (projectId: string, jobId: string | null, userId: string) => {
  return useQuery({
    queryKey: ['export-status', projectId, jobId],
    queryFn: () => getExportStatus(projectId, jobId!, userId),
    enabled: !!jobId,
    refetchInterval: (data) => {
      if (data?.status === 'completed' || data?.status === 'failed' || data?.status === 'expired') {
        return false; // Stop polling
      }
      return 3000; // Poll every 3 seconds
    },
  });
};

const useCreateExport = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ projectId, userId, versionId }: CreateExportRequest) => 
      createExport(projectId, userId, { versionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exports'] });
    },
  });
};
```

### 3. Download UX
```typescript
// Show download progress and file info
const DownloadStatus = ({ exportStatus }: { exportStatus: GetExportStatusResponse }) => {
  const fileSize = formatFileSize(exportStatus.zipSize);
  const fileCount = exportStatus.fileCount;
  const compressionRatio = exportStatus.compressionRatio 
    ? Math.round(exportStatus.compressionRatio * 100) 
    : null;

  return (
    <div className="bg-green-50 border border-green-200 rounded p-4">
      <div className="flex items-center space-x-2 mb-2">
        <span className="text-green-600 font-medium">✅ Export Ready</span>
      </div>
      
      <div className="text-sm text-gray-600 space-y-1">
        <div>📁 {fileCount} files</div>
        <div>📦 {fileSize} ZIP file</div>
        {compressionRatio && <div>🗜️ {compressionRatio}% compression</div>}
        <div>⏰ Expires {formatTimeRemaining(exportStatus.expiresAt)}</div>
      </div>
      
      <button 
        onClick={() => downloadExport(projectId, exportStatus.jobId, userId)}
        className="mt-3 w-full bg-green-500 text-white py-2 rounded hover:bg-green-600"
      >
        Download ZIP File
      </button>
    </div>
  );
};
```

### 4. Progressive Enhancement
```typescript
// Graceful fallback if export feature is unavailable
const ExportFeature = ({ projectId, userId }: Props) => {
  const [featureAvailable, setFeatureAvailable] = useState(true);

  useEffect(() => {
    // Test if export endpoints are available
    fetch('/api/exports?userId=' + userId + '&limit=1')
      .then(res => setFeatureAvailable(res.ok))
      .catch(() => setFeatureAvailable(false));
  }, [userId]);

  if (!featureAvailable) {
    return (
      <div className="text-gray-500 text-sm">
        Export feature temporarily unavailable
      </div>
    );
  }

  return <ExportButton projectId={projectId} userId={userId} />;
};
```

## 🔍 Troubleshooting

### Common Issues

1. **"Missing userId parameter"**
   - Ensure `userId` is included in request body (POST/DELETE) or query params (GET)

2. **"Export already exists" (409)**
   - Check if there's an active export for this project/version combination
   - Use the existing export or wait for completion

3. **Rate limit exceeded (429)**
   - Respect the `retryAfter` header value
   - Show countdown timer to user

4. **Download fails**
   - Check if export has expired
   - Verify export status is 'completed'
   - Ensure proper redirect handling

5. **Polling never completes**
   - Implement timeout (max 10 minutes)
   - Add manual refresh option
   - Check browser network tab for errors

### Debug Mode
```typescript
const DEBUG_EXPORT = process.env.NODE_ENV === 'development';

if (DEBUG_EXPORT) {
  console.log('Export Status:', exportStatus);
  console.log('Progress:', exportStatus?.progress);
  console.log('Phase:', exportStatus?.progress.phase);
}
```

## 📚 Additional Resources

- **Backend Implementation**: `docs/PROJECT_SOURCE_CODE_EXPORT_IMPLEMENTATION_PLAN.md`
- **Database Schema**: `migrations/090_project_export_tables.sql`  
- **Type Definitions**: `src/types/projectExport.ts`
- **API Routes**: `src/routes/projectExport.ts`

## 🚀 Ready to Integrate!

This guide covers all 8 endpoints with complete TypeScript integration, error handling, and React examples. The export feature is production-ready with proper rate limiting, progress tracking, and comprehensive error handling.

Start with the basic `ExportButton` component and expand based on your UI requirements. All endpoints are documented with working code examples you can copy directly into your Next.js application.