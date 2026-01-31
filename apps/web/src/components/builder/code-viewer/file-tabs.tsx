/**
 * File Tabs Component
 *
 * Horizontal tabs for open files with close buttons.
 */

'use client'

import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { X, FileCode, FileJson, FileText, File, Loader2 } from 'lucide-react'
import { useCodeViewerStore, type FileStatus } from '@/store/code-viewer-store'

// ============================================================================
// Types
// ============================================================================

interface FileTabsProps {
  className?: string
}

// ============================================================================
// Icon Mapping
// ============================================================================

const FILE_ICONS: Record<string, typeof FileCode> = {
  tsx: FileCode,
  ts: FileCode,
  jsx: FileCode,
  js: FileCode,
  json: FileJson,
  md: FileText,
  css: FileText,
  html: FileText,
  default: File,
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return FILE_ICONS[ext] || FILE_ICONS.default
}

// ============================================================================
// Status Dot
// ============================================================================

function StatusDot({ status, isModified }: { status?: FileStatus; isModified?: boolean }) {
  if (status === 'streaming') {
    return <Loader2 className="w-2.5 h-2.5 text-blue-500 animate-spin" />
  }

  if (status === 'error') {
    return <span className="w-2 h-2 rounded-full bg-red-500" title="Error" />
  }

  if (status === 'new') {
    return <span className="w-2 h-2 rounded-full bg-green-500" title="New file" />
  }

  if (isModified || status === 'modified') {
    return <span className="w-2 h-2 rounded-full bg-orange-500" title="Modified" />
  }

  return null
}

// ============================================================================
// File Tab Component
// ============================================================================

interface FileTabProps {
  path: string
  name: string
  isActive: boolean
  status?: FileStatus
  isModified?: boolean
  onSelect: () => void
  onClose: (e: React.MouseEvent) => void
}

function FileTab({
  path,
  name,
  isActive,
  status,
  isModified,
  onSelect,
  onClose,
}: FileTabProps) {
  const tabRef = useRef<HTMLDivElement>(null)
  const FileIcon = getFileIcon(name)

  // Scroll active tab into view
  useEffect(() => {
    if (isActive && tabRef.current) {
      tabRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [isActive])

  // Handle keyboard activation for the tab
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }

  return (
    <div
      ref={tabRef}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        'group flex items-center gap-1.5 h-9 px-3 text-sm cursor-pointer',
        'border-e border-border flex-shrink-0', // border-e = end border, works in RTL
        'transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        isActive
          ? 'bg-background text-foreground border-b-2 border-b-primary'
          : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
      title={path}
      aria-selected={isActive}
    >
      {/* Status indicator or icon */}
      {status === 'streaming' ? (
        <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />
      ) : (
        <FileIcon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
      )}

      {/* File name */}
      <span className="truncate max-w-[120px]" dir="auto">
        {name}
      </span>

      {/* Status dot */}
      <StatusDot status={status} isModified={isModified} />

      {/* Close button - now a proper button element */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose(e)
        }}
        className={cn(
          'p-0.5 rounded hover:bg-foreground/10 ms-1', // ms = margin-start, works in RTL
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          isActive && 'opacity-60 hover:opacity-100'
        )}
        aria-label={`Close ${name}`}
        tabIndex={-1}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ============================================================================
// File Tabs Component
// ============================================================================

export function FileTabs({ className }: FileTabsProps) {
  const openTabs = useCodeViewerStore((state) => state.openTabs)
  const activeFile = useCodeViewerStore((state) => state.activeFile)
  const filesByPath = useCodeViewerStore((state) => state.filesByPath)
  const setActiveFile = useCodeViewerStore((state) => state.setActiveFile)
  const closeFile = useCodeViewerStore((state) => state.closeFile)

  const handleClose = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    closeFile(path)
  }

  if (openTabs.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'flex-shrink-0 flex items-end overflow-x-auto',
        'border-b border-border bg-muted/30',
        'scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent',
        className
      )}
      role="tablist"
      aria-label="Open files"
    >
      {openTabs.map((path) => {
        const file = filesByPath[path]
        const name = path.split('/').pop() || path

        return (
          <FileTab
            key={path}
            path={path}
            name={name}
            isActive={path === activeFile}
            status={file?.status}
            isModified={file?.isModified}
            onSelect={() => setActiveFile(path)}
            onClose={(e) => handleClose(e, path)}
          />
        )
      })}
    </div>
  )
}
