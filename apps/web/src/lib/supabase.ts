/**
 * 🚨 DEPRECATED - Use Specific Modules Instead
 * 
 * This file has been split for Next.js 15 server-only compliance:
 * 
 * 🖥️  For server-side code: import from '@/lib/supabase-server'  
 *     - API routes, server actions, RSC
 *     - Available: createServerSupabaseClientNew, createServerSupabaseClientReadOnly
 * 
 * 🛡️  For middleware code: import from '@/lib/supabase-mw'
 *     - Edge runtime compatible middleware client
 *     - Available: createMiddlewareClient
 * 
 * 🌐  For client-side code: import from '@/lib/supabase-client'  
 *     - Browser components, hooks, client services
 *     - Available: createClient (conditional based on ENABLE_SERVER_AUTH)
 * 
 * 🛡️  For admin operations: import from '@/lib/server/supabase-clients'
 *     - Service role operations
 *     - Available: getServiceClient, withServiceClient
 */

// Re-export the conditional client for backwards compatibility
export { createClient } from './supabase-client'

// Throw helpful errors for moved functions
export const createServerSupabaseClientNew = () => {
  throw new Error('Import createServerSupabaseClientNew from @/lib/supabase-server (server-only module)')
}

export const createServerSupabaseClientReadOnly = () => {
  throw new Error('Import createServerSupabaseClientReadOnly from @/lib/supabase-server (server-only module)')
}

export const createMiddlewareClient = () => {
  throw new Error('Import createMiddlewareClient from @/lib/supabase-mw (edge-safe module)')
}

export const createServerSupabaseClient = () => {
  throw new Error('Legacy adapter removed. Use createServerSupabaseClientNew from @/lib/supabase-server')
}