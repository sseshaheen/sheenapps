/**
 * Version Management Integration Example
 * Shows how to integrate all Phase 1 & 2 components into existing workspace
 * This is a reference implementation for the development team
 */

'use client'

import React, { useState } from 'react'
import { ProjectStatusBar } from './project-status-bar'
import { QuickPublishPanel } from './quick-publish-panel'
import { RollbackProgressPanel } from './rollback-progress-panel'
import { useVersionManagement, useFirstUserExperience } from '@/hooks/use-version-management'
import { useProjectStatus } from '@/hooks/use-project-status'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { logger } from '@/utils/logger'

interface VersionManagementIntegrationProps {
  projectId: string
  className?: string
}

/**
 * Complete integration example showing all components working together
 */
export function VersionManagementIntegration({
  projectId,
  className
}: VersionManagementIntegrationProps) {
  const { data: projectStatus } = useProjectStatus(projectId)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [rollbackData, setRollbackData] = useState<any>(null)
  
  // Version management with analytics and mobile optimization
  const {
    publish,
    rollback,
    canPublish,
    canRollback,
    isPublishing,
    isRollingBack,
    publishError,
    rollbackError
  } = useVersionManagement({
    projectId,
    onSuccess: (operation, result) => {
      logger.info(`✅ ${operation} completed successfully`, result)
      
      // Handle rollback result for progress tracking
      if (operation === 'rollback') {
        setRollbackData(result)
      }
    },
    onError: (operation, error) => {
      logger.error(`❌ ${operation} failed`, error)
    }
  })

  // First-user experience
  const { isFirstUser, shouldShowGuidance } = useFirstUserExperience(projectId)

  // Mock changes summary (in real implementation, this would come from your change detection system)
  const mockChangesSummary = {
    sections: [
      { type: 'modified' as const, name: 'Hero Section', description: 'Updated headline text' },
      { type: 'added' as const, name: 'Contact Form', description: 'New contact form component' },
      { type: 'modified' as const, name: 'Footer', description: 'Updated social links' }
    ],
    totalChanges: 3,
    lastModified: new Date()
  }

  // Handle publish action
  const handlePublish = async () => {
    try {
      await publish({
        comment: 'Published via workspace integration',
        source: 'workspace_header'
      })
    } catch (error) {
      // Error handling is managed by the hook
      logger.error('Publish action failed:', error)
    }
  }

  // Handle version history
  const handleVersionHistory = () => {
    setShowVersionHistory(true)
    // TODO: Open version history modal/panel
    logger.info('Opening version history for project:', projectId)
  }

  // Handle rollback (example)
  const handleRollback = async (targetVersionId: string) => {
    try {
      await rollback({
        targetVersionId,
        source: 'workspace_integration'
      })
    } catch (error) {
      // Error handling is managed by the hook
      logger.error('Rollback action failed:', error)
    }
  }

  return (
    <div className={className}>
      {/* Main Status Bar - Always visible in workspace header */}
      <ProjectStatusBar
        projectId={projectId}
        onPublishClick={handlePublish}
        onVersionHistoryClick={handleVersionHistory}
        className="mb-4"
      />

      {/* Quick Publish Panel - Contextual, appears when changes detected */}
      {projectStatus?.buildStatus === 'deployed' && mockChangesSummary.totalChanges > 0 && (
        <QuickPublishPanel
          projectId={projectId}
          changesSummary={mockChangesSummary}
          onPreview={() => {
            // Open preview in new tab
            if (projectStatus.previewUrl) {
              window.open(projectStatus.previewUrl, '_blank')
            }
          }}
          onPublishSuccess={() => {
            logger.info('✅ Quick publish completed successfully')
          }}
          className="mb-4"
        />
      )}

      {/* Rollback Progress Panel - Shows during rollback operations */}
      {(isRollingBack || rollbackData) && (
        <RollbackProgressPanel
          projectId={projectId}
          rollbackData={rollbackData}
          onComplete={() => {
            logger.info('✅ Rollback operation completed')
            setRollbackData(null)
          }}
          onError={(error) => {
            logger.error('❌ Rollback operation failed:', error)
          }}
          className="mb-4"
        />
      )}

      {/* Example Action Buttons - For demonstration */}
      <div className="flex gap-2 p-4 bg-gray-50 rounded-lg">
        <Button
          size="sm"
          onClick={handlePublish}
          disabled={!canPublish() || isPublishing}
        >
          <Icon name="external-link" className="w-3 h-3 mr-1" />
          {isPublishing ? 'Publishing...' : 'Publish'}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => handleRollback('ver_example_123')}
          disabled={!canRollback('ver_example_123') || isRollingBack}
        >
          <Icon name="rotate-ccw" className="w-3 h-3 mr-1" />
          {isRollingBack ? 'Rolling back...' : 'Rollback to v1.2.3'}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={handleVersionHistory}
        >
          <Icon name="clock" className="w-3 h-3 mr-1" />
          Version History
        </Button>
      </div>

      {/* Error Display */}
      {(publishError || rollbackError) && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <Icon name="alert-circle" className="w-4 h-4 text-red-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">
                Operation Failed
              </p>
              <p className="text-sm text-red-700">
                {publishError?.message || rollbackError?.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* First User Guidance */}
      {shouldShowGuidance && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Icon name="lightbulb" className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-blue-900 mb-1">
                Welcome to Version Management! 🎉
              </h4>
              <p className="text-sm text-blue-700 mb-2">
                Your project is ready to publish. Use the buttons above to make it live.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handlePublish}>
                  Publish My First Project
                </Button>
                <Button size="sm" variant="ghost">
                  Learn More
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Integration Notes for Developers */}
      <details className="mt-6 p-4 border rounded-lg">
        <summary className="cursor-pointer font-medium text-gray-700">
          🔧 Integration Notes for Developers
        </summary>
        <div className="mt-3 space-y-2 text-sm text-gray-600">
          <p><strong>Required Props:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><code>projectId</code> - Current project identifier</li>
            <li>React Query provider wrapping the component tree</li>
            <li>Auth store with user context</li>
          </ul>
          
          <p><strong>Environment Variables:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><code>NEXT_PUBLIC_WORKER_BASE_URL</code> - Worker API endpoint</li>
            <li><code>NEXT_PUBLIC_WORKER_SHARED_SECRET</code> - HMAC authentication</li>
            <li><code>NEXT_PUBLIC_USE_REALTIME_STATUS</code> - Optional Realtime fallback</li>
          </ul>

          <p><strong>Workspace Integration:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Add <code>ProjectStatusBar</code> to workspace header</li>
            <li>Show <code>QuickPublishPanel</code> when changes detected</li>
            <li>Display <code>RollbackProgressPanel</code> during rollback operations</li>
            <li>Use <code>useVersionManagement</code> hook for all operations</li>
          </ul>
        </div>
      </details>
    </div>
  )
}

/**
 * Minimal Integration Example - For simple use cases
 */
export function MinimalVersionManagement({ projectId }: { projectId: string }) {
  const { publish, canPublish, isPublishing } = useVersionManagement({ projectId })

  return (
    <div className="flex items-center gap-4">
      <ProjectStatusBar
        projectId={projectId}
        showActions={false}
        className="flex-1"
      />
      
      <Button
        size="sm"
        onClick={() => publish()}
        disabled={!canPublish() || isPublishing}
      >
        {isPublishing ? 'Publishing...' : 'Publish'}
      </Button>
    </div>
  )
}

/**
 * Header Integration Example - For workspace header
 */
export function WorkspaceHeaderWithVersions({
  projectId,
  projectName,
  onBack
}: {
  projectId: string
  projectName: string
  onBack: () => void
}) {
  return (
    <header className="flex items-center justify-between p-4 border-b bg-white">
      {/* Left: Back button and project name */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <Icon name="arrow-left" className="w-4 h-4" />
        </Button>
        <h1 className="font-medium text-gray-900">{projectName}</h1>
      </div>

      {/* Center: Version status */}
      <div className="flex-1 max-w-md mx-4">
        <ProjectStatusBar
          projectId={projectId}
          showActions={true}
        />
      </div>

      {/* Right: Additional actions */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm">
          <Icon name="share-2" className="w-4 h-4 mr-1" />
          Share
        </Button>
        <Button variant="ghost" size="sm">
          <Icon name="settings" className="w-4 h-4" />
        </Button>
      </div>
    </header>
  )
}