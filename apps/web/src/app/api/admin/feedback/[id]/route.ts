/**
 * Admin Feedback Item API
 * Update individual feedback submissions
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { getServiceClient } from '@/lib/server/supabase-clients'

// Use service client for server-side database operations
const supabase = getServiceClient()

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

// UUID validation regex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // Validate route param is valid UUID
    if (!isUuid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid feedback id' },
        { status: 400 }
      )
    }

    // Verify admin auth
    const adminSession = await AdminAuthService.getAdminSession()
    if (!adminSession) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check permissions
    const hasPermission =
      (await AdminAuthService.hasPermission('feedback.admin')) ||
      adminSession.user.role === 'super_admin'

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      status,
      disposition,
      priority,
      assigned_to,
      labels,
      resolution_note,
      linked_item_id,
    } = body

    // ========================================================================
    // Input Validation - Allowlists
    // ========================================================================

    const VALID_STATUS = ['unprocessed', 'acknowledged', 'in_progress', 'resolved', 'closed'] as const
    const VALID_PRIORITY = ['low', 'medium', 'high', 'critical'] as const
    // MUST match DB constraint in 20260122_feedback_triage.sql
    const VALID_DISPOSITION = [
      'actionable',
      'duplicate',
      'not_actionable',
      'out_of_scope',
      'wont_fix',
      'needs_info',
      'already_exists',
    ] as const
    const LABEL_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i
    const MAX_LABELS = 20

    const isValidEnum = <T extends readonly string[]>(arr: T, v: unknown): v is T[number] =>
      typeof v === 'string' && (arr as readonly string[]).includes(v)

    if (status !== undefined && !isValidEnum(VALID_STATUS, status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${VALID_STATUS.join(', ')}` },
        { status: 400 }
      )
    }

    if (priority !== undefined && !isValidEnum(VALID_PRIORITY, priority)) {
      return NextResponse.json(
        { success: false, error: `Invalid priority. Must be one of: ${VALID_PRIORITY.join(', ')}` },
        { status: 400 }
      )
    }

    if (disposition !== undefined && !isValidEnum(VALID_DISPOSITION, disposition)) {
      return NextResponse.json(
        { success: false, error: `Invalid disposition. Must be one of: ${VALID_DISPOSITION.join(', ')}` },
        { status: 400 }
      )
    }

    if (labels !== undefined) {
      if (!Array.isArray(labels)) {
        return NextResponse.json(
          { success: false, error: 'labels must be an array' },
          { status: 400 }
        )
      }
      if (labels.length > MAX_LABELS) {
        return NextResponse.json(
          { success: false, error: `Max ${MAX_LABELS} labels allowed` },
          { status: 400 }
        )
      }
      for (const l of labels) {
        if (typeof l !== 'string' || !LABEL_RE.test(l)) {
          return NextResponse.json(
            { success: false, error: `Invalid label format: "${l}". Labels must be alphanumeric with optional underscores/dashes (1-32 chars)` },
            { status: 400 }
          )
        }
      }
    }

    // Validate resolution_note type (must be string or null)
    if (resolution_note !== undefined && resolution_note !== null) {
      if (typeof resolution_note !== 'string') {
        return NextResponse.json(
          { success: false, error: 'resolution_note must be a string or null' },
          { status: 400 }
        )
      }
      if (resolution_note.length > 5000) {
        return NextResponse.json(
          { success: false, error: 'Resolution note too long (max 5000 characters)' },
          { status: 400 }
        )
      }
    }

    // Validate assigned_to is a valid UUID (or null to unassign)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (assigned_to !== undefined && assigned_to !== null) {
      if (typeof assigned_to !== 'string' || !UUID_RE.test(assigned_to)) {
        return NextResponse.json(
          { success: false, error: 'Invalid assigned_to. Must be a valid UUID or null.' },
          { status: 400 }
        )
      }
    }

    // Get current feedback state for audit log
    const { data: currentFeedback, error: fetchError } = await supabase
      .from('feedback_submissions')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !currentFeedback) {
      return NextResponse.json(
        { success: false, error: 'Feedback not found' },
        { status: 404 }
      )
    }

    // Build update object
    const updates: Record<string, unknown> = {}
    const auditChanges: Array<{
      action: string
      old_value: unknown
      new_value: unknown
    }> = []

    if (status !== undefined && status !== currentFeedback.status) {
      updates.status = status
      auditChanges.push({
        action: 'status_change',
        old_value: currentFeedback.status,
        new_value: status,
      })
    }

    if (
      disposition !== undefined &&
      disposition !== currentFeedback.disposition
    ) {
      updates.disposition = disposition
      auditChanges.push({
        action: 'disposition_change',
        old_value: currentFeedback.disposition,
        new_value: disposition,
      })
    }

    if (priority !== undefined && priority !== currentFeedback.priority) {
      updates.priority = priority
      auditChanges.push({
        action: 'priority_change',
        old_value: currentFeedback.priority,
        new_value: priority,
      })
    }

    if (
      assigned_to !== undefined &&
      assigned_to !== currentFeedback.assigned_to
    ) {
      updates.assigned_to = assigned_to
      auditChanges.push({
        action: assigned_to ? 'assign' : 'unassign',
        old_value: currentFeedback.assigned_to,
        new_value: assigned_to,
      })
    }

    if (labels !== undefined) {
      const oldLabels = currentFeedback.labels || []
      const newLabels = labels

      // Find added and removed labels
      const added = newLabels.filter(
        (l: string) => !oldLabels.includes(l)
      )
      const removed = oldLabels.filter(
        (l: string) => !newLabels.includes(l)
      )

      if (added.length > 0 || removed.length > 0) {
        updates.labels = labels
        if (added.length > 0) {
          auditChanges.push({
            action: 'label_add',
            old_value: null,
            new_value: added,
          })
        }
        if (removed.length > 0) {
          auditChanges.push({
            action: 'label_remove',
            old_value: removed,
            new_value: null,
          })
        }
      }
    }

    if (
      resolution_note !== undefined &&
      resolution_note !== currentFeedback.resolution_note
    ) {
      updates.resolution_note = resolution_note
      auditChanges.push({
        action: 'resolution_added',
        old_value: currentFeedback.resolution_note,
        new_value: resolution_note,
      })
    }

    if (linked_item_id !== undefined) {
      updates.linked_item_id = linked_item_id
    }

    // Nothing to update
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No changes to apply',
      })
    }

    // Apply updates
    const { error: updateError } = await supabase
      .from('feedback_submissions')
      .update(updates)
      .eq('id', id)

    if (updateError) {
      console.error('Failed to update feedback:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update feedback' },
        { status: 500 }
      )
    }

    // Create audit log entries (batch insert for atomicity)
    if (auditChanges.length > 0) {
      // CRITICAL: Pass objects directly to JSONB columns, not JSON strings
      // Storing JSON strings inside JSONB makes querying painful
      const auditRows = auditChanges.map((change) => ({
        feedback_id: id,
        action: change.action,
        admin_id: adminSession.user.id,
        admin_email: adminSession.user.email,
        old_value: change.old_value ?? null,
        new_value: change.new_value ?? null,
      }))

      const { error: auditError } = await supabase.from('feedback_audit_log').insert(auditRows)

      if (auditError) {
        // Log the error but don't fail the entire request
        // The update was applied, but audit trail is incomplete
        console.error('Audit insert failed:', auditError)
        return NextResponse.json({
          success: true,
          message: 'Feedback updated (audit log failed - needs attention)',
          auditError: true,
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Feedback updated',
    })
  } catch (error) {
    console.error('Feedback update error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // Validate route param is valid UUID
    if (!isUuid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid feedback id' },
        { status: 400 }
      )
    }

    // Verify admin auth
    const adminSession = await AdminAuthService.getAdminSession()
    if (!adminSession) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: feedback, error } = await supabase
      .from('feedback_submissions')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !feedback) {
      return NextResponse.json(
        { success: false, error: 'Feedback not found' },
        { status: 404 }
      )
    }

    // Get audit log for this feedback
    const { data: auditLog } = await supabase
      .from('feedback_audit_log')
      .select('*')
      .eq('feedback_id', id)
      .order('created_at', { ascending: false })

    // Get notifications sent for this feedback
    const { data: notifications } = await supabase
      .from('feedback_notifications')
      .select('*')
      .eq('feedback_id', id)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      success: true,
      feedback,
      auditLog: auditLog || [],
      notifications: notifications || [],
    })
  } catch (error) {
    console.error('Feedback fetch error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
