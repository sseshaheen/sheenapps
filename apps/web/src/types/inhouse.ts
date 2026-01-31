/**
 * In-House Mode Types
 *
 * TypeScript types for the "Everything In-House" infrastructure mode.
 * These map to the database tables in the inhouse_mode_infrastructure migration.
 */

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Infrastructure mode for projects
 * - easy: SheenApps manages hosting, database, CMS
 * - pro: User brings their own infrastructure (Supabase, Vercel, Sanity)
 */
export type InfrastructureMode = 'easy' | 'pro'

/**
 * Status of an in-house project schema
 */
export type InhouseSchemaStatus = 'active' | 'suspended' | 'deleted'

/**
 * Status of an in-house deployment
 */
export type InhouseDeploymentStatus =
  | 'pending'
  | 'uploading'
  | 'deploying'
  | 'deployed'
  | 'failed'
  | 'rolled_back'

/**
 * Type of API key
 */
export type InhouseApiKeyType = 'public' | 'server' | 'admin'

/**
 * Status of an API key
 */
export type InhouseApiKeyStatus = 'active' | 'revoked' | 'expired'

/**
 * Pricing tier for in-house projects
 */
export type InhouseTier = 'free' | 'starter' | 'growth' | 'scale' | 'enterprise'

// =============================================================================
// DATABASE TYPES
// =============================================================================

/**
 * In-house project schema metadata
 * Tracks PostgreSQL schemas created for Easy Mode projects
 */
export interface InhouseProjectSchema {
  id: string
  project_id: string
  schema_name: string
  created_at: string
  updated_at: string
  table_count: number
  row_count_estimate: number
  size_bytes: number
  last_migration_at: string | null
  migration_version: number
  status: InhouseSchemaStatus
}

/**
 * Registry of tables in Easy Mode project schemas
 * Used for query validation and allowlist enforcement
 */
export interface InhouseTable {
  id: string
  schema_id: string
  project_id: string
  table_name: string
  created_at: string
  updated_at: string
  display_name: string | null
  description: string | null
  row_count_estimate: number
  size_bytes: number
  is_system_table: boolean
  allow_client_read: boolean
  allow_client_write: boolean
}

/**
 * Registry of columns in Easy Mode project tables
 * Used for query validation and column allowlist enforcement
 */
export interface InhouseColumn {
  id: string
  table_id: string
  column_name: string
  data_type: string
  created_at: string
  display_name: string | null
  description: string | null
  is_nullable: boolean
  is_primary_key: boolean
  default_value: string | null
  is_sensitive: boolean
  allow_client_read: boolean
  allow_client_write: boolean
}

/**
 * Deployment record for Easy Mode projects
 */
export interface InhouseDeployment {
  id: string
  project_id: string
  build_id: string
  created_at: string
  deployed_at: string | null
  version_id: string | null
  status: InhouseDeploymentStatus
  cf_worker_name: string | null
  cf_worker_version: string | null
  bundle_size_bytes: number | null
  static_assets_count: number | null
  static_assets_bytes: number | null
  deploy_duration_ms: number | null
  error_message: string | null
  error_details: Record<string, unknown> | null
}

/**
 * API key for Easy Mode projects
 */
export interface InhouseApiKey {
  id: string
  project_id: string
  created_at: string
  updated_at: string
  key_prefix: string
  key_hash: string
  key_type: InhouseApiKeyType
  name: string | null
  description: string | null
  scopes: string[]
  last_used_at: string | null
  usage_count: number
  status: InhouseApiKeyStatus
  revoked_at: string | null
  revoked_reason: string | null
  expires_at: string | null
}

/**
 * Quota tracking for Easy Mode projects
 */
export interface InhouseQuota {
  id: string
  project_id: string
  tier: InhouseTier

  // Database limits
  db_size_limit_bytes: number
  db_size_used_bytes: number

  // Storage limits
  storage_size_limit_bytes: number
  storage_size_used_bytes: number

  // Request limits (daily)
  requests_limit_daily: number
  requests_used_today: number
  requests_reset_at: string | null

  // Bandwidth limits (monthly)
  bandwidth_limit_bytes: number
  bandwidth_used_bytes: number
  bandwidth_reset_at: string | null

  // Build limits (monthly)
  builds_limit_monthly: number
  builds_used_month: number
  builds_reset_at: string | null

  created_at: string
  updated_at: string
}

/**
 * Request log entry for rate limiting
 */
export interface InhouseRequestLog {
  id: string
  project_id: string
  api_key_id: string | null
  created_at: string
  method: string
  path: string
  status_code: number | null
  response_size_bytes: number | null
  duration_ms: number | null
  client_ip: string | null
  user_agent: string | null
}

// =============================================================================
// QUERY CONTRACT TYPES (for API Gateway)
// =============================================================================

/**
 * Supported database operations
 */
export type QueryOperation = 'select' | 'insert' | 'update' | 'delete'

/**
 * Filter operators for queries
 */
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'in'
  | 'is'
  | 'contains'
  | 'containedBy'
  | 'overlaps'

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc'

/**
 * Single filter condition
 */
export interface QueryFilter {
  column: string
  op: FilterOperator
  value: unknown
}

/**
 * Sort specification
 */
export interface QuerySort {
  column: string
  direction: SortDirection
  nullsFirst?: boolean
}

/**
 * Structured query contract - what the SDK sends to the API Gateway
 * This is NOT raw SQL - it's a structured AST that the gateway validates
 */
export interface QueryContract {
  operation: QueryOperation
  table: string

  // For SELECT
  columns?: string[]
  filters?: QueryFilter[]
  sorts?: QuerySort[]
  limit?: number
  offset?: number

  // For INSERT
  data?: Record<string, unknown> | Record<string, unknown>[]
  returning?: string[]

  // For UPDATE
  set?: Record<string, unknown>

  // For DELETE (uses filters)
}

/**
 * Query response from API Gateway
 */
export interface QueryResponse<T = unknown> {
  data: T | null
  error: QueryError | null
  count?: number
  status: number
}

/**
 * Query error structure
 */
export interface QueryError {
  code: string
  message: string
  details?: string
  hint?: string
}

// =============================================================================
// SDK TYPES
// =============================================================================

/**
 * Configuration for @sheenapps/db SDK client
 */
export interface InhouseDbClientConfig {
  projectId: string
  apiKey: string
  apiUrl?: string
}

/**
 * Query builder result (similar to Supabase)
 */
export interface InhouseQueryResult<T> {
  data: T | null
  error: QueryError | null
  count?: number
  status: number
  statusText: string
}

// =============================================================================
// API TYPES
// =============================================================================

/**
 * Request to create an Easy Mode project
 */
export interface CreateEasyModeProjectRequest {
  name: string
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte'
  subdomain?: string // Optional, auto-generated if not provided
}

/**
 * Response from creating an Easy Mode project
 */
export interface CreateEasyModeProjectResponse {
  project_id: string
  subdomain: string
  schema_name: string
  api_key: {
    public_key: string // "sheen_pk_xxx..." - full key, only shown once
    key_prefix: string // "sheen_pk_xxx" - visible prefix for display
  }
  preview_url: string
}

/**
 * Deployment request for Easy Mode project
 */
export interface EasyModeDeployRequest {
  project_id: string
  version_id?: string
  force?: boolean
}

/**
 * Deployment response
 */
export interface EasyModeDeployResponse {
  deployment_id: string
  build_id: string
  status: InhouseDeploymentStatus
  url: string
  started_at: string
}

/**
 * Project quota status response
 */
export interface ProjectQuotaStatus {
  tier: InhouseTier
  database: {
    used_bytes: number
    limit_bytes: number
    percent_used: number
  }
  storage: {
    used_bytes: number
    limit_bytes: number
    percent_used: number
  }
  requests: {
    used_today: number
    limit_daily: number
    percent_used: number
    resets_at: string | null
  }
  bandwidth: {
    used_bytes: number
    limit_bytes: number
    percent_used: number
    resets_at: string | null
  }
  builds: {
    used_month: number
    limit_monthly: number
    percent_used: number
    resets_at: string | null
  }
}

// =============================================================================
// TIER LIMITS CONFIGURATION
// =============================================================================

/**
 * Default quota limits per tier
 */
export const TIER_LIMITS: Record<InhouseTier, {
  db_size_bytes: number
  storage_bytes: number
  requests_daily: number
  bandwidth_bytes: number
  builds_monthly: number
}> = {
  free: {
    db_size_bytes: 100 * 1024 * 1024,      // 100MB
    storage_bytes: 500 * 1024 * 1024,      // 500MB
    requests_daily: 10_000,
    bandwidth_bytes: 1 * 1024 * 1024 * 1024,  // 1GB
    builds_monthly: 100,
  },
  starter: {
    db_size_bytes: 500 * 1024 * 1024,      // 500MB
    storage_bytes: 2 * 1024 * 1024 * 1024, // 2GB
    requests_daily: 50_000,
    bandwidth_bytes: 10 * 1024 * 1024 * 1024, // 10GB
    builds_monthly: 500,
  },
  growth: {
    db_size_bytes: 2 * 1024 * 1024 * 1024, // 2GB
    storage_bytes: 10 * 1024 * 1024 * 1024, // 10GB
    requests_daily: 200_000,
    bandwidth_bytes: 50 * 1024 * 1024 * 1024, // 50GB
    builds_monthly: 2000,
  },
  scale: {
    db_size_bytes: 10 * 1024 * 1024 * 1024, // 10GB
    storage_bytes: 50 * 1024 * 1024 * 1024, // 50GB
    requests_daily: 1_000_000,
    bandwidth_bytes: 200 * 1024 * 1024 * 1024, // 200GB
    builds_monthly: 10000,
  },
  enterprise: {
    db_size_bytes: 100 * 1024 * 1024 * 1024, // 100GB
    storage_bytes: 500 * 1024 * 1024 * 1024, // 500GB
    requests_daily: 10_000_000,
    bandwidth_bytes: 1024 * 1024 * 1024 * 1024, // 1TB
    builds_monthly: 100000,
  },
}

// =============================================================================
// RUNTIME LIMITS
// =============================================================================

/**
 * Runtime constraints for Easy Mode user code
 */
export const RUNTIME_LIMITS = {
  maxExecutionMs: 10_000,           // 10 second timeout
  maxMemoryMb: 128,                 // 128MB memory
  maxRequestsPerMin: 100,           // Per-project rate limit
  maxResponseSizeBytes: 5_000_000,  // 5MB response limit
} as const

/**
 * Outbound network policy (enforced at BUILD/DEPLOY time)
 */
export const OUTBOUND_POLICY = {
  allowedHosts: ['api.sheenapps.com', 'worker.sheenapps.com', 'sheenapps.com'],
  monitorEgress: true,
  rateLimit: { requestsPerMin: 60 },
} as const
