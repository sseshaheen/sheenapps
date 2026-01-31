/**
 * Integration Status API Types
 *
 * TypeScript interfaces for the unified integration status system.
 * Matches backend API response format with production-ready enhancements.
 *
 * Based on backend implementation September 2025.
 */

// Core integration types
export type IntegrationKey = 'github' | 'vercel' | 'sanity' | 'supabase'
export type IntegrationStatus = 'connected' | 'warning' | 'error' | 'disconnected'
export type OverallStatus = 'error' | 'warning' | 'connected' | 'disconnected' // Priority order

// Integration action definition
export interface IntegrationAction {
  id: string                    // "push", "deploy", "sync", "connect"
  label: string                 // "Push", "Deploy", "Sync", "Connect"
  can: boolean                  // Backend permission check
  reason?: string               // "OAuth expired" if can=false
}

// Problem/error information
export interface IntegrationProblem {
  code: 'oauth_revoked' | 'rate_limited' | 'timeout' | 'unknown'
  hint?: string                 // "Click to reconnect"
}

// Vercel-specific environment status
export interface VercelEnvironment {
  name: string                  // "preview", "production"
  status: IntegrationStatus
  url?: string                  // Deployment URL
  summary?: string              // "Build failed"
}

// Individual integration status
export interface IntegrationStatusItem {
  key: IntegrationKey
  configured: boolean           // Integration is set up
  visible: boolean              // Should be shown in UI
  status: IntegrationStatus
  summary?: string              // "Linked to main · Last push 2m ago"
  updatedAt: string             // ISO timestamp
  stale?: boolean               // true if from cache/circuit breaker
  problem?: IntegrationProblem
  actions?: IntegrationAction[]

  // Vercel-specific: multiple environments
  environments?: VercelEnvironment[]
}

// Main API response structure
export interface IntegrationStatusResponse {
  projectId: string
  overall: OverallStatus          // error > warning > connected > disconnected
  hash: string                    // Stable hash for ETag caching
  renderHash: string              // Includes timestamps for UI invalidation
  items: IntegrationStatusItem[]  // Always 4 items for stable UI layout
}

// Action request for POST /api/integrations/actions/{projectId}
export interface IntegrationActionRequest {
  provider: IntegrationKey
  action: string                  // "deploy", "push", "sync", "connect"
  payload?: Record<string, any>   // Action-specific data
}

// Action response
export interface IntegrationActionResponse {
  success: boolean
  operationId?: string            // For tracking progress
  error?: string
}

// SSE event types
export type IntegrationEventType =
  | 'deploy:started'
  | 'deploy:finished'
  | 'github:push'
  | 'sanity:webhook'
  | 'status:update'

// SSE event structure
export interface IntegrationStatusEvent {
  id?: string                     // Event ID for Last-Event-ID resumption
  type: IntegrationEventType
  provider?: IntegrationKey       // For provider-specific events
  projectId: string
  ts: number                      // Timestamp

  // Event-specific data
  operationId?: string            // For deploy events
  url?: string                    // For deploy finished
  success?: boolean               // For deploy finished
  branch?: string                 // For github push
  sha?: string                    // For github push
  count?: number                  // For sanity webhook
  items?: IntegrationStatusItem[] // For status update
}

// Error response format (follows StructuredError pattern)
export interface IntegrationErrorResponse {
  error: string                   // Stable error code
  message: string                 // User-friendly message
  code?: string                   // Optional structured code
  params?: Record<string, any>    // Optional context data
}

// Hook state types for React components
export interface IntegrationStatusState {
  data?: IntegrationStatusResponse
  isLoading: boolean
  isError: boolean
  error?: IntegrationErrorResponse
  lastUpdated?: number
}

export interface IntegrationSSEState {
  events: IntegrationStatusEvent[]
  connectionState: 'connecting' | 'connected' | 'disconnected'
  lastEventId?: string
  reconnectAttempts: number
}

// Action execution state
export interface IntegrationActionState {
  isExecuting: boolean
  lastAction?: {
    provider: IntegrationKey
    action: string
    timestamp: number
    success: boolean
    error?: string
  }
}

// Context for smart suggestions (Phase 2)
export interface IntegrationContext {
  projectType: string
  iterations: number
  contentBlocks: number
  timeSpent: number
  satisfactionScore?: number
  lastExportAttempt?: number
  recentActions: string[]
}

// Suggestion configuration (Phase 2)
export interface IntegrationSuggestion {
  id: string
  type: IntegrationKey
  priority: 'high' | 'medium' | 'low'
  reason: string
  message: string
  benefits: string[]
  triggers: string[]
  cooldown: string               // "24h", "12h"
  dismissible: boolean
}

// Suggestion cooldown tracking (Phase 2)
export interface SuggestionCooldown {
  suggestionId: string
  lastShown: number
  dismissedUntil?: number
  permanentlyDismissed: boolean
}