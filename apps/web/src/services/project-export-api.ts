/**
 * Project Export API Client Service
 * Handles communication with the backend worker export API using HMAC authentication
 * Based on backend worker API integration guide
 */

'use client';

import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import type {
  CreateExportRequest,
  CreateExportResponse,
  GetExportStatusResponse,
  ListExportsResponse,
  ExportErrorResponse,
  ExportQueueStatus,
  ExportAnalytics,
  ExportCleanupResult,
} from '@/types/export';

// Import error classes as regular imports (not type imports)
import { ExportError, RateLimitError } from '@/types/export';

/**
 * Base URL for worker API endpoints
 */
function getWorkerBaseUrl(): string {
  const baseUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL;
  if (!baseUrl) {
    throw new Error('WORKER_BASE_URL or NEXT_PUBLIC_WORKER_BASE_URL environment variable not configured');
  }
  return baseUrl;
}

/**
 * Make authenticated request to worker API using HMAC signatures
 */
async function makeWorkerRequest(
  endpoint: string,
  options: {
    method: string;
    body?: any;
    headers?: Record<string, string>;
  }
): Promise<Response> {
  const baseUrl = getWorkerBaseUrl();
  const fullUrl = `${baseUrl}${endpoint}`;
  const bodyString = options.body ? JSON.stringify(options.body) : '';

  // Generate HMAC authentication headers
  const authHeaders = createWorkerAuthHeaders(
    options.method,
    endpoint, // Path without base URL for signature
    bodyString,
    options.headers
  );

  const response = await fetch(fullUrl, {
    method: options.method,
    body: bodyString || undefined,
    headers: authHeaders,
  });

  return response;
}

/**
 * Handle API errors and convert to typed error objects
 */
function handleApiError(status: number, error: ExportErrorResponse): never {
  switch (status) {
    case 409: // Export already exists
      throw new ExportError(error.error, 'EXPORT_ALREADY_EXISTS');
    case 429: // Rate limit exceeded
      throw new RateLimitError(error.error, error.retryAfter || 3600);
    case 404: // Project/export not found
      throw new ExportError(error.error, 'NOT_FOUND');
    case 410: // Export expired
      throw new ExportError(error.error, 'EXPORT_EXPIRED');
    case 400: // Bad request
      throw new ExportError(error.error, 'BAD_REQUEST');
    default:
      throw new ExportError(error.error || 'Unknown error', 'UNKNOWN_ERROR');
  }
}

/**
 * Create a new export job
 */
export async function createExport(
  projectId: string, 
  userId: string, 
  options?: {
    versionId?: string;
    clientRequestId?: string;
  }
): Promise<CreateExportResponse> {
  const response = await makeWorkerRequest(`/api/projects/${projectId}/export`, {
    method: 'POST',
    body: {
      userId,
      projectId,
      versionId: options?.versionId,
      exportType: 'zip' as const,
      clientRequestId: options?.clientRequestId || crypto.randomUUID(),
    } as CreateExportRequest,
  });

  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    handleApiError(response.status, error);
  }

  return response.json();
}

/**
 * Get export status with progress information
 */
export async function getExportStatus(
  projectId: string,
  jobId: string,
  userId: string
): Promise<GetExportStatusResponse> {
  const endpoint = `/api/projects/${projectId}/export/${jobId}?userId=${encodeURIComponent(userId)}`;
  
  const response = await makeWorkerRequest(endpoint, {
    method: 'GET',
  });

  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    handleApiError(response.status, error);
  }

  return response.json();
}

/**
 * List user's exports with pagination
 */
export async function listExports(
  userId: string, 
  options?: {
    projectId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<ListExportsResponse> {
  const params = new URLSearchParams({
    userId,
    ...(options?.projectId && { projectId: options.projectId }),
    ...(options?.limit && { limit: options.limit.toString() }),
    ...(options?.offset && { offset: options.offset.toString() }),
  });

  const endpoint = `/api/exports?${params.toString()}`;
  
  const response = await makeWorkerRequest(endpoint, {
    method: 'GET',
  });

  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    handleApiError(response.status, error);
  }

  return response.json();
}

/**
 * Download export file (returns download URL or triggers browser download)
 */
export async function downloadExport(
  projectId: string,
  jobId: string,
  userId: string,
  options?: {
    sessionId?: string;
  }
): Promise<void> {
  const params = new URLSearchParams({
    userId,
    ...(options?.sessionId && { sessionId: options.sessionId }),
  });

  const endpoint = `/api/projects/${projectId}/export/${jobId}/download?${params.toString()}`;
  
  const response = await makeWorkerRequest(endpoint, {
    method: 'GET',
  });

  // Handle redirect to download URL
  if (response.status === 302) {
    const redirectUrl = response.headers.get('Location');
    if (redirectUrl) {
      window.location.href = redirectUrl;
      return;
    }
  }

  // Handle errors
  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    handleApiError(response.status, error);
  }
}

