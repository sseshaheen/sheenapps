/**
 * Mobile Session Validation
 *
 * Validates access tokens from mobile apps against the inhouse_mobile_sessions table.
 * Uses auth.users (Supabase Auth) for user info - same users as web app.
 */

import 'server-only';
import { createHash } from 'crypto';
import { makeAdminCtx } from '@/lib/db/context';

export interface MobileSession {
  userId: string;
  email: string;
  displayName: string | null;
  projectIds: string[];
  deviceId: string;
  sessionId: string;
}

/**
 * Hash token for database lookup (matches worker implementation)
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Validate mobile access token against database
 *
 * Returns null if:
 * - Token is missing or malformed
 * - Session not found in database
 * - Session is expired or revoked
 */
export async function validateMobileSession(
  authHeader: string | null
): Promise<MobileSession | null> {
  // 1. Extract Bearer token
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  // 2. Hash token for lookup
  const tokenHash = hashToken(token);

  // 3. Query database using admin context (platform-level, not RLS-scoped)
  try {
    const ctx = makeAdminCtx();

    // Get session
    const { data: sessionData, error: sessionError } = await ctx.client
      .from('inhouse_mobile_sessions')
      .select('id, user_id, device_id, expires_at, revoked_at')
      .eq('access_token_hash', tokenHash)
      .is('revoked_at', null)
      .single();

    if (sessionError || !sessionData) {
      return null;
    }

    // 4. Check expiry
    if (new Date(sessionData.expires_at) < new Date()) {
      return null;
    }

    // 5. Get user from auth.users (Supabase Auth)
    // Note: We need to use raw SQL for auth.users since it's not in public schema
    const { data: userData, error: userError } = await ctx.client.rpc(
      'get_user_by_id',
      { user_id: sessionData.user_id }
    );

    // Fallback: If RPC doesn't exist, query directly (requires proper setup)
    let userEmail = '';
    let displayName: string | null = null;

    if (userData && !userError) {
      userEmail = userData.email || '';
      displayName = userData.raw_user_meta_data?.display_name ||
                    userData.raw_user_meta_data?.full_name || null;
    } else {
      // Direct query fallback - may not work depending on permissions
      // In production, you'd want the RPC function
      console.warn('[MobileSession] get_user_by_id RPC not available, using session user_id');
    }

    // 6. Update last_used_at (fire-and-forget)
    ctx.client
      .from('inhouse_mobile_sessions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', sessionData.id)
      .then(() => {})
      .catch(() => {}); // Ignore errors

    // 7. Get user's projects (uses owner_id per CLAUDE.md)
    const { data: projectsData } = await ctx.client
      .from('projects')
      .select('id')
      .eq('owner_id', sessionData.user_id)
      .order('updated_at', { ascending: false });

    return {
      userId: sessionData.user_id,
      email: userEmail,
      displayName,
      deviceId: sessionData.device_id,
      sessionId: sessionData.id,
      projectIds: (projectsData || []).map((p: { id: string }) => p.id),
    };
  } catch (error) {
    console.error('[MobileSession] Validation error:', error);
    return null;
  }
}

/**
 * Check if a user has access to a specific project
 */
export function hasProjectAccess(
  session: MobileSession,
  projectId: string
): boolean {
  if (session.projectIds.length === 0) {
    return false;
  }
  return session.projectIds.includes(projectId);
}
