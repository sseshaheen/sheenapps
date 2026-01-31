/**
 * Code Display Panel Component
 *
 * Right panel showing the code with tabs and syntax highlighting.
 */

'use client'

import { useCallback, useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Copy,
  Check,
  Download,
  GitCompare,
  Code,
  Eye,
  LocateFixed,
  LocateOff,
  Search,
  Loader2,
} from 'lucide-react'
import { FileTabs } from './file-tabs'
import { FileContextBanner } from './file-context-banner'
import { CodeContent } from './code-content'
import { CodeDiffView } from './code-diff-view'
import { CodeSearchBar, type SearchMatch } from './code-search'
import {
  useCodeViewerStore,
  useActiveFile,
  useIsStreaming,
  useViewMode,
} from '@/store/code-viewer-store'
import { useCodeViewerKeyboard } from '@/hooks/use-code-viewer-keyboard'

// ============================================================================
// Types
// ============================================================================

interface CodeDisplayPanelProps {
  className?: string
  onCopyAll?: () => void
  onDownload?: () => void
  isLoadingFile?: boolean
}

// ============================================================================
// Action Button
// ============================================================================

interface ActionButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
}

function ActionButton({ icon, label, onClick, isActive, disabled }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        'hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed',
        isActive && 'bg-muted text-primary'
      )}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  )
}

// ============================================================================
// View Mode Toggle
// ============================================================================

function ViewModeToggle() {
  const t = useTranslations('builder.codeViewer.codeDisplay.viewModes')
  const viewMode = useViewMode()
  const setViewMode = useCodeViewerStore((state) => state.setViewMode)

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-gray-200 dark:bg-gray-900">
      <button
        onClick={() => setViewMode('code')}
        className={cn(
          'p-1.5 rounded transition-colors',
          viewMode === 'code'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-800/50'
        )}
        title={t('code')}
        aria-label={t('code')}
        aria-pressed={viewMode === 'code'}
      >
        <Code className="w-4 h-4" />
      </button>
      <button
        onClick={() => setViewMode('diff')}
        className={cn(
          'p-1.5 rounded transition-colors',
          viewMode === 'diff'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-800/50'
        )}
        title={t('diff')}
        aria-label={t('diff')}
        aria-pressed={viewMode === 'diff'}
      >
        <GitCompare className="w-4 h-4" />
      </button>
      <button
        onClick={() => setViewMode('preview')}
        className={cn(
          'p-1.5 rounded transition-colors',
          viewMode === 'preview'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-800/50'
        )}
        title={t('preview')}
        aria-label={t('preview')}
        aria-pressed={viewMode === 'preview'}
      >
        <Eye className="w-4 h-4" />
      </button>
    </div>
  )
}

// ============================================================================
// Follow Mode Toggle
// ============================================================================

