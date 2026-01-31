/**
 * Migration System Types
 * Comprehensive type definitions for the AI-powered website migration system
 */

import { z } from 'zod'

// ============================================
// Core Migration Types
// ============================================

export interface Migration {
  id: string
  sourceUrl: string
  prompt?: string
  userBrief?: Record<string, any>
  status: MigrationStatus
  phase: MigrationPhase
  projectId?: string
  userId: string
  correlationId?: string
  createdAt: string
  updatedAt: string
  completedAt?: string

  // Progress tracking
  progress: number // 0-100
  message: string

  // Analytics
  aiTimeUsed?: number // seconds
  aiTimeEstimate?: number // seconds

  // Results
  migrationResults?: MigrationResults

  // Error information
  error?: MigrationError

  // Verification
  verificationToken?: string
  verificationStatus?: VerificationStatus
  verificationExpiresAt?: string
}

export type MigrationStatus =
  | 'pending'
  | 'verifying'
  | 'analyzing'
  | 'planning'
  | 'processing'
  | 'deploying'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type MigrationPhase =
  | 'verification'
  | 'analysis'
  | 'planning'
  | 'transformation'
  | 'deployment'
  | 'completed'

export type VerificationStatus =
  | 'pending'
  | 'verified'
  | 'failed'
  | 'expired'

export interface MigrationResults {
  pagesMigrated: number
  redirectsCreated: number
  performanceDelta?: string
  topFollowUps?: string[]
  deploymentUrl?: string
  migrationSummary?: string
}

export interface MigrationError {
  type: MigrationErrorType
  message: string
  code?: string
  correlationId?: string
  retryable: boolean
  details?: Record<string, any>
}

export type MigrationErrorType =
  | 'verification_failed'
  | 'budget_exceeded'
  | 'builder_incompatibility'
  | 'network_error'
  | 'timeout'
  | 'invalid_url'
  | 'rate_limited'
  | 'server_error'
  | 'cancelled'

// ============================================
// Event System Types
// ============================================

