'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { logger } from '@/utils/logger'
import { useState } from 'react'

interface VersionRestoreModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (options: RestoreOptions) => Promise<void>
  version: {
    versionId: string
    name?: string
    semver?: string
    createdAt: string
    comment?: string
    previewUrl?: string
    isPublished?: boolean
    status?: string
  }
  currentVersion: {
    versionId: string
    name?: string
    semver?: string
    isPublished?: boolean
  } | null
  isRestoring: boolean
  restoreError: Error | null
}

interface RestoreOptions {
  createBackup: boolean
  comment?: string
}

/**
 * Version Restore Confirmation Modal
 * Human-friendly UX for version restoration with clear impact explanation
 */
export function VersionRestoreModal({
  isOpen,
  onClose,
  onConfirm,
  version,
  currentVersion,
  isRestoring,
  restoreError
}: VersionRestoreModalProps) {
  const [createBackup, setCreateBackup] = useState(true)
  const [comment, setComment] = useState('')

  if (!isOpen) return null

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return 'Less than an hour ago'
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    return date.toLocaleDateString()
  }

  const getVersionLabel = (v: typeof version) => {
    return v.name || v.semver || `Version from ${formatDate(v.createdAt)}`
  }

  const getCurrentVersionLabel = (v: typeof currentVersion) => {
    if (!v) return 'No current version'
    return v.name || v.semver || `Version ${v.versionId.slice(-8)}`
  }

  const getImpactDescription = () => {
    return "This will create a new version with the content from the selected version. Your live site won't change - you'll need to publish the new version separately when ready."
  }

  const canPreview = !!version.previewUrl

  const handleConfirm = async () => {
    const options: RestoreOptions = {
      createBackup,
      comment: comment.trim() || undefined
    }

    logger.info('Confirming version restore:', {
      versionId: version.versionId,
      options
    })

    await onConfirm(options)
  }

  const handlePreview = () => {
    if (version.previewUrl) {
      window.open(version.previewUrl, '_blank', 'noopener,noreferrer')
      logger.info('Opened version preview before restore:', version.previewUrl)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70"
        onClick={!isRestoring ? onClose : undefined}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl w-full max-w-lg">
          {/* Header */}
          <div className="p-6 border-b border-gray-600">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  Restore Version
                </h2>
                <p className="text-sm text-gray-400">
                  {getVersionLabel(version)}
                </p>
              </div>
              {!isRestoring && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="w-8 h-8 p-0 text-gray-400 hover:text-white"
                >
                  <Icon name="x" className="w-5 h-5" />
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Current vs Target Comparison */}
            <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-medium text-white mb-3">What's changing</h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Current:</span>
                  <span className="text-white">
                    {getCurrentVersionLabel(currentVersion)}
                  </span>
                </div>

                <div className="flex items-center justify-center">
                  <Icon name="arrow-down" className="w-4 h-4 text-blue-400" />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Restore to:</span>
                  <span className="text-blue-400 font-medium">
                    {getVersionLabel(version)}
                  </span>
                </div>
              </div>
            </div>

            {/* Impact Description */}
            <div className="mb-6">
              <div className="p-4 rounded-lg border-l-4 bg-blue-500/10 border-blue-500 text-blue-100">
                <div className="flex items-start gap-3">
                  <Icon name="info" className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium mb-1">What will happen</p>
                    <p className="text-sm opacity-90">
                      {getImpactDescription()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Comment for Restored Version */}
            <div className="mb-6">
              <label htmlFor="restore-comment" className="block text-sm font-medium text-white mb-2">
                Comment for restored version (optional)
              </label>
              <textarea
                id="restore-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g., Restored from working version before recent changes"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={2}
                disabled={isRestoring}
                maxLength={200}
              />
              <div className="text-xs text-gray-400 mt-1">
                This helps you remember why you restored this version
              </div>
            </div>

            {/* Backup Option */}
            {/* <div className="mb-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createBackup}
                  onChange={(e) => setCreateBackup(e.target.checked)}
                  className="mt-1"
                  disabled={isRestoring}
                />
                <div>
                  <div className="text-sm font-medium text-white">
                    Create backup of current version first
                  </div>
                  <div className="text-xs text-gray-400">
                    Recommended: Preserve your current work before restoring
                  </div>
                </div>
              </label>
            </div> */}

            {/* Error Display */}
            {restoreError && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <Icon name="alert-circle" className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-red-400 mb-1">
                      Restore failed
                    </div>
                    <div className="text-sm text-red-300">
                      {restoreError.message}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-600 bg-gray-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {canPreview && !isRestoring && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePreview}
                    className="text-gray-400 hover:text-white"
                  >
                    <Icon name="eye" className="w-4 h-4 mr-2" />
                    Preview First
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={isRestoring}
                  className="text-gray-400 hover:text-white"
                >
                  Cancel
                </Button>

                <Button
                  onClick={handleConfirm}
                  disabled={isRestoring}
                  className="min-w-[140px] bg-blue-600 hover:bg-blue-700"
                >
                  {isRestoring ? (
                    <>
                      <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <Icon name="undo-2" className="w-4 h-4 mr-2" />
                      Create Restored Version
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
