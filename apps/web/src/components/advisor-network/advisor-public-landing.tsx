'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/routing'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

interface AdvisorPublicLandingProps {
  translations: {
    advisor: {
      landing: {
        hero: {
          title: string
          subtitle: string
          cta: string
          badge: string
        }
        howItWorks: {
          title: string
          steps: string[]
        }
        earnings: {
          title: string
          rates: string
          description: string
          sessionTypes: {
            quick: string
            review: string
            deep: string
          }
        }
        trust: {
          payments: string
          paymentsDescription: string
          calendar: string
          calendarDescription: string
          policy: string
          policyTitle: string
        }
        cta: {
          title: string
          description: string
        }
        dashboard: {
          buttonText: string
        }
        auth: {
          signInRequired: string
        }
      }
    }
    common: {
      loading: string
      error: string
    }
  }
  locale: string
  isAuthenticated: boolean
  userHasApplication: boolean
}

export function AdvisorPublicLanding({
  translations,
  locale,
  isAuthenticated,
  userHasApplication
}: AdvisorPublicLandingProps) {
  const router = useRouter()
  const [isNavigating, setIsNavigating] = useState(false)

  const handleBecomeAdvisor = async () => {
    setIsNavigating(true)
    try {
      // Always go to application page - it handles auth when needed
      router.push(`/advisor/apply`)
    } catch (error) {
      console.error('Navigation error:', error)
      setIsNavigating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800">
      {/* Hero Section */}
      <section className="px-4 pt-16 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6">
            <Badge variant="outline" className="px-4 py-2 text-sm font-medium bg-yellow-500/10 border-yellow-500/30 text-yellow-400">
              <Icon name="star" className="w-4 h-4 me-2 text-yellow-400" />
              {translations.advisor.landing.hero.badge}
            </Badge>
          </div>
          
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
            {translations.advisor.landing.hero.title}
          </h1>
          
          <p className="mt-6 text-lg leading-8 text-gray-300">
            {translations.advisor.landing.hero.subtitle}
          </p>
          
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Button
              onClick={handleBecomeAdvisor}
              size="lg"
              className="px-8 py-3 text-lg font-semibold"
              disabled={isNavigating}
            >
              {isNavigating ? (
                <>
                  <Icon name="loader-2" className="w-5 h-5 me-2 animate-spin" />
                  {translations.common.loading}
                </>
              ) : (
                <>
                  {translations.advisor.landing.hero.cta}
                  <Icon name="arrow-right" className="w-5 h-5 ms-2" />
                </>
              )}
            </Button>
            
            {isAuthenticated && (
              <Button variant="outline" size="lg" className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white" onClick={() => router.push(`/advisor/dashboard`)}>
                <Icon name="layout-grid" className="w-5 h-5 me-2" />
                {translations.advisor.landing.dashboard.buttonText}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white">
              {translations.advisor.landing.howItWorks.title}
            </h2>
          </div>
          
          <div className="grid gap-8 md:grid-cols-3">
            {translations.advisor.landing.howItWorks.steps.map((step, index) => (
              <Card key={index} className="text-center border-2 bg-gray-800/50 border-gray-700 hover:border-purple-500 transition-colors backdrop-blur">
                <CardHeader>
                  <div className="mx-auto w-12 h-12 bg-purple-900/50 rounded-full flex items-center justify-center mb-4">
                    <span className="text-xl font-bold text-purple-400">
                      {index + 1}
                    </span>
                  </div>
                  <CardTitle className="text-xl">{step}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Earnings Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-purple-900 to-indigo-900">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-white mb-6">
            {translations.advisor.landing.earnings.title}
          </h2>
          
          <div className="text-5xl font-bold text-white mb-4">
            {translations.advisor.landing.earnings.rates}
          </div>
          
          <p className="text-xl text-purple-100 mb-8">
            {translations.advisor.landing.earnings.description}
          </p>
          
          <div className="grid gap-4 sm:grid-cols-3 max-w-2xl mx-auto">
            <Card className="bg-white/10 backdrop-blur border-white/20 hover:bg-white/20 transition-colors">
              <CardContent className="p-6 text-center">
                <div className="text-2xl font-bold text-white mb-2">15 min</div>
                <div className="text-lg text-purple-100">$6.30</div>
                <div className="text-sm text-purple-200">{translations.advisor.landing.earnings.sessionTypes.quick}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-white/10 backdrop-blur border-white/20 hover:bg-white/20 transition-colors">
              <CardContent className="p-6 text-center">
                <div className="text-2xl font-bold text-white mb-2">30 min</div>
                <div className="text-lg text-purple-100">$13.30</div>
                <div className="text-sm text-purple-200">{translations.advisor.landing.earnings.sessionTypes.review}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-white/10 backdrop-blur border-white/20 hover:bg-white/20 transition-colors">
              <CardContent className="p-6 text-center">
                <div className="text-2xl font-bold text-white mb-2">60 min</div>
                <div className="text-lg text-purple-100">$24.50</div>
                <div className="text-sm text-purple-200">{translations.advisor.landing.earnings.sessionTypes.deep}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Trust & Policies */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <Card className="border-2 bg-gray-800/50 border-gray-700 hover:border-green-400 transition-colors backdrop-blur">
              <CardHeader className="text-center">
                <Icon name="shield-check" className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <CardTitle className="text-lg text-white">{translations.advisor.landing.trust.payments}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 text-center">
                  {translations.advisor.landing.trust.paymentsDescription}
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-2 bg-gray-800/50 border-gray-700 hover:border-blue-400 transition-colors backdrop-blur">
              <CardHeader className="text-center">
                <Icon name="calendar" className="w-12 h-12 text-blue-400 mx-auto mb-4" />
                <CardTitle className="text-lg text-white">{translations.advisor.landing.trust.calendar}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 text-center">
                  {translations.advisor.landing.trust.calendarDescription}
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-2 bg-gray-800/50 border-gray-700 hover:border-purple-400 transition-colors md:col-span-2 lg:col-span-1 backdrop-blur">
              <CardHeader className="text-center">
                <Icon name="info" className="w-12 h-12 text-purple-400 mx-auto mb-4" />
                <CardTitle className="text-lg text-white">{translations.advisor.landing.trust.policyTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 text-center">
                  {translations.advisor.landing.trust.policy}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-t from-gray-800 to-gray-900">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-white mb-6">
            {translations.advisor.landing.cta.title}
          </h2>
          
          <p className="text-xl text-gray-300 mb-8">
            {translations.advisor.landing.cta.description}
          </p>
          
          <Button
            onClick={handleBecomeAdvisor}
            size="lg"
            className="px-8 py-3 text-lg font-semibold"
            disabled={isNavigating}
          >
            {isNavigating ? (
              <>
                <Icon name="loader-2" className="w-5 h-5 me-2 animate-spin" />
                {translations.common.loading}
              </>
            ) : (
              <>
                {translations.advisor.landing.hero.cta}
                <Icon name="arrow-right" className="w-5 h-5 ms-2" />
              </>
            )}
          </Button>
          
          {!isAuthenticated && (
            <p className="mt-4 text-sm text-gray-400">
              <Icon name="info" className="w-4 h-4 inline me-1" />
              {translations.advisor.landing.auth.signInRequired}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}