/**
 * Admin Feedback Bulk Actions API
 * Apply changes to multiple feedback submissions at once
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { getServiceClient } from '@/lib/server/supabase-clients'

// Use service client for server-side database operations
const supabase = getServiceClient()

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_ACTIONS = [
  'status_change',
  'priority_change',
  'label_add',
  'label_remove',
  'assign',
] as const

type BulkAction = (typeof VALID_ACTIONS)[number]

interface BulkRequest {
  ids: string[]
  action: BulkAction
  value: unknown
}

export async function POST(request: NextRequest) {
  try {
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

    const body: BulkRequest = await request.json()
    const { ids, action, value } = body

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No IDs provided' },
        { status: 400 }
      )
    }

    if (ids.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Maximum 100 items per bulk action' },
        { status: 400 }
      )
    }

    // Validate all IDs are valid UUIDs
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!ids.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
      return NextResponse.json(
        { success: false, error: 'All ids must be valid UUIDs' },
        { status: 400 }
      )
    }

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      )
    }

    // Build update based on action
    let updates: Record<string, unknown> = {}
    const auditAction = action

    switch (action) {
      case 'status_change':
        if (
          !['unprocessed', 'acknowledged', 'in_progress', 'resolved', 'closed'].includes(
            value as string
          )
        ) {
          return NextResponse.json(
            { success: false, error: 'Invalid status value' },
            { status: 400 }
          )
        }
        updates = { status: value }
        break

      case 'priority_change':
        if (!['low', 'medium', 'high', 'critical'].includes(value as string)) {
          return NextResponse.json(
            { success: false, error: 'Invalid priority value' },
            { status: 400 }
          )
        }
        updates = { priority: value }
        break

      case 'assign': {
        // Validate UUID format (or null to unassign)
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        if (value !== null && value !== undefined && value !== '') {
          if (typeof value !== 'string' || !UUID_RE.test(value)) {
            return NextResponse.json(
              { success: false, error: 'Invalid assigned_to. Must be a valid UUID or null.' },
              { status: 400 }
            )
          }
        }
        updates = { assigned_to: value || null }
        break
      }

      case 'label_add':
      case 'label_remove':
        // For labels, we need to fetch current state and modify
        // This is handled per-item below
        break

      default:
        return NextResponse.json(
          { success: false, error: 'Unsupported action' },
          { status: 400 }
        )
    }

    // Handle label operations via atomic database function
    if (action === 'label_add' || action === 'label_remove') {
      const labelValue = String(value || '').trim()
      if (!labelValue) {
        return NextResponse.json(
          { success: false, error: 'Label value required' },
          { status: 400 }
        )
      }

      // Enforce same label format as PATCH route - alphanumeric with _ or -, 1-32 chars
      const LABEL_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i
      if (!LABEL_RE.test(labelValue)) {
        return NextResponse.json(
          { success: false, error: 'Invalid label format. Use 1-32 chars, alphanumeric, _ or -' },
          { status: 400 }
        )
      }

      const { data, error: rpcError } = await supabase.rpc(
        'bulk_update_feedback_labels',
        {
          p_ids: ids,
          p_action: action,
          p_label: labelValue,
          p_admin_id: adminSession.user.id,
          p_admin_email: adminSession.user.email,
        }
      )

      if (rpcError) {
        console.error('bulk_update_feedback_labels failed:', rpcError)
        return NextResponse.json(
          { success: false, error: 'Bulk label update failed' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: `Bulk ${action} applied`,
        affected: data ?? 0,
      })
    }

    // Handle non-label bulk operations (status_change, priority_change, assign)
    // Regular bulk update
    const { error: updateError } = await supabase
        .from('feedback_submissions')
        .update(updates)
        .in('id', ids)

      if (updateError) {
        console.error('Bulk update failed:', updateError)
        return NextResponse.json(
          { success: false, error: 'Bulk update failed' },
          { status: 500 }
        )
      }

      // Create audit logs for all affected items
      // CRITICAL: Pass objects directly to JSONB columns, not JSON strings
      const auditEntries = ids.map((id) => ({
        feedback_id: id,
        action: auditAction,
        admin_id: adminSession.user.id,
        admin_email: adminSession.user.email,
        old_value: null, // For bulk operations, we don't track old values
        new_value: value ?? null,
        comment: `Bulk ${action} operation on ${ids.length} items`,
      }))

      const { error: auditError } = await supabase.from('feedback_audit_log').insert(auditEntries)

      if (auditError) {
        // Log the error but don't fail the entire request
        // The update was applied, but audit trail is incomplete
        console.error('Bulk audit insert failed:', auditError)
        return NextResponse.json({
          success: true,
          message: `Bulk ${action} applied to ${ids.length} items (audit log failed - needs attention)`,
          affected: ids.length,
          auditError: true,
        })
      }

    return NextResponse.json({
      success: true,
      message: `Bulk ${action} applied to ${ids.length} items`,
      affected: ids.length,
    })
  } catch (error) {
    console.error('Bulk action error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