function FollowModeToggle() {
  const t = useTranslations('builder.codeViewer.codeDisplay.followMode')
  const followMode = useCodeViewerStore((state) => state.followMode)
  const toggleFollowMode = useCodeViewerStore((state) => state.toggleFollowMode)
  const isStreaming = useIsStreaming()

  if (!isStreaming) return null

  return (
    <button
      onClick={toggleFollowMode}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        followMode
          ? 'bg-primary/10 text-primary hover:bg-primary/20'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      title={followMode ? t('following') : t('notFollowing')}
      aria-label={followMode ? t('stopFollowing') : t('startFollowing')}
      aria-pressed={followMode}
    >
      {followMode ? (
        <LocateFixed className="w-4 h-4" />
      ) : (
        <LocateOff className="w-4 h-4" />
      )}
    </button>
  )
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState() {
  const t = useTranslations('builder.codeViewer.codeDisplay.emptyState')

  return (
    <div className="h-full flex items-center justify-center bg-muted/20">
      <div className="text-center p-8">
        <Code className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
        <h3 className="text-lg font-medium text-foreground mb-2">{t('title')}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {t('description')}
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// File Info Footer
// ============================================================================

function FileInfoFooter() {
  const t = useTranslations('builder.codeViewer.codeDisplay.fileInfo')
  const activeFile = useActiveFile()
  const isStreaming = useIsStreaming()
  const streaming = useCodeViewerStore((state) => state.streaming)

  if (!activeFile) return null

  const lineCount = activeFile.content.split('\n').length
  const charCount = activeFile.content.length

  return (
    <div className="flex-shrink-0 px-3 py-1.5 border-t border-border bg-muted/30">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{activeFile.language}</span>
          <span>{t('lines', { count: lineCount })}</span>
          <span>{t('chars', { count: charCount.toLocaleString() })}</span>
        </div>
        <div className="flex items-center gap-3">
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-blue-500">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {streaming.progress > 0
                ? t('generatingProgress', { progress: streaming.progress })
                : t('generating')
              }
            </span>
          )}
          {activeFile.status === 'modified' && (
            <span className="text-orange-500">{t('modified')}</span>
          )}
          {activeFile.status === 'new' && <span className="text-green-500">{t('new')}</span>}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Code Display Panel Component
// ============================================================================

export function CodeDisplayPanel({
  className,
  onCopyAll,
  onDownload,
  isLoadingFile = false,
}: CodeDisplayPanelProps) {
  const t = useTranslations('builder.codeViewer.codeDisplay')
  const [copied, setCopied] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])
  const [currentMatch, setCurrentMatch] = useState<SearchMatch | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeFile = useActiveFile()
  const isStreaming = useIsStreaming()
  const viewMode = useViewMode()
  const followMode = useCodeViewerStore((state) => state.followMode)

  // Keyboard shortcuts
  useCodeViewerKeyboard({
    enabled: true,
    onSearchOpen: () => setIsSearchOpen(true),
    onSearchClose: () => setIsSearchOpen(false),
    containerRef,
  })

  const handleCopy = useCallback(async () => {
    if (!activeFile) return

    try {
      await navigator.clipboard.writeText(activeFile.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      // EXPERT FIX ROUND 17: Show toast instead of silent console.error
      // Clipboard API fails on non-HTTPS or in some browsers
      toast.error('Failed to copy to clipboard', {
        description: 'Try selecting the code and using Ctrl+C / Cmd+C',
      })
    }
  }, [activeFile])

  // Handle search match updates
  const handleSearchMatchChange = useCallback(
    (match: SearchMatch | null, allMatches: SearchMatch[]) => {
      setCurrentMatch(match)
      setSearchMatches(allMatches)
    },
    []
  )

  return (
    <div
      ref={containerRef}
      className={cn('h-full flex flex-col bg-background', className)}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <ViewModeToggle />

        <div className="flex items-center gap-1">
          <FollowModeToggle />

          {/* Search button */}
          <ActionButton
            icon={<Search className="w-4 h-4" />}
            label={t('actions.searchShortcut')}
            onClick={() => setIsSearchOpen(true)}
            isActive={isSearchOpen}
            disabled={!activeFile}
          />

          <ActionButton
            icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            label={copied ? t('actions.copied') : t('actions.copyFile')}
            onClick={handleCopy}
            disabled={!activeFile}
          />

          {onCopyAll && (
            <ActionButton
              icon={<Copy className="w-4 h-4" />}
              label={t('actions.copyAllFiles')}
              onClick={onCopyAll}
            />
          )}

          {onDownload && (
            <ActionButton
              icon={<Download className="w-4 h-4" />}
              label={t('actions.downloadZip')}
              onClick={onDownload}
            />
          )}
        </div>
      </div>

      {/* Search Bar */}
      {activeFile && (
        <CodeSearchBar
          content={activeFile.content}
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onMatchChange={handleSearchMatchChange}
        />
      )}

      {/* Tabs */}
      <FileTabs />

      {/* Plan Step Context Banner */}
      {/* Shows which plan step relates to the active file */}
      {/* @see docs/plan-code-explanation-context.md */}
      <FileContextBanner />

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoadingFile && activeFile ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">{t('loadingFile')}</p>
            </div>
          </div>
        ) : activeFile ? (
          viewMode === 'code' ? (
            <CodeContent
              content={activeFile.content}
              language={activeFile.language}
              isStreaming={isStreaming && activeFile.status === 'streaming'}
              showLineNumbers
              currentSearchMatch={currentMatch}
              followMode={followMode}
            />
          ) : viewMode === 'diff' ? (
            <CodeDiffView
              oldContent={activeFile.previousContent || ''}
              newContent={activeFile.content}
              language={activeFile.language}
              showLineNumbers
            />
          ) : (
            // Preview - placeholder
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p>{t('previewNotAvailable')}</p>
            </div>
          )
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Footer */}
      <FileInfoFooter />
    </div>
  )
}
