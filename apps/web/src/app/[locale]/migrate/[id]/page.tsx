/**
 * Migration Progress Page
 * Shows real-time migration progress with expert UX patterns
 */

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { MigrationProgressView } from '@/components/migration/migration-progress-view'
import { getNamespacedMessages } from '@/i18n/request'

export const metadata: Metadata = {
  title: 'Migration Progress | SheenApps',
  description: 'Track your website migration progress in real-time.',
}

interface MigrationProgressPageProps {
  params: Promise<{
    locale: string
    id: string
  }>
}

export default async function MigrationProgressPage(props: MigrationProgressPageProps) {
  const params = await props.params

  // Check if migration system is enabled
  if (!FEATURE_FLAGS.ENABLE_MIGRATION_SYSTEM) {
    notFound()
  }

  const migrationId = params.id

  // Basic validation of migration ID format
  if (!migrationId || typeof migrationId !== 'string' || migrationId.length < 10) {
    notFound()
  }

  // Load translations following the platform pattern
  const messages = await getNamespacedMessages(params.locale, [
    'migration',
    'common'
  ])

  const translations = {
    progress: {
      title: messages.migration?.progress?.title || 'Migration Progress',
      migrationId: messages.migration?.progress?.migrationId || 'Migration ID:',
      connection: {
        connected: messages.migration?.progress?.connection?.connected || 'Connected',
        connecting: messages.migration?.progress?.connection?.connecting || 'Connecting...',
        disconnected: messages.migration?.progress?.connection?.disconnected || 'Disconnected',
        error: messages.migration?.progress?.connection?.error || 'Connection Error',
        authRequired: messages.migration?.progress?.connection?.authRequired || 'Authentication Required',
        retryButton: messages.migration?.progress?.connection?.retryButton || 'Retry'
      },
      status: {
        pending: messages.migration?.progress?.status?.pending || 'pending',
        analyzing: messages.migration?.progress?.status?.analyzing || 'analyzing',
        processing: messages.migration?.progress?.status?.processing || 'processing',
        completed: messages.migration?.progress?.status?.completed || 'completed',
        failed: messages.migration?.progress?.status?.failed || 'failed',
        cancelled: messages.migration?.progress?.status?.cancelled || 'cancelled'
      },
      phases: {
        verification: {
          title: messages.migration?.progress?.phases?.verification?.title || 'Domain Verification',
          description: messages.migration?.progress?.phases?.verification?.description || 'Verifying domain ownership and accessibility'
        },
        analysis: {
          title: messages.migration?.progress?.phases?.analysis?.title || 'Website Analysis',
          description: messages.migration?.progress?.phases?.analysis?.description || 'Analyzing website structure and content'
        },
        planning: {
          title: messages.migration?.progress?.phases?.planning?.title || 'Migration Planning',
          description: messages.migration?.progress?.phases?.planning?.description || 'Creating migration strategy'
        },
        transformation: {
          title: messages.migration?.progress?.phases?.transformation?.title || 'Content Transformation',
          description: messages.migration?.progress?.phases?.transformation?.description || 'Converting content to modern Next.js components'
        },
        deployment: {
          title: messages.migration?.progress?.phases?.deployment?.title || 'Project Deployment',
          description: messages.migration?.progress?.phases?.deployment?.description || 'Finalizing project'
        },
        completed: {
          title: messages.migration?.progress?.phases?.completed?.title || 'Migration Complete',
          description: messages.migration?.progress?.phases?.completed?.description || 'Your website has been successfully migrated'
        }
      },
      phaseTimeline: {
        title: messages.migration?.progress?.phaseTimeline?.title || 'Migration Phases',
        complete: messages.migration?.progress?.phaseTimeline?.complete || 'Complete',
        inProgress: messages.migration?.progress?.phaseTimeline?.inProgress || 'In Progress'
      },
      actions: {
        viewProject: messages.migration?.progress?.actions?.viewProject || 'View Project in Builder',
        cancelMigration: messages.migration?.progress?.actions?.cancelMigration || 'Cancel Migration',
        startNew: messages.migration?.progress?.actions?.startNew || 'Start New Migration',
        copySupportId: messages.migration?.progress?.actions?.copySupportId || 'Copy'
      },
      messages: {
        initializing: messages.migration?.progress?.messages?.initializing || 'Initializing migration...',
        domainVerificationRequired: messages.migration?.progress?.messages?.domainVerificationRequired || 'Domain verification required',
        domainVerificationCompleted: messages.migration?.progress?.messages?.domainVerificationCompleted || 'Domain verification completed',
        migrationCompleted: messages.migration?.progress?.messages?.migrationCompleted || 'Migration completed successfully!',
        migrationFailed: messages.migration?.progress?.messages?.migrationFailed || 'Migration failed',
        migrationCancelled: messages.migration?.progress?.messages?.migrationCancelled || 'Migration cancelled',
        supportId: messages.migration?.progress?.messages?.supportId || 'Support ID:',
        projectNotReady: messages.migration?.progress?.messages?.projectNotReady || 'Project creation in progress',
        cancellationFailed: messages.migration?.progress?.messages?.cancellationFailed || 'Failed to cancel migration',
        cancellationSuccess: messages.migration?.progress?.messages?.cancellationSuccess || 'Migration cancelled'
      },
      eventLog: {
        title: messages.migration?.progress?.eventLog?.title || 'Event Log (Development)'
      }
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'An error occurred'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header spacer - semantic approach */}
      <div className="header-spacer" aria-hidden="true" />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <MigrationProgressView migrationId={migrationId} translations={translations} />
      </div>
    </div>
  )
}
