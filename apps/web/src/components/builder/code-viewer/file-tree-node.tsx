/**
 * File Tree Node Component
 *
 * Recursive component for rendering file tree nodes.
 * Supports directories and files with status indicators.
 */

'use client'

import { useState, memo, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  File,
  FileType,
  Loader2,
} from 'lucide-react'
import type { FileTreeNode as FileTreeNodeType, FileStatus } from '@/store/code-viewer-store'

// ============================================================================
// Types
// ============================================================================

interface FileTreeNodeProps {
  node: FileTreeNodeType
  depth?: number
  activeFile?: string | null
  onSelect: (path: string) => void
}

// ============================================================================
// Icon Mapping
// ============================================================================

const FILE_ICONS: Record<string, typeof FileCode> = {
  tsx: FileCode,
  ts: FileType,
  jsx: FileCode,
  js: FileCode,
  json: FileJson,
  md: FileText,
  mdx: FileText,
  css: FileText,
  scss: FileText,
  html: FileText,
  py: FileCode,
  go: FileCode,
  rs: FileCode,
  default: File,
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return FILE_ICONS[ext] || FILE_ICONS.default
}

// ============================================================================
// Status Indicator
// ============================================================================

function StatusIndicator({ status }: { status?: FileStatus }) {
  if (!status || status === 'idle') return null

  const statusConfig: Record<FileStatus, { color: string; pulse?: boolean; label: string }> = {
    idle: { color: '', label: '' },
    streaming: { color: 'bg-blue-500', pulse: true, label: 'Streaming' },
    modified: { color: 'bg-orange-500', label: 'Modified' },
    new: { color: 'bg-green-500', label: 'New' },
    error: { color: 'bg-red-500', label: 'Error' },
    pending: { color: 'bg-gray-400', pulse: true, label: 'Pending' },
  }

  const config = statusConfig[status]
  if (!config.color) return null

  return (
    <span
      className={cn(
        'w-2 h-2 rounded-full flex-shrink-0',
        config.color,
        config.pulse && 'animate-pulse'
      )}
      title={config.label}
    />
  )
}

// ============================================================================
// File Tree Node Component
// ============================================================================

export const FileTreeNode = memo(function FileTreeNode({
  node,
  depth = 0,
  activeFile,
  onSelect,
}: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2) // Auto-expand first 2 levels
  const isDirectory = node.type === 'directory'
  const isActive = node.path === activeFile
  const FileIcon = isDirectory ? (isExpanded ? FolderOpen : Folder) : getFileIcon(node.name)

  const handleClick = () => {
    if (isDirectory) {
      setIsExpanded(!isExpanded)
    } else {
      onSelect(node.path)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
    if (isDirectory) {
      if (e.key === 'ArrowRight' && !isExpanded) {
        e.preventDefault()
        setIsExpanded(true)
      }
      if (e.key === 'ArrowLeft' && isExpanded) {
        e.preventDefault()
        setIsExpanded(false)
      }
    }
  }

  return (
    <div>
      {/* Node Row */}
      <div
        role="treeitem"
        aria-expanded={isDirectory ? isExpanded : undefined}
        aria-selected={isActive}
        tabIndex={node.status === 'pending' ? -1 : 0}
        className={cn(
          'flex items-center gap-1.5 py-1 px-2 rounded-sm',
          'transition-colors',
          // Pending files: skeleton appearance, not clickable
          node.status === 'pending' && 'opacity-50 cursor-default',
          // Normal files: interactive
          node.status !== 'pending' && 'cursor-pointer hover:bg-muted/50',
          'focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-1',
          isActive && 'bg-accent text-accent-foreground',
          node.status === 'streaming' && 'bg-blue-500/10'
        )}
        style={{ paddingInlineStart: `${depth * 12 + 8}px` }}
        onClick={node.status === 'pending' ? undefined : handleClick}
        onKeyDown={node.status === 'pending' ? undefined : handleKeyDown}
      >
        {/* Expand/Collapse Arrow (directories only) */}
        {isDirectory ? (
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </span>
        ) : (
          <span className="w-4" /> // Spacer for alignment
        )}

        {/* Icon */}
        {node.status === 'streaming' ? (
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
        ) : (
          <FileIcon
            className={cn(
              'w-4 h-4 flex-shrink-0',
              isDirectory ? 'text-yellow-500' : 'text-muted-foreground'
            )}
          />
        )}

        {/* Name */}
        <span
          className={cn(
            'text-sm truncate flex-1',
            isActive ? 'font-medium' : 'font-normal'
          )}
          dir="auto" // RTL support for Arabic filenames
        >
          {node.name}
        </span>

        {/* Status Indicator */}
        <StatusIndicator status={node.status} />
      </div>

      {/* Children (directories only) */}
      {isDirectory && isExpanded && node.children && (
        <div role="group">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFile={activeFile}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
})
