/**
 * 🏗️ Database Module Exports
 * 
 * Central export point for database context types and utilities
 */

export type { DbMode, DbCtx } from './context'
export {
  makeUserCtx,
  makeAdminCtx,
  validateWebContext,
  isUserMode,
  isAdminMode,
  describeContext,
  createMockUserCtx,
  createMockAdminCtx,
} from './context'