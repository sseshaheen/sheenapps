/**
 * Advisor Matching Components Export
 *
 * Central export file for all advisor matching components
 * Following CLAUDE.md patterns for clean module organization
 */

// Main workflow components
export { MatchRequestFlow } from './match-request-flow'
export { SmartMatchCard } from './smart-match-card'
export { MatchStatusTracker } from './match-status-tracker'
export { MatchApprovalDialog } from './match-approval-dialog'

// Hooks
export * from '../../hooks/use-advisor-matching'

// API client
export { advisorMatchingApi, MatchingApiError } from '../../services/advisor-matching-api'

// Types
export type * from '../../types/advisor-matching'