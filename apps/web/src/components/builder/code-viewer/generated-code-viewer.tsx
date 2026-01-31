/**
 * Generated Code Viewer Component
 *
 * Main container that orchestrates the code viewing experience.
 * Similar to Lovable/Replit with split-pane layout.
 *
 * NOTE: Uses custom resizable implementation instead of react-resizable-panels
 * to ensure reliable pixel-based minimum widths that don't collapse to slivers.
 */

'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { FileTreePanel } from './file-tree-panel'
import { CodeDisplayPanel } from './code-display-panel'
import { useCodeViewerStore } from '@/store/code-viewer-store'
import { useCodeFiles, useCodeFile } from '@/hooks/use-code-files'
import { PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, X, FolderTree, GripVertical } from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

// ============================================================================
// Document RTL Detection
// ============================================================================

// Check document direction (not container direction) for icon orientation
// This respects user's mental model even when we force LTR on the code viewer
function useIsDocumentRTL() {
  const [isRTL, setIsRTL] = useState(false)

  useEffect(() => {
    setIsRTL(document.documentElement.dir === 'rtl')
  }, [])

  return isRTL
}

// ============================================================================
// Mobile Detection Hook
// ============================================================================

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }

    // Check on mount
    checkMobile()

    // Listen for resize
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [breakpoint])

  return isMobile
}

// ============================================================================
// Types
// ============================================================================

export interface GeneratedCodeViewerProps {
  projectId: string
  buildId?: string
  className?: string
  onFileSelect?: (path: string) => void
  onCodeAccept?: () => void
}

// ============================================================================
// Constants
// ============================================================================

const ZIP_CLIENT_LIMIT = 50 * 1024 * 1024 // 50MB

// File tree panel pixel constraints (for container-aware sizing)
const FILE_TREE_MIN_PX = 260
const FILE_TREE_MAX_PX = 520

// ============================================================================
// Toggle Button
// ============================================================================

interface ToggleButtonProps {
  isOpen: boolean
  onToggle: () => void
}

function FileTreeToggle({ isOpen, onToggle }: ToggleButtonProps) {
  const t = useTranslations('builder.codeViewer.panel')
  const isDocumentRTL = useIsDocumentRTL()

  // NOTE: Sidebar stays on left even in RTL (like VS Code/IDE convention).
  // Code is LTR, so keeping sidebar on left maintains visual consistency.
  // BUT: Icons follow document direction for user's mental model.

  // In LTR: PanelLeft means "panel on left side"
  // In RTL: PanelRight means "panel on start side" (which is right in RTL)
  const OpenIcon = isDocumentRTL ? PanelRight : PanelLeft
  const CloseIcon = isDocumentRTL ? PanelRightClose : PanelLeftClose

  return (
    <button
      onClick={onToggle}
      className={cn(
        'absolute top-3 z-10 p-1.5 rounded-md',
        'bg-background border border-border shadow-sm',
        'hover:bg-muted transition-colors',
        isOpen ? 'left-[calc(var(--file-tree-width,280px)+8px)]' : 'left-2'
      )}
      title={isOpen ? t('hideFileTree') : t('showFileTree')}
      aria-label={isOpen ? t('hideFileTree') : t('showFileTree')}
    >
      {isOpen ? (
        <CloseIcon className="w-4 h-4 text-muted-foreground" />
      ) : (
        <OpenIcon className="w-4 h-4 text-muted-foreground" />
      )}
    </button>
  )
}

// ============================================================================
// Mobile File Tree Sheet
// ============================================================================

interface MobileFileTreeSheetProps {
  isOpen: boolean
  onClose: () => void
  isLoading?: boolean
}

function MobileFileTreeSheet({ isOpen, onClose, isLoading }: MobileFileTreeSheetProps) {
  const t = useTranslations('builder.codeViewer')

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet - stays on left even in RTL (IDE convention) */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw]',
          'bg-background border-r border-border shadow-xl',
          'transform transition-transform duration-200 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Sheet Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('fileTree.title')}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
            aria-label={t('panel.closeFileTree')}
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* File Tree */}
        <div className="h-[calc(100%-49px)] overflow-auto">
          <FileTreePanel onCollapse={onClose} isLoading={isLoading} />
        </div>
      </div>
    </>
  )
}

