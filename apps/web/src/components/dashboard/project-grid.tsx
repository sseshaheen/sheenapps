'use client'

import { useState, useCallback, lazy, Suspense, useEffect } from 'react'
import { useRouter } from '@/i18n/routing'
import { formatDistanceToNow } from 'date-fns'
import { Icon, type IconName } from '@/components/ui/icon'
import { shouldSilenceAuthToasts } from '@/lib/nav-silencer'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/loading'
import { Badge } from '@/components/ui/badge'
import { VersionBadge } from '@/components/version/version-badge'

const ProjectSkeletonLazy = lazy(() =>
  import('./project-skeleton').then(m => ({ default: m.ProjectSkeleton }))
)
const EmptyStateLazy = lazy(() =>
  import('./project-skeleton').then(m => ({ default: m.EmptyState }))
)
import { logger } from '@/utils/logger'
import { dashboardEventCoordinator } from '@/services/events/dashboard-coordinator'
import { actionContextManager } from '@/utils/event-privacy'
import { useAuthStore } from '@/store'
import { useDashboard } from './dashboard-context'
import { useInboxUnreadSummary } from '@/hooks/use-inbox-unread-summary'
import type { Project } from '@/hooks/use-projects'

// Expert advice: Use consistent aspect ratios to prevent CLS
const CARD_ASPECT_RATIO = '16/10' // Consistent aspect ratio for all project cards

/**
 * Build Status Indicator - Shows build progress/status on project cards
 * Part of Run Hub Phase 1: Quick Wins
 */
function BuildStatusIndicator({
  status,
  variant = 'badge'
}: {
  status: string | null | undefined
  variant?: 'badge' | 'inline'
}) {
  if (!status) return null

  // Badge variant (for grid view overlay)
  if (variant === 'badge') {
    switch (status) {
      case 'building':
      case 'queued':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/90 shadow-sm">
            <Icon name="loader-2" className="w-3 h-3 text-white animate-spin" />
            <span className="text-[10px] font-medium text-white">
              {status === 'queued' ? 'Queued' : 'Building'}
            </span>
          </div>
        )
      case 'failed':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/90 shadow-sm">
            <Icon name="alert-circle" className="w-3 h-3 text-white" />
            <span className="text-[10px] font-medium text-white">Failed</span>
          </div>
        )
      case 'deployed':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/90 shadow-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] font-medium text-white">Live</span>
          </div>
        )
      default:
        return null
    }
  }

  // Inline variant (for list view)
  switch (status) {
    case 'building':
    case 'queued':
      return (
        <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
          <Icon name="loader-2" className="w-3 h-3 text-amber-600 dark:text-amber-400 animate-spin" />
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
            {status === 'queued' ? 'Queued' : 'Building'}
          </span>
        </div>
      )
    case 'failed':
      return (
        <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
          <Icon name="alert-circle" className="w-3 h-3 text-red-600 dark:text-red-400" />
          <span className="text-[10px] font-medium text-red-600 dark:text-red-400">Failed</span>
        </div>
      )
    case 'deployed':
      return (
        <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Live</span>
        </div>
      )
    default:
      return null
  }
}

interface ProjectGridProps {
  translations: any
  locale: string
  projects: Project[]
  isLoading: boolean
  error: string | null
  viewMode: 'grid' | 'list'
  onProjectAction: (action: string, projectId: string, data?: any) => Promise<void>
  searchQuery?: string
  filterBy?: 'all' | 'active' | 'archived'
  onClearFilters?: () => void
}

interface ProjectCardProps {
  project: Project
  locale: string
  viewMode: 'grid' | 'list'
  onAction: (action: string, projectId: string, data?: any) => Promise<void>
  translations: any
  unreadEmailCount?: number
}

