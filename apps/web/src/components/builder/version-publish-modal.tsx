'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface VersionPublishModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (comment: string) => Promise<void>
  version: {
    versionId: string
    name?: string
    semver?: string
    createdAt: string
    description?: string
    previewUrl?: string
  }
  isPublishing: boolean
  publishError: Error | null
}

/**
 * Modal for publishing a specific version with optional comment
 */
export function VersionPublishModal({
  isOpen,
  onClose,
  onConfirm,
  version,
  isPublishing,
  publishError
}: VersionPublishModalProps) {
  const [comment, setComment] = useState('')
  const [isFormDirty, setIsFormDirty] = useState(false)

  if (!isOpen) return null

  const handleConfirm = async () => {
    setIsFormDirty(true)
    await onConfirm(comment)
  }

  const handleClose = () => {
    if (isFormDirty && comment && !isPublishing) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to close?')
      if (!confirmed) return
    }
    setComment('')
    setIsFormDirty(false)
    onClose()
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl w-full max-w-md">
          {/* Header */}
          <div className="p-6 border-b border-gray-600">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Icon name="rocket" className="w-5 h-5 text-green-400" />
                  Publish Version
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Make this version live on your domains
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                disabled={isPublishing}
                className="w-8 h-8 p-0 text-gray-400 hover:text-white"
              >
                <Icon name="x" className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Version Info */}
            <div className="bg-gray-700/50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">Version</span>
                <span className="text-white font-mono">
                  {version.name || version.semver || version.versionId.slice(-8)}
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">Created</span>
                <span className="text-xs text-gray-400">
                  {formatDate(version.createdAt)}
                </span>
              </div>
              {version.description && (
                <div className="mt-3 pt-3 border-t border-gray-600">
                  <span className="text-sm font-medium text-gray-300 block mb-1">Description</span>
                  <p className="text-xs text-gray-400 line-clamp-2">
                    {version.description}
                  </p>
                </div>
              )}
              {version.previewUrl && (
                <div className="mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs bg-gray-600/50 hover:bg-gray-600 text-gray-200 hover:text-white border border-gray-500"
                    onClick={() => window.open(version.previewUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <Icon name="eye" className="w-3 h-3 mr-1" />
                    Preview this version
                  </Button>
                </div>
              )}
            </div>

            {/* Comment Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Add a comment (optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value)
                  setIsFormDirty(true)
                }}
                placeholder="E.g., 'Launch new pricing page' or 'Holiday sale updates'"
                className={cn(
                  "w-full px-3 py-2 rounded-md",
                  "bg-gray-700 border border-gray-600",
                  "text-white placeholder-gray-400",
                  "focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent",
                  "resize-none"
                )}
                rows={3}
                disabled={isPublishing}
                maxLength={500}
              />
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-500">
                  This comment will be visible in version history
                </span>
                <span className={cn(
                  "text-xs",
                  comment.length > 450 ? "text-yellow-400" : "text-gray-500"
                )}>
                  {comment.length}/500
                </span>
              </div>
            </div>

            {/* Error Display */}
            {publishError && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <Icon name="alert-circle" className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-400 font-medium">Publish failed</p>
                    <p className="text-xs text-red-400/80 mt-1">
                      {publishError.message}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Warning */}
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-400 font-medium">Goes Live Immediately</p>
                  <p className="text-xs text-yellow-400/80 mt-1">
                    Publishing will make this version immediately live on all your domains.
                    Any currently published version will be replaced. You can always make another version live later.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-600 bg-gray-800">
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={isPublishing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isPublishing}
                className={cn(
                  "min-w-[120px]",
                  isPublishing
                    ? "bg-green-600/50"
                    : "bg-green-600 hover:bg-green-700"
                )}
              >
                {isPublishing ? (
                  <>
                    <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Icon name="rocket" className="w-4 h-4 mr-2" />
                    Publish Now
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
