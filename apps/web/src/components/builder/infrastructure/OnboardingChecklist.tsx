'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import { emitFunnelEvent } from '@/utils/easy-mode-funnel'

interface ChecklistStep {
  id: string
  label: string
  completed: boolean
  actionLabel?: string
  onAction?: () => void
}

interface OnboardingChecklistProps {
  projectId: string
  siteUrl?: string | null
  hasContentTypes: boolean
  translations: {
    title: string
    dismiss: string
    progress: string
    steps: {
      createProject: string
      viewSite: string
      viewSiteAction: string
      addContent: string
      addContentAction: string
      shareSite: string
      shareSiteAction: string
    }
    dismissed: string
    reopen: string
    completed: string
    copiedToast: string
  }
  onOpenCms?: () => void
}

const STORAGE_KEY_PREFIX = 'easy_onboarding_'

function getStorageKey(projectId: string) {
  return `${STORAGE_KEY_PREFIX}${projectId}`
}

function getChecklistState(projectId: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(getStorageKey(projectId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function setChecklistState(projectId: string, state: Record<string, boolean>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(state))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Onboarding checklist for Easy Mode projects.
 * Shows after project creation to guide users through first steps.
 * Tracks progress in localStorage per project.
 */
export function OnboardingChecklist({
  projectId,
  siteUrl,
  hasContentTypes,
  translations,
  onOpenCms,
}: OnboardingChecklistProps) {
  const [state, setState] = useState<Record<string, boolean>>({})
  const [dismissed, setDismissed] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  // Hydrate from localStorage
  useEffect(() => {
    const saved = getChecklistState(projectId)
    setState(saved)
    setDismissed(saved._dismissed === true)
    setIsHydrated(true)
  }, [projectId])

  const markComplete = useCallback((stepId: string) => {
    setState(prev => {
      const next = { ...prev, [stepId]: true }
      setChecklistState(projectId, next)
      return next
    })
  }, [projectId])

  // Auto-mark steps based on external state
  useEffect(() => {
    if (!isHydrated) return
    // "Create project" is always done (they're viewing this)
    if (!state.createProject) markComplete('createProject')
    // "Add content" auto-completes when content types exist
    if (hasContentTypes && !state.addContent) markComplete('addContent')
  }, [isHydrated, hasContentTypes, state.createProject, state.addContent, markComplete])

  const handleViewSite = () => {
    if (siteUrl) {
      window.open(siteUrl, '_blank', 'noopener,noreferrer')
      markComplete('viewSite')
    }
  }

  const handleShareSite = async () => {
    if (siteUrl) {
      try {
        await navigator.clipboard.writeText(siteUrl)
        markComplete('shareSite')
        emitFunnelEvent(projectId, 'first_share_link_copied', { url: siteUrl })
      } catch {
        // Fallback for clipboard errors
      }
    }
  }

  const handleAddContent = () => {
    markComplete('addContent')
    onOpenCms?.()
  }

  const handleDismiss = () => {
    setDismissed(true)
    const next = { ...state, _dismissed: true }
    setChecklistState(projectId, next)
  }

  const handleReopen = () => {
    setDismissed(false)
    const next = { ...state }
    delete (next as Record<string, unknown>)._dismissed
    setChecklistState(projectId, next)
  }

  // Don't render until hydrated
  if (!isHydrated) return null

  const steps: ChecklistStep[] = [
    {
      id: 'createProject',
      label: translations.steps.createProject,
      completed: true,
    },
    {
      id: 'viewSite',
      label: translations.steps.viewSite,
      completed: state.viewSite === true,
      actionLabel: translations.steps.viewSiteAction,
      onAction: handleViewSite,
    },
    {
      id: 'addContent',
      label: translations.steps.addContent,
      completed: state.addContent === true,
      actionLabel: translations.steps.addContentAction,
      onAction: handleAddContent,
    },
    {
      id: 'shareSite',
      label: translations.steps.shareSite,
      completed: state.shareSite === true,
      actionLabel: translations.steps.shareSiteAction,
      onAction: handleShareSite,
    },
  ]

  const completedCount = steps.filter(s => s.completed).length
  const allDone = completedCount === steps.length

  // If all done and dismissed, hide completely
  if (allDone && dismissed) return null

  // If dismissed but not all done, show minimal "reopen" button
  if (dismissed) {
    return (
      <button
        onClick={handleReopen}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
      >
        <Icon name="list-checks" className="w-3 h-3" />
        {translations.reopen} ({completedCount}/{steps.length})
      </button>
    )
  }

  return (
    <Card className={allDone ? 'border-green-500/30 bg-green-500/5' : undefined}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Icon name="list-checks" className="w-4 h-4" />
            {translations.title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {translations.progress.replace('{done}', String(completedCount)).replace('{total}', String(steps.length))}
            </span>
            {!allDone && (
              <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground"
                aria-label={translations.dismiss}
              >
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1.5">
        {allDone && (
          <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-2">
            {translations.completed}
          </p>
        )}
        {steps.map(step => (
          <div key={step.id} className="flex items-center justify-between gap-2 py-1">
            <div className="flex items-center gap-2 min-w-0">
              {step.completed ? (
                <Icon name="check-circle" className="w-4 h-4 text-green-500 shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
              )}
              <span className={`text-sm truncate ${step.completed ? 'text-muted-foreground line-through' : ''}`}>
                {step.label}
              </span>
            </div>
            {!step.completed && step.actionLabel && step.onAction && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs shrink-0"
                onClick={step.onAction}
                disabled={step.id === 'viewSite' && !siteUrl}
              >
                {step.actionLabel}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