// ============================================================================
// Mobile Toggle Button
// ============================================================================

interface MobileToggleProps {
  onOpen: () => void
}

function MobileFileTreeButton({ onOpen }: MobileToggleProps) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        'absolute top-3 left-2 z-10 p-2 rounded-md',
        'bg-background border border-border shadow-sm',
        'hover:bg-muted transition-colors',
        'md:hidden' // Only show on mobile
      )}
      title="Open file tree"
      aria-label="Open file tree"
    >
      <FolderTree className="w-4 h-4 text-muted-foreground" />
    </button>
  )
}

// ============================================================================
// Custom Resize Handle
// ============================================================================

interface ResizeHandleProps {
  onResize: (deltaX: number) => void
}

function ResizeHandle({ onResize }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    startXRef.current = e.clientX
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current
      startXRef.current = e.clientX
      onResize(deltaX)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, onResize])

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        'w-1.5 flex-shrink-0 flex items-center justify-center',
        'bg-border hover:bg-primary/50 transition-colors',
        'cursor-col-resize select-none',
        isDragging && 'bg-primary'
      )}
    >
      <GripVertical className="w-3 h-3 text-muted-foreground opacity-0 hover:opacity-100 transition-opacity" />
    </div>
  )
}

// ============================================================================
// Generated Code Viewer Component
// ============================================================================

