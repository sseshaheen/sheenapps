/**
 * File Tree Panel Component
 *
 * Left panel showing the file tree structure with search/filter.
 */

'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Search, X, FolderTree, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { FileTreeNode } from './file-tree-node'
import { buildFileTree, useCodeViewerStore } from '@/store/code-viewer-store'
import type { FileState, FileTreeNode as FileTreeNodeType } from '@/store/code-viewer-store'

// Check document direction (not container direction) for icon orientation
// This respects user's mental model even when we force LTR on the code viewer
function useIsDocumentRTL() {
  if (typeof document === 'undefined') return false
  return document.documentElement.dir === 'rtl'
}

// ============================================================================
// Types
// ============================================================================

interface FileTreePanelProps {
  className?: string
  onCollapse?: () => void
  isLoading?: boolean
}

// ============================================================================
// Utilities
// ============================================================================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function filterTree(nodes: FileTreeNodeType[], query: string): FileTreeNodeType[] {
  if (!query) return nodes

  const lowerQuery = query.toLowerCase()

  return nodes
    .map((node) => {
      if (node.type === 'directory') {
        const filteredChildren = filterTree(node.children || [], query)
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren }
        }
        // Include directory if its name matches
        if (node.name.toLowerCase().includes(lowerQuery)) {
          return node
        }
        return null
      }
      // Include file if name matches
      if (node.name.toLowerCase().includes(lowerQuery)) {
        return node
      }
      return null
    })
    .filter((node): node is FileTreeNodeType => node !== null)
}

// ============================================================================
// File Tree Panel Component
// ============================================================================

export function FileTreePanel({ className, onCollapse, isLoading = false }: FileTreePanelProps) {
  const t = useTranslations('builder.codeViewer.fileTree')
  const [searchQuery, setSearchQuery] = useState('')
  const isDocumentRTL = useIsDocumentRTL()

  // Store selectors
  const filesByPath = useCodeViewerStore((state) => state.filesByPath)
  const fileOrder = useCodeViewerStore((state) => state.fileOrder)
  const activeFile = useCodeViewerStore((state) => state.activeFile)
  const openFile = useCodeViewerStore((state) => state.openFile)

  // Build file tree from store
  const files: FileState[] = useMemo(() => {
    return fileOrder.map((path) => filesByPath[path]).filter(Boolean)
  }, [filesByPath, fileOrder])

  const tree = useMemo(() => buildFileTree(files), [files])
  const filteredTree = useMemo(() => filterTree(tree, searchQuery), [tree, searchQuery])

  // Calculate totals
  const totalFiles = files.length
  const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0)

  const handleFileSelect = (path: string) => {
    openFile(path)
  }

  return (
    <div
      className={cn(
        'h-full flex flex-col bg-background border-e border-border',
        className
      )}
    >
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('title')}</span>
          </div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded hover:bg-muted transition-colors"
              aria-label={t('collapse')}
            >
              {/* Icon direction follows document RTL, not container LTR */}
              {isDocumentRTL ? (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}
        </div>

        {/* Search - uses logical properties (start/end) for RTL support */}
        <div className="relative">
          <Search className="absolute start-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            dir="auto"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full h-8 ps-7 pe-7 text-sm rounded-md',
              'bg-muted/50 border border-transparent',
              'focus:outline-none focus:border-ring focus:bg-background',
              'placeholder:text-muted-foreground/60',
              'transition-colors'
            )}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
              aria-label={t('clearSearch')}
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto py-1" role="tree" aria-label={t('title')}>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : filteredTree.length > 0 ? (
          filteredTree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              activeFile={activeFile}
              onSelect={handleFileSelect}
            />
          ))
        ) : (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t('noFiles')}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-border bg-muted/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t('fileCount', { count: totalFiles })}
          </span>
          <span>{t('totalSize', { size: formatFileSize(totalSize) })}</span>
        </div>
      </div>
    </div>
  )
}
