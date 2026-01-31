"use client"

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Icon from '@/components/ui/icon'
import { useTranslations } from 'next-intl'
import { useToastWithUndo } from '@/components/ui/toast-with-undo'

interface NotificationPreferences {
  enabled?: boolean
  email_on_lead?: boolean
  email_on_payment?: boolean
  email_on_payment_failed?: boolean
  email_on_abandoned_checkout?: boolean
  email_recipient?: string
  daily_digest_enabled?: boolean
  daily_digest_hour?: number
}

// EXPERT FIX: Normalize preferences to explicit booleans to avoid "mystery toggles"
// This ensures consistent behavior - no more treating undefined as true/false inconsistently
type NormalizedPrefs = Required<NotificationPreferences>

// Type-safe toggle keys - only boolean fields can be toggled
type BooleanPrefKeys = {
  [K in keyof NotificationPreferences]: NotificationPreferences[K] extends boolean | undefined ? K : never
}[keyof NotificationPreferences]

const normalizePrefs = (p?: NotificationPreferences): NormalizedPrefs => ({
  enabled: p?.enabled ?? false,
  email_on_lead: p?.email_on_lead ?? true,
  email_on_payment: p?.email_on_payment ?? true,
  email_on_payment_failed: p?.email_on_payment_failed ?? true,
  email_on_abandoned_checkout: p?.email_on_abandoned_checkout ?? false,
  email_recipient: p?.email_recipient ?? '',
  daily_digest_enabled: p?.daily_digest_enabled ?? false,
  daily_digest_hour: p?.daily_digest_hour ?? 9
})

