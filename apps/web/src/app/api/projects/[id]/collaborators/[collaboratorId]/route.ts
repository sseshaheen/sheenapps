/**
 * API Route: Individual Project Collaborator
 * Update role or remove a collaborator via direct table access
 *
 * Security: RLS-first pattern
 * - RLS policies on project_collaborators enforce permissions
 * - Only project owner or admin can update/delete collaborators
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
    collaboratorId: string; // collaborator record id
  }>;
}

/**
 * PATCH /api/projects/[id]/collaborators/[collaboratorId]
 * Update a collaborator's role
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
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

    const { id: projectId, collaboratorId } = await params;
    const body = await req.json();
    const { role } = body;

    if (!role || !['admin', 'editor', 'viewer'].includes(role)) {
      return NextResponse.json(
        { error: 'Role must be admin, editor, or viewer' },
        { status: 400 }
      );
    }

    logger.info(`📝 Updating collaborator role`, {
      userId: user.id,
      projectId,
      collaboratorId,
      newRole: role
    });

    const supabase = await createServerSupabaseClientNew();

    // Update via direct table access - RLS enforces owner/admin permission
    const { data, error } = await (supabase as any)
      .from('project_collaborators')
      .update({
        role,
        updated_at: new Date().toISOString()
      })
      .eq('id', collaboratorId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      logger.error(`Failed to update collaborator role:`, error);

      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Collaborator not found' },
          { status: 404 }
        );
      }

      if (error.message.includes('permission') || error.message.includes('denied') || error.code === '42501') {
        return NextResponse.json(
          { error: 'You do not have permission to update this collaborator' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to update collaborator', details: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Collaborator not found' },
        { status: 404 }
      );
    }

    logger.info(`✅ Collaborator role updated`, {
      projectId,
      collaboratorId,
      role
    });

    return NextResponse.json({
      ok: true,
      data
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to update collaborator:', error);
    return NextResponse.json(
      { error: 'Failed to update collaborator', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]/collaborators/[collaboratorId]
 * Remove a collaborator from a project
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
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

    const { id: projectId, collaboratorId } = await params;

    logger.info(`🗑️ Removing collaborator`, {
      userId: user.id,
      projectId,
      collaboratorId
    });

    const supabase = await createServerSupabaseClientNew();

    // Delete via direct table access - RLS enforces owner/admin permission
    const { error } = await (supabase as any)
      .from('project_collaborators')
      .delete()
      .eq('id', collaboratorId)
      .eq('project_id', projectId);

    if (error) {
      logger.error(`Failed to remove collaborator:`, error);

      if (error.message.includes('permission') || error.message.includes('denied') || error.code === '42501') {
        return NextResponse.json(
          { error: 'You do not have permission to remove this collaborator' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to remove collaborator', details: error.message },
        { status: 500 }
      );
    }

    logger.info(`✅ Collaborator removed`, {
      projectId,
      collaboratorId
    });

    return NextResponse.json({
      ok: true
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to remove collaborator:', error);
    return NextResponse.json(
      { error: 'Failed to remove collaborator', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
