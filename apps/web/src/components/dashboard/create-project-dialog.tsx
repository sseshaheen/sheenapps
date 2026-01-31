'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { useRouter } from '@/i18n/routing'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/loading'
import Icon from '@/components/ui/icon'
import { useDashboard } from './dashboard-context'
import { logger } from '@/utils/logger'
import { ROUTES } from '@/i18n/routes'
import { triggerAdvisorMatch } from '@/services/advisor-matching-service'
import { getFreeTemplates, type TemplateId, type TemplateDefinition } from '@sheenapps/templates'

/** Map locale to default currency */
const LOCALE_CURRENCY: Record<string, string> = {
  'ar': 'SAR',
  'ar-sa': 'SAR',
  'ar-eg': 'EGP',
  'ar-ae': 'AED',
  'en': 'USD',
  'fr': 'EUR',
  'fr-ma': 'MAD',
  'es': 'EUR',
  'de': 'EUR',
}

const SUPPORTED_CURRENCIES = [
  { code: 'USD', label: 'USD – US Dollar' },
  { code: 'EUR', label: 'EUR – Euro' },
  { code: 'GBP', label: 'GBP – British Pound' },
  { code: 'SAR', label: 'SAR – Saudi Riyal' },
  { code: 'AED', label: 'AED – UAE Dirham' },
  { code: 'EGP', label: 'EGP – Egyptian Pound' },
  { code: 'MAD', label: 'MAD – Moroccan Dirham' },
]

interface CreateProjectDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreateProject: (data: { name: string; templateId?: string; currencyCode?: string }) => Promise<any>
  locale: string
  /** Template translations from builder.templates */
  templateTranslations?: {
    title?: string
    subtitle?: string
    items?: Record<string, { name: string; description: string }>
    categories?: Record<string, string>
    orDescribe?: string
    skipTemplate?: string
  }
}