export function GeneratedCodeViewer({
  projectId,
  buildId,
  className,
  onFileSelect,
  onCodeAccept,
}: GeneratedCodeViewerProps) {
  const isMobile = useIsMobile()
  const [mobileFileTreeOpen, setMobileFileTreeOpen] = useState(false)

  // Store state
  const isFileTreeOpen = useCodeViewerStore((state) => state.isFileTreeOpen)
  const fileTreeWidth = useCodeViewerStore((state) => state.fileTreeWidth)
  const toggleFileTree = useCodeViewerStore((state) => state.toggleFileTree)
  const setFileTreeWidth = useCodeViewerStore((state) => state.setFileTreeWidth)
  const setProjectId = useCodeViewerStore((state) => state.setProjectId)
  const setBuildId = useCodeViewerStore((state) => state.setBuildId)
  const filesByPath = useCodeViewerStore((state) => state.filesByPath)
  const activeFile = useCodeViewerStore((state) => state.activeFile)

  // Close mobile sheet when file is selected
  useEffect(() => {
    if (activeFile && mobileFileTreeOpen) {
      setMobileFileTreeOpen(false)
    }
  }, [activeFile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Set context on mount
  useEffect(() => {
    setProjectId(projectId)
    if (buildId) {
      setBuildId(buildId)
    }
  }, [projectId, buildId, setProjectId, setBuildId])

  // Debug logging for buildId availability
  useEffect(() => {
    console.log('[GeneratedCodeViewer] Props:', {
      projectId: projectId?.slice(0, 8),
      buildId: buildId?.slice(0, 8) || 'undefined',
      hasBuildId: !!buildId
    })
  }, [projectId, buildId])

  // Fetch files from API (updates store automatically via useCodeFiles hook)
  const { isLoading: isLoadingFiles, error: filesError } = useCodeFiles(projectId, buildId)

  // Fetch content for the active file (updates store automatically)
  const { isLoading: isLoadingFile } = useCodeFile(projectId, activeFile || '', buildId)

  // Notify parent when file is selected
  useEffect(() => {
    if (activeFile && onFileSelect) {
      onFileSelect(activeFile)
    }
  }, [activeFile, onFileSelect])

  // Copy all files to clipboard
  const handleCopyAll = useCallback(async () => {
    const files = Object.values(filesByPath)
    if (files.length === 0) return

    const text = files
      .map((file) => `// ${file.path}\n${file.content}`)
      .join('\n\n' + '='.repeat(80) + '\n\n')

    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('Failed to copy all files:', err)
    }
  }, [filesByPath])

  // Download all files as ZIP
  const handleDownload = useCallback(async () => {
    const allFiles = Object.values(filesByPath)
    if (allFiles.length === 0) return

    // Filter out files with empty content (e.g., closed tabs have content cleared)
    const filesWithContent = allFiles.filter((file) => file.content && file.content.length > 0)

    if (filesWithContent.length === 0) {
      console.warn('No files with content available for download')
      return
    }

    if (filesWithContent.length < allFiles.length) {
      console.warn(
        `ZIP will include ${filesWithContent.length} of ${allFiles.length} files. ` +
          `${allFiles.length - filesWithContent.length} files were closed and content was cleared.`
      )
    }

    const totalSize = filesWithContent.reduce((sum, file) => sum + file.size, 0)

    if (totalSize > ZIP_CLIENT_LIMIT) {
      // Large project: would use server-side in production
      console.warn('Project too large for client-side ZIP, would use server')
      return
    }

    try {
      const zip = new JSZip()

      for (const file of filesWithContent) {
        zip.file(file.path, file.content)
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, `project-${projectId}.zip`)
    } catch (err) {
      console.error('Failed to create ZIP:', err)
    }
  }, [filesByPath, projectId])

  // Handle resize - directly update width in pixels (no percentage conversion)
  const handleResize = useCallback(
    (deltaX: number) => {
      // In RTL documents, the visual drag direction is opposite to the delta
      // Even though we force dir="ltr" on the container, the user's mental model
      // of "drag right to expand" is inverted in RTL contexts
      const isDocumentRTL = document.documentElement.dir === 'rtl'
      const effectiveDelta = isDocumentRTL ? -deltaX : deltaX

      const newWidth = fileTreeWidth + effectiveDelta
      // Clamp to min/max - these are enforced in the store too
      const clampedWidth = Math.max(FILE_TREE_MIN_PX, Math.min(newWidth, FILE_TREE_MAX_PX))
      setFileTreeWidth(clampedWidth)
    },
    [fileTreeWidth, setFileTreeWidth]
  )

  // Mobile layout: full-width code panel with slide-out file tree
  // NOTE: Force LTR direction for consistent code editor behavior
  if (isMobile) {
    return (
      <div dir="ltr" className={cn('relative h-full w-full min-w-0 overflow-hidden', className)}>
        {/* Mobile File Tree Button */}
        <MobileFileTreeButton onOpen={() => setMobileFileTreeOpen(true)} />

        {/* Mobile File Tree Sheet */}
        <MobileFileTreeSheet
          isOpen={mobileFileTreeOpen}
          onClose={() => setMobileFileTreeOpen(false)}
          isLoading={isLoadingFiles}
        />

        {/* Full-width Code Display */}
        <CodeDisplayPanel
          onCopyAll={handleCopyAll}
          onDownload={handleDownload}
          isLoadingFile={isLoadingFile}
          className="pl-12" // Offset for the toggle button
        />
      </div>
    )
  }

  // Desktop layout: custom resizable split panes
  // Uses explicit pixel widths instead of percentages for reliable minimum sizing
  // NOTE: Force LTR direction to prevent RTL from flipping the panel layout
  return (
    <div
      dir="ltr"
      className={cn('relative h-full w-full overflow-hidden flex', className)}
      style={
        {
          '--file-tree-width': `${fileTreeWidth}px`,
        } as React.CSSProperties
      }
    >
      {/* File Tree Panel - explicit pixel width */}
      {isFileTreeOpen && (
        <>
          <div
            className="h-full flex-shrink-0 overflow-hidden"
            style={{ width: fileTreeWidth }}
          >
            <FileTreePanel onCollapse={toggleFileTree} isLoading={isLoadingFiles} />
          </div>
          <ResizeHandle onResize={handleResize} />
        </>
      )}

      {/* Code Display Panel - fills remaining space */}
      <div className="relative h-full flex-1 min-w-0 overflow-hidden">
        {/* Toggle button when file tree is hidden */}
        {!isFileTreeOpen && (
          <FileTreeToggle isOpen={isFileTreeOpen} onToggle={toggleFileTree} />
        )}
        <CodeDisplayPanel
          onCopyAll={handleCopyAll}
          onDownload={handleDownload}
          isLoadingFile={isLoadingFile}
        />
      </div>
    </div>
  )
}

export default GeneratedCodeViewer
