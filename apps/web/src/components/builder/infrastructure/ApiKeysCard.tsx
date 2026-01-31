/**
 * API Keys Card Component
 *
 * Milestone C - Day 2 Afternoon
 *
 * Enhanced with:
 * - Toast notifications for copy actions
 * - Improved visual hierarchy
 * - Status badges for key types
 * - Better mobile responsiveness
 * - API key regeneration with 15-minute rotation (Task 4)
 */

'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Icon from '@/components/ui/icon'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { copyToClipboard } from '@/lib/utils/clipboard'
import type { ApiKeysInfo } from '@/types/inhouse-api'
import { useState, useMemo, useEffect } from 'react'
import { useLocale } from 'next-intl'
import { trackDevIntent } from '@/hooks/use-workspace-mode'

interface ApiKeysCardProps {
  projectId: string
  keys: ApiKeysInfo
  /** Callback after key is regenerated - parent should refetch */
  onKeyRegenerated?: () => void
  translations: {
    title: string
    publicKey: string
    serverKey: string
    hidden: string
    serverKeyShownOnce: string
    noServerKey: string
    status: {
      active: string
      notCreated: string
      expiring: string
    }
    actions: {
      copy: string
      copied: string
      copySuccess: string
      copyError: string
      copyDescription: string
      copyErrorDescription: string
      regenerate: string
      regenerating: string
    }
    hints: {
      public: string
      server: string
    }
    sdk: {
      title: string
      description: string
      copy: string
      note: string
    }
    regenerate: {
      confirmTitle: string
      confirmDescription: string
      warning: string
      cancel: string
      confirm: string
      success: string
      successDescription: string
      error: string
      newKeyLabel: string
      oldKeyExpires: string
    }
  }
}

/**
 * API Keys Card Component
 *
 * Displays public and server API keys with copy functionality.
 * Shows toast notifications on copy success/failure (Milestone C enhancement).
 * Supports key regeneration with 15-minute rotation (Task 4).
 */
