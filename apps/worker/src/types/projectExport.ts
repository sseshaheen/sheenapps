/**
 * TypeScript types for Project Export functionality
 * Based on the database schema defined in migration 090_project_export_tables.sql
 */

// Export Job Status enum
export type ExportJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'expired';

// Export Type enum
export type ExportType = 'zip';

// Progress phases during export processing
export type ExportPhase = 'queued' | 'scanning' | 'compressing' | 'uploading' | 'completed' | 'failed';

// Progress tracking structure
export interface ExportProgress {
  phase: ExportPhase;
  filesScanned: number;
  bytesWritten: number;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  estimatedTotalFiles?: number | undefined;
  currentFile?: string | undefined;
  message?: string | undefined;
}

// Database row types
export interface ProjectExportJob {
  id: string;
  project_id: string;
  user_id: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  version_id?: string | undefined;
  version_id_norm: string;
  export_type: ExportType;
  status: ExportJobStatus;
  progress: ExportProgress;

  // Storage metadata
  r2_key?: string | undefined;
  uncompressed_size_bytes?: number | undefined; // Original file sizes before compression
  file_count: number;
  zip_size_bytes?: number | undefined; // Compressed ZIP file size
  compression_ratio?: number | undefined; // zip_size_bytes / uncompressed_size_bytes (≤ 1)

  // Security and validation
  export_hash?: string | undefined;
  client_request_id?: string | undefined;

  // Timing and cleanup
  created_at: Date;
  started_at?: Date | undefined;
  completed_at?: Date | undefined;
  expires_at: Date;

  // Error handling
  error_message?: string | undefined;
  retry_count: number;

  // Rate limiting metadata
  rate_limit_bucket: string;
}

export interface ProjectExportDownload {
  id: string;
  export_job_id: string;
  user_id: string;
  project_id: string;

  // Download metadata
  downloaded_at: Date;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  download_ip?: string | undefined;
  user_agent?: string | undefined;
  referrer?: string | undefined;

  // Analytics data
  zip_size_bytes?: number | undefined; // Size of downloaded ZIP file
  download_duration_ms?: number | undefined;
  success: boolean;

  // Geographic/session context
  session_id?: string | undefined;
  country_code?: string | undefined;
}

// API Request/Response types
export interface CreateExportRequest {
  userId: string;
  projectId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  versionId?: string | undefined;
  exportType?: ExportType | undefined;
  clientRequestId?: string | undefined; // For idempotency
}

export interface CreateExportResponse {
  jobId: string;
  status: ExportJobStatus;
  message: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  estimatedCompletionTime?: string | undefined; // ISO datetime
}

export interface GetExportStatusRequest {
  userId: string;
  jobId: string;
}

export interface GetExportStatusResponse {
  jobId: string;
  status: ExportJobStatus;
  progress: ExportProgress;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  zipSize?: number | undefined; // Compressed ZIP file size
  fileCount?: number | undefined;
  compressionRatio?: number | undefined;
  createdAt: string; // ISO datetime
  completedAt?: string | undefined; // ISO datetime
  expiresAt?: string | undefined; // ISO datetime
  downloadUrl?: string | undefined; // Only present when status is 'completed'
  errorMessage?: string | undefined;
}

export interface ListExportsRequest {
  userId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  projectId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ListExportsResponse {
  exports: Array<{
    jobId: string;
    projectId: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    versionId?: string | undefined;
    status: ExportJobStatus;
    zipSize?: number | undefined; // Compressed ZIP file size
    fileCount?: number | undefined;
    createdAt: string;
    expiresAt?: string | undefined;
  }>;
  totalCount: number;
  hasMore: boolean;
}

export interface DownloadExportRequest {
  userId: string;
  jobId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  sessionId?: string | undefined;
  userAgent?: string | undefined;
  downloadIp?: string | undefined;
}

// Internal service types
export interface ExportJobCreateParams {
  projectId: string;
  userId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  versionId?: string | undefined;
  exportType?: ExportType | undefined;
  clientRequestId?: string | undefined;
  rateLimitBucket?: string | undefined;
}

export interface ExportJobUpdateParams {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  status?: ExportJobStatus | undefined;
  progress?: Partial<ExportProgress> | undefined;
  r2Key?: string | undefined;
  uncompressedSizeBytes?: number | undefined;
  fileCount?: number | undefined;
  zipSizeBytes?: number | undefined;
  compressionRatio?: number | undefined;
  exportHash?: string | undefined;
  startedAt?: Date | undefined;
  completedAt?: Date | undefined;
  errorMessage?: string | undefined;
  retryCount?: number | undefined;
}

// File filtering and security types
export interface FileFilterOptions {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  includeDotFiles?: boolean | undefined;
  includeNodeModules?: boolean | undefined;
  maxFileSize?: number | undefined; // bytes
  maxTotalFiles?: number | undefined;
  allowedExtensions?: string[] | undefined;
  blockedExtensions?: string[] | undefined;
  blockedPatterns?: string[] | undefined;
}

export interface FileSecurityCheck {
  path: string;
  allowed: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  reason?: string | undefined;
  size?: number | undefined;
}

// Rate limiting types
export interface RateLimitInfo {
  allowed: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  remaining?: number | undefined;
  resetTime?: Date | undefined;
  retryAfter?: number | undefined; // seconds
  bucket: string;
}

// Queue job types for Bull
export interface ExportQueueJob {
  jobId: string;
  projectId: string;
  userId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  versionId?: string | undefined;
  exportType: ExportType;
  options: FileFilterOptions;
}

export interface ExportQueueResult {
  success: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  r2Key?: string | undefined;
  zipSizeBytes?: number | undefined; // Compressed ZIP file size
  fileCount?: number | undefined;
  compressionRatio?: number | undefined;
  exportHash?: string | undefined;
  error?: string | undefined;
}

// Error types
export class ExportError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

export class RateLimitExceededError extends ExportError {
  constructor(message: string, public retryAfter: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
  }
}

export class ProjectNotFoundError extends ExportError {
  constructor(projectId: string) {
    super(`Project ${projectId} not found or access denied`, 'PROJECT_NOT_FOUND', 404);
  }
}

export class ExportNotFoundError extends ExportError {
  constructor(jobId: string) {
    super(`Export job ${jobId} not found`, 'EXPORT_NOT_FOUND', 404);
  }
}

export class ExportExpiredError extends ExportError {
  constructor(jobId: string) {
    super(`Export job ${jobId} has expired`, 'EXPORT_EXPIRED', 410);
  }
}

// Configuration types
export interface ExportConfig {
  // Storage
  r2: {
    bucket: string;
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  
  // Queue settings
  queue: {
    redis: {
      host: string;
      port: number;
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      password?: string | undefined;
    };
    concurrency: number;
    retryAttempts: number;
    backoffDelay: number;
  };
  
  // Rate limiting
  rateLimit: {
    maxExportsPerHour: number;
    maxExportsPerDay: number;
    globalMaxPerSecond: number;
  };
  
  // File processing
  files: {
    maxFileSizeBytes: number;
    maxTotalFiles: number;
    maxArchiveSizeBytes: number;
    compressionLevel: number;
    defaultFilter: FileFilterOptions;
  };
  
  // Cleanup and retention
  cleanup: {
    retentionHours: number;
    cleanupIntervalHours: number;
    maxAge: number;
  };
}