function ProjectCard({ project, locale, viewMode, onAction, translations, unreadEmailCount }: ProjectCardProps) {
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore()
  const { showSuccess, showError, translations: dashTranslations } = useDashboard()
  const [isRenaming, setIsRenaming] = useState(false)
  const [editingName, setEditingName] = useState('') // Only track editing state
  const [isLoading, setIsLoading] = useState(false)
  const [isOpening, setIsOpening] = useState(false)
  
  // ✅ EXPERT FIX: Controlled dropdown to prevent Popper anchor loops
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  
  useEffect(() => setMounted(true), [])
  
  // ✅ EXPERT SYNCHRONOUS BOOTSTRAP: Derive auth status from unified store
  const authStatus = {
    isSettled: !authLoading,
    status: isAuthenticated ? 'authenticated' : 'anonymous',
    user
  }
  
  // Get toast translations
  const t = dashTranslations?.toasts || {}

  // Initialize editing name when dialog opens
  const handleOpenRename = useCallback(() => {
    setEditingName(project.name)
    setIsRenaming(true)
  }, [project.name])

  const handleRename = useCallback(async () => {
    if (!editingName.trim() || editingName === project.name) {
      setIsRenaming(false)
      return
    }

    const startTime = Date.now()
    setIsLoading(true)
    
    try {
      await onAction('rename', project.id, { name: editingName.trim() })
      
      const duration = Date.now() - startTime
      
      // Emit dashboard event (expert pattern)
      if (user) {
        dashboardEventCoordinator.emitProjectAction(
          'rename',
          [project.id],
          user.id,
          `${project.name} → ${editingName.trim()}`
        )
      }
      
      setIsRenaming(false)
      
      // Show success toast with undo option
      showSuccess(
        t.projectRenamed || 'Project renamed',
        `"${project.name}" → "${editingName.trim()}"`,
        async () => {
          // Undo action: rename back to original
          await onAction('rename', project.id, { name: project.name })
          showSuccess(t.renameUndone || 'Rename undone')
        },
        `rename_${project.id}_${Date.now()}`,
        [project.id]
      )
      
      logger.info('📱 Project renamed', { 
        projectId: project.id.slice(0, 8),
        oldName: project.name,
        newName: editingName.trim(),
        duration
      })
    } catch (error) {
      // Emit error event (guard user to avoid crash if auth state changed)
      if (user) {
        dashboardEventCoordinator.emitErrorEvent(
          'rename',
          error,
          user.id,
          [project.id]
        )
      }

      // Show error toast
      showError(t.failedToRename || 'Failed to rename project', error instanceof Error ? error.message : 'Unknown error')

      logger.error('Failed to rename project', error)
    } finally {
      setIsLoading(false)
    }
  }, [editingName, project.name, project.id, onAction, user, showSuccess, showError, t])


  const handleOpen = useCallback(async () => {
    // ✅ EXPERT SYNCHRONOUS BOOTSTRAP: Check settlement first
    if (!authStatus.isSettled) {
      logger.info('🔄 Auth not settled yet, cannot open project', {
        projectId: project.id.slice(0, 8),
        status: authStatus.status,
        isSettled: authStatus.isSettled
      })
      return
    }
    
    // ✅ EXPERT SYNCHRONOUS BOOTSTRAP: Check auth status after settlement
    if (authStatus.status !== 'authenticated' || !authStatus.user) {
      // Only show error if not silenced and definitely anonymous (not unknown)
      if (!shouldSilenceAuthToasts() && authStatus.status === 'anonymous') {
        logger.warn('📋 Project grid auth error', { 
          projectId: project.id.slice(0, 8), 
          status: authStatus.status,
          duringNav: shouldSilenceAuthToasts() 
        })
        showError(
          t.authRequired || 'Authentication required',
          t.loginToAccess || 'Please log in to access your projects'
        )
      }
      return
    }
    
    setIsOpening(true)
    
    try {
      // Emit dashboard event for project opening
      dashboardEventCoordinator.emitProjectAction(
        'open',
        [project.id],
        user.id,
        project.name
      )
      
      // Show loading feedback
      showSuccess(
        t.openingProject || 'Opening project',
        `Loading "${project.name}"...`
      )
      
      await onAction('open', project.id)
    } catch (error) {
      showError(
        t.failedToOpen || 'Failed to open project',
        error instanceof Error ? error.message : 'Please try again'
      )
    } finally {
      setIsOpening(false)
    }
  }, [project.id, project.name, onAction, authStatus, showError, showSuccess, t])

  // Expert advice: Consistent aspect ratios to prevent CLS
  const cardClasses = viewMode === 'grid' 
    ? `group relative overflow-hidden rounded-lg border bg-card hover:shadow-lg transition-all duration-200 ${isOpening ? 'opacity-75 pointer-events-none' : 'cursor-pointer'}`
    : `group relative overflow-hidden rounded-lg border bg-card hover:shadow-md transition-all duration-200 ${isOpening ? 'opacity-75 pointer-events-none' : ''}`

  const isArchived = !!project.archived_at
  // Defensive: handle null timestamps for newly created projects before DB replication
  const modifiedTimestamp = project.updated_at || project.created_at
  const lastModified = modifiedTimestamp
    ? formatDistanceToNow(new Date(modifiedTimestamp), { addSuffix: true })
    : 'just now'

  if (viewMode === 'list') {
    return (
      <>
        <div className={`${cardClasses} p-3 sm:p-4`}>
          <div className="flex items-center justify-between min-h-[60px]">
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
              {/* Thumbnail placeholder */}
              <div 
                className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex-shrink-0 flex items-center justify-center"
                style={{ aspectRatio: '1' }}
              >
                <span className="text-white font-semibold text-xs sm:text-sm">
                  {project.name.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Project info */}
              <div className="flex-1 min-w-0" onClick={handleOpen}>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate text-sm sm:text-base">{project.name}</h3>
                  {isArchived && (
                    <Badge variant="secondary" className="text-xs hidden sm:inline-flex">Archived</Badge>
                  )}
                  {/* Build status indicator for list view */}
                  {!isArchived && (
                    <BuildStatusIndicator status={project.build_status} variant="inline" />
                  )}
                  {/* Unread email badge for list view */}
                  {!isArchived && !!unreadEmailCount && unreadEmailCount > 0 && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Icon name="mail" className="w-3 h-3" />
                      {unreadEmailCount}
                    </Badge>
                  )}
                  {/* ✅ NEW: Version information for list view */}
                  {project.current_version_id && (
                    <VersionBadge
                      versionId={project.current_version_id}
                      versionName={project.current_version_name}
                      isProcessing={!project.current_version_name}
                      size="sm"
                    />
                  )}
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Modified {lastModified}
                </p>
                {isArchived && (
                  <Badge variant="secondary" className="text-xs mt-1 sm:hidden">Archived</Badge>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {isOpening && (
                <LoadingSpinner size="sm" className="me-2" />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpen}
                disabled={isOpening}
                className="hidden sm:flex opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Icon name="external-link" className="h-4 w-4" />
                <span className="sr-only">Open project</span>
              </Button>

              {/* Expert advice: Destructive actions behind dropdown */}
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 sm:h-9 sm:w-9">
                    <Icon name="more-horizontal" className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                {/* ✅ EXPERT FIX: Mount Content only after client mount to avoid SSR → CSR anchor churn */}
                {mounted ? (
                  <DropdownMenuContent align="end" className="w-44 sm:w-48">
                  <DropdownMenuItem onClick={handleOpen} className="sm:hidden">
                    <Icon name="external-link" className="me-2 h-4 w-4" />
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenRename}>
                    <Icon name="edit-3" className="me-2 h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    if (user) {
                      dashboardEventCoordinator.emitProjectAction('duplicate', [project.id], user.id, project.name)
                    }
                    try {
                      await onAction('duplicate', project.id)
                      showSuccess(t.projectDuplicated || 'Project duplicated', `Created "${t.copiedPrefix || 'Copy of'} ${project.name}"`)
                    } catch (error) {
                      showError(t.failedToDuplicate || 'Failed to duplicate project', error instanceof Error ? error.message : 'Unknown error')
                    }
                  }}>
                    <Icon name="copy" className="me-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  {/* Run - Business dashboard (Phase 0: Run Hub entry point) */}
                  {project.build_status === 'deployed' && (
                    <DropdownMenuItem onClick={() => {
                      router.push(`/project/${project.id}/run`)
                    }}>
                      <Icon name="bar-chart" className="me-2 h-4 w-4" />
                      Run
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {isArchived ? (
                    <DropdownMenuItem onClick={async () => {
                      if (user) {
                        dashboardEventCoordinator.emitProjectAction('restore', [project.id], user.id, project.name)
                      }
                      try {
                        await onAction('restore', project.id)
                        showSuccess(
                          t.projectRestored || 'Project restored',
                          `"${project.name}" has been restored`,
                          async () => {
                            // Undo: re-archive
                            await onAction('archive', project.id)
                            showSuccess(t.restoreUndone || 'Restore undone')
                          },
                          `restore_${project.id}_${Date.now()}`,
                          [project.id]
                        )
                      } catch (error) {
                        showError(t.failedToRestore || 'Failed to restore project', error instanceof Error ? error.message : 'Unknown error')
                      }
                    }}>
                      <Icon name="archive-restore" className="me-2 h-4 w-4" />
                      Restore
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={async () => {
                      if (user) {
                        dashboardEventCoordinator.emitProjectAction('archive', [project.id], user.id, project.name)
                      }
                      try {
                        await onAction('archive', project.id)
                        showSuccess(
                          t.projectArchived || 'Project archived',
                          `"${project.name}" has been archived`,
                          async () => {
                            // Undo: restore
                            await onAction('restore', project.id)
                            showSuccess(t.archiveUndone || 'Archive undone')
                          },
                          `archive_${project.id}_${Date.now()}`,
                          [project.id]
                        )
                      } catch (error) {
                        showError(t.failedToArchive || 'Failed to archive project', error instanceof Error ? error.message : 'Unknown error')
                      }
                    }}>
                      <Icon name="archive" className="me-2 h-4 w-4" />
                      Archive
                    </DropdownMenuItem>
                  )}
                  </DropdownMenuContent>
                ) : null}
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Rename Dialog */}
        <Dialog open={isRenaming} onOpenChange={setIsRenaming}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Project</DialogTitle>
              <DialogDescription>
                Choose a new name for your project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                  id="project-name"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename()
                    if (e.key === 'Escape') setIsRenaming(false)
                  }}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRenaming(false)}>
                Cancel
              </Button>
              <Button onClick={handleRename} disabled={isLoading || !editingName.trim()}>
                {isLoading && <LoadingSpinner size="sm" className="me-2" />}
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </>
    )
  }

  // Grid view
  return (
    <>
      <Card className={cardClasses} onClick={handleOpen}>
        <CardContent className="p-0">
          {/* Expert advice: Consistent aspect ratio prevents CLS */}
          <div 
            className="relative bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center"
            style={{ aspectRatio: CARD_ASPECT_RATIO }}
          >
            {/* Project thumbnail or placeholder */}
            <div className="text-white text-4xl font-bold flex items-center justify-center space-x-2">
              {isOpening && (
                <LoadingSpinner size="sm" className="text-white" />
              )}
              <span>{project.name.charAt(0).toUpperCase()}</span>
            </div>

            {/* Actions overlay - Always visible on mobile, hover on desktop */}
            <div className="absolute top-2 right-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              {/* Expert advice: Destructive actions behind dropdown */}
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="h-8 w-8 p-0 shadow-sm">
                    <Icon name="more-horizontal" className="h-4 w-4" />
                    <span className="sr-only">Project options</span>
                  </Button>
                </DropdownMenuTrigger>
                {/* ✅ EXPERT FIX: Mount Content only after client mount to avoid SSR → CSR anchor churn */}
                {mounted ? (
                  <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { 
                    e.stopPropagation(); 
                    handleOpenRename()
                  }}>
                    <Icon name="edit-3" className="me-2 h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={async (e) => {
                    e.stopPropagation()
                    if (user) {
                      dashboardEventCoordinator.emitProjectAction('duplicate', [project.id], user.id, project.name)
                    }
                    try {
                      await onAction('duplicate', project.id)
                      showSuccess(t.projectDuplicated || 'Project duplicated', `Created "${t.copiedPrefix || 'Copy of'} ${project.name}"`)
                    } catch (error) {
                      showError(t.failedToDuplicate || 'Failed to duplicate project', error instanceof Error ? error.message : 'Unknown error')
                    }
                  }}>
                    <Icon name="copy" className="me-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  {/* Run - Business dashboard (Phase 0: Run Hub entry point) */}
                  {project.build_status === 'deployed' && (
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/project/${project.id}/run`)
                    }}>
                      <Icon name="bar-chart" className="me-2 h-4 w-4" />
                      Run
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {isArchived ? (
                    <DropdownMenuItem onClick={async (e) => {
                      e.stopPropagation()
                      if (user) {
                        dashboardEventCoordinator.emitProjectAction('restore', [project.id], user.id, project.name)
                      }
                      try {
                        await onAction('restore', project.id)
                        showSuccess(
                          t.projectRestored || 'Project restored',
                          `"${project.name}" has been restored`,
                          async () => {
                            // Undo: re-archive
                            await onAction('archive', project.id)
                            showSuccess(t.restoreUndone || 'Restore undone')
                          },
                          `restore_${project.id}_${Date.now()}`,
                          [project.id]
                        )
                      } catch (error) {
                        showError(t.failedToRestore || 'Failed to restore project', error instanceof Error ? error.message : 'Unknown error')
                      }
                    }}>
                      <Icon name="archive-restore" className="me-2 h-4 w-4" />
                      Restore
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={async (e) => { 
                      e.stopPropagation()
                      if (user) {
                        dashboardEventCoordinator.emitProjectAction('archive', [project.id], user.id, project.name)
                      }
                      try {
                        await onAction('archive', project.id)
                        showSuccess(
                          t.projectArchived || 'Project archived',
                          `"${project.name}" has been archived`,
                          async () => {
                            // Undo: restore
                            await onAction('restore', project.id)
                            showSuccess(t.archiveUndone || 'Archive undone')
                          },
                          `archive_${project.id}_${Date.now()}`,
                          [project.id]
                        )
                      } catch (error) {
                        showError(t.failedToArchive || 'Failed to archive project', error instanceof Error ? error.message : 'Unknown error')
                      }
                    }}>
                      <Icon name="archive" className="me-2 h-4 w-4" />
                      Archive
                    </DropdownMenuItem>
                  )}
                  </DropdownMenuContent>
                ) : null}
              </DropdownMenu>
            </div>

            {/* Status badges */}
            <div className="absolute top-2 left-2 flex items-center gap-2">
              {isArchived && (
                <Badge variant="secondary">Archived</Badge>
              )}
              {/* Build status indicator */}
              {!isArchived && (
                <BuildStatusIndicator status={project.build_status} variant="badge" />
              )}
              {/* Unread email badge */}
              {!isArchived && !!unreadEmailCount && unreadEmailCount > 0 && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Icon name="mail" className="w-3 h-3" />
                  {unreadEmailCount}
                </Badge>
              )}
            </div>
          </div>

          {/* Project info */}
          <div className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-medium truncate text-sm sm:text-base">{project.name}</h3>
              {/* ✅ NEW: Version information for grid view */}
              {project.current_version_id && (
                <VersionBadge 
                  versionId={project.current_version_id}
                  versionName={project.current_version_name}
                  isProcessing={!project.current_version_name}
                  size="sm"
                />
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Modified {lastModified}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Rename Dialog */}
      <Dialog open={isRenaming} onOpenChange={setIsRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>
              Choose a new name for your project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') setIsRenaming(false)
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenaming(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={isLoading || !editingName.trim()}>
              {isLoading && <LoadingSpinner size="sm" className="me-2" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  )
}

export function ProjectGrid({ 
  translations, 
  locale, 
  projects, 
  isLoading, 
  error, 
  viewMode, 
  onProjectAction,
  searchQuery = '',
  filterBy = 'all',
  onClearFilters
}: ProjectGridProps) {
  const { user } = useAuthStore()
  const { data: unreadSummary } = useInboxUnreadSummary(user?.id)

  if (isLoading) {
    return (
      <Suspense fallback={<div className="animate-pulse h-64 bg-muted rounded-lg" />}>
        <ProjectSkeletonLazy viewMode={viewMode} />
      </Suspense>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Failed to load projects</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <Suspense fallback={<div className="text-center py-12">{translations.dashboard?.loading || 'Loading...'}</div>}>
        <EmptyStateLazy
          searchQuery={searchQuery}
        filterBy={filterBy}
        onClearFilters={onClearFilters || (() => {})}
        onCreateProject={() => {
          if (user) {
            dashboardEventCoordinator.emitProjectAction('create', [], user.id)
          }
          onProjectAction('create', '')
        }}
        translations={translations}
        />
      </Suspense>
    )
  }

  return (
    <div className={
      viewMode === 'grid' 
        ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"
        : "space-y-3 sm:space-y-2"
    }>
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          locale={locale}
          viewMode={viewMode}
          onAction={onProjectAction}
          translations={translations}
          unreadEmailCount={unreadSummary?.[project.id]}
        />
      ))}
    </div>
  )
}
