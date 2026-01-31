/**
 * 🛡️ Server-Only Supabase Client Architecture
 * 
 * Phase 2.2: Separated Client Architecture
 * Expert-validated security patterns
 * 
 * CRITICAL SECURITY PRINCIPLES:
 * - Auth client: anon key + cookies (OAuth/sessions only)
 * - Database client: service role, no cookies (pure data access)
 * - NEVER mix auth operations with database operations
 * - NEVER expose these clients to client-side code
 * 
 * Reference: SERVER_ONLY_SUPABASE_ARCHITECTURE_PLAN.md Phase 2.2
 */

import 'server-only' // Ensures this module can never be imported in client code
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

// TypeScript workaround: createClient exists at runtime but has module resolution issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require('@supabase/supabase-js') as any

// Type the createClient function properly for usage
const createTypedClient = createClient as <
  Database = any,
  SchemaName extends string & keyof Database = 'public' extends keyof Database
    ? 'public'
    : string & keyof Database,
  Schema extends Database[SchemaName] = Database[SchemaName]
>(
  supabaseUrl: string,
  supabaseKey: string,
  options?: any
) => any

// ====================================
// DATABASE CLIENT (Service Role)
// ====================================

/**
 * Pure database client for server-side data operations
 * 
 * Features:
 * - Service role access (bypasses RLS)
 * - No session/cookie handling
 * - Use in repositories only
 * - Never use for auth operations
 */
export function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url) {
    throw new Error('SUPABASE_URL environment variable is required')
  }
  
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required')
  }
  
  // Pure database client - no session/cookie handling
  return createTypedClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  })
}

// ====================================
// AUTH CLIENT (DEPRECATED - Use createServerSupabaseClientNew)
// ====================================

// EXPERT RECOMMENDATION: All auth operations should use createServerSupabaseClientNew()
// with the clean getAll/setAll cookie adapter pattern. This eliminates SSR warnings
// and ensures consistent cookie handling across the application.

// ====================================
// UTILITY FUNCTIONS
// ====================================

/**
 * Type-safe wrapper for database operations
 * Ensures proper error handling and logging
 */
export async function withServiceClient<T>(
  operation: (client: ReturnType<typeof getServiceClient>) => Promise<T>
): Promise<T> {
  try {
    const client = getServiceClient()
    return await operation(client)
  } catch (error) {
    console.error('Database operation failed:', error)
    throw error
  }
}

// DEPRECATED: Use createServerSupabaseClientNew() directly for auth operations

// ====================================
// VALIDATION FUNCTIONS
// ====================================

/**
 * Validates that service client is properly configured
 * Use in health checks and startup validation
 */
export function validateServiceClient(): boolean {
  try {
    const client = getServiceClient()
    return !!client
  } catch {
    return false
  }
}

/**
 * Validates that auth client can be created
 * Use in health checks and startup validation
 */
export function validateAuthClientConfig(): boolean {
  try {
    const url = process.env.SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY
    return !!(url && anonKey)
  } catch {
    return false
  }
}

// ====================================
// EXPERT SECURITY NOTES
// ====================================

/*
CRITICAL SECURITY PRINCIPLES:

1. ✅ SEPARATION OF CONCERNS:
   - Auth client: OAuth, sessions, user management
   - Service client: Database queries, business logic
   - NEVER mix these responsibilities

2. ✅ KEY USAGE:
   - Anon key: Auth operations (sign in, sign out, sessions)
   - Service key: Database operations (CRUD, business logic)
   - Service key is over-privileged for auth operations

3. ✅ SERVER-ONLY ENFORCEMENT:
   - 'server-only' import ensures client-side import fails
   - No NEXT_PUBLIC_ environment variables
   - ESLint rules prevent client-side imports

4. ✅ ERROR HANDLING:
   - Clear error messages for missing configuration
   - Proper logging for debugging
   - Fail fast on misconfiguration

5. ✅ FUTURE-PROOF:
   - Type-safe with Database interface
   - Wrapper functions for consistent error handling
   - Easy to extend for additional client types

USAGE EXAMPLES:

// ✅ Database operations (in repositories)
const projects = await withServiceClient(async (client) => {
  return await client.from('projects').select('*')
})

// ✅ Auth operations (in auth routes)
const supabase = await createServerSupabaseClientNew()
const user = await supabase.auth.getUser()

// ❌ WRONG: Don't mix auth and database operations
// ❌ WRONG: Don't use service client for auth
// ❌ WRONG: Don't use auth client for database queries
*/
