"use client"

import { Button } from "@/components/ui/button"
import { formatPrice, getPricingForLocale } from "@/i18n/pricing"
import { m } from '@/components/ui/motion-provider'
import Icon, { IconName } from '@/components/ui/icon'
import { useRouter, Link } from '@/i18n/routing'
import { useAuthStore } from '@/store'




import { useState } from "react"
import { 
  PLAN_FEATURES, 
  PLAN_METADATA,
  PLAN_NAMES,
  type PlanName 
} from '@/config/pricing-plans'
import { ROUTES } from '@/i18n/routes'

interface PricingClientProps {
  badge: string;
  title: string;
  titleHighlight: string;
  subtitle: string;
  subtitleSecond: string;
  billingMonthly: string;
  billingYearly: string;
  billingSave: string;
  periodMonthly: string;
  periodYearly: string;
  plans: {
    free: Record<string, unknown>;
    starter: Record<string, unknown>;
    growth: Record<string, unknown>;
    scale: Record<string, unknown>;
  };
  enterprise: string;
  enterpriseDescription: string;
  guarantees: {
    moneyBack: Record<string, unknown>;
    cancel: Record<string, unknown>;
    export: Record<string, unknown>;
  };
  locale: string;
}

export function PricingClient({
  badge,
  title,
  titleHighlight,
  subtitle,
  subtitleSecond,
  billingMonthly,
  billingYearly,
  billingSave,
  periodMonthly,
  periodYearly,
  plans,
  enterprise,
  enterpriseDescription,
  guarantees,
  locale
}: PricingClientProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")
  const router = useRouter()
  const { user, openLoginModal } = useAuthStore()
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

  // Get localized pricing
  const pricingData = getPricingForLocale(locale)

  // Check if current locale is RTL (simplified approach)
  const isRTL = locale.startsWith('ar')

  const handlePlanSelect = async (planId: string) => {
    if (planId === 'free') {
      // Free plan - just redirect to builder
      router.push('/builder/new')
      return
    }

    if (!user) {
      // Not logged in - show login modal
      openLoginModal()
      return
    }

    // User is logged in - create checkout session
    setLoadingPlan(planId)
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planName: planId,
          successUrl: `${window.location.origin}/${locale}/dashboard/billing?success=true`,
          cancelUrl: window.location.origin + window.location.pathname,
        }),
      })

      if (!response.ok) throw new Error('Failed to create checkout session')
      
      const { url } = await response.json()
      if (url) {
        window.location.href = url
      }
    } catch (error) {
      console.error('Checkout error:', error)
      // TODO: Show error toast
    } finally {
      setLoadingPlan(null)
    }
  }

  // Focus on only free and lite plans for better conversion
  const availablePlans = ['free', 'lite'] as const
  const planList = availablePlans.map(planId => {
    const metadata = PLAN_METADATA[planId] || {
      name: planId === 'free' ? 'Free' : 'Lite',
      icon: planId === 'free' ? 'sparkles' : 'zap',
      color: planId === 'free' ? 'from-gray-600 to-gray-700' : 'from-purple-600 to-pink-600',
      popular: planId === 'lite' // Make lite the popular choice
    }
    const planTranslation = plans[planId]

    return {
      ...planTranslation,
      id: planId,
      icon: metadata.icon,
      color: metadata.color,
      monthlyPrice: pricingData[planId]?.monthly || 0,
      yearlyPrice: pricingData[planId]?.yearly || 0,
      period: billingCycle === 'monthly' ? periodMonthly : periodYearly,
      popular: metadata.popular ? 'Most Popular' : null,
      features: PLAN_FEATURES[planId] || [
        planId === 'free'
          ? '15 minutes daily + welcome gift'
          : '110 AI minutes/month',
        planId === 'free'
          ? 'Community support'
          : '2 advisor sessions included',
        planId === 'free'
          ? 'Welcome gift on signup'
          : 'Up to 220 minutes rollover'
      ],
      savings: billingCycle === 'yearly' && pricingData[planId]?.monthly > 0 && (planTranslation as any).savings
        ? (planTranslation as any).savings.replace('{amount}', formatPrice(
            (pricingData[planId].monthly - pricingData[planId].yearly) * 12,
            locale as "en" | "ar-eg" | "ar-sa" | "ar-ae" | "ar" | "fr"
          ))
        : undefined
    }
  })

  return (
    <section id="pricing" className="py-16 sm:py-20 md:py-24 bg-gradient-to-b from-black to-gray-900 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-pink-600/20 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        {/* Section Header */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12 sm:mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-yellow-500/10 border border-yellow-500/20 mb-4 sm:mb-6">
            <Icon name="users" className="w-4 h-4 text-yellow-400"  />
            <span className="text-xs sm:text-sm text-yellow-300">{badge}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold text-white mb-4 sm:mb-6 leading-tight">
            {title}
            <br />
            <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
              {titleHighlight}
            </span>
          </h2>

          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-300 max-w-3xl mx-auto mb-4 leading-relaxed px-2">
            {subtitle}
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>{subtitleSecond}
          </p>

          {/* Value proposition for conversion optimization */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-6 sm:mb-8 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Icon name="check-circle" className="w-4 h-4 text-green-400" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <Icon name="shield-check" className="w-4 h-4 text-green-400" />
              <span>30-day money back</span>
            </div>
            <div className="flex items-center gap-2">
              <Icon name="clock" className="w-4 h-4 text-green-400" />
              <span>Setup in minutes</span>
            </div>
          </div>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm ${billingCycle === 'monthly' ? 'text-white' : 'text-gray-400'}`}>
              {billingMonthly}
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className="relative w-14 h-7 bg-gray-700 rounded-full transition-colors"
            >
              <m.div
                animate={{
                  left: billingCycle === 'monthly' ? '4px' : 'calc(100% - 24px)' // Monthly=left, Yearly=right
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute top-1 w-5 h-5 bg-white rounded-full"
              />
            </button>
            <span className={`text-sm ${billingCycle === 'yearly' ? 'text-white' : 'text-gray-400'}`}>
              {billingYearly}
              <span className="text-green-400 ms-1">({billingSave.replace('{percent}', '20')})</span>
            </span>
          </div>
        </m.div>

        {/* Pricing Cards - Optimized for 2-plan layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
          {planList.map((plan, index) => (
            <m.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: index * 0.1 }}
              className={`relative ${plan.popular ? 'md:-mt-4' : ''}`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-20">
                  <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold px-4 py-1 rounded-full shadow-lg">
                    {plan.popular}
                  </div>
                </div>
              )}

              <div className={`h-full rounded-3xl p-8 border transition-all duration-300 ${
                plan.popular
                  ? 'bg-gradient-to-br from-purple-900/30 to-pink-900/30 border-purple-500/50 shadow-2xl shadow-purple-500/20 hover:shadow-purple-500/30 scale-105'
                  : 'bg-gray-800/50 backdrop-blur-sm border-white/10 hover:border-white/20 hover:bg-gray-800/70'
                }`}>
                {/* Plan Icon */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${plan.color} flex items-center justify-center mb-6`}>
                  <Icon name={plan.icon as IconName} className="w-6 h-6 text-white" />
                </div>

                {/* Plan Name & Price */}
                <h3 className="text-2xl font-bold text-white mb-2">{(plan as any).name}</h3>
                <div className="flex items-baseline mb-2">
                  <span className="text-5xl font-bold text-white">
                    {formatPrice(
                      billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice,
                      locale as "en" | "ar-eg" | "ar-sa" | "ar-ae" | "ar" | "fr"
                    )}
                  </span>
                  <span className="text-gray-400 ml-2">{plan.period}</span>
                </div>
                {plan.savings && billingCycle === 'yearly' && (
                  <p className="text-green-400 text-sm mb-4">{plan.savings}</p>
                )}
                <p className="text-gray-400 mb-6">{(plan as any).description}</p>

                {/* CTA Button */}
                <Button
                  size="lg"
                  className={`w-full mb-6 ${plan.popular
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  onClick={() => handlePlanSelect(plan.id)}
                  disabled={loadingPlan === plan.id}
                >
                  {loadingPlan === plan.id ? 'Processing...' : (plan as any).cta}
                </Button>

                {/* Features */}
                <div className="space-y-3">
                  {/* Use features from centralized config, with translation fallback */}
                  {(plan.features as string[]).map((feature: string, index: number) => (
                    <div key={index} className="flex items-start gap-3">
                      <Icon name="check" className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0"  />
                      <span className="text-sm text-gray-300">
                        {/* Try to get translated feature, fallback to config feature */}
                        {(plan as any).features?.[index] || feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </m.div>
          ))}
        </div>

        {/* Enhanced CTA Section for Conversion */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-16 text-center"
        >
          <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 rounded-2xl p-8 border border-purple-500/20 max-w-2xl mx-auto mb-8">
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
              Start Building Your App Today
            </h3>
            <p className="text-gray-300 mb-6">
              Join thousands of entrepreneurs who've launched their ideas with SheenApps.
              Most projects go live within 24 hours.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Button
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border-0 shadow-lg"
                onClick={() => handlePlanSelect('free')}
              >
                <Icon name="play" className="w-4 h-4 me-2" />
                Start Free Today
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-purple-500/30 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20 hover:border-purple-400/50"
                onClick={() => handlePlanSelect('lite')}
              >
                <Icon name="zap" className="w-4 h-4 me-2" />
                Go Pro with Lite
              </Button>
            </div>
          </div>

          <p className="text-gray-400 mb-4">
            Need a custom solution for your enterprise?
          </p>
          <Button
            size="lg"
            variant="outline"
            className="border border-white/20 bg-transparent text-white hover:bg-white hover:text-black hover:border-white transition-all duration-200"
            onClick={() => window.location.href = 'mailto:enterprise@sheenapps.com?subject=Enterprise%20Plan%20Inquiry'}
          >
            {enterprise}
          </Button>
        </m.div>

        {/* Trust Statement */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="mt-16 bg-gradient-to-r from-purple-900/20 to-pink-900/20 rounded-3xl p-8 border border-purple-500/20 max-w-4xl mx-auto"
        >
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-white mb-2">{(guarantees.moneyBack as { value: string }).value}</div>
              <p className="text-sm text-gray-400">{(guarantees.moneyBack as { label: string }).label}</p>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-2">{(guarantees.cancel as { value: string }).value}</div>
              <p className="text-sm text-gray-400">{(guarantees.cancel as { label: string }).label}</p>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-2">{(guarantees.export as { value: string }).value}</div>
              <p className="text-sm text-gray-400">{(guarantees.export as { label: string }).label}</p>
            </div>
          </div>
        </m.div>

        {/* View All Plans Link */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.7 }}
          className="mt-12 text-center"
        >
          <Link href={ROUTES.PRICING_PAGE}>
            <Button
              size="lg"
              variant="outline"
              className="border-purple-500/20 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 hover:border-purple-400/40 transition-all duration-200"
            >
              <Icon name="arrow-right" className="w-4 h-4 me-2" />
              View All Plans & Details
            </Button>
          </Link>
          <p className="text-sm text-gray-400 mt-2">
            Explore one-time packages, detailed features, and more billing options
          </p>
        </m.div>
      </div>
    </section>
  )
}
