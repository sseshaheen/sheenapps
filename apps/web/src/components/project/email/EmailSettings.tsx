'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Save, Plus, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useInboxConfig, useUpdateInboxConfig } from '@/hooks/use-inbox-config'
import { useAddInboxAlias, useRemoveInboxAlias } from '@/hooks/use-inbox-aliases'

interface EmailSettingsProps {
  projectId: string
}

export function EmailSettings({ projectId }: EmailSettingsProps) {
  const t = useTranslations('project-email')
  const { data: config, isLoading } = useInboxConfig(projectId)
  const updateConfig = useUpdateInboxConfig(projectId)

  const [displayName, setDisplayName] = useState('')
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [autoReplyMessage, setAutoReplyMessage] = useState('')
  const [forwardTo, setForwardTo] = useState('')
  const [retentionDays, setRetentionDays] = useState<number | undefined>(undefined)
  const [newAlias, setNewAlias] = useState('')
  const addAlias = useAddInboxAlias(projectId)
  const removeAlias = useRemoveInboxAlias(projectId)

  useEffect(() => {
    if (config) {
      setDisplayName(config.displayName ?? '')
      setAutoReplyEnabled(config.autoReplyEnabled)
      setAutoReplyMessage(config.autoReplyMessage ?? '')
      setForwardTo(config.forwardTo ?? '')
      setRetentionDays(config.retentionDays)
    }
  }, [config])

  async function handleSave() {
    try {
      await updateConfig.mutateAsync({
        displayName: displayName || undefined,
        autoReplyEnabled,
        autoReplyMessage: autoReplyMessage || undefined,
        forwardTo: forwardTo || undefined,
        retentionDays,
      })
      toast.success(t('settings.saved'))
    } catch (error) {
      toast.error(t('common.error'))
    }
  }

  async function handleAddAlias() {
    if (!newAlias.trim()) return
    try {
      await addAlias.mutateAsync(newAlias.trim())
      setNewAlias('')
      toast.success(t('settings.saved'))
    } catch (error: any) {
      toast.error(error.message || t('common.error'))
    }
  }

  async function handleRemoveAlias(alias: string) {
    try {
      await removeAlias.mutateAsync(alias)
      toast.success(t('settings.saved'))
    } catch (error: any) {
      toast.error(error.message || t('common.error'))
    }
  }

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Display Name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('settings.displayName')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My Project"
          />
        </CardContent>
      </Card>

      {/* Auto-Reply */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{t('settings.autoReply')}</CardTitle>
            <Switch
              checked={autoReplyEnabled}
              onCheckedChange={setAutoReplyEnabled}
            />
          </div>
        </CardHeader>
        {autoReplyEnabled && (
          <CardContent>
            <label className="text-sm text-muted-foreground">{t('settings.autoReplyMessage')}</label>
            <Textarea
              value={autoReplyMessage}
              onChange={(e) => setAutoReplyMessage(e.target.value)}
              className="mt-1.5"
              rows={4}
              placeholder="Thank you for your email. We'll get back to you soon."
            />
          </CardContent>
        )}
      </Card>

      {/* Forwarding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('settings.forwardTo')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="email"
            value={forwardTo}
            onChange={(e) => setForwardTo(e.target.value)}
            placeholder="you@example.com"
          />
        </CardContent>
      </Card>

      {/* Retention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('settings.retentionDays')}</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm"
            value={retentionDays ?? ''}
            onChange={(e) => setRetentionDays(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Forever</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">365 days</option>
          </select>
        </CardContent>
      </Card>

      {/* Aliases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('settings.aliases')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {config?.aliases?.length ? (
            <div className="flex flex-wrap gap-2">
              {config.aliases.map((alias) => (
                <Badge key={alias} variant="secondary" className="gap-1 pe-1">
                  <span className="font-mono text-xs">{alias}</span>
                  <button
                    type="button"
                    className="hover:text-destructive transition-colors p-0.5"
                    onClick={() => handleRemoveAlias(alias)}
                    disabled={removeAlias.isPending && removeAlias.variables === alias}
                  >
                    {removeAlias.isPending && removeAlias.variables === alias ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Input
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="alias"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()}
            />
            <Button
              variant="outline" size="sm"
              onClick={handleAddAlias}
              disabled={addAlias.isPending || !newAlias.trim()}
            >
              {addAlias.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 me-1" />
              )}
              {t('settings.addAlias')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={updateConfig.isPending}>
        {updateConfig.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin me-1.5" />
        ) : (
          <Save className="h-4 w-4 me-1.5" />
        )}
        {t('common.save')}
      </Button>
    </div>
  )
}