export function CreateProjectDialog({
  isOpen,
  onClose,
  onCreateProject,
  locale,
  templateTranslations
}: CreateProjectDialogProps) {
  const router = useRouter()
  const { showSuccess, showError, translations } = useDashboard()
  const [projectName, setProjectName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null)
  const [showNameInput, setShowNameInput] = useState(!templateTranslations)
  const [isCreating, setIsCreating] = useState(false)
  const [currencyCode, setCurrencyCode] = useState(LOCALE_CURRENCY[locale] || 'USD')

  // Ref to prevent double-submission race conditions
  const isProcessingRef = useRef(false)

  // Get free templates for the gallery
  const freeTemplates = useMemo(() => getFreeTemplates(), [])

  // Update currency when locale changes (user may switch locale while dialog is open)
  useEffect(() => {
    setCurrencyCode(LOCALE_CURRENCY[locale] || 'USD')
  }, [locale])

  const handleSelectTemplate = (templateId: TemplateId) => {
    setSelectedTemplate(templateId)
    // Auto-fill project name from template if empty
    const tpl = freeTemplates.find(t => t.id === templateId)
    if (tpl && !projectName.trim()) {
      const translatedName = templateTranslations?.items?.[templateId]?.name || templateId
      setProjectName(translatedName)
    }
    setShowNameInput(true)
  }

  const handleSkipTemplate = () => {
    setSelectedTemplate(null)
    setShowNameInput(true)
  }

  const handleBack = () => {
    if (templateTranslations && showNameInput) {
      setShowNameInput(false)
      setSelectedTemplate(null)
      setProjectName('')
    }
  }

  const handleCreate = async () => {
    if (!projectName.trim()) {
      showError('Project name is required')
      return
    }

    // Multi-layer double-submission prevention
    if (isCreating || isProcessingRef.current) {
      console.log('[NextJS] Dialog project creation blocked - already in progress:', {
        isCreating,
        isProcessingRef: isProcessingRef.current,
        projectName: projectName.slice(0, 50)
      });
      return
    }

    isProcessingRef.current = true
    setIsCreating(true)

    // Log project creation attempt for worker team debugging
    console.log('[NextJS] Starting project creation from dialog:', {
      timestamp: new Date().toISOString(),
      projectName,
      templateId: selectedTemplate,
      source: 'create-project-dialog',
      preventionLayer: 'multi-layer-guards-active'
    });

    try {
      const project = await onCreateProject({
        name: projectName.trim(),
        ...(selectedTemplate ? { templateId: selectedTemplate } : {}),
        currencyCode,
      })

      // Log successful dialog project creation for worker team debugging
      console.log('[NextJS] Dialog project creation successful:', {
        timestamp: new Date().toISOString(),
        projectId: project.id,
        projectName: project.name,
        templateId: selectedTemplate,
        source: 'create-project-dialog'
      });

      showSuccess(
        'Project created',
        `"${project.name}" has been created successfully`
      )

      logger.info('📱 Project created from dialog', {
        projectId: project.id.slice(0, 8),
        name: project.name,
        templateId: selectedTemplate
      })

      // Reset and close
      setProjectName('')
      setSelectedTemplate(null)
      setCurrencyCode(LOCALE_CURRENCY[locale] || 'USD')
      setShowNameInput(!templateTranslations)
      onClose()

      // Navigate to builder after a short delay
      setTimeout(() => {
        router.push(ROUTES.BUILDER_WORKSPACE(project.id))
      }, 500)

      // ✅ Trigger advisor matching in background (non-blocking)
      // Following backend team's recommendation: client-side, fire-and-forget
      triggerAdvisorMatch({ projectId: project.id }).catch(error => {
        logger.warn('Background advisor matching failed', {
          projectId: project.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        // Don't show error to user - they can manually request advisor later
      })

    } catch (error) {
      showError(
        'Failed to create project',
        error instanceof Error ? error.message : 'Unknown error'
      )
      logger.error('Failed to create project from dialog', error)
    } finally {
      // Always cleanup state in finally block
      setIsCreating(false)
      isProcessingRef.current = false
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCreate()
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose()
      // Reset state when closing
      setSelectedTemplate(null)
      setShowNameInput(!templateTranslations)
      setProjectName('')
      setCurrencyCode(LOCALE_CURRENCY[locale] || 'USD')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className={templateTranslations && !showNameInput ? 'sm:max-w-2xl' : 'sm:max-w-md'}>
        <DialogHeader>
          <DialogTitle>
            {templateTranslations && !showNameInput
              ? (templateTranslations.title || 'Choose a template')
              : 'Create New Project'}
          </DialogTitle>
          <DialogDescription>
            {templateTranslations && !showNameInput
              ? (templateTranslations.subtitle || 'Pick a template or describe your idea')
              : 'Give your project a name to get started. You can always change it later.'}
          </DialogDescription>
        </DialogHeader>

        {/* Template Gallery Step */}
        {templateTranslations && !showNameInput && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto">
              {freeTemplates.map((tpl) => {
                const itemT = templateTranslations.items?.[tpl.id]
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tpl.id)}
                    className="flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all hover:border-primary/50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    <span className="text-2xl">{tpl.emoji}</span>
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{itemT?.name || tpl.id}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {itemT?.description || ''}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={handleSkipTemplate}
              className="w-full text-sm text-muted-foreground hover:text-foreground py-2"
            >
              {templateTranslations.skipTemplate || 'Or describe your own idea'}
            </button>
          </div>
        )}

        {/* Name Input Step */}
        {showNameInput && (
          <div className="space-y-4 py-4">
            {selectedTemplate && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="text-lg">
                  {freeTemplates.find(t => t.id === selectedTemplate)?.emoji}
                </span>
                <span>{templateTranslations?.items?.[selectedTemplate]?.name || selectedTemplate}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="My Awesome Project"
                autoFocus
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency-select">Currency</Label>
              <select
                id="currency-select"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                disabled={isCreating}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {showNameInput && (
          <DialogFooter>
            {templateTranslations ? (
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isCreating}
              >
                Back
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isCreating}
              >
                Cancel
              </Button>
            )}
            <Button
              onClick={handleCreate}
              disabled={!projectName.trim() || isCreating}
            >
              {isCreating && <LoadingSpinner size="sm" className="mr-2" />}
              Create Project
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