export function ApiKeysCard({ projectId, keys, onKeyRegenerated, translations }: ApiKeysCardProps) {
  const [copiedKey, setCopiedKey] = useState<'public' | 'server' | null>(null)
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false)
  const [regenerateKeyType, setRegenerateKeyType] = useState<'public' | 'server' | null>(null)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [newKeyData, setNewKeyData] = useState<{
    newKey: string
    oldKeyExpiresAt: string
  } | null>(null)
  const { success, error: showError } = useToast()

  // EXPERT FIX ROUND 7: Locale-aware time formatting
  const locale = useLocale()
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeStyle: 'short', dateStyle: 'medium' }),
    [locale]
  )

  // Track dev intent when API Keys card is viewed
  // This is a strong signal the user is a developer
  useEffect(() => {
    trackDevIntent('hasViewedApiKeys')
  }, [])
  // SDK snippet uses placeholder since full key is only shown at creation/regeneration time
  // Users should copy their key when regenerating and store it securely
  const sdkSnippet = `import { createClient as createDbClient } from '@sheenapps/db'
import { createClient as createCmsClient } from '@sheenapps/cms'

const db = createDbClient({
  projectId: '${projectId}',
  apiKey: process.env.SHEEN_PK // Your public key (${keys.publicKey}...)
})

const cms = createCmsClient({
  apiKey: process.env.SHEEN_PK
})`

  const handleCopy = async (key: string, keyType: 'public' | 'server') => {
    try {
      // EXPERT FIX ROUND 2: Use clipboard helper with Safari fallback
      await copyToClipboard(key)
      setCopiedKey(keyType)

      // Milestone C: Toast notification for copy success
      const keyTypeLabel = keyType === 'server' ? translations.serverKey : translations.publicKey
      success(translations.actions.copySuccess, {
        description: translations.actions.copyDescription.replace('{keyType}', keyTypeLabel)
      })

      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      // Milestone C: Toast notification for copy failure
      showError(translations.actions.copyError, {
        description: translations.actions.copyErrorDescription
      })
    }
  }

  const handleCopySnippet = async () => {
    try {
      await copyToClipboard(sdkSnippet)
      setCopiedSnippet(true)
      success(translations.actions.copySuccess, {
        description: translations.sdk.description
      })
      setTimeout(() => setCopiedSnippet(false), 2000)
    } catch {
      showError(translations.actions.copyError, {
        description: translations.actions.copyErrorDescription
      })
    }
  }

  // Handle regenerate confirmation
  const handleRegenerateClick = (keyType: 'public' | 'server') => {
    setRegenerateKeyType(keyType)
    setNewKeyData(null)
    setRegenerateDialogOpen(true)
  }

  // Execute key regeneration
  const handleRegenerateConfirm = async () => {
    if (!regenerateKeyType) return

    setIsRegenerating(true)
    try {
      const response = await fetch(
        `/api/inhouse/projects/${projectId}/api-keys/${regenerateKeyType}/regenerate`,
        { method: 'POST' }
      )

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || 'Failed to regenerate key')
      }

      // Show the new key
      setNewKeyData({
        newKey: data.data.newKey,
        oldKeyExpiresAt: data.data.oldKeyExpiresAt,
      })

      success(translations.regenerate.success, {
        description: translations.regenerate.successDescription,
      })

      // Notify parent to refetch
      onKeyRegenerated?.()
    } catch (err) {
      showError(translations.regenerate.error, {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
      setRegenerateDialogOpen(false)
    } finally {
      setIsRegenerating(false)
    }
  }

  // Copy newly generated key
  const handleCopyNewKey = async () => {
    if (!newKeyData) return
    try {
      await copyToClipboard(newKeyData.newKey)
      success(translations.actions.copySuccess, {
        description: translations.actions.copyDescription.replace(
          '{keyType}',
          regenerateKeyType === 'server' ? translations.serverKey : translations.publicKey
        ),
      })
    } catch {
      showError(translations.actions.copyError, {
        description: translations.actions.copyErrorDescription,
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Icon name="shield" className="w-4 h-4 text-primary" />
          {translations.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Public Key */}
          <div
            className={cn(
              'space-y-2 p-3 border border-border rounded-lg',
              'hover:border-primary/50 hover:bg-muted/30 transition-all duration-200'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Badge variant="default" className="flex-shrink-0">
                  <Icon name="shield" className="w-3 h-3 me-1" />
                  {translations.publicKey}
                </Badge>
                <span className="text-xs text-success font-medium">{translations.status.active}</span>
              </div>
              {/* Copy button removed - prefix isn't usable, use Regenerate to get full key */}
            </div>
            <code className="block text-xs bg-muted/50 px-2 py-1.5 rounded overflow-x-auto font-mono border border-border/50">
              {keys.publicKey}••••••••••••••••
            </code>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {translations.hints.public}
            </p>
            {/* Regenerate button for public key */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRegenerateClick('public')}
              className="w-full mt-2"
            >
              <Icon name="refresh-cw" className="w-3 h-3 me-1" />
              {translations.actions.regenerate}
            </Button>
          </div>

          {/* Server Key */}
          <div
            className={cn(
              'space-y-2 p-3 border rounded-lg',
              keys.hasServerKey
                ? 'border-border hover:border-primary/50 hover:bg-muted/30 transition-all duration-200'
                : 'border-dashed border-muted-foreground/30 bg-muted/20'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Badge
                  variant={keys.hasServerKey ? 'destructive' : 'outline'}
                  className="flex-shrink-0"
                >
                  <Icon
                    name={keys.hasServerKey ? 'shield' : 'shield-off'}
                    className="w-3 h-3 me-1"
                  />
                  {translations.serverKey}
                </Badge>
                {keys.hasServerKey ? (
                  <span className="text-xs text-success font-medium">{translations.status.active}</span>
                ) : (
                  <span className="text-xs text-muted-foreground font-medium">{translations.status.notCreated}</span>
                )}
              </div>
              {keys.hasServerKey && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 flex-shrink-0"
                  disabled
                >
                  <Icon name="eye-off" className="w-3 h-3 me-1" />
                  <span className="text-xs">{translations.hidden}</span>
                </Button>
              )}
            </div>

            {keys.hasServerKey ? (
              <>
                <code className="block text-xs bg-muted/50 px-2 py-1.5 rounded font-mono border border-border/50">
                  sheen_sk_••••••••••••••••
                </code>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {translations.hints.server}
                </p>
                <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 p-2 rounded-md border border-warning/20">
                  <Icon name="alert-triangle" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span className="leading-relaxed">{translations.serverKeyShownOnce}</span>
                </div>
                {/* Regenerate button */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRegenerateClick('server')}
                  className="w-full mt-2"
                >
                  <Icon name="refresh-cw" className="w-3 h-3 me-1" />
                  {translations.actions.regenerate}
                </Button>
              </>
            ) : (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                <Icon name="info" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">{translations.noServerKey}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-foreground">{translations.sdk.title}</div>
            <Button size="sm" variant="ghost" onClick={handleCopySnippet} className="h-7 px-2">
              <Icon
                name={copiedSnippet ? 'check' : 'copy'}
                className={cn('w-3 h-3 me-1', copiedSnippet && 'text-success')}
              />
              <span className="text-xs">
                {copiedSnippet ? translations.actions.copied : translations.sdk.copy}
              </span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{translations.sdk.description}</p>
          <code className="block text-xs bg-background/80 px-2 py-2 rounded font-mono border border-border/50 whitespace-pre-wrap">
            {sdkSnippet}
          </code>
          <p className="text-xs text-muted-foreground">{translations.sdk.note}</p>
        </div>

        {/* Regenerate Key Dialog */}
        <Dialog
          open={regenerateDialogOpen}
          onOpenChange={(open) => {
            if (!open && !isRegenerating) {
              setRegenerateDialogOpen(false)
              setNewKeyData(null)
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {translations.regenerate.confirmTitle.replace(
                  '{keyType}',
                  regenerateKeyType === 'server' ? translations.serverKey : translations.publicKey
                )}
              </DialogTitle>
              <DialogDescription>
                {newKeyData ? (
                  translations.regenerate.successDescription
                ) : (
                  translations.regenerate.confirmDescription
                )}
              </DialogDescription>
            </DialogHeader>

            {newKeyData ? (
              // Show new key after successful regeneration
              <div className="space-y-4">
                <div className="p-3 bg-success/10 border border-success/30 rounded-lg space-y-2">
                  <div className="text-sm font-medium text-success">
                    {translations.regenerate.newKeyLabel}
                  </div>
                  <code className="block text-xs bg-background px-2 py-1.5 rounded font-mono border overflow-x-auto">
                    {newKeyData.newKey}
                  </code>
                  <Button size="sm" variant="outline" onClick={handleCopyNewKey} className="w-full">
                    <Icon name="copy" className="w-3 h-3 me-1" />
                    {translations.actions.copy}
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  {translations.regenerate.oldKeyExpires.replace(
                    '{time}',
                    timeFormatter.format(new Date(newKeyData.oldKeyExpiresAt))
                  )}
                </div>
              </div>
            ) : (
              // Confirmation before regeneration
              <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
                <div className="flex items-start gap-2 text-sm text-warning">
                  <Icon name="alert-triangle" className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{translations.regenerate.warning}</span>
                </div>
              </div>
            )}

            <DialogFooter>
              {newKeyData ? (
                <Button onClick={() => setRegenerateDialogOpen(false)}>
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setRegenerateDialogOpen(false)}
                    disabled={isRegenerating}
                  >
                    {translations.regenerate.cancel}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleRegenerateConfirm}
                    disabled={isRegenerating}
                  >
                    {isRegenerating ? (
                      <>
                        <Icon name="loader-2" className="w-4 h-4 me-1 animate-spin" />
                        {translations.actions.regenerating}
                      </>
                    ) : (
                      translations.regenerate.confirm
                    )}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
