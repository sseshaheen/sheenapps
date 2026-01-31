/**
 * Partner Signup Modal Component
 * Handles new partner registration for SheenApps Friends
 */

'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ReferralService, CreatePartnerRequest, withReferralErrorHandling } from '@/services/referral-service'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/ui/loading'
import { CheckCircle, Copy, ExternalLink } from 'lucide-react'

interface PartnerSignupModalProps {
  userId: string
  onSuccess: (result: { partner: any; referral_link: string }) => void
  onCancel: () => void
}

export function PartnerSignupModal({ userId, onSuccess, onCancel }: PartnerSignupModalProps) {
  const t = useTranslations('referral')
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [formData, setFormData] = useState<Partial<CreatePartnerRequest>>({
    terms_accepted: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ partner: any; referral_link: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.terms_accepted) {
      toast.error(t('signup.termsRequired'))
      return
    }

    setIsSubmitting(true)

    try {
      const payload = { ...formData } as CreatePartnerRequest
      const createPartnerWithErrorHandling = withReferralErrorHandling(ReferralService.createPartner)
      const response = await createPartnerWithErrorHandling(payload)
      
      if (response.success) {
        setResult(response)
        setStep('success')
        
        // Copy referral link to clipboard
        try {
          await navigator.clipboard.writeText(response.referral_link)
          toast.success(t('signup.successWithCopy'))
        } catch {
          toast.success(t('signup.success'))
        }
      }
    } catch (error: any) {
      console.error('Partner signup error:', error)
      toast.error(error.message || t('signup.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyLink = async () => {
    if (!result?.referral_link) return
    
    try {
      await navigator.clipboard.writeText(result.referral_link)
      toast.success(t('dashboard.linkCopied'))
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = result.referral_link
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      toast.success(t('dashboard.linkCopied'))
    }
  }

  const handleComplete = () => {
    if (result) {
      onSuccess(result)
    }
  }

  if (step === 'success' && result) {
    return (
      <Dialog open onOpenChange={onCancel}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-center pb-4">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <DialogTitle className="text-xl">
              {t('success.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-center">
              <h3 className="font-semibold text-green-600 mb-2">
                {t('success.subtitle')}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('success.description')}
              </p>
            </div>

            {/* Referral Link */}
            <div className="bg-muted p-4 rounded-lg">
              <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                {t('success.linkLabel')}
              </Label>
              <div className="flex items-center gap-2">
                <code className="bg-background px-3 py-2 rounded text-xs flex-1 break-all">
                  {result.referral_link}
                </code>
                <Button onClick={handleCopyLink} size="sm" variant="outline">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Partner Code */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {t('success.codeLabel')}: <strong>{result.partner.partner_code}</strong>
              </p>
            </div>

            {/* Next Steps */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                {t('success.nextStepsTitle')}
              </h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• {t('success.nextStep1')}</li>
                <li>• {t('success.nextStep2')}</li>
                <li>• {t('success.nextStep3')}</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleComplete} className="flex-1">
                {t('success.goToDashboard')}
              </Button>
              <Button variant="outline" asChild>
                <a href="/legal/referral-terms" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  {t('success.viewTerms')}
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('signup.title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company Name */}
          <div>
            <Label htmlFor="company_name">{t('signup.companyName')} {t('signup.optional')}</Label>
            <Input
              id="company_name"
              type="text"
              value={formData.company_name || ''}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              placeholder={t('signup.companyNamePlaceholder')}
            />
          </div>

          {/* Website */}
          <div>
            <Label htmlFor="website_url">{t('signup.website')} {t('signup.optional')}</Label>
            <Input
              id="website_url"
              type="url"
              value={formData.website_url || ''}
              onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
              placeholder="https://yoursite.com"
            />
          </div>

          {/* Marketing Channels */}
          <div>
            <Label className="text-sm font-medium mb-3 block">{t('signup.marketingChannels')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {['blog', 'youtube', 'twitter', 'linkedin', 'newsletter', 'other'].map(channel => (
                <label key={channel} className="flex items-center space-x-2 text-sm">
                  <Checkbox
                    checked={formData.marketing_channels?.includes(channel) || false}
                    onCheckedChange={(checked) => {
                      const channels = formData.marketing_channels || []
                      if (checked) {
                        setFormData({
                          ...formData,
                          marketing_channels: [...channels, channel]
                        })
                      } else {
                        setFormData({
                          ...formData,
                          marketing_channels: channels.filter(c => c !== channel)
                        })
                      }
                    }}
                  />
                  <span className="capitalize">{t(`signup.channels.${channel}`)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Payout Method */}
          <div>
            <Label>{t('signup.payoutMethod')}</Label>
            <Select value={formData.payout_method || ''} onValueChange={(value) => 
              setFormData({ ...formData, payout_method: value as any })
            }>
              <SelectTrigger>
                <SelectValue placeholder={t('signup.selectPayout')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stripe">{t('signup.payout.stripe')}</SelectItem>
                <SelectItem value="paypal">{t('signup.payout.paypal')}</SelectItem>
                <SelectItem value="wire">{t('signup.payout.wire')}</SelectItem>
                <SelectItem value="wise">{t('signup.payout.wise')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Terms Acceptance */}
          <div className="flex items-start space-x-2">
            <Checkbox
              id="terms"
              checked={formData.terms_accepted}
              onCheckedChange={(checked) => 
                setFormData({ ...formData, terms_accepted: !!checked })
              }
              required
            />
            <Label htmlFor="terms" className="text-sm leading-tight">
              {t('signup.termsText')}{' '}
              <a 
                href="/legal/referral-terms" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {t('signup.termsLink')}
              </a>
            </Label>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              {t('signup.cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !formData.terms_accepted}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner className="mr-2" />
                  {t('signup.creating')}
                </>
              ) : (
                t('signup.create')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}