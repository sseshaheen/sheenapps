/**
 * Supabase Admin Client Helpers
 *
 * Provides utilities for admin operations with service role access.
 * Used by admin panel services for privileged database operations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AdminContext {
  requestId: string;
  timestamp: Date;
  supabase: SupabaseClient;
}

/**
 * Create an admin Supabase client for admin operations
 * Returns a SupabaseClient with service role access
 */
export function makeAdminCtx(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration for admin operations');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get a Supabase client with service role access for admin operations
 * Alternative name for makeAdminCtx for clarity
 */
export function getAdminSupabase(_adminCtx?: AdminContext): SupabaseClient {
  return makeAdminCtx();
}

/**
 * Convenience function alias
 */
export function createAdminSupabaseClient(): SupabaseClient {
  return makeAdminCtx();
}
