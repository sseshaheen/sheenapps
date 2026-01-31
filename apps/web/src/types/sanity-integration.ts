/**
 * Sanity CMS Integration Types
 * Matches backend Worker API contracts for Sanity operations
 */

// Core Sanity Connection Types
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

// Sanity Document Types
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

// Connection Creation/Testing Types
export interface CreateSanityConnectionRequest {
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
  project_id?: string;
}

export interface TestSanityConnectionRequest {
  projectId: string;
  dataset: string;
  apiVersion?: string;
  token: string;
  useCdn?: boolean;
  perspective?: 'published' | 'previewDrafts';
}

export interface TestSanityConnectionResponse {
  success: boolean;
  message: string;
  projectInfo?: any;
  error?: string;
}

// Content Operations Types
export interface SyncDocumentsRequest {
  force?: boolean;
}

export interface SyncDocumentsResponse {
  success: boolean;
  documents_synced: number;
  documents_created: number;
  documents_updated: number;
  documents_deleted: number;
  sync_duration_ms: number;
  errors: string[];
}

// GROQ Query Types
export interface GroqQueryRequest {
  groq_query: string;
  params?: Record<string, any>;
  cache?: boolean;
  cache_ttl_seconds?: number;
}

export interface GroqQueryResponse<T = any> {
  data: T;
  cached: boolean;
  query_time_ms: number;
  document_dependencies: string[];
}

// Document Filtering Types
export interface GetDocumentsFilters {
  document_type?: string;
  version_type?: 'draft' | 'published';
  language?: string;
  limit?: number;
  offset?: number;
}

// Preview System Types
export interface CreatePreviewRequest {
  document_id: string;
  document_type: string;
  groq_query?: string;
  preview_url?: string;
  ttl_hours?: number;
}

export interface CreatePreviewResponse {
  preview_id: string;
  preview_secret: string;
  preview_url: string;
  expires_at: string;
}

export interface ValidatePreviewResponse {
  valid: boolean;
  preview?: any;
}

// Health Check Types
export interface HealthCheckResponse {
  success: boolean;
  message: string;
  error?: string;
}

// Admin/Breakglass Types
export interface BreakglassCredentialsRequest {
  justification: string;
}

export interface BreakglassCredentialsResponse {
  sanity_project_id: string;
  dataset_name: string;
  auth_token: string;
  robot_token?: string;
  api_version: string;
  access_count: number;
  expires_at: string;
  max_remaining_uses: number;
  warning: string;
}

export interface BreakglassEntry {
  id: string;
  user_id: string;
  connection_id: string;
  project_id?: string;
  justification: string;
  access_count: number;
  max_uses: number;
  expires_at: string;
  created_at: string;
  last_accessed_at?: string;
  is_expired: boolean;
}

export interface ListBreakglassOptions {
  user_id?: string;
  expired?: boolean;
  project_id?: string;
  limit?: number;
  offset?: number;
}

export interface ListBreakglassResponse {
  entries: BreakglassEntry[];
  total: number;
}

// Webhook Types
export interface WebhookEvent {
  id: string;
  connection_id: string;
  event_type: string;
  document_id?: string;
  document_type?: string;
  payload: any;
  processed: boolean;
  created_at: string;
  processed_at?: string;
  error?: string;
}

export interface ListWebhookEventsFilters {
  limit?: number;
  offset?: number;
  processed?: boolean;
  event_type?: string;
}

export interface ListWebhookEventsResponse {
  events: WebhookEvent[];
  total: number;
}

// Error Types
export class SanityIntegrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'SanityIntegrationError';
  }
}

// Common error codes from backend
export const SANITY_ERROR_CODES = {
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',
  SANITY_API_ERROR: 'SANITY_API_ERROR', 
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  RATE_LIMITED: 'RATE_LIMITED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  WEBHOOK_VALIDATION_FAILED: 'WEBHOOK_VALIDATION_FAILED'
} as const;

export type SanityErrorCode = typeof SANITY_ERROR_CODES[keyof typeof SANITY_ERROR_CODES];

// React Hook Types
export interface UseSanityConnectionOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

export interface UseSanityQueryOptions {
  cache?: boolean;
  cache_ttl_seconds?: number;
  enabled?: boolean;
  refetchInterval?: number;
}

// Component Props Types
export interface SanityConnectionSetupProps {
  projectId?: string;
  onSuccess?: (connection: SanityConnection) => void;
  onError?: (error: SanityIntegrationError) => void;
}

export interface SanityDocumentListProps {
  connectionId: string;
  documentType?: string;
  versionType?: 'draft' | 'published';
  language?: string;
  limit?: number;
}

export interface SanityConnectionHealthProps {
  connectionId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}