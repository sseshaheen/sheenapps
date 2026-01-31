/**
 * Project Export Types
 * TypeScript definitions for the project source code export feature
 * Based on backend worker API integration guide
 */

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

// Custom error classes
export class ExportError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ExportError';
  }
}

export class RateLimitError extends ExportError {
  constructor(message: string, public retryAfter: number) {
    super(message, 'RATE_LIMIT_EXCEEDED');
  }
}

// Admin endpoint types (optional)
export interface ExportQueueStatus {
  queue: { 
    waiting: number; 
    active: number; 
    completed: number; 
    failed: number; 
  };
  metrics: { 
    queued: number; 
    processing: number; 
    completed: number; 
    failed: number; 
  };
  worker: { 
    isRunning: boolean; 
    concurrency: number; 
  };
}

export interface ExportAnalytics {
  analytics: Array<{
    download_date: string;
    total_downloads: number;
    unique_users: number;
    total_bytes: number;
  }>;
}

export interface ExportCleanupResult {
  expired_jobs: number;
  deleted_old_jobs: number;
  cleaned_files: number;
  message: string;
}

// Export options for UI components
export interface ExportOptions {
  versionId?: string;
  clientRequestId?: string;
  includeProgress?: boolean;
}

// Export component props
export interface ExportButtonProps {
  projectId: string;
  userId: string;
  versionId?: string;
  projectName?: string;
  onExportStart?: () => void;
  onExportComplete?: (downloadUrl: string) => void;
  onExportError?: (error: string) => void;
  className?: string;
}

export interface ExportStatusCardProps {
  exportStatus: GetExportStatusResponse;
  onDownload: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
}

export interface ExportListProps {
  projectId?: string;
  userId: string;
  limit?: number;
  onExportSelect?: (exportJob: ListExportsResponse['exports'][0]) => void;
}