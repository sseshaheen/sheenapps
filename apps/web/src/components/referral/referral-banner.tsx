/**
 * Referral Banner Component
 * Shows when users arrive via referral link
 */

'use client'

import { useTranslations } from 'next-intl'
import { useReferralBanner } from '@/hooks/use-referral-tracking'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReferralBannerProps {
  className?: string
}

export function ReferralBanner({ className }: ReferralBannerProps) {
  const { showBanner, hideBanner } = useReferralBanner()
  const t = useTranslations('referral')
  
  if (!showBanner) return null
  
  return (
    <div className={cn(
      "bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-500 p-4 mb-4",
      "dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-400",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="text-2xl">🎉</div>
          <div>
            <h4 className="font-medium text-green-800 dark:text-green-200">
              {t('banner.title')}
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              {t('banner.description')}
            </p>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={hideBanner}
          className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 -mt-1 -mr-1"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}