// Simple email validation regex
const isValidEmail = (email: string): boolean => {
  if (!email) return true // Empty is valid (uses owner email)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

interface RunNotificationsContentProps {
  projectId: string
  initialPrefs?: NotificationPreferences
}

export function RunNotificationsContent({ projectId, initialPrefs }: RunNotificationsContentProps) {
  const t = useTranslations('run')
  const { success, error } = useToastWithUndo()

  // EXPERT FIX: Use normalized prefs for consistent behavior
  const [baseline, setBaseline] = useState<NormalizedPrefs>(() => normalizePrefs(initialPrefs))
  const [prefs, setPrefs] = useState<NormalizedPrefs>(baseline)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // EXPERT FIX: Client-side email validation
  const emailOk = isValidEmail(prefs.email_recipient)

  // Track changes against baseline (not initialPrefs which never updates)
  useEffect(() => {
    const changed = JSON.stringify(prefs) !== JSON.stringify(baseline)
    setHasChanges(changed)
  }, [prefs, baseline])

  const handleToggle = (key: BooleanPrefKeys) => {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleEmailChange = (value: string) => {
    setPrefs(prev => ({ ...prev, email_recipient: value }))
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/run/overview`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications: prefs })
      })
      const json = await res.json()

      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || 'Failed to save')
      }

      // Update baseline to current prefs - this makes hasChanges false via the effect
      setBaseline(prefs)
      success(t('notifications.saved'))
    } catch (err) {
      error(t('notifications.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [projectId, prefs, t, success, error])

  // EXPERT FIX: Now using normalized prefs, enabled is always explicit boolean
  const isEnabled = prefs.enabled

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="bell" className="w-5 h-5" />
            {t('notifications.title')}
          </CardTitle>
          <CardDescription>
            {t('notifications.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Icon name="plug" className="w-5 h-5 text-muted-foreground" />
              <Label htmlFor="notifications-enabled" className="font-medium">
                {t('notifications.enabled')}
              </Label>
            </div>
            <Switch
              id="notifications-enabled"
              checked={isEnabled}
              onCheckedChange={() => handleToggle('enabled')}
            />
          </div>

          {/* Individual Settings */}
          <div className={`space-y-4 ${!isEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Email on Lead */}
            <div className="flex items-start justify-between py-3 border-b border-border/50">
              <div className="space-y-1">
                <Label htmlFor="email-on-lead" className="font-medium">
                  {t('notifications.emailOnLead')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('notifications.emailOnLeadDesc')}
                </p>
              </div>
              <Switch
                id="email-on-lead"
                checked={prefs.email_on_lead !== false}
                onCheckedChange={() => handleToggle('email_on_lead')}
              />
            </div>

            {/* Email on Payment */}
            <div className="flex items-start justify-between py-3 border-b border-border/50">
              <div className="space-y-1">
                <Label htmlFor="email-on-payment" className="font-medium">
                  {t('notifications.emailOnPayment')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('notifications.emailOnPaymentDesc')}
                </p>
              </div>
              <Switch
                id="email-on-payment"
                checked={prefs.email_on_payment !== false}
                onCheckedChange={() => handleToggle('email_on_payment')}
              />
            </div>

            {/* Email on Payment Failed */}
            <div className="flex items-start justify-between py-3 border-b border-border/50">
              <div className="space-y-1">
                <Label htmlFor="email-on-payment-failed" className="font-medium">
                  {t('notifications.emailOnPaymentFailed')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('notifications.emailOnPaymentFailedDesc')}
                </p>
              </div>
              <Switch
                id="email-on-payment-failed"
                checked={prefs.email_on_payment_failed !== false}
                onCheckedChange={() => handleToggle('email_on_payment_failed')}
              />
            </div>

            {/* Email on Abandoned Checkout */}
            <div className="flex items-start justify-between py-3 border-b border-border/50">
              <div className="space-y-1">
                <Label htmlFor="email-on-abandoned" className="font-medium">
                  {t('notifications.emailOnAbandonedCheckout')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('notifications.emailOnAbandonedCheckoutDesc')}
                </p>
              </div>
              <Switch
                id="email-on-abandoned"
                checked={prefs.email_on_abandoned_checkout === true}
                onCheckedChange={() => handleToggle('email_on_abandoned_checkout')}
              />
            </div>

            {/* Email Recipient */}
            <div className="space-y-2 pt-2">
              <Label htmlFor="email-recipient" className="font-medium">
                {t('notifications.emailRecipient')}
              </Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="email-recipient"
                  type="email"
                  placeholder={t('notifications.emailRecipientPlaceholder')}
                  value={prefs.email_recipient || ''}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  className={`flex-1 min-h-[44px] sm:min-h-[36px] ${!emailOk ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap min-h-[44px] sm:min-h-[32px] w-full sm:w-auto"
                  onClick={() => handleEmailChange('')}
                >
                  {t('notifications.useOwnerEmail')}
                </Button>
              </div>
              {/* EXPERT FIX: Show validation error inline */}
              {!emailOk ? (
                <p className="text-xs text-red-600">
                  {t('notifications.invalidEmail')}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {prefs.email_recipient
                    ? t('notifications.emailWillBeSentTo', { email: prefs.email_recipient })
                    : t('notifications.emailWillUseOwner')}
                </p>
              )}
            </div>
          </div>

          {/* Daily Digest Settings */}
          <div className="border-t border-border/50 pt-6 mt-6">
            <h3 className="font-medium text-base mb-4 flex items-center gap-2">
              <Icon name="mail" className="w-4 h-4" />
              {t('notifications.digestSettings')}
            </h3>

            <div className={`space-y-4 ${!isEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
              {/* Daily Digest Toggle */}
              <div className="flex items-start justify-between py-3 border-b border-border/50">
                <div className="space-y-1">
                  <Label htmlFor="daily-digest" className="font-medium">
                    {t('notifications.dailyDigest')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('notifications.dailyDigestDesc')}
                  </p>
                </div>
                <Switch
                  id="daily-digest"
                  checked={prefs.daily_digest_enabled === true}
                  onCheckedChange={() => handleToggle('daily_digest_enabled')}
                />
              </div>

              {/* Digest Time Selection */}
              {prefs.daily_digest_enabled && (
                <div className="flex items-center gap-3 py-2">
                  <Label htmlFor="digest-hour" className="font-medium whitespace-nowrap">
                    {t('notifications.digestTime')}
                  </Label>
                  <Select
                    value={prefs.daily_digest_hour?.toString() ?? '9'}
                    onValueChange={(v) => setPrefs(prev => ({ ...prev, daily_digest_hour: parseInt(v, 10) }))}
                  >
                    <SelectTrigger id="digest-hour" className="w-[140px] min-h-[44px] sm:min-h-[36px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i.toString().padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">
                    {t('notifications.digestTimezone')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges || !emailOk}
              className="min-w-[120px] min-h-[44px] sm:min-h-[36px]"
            >
              {saving ? (
                <Icon name="loader-2" className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Icon name="check" className="w-4 h-4 me-2" />
                  {t('notifications.save')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
