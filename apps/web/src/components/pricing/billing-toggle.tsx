'use client'

import { m } from '@/components/ui/motion-provider'
import { cn } from '@/lib/utils'

interface BillingToggleProps {
  billingCycle: 'monthly' | 'yearly'
  onBillingCycleChange: (cycle: 'monthly' | 'yearly') => void
  translations: any
  locale?: string
}

export function BillingToggle({ billingCycle, onBillingCycleChange, translations, locale }: BillingToggleProps) {
  const isRTL = locale?.startsWith('ar')

  // Expert solution: anchor knob to inline-start, use signed translation
  const travel = 24 // distance between the two knob positions
  const anchorClass = isRTL ? "right-1" : "left-1" // anchor to inline-start (2px = 0.5rem = right-1/left-1)
  const x = billingCycle === 'yearly' ? (isRTL ? -travel : travel) : 0

  return (
    <div className={cn(
      "flex items-center justify-center gap-4",
      isRTL && "flex-row-reverse" // Mirror labels only - keep this
    )}>
      <span className={cn(
        "text-sm font-medium transition-colors",
        billingCycle === 'monthly' ? 'text-white' : 'text-gray-400'
      )}>
        {translations.monthlyBilling}
      </span>

      <button
        onClick={() => onBillingCycleChange(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
        className="relative w-14 h-7 bg-gray-700 rounded-full transition-colors hover:bg-gray-600"
        aria-label={`Switch to ${billingCycle === 'monthly' ? 'yearly' : 'monthly'} billing`}
        data-testid="billing-toggle"
      >
        <m.div
          animate={{ x }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn("absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm", anchorClass)}
        />
      </button>

      <div className="flex items-center gap-2">
        <span className={cn(
          "text-sm font-medium transition-colors",
          billingCycle === 'yearly' ? 'text-white' : 'text-gray-400'
        )}>
          {translations.yearlyBilling}
        </span>
        {billingCycle === 'yearly' && (
          <m.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-300 border border-green-500/20 font-medium"
          >
            {translations.yearlyDiscount}
          </m.span>
        )}
      </div>
    </div>
  )
}