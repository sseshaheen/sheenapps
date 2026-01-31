/**
 * Referral Program CTA Component
 * Shows on dashboard to invite users to join SheenApps Friends
 */

'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Percent, TrendingUp, ArrowRight } from 'lucide-react'
import { ReferralService } from '@/services/referral-service'
import { PartnerSignupModal } from './partner-signup-modal'
import { cn } from '@/lib/utils'

interface ReferralCTAProps {
  className?: string
  onBecomePartner?: () => void
}

export function ReferralCTA({ className, onBecomePartner }: ReferralCTAProps) {
  const t = useTranslations('referral')
  const { user } = useAuthStore()
  const [showSignupModal, setShowSignupModal] = useState(false)
  const [hasPartnerAccount, setHasPartnerAccount] = useState<boolean | null>(null)
  const [isCheckingStatus, setIsCheckingStatus] = useState(true)

  // Check partner status on mount
  useState(() => {
    if (user) {
      ReferralService.checkPartnerStatus(user.id)
        .then(setHasPartnerAccount)
        .catch(() => setHasPartnerAccount(false))
        .finally(() => setIsCheckingStatus(false))
    }
  })

  // Don't show CTA if user already has partner account
  if (hasPartnerAccount) return null

  const handleJoinProgram = () => {
    setShowSignupModal(true)
    onBecomePartner?.()
  }

  if (isCheckingStatus) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardContent className="p-6">
          <div className="h-32 bg-muted rounded"></div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={cn(
        "overflow-hidden border-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-white shadow-xl",
        className
      )}>
        <CardContent className="p-6 relative">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-4 -right-4 w-32 h-32 rounded-full border-2 border-white/20"></div>
            <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full border border-white/20"></div>
          </div>
          
          <div className="relative">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="bg-white/20 text-white border-0">
                    {t('cta.badge')}
                  </Badge>
                </div>
                <h3 className="text-xl font-bold mb-1">
                  {t('cta.title')}
                </h3>
                <p className="text-blue-100 text-sm">
                  {t('cta.subtitle')}
                </p>
              </div>
              <div className="text-3xl opacity-75">💰</div>
            </div>

            {/* Benefits */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Percent className="h-5 w-5 text-blue-200" />
                </div>
                <div className="text-lg font-semibold">15%</div>
                <div className="text-xs text-blue-100">{t('cta.commission')}</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <TrendingUp className="h-5 w-5 text-purple-200" />
                </div>
                <div className="text-lg font-semibold">12</div>
                <div className="text-xs text-purple-100">{t('cta.months')}</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Users className="h-5 w-5 text-pink-200" />
                </div>
                <div className="text-lg font-semibold">∞</div>
                <div className="text-xs text-pink-100">{t('cta.referrals')}</div>
              </div>
            </div>

            {/* CTA Button */}
            <Button
              onClick={handleJoinProgram}
              className="w-full bg-white text-purple-600 hover:bg-gray-50 font-medium transition-all duration-200 group"
            >
              {t('cta.joinButton')}
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Button>

            {/* Fine Print */}
            <p className="text-xs text-blue-100 mt-3 text-center opacity-75">
              {t('cta.terms')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Partner Signup Modal */}
      {showSignupModal && user && (
        <PartnerSignupModal
          userId={user.id}
          onSuccess={() => {
            setShowSignupModal(false)
            setHasPartnerAccount(true)
          }}
          onCancel={() => setShowSignupModal(false)}
        />
      )}
    </>
  )
}