/**
 * Cancel an export job
 */
export async function cancelExport(
  projectId: string,
  jobId: string,
  userId: string
): Promise<void> {
  const response = await makeWorkerRequest(`/api/projects/${projectId}/export/${jobId}`, {
    method: 'DELETE',
    body: { userId },
  });

  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    handleApiError(response.status, error);
  }

  const result = await response.json();
  console.log('Export cancelled:', result.message);
}

/**
 * Polling function with exponential backoff
 */
export function pollExportStatus(
  projectId: string,
  jobId: string,
  userId: string,
  callbacks: {
    onProgress?: (status: GetExportStatusResponse) => void;
    onComplete?: (downloadUrl: string) => void;
    onError?: (error: Error) => void;
  }
): () => void {
  let pollInterval = 2000; // Start with 2 seconds
  const maxInterval = 10000; // Cap at 10 seconds
  let pollCount = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  
  const poll = async () => {
    try {
      const status = await getExportStatus(projectId, jobId, userId);
      
      callbacks.onProgress?.(status);
      
      switch (status.status) {
        case 'completed':
          if (status.downloadUrl) {
            callbacks.onComplete?.(status.downloadUrl);
          } else {
            callbacks.onError?.(new Error('Export completed but no download URL available'));
          }
          return;
          
        case 'failed':
          callbacks.onError?.(new Error(status.errorMessage || 'Export failed'));
          return;
          
        case 'expired':
          callbacks.onError?.(new Error('Export has expired'));
          return;
          
        case 'queued':
        case 'processing':
          // Continue polling with exponential backoff
          pollCount++;
          if (pollCount > 5) {
            pollInterval = Math.min(pollInterval * 1.2, maxInterval);
          }
          timeoutId = setTimeout(poll, pollInterval);
          break;
      }
    } catch (error) {
      callbacks.onError?.(error as Error);
    }
  };
  
  // Start polling
  poll();
  
  // Return cleanup function
  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
}

// Admin endpoints (optional)

/**
 * Get export queue status (admin only)
 */
export async function getExportQueueStatus(): Promise<ExportQueueStatus> {
  const response = await makeWorkerRequest('/api/admin/exports/queue', {
    method: 'GET',
  });

  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    handleApiError(response.status, error);
  }

  return response.json();
}

/**
 * Get export analytics (admin only)
 */
export async function getExportAnalytics(options?: {
  days?: number;
  userId?: string;
  projectId?: string;
}): Promise<ExportAnalytics> {
  const params = new URLSearchParams();
  if (options?.days) params.set('days', options.days.toString());
  if (options?.userId) params.set('userId', options.userId);
  if (options?.projectId) params.set('projectId', options.projectId);

  const endpoint = `/api/admin/exports/analytics?${params.toString()}`;
  
  const response = await makeWorkerRequest(endpoint, {
    method: 'GET',
  });

  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    handleApiError(response.status, error);
  }

  return response.json();
}

/**
 * Cleanup expired exports (admin only)
 */
export async function cleanupExpiredExports(): Promise<ExportCleanupResult> {
  const response = await makeWorkerRequest('/api/admin/exports/cleanup', {
    method: 'POST',
  });

  if (!response.ok) {
    const error: ExportErrorResponse = await response.json();
    handleApiError(response.status, error);
  }

  return response.json();
}

/**
 * Centralized error handler for UI components
 */
export function handleExportError(error: any, setError: (msg: string) => void): void {
  if (error instanceof RateLimitError) {
    setError(`Rate limit exceeded. Please wait ${error.retryAfter} seconds before trying again.`);
  } else if (error instanceof ExportError) {
    switch (error.code) {
      case 'NOT_FOUND':
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