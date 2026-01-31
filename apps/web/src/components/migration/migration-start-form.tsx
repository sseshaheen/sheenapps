/**
 * Migration Start Form Component
 * Expert-enhanced form with clipboard detection, presets, and idempotency
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from '@/i18n/routing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { MIGRATION_PRESETS, type MigrationPreset } from '@/types/migration'
import { logger } from '@/utils/logger'

interface MigrationStartFormTranslations {
  page: {
    startForm: {
      urlLabel: string
      urlPlaceholder: string
      urlDescription: string
      migrationStyleLabel: string
      customInstructions: string
      customInstructionsOptional: string
      customInstructionsPlaceholder: string
      customInstructionsDescription: string
      estimatedTimeLabel: string
      estimatedTimeActual: string
      submitButton: string
      submittingButton: string
      pasteButton: string
      urlDetectedToast: string
      urlPastedToast: string
      urlRequiredError: string
      urlInvalidError: string
      rateLimitError: string
      migrationStartedToast: string
      migrationFailedToast: string
      disclaimers: {
        usesAiTime: string
        publicAccess: string
        manualAdjustment: string
      }
      presets: {
        exactCopy: {
          name: string
          description: string
        }
        modernRefresh: {
          name: string
          description: string
        }
        completeOverhaul: {
          name: string
          description: string
        }
      }
    }
  }
  common: {
    minutes: string
    minute: string
  }
}

interface MigrationStartFormProps {
  translations: MigrationStartFormTranslations
  onSubmit?: (url: string, prompt?: string, preset?: string) => Promise<void>
  enableClipboardDetection?: boolean
  showEstimate?: boolean
  isLoading?: boolean
}

export function MigrationStartForm({
  translations,
  onSubmit,
  enableClipboardDetection = true,
  showEstimate = true,
  isLoading: externalLoading = false
}: MigrationStartFormProps) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [prompt, setPrompt] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null)
  const [clipboardDetected, setClipboardDetected] = useState(false)

  const urlInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const loading = externalLoading || isLoading

  const t = translations.page.startForm
  const tCommon = translations.common

  // Map preset IDs to translations
  const getPresetTranslation = (presetId: string) => {
    switch (presetId) {
      case 'preserve':
        return t.presets.exactCopy
      case 'modernize':
        return t.presets.modernRefresh
      case 'redesign':
        return t.presets.completeOverhaul
      default:
        return { name: presetId, description: '' }
    }
  }

  // Expert: Clipboard detection with proper permissions and focus detection
  useEffect(() => {
    if (!enableClipboardDetection || !('clipboard' in navigator)) return

    let timeoutId: ReturnType<typeof setTimeout>

    const detectClipboardUrl = async () => {
      try {
        // Only run when URL input is focused
        if (document.activeElement !== urlInputRef.current) return

        // Check if we have permission to read clipboard
        const permission = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName })
        if (permission.state === 'denied') return

        const clipboardText = await navigator.clipboard.readText()

        // Validate it's a URL and not already in the input
        if (clipboardText !== url &&
            (clipboardText.startsWith('https://') || clipboardText.startsWith('http://')) &&
            clipboardText.length < 2048) {

          setClipboardDetected(true)

          // Auto-fill if input is empty and focused
          if (!url.trim() && document.activeElement === urlInputRef.current) {
            setUrl(clipboardText)
            setClipboardDetected(false)
            toast.success(t.urlDetectedToast)
          }
        }
      } catch (error) {
        // Silently fail - clipboard detection is optional
      }
    }

    const handleFocus = () => {
      timeoutId = setTimeout(detectClipboardUrl, 500)
    }

    const handleBlur = () => {
      if (timeoutId) clearTimeout(timeoutId)
      setClipboardDetected(false)
    }

    const urlInput = urlInputRef.current
    if (urlInput) {
      urlInput.addEventListener('focus', handleFocus)
      urlInput.addEventListener('blur', handleBlur)
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (urlInput) {
        urlInput.removeEventListener('focus', handleFocus)
        urlInput.removeEventListener('blur', handleBlur)
      }
    }
  }, [enableClipboardDetection, url, t.urlDetectedToast])

  // Update estimated time when preset changes
  useEffect(() => {
    if (selectedPreset) {
      const preset = MIGRATION_PRESETS.find(p => p.id === selectedPreset)
      if (preset) {
        setEstimatedTime(preset.estimatedTime)
        setPrompt(preset.prompt)
      }
    } else {
      setEstimatedTime(null)
    }
  }, [selectedPreset])

  // Validate URL format
  const isValidUrl = (urlString: string): boolean => {
    try {
      const url = new URL(urlString)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  // Handle preset selection
  const handlePresetSelect = (preset: MigrationPreset) => {
    setSelectedPreset(preset.id)
    setPrompt(preset.prompt)
    setEstimatedTime(preset.estimatedTime)
  }

  // Clear preset when prompt is manually edited
  const handlePromptChange = (value: string) => {
    setPrompt(value)
    // Clear preset if prompt doesn't match any preset
    if (selectedPreset) {
      const preset = MIGRATION_PRESETS.find(p => p.id === selectedPreset)
      if (preset && value !== preset.prompt) {
        setSelectedPreset('')
        setEstimatedTime(null)
      }
    }
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!url.trim()) {
      toast.error(t.urlRequiredError)
      urlInputRef.current?.focus()
      return
    }

    if (!isValidUrl(url.trim())) {
      toast.error(t.urlInvalidError)
      urlInputRef.current?.focus()
      return
    }

    setIsLoading(true)

    try {
      // Expert: Client generates idempotency key for retries (with fallback for older browsers)
      const idempotencyKey = window.crypto?.randomUUID?.() ||
        'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0
          const v = c === 'x' ? r : (r & 0x3 | 0x8)
          return v.toString(16)
        })

      // Call migration API
      const response = await fetch('/api/migration/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({
          sourceUrl: url.trim(),
          prompt: prompt.trim() || undefined,
          userBrief: {
            preset: selectedPreset || undefined,
            estimatedTime: estimatedTime || undefined
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json()

        if (response.status === 429) {
          // Rate limiting - extract seconds from error message
          const seconds = errorData.retryAfter || 60
          toast.error(t.rateLimitError.replace('{seconds}', seconds.toString()))
          return
        }

        throw new Error(errorData.message || t.migrationFailedToast)
      }

      const result = await response.json()

      logger.info('Migration started successfully', {
        migrationId: result.migrationId,
        correlationId: result.correlationId
      })

      toast.success(t.migrationStartedToast)

      // Redirect to migration progress page
      router.push(`/migrate/${result.migrationId}`)

      // Call external onSubmit if provided
      if (onSubmit) {
        await onSubmit(url.trim(), prompt.trim() || undefined, selectedPreset || undefined)
      }

    } catch (error) {
      logger.error('Migration start failed', { error })
      toast.error(error instanceof Error ? error.message : t.migrationFailedToast)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {/* URL Input */}
      <div className="space-y-2">
        <Label htmlFor="url-input">{t.urlLabel}</Label>
        <div className="relative">
          <Input
            id="url-input"
            ref={urlInputRef}
            type="url"
            placeholder={t.urlPlaceholder}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            className="pr-20"
            required
          />
          {clipboardDetected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-8 px-2"
              onClick={() => {
                navigator.clipboard.readText().then(text => {
                  setUrl(text)
                  setClipboardDetected(false)
                  toast.success(t.urlPastedToast)
                })
              }}
            >
              {t.pasteButton}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t.urlDescription}
        </p>
      </div>

      {/* Migration Presets */}
      <div className="space-y-3">
        <Label>{t.migrationStyleLabel}</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MIGRATION_PRESETS.map((preset) => {
            const presetTranslation = getPresetTranslation(preset.id)
            return (
              <Card
                key={preset.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedPreset === preset.id
                    ? 'ring-2 ring-primary bg-primary/5'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => handlePresetSelect(preset)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{presetTranslation.name}</h4>
                    <Badge variant="outline" className="text-xs">
                      {Math.round(preset.estimatedTime / 60)} {tCommon.minute}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {presetTranslation.description}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Custom Prompt */}
      <div className="space-y-2">
        <Label htmlFor="prompt-input">
          {t.customInstructions}{' '}
          <span className="text-muted-foreground font-normal">{t.customInstructionsOptional}</span>
        </Label>
        <Textarea
          id="prompt-input"
          placeholder={t.customInstructionsPlaceholder}
          value={prompt}
          onChange={(e) => handlePromptChange(e.target.value)}
          disabled={loading}
          rows={4}
          maxLength={5000}
        />
        <div className="flex justify-between items-center text-sm text-muted-foreground">
          <span>
            {t.customInstructionsDescription}
          </span>
          <span>{prompt.length}/5000</span>
        </div>
      </div>

      {/* Estimated Time Display */}
      {showEstimate && estimatedTime && (
        <div className="bg-muted/50 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t.estimatedTimeLabel}</span>
            <Badge variant="secondary">
              {Math.round(estimatedTime / 60)} {tCommon.minutes}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t.estimatedTimeActual}
          </p>
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={loading || !url.trim()}
        className="w-full"
        size="lg"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
            {t.submittingButton}
          </>
        ) : (
          t.submitButton
        )}
      </Button>

      {/* Disclaimers */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          • {t.disclaimers.usesAiTime}
        </p>
        <p>
          • {t.disclaimers.publicAccess}
        </p>
        <p>
          • {t.disclaimers.manualAdjustment}
        </p>
      </div>
    </form>
  )
}