export const UnifiedEventSchema = z.discriminatedUnion('type', [
  // Build events
  z.object({
    id: z.string(),
    type: z.literal('build_started'),
    projectId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string(),
    timestamp: z.number(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),
  z.object({
    id: z.string(),
    type: z.literal('build_progress'),
    projectId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string(),
    timestamp: z.number(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),
  z.object({
    id: z.string(),
    type: z.literal('build_completed'),
    projectId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string(),
    timestamp: z.number(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),
  z.object({
    id: z.string(),
    type: z.literal('build_failed'),
    projectId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string(),
    timestamp: z.number(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),

  // Migration events
  z.object({
    id: z.string(),
    type: z.literal('migration_started'),
    migrationId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string().max(500),
    timestamp: z.number(),
    phase: z.string().optional(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),
  z.object({
    id: z.string(),
    type: z.literal('migration_progress'),
    migrationId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string().max(500),
    timestamp: z.number(),
    phase: z.string().optional(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),
  z.object({
    id: z.string(),
    type: z.literal('migration_phase_change'),
    migrationId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string().max(500),
    timestamp: z.number(),
    phase: z.string(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),
  z.object({
    id: z.string(),
    type: z.literal('migration_completed'),
    migrationId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string().max(500),
    timestamp: z.number(),
    phase: z.string().optional(),
    projectId: z.string().optional(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),
  z.object({
    id: z.string(),
    type: z.literal('migration_failed'),
    migrationId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string().max(500),
    timestamp: z.number(),
    phase: z.string().optional(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),
  z.object({
    id: z.string(),
    type: z.literal('migration_cancelled'),
    migrationId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string().max(500),
    timestamp: z.number(),
    phase: z.string().optional(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),

  // Verification events
  z.object({
    id: z.string(),
    type: z.literal('verification_required'),
    migrationId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string().max(500),
    timestamp: z.number(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),
  z.object({
    id: z.string(),
    type: z.literal('verification_completed'),
    migrationId: z.string(),
    status: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string().max(500),
    timestamp: z.number(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),

  // Connection status events
  z.object({
    id: z.string(),
    type: z.literal('connection_status'),
    status: z.string(),
    message: z.string().max(500),
    timestamp: z.number(),
    isLeader: z.boolean().optional(),
    activeConnections: z.number().optional(),
    correlationId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  })
])

export type UnifiedEvent = z.infer<typeof UnifiedEventSchema>

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'auth_required'

// ============================================
// API Request/Response Types
// ============================================

// Migration start request validation schema
export const MigrationInputSchema = z.object({
  sourceUrl: z.string().url().max(2048),
  prompt: z.string().max(5000).optional(),
  userBrief: z.object({}).passthrough().optional()
})

export type MigrationInput = z.infer<typeof MigrationInputSchema>

export interface MigrationStartResponse {
  migrationId: string
  status: MigrationStatus
  message: string
  correlationId: string
  estimatedTime?: number // seconds
}

export interface MigrationStatusResponse {
  migration: Migration
  correlationId: string
}

export interface MigrationCancelResponse {
  migrationId: string
  cancelled: boolean
  message: string
  correlationId: string
}

// Rate limiting response
export interface RateLimitResponse {
  error: string
  message: string
  retryAfter: number
  remaining: number
  correlationId: string
}

// Events polling response
export interface EventsPollingResponse {
  events: UnifiedEvent[]
  hasMore: boolean
  nextSinceId?: string
}

// ============================================
// Migration Analytics Types
// ============================================

export interface MigrationAnalytics {
  migrationId: string

  // Time breakdown
  timeBreakdown: {
    verification: number
    analysis: number
    planning: number
    transformation: number
    deployment: number
    total: number
  }

  // Performance insights
  performance: {
    originalSize?: number
    optimizedSize?: number
    lighthouseScoreDelta?: number
    loadTimeDelta?: number
    bottlenecks?: string[]
  }

  // Cost tracking
  cost: {
    aiTimeUsed: number
    aiTimeEstimated: number
    efficiency: number // 0-100
    budgetUsed: number
    budgetRemaining: number
  }

  // Quality metrics
  quality: {
    pagesMigrated: number
    redirectsCreated: number
    errorCount: number
    warningCount: number
    successRate: number
  }
}

// ============================================
// UI Component Props Types
// ============================================

export interface MigrationStartFormProps {
  onSubmit: (url: string, prompt?: string, preset?: string) => Promise<void>
  enableClipboardDetection?: boolean
  showEstimate?: boolean
  isLoading?: boolean
  onClipboardDetect?: (url: string) => string | null
}

export interface UnifiedProgressDisplayProps {
  migrationId?: string
  projectId?: string
  onComplete?: (projectId: string) => void
  onCancel?: () => Promise<void>
  showCancelButton?: boolean
  ariaLiveRegion?: boolean
  errorRole?: string
  buttonAriaDisabled?: boolean
}

export interface ErrorDisplayProps {
  error: MigrationError
  correlationId?: string
  onAction?: (action: string) => void
}

export interface AITimeTrackerProps {
  migrationId: string
  showEstimate?: boolean
  showLiveConsumption?: boolean
  onBudgetWarning?: (remaining: number) => void
}

// ============================================
// Hook Types
// ============================================

export interface UseUnifiedEventsParams {
  projectId?: string
  migrationId?: string
}

export interface UseUnifiedEventsReturn {
  events: UnifiedEvent[]
  connectionStatus: ConnectionStatus
  isConnected: boolean
  retry: () => void
}

export interface UseRateLimitStatusReturn {
  rateLimitInfo: {
    remaining: number
    resetTime: number
    retryAfter: number
  } | null
  countdown: number
  isRateLimited: boolean
  shouldDimButtons: boolean
  handleRateLimitResponse: (response: Response) => void
}

// ============================================
// Enterprise Types
// ============================================

export interface BulkMigration {
  id: string
  name: string
  urls: string[]
  prompt?: string
  userBrief?: Record<string, any>
  status: BulkMigrationStatus
  progress: number
  completedMigrations: number
  totalMigrations: number
  failedMigrations: number
  userId: string
  orgId?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export type BulkMigrationStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface OrganizationAnalytics {
  orgId: string
  timeRange: string

  // Aggregate metrics
  totalMigrations: number
  completedMigrations: number
  failedMigrations: number
  successRate: number

  // Time and cost
  totalAITimeUsed: number
  averageMigrationTime: number
  totalCost: number

  // Performance trends
  trends: {
    date: string
    migrations: number
    successRate: number
    averageTime: number
  }[]

  // Optimization recommendations
  recommendations: string[]
}

// ============================================
// Utility Types
// ============================================

export interface MigrationPreset {
  id: string
  name: string
  description: string
  prompt: string
  estimatedTime: number
}

export const MIGRATION_PRESETS: MigrationPreset[] = [
  {
    id: 'preserve',
    name: 'Preserve Design',
    description: 'Keep the original design as close as possible',
    prompt: 'Migrate this website while preserving the exact visual design and layout. Focus on technical modernization without changing the appearance.',
    estimatedTime: 540 // 9 minutes
  },
  {
    id: 'modernize',
    name: 'Modernize',
    description: 'Update with modern UI patterns and best practices',
    prompt: 'Modernize this website with contemporary UI patterns, improved accessibility, and modern web standards while maintaining the core brand identity.',
    estimatedTime: 780 // 13 minutes
  },
  {
    id: 'redesign',
    name: 'Redesign',
    description: 'Complete redesign with current trends',
    prompt: 'Create a completely modern redesign of this website using current design trends, optimal user experience patterns, and cutting-edge web technologies.',
    estimatedTime: 1140 // 19 minutes
  }
]

// Export utility functions
export const isMigrationEvent = (event: UnifiedEvent): event is Extract<UnifiedEvent, { migrationId: string }> => {
  return 'migrationId' in event
}

export const isBuildEvent = (event: UnifiedEvent): event is Extract<UnifiedEvent, { projectId: string }> => {
  return 'projectId' in event && !('migrationId' in event)
}

export const getMigrationPhaseProgress = (phase: MigrationPhase): number => {
  const phaseProgress = {
    verification: 10,
    analysis: 25,
    planning: 40,
    transformation: 75,
    deployment: 90,
    completed: 100
  }
  return phaseProgress[phase] || 0
}

export const getErrorActions = (errorType: MigrationErrorType): Array<{ id: string; label: string }> => {
  switch (errorType) {
    case 'verification_failed':
      return [
        { id: 'open_dns_instructions', label: 'Open DNS Instructions' },
        { id: 'copy_correlation_id', label: 'Copy Support ID' }
      ]
    case 'budget_exceeded':
      return [
        { id: 'increase_budget', label: 'Upgrade Plan' },
        { id: 'copy_correlation_id', label: 'Copy Support ID' }
      ]
    default:
      return [
        { id: 'copy_correlation_id', label: 'Copy Support ID' },
        { id: 'copy_logs', label: 'Copy Debug Logs' },
        { id: 'contact_support', label: 'Contact Support' }
      ]
  }
}