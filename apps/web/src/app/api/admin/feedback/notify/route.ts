/**
 * Admin Feedback Notification API
 * Close the loop by notifying users when their feedback is addressed
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { getServiceClient } from '@/lib/server/supabase-clients'

// Use service client for server-side database operations
const supabase = getServiceClient()

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOTIFICATION_TYPES = [
  'acknowledged',
  'in_progress',
  'feature_shipped',
  'bug_fixed',
  'resolved',
  'needs_info',
] as const

type NotificationType = (typeof NOTIFICATION_TYPES)[number]

const NOTIFICATION_SUBJECTS: Record<NotificationType, string> = {
  acknowledged: 'We received your feedback',
  in_progress: "We're working on it",
  feature_shipped: 'Your requested feature is live!',
  bug_fixed: 'The bug you reported has been fixed!',
  resolved: 'Your feedback has been addressed',
  needs_info: 'We need more details about your feedback',
}

interface NotifyRequest {
  feedbackId: string
  type: NotificationType
  message: string
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

    const body: NotifyRequest = await request.json()
    const { feedbackId, type, message } = body

    // Validate input
    if (!feedbackId || !type || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (!NOTIFICATION_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid notification type' },
        { status: 400 }
      )
    }

    if (message.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Message too long (max 1000 characters)' },
        { status: 400 }
      )
    }

    // Get the feedback submission
    const { data: feedback, error: fetchError } = await supabase
      .from('feedback_submissions')
      .select('id, user_id, anonymous_id, type, value, text_comment, created_at')
      .eq('id', feedbackId)
      .single()

    if (fetchError || !feedback) {
      return NextResponse.json(
        { success: false, error: 'Feedback not found' },
        { status: 404 }
      )
    }

    // Check if user can be notified
    if (!feedback.user_id) {
      // Anonymous feedback - can't send email notification
      // Could potentially use in-app notification if anonymous_id is tracked
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot notify anonymous user - no user_id available',
        },
        { status: 400 }
      )
    }

    // Get user email
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      feedback.user_id
    )

    if (userError || !userData?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Could not retrieve user email' },
        { status: 500 }
      )
    }

    const userEmail = userData.user.email
    const subject = NOTIFICATION_SUBJECTS[type]

    // Create notification record
    const { data: notification, error: notifyError } = await supabase
      .from('feedback_notifications')
      .insert({
        feedback_id: feedbackId,
        user_id: feedback.user_id,
        email: userEmail,
        notification_type: type,
        subject,
        message,
        channel: 'email',
        status: 'pending',
        created_by: adminSession.user.id,
      })
      .select()
      .single()

    if (notifyError) {
      console.error('Failed to create notification record:', notifyError)
      return NextResponse.json(
        { success: false, error: 'Failed to create notification' },
        { status: 500 }
      )
    }

    // Send the email (using existing notification service pattern)
    try {
      const emailSent = await sendCloseTheLoopEmail({
        to: userEmail,
        subject,
        type,
        message,
        originalFeedback: {
          type: feedback.type,
          value: feedback.value,
          comment: feedback.text_comment,
          date: feedback.created_at,
        },
      })

      // Update notification status
      await supabase
        .from('feedback_notifications')
        .update({
          status: emailSent ? 'sent' : 'failed',
          sent_at: emailSent ? new Date().toISOString() : null,
          failed_at: emailSent ? null : new Date().toISOString(),
          failure_reason: emailSent ? null : 'Email delivery failed',
        })
        .eq('id', notification.id)

      if (!emailSent) {
        return NextResponse.json(
          { success: false, error: 'Failed to send email' },
          { status: 500 }
        )
      }
    } catch (emailError) {
      console.error('Email send error:', emailError)

      // Update notification as failed
      await supabase
        .from('feedback_notifications')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          failure_reason:
            emailError instanceof Error ? emailError.message : 'Unknown error',
        })
        .eq('id', notification.id)

      return NextResponse.json(
        { success: false, error: 'Failed to send notification email' },
        { status: 500 }
      )
    }

    // Update feedback with notified timestamp
    await supabase
      .from('feedback_submissions')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', feedbackId)

    // Create audit log entry
    // CRITICAL: Pass objects directly to JSONB columns, not JSON strings
    await supabase.from('feedback_audit_log').insert({
      feedback_id: feedbackId,
      action: 'notification_sent',
      admin_id: adminSession.user.id,
      admin_email: adminSession.user.email,
      old_value: null,
      new_value: { type, message_preview: message.slice(0, 100) },
    })

    return NextResponse.json({
      success: true,
      message: 'Notification sent successfully',
      notificationId: notification.id,
    })
  } catch (error) {
    console.error('Notification error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Send close-the-loop email to user
 * Uses the app's existing email infrastructure
 */
async function sendCloseTheLoopEmail(params: {
  to: string
  subject: string
  type: NotificationType
  message: string
  originalFeedback: {
    type: string
    value: unknown
    comment: string | null
    date: string
  }
}): Promise<boolean> {
  // Integration point for existing email service
  // This follows the pattern from NotificationService in payment/notification-service.ts

  const { to, subject, type, message, originalFeedback } = params

  // For now, log the email that would be sent
  // In production, integrate with actual email service (SendGrid, Resend, etc.)
  console.log('[CLOSE_THE_LOOP_EMAIL]', {
    to,
    subject,
    type,
    message,
    originalFeedback: {
      type: originalFeedback.type,
      date: originalFeedback.date,
    },
  })

  // Check if email service is configured
  const emailServiceUrl = process.env.EMAIL_SERVICE_URL
  const emailApiKey = process.env.EMAIL_API_KEY

  if (!emailServiceUrl || !emailApiKey) {
    // Log for development, but mark as "sent" for testing purposes
    console.warn(
      '[CLOSE_THE_LOOP] Email service not configured, skipping actual send'
    )
    // Return true in development to allow testing the flow
    return process.env.NODE_ENV !== 'production'
  }

  try {
    // Actual email sending logic would go here
    // Example with a generic email API:
    const response = await fetch(emailServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${emailApiKey}`,
      },
      body: JSON.stringify({
        to,
        subject: `[SheenappsAI] ${subject}`,
        template: 'feedback-resolution',
        data: {
          notification_type: type,
          message,
          original_feedback_type: originalFeedback.type,
          original_feedback_date: new Date(
            originalFeedback.date
          ).toLocaleDateString(),
          original_comment: originalFeedback.comment,
        },
      }),
    })

    return response.ok
  } catch (error) {
    console.error('Email service error:', error)
    return false
  }
}

// GET endpoint to list notifications for a feedback item
export async function GET(request: NextRequest) {
  try {
    const adminSession = await AdminAuthService.getAdminSession()
    if (!adminSession) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const feedbackId = searchParams.get('feedbackId')

    if (!feedbackId) {
      return NextResponse.json(
        { success: false, error: 'feedbackId required' },
        { status: 400 }
      )
    }

    const { data: notifications, error } = await supabase
      .from('feedback_notifications')
      .select('*')
      .eq('feedback_id', feedbackId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch notifications' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      notifications: notifications || [],
    })
  } catch (error) {
    console.error('Notifications fetch error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
