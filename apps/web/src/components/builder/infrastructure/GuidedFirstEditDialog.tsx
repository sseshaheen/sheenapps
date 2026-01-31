'use client'

/**
 * Guided First Edit Dialog
 *
 * A first-run modal that appears for new Easy Mode projects to guide
 * non-technical users through their first successful edit.
 *
 * Step 1: Edit business name (simple, instant success)
 * Step 2: Prompt to add first content item via CMS
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Check, ArrowRight, Sparkles } from 'lucide-react'
import { emitFunnelEvent } from '@/utils/easy-mode-funnel'

// Storage key prefix for tracking first edit completion per project
const FIRST_EDIT_STORAGE_KEY = 'easy_first_edit_'
const FIRST_EDIT_DISMISSED_KEY = 'easy_first_edit_dismissed_'

function getFirstEditState(projectId: string): { completed: boolean; dismissed: boolean } {
  if (typeof window === 'undefined') return { completed: false, dismissed: false }
  try {
    const completed = localStorage.getItem(`${FIRST_EDIT_STORAGE_KEY}${projectId}`) === 'true'
    const dismissed = localStorage.getItem(`${FIRST_EDIT_DISMISSED_KEY}${projectId}`) === 'true'
    return { completed, dismissed }
  } catch {
    return { completed: false, dismissed: false }
  }
}

function markFirstEditComplete(projectId: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`${FIRST_EDIT_STORAGE_KEY}${projectId}`, 'true')
  } catch {
    // Ignore storage errors
  }
}

function markFirstEditDismissed(projectId: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`${FIRST_EDIT_DISMISSED_KEY}${projectId}`, 'true')
  } catch {
    // Ignore storage errors
  }
}

export interface GuidedFirstEditDialogTranslations {
  step1: {
    title: string
    subtitle: string
    label: string
    placeholder: string
    save: string
    skip: string
  }
  step2: {
    title: string
    subtitle: string
    action: string
    done: string
  }
  success: string
}

export interface GuidedFirstEditDialogProps {
  projectId: string
  projectName: string
  isEasyMode: boolean
  projectCreatedAt?: string | null
  translations: GuidedFirstEditDialogTranslations
  onUpdateProjectName?: (newName: string) => Promise<void>
  onOpenCms?: () => void
}

type Step = 'name' | 'content' | 'done'

export function GuidedFirstEditDialog({
  projectId,
  projectName,
  isEasyMode,
  projectCreatedAt,
  translations,
  onUpdateProjectName,
  onOpenCms,
}: GuidedFirstEditDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState(projectName)
  const [isSaving, setIsSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  // Ref to prevent dismiss handler from firing on programmatic close (success flows)
  const isProgrammaticCloseRef = useRef(false)

  const closeProgrammatically = useCallback(() => {
    isProgrammaticCloseRef.current = true
    setIsOpen(false)
  }, [])

  // Hydrate state from localStorage
  useEffect(() => {
    if (!projectId || !isEasyMode) {
      setIsHydrated(true)
      return
    }

    const { completed, dismissed } = getFirstEditState(projectId)

    // Only show for Easy Mode projects that haven't completed or dismissed
    if (completed || dismissed) {
      setIsHydrated(true)
      return
    }

    // Check if project was created recently (within last 2 minutes)
    // to avoid showing on returning visits
    if (projectCreatedAt) {
      const createdTime = new Date(projectCreatedAt).getTime()
      const now = Date.now()
      const twoMinutes = 2 * 60 * 1000

      if (now - createdTime > twoMinutes) {
        // Project is old, don't show the dialog but don't mark as dismissed
        setIsHydrated(true)
        return
      }
    }

    // Show the dialog for new Easy Mode projects
    setIsOpen(true)
    setIsHydrated(true)
    emitFunnelEvent(projectId, 'first_edit_dialog_shown', { step: 'name' })
  }, [projectId, isEasyMode, projectCreatedAt])

  // Update name when projectName changes
  useEffect(() => {
    setName(projectName)
  }, [projectName])

  const handleSaveName = useCallback(async () => {
    if (!name.trim() || name === projectName) {
      // Skip to content step if no change
      setStep('content')
      emitFunnelEvent(projectId, 'first_edit_name_skipped', {})
      return
    }

    setIsSaving(true)
    try {
      if (onUpdateProjectName) {
        await onUpdateProjectName(name.trim())
      }
      setShowSuccess(true)
      emitFunnelEvent(projectId, 'first_edit_name_saved', { newName: name.trim() })

      // Show success briefly then move to next step
      setTimeout(() => {
        setShowSuccess(false)
        setStep('content')
      }, 1200)
    } catch (error) {
      console.error('Failed to update project name:', error)
    } finally {
      setIsSaving(false)
    }
  }, [name, projectName, projectId, onUpdateProjectName])

  const handleOpenCms = useCallback(() => {
    markFirstEditComplete(projectId)
    emitFunnelEvent(projectId, 'first_edit_cms_opened', {})
    closeProgrammatically()
    onOpenCms?.()
  }, [projectId, onOpenCms, closeProgrammatically])

  const handleSkip = useCallback(() => {
    if (step === 'name') {
      setStep('content')
      emitFunnelEvent(projectId, 'first_edit_name_skipped', {})
    }
  }, [step, projectId])

  const handleDone = useCallback(() => {
    markFirstEditComplete(projectId)
    emitFunnelEvent(projectId, 'first_edit_completed', { skippedContent: true })
    closeProgrammatically()
  }, [projectId, closeProgrammatically])

  const handleDismiss = useCallback(() => {
    markFirstEditDismissed(projectId)
    emitFunnelEvent(projectId, 'first_edit_dismissed', { step })
    setIsOpen(false)
  }, [projectId, step])

  // Don't render until hydrated or if not Easy Mode
  if (!isHydrated || !isEasyMode) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        // If this was a programmatic close (success flow), don't mark as dismissed
        if (isProgrammaticCloseRef.current) {
          isProgrammaticCloseRef.current = false
          return
        }
        handleDismiss()
      }
    }}>
      <DialogContent className="sm:max-w-md">
        {step === 'name' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
              </div>
              <DialogTitle>{translations.step1.title}</DialogTitle>
              <DialogDescription>{translations.step1.subtitle}</DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <Label htmlFor="business-name" className="text-sm font-medium">
                {translations.step1.label}
              </Label>
              <Input
                id="business-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={translations.step1.placeholder}
                className="mt-2"
                disabled={isSaving || showSuccess}
              />
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="ghost"
                onClick={handleSkip}
                disabled={isSaving || showSuccess}
                className="sm:order-1"
              >
                {translations.step1.skip}
              </Button>
              <Button
                onClick={handleSaveName}
                disabled={isSaving || showSuccess}
                className="sm:order-2"
              >
                {showSuccess ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    {translations.success}
                  </>
                ) : isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {translations.step1.save}
                  </>
                ) : (
                  <>
                    {translations.step1.save}
                    <ArrowRight className="ms-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'content' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <DialogTitle>{translations.step2.title}</DialogTitle>
              <DialogDescription>{translations.step2.subtitle}</DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                {/* Brief explanation that starter content is ready */}
              </p>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="ghost"
                onClick={handleDone}
                className="sm:order-1"
              >
                {translations.step2.done}
              </Button>
              <Button
                onClick={handleOpenCms}
                className="sm:order-2"
              >
                {translations.step2.action}
                <ArrowRight className="ms-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default GuidedFirstEditDialog
