/**
 * API Route: Project Collaborators
 * Manages collaborators for a project via Supabase RPC functions
 *
 * Security: RLS-first pattern - RPC functions enforce permissions
 * - get_project_collaborators checks read access
 * - invite_collaborator checks owner/admin permission
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/server/supabase';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import { logger } from '@/utils/logger';
import { assertSameOrigin } from '@/lib/security/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    id: string; // project id
  }>;
}

/**
 * GET /api/projects/[id]/collaborators
 * List all collaborators for a project using RPC
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: projectId } = await params;

    logger.info(`📋 Fetching collaborators for project ${projectId}`, {
      userId: user.id,
      projectId
    });

    const supabase = await createServerSupabaseClientNew();

    // Call RPC function - RLS enforces read access
    const { data, error } = await supabase.rpc('get_project_collaborators', {
      p_project_id: projectId
    });

    if (error) {
      logger.error(`Failed to fetch collaborators:`, error);
      return NextResponse.json(
        { error: 'Failed to fetch collaborators', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        collaborators: data || []
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to fetch collaborators:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collaborators', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/collaborators
 * Invite a collaborator to a project using RPC
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    // CSRF protection for cookie-authenticated mutations
    assertSameOrigin(req);

    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: projectId } = await params;
    const body = await req.json();
    const { email, role } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!role || !['admin', 'editor', 'viewer'].includes(role)) {
      return NextResponse.json(
        { error: 'Role must be admin, editor, or viewer' },
        { status: 400 }
      );
    }

    logger.info(`📨 Inviting collaborator to project ${projectId}`, {
      userId: user.id,
      projectId,
      email,
      role
    });

    const supabase = await createServerSupabaseClientNew();

    // Call RPC function - RLS enforces owner/admin permission
    const { data, error } = await supabase.rpc('invite_collaborator', {
      p_project_id: projectId,
      p_email: email,
      p_role: role
    });

    if (error) {
      logger.error(`Failed to invite collaborator:`, error);

      // Handle specific error cases
      if (error.message.includes('permission') || error.message.includes('denied')) {
        return NextResponse.json(
          { error: 'You do not have permission to invite collaborators' },
          { status: 403 }
        );
      }

      if (error.message.includes('already') || error.message.includes('exists')) {
        return NextResponse.json(
          { error: 'This email is already a collaborator on this project' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to invite collaborator', details: error.message },
        { status: 500 }
      );
    }

    logger.info(`✅ Collaborator invited successfully`, {
      projectId,
      email,
      role
    });

    return NextResponse.json({
      ok: true,
      data: data
    }, {
      status: 201,
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to invite collaborator:', error);
    return NextResponse.json(
      { error: 'Failed to invite collaborator', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
