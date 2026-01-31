/**
 * Admin Advisor Matching Components Export
 *
 * Central export file for all admin matching components
 * Following CLAUDE.md patterns for clean module organization
 */

// Main admin dashboard components
export { PoolStatusDashboard } from './pool-status-dashboard'
export { SystemHealthMonitor } from './system-health-monitor'
export { ActiveMatchesTable } from './active-matches-table'
export { ManualAssignmentDialog } from './manual-assignment-dialog'

// Hooks
export * from '../../../hooks/use-admin-matching'

// Re-export API client for admin use
export { advisorMatchingApi } from '../../../services/advisor-matching-api'

// Types
export type * from '../../../types/advisor-matching'