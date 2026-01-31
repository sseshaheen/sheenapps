'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { lazy, Suspense, useState } from 'react';
import { AdvisorLandingAnalytics, FinalCTAButtons } from './advisor-analytics-wrapper';

// Lazy load components that appear below the fold
const AdvisorShowcase = lazy(() => import('./advisor-landing-dynamic').then(module => ({ default: module.AdvisorShowcase })));
const QuickMatcherModal = lazy(() => import('./quick-matcher-modal').then(module => ({ default: module.QuickMatcherModal })));

// Loading skeleton components
const AdvisorShowcaseSkeleton = () => (
  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="animate-pulse">
        <div className="bg-gray-700 h-48 rounded-lg mb-4"></div>
        <div className="bg-gray-700 h-4 rounded mb-2"></div>
        <div className="bg-gray-700 h-3 rounded w-3/4"></div>
      </div>
    ))}
  </div>
);

interface AdvisorLandingClientWithTranslationsProps {
  locale: string;
}

export function AdvisorLandingClientWithTranslations({ locale }: AdvisorLandingClientWithTranslationsProps) {
  const [isMatcherModalOpen, setIsMatcherModalOpen] = useState(false);

  // Use proper next-intl hooks for translations
  const tAdvisors = useTranslations('advisor.advisors');
  const tClient = useTranslations('advisor.client');
  const tCommon = useTranslations('common');

  return (
    <AdvisorLandingAnalytics>
      <div
        className="dark min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900"
        style={{
          backgroundColor: '#111827',
          background: '#111827',
          minHeight: '100vh'
        }}
      >
        {/* Hero Section */}
        <section className="px-4 pt-20 pb-16 sm:px-6 lg:px-8" data-section="hero">
          {/* Advisor Dashboard Link - Positioned below fixed header */}
          <div className="absolute top-20 end-6 z-10">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors border border-gray-600/50 hover:border-gray-500"
            >
              <Link href="/advisor/dashboard">
                <Icon name="layout-grid" className="w-4 h-4 me-2" />
                {tCommon('advisorDashboard') || 'Advisor Dashboard'}
              </Link>
            </Button>
          </div>

          <div className="mx-auto max-w-6xl text-center">
            <Badge variant="outline" className="mb-6 px-4 py-2 !text-white !border-gray-600" style={{ color: 'white', borderColor: '#4b5563' }}>
              <Icon name="sparkles" className="w-4 h-4 me-2" />
              {tClient('hero.badge')}
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight mb-6 sm:text-6xl !text-white" style={{ color: 'white' }}>
              {tClient('hero.title')}
            </h1>

            <p className="text-xl text-muted-foreground dark:text-gray-400 max-w-2xl mx-auto mb-6 !text-gray-300" style={{ color: '#d1d5db' }}>
              {tClient('hero.subtitle')}
            </p>

            {/* Trust indicators */}
            <div className="flex flex-wrap justify-center gap-4 mb-8 text-sm text-gray-400">
              <span>{tClient('hero.trustBar')}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <Button asChild size="lg" className="px-8 py-3 text-lg">
                <Link href="/advisor/browse">
                  <Icon name="search" className="w-5 h-5 me-2" />
                  {tClient('hero.findExpert')}
                </Link>
              </Button>

              <Button
                variant="outline"
                size="lg"
                className="px-8 py-3 text-lg"
                onClick={() => setIsMatcherModalOpen(true)}
              >
                <Icon name="message-square" className="w-5 h-5 me-2" />
                {tClient('hero.describeChalenge')}
              </Button>
            </div>

            <p className="text-sm text-gray-500 max-w-lg mx-auto">
              {tClient('hero.pricing')}
            </p>
          </div>
        </section>

        {/* Problem/Pain Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900/30" data-section="problems">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-12 !text-white" style={{ color: 'white' }}>
              {tClient('problems.title')}
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              {[
                { icon: "flame", text: tClient('problems.scenarios.0') },
                { icon: "bug", text: tClient('problems.scenarios.1') },
                { icon: "zap", text: tClient('problems.scenarios.2') },
                { icon: "alert-triangle", text: tClient('problems.scenarios.3') }
              ].map((scenario, index) => (
                <div key={index} className="flex items-start gap-4 p-6 rounded-lg bg-gray-800/50 border border-gray-700">
                  <Icon name={scenario.icon as any} className="w-6 h-6 text-red-400 mt-1" />
                  <p className="text-lg text-gray-300 text-start">{scenario.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Solution Showcase */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" data-section="solutions">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-6 !text-white" style={{ color: 'white' }}>
                {tClient('solutions.title')}
              </h2>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: "building",
                  title: tClient('solutions.services.0.title'),
                  description: tClient('solutions.services.0.description'),
                  example: tClient('solutions.services.0.example')
                },
                {
                  icon: "search",
                  title: tClient('solutions.services.1.title'),
                  description: tClient('solutions.services.1.description'),
                  example: tClient('solutions.services.1.example')
                },
                {
                  icon: "rocket",
                  title: tClient('solutions.services.2.title'),
                  description: tClient('solutions.services.2.description'),
                  example: tClient('solutions.services.2.example')
                },
                {
                  icon: "book",
                  title: tClient('solutions.services.3.title'),
                  description: tClient('solutions.services.3.description'),
                  example: tClient('solutions.services.3.example')
                }
              ].map((service, index) => (
                <Card key={index} className="text-start border-2 hover:border-primary/50 transition-all duration-300 hover:shadow-lg !bg-gray-800 !border-gray-700" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
                  <CardHeader>
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                      <Icon name={service.icon as any} className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl !text-white" style={{ color: 'white' }}>
                      {service.title}
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      {service.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-gray-900/50 p-3 rounded border-l-2 border-green-500">
                      <p className="text-sm text-green-400 italic">
                        "{service.example}"
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Advisor Showcase */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900/30" data-section="advisors">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4 !text-white" style={{ color: 'white' }}>
                {tClient('advisorShowcase.title')}
              </h2>
              <p className="text-gray-400">{tClient('advisorShowcase.subtitle')}</p>
            </div>
            <Suspense fallback={<AdvisorShowcaseSkeleton />}>
              <AdvisorShowcase limit={6} />
            </Suspense>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" data-section="process">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-6 !text-white" style={{ color: 'white' }}>
                {tClient('process.title')}
              </h2>
            </div>
            <div className="relative">
              {/* Connection line */}
              <div className="absolute top-8 left-8 right-8 h-0.5 bg-gradient-to-r from-primary via-primary to-primary hidden md:block" />

              <div className="grid gap-8 md:grid-cols-5">
                {[
                  { number: 1, title: tClient('process.steps.0.title'), description: tClient('process.steps.0.description') },
                  { number: 2, title: tClient('process.steps.1.title'), description: tClient('process.steps.1.description') },
                  { number: 3, title: tClient('process.steps.2.title'), description: tClient('process.steps.2.description') },
                  { number: 4, title: tClient('process.steps.3.title'), description: tClient('process.steps.3.description') },
                  { number: 5, title: tClient('process.steps.4.title'), description: tClient('process.steps.4.description') }
                ].map((step, index) => (
                  <div key={index} className="text-center relative">
                    <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-4 relative z-10">
                      {step.number}
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {step.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Trust & Safety */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900/30" data-section="trust">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-6 !text-white" style={{ color: 'white' }}>
                {tClient('trust.title')}
              </h2>
            </div>
            <div className="grid gap-8 md:grid-cols-5">
              {[
                { icon: "shield", title: tClient('trust.points.0.title'), description: tClient('trust.points.0.description') },
                { icon: "credit-card", title: tClient('trust.points.1.title'), description: tClient('trust.points.1.description') },
                { icon: "phone", title: tClient('trust.points.2.title'), description: tClient('trust.points.2.description') },
                { icon: "star", title: tClient('trust.points.3.title'), description: tClient('trust.points.3.description') },
                { icon: "bar-chart", title: tClient('trust.points.4.title'), description: tClient('trust.points.4.description') }
              ].map((point, index) => (
                <div key={index} className="text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Icon name={point.icon as any} className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {point.title}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {point.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" data-section="faq">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-6 !text-white" style={{ color: 'white' }}>
                {tClient('faq.title')}
              </h2>
            </div>
            <div className="space-y-4">
              {[
                {
                  question: tClient('faq.items.0.question'),
                  answer: tClient('faq.items.0.answer')
                },
                {
                  question: tClient('faq.items.1.question'),
                  answer: tClient('faq.items.1.answer')
                },
                {
                  question: tClient('faq.items.2.question'),
                  answer: tClient('faq.items.2.answer')
                },
                {
                  question: tClient('faq.items.3.question'),
                  answer: tClient('faq.items.3.answer')
                }
              ].map((item, index) => (
                <Card key={index} className="!bg-gray-800 !border-gray-700" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
                  <CardHeader>
                    <CardTitle className="text-lg !text-white flex items-center gap-2" style={{ color: 'white' }}>
                      <Icon name="help-circle" className="w-5 h-5 text-primary" />
                      {item.question}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-300 text-base leading-relaxed">
                      {item.answer}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-primary/10 to-primary/5" data-section="final-cta">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-4xl font-bold mb-6 !text-white" style={{ color: 'white' }}>
              {tClient('finalCta.title')}
            </h2>
            <p className="text-xl text-gray-300 mb-4">
              {tClient('finalCta.subtitle')}
            </p>
            <p className="text-lg text-green-400 mb-8">
              {tClient('finalCta.guarantee')}
            </p>

            <FinalCTAButtons />

            {/* Subtle advisor recruitment - positioned after main CTAs */}
            <div className="mt-16 pt-8 border-t border-gray-700/30">
              <p className="text-sm text-gray-400 mb-4">
                {tClient('recruitment.text')}
              </p>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
              >
                <Link href="/advisor/join">
                  <Icon name="arrow-right" className="w-4 h-4 me-2" />
                  {tClient('recruitment.cta')}
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* Quick Matcher Modal */}
      <Suspense fallback={null}>
        <QuickMatcherModal
          isOpen={isMatcherModalOpen}
          onClose={() => setIsMatcherModalOpen(false)}
        />
      </Suspense>
    </AdvisorLandingAnalytics>
  );
}
