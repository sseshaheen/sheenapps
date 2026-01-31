/**
 * 🎨 Premium Authentication Layout
 * Beautiful, responsive layout for auth pages with animations
 */

'use client'

import { ReactNode } from 'react'
import { Link } from '@/i18n/routing'
import { m } from '@/components/ui/motion-provider'
import { GradientOrb } from '@/components/ui/gradient-orb'
import Icon from '@/components/ui/icon'

interface AuthLayoutProps {
  children: ReactNode
  title: string
  subtitle: string
  locale: string
  commonTranslations?: {
    authLayout: {
      backToHome: string
      brand: {
        name: string
        tagline: string
      }
      features: {
        aiPowered: { title: string; description: string }
        globalReady: { title: string; description: string }
        enterpriseSecurity: { title: string; description: string }
        lightningFast: { title: string; description: string }
      }
      socialProof: {
        trustedBy: string
        creatorsCount: string
        creatorsLabel: string
        joinCreators: string
      }
      mobileFeatures: {
        aiPowered: string
        secure: string
        fast: string
      }
    }
  }
}

export function AuthLayout({ children, title, subtitle, locale, commonTranslations }: AuthLayoutProps) {
  // Fallback to English if translations not provided
  const t = commonTranslations?.authLayout || {
    backToHome: 'Back to home',
    brand: {
      name: 'SheenApps',
      tagline: 'Build stunning, multilingual websites with the power of AI. No coding required.'
    },
    features: {
      aiPowered: { title: 'AI-Powered', description: 'Generate beautiful websites in minutes with advanced AI' },
      globalReady: { title: 'Global Ready', description: 'Built-in internationalization for 7+ languages' },
      enterpriseSecurity: { title: 'Enterprise Security', description: 'Bank-grade security with end-to-end encryption' },
      lightningFast: { title: 'Lightning Fast', description: 'Optimized for speed with edge computing' }
    },
    socialProof: {
      trustedBy: 'Trusted by creators worldwide',
      creatorsCount: '2,000+',
      creatorsLabel: 'creators',
      joinCreators: 'Join 2,000+ creators building with AI'
    },
    mobileFeatures: {
      aiPowered: 'AI-Powered',
      secure: 'Secure',
      fast: 'Fast'
    }
  }

  const features = [
    {
      icon: 'sparkles',
      title: t.features.aiPowered.title,
      description: t.features.aiPowered.description
    },
    {
      icon: 'globe',
      title: t.features.globalReady.title,
      description: t.features.globalReady.description
    },
    {
      icon: 'shield',
      title: t.features.enterpriseSecurity.title,
      description: t.features.enterpriseSecurity.description
    },
    {
      icon: 'zap',
      title: t.features.lightningFast.title,
      description: t.features.lightningFast.description
    }
  ]
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-blue-950 dark:to-indigo-950">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <GradientOrb 
          size="xl" 
          className="top-[-10%] left-[-10%] opacity-30"
        />
        <GradientOrb 
          size="lg" 
          className="bottom-[-5%] right-[-5%] opacity-40"
        />
        <GradientOrb 
          size="sm" 
          className="top-[20%] right-[10%] opacity-20"
        />
      </div>

      {/* Header */}
      <div className="relative z-10 pt-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors ltr:flex-row rtl:flex-row-reverse"
          >
            <Icon name="arrow-left" className="w-4 h-4 me-2 ltr:block rtl:hidden"  />
            <Icon name="arrow-right" className="w-4 h-4 me-2 rtl:block ltr:hidden"  />
            {t.backToHome}
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex min-h-[calc(100vh-120px)] items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            
            {/* Left Side - Branding & Features */}
            <m.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="hidden lg:block"
            >
              <div className="space-y-8">
                {/* Logo & Tagline */}
                <div>
                  <m.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.6 }}
                  >
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
                      {t.brand.name}
                    </h1>
                    <p className="text-xl text-slate-600 dark:text-slate-300 leading-relaxed">
                      {t.brand.tagline}
                    </p>
                  </m.div>
                </div>

                {/* Feature Grid */}
                <div className="grid grid-cols-2 gap-6">
                  {features.map((feature, index) => (
                    <m.div
                      key={feature.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + index * 0.1, duration: 0.6 }}
                      className="space-y-3"
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <Icon name={feature.icon as any} className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">
                          {feature.title}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {feature.description}
                        </p>
                      </div>
                    </m.div>
                  ))}
                </div>

                {/* Social Proof */}
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8, duration: 0.6 }}
                  className="pt-8 border-t border-slate-200 dark:border-slate-700"
                >
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                    {t.socialProof.trustedBy}
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="flex ltr:-space-x-2 rtl:-space-x-2 rtl:flex-row-reverse">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div
                          key={i}
                          className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 border-2 border-white dark:border-slate-900"
                        />
                      ))}
                    </div>
                    <div className="text-sm">
                      <bdi className="font-semibold text-slate-900 dark:text-white">
                        <span dir="ltr">{t.socialProof.creatorsCount}</span>
                        {' '}
                        <span>{t.socialProof.creatorsLabel}</span>
                      </bdi>
                    </div>
                  </div>
                </m.div>
              </div>
            </m.div>

            {/* Right Side - Auth Form */}
            <m.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="w-full max-w-md mx-auto"
            >
              <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-slate-700/50 p-8">
                <div className="mb-8 text-center">
                  <m.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                    className="text-2xl font-bold text-slate-900 dark:text-white mb-2"
                  >
                    {title}
                  </m.h2>
                  <m.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.6 }}
                    className="text-slate-600 dark:text-slate-400"
                  >
                    {subtitle}
                  </m.p>
                </div>

                <m.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.6 }}
                >
                  {children}
                </m.div>
              </div>

              {/* Mobile Features */}
              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="lg:hidden mt-8 text-center"
              >
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  {t.socialProof.joinCreators}
                </p>
                <div className="flex items-center justify-center gap-6 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1">
                    <Icon name="sparkles" className="w-4 h-4"  />
                    {t.mobileFeatures.aiPowered}
                  </div>
                  <div className="flex items-center gap-1">
                    <Icon name="shield" className="w-4 h-4"  />
                    {t.mobileFeatures.secure}
                  </div>
                  <div className="flex items-center gap-1">
                    <Icon name="zap" className="w-4 h-4"  />
                    {t.mobileFeatures.fast}
                  </div>
                </div>
              </m.div>
            </m.div>
          </div>
        </div>
      </div>
    </div>
  )
}