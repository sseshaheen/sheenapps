/**
 * Worker API v2.1 Type Definitions
 * For integration with Worker service endpoints
 */

// Import enhanced billing types
export type { EnhancedBalance, InsufficientFundsError, BatchOperationRequest, BatchOperationResponse } from './billing'

// Enhanced Balance Response Types (New v2025-09-01 format)
export interface BalanceResponse {
  version: string;
  plan_key: string;
  subscription_status: string;
  totals: {
    total_seconds: number;
    paid_seconds: number;
    bonus_seconds: number;
    next_expiry_at: string | null;
  };
  buckets: {
    daily: Array<{ seconds: number; expires_at: string; }>;
    paid: Array<{ seconds: number; expires_at: string; source: string; }>;
  };
  bonus: {
    daily_minutes: number;
    used_this_month_minutes: number;
    monthly_cap_minutes: number;
  };
  catalog_version: string;
}

// Legacy Balance Response (DEPRECATED - Maintained for backwards compatibility)
/** @deprecated Use BalanceResponse (new enhanced format) instead */
export interface LegacyBalanceResponse {
  balance: {
    welcomeBonus: number;
    dailyGift: number;
    paid: number;
    total: number;
  };
  usage: {
    todayUsed: number;
    lifetimeUsed: number;
  };
  dailyResetAt: string;
}

// Sufficient Check Types
export interface SufficientCheckResponse {
  sufficient: boolean;
  estimate: {
    estimatedSeconds: number;
    estimatedMinutes: number;
    confidence: 'high' | 'medium' | 'low';
    basedOnSamples: number;
  } | null;
  balance: {
    total_seconds: number;
    paid_seconds: number;
    bonus_seconds: number;
  };
  recommendation?: {
    suggestedPackage: string;
    costToComplete: number;
    purchaseUrl: string;
  };
}

export interface SufficientCheckRequest {
  userId: string;
  operationType: 'main_build' | 'metadata_generation' | 'update';
  projectSize?: 'small' | 'medium' | 'large';
}

// Build API Types
export interface CreatePreviewRequest {
  userId: string;
  projectId?: string;  // Optional - worker can generate server-side
  prompt: string;
  templateFiles: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface PreviewDeploymentResponse {
  buildId: string;
  projectId: string;  // Worker now returns generated projectId
  status: 'queued' | 'building' | 'completed' | 'failed';
  previewUrl?: string;
  estimatedCompletionTime?: string;
  queuePosition?: number;
}

export interface UpdateProjectRequest {
  userId: string;
  projectId: string;
  changes: Record<string, any>;
  prompt?: string;
}

// Export/Download Types
export interface ExportResponse {
  downloadUrl: string;
  expiresAt: string;
  sizeBytes: number;
  format: 'zip';
}

export interface DownloadResponse {
  downloadUrl: string;
  expiresAt: string;
  sizeBytes: number;
  format: 'zip';
  version: string;
}

// Build Events Types (for Supabase real-time)
export interface ProjectBuildEvent {
  id: number;
  build_id: string;
  event_type: 'plan_started' | 'build_started' | 'deploy_started' | 'deploy_completed' | 'deploy_failed' | 'task_failed';
  event_data: {
    message?: string;
    previewUrl?: string;
    duration?: number;
    error?: string;
    progress?: number;
    [key: string]: any;
  };
  user_id?: string;
  created_at: string;
}

// Enhanced Error Types with Support Tracking
export interface WorkerErrorResponse {
  error: string;
  details?: string;
  referenceId: string;  // For support tracking
  timestamp: string;
  code: string;
}

export class WorkerAPIError extends Error {
  constructor(
    public status: number,
    public code?: string,
    message?: string,
    public data?: any,
    public referenceId?: string  // Support reference from worker
  ) {
    super(message || `Worker API Error: ${status}`);
    this.name = 'WorkerAPIError';
  }
}

export class InsufficientBalanceError extends Error {
  constructor(public data: SufficientCheckResponse) {
    super(data.recommendation?.suggestedPackage 
      ? `Insufficient AI time balance. ${data.recommendation.suggestedPackage} recommended.`
      : 'Insufficient AI time balance. Please add credits to continue building.'
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class PayloadTooLargeError extends Error {
  constructor(message = 'Project too large for processing (>2GB)') {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}

export class RateLimitError extends Error {
  constructor(
    public retryAfter: number,
    message = 'Rate limit exceeded'
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// API Client Types
export interface WorkerRequestOptions extends RequestInit {
  __retryAttempt?: number;
}

export interface ErrorResult {
  type: 'insufficient_balance' | 'payload_too_large' | 'rate_limited' | 'generic_error';
  action: 'show_purchase' | 'show_warning' | 'retry_with_backoff' | 'show_error';
  data?: any;
}

// Cache Types for Export Service
export interface CachedDownload {
  url: string;
  expiresAt: string;
}

// Project Size Estimation
export type ProjectSize = 'small' | 'medium' | 'large';

// Operation Types for Billing
export type OperationType = 'main_build' | 'metadata_generation' | 'update';

// Build Status Types
export type BuildStatus = 'idle' | 'queued' | 'building' | 'completed' | 'failed';

// Rate Limiting Headers
export interface RateLimitHeaders {
  'x-ratelimit-limit': string;
  'x-ratelimit-remaining': string;
  'x-ratelimit-reset': string;
}