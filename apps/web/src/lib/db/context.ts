/**
 * 🏗️ Database Context Types
 * 
 * Expert v4 Pattern: Explicit database client context
 * Replaces client introspection with explicit mode parameter
 * 
 * Benefits:
 * - Type-safe client mode specification
 * - No dependency on client internals  
 * - Clear separation between user and admin operations
 * - Easy testing with mock contexts
 */

import 'server-only'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { getServiceClient } from '@/lib/server/supabase-clients'
import type { Database } from '@/types/supabase'

// Get the type from the actual client constructor but make it generic-capable
type SupabaseClient<T = any> = Awaited<ReturnType<typeof createServerSupabaseClientNew>>

// ====================================
// CORE TYPES
// ====================================

/**
 * Database operation mode
 * - 'user': Authenticated user operations with RLS enforcement
 * - 'admin': Administrative operations that bypass RLS
 */
export type DbMode = 'user' | 'admin'

/**
 * Database context - combines client with explicit mode
 * Expert v4 pattern for clean, testable database operations
 */
export type DbCtx = {
  client: SupabaseClient<Database>
  mode: DbMode
}

// ====================================
// HELPER FACTORY FUNCTIONS
// ====================================

/**
 * Create user context for authenticated operations
 * Uses SSR auth client with RLS enforcement
 */
export const makeUserCtx = async (): Promise<DbCtx> => {
  const client = await createServerSupabaseClientNew()
  return {
    client,
    mode: 'user',
  }
}

/**
 * Create admin context for administrative operations  
 * Uses service role client that bypasses RLS
 */
export const makeAdminCtx = (): DbCtx => ({
  client: getServiceClient(),
  mode: 'admin',
})

// ====================================
// CONTEXT VALIDATION
// ====================================

/**
 * Runtime assertion to prevent admin mode in web context
 * Expert v4 safety mechanism
 */
export function validateWebContext(ctx: DbCtx): void {
  if (process.env.APP_CONTEXT === 'web' && ctx.mode === 'admin') {
    throw new Error(
      'Admin mode forbidden in web context. Use user mode for web operations.'
    )
  }
}

/**
 * Check if context is using user mode
 */
export function isUserMode(ctx: DbCtx): boolean {
  return ctx.mode === 'user'
}

/**
 * Check if context is using admin mode
 */
export function isAdminMode(ctx: DbCtx): boolean {
  return ctx.mode === 'admin'
}

// ====================================
// CONTEXT UTILITIES
// ====================================

/**
 * Create context description for logging
 */
export function describeContext(ctx: DbCtx): string {
  return `${ctx.mode} mode`
}

/**
 * Create mock context for testing
 */
export function createMockUserCtx(mockClient: SupabaseClient<Database>): DbCtx {
  return {
    client: mockClient,
    mode: 'user'
  }
}

/**
 * Create mock admin context for testing
 */
export function createMockAdminCtx(mockClient: SupabaseClient<Database>): DbCtx {
  return {
    client: mockClient,
    mode: 'admin'
  }
}

// ====================================
// EXPERT IMPLEMENTATION NOTES
// ====================================

/*
EXPERT v4 PATTERNS:

✅ EXPLICIT MODE:
- No client introspection (client.supabaseKey?.includes())
- Mode parameter makes intent clear
- Type-safe with 'user' | 'admin' union

✅ FACTORY FUNCTIONS:
- makeUserCtx() - Clean async user context creation
- makeAdminCtx() - Simple admin context creation
- Easy to mock and test

✅ RUNTIME SAFETY:
- validateWebContext() prevents admin mode in web process
- Clear error messages for misuse
- Environment-aware guards

✅ TESTABILITY:
- Mock context creators for unit tests
- Descriptive utilities for logging
- Clean separation of concerns

USAGE EXAMPLES:

// ✅ User operations
const userCtx = await makeUserCtx()
const project = await ProjectRepository.findById(userCtx, projectId)

// ✅ Admin operations  
const adminCtx = makeAdminCtx()
const allProjects = await ProjectRepository.findAll(adminCtx)

// ✅ Testing
const mockCtx = createMockUserCtx(mockSupabaseClient)
const result = await service.doSomething(mockCtx)
*/