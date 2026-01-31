/**
 * In-House API Gateway Types
 *
 * Types for the API Gateway that sits between user apps and the shared database.
 * This is the security boundary - all user app database access goes through here.
 */

// =============================================================================
// QUERY CONTRACT TYPES
// =============================================================================

/**
 * Supported database operations
 */
export type QueryOperation = 'select' | 'insert' | 'update' | 'delete'

/**
 * Filter operators for queries
 */
export type FilterOperator =
  | 'eq'      // equals
  | 'neq'     // not equals
  | 'gt'      // greater than
  | 'gte'     // greater than or equal
  | 'lt'      // less than
  | 'lte'     // less than or equal
  | 'like'    // pattern match (case sensitive)
  | 'ilike'   // pattern match (case insensitive)
  | 'in'      // value in array
  | 'is'      // IS NULL / IS NOT NULL
  | 'contains'    // JSONB contains
  | 'containedBy' // JSONB contained by
  | 'overlaps'    // array overlaps

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
 *
 * CRITICAL SECURITY: This is NOT raw SQL - it's a structured AST.
 * The gateway parses this and generates parameterized SQL.
 * User input is NEVER interpolated into SQL strings.
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

  // For DELETE (uses filters from above)

  // Row impact guard - max rows affected for UPDATE/DELETE
  maxRows?: number
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
// GATEWAY CONTEXT
// =============================================================================

/**
 * Request context validated by the gateway
 */
export interface GatewayContext {
  projectId: string
  schemaName: string
  apiKeyId: string
  apiKeyType: 'public' | 'server' | 'admin'
  scopes: string[]
  clientIp: string
  userAgent?: string
}

/**
 * Table metadata for validation
 */
export interface TableMetadata {
  name: string
  columns: ColumnMetadata[]
  isSystemTable: boolean
  allowClientRead: boolean
  allowClientWrite: boolean
}

/**
 * Column metadata for validation
 */
export interface ColumnMetadata {
  name: string
  dataType: string
  isNullable: boolean
  isPrimaryKey: boolean
  isSensitive: boolean
  allowClientRead: boolean
  allowClientWrite: boolean
}

// =============================================================================
// RATE LIMITING
// =============================================================================

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

/**
 * Quota check result
 */
export interface QuotaCheckResult {
  withinLimits: boolean
  violations: QuotaViolation[]
}

/**
 * Quota violation details
 */
export interface QuotaViolation {
  type: 'database' | 'storage' | 'requests' | 'bandwidth' | 'builds'
  used: number
  limit: number
  percentUsed: number
}

// =============================================================================
// API KEY VALIDATION
// =============================================================================

/**
 * API key validation result
 */
export interface ApiKeyValidation {
  valid: boolean
  projectId?: string
  schemaName?: string
  keyId?: string
  keyType?: 'public' | 'server' | 'admin'
  scopes?: string[]
  error?: string
}

// =============================================================================
// SCHEMA MANAGEMENT
// =============================================================================

/**
 * Schema creation request
 */
export interface CreateSchemaRequest {
  projectId: string
  tables: TableDefinition[]
}

/**
 * Table definition for schema creation
 */
export interface TableDefinition {
  name: string
  columns: ColumnDefinition[]
  primaryKey?: string
  indexes?: IndexDefinition[]
}

/**
 * Column definition for table creation
 */
export interface ColumnDefinition {
  name: string
  type: string
  nullable?: boolean
  default?: string
  unique?: boolean
  references?: {
    table: string
    column: string
  }
}

/**
 * Index definition
 */
export interface IndexDefinition {
  name?: string
  columns: string[]
  unique?: boolean
}

// =============================================================================
// ERROR CODES
// =============================================================================

export const GATEWAY_ERROR_CODES = {
  // Authentication errors
  INVALID_API_KEY: 'INVALID_API_KEY',
  EXPIRED_API_KEY: 'EXPIRED_API_KEY',
  REVOKED_API_KEY: 'REVOKED_API_KEY',
  INSUFFICIENT_SCOPES: 'INSUFFICIENT_SCOPES',

  // Authorization errors
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  COLUMN_NOT_FOUND: 'COLUMN_NOT_FOUND',
  TABLE_NOT_READABLE: 'TABLE_NOT_READABLE',
  TABLE_NOT_WRITABLE: 'TABLE_NOT_WRITABLE',
  COLUMN_NOT_READABLE: 'COLUMN_NOT_READABLE',
  COLUMN_NOT_WRITABLE: 'COLUMN_NOT_WRITABLE',
  SENSITIVE_COLUMN_ACCESS: 'SENSITIVE_COLUMN_ACCESS',

  // Rate limiting errors
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  DATABASE_QUOTA_EXCEEDED: 'DATABASE_QUOTA_EXCEEDED',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  REQUEST_QUOTA_EXCEEDED: 'REQUEST_QUOTA_EXCEEDED',
  BANDWIDTH_QUOTA_EXCEEDED: 'BANDWIDTH_QUOTA_EXCEEDED',

  // Query errors
  INVALID_QUERY: 'INVALID_QUERY',
  INVALID_OPERATION: 'INVALID_OPERATION',
  INVALID_TABLE: 'INVALID_TABLE',
  INVALID_COLUMN: 'INVALID_COLUMN',
  INVALID_FILTER: 'INVALID_FILTER',
  INVALID_VALUE: 'INVALID_VALUE',
  FILTERLESS_MUTATION: 'FILTERLESS_MUTATION', // UPDATE/DELETE without filters
  ROW_LIMIT_EXCEEDED: 'ROW_LIMIT_EXCEEDED', // UPDATE/DELETE would affect too many rows

  // Execution errors
  QUERY_TIMEOUT: 'QUERY_TIMEOUT',
  QUERY_FAILED: 'QUERY_FAILED',
  CONNECTION_FAILED: 'CONNECTION_FAILED',

  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const

export type GatewayErrorCode = typeof GATEWAY_ERROR_CODES[keyof typeof GATEWAY_ERROR_CODES]
