// import type { ZodIssue } from 'zod';

/**
 * In-House Mode (Easy Mode) API Types
 *
 * Response contracts for all Easy Mode API endpoints.
 * These types define the shape of data flowing between:
 * - Frontend components
 * - Next.js API routes (proxies)
 * - Worker backend services
 *
 * Philosophy: Define once, use everywhere. Consistent response shapes
 * prevent UI bugs and speed up development.
 */

// =============================================================================
// STANDARD RESPONSE ENVELOPE
// =============================================================================

/**
 * Standard API response wrapper
 * All API endpoints use this shape for consistency
 */
export type ApiResponse<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: {
        code: string
        message: string
        requestId?: string
        details?: unknown
      }
    }

    // =============================================================================
// PROJECT CREATION
// =============================================================================

/**
 * Request body for creating an Easy Mode project
 */
export interface CreateInhouseProjectRequest {
  userId: string
  name: string
  description: string
  tier?: 'free' | 'starter' | 'growth' | 'scale'
  subdomain?: string // Optional - auto-generated if not provided
}

/**
 * Response data from creating an Easy Mode project
 */
export interface CreateProjectResponse {
  projectId: string
  subdomain: string
  schemaName: string
  publicApiKey: string
  url: string
  tier: 'free' | 'starter' | 'growth' | 'scale'
}

// =============================================================================
// INFRASTRUCTURE STATUS
// =============================================================================

/**
 * Database status information
 */
export interface DatabaseStatus {
  status: 'provisioning' | 'active' | 'error'
  schemaName: string
  tableCount: number
  storageUsedMb: number
  storageQuotaMb: number
  errorMessage?: string
}

/**
 * Hosting status information
 */
export interface HostingStatus {
  status: 'none' | 'deploying' | 'live' | 'error'
  url: string | null
  subdomain: string
  lastDeployedAt: string | null
  currentBuildId: string | null
  errorMessage?: string
}

/**
 * Quota usage information
 */
export interface QuotaStatus {
  requestsUsedToday: number
  requestsLimit: number
  bandwidthUsedMb: number
  bandwidthQuotaMb: number
  resetsAt: string // ISO 8601 timestamp
}

/**
 * API keys information (public key always shown, server key hidden)
 */
export interface ApiKeysInfo {
  publicKey: string
  hasServerKey: boolean
}

/**
 * Complete infrastructure status response
 * Used by InfrastructurePanel to show all status cards
 */
export interface InfrastructureStatus {
  database: DatabaseStatus
  hosting: HostingStatus
  quotas: QuotaStatus
  apiKeys: ApiKeysInfo
  tier: 'free' | 'starter' | 'growth' | 'scale'
}

// =============================================================================
// DEPLOYMENT
// =============================================================================

/**
 * Static asset for deployment
 */
export interface DeploymentAsset {
  path: string // e.g., "/index.html", "/_next/static/..."
  content: string // Base64-encoded content
  contentType: string // e.g., "text/html", "application/javascript"
}

/**
 * Server-side rendering bundle
 */
export interface ServerBundle {
  code: string // Worker code (ESM format)
  entryPoint: string // e.g., "index.js"
}

/**
 * Request body for deploying a build
 */
export interface DeployBuildRequest {
  userId: string
  projectId: string
  buildId: string
  staticAssets: DeploymentAsset[]
  serverBundle: ServerBundle
  envVars?: Record<string, string>
}

/**
 * Response data from deploying a build
 */
export interface DeployResponse {
  deploymentId: string
  url: string
  status: 'deployed' | 'failed'
  timestamp: string
  errorMessage?: string
}

/**
 * Deployment info (for history/details)
 */
export interface DeploymentInfo {
  id: string
  buildId: string
  status: 'deployed' | 'failed'
  url: string
  deployedAt: string
  assetCount: number
  totalSizeMb: number
  errorMessage?: string
}

// =============================================================================
// PROJECT DETAILS
// =============================================================================

/**
 * Extended project information for Easy Mode projects
 */
export interface InhouseProjectDetails {
  id: string
  name: string
  infraMode: 'easy' // Always 'easy' for in-house projects
  subdomain: string
  schemaName: string
  tier: 'free' | 'starter' | 'growth' | 'scale'
  createdAt: string
  ownerId: string
  status: InfrastructureStatus
  deployments: DeploymentInfo[]
}

// =============================================================================
// ERROR CODES
// =============================================================================

/**
 * Standard error codes for Easy Mode operations
 * Used in ApiResponse error.code field
 */
export enum InhouseErrorCode {
  // Project creation errors
  SUBDOMAIN_TAKEN = 'SUBDOMAIN_TAKEN',
  INVALID_SUBDOMAIN = 'INVALID_SUBDOMAIN',
  PROJECT_LIMIT_REACHED = 'PROJECT_LIMIT_REACHED',

  // Infrastructure errors
  DATABASE_PROVISIONING_FAILED = 'DATABASE_PROVISIONING_FAILED',
  SCHEMA_CREATION_FAILED = 'SCHEMA_CREATION_FAILED',

  // Deployment errors
  DEPLOYMENT_FAILED = 'DEPLOYMENT_FAILED',
  ASSETS_TOO_LARGE = 'ASSETS_TOO_LARGE',
  BUNDLE_TOO_LARGE = 'BUNDLE_TOO_LARGE',
  R2_UPLOAD_FAILED = 'R2_UPLOAD_FAILED',
  WORKER_DEPLOYMENT_FAILED = 'WORKER_DEPLOYMENT_FAILED',

  // Quota/limits errors
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  STORAGE_LIMIT_EXCEEDED = 'STORAGE_LIMIT_EXCEEDED',

  // Auth/permission errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  FORBIDDEN = 'FORBIDDEN',

  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Status badge variant based on infrastructure status
 */
export type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'default'

/**
 * Helper to determine badge variant from status
 */
export function getStatusVariant(
  status: 'provisioning' | 'active' | 'live' | 'deploying' | 'none' | 'error'
): StatusVariant {
  switch (status) {
    case 'active':
    case 'live':
      return 'success'
    case 'provisioning':
    case 'deploying':
      return 'info'
    case 'error':
      return 'error'
    case 'none':
      return 'default'
    default:
      return 'default'
  }
}

/**
 * Helper to determine if status is a loading state
 */
export function isLoadingStatus(
  status: 'provisioning' | 'active' | 'live' | 'deploying' | 'none' | 'error'
): boolean {
  return status === 'provisioning' || status === 'deploying'
}

/**
 * Helper to format bytes to MB
 */
export function bytesToMB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10
}

/**
 * Helper to format quota percentage
 */
export function getQuotaPercentage(used: number, limit: number): number {
  if (limit === 0) return 0
  return Math.round((used / limit) * 100)
}

// =============================================================================
// DATABASE MANAGEMENT (Phase 2)
// =============================================================================

/**
 * Column definition for database tables
 */
export interface ColumnDefinition {
  name: string
  type: string // 'text' | 'integer' | 'bigint' | 'uuid' | 'timestamp' | 'boolean' | 'json' | 'jsonb'
  nullable: boolean
  defaultValue?: string
  isPrimaryKey?: boolean
  isForeignKey?: boolean
  references?: { table: string; column: string }
}

/**
 * Table schema with columns and metadata
 */
export interface TableSchema {
  name: string
  columns: ColumnDefinition[]
  rowCount?: number
  estimatedSizeMb?: number
}

/**
 * Complete database schema for a project
 */
export interface DatabaseSchema {
  schemaName: string
  tables: TableSchema[]
  totalTables: number
}

/**
 * Request body for creating a table
 */
export interface CreateTableRequest {
  projectId: string
  tableName: string
  columns: Array<{
    name: string
    type: string
    nullable?: boolean
    defaultValue?: string | null
    isPrimaryKey?: boolean
  }>
}

/**
 * Response data from creating a table
 */
export interface CreateTableResponse {
  tableName: string
  createdAt: string
}

/**
 * Request body for executing a query
 */
export interface QueryRequest {
  projectId: string
  query: string // SQL SELECT statement only
}

/**
 * Response data from query execution
 */
export interface QueryResult {
  columns: string[]
  rows: Record<string, any>[]
  rowCount: number
  executionTimeMs: number
}

// =============================================================================
// DEPLOYMENT HISTORY (Task 2 - Observability)
// =============================================================================

/**
 * Individual deployment history item
 * Returned by GET /api/inhouse/projects/[id]/deployments
 */
export interface DeploymentHistoryItem {
  id: string
  buildId: string
  status: 'uploading' | 'deploying' | 'deployed' | 'failed'
  deployedAt: string | null
  errorMessage: string | null
  isCurrentlyActive: boolean
  metadata: {
    assetCount: number
    totalSizeBytes: number
    durationMs: number
  }
  createdAt: string
}

/**
 * Deployment history response with cursor pagination
 */
export interface DeploymentHistoryResponse {
  deployments: DeploymentHistoryItem[]
  nextCursor: string | null
}
