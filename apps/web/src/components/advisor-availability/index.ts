/**
 * Advisor Availability Components Export
 *
 * Central export file for all advisor availability components
 * Following CLAUDE.md patterns for clean module organization
 */

// Main availability management components
export { AvailabilityScheduler } from './availability-scheduler'
export { CapacityManager } from './capacity-manager'
export { AvailabilityStatus } from './availability-status'

// Hooks
export * from '../../hooks/use-advisor-availability'

// API client
export { advisorAvailabilityApi, AvailabilityError } from '../../services/advisor-availability-api'

// Types
export type * from '../../types/advisor-availability'