'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { useProjectStatus } from '@/hooks/use-project-status'
import { useVersionHistory } from '@/hooks/use-version-history'
import { useVersionManagement } from '@/hooks/use-version-management'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { useEffect, useState } from 'react'
import { VersionPublishModal } from './version-publish-modal'
import { VersionRestoreModal } from './version-restore-modal'
import { useQueryClient } from '@tanstack/react-query'

interface VersionHistoryModalProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
}

/**
 * Version History Modal - Shows complete version history with restore/rollback options
 */
export function VersionHistoryModal({ projectId, isOpen, onClose }: VersionHistoryModalProps) {
  const [restoreModal, setRestoreModal] = useState<{
    isOpen: boolean;
    version: any | null;
  }>({ isOpen: false, version: null })

  const [publishModal, setPublishModal] = useState<{
    isOpen: boolean;
    version: any | null;
  }>({ isOpen: false, version: null })

  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set())

  // State for inline note editing
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteValue, setNoteValue] = useState<string>('')
  const [savingNote, setSavingNote] = useState(false)

  // Get query client for cache invalidation
  const queryClient = useQueryClient()

  // Live relative time updates - update every minute when modal is open
  const [currentTime, setCurrentTime] = useState(Date.now())

  useEffect(() => {
    if (!isOpen) return

    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [isOpen])

  const { data: versionHistory, isLoading, error } = useVersionHistory(projectId, {
    limit: 50, // Show more versions in the modal
    state: 'all',
    includePatches: true, // Show all versions including patches in history
    enabled: isOpen // Only fetch when modal is open
  })

  const { data: projectStatus } = useProjectStatus(projectId)

  const {
    restore,
    isRestoring,
    restoreError,
    canRestore,
    publish,
    isPublishing,
    publishError,
    canPublish
  } = useVersionManagement({
    projectId,
    onSuccess: (operation, result) => {
      if (operation === 'restore') {
        logger.info('✅ Version restored successfully:', result)
        setRestoreModal({ isOpen: false, version: null })
        // Close the main modal after successful restore
        onClose()
      } else if (operation === 'publish') {
        logger.info('✅ Version published successfully:', result)
        setPublishModal({ isOpen: false, version: null })
      }
    },
    onError: (operation, error) => {
      logger.error(`❌ ${operation} failed:`, error)
      // Keep restore modal open to show error
    }
  })

  // Early return must be after ALL Hook calls
  if (!isOpen) return null

  const getRelativeTimeInfo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffWeeks = Math.floor(diffDays / 7)
    const diffMonths = Math.floor(diffDays / 30)

    let text: string
    let isRecent = false
    let isVeryRecent = false

    if (diffMinutes < 1) {
      text = 'Just now'
      isVeryRecent = true
      isRecent = true
    } else if (diffMinutes < 60) {
      text = `${diffMinutes} min ago`
      isVeryRecent = diffMinutes < 5
      isRecent = true
    } else if (diffHours < 24) {
      text = `${diffHours}h ago`
      isRecent = diffHours < 6
    } else if (diffDays < 7) {
      text = `${diffDays}d ago`
    } else if (diffWeeks < 4) {
      text = `${diffWeeks}w ago`
    } else if (diffMonths < 12) {
      text = `${diffMonths}mo ago`
    } else {
      // For very old dates, show the actual date
      text = date.toLocaleDateString()
    }

    return { text, isRecent, isVeryRecent }
  }

  const getAbsoluteTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    })
  }

  const getVersionIcon = (version: any) => {
    if (version.isPublished) return '✅' // Check mark for live/published
    if (version.canPublish && version.hasArtifact) return '📦' // Package for ready to publish
    if (version.status === 'building') return '🏗️' // Construction for building (legacy)
    if (!version.hasArtifact) return '⚠️' // Warning for no artifact
    if (version.status === 'failed') return '⚠️' // Warning for failed (legacy)
    return '⚪' // Empty circle for unknown
  }

  const getVersionStatus = (version: any) => {
    if (version.isPublished) return 'Live on your site'
    if (version.canPublish && version.hasArtifact) return 'Ready to publish'
    if (!version.hasArtifact) return 'Artifact missing'
    if (version.status === 'building') return 'Creating...' // Legacy support
    if (version.status === 'failed') return 'Build failed' // Legacy support
    return 'Available'
  }

  const handleRestoreVersion = (version: any) => {
    logger.info('Opening restore modal for version:', version.id || version.versionId)
    setRestoreModal({ isOpen: true, version })
  }

  const handleConfirmRestore = async (options: { createBackup: boolean; comment?: string }) => {
    if (!restoreModal.version) return

    try {
      await restore({
        sourceVersionId: restoreModal.version.id || restoreModal.version.versionId,
        createBackup: options.createBackup,
        comment: options.comment,
        source: 'version_history_modal'
      })
    } catch (error) {
      logger.error('Restore failed:', error)
      // Error will be handled by the hook and shown in the modal
    }
  }

  const handlePreviewVersion = (version: any) => {
    if (version.previewUrl) {
      window.open(version.previewUrl, '_blank', 'noopener,noreferrer')
      logger.info('Opened version preview:', version.previewUrl)
    } else {
      logger.warn('No preview URL available for version:', version)
    }
  }

  const handlePublishVersion = (version: any) => {
    logger.info('Opening publish modal for version:', version.id || version.versionId)
    setPublishModal({ isOpen: true, version })
  }

  const handleConfirmPublish = async (comment: string) => {
    if (!publishModal.version) return

    try {
      await publish({
        versionId: publishModal.version.id || publishModal.version.versionId,
        comment,
        source: 'version_history_modal'
      })
    } catch (error) {
      logger.error('Publish failed:', error)
    }
  }

  const toggleDescription = (versionId: string) => {
    const newExpanded = new Set(expandedDescriptions)
    if (newExpanded.has(versionId)) {
      newExpanded.delete(versionId)
    } else {
      newExpanded.add(versionId)
    }
    setExpandedDescriptions(newExpanded)
  }

  const handleEditNote = (version: any) => {
    const versionId = version.id || version.versionId
    setEditingNote(versionId)
    setNoteValue(version.userComment || version.comment || '')
  }

  const handleSaveNote = async (version: any) => {
    const versionId = version.id || version.versionId
    setSavingNote(true)

    try {
      // Call API to save the note (using POST for better compatibility)
      // Follows RESTful convention: /api/projects/[id]/version-notes/[versionId]
      const response = await fetch(`/api/projects/${projectId}/version-notes/${versionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          note: noteValue
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save note')
      }

      // Don't mutate the version object directly - let React Query refetch
      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['version-history', projectId] })

      setEditingNote(null)
      setNoteValue('')
      logger.info('✅ Note saved successfully for version:', versionId)
    } catch (error) {
      logger.error('❌ Failed to save note:', error)
      // Could show an error toast here
    } finally {
      setSavingNote(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingNote(null)
    setNoteValue('')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-3 md:p-4">
        <div className="bg-gray-800 border-0 sm:border border-gray-600 rounded-t-2xl sm:rounded-lg shadow-xl w-full max-w-full sm:max-w-lg md:max-w-2xl h-[95vh] sm:max-h-[85vh] md:max-h-[80vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="relative shrink-0 p-4 sm:p-4 md:p-6 border-b border-gray-600">
            {/* Mobile: Handle bar for bottom sheet feel */}
            <div className="sm:hidden w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4"></div>
            
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg sm:text-lg md:text-xl font-semibold text-white">Version History</h2>
                <p className="text-sm text-gray-400 mt-1 hidden sm:block">
                  View and manage all versions of your project
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-10 w-10 sm:h-10 sm:w-10 md:min-h-[44px] md:min-w-[44px] p-0 text-gray-400 hover:text-white flex-shrink-0"
              >
                <Icon name="x" className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="p-3 sm:p-4 md:p-6 text-center">
                <Icon name="loader-2" className="w-5 h-5 sm:w-6 sm:h-6 animate-spin mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-400">Loading version history...</p>
              </div>
            )}

            {error && (
              <div className="p-3 sm:p-4 md:p-6 text-center">
                <Icon name="alert-circle" className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-2 text-red-400" />
                <p className="text-sm text-red-400 mb-2">Failed to load version history</p>
                <p className="text-xs text-gray-500">{error.message}</p>
              </div>
            )}

            {versionHistory?.versions && versionHistory.versions.length === 0 && (
              <div className="p-4 sm:p-6 text-center">
                <Icon name="archive" className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-3 text-gray-500" />
                <p className="text-sm sm:text-base text-gray-400 mb-2">No versions found</p>
                <p className="text-xs text-gray-500">
                  Versions will appear here after your first successful build
                </p>
              </div>
            )}

            {versionHistory?.versions && versionHistory.versions.length > 0 && (
              <div className="p-3 sm:p-0 space-y-3 sm:space-y-0 sm:divide-y sm:divide-gray-700">
                {versionHistory.versions.map((version: any, index: number) => {
                  const versionId = version.id || version.versionId || `version-${index}-${version.createdAt}`
                  const isExpanded = expandedDescriptions.has(versionId)
                  const hasLongDescription = version.description && version.description.length > 150

                  return (
                  <div
                    key={versionId}
                    className={cn(
                      // Mobile: Card design with borders and rounded corners  
                      "bg-gray-800/60 sm:bg-transparent border border-gray-600/50 sm:border-0 rounded-xl sm:rounded-none p-4 sm:p-3 md:p-4",
                      "hover:bg-gray-700/50 transition-all duration-200",
                      // Published version styling
                      version.isPublished && "ring-2 ring-green-500/30 bg-green-900/5 sm:bg-green-900/10 sm:border-l-4 sm:border-green-500"
                    )}
                  >
                    {/* Mobile-first card design */}
                    <div className="space-y-4">
                      {/* Header: Status + Version + Badges */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Status Icon - Larger on mobile */}
                          <div className="flex-shrink-0">
                            <span className="text-2xl sm:text-lg">{getVersionIcon(version)}</span>
                          </div>

                          {/* Version Info */}
                          <div>
                            <h3 className="text-lg sm:text-base font-semibold text-white">
                              {version.name || version.semver || `Version ${index + 1}`}
                            </h3>
                            <p className="text-sm text-gray-400">{getVersionStatus(version)}</p>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex items-center gap-2">
                          {index === 0 && (
                            <span className="px-2 py-1 text-xs bg-blue-600 text-blue-100 rounded font-medium">
                              Latest
                            </span>
                          )}
                          {version.isPublished && (
                            <span className="px-2 py-1 text-xs bg-gradient-to-r from-green-600 to-green-500 text-green-100 rounded font-semibold">
                              ✅ Live
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Time info */}
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <time
                          dateTime={version.createdAt}
                          title={getAbsoluteTime(version.createdAt)}
                          className={`cursor-help hover:text-gray-300 transition-colors ${
                            getRelativeTimeInfo(version.createdAt).isVeryRecent
                              ? 'text-green-400 font-medium'
                              : getRelativeTimeInfo(version.createdAt).isRecent
                                ? 'text-blue-400'
                                : ''
                          }`}
                          aria-label={`Created ${getAbsoluteTime(version.createdAt)}`}
                        >
                          {getRelativeTimeInfo(version.createdAt).text}
                        </time>
                        {getRelativeTimeInfo(version.createdAt).isVeryRecent && (
                          <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse"
                                title="Very recent version" />
                        )}
                      </div>

                      {/* Description */}
                      {version.description && (
                        <div>
                          <p className="text-sm text-gray-300 leading-relaxed">
                            {isExpanded || !hasLongDescription
                              ? version.description
                              : `${version.description.slice(0, 100)}...`}
                          </p>
                          {hasLongDescription && (
                            <button
                              onClick={() => toggleDescription(versionId)}
                              className="text-xs text-blue-400 hover:text-blue-300 mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded font-medium"
                            >
                              {isExpanded ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </div>
                      )}

                        {/* User Comment / Note Section */}
                        <div className="mb-2">
                          {editingNote === versionId ? (
                            // Edit mode
                            <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-600">
                              <div className="mb-2">
                                <textarea
                                  value={noteValue}
                                  onChange={(e) => setNoteValue(e.target.value)}
                                  placeholder="Add a note about this version (e.g., what changed, why, etc.)"
                                  className={cn(
                                    "w-full px-3 py-2 text-sm rounded-md",
                                    "bg-gray-900 border border-gray-700",
                                    "text-white placeholder-gray-500",
                                    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                                    "resize-none min-h-[44px]"
                                  )}
                                  rows={2}
                                  maxLength={500}
                                  disabled={savingNote}
                                  autoFocus
                                  inputMode="text"
                                  autoCapitalize="sentences"
                                  style={{ fontSize: '16px' }} // Prevents zoom on iOS
                                />
                                <div className="flex justify-between items-center mt-1">
                                  <span className="text-xs text-gray-500">
                                    {noteValue.length}/500 characters
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col sm:flex-row justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleCancelEdit}
                                  disabled={savingNote}
                                  className="text-xs min-h-[44px] flex items-center justify-center"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleSaveNote(version)}
                                  disabled={savingNote || !noteValue.trim()}
                                  className="text-xs min-h-[44px] bg-blue-600 hover:bg-blue-700 flex items-center justify-center"
                                >
                                  {savingNote ? (
                                    <>
                                      <Icon name="loader-2" className="w-3 h-3 mr-1 animate-spin" />
                                      <span className="hidden sm:inline">Saving...</span>
                                      <span className="sm:hidden">Save</span>
                                    </>
                                  ) : (
                                    <>
                                      <Icon name="save" className="w-3 h-3 mr-1" />
                                      <span className="hidden sm:inline">Save Note</span>
                                      <span className="sm:hidden">Save</span>
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            // Display mode
                            <>
                              {(version.userComment || version.comment) ? (
                                <div className="group flex items-start gap-2">
                                  <p className="text-sm text-gray-300 italic flex-1">
                                    💬 "{version.userComment || version.comment}"
                                  </p>
                                  <button
                                    onClick={() => handleEditNote(version)}
                                    className="opacity-50 group-hover:opacity-100 transition-opacity duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded"
                                    title="Edit note"
                                    type="button"
                                  >
                                    <Icon name="edit" className="w-3 h-3 text-gray-400 hover:text-white" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleEditNote(version)}
                                  className="text-xs text-gray-500 hover:text-blue-400 flex items-center gap-1 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 rounded"
                                  type="button"
                                >
                                  <Icon name="edit-3" className="w-3 h-3" />
                                  Add a note
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        {/* <div className="text-xs text-gray-500">
                          ID: {version.versionId}
                        </div> */}

                      {/* Actions - Mobile-first design */}
                      <div className="pt-3 border-t border-gray-600 sm:border-0 sm:pt-0">
                        <div className="grid grid-cols-1 sm:flex sm:justify-end gap-2">
                          {/* Primary action - Make Live or Restore */}
                          {!version.isPublished && version.canPublish && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handlePublishVersion(version)}
                              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-medium min-h-[48px] sm:min-h-auto text-sm"
                              title="Make this version live on your site"
                            >
                              <Icon name="rocket" className="w-4 h-4 mr-2" />
                              Make Live
                            </Button>
                          )}

                          {index > 0 && !(!version.isPublished && version.canPublish) && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleRestoreVersion(version)}
                              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-medium min-h-[48px] sm:min-h-auto text-sm"
                            >
                              <Icon name="undo-2" className="w-4 h-4 mr-2" />
                              Restore
                            </Button>
                          )}

                          {/* Secondary action - Preview */}
                          {version.previewUrl && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePreviewVersion(version)}
                              className="w-full sm:w-auto text-gray-300 border-gray-600 hover:bg-gray-700 min-h-[48px] sm:min-h-auto text-sm"
                            >
                              <Icon name="eye" className="w-4 h-4 mr-2" />
                              Preview
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>

          {/* Footer - Mobile optimized */}
          <div className="shrink-0 p-4 border-t border-gray-600 bg-gray-800/80 sm:bg-gray-800">
            <div className="text-center sm:flex sm:items-center sm:justify-between">
              <span className="text-sm sm:text-xs text-gray-400 font-medium">
                {versionHistory?.versions?.length || 0} version{versionHistory?.versions?.length !== 1 ? 's' : ''} total
              </span>
              <span className="hidden sm:inline text-xs text-gray-500">
                Showing {Math.min(50, versionHistory?.versions?.length || 0)} most recent
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Version Restore Modal */}
      <VersionRestoreModal
        isOpen={restoreModal.isOpen}
        onClose={() => setRestoreModal({ isOpen: false, version: null })}
        onConfirm={handleConfirmRestore}
        version={{
          versionId: restoreModal.version?.id || restoreModal.version?.versionId || '',
          name: restoreModal.version?.name,
          semver: restoreModal.version?.semver,
          createdAt: restoreModal.version?.createdAt || '',
          comment: restoreModal.version?.comment || restoreModal.version?.userComment,
          previewUrl: restoreModal.version?.previewUrl,
          isPublished: restoreModal.version?.isPublished,
          status: restoreModal.version?.status
        }}
        currentVersion={versionHistory?.versions?.[0] ? {
          versionId: projectStatus?.currentVersionId || versionHistory.versions[0].id,
          name: versionHistory.versions[0].name,
          semver: versionHistory.versions[0].semver,
          isPublished: versionHistory.versions[0].isPublished || false
        } : null}
        isRestoring={isRestoring}
        restoreError={restoreError}
      />

      {/* Version Publish Modal */}
      {publishModal.isOpen && publishModal.version && (
        <VersionPublishModal
          isOpen={publishModal.isOpen}
          onClose={() => setPublishModal({ isOpen: false, version: null })}
          onConfirm={handleConfirmPublish}
          version={{
            versionId: publishModal.version?.id || publishModal.version?.versionId || '',
            name: publishModal.version?.name,
            semver: publishModal.version?.semver,
            createdAt: publishModal.version?.createdAt || '',
            description: publishModal.version?.description,
            previewUrl: publishModal.version?.previewUrl
          }}
          isPublishing={isPublishing}
          publishError={publishError}
        />
      )}
    </>
  )
}
