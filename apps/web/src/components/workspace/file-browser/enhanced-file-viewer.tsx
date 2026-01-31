/**
 * Enhanced File Viewer with Edit Capabilities
 *
 * Handles both read-only viewing and editing modes
 * Part of Phase 3 client integration preparation
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PermissionButton, useWorkspacePermissionContext } from '@/components/workspace/shared/permission-gate'
import { useWorkspacePermissions } from '@/hooks/workspace/use-workspace-permissions'
import { Icon } from '@/components/ui/icon'

interface FileContent {
  path: string
  content: string
  size: number
  mimeType: string
  encoding: string
  lastModified: string
  etag?: string
}

interface EnhancedFileViewerProps {
  file: FileContent | null
  projectId: string
  loading: boolean
  error: string | null
  onSave?: (path: string, content: string) => Promise<void>
  onClose?: () => void
  readOnly?: boolean
  className?: string
}

export function EnhancedFileViewer({
  file,
  projectId,
  loading,
  error,
  onSave,
  onClose,
  readOnly = false,
  className = ''
}: EnhancedFileViewerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const context = useWorkspacePermissionContext()
  const { permissions } = useWorkspacePermissions({ context })

  // Reset edit state when file changes
  useEffect(() => {
    if (file) {
      setEditContent(file.content)
      setIsEditing(false)
      setHasChanges(false)
      setSaveError(null)
    }
  }, [file])

  // Track content changes
  useEffect(() => {
    if (file && editContent !== file.content) {
      setHasChanges(true)
    } else {
      setHasChanges(false)
    }
  }, [editContent, file?.content])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      const textarea = textareaRef.current
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [editContent, isEditing])

  const handleEditToggle = useCallback(() => {
    if (isEditing && hasChanges) {
      // Show confirmation dialog for unsaved changes
      const confirm = window.confirm('You have unsaved changes. Are you sure you want to cancel editing?')
      if (!confirm) return
    }

    if (isEditing) {
      // Cancel editing - revert changes
      setEditContent(file?.content || '')
      setIsEditing(false)
      setHasChanges(false)
      setSaveError(null)
    } else {
      // Start editing
      setIsEditing(true)
      setSaveError(null)

      // Focus textarea after render
      setTimeout(() => {
        textareaRef.current?.focus()
      }, 100)
    }
  }, [isEditing, hasChanges, file?.content])

  const handleSave = useCallback(async () => {
    if (!file || !onSave || !hasChanges) return

    setSaving(true)
    setSaveError(null)

    try {
      await onSave(file.path, editContent)
      setIsEditing(false)
      setHasChanges(false)

      // Update file content (this would normally come from a refetch)
      // For now, we'll assume the parent component handles the refresh
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save file')
    } finally {
      setSaving(false)
    }
  }, [file, onSave, editContent, hasChanges])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isEditing) return

      // Ctrl+S / Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (hasChanges && !saving) {
          handleSave()
        }
      }

      // Escape to cancel
      if (e.key === 'Escape') {
        e.preventDefault()
        handleEditToggle()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, hasChanges, saving, handleSave, handleEditToggle])

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Loading file...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-center">
          <Icon name="x" className="h-8 w-8 text-red-500 mx-auto mb-2"  />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!file) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-center">
          <Icon name="file-text" className="h-12 w-12 text-muted-foreground mx-auto mb-2"  />
          <p className="text-muted-foreground">Select a file to view</p>
        </div>
      </div>
    )
  }

  const canEdit = permissions.canEditFiles && !readOnly
  const isTextFile = file.mimeType.startsWith('text/') ||
                    ['application/json', 'application/javascript'].includes(file.mimeType)

  return (
    <div className={`h-full flex flex-col bg-background ${className}`}>
      {/* File header */}
      <div className="flex-shrink-0 border-b border-border bg-card">
        <div className="flex items-center justify-between p-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-foreground truncate">
              {file.path}
            </h3>
            <p className="text-xs text-muted-foreground">
              {file.size.toLocaleString()} bytes • {file.mimeType}
              {file.lastModified && ` • Modified ${new Date(file.lastModified).toLocaleDateString()}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Save status */}
            {isEditing && hasChanges && (
              <span className="text-xs text-orange-600 font-medium">
                Unsaved changes
              </span>
            )}

            {/* Save button */}
            {isEditing && hasChanges && (
              <PermissionButton
                requires="canEditFiles"
                onClick={handleSave}
                disabled={saving}
                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
              >
                <Icon name="check" className="w-3 h-3"  />
                {saving ? 'Saving...' : 'Save'}
              </PermissionButton>
            )}

            {/* Edit toggle button */}
            {canEdit && isTextFile && (
              <PermissionButton
                requires="canEditFiles"
                onClick={handleEditToggle}
                className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 flex items-center gap-1"
              >
                {isEditing ? (
                  <>
                    <Icon name="x" className="w-3 h-3"  />
                    Cancel
                  </>
                ) : (
                  <>
                    <Icon name="edit" className="w-3 h-3"  />
                    Edit
                  </>
                )}
              </PermissionButton>
            )}

            {/* Close button */}
            {onClose && (
              <button
                onClick={onClose}
                className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded hover:bg-muted/80"
              >
                <Icon name="x" className="w-3 h-3"  />
              </button>
            )}
          </div>
        </div>

        {/* Save error */}
        {saveError && (
          <div className="px-3 pb-3">
            <div className="bg-red-50 border border-red-200 rounded-md p-2">
              <p className="text-xs text-red-600">{saveError}</p>
            </div>
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        {isEditing && (
          <div className="px-3 pb-3">
            <p className="text-xs text-muted-foreground">
              Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+S</kbd> to save,
              <kbd className="px-1 py-0.5 bg-muted rounded text-xs ml-1">Esc</kbd> to cancel
            </p>
          </div>
        )}
      </div>

      {/* File content */}
      <div className="flex-1 overflow-hidden">
        {!isTextFile ? (
          // Binary file preview
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Icon name="file-text" className="h-16 w-16 text-muted-foreground mx-auto mb-4"  />
              <p className="text-muted-foreground mb-2">Binary file cannot be displayed</p>
              <p className="text-xs text-muted-foreground">
                {file.mimeType} • {file.size.toLocaleString()} bytes
              </p>
            </div>
          </div>
        ) : isEditing ? (
          // Edit mode
          <div className="h-full p-0">
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-full resize-none border-0 bg-background text-foreground font-mono text-sm leading-relaxed p-4 focus:outline-none focus:ring-0"
              placeholder="File content..."
              spellCheck={false}
            />
          </div>
        ) : (
          // Read-only mode
          <div className="h-full overflow-auto">
            <pre className="text-sm leading-relaxed p-4 font-mono text-foreground bg-background">
              {file.content}
            </pre>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 border-t border-border bg-muted/30 px-3 py-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              {isEditing ? 'Editing' : 'Read-only'} mode
            </span>
            {file.encoding && (
              <span>
                {file.encoding.toUpperCase()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isTextFile && (
              <span>
                {file.content.split('\n').length} lines
              </span>
            )}
            <span>
              {file.size.toLocaleString()} bytes
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}