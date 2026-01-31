'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/routing';
import { lazy, Suspense, useState } from 'react';
import { AdvisorLandingAnalytics, FinalCTAButtons } from './advisor-analytics-wrapper';

// Lazy load components that appear below the fold
const AdvisorShowcase = lazy(() => import('./advisor-landing-dynamic').then(module => ({ default: module.AdvisorShowcase })));
const AdvisorTestimonials = lazy(() => import('./advisor-testimonials').then(module => ({ default: module.AdvisorTestimonials })));
const InteractiveROICalculator = lazy(() => import('./interactive-roi-calculator').then(module => ({ default: module.InteractiveROICalculator })));
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

const TestimonialsSkeleton = () => (
  <div className="space-y-6">
    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="animate-pulse bg-gray-800 p-6 rounded-lg">
        <div className="bg-gray-700 h-4 rounded mb-4"></div>
        <div className="bg-gray-700 h-3 rounded mb-2"></div>
        <div className="bg-gray-700 h-3 rounded w-2/3"></div>
      </div>
    ))}
  </div>
);

const CalculatorSkeleton = () => (
  <div className="animate-pulse bg-gray-800 p-8 rounded-lg">
    <div className="space-y-6">
      <div className="bg-gray-700 h-4 rounded w-1/2"></div>
      <div className="bg-gray-700 h-8 rounded"></div>
      <div className="bg-gray-700 h-4 rounded w-3/4"></div>
    </div>
  </div>
);

interface AdvisorLandingClientProps {
  translations: any; // TODO: Add proper type
}

export function AdvisorLandingClient({ translations }: AdvisorLandingClientProps) {
  const [isMatcherModalOpen, setIsMatcherModalOpen] = useState(false);

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
          <div className="mx-auto max-w-6xl text-center">
            <Badge variant="outline" className="mb-6 px-4 py-2 !text-white !border-gray-600" style={{ color: 'white', borderColor: '#4b5563' }}>
              <Icon name="sparkles" className="w-4 h-4 me-2" />
              Expert Software Engineering Help
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight mb-6 sm:text-6xl !text-white" style={{ color: 'white' }}>
              {translations.advisor.client.hero.title}
            </h1>

            <p className="text-xl text-muted-foreground dark:text-gray-400 max-w-2xl mx-auto mb-6 !text-gray-300" style={{ color: '#d1d5db' }}>
              {translations.advisor.client.hero.subtitle}
            </p>

            {/* Live metrics and trust indicators */}
            <div className="flex flex-wrap justify-center gap-4 mb-8 text-sm text-gray-400">
              {/* <span className="flex items-center gap-2">
                <Icon name="check-circle" className="w-4 h-4 text-green-500" />
                {translations.advisor.client.hero.liveMetric}
              </span> */}
              {/* <span>•</span> */}
              <span>{translations.advisor.client.hero.trustBadge}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <Button asChild size="lg" className="px-8 py-3 text-lg">
                <Link href="/advisor/browse">
                  <Icon name="search" className="w-5 h-5 me-2" />
                  Find an expert now
                </Link>
              </Button>

              <Button
                variant="outline"
                size="lg"
                className="px-8 py-3 text-lg"
                onClick={() => setIsMatcherModalOpen(true)}
              >
                <Icon name="message-square" className="w-5 h-5 me-2" />
                Describe your challenge
              </Button>
            </div>

            <p className="text-sm text-gray-500 max-w-lg mx-auto">
              {translations.advisor.client.hero.pricingLine}
            </p>
          </div>
        </section>

        {/* Problem/Pain Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900/30" data-section="problems">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-12 !text-white" style={{ color: 'white' }}>
              {translations.advisor.client.problems.title}
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              {translations.advisor.client.problems.scenarios.map((scenario: any, index: number) => (
                <div key={index} className="flex items-start gap-4 p-6 rounded-lg bg-gray-800/50 border border-gray-700">
                  <Icon name={scenario.icon as any} className="w-6 h-6 text-red-400 mt-1" />
                  <p className="text-lg text-gray-300 text-left">{scenario.text}</p>
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
                {translations.advisor.client.solutions.title}
              </h2>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {translations.advisor.client.solutions.services.map((service: any, index: number) => (
                <Card key={index} className="text-left border-2 hover:border-primary/50 transition-all duration-300 hover:shadow-lg !bg-gray-800 !border-gray-700" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
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
                {translations.advisor.client.advisors.title}
              </h2>
              <p className="text-gray-400">{translations.advisor.client.advisors.subtitle}</p>
            </div>
            <Suspense fallback={<AdvisorShowcaseSkeleton />}>
              <AdvisorShowcase limit={6} />
            </Suspense>
          </div>
        </section>

        {/* Success Stories - Temporarily commented out */}
        {/* <section className="py-16 px-4 sm:px-6 lg:px-8" data-section="testimonials">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-6 !text-white" style={{ color: 'white' }}>
                {translations.advisor.client.testimonials.title}
              </h2>
            </div>
            <Suspense fallback={<TestimonialsSkeleton />}>
              <AdvisorTestimonials maxCount={2} />
            </Suspense>
          </div>
        </section> */}

        {/* Enhanced ROI Calculator - Temporarily commented out */}
        {/* <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900/30" data-section="calculator">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4 !text-white" style={{ color: 'white' }}>
                {translations.advisor.client.calculator.title}
              </h2>
              <p className="text-gray-400">{translations.advisor.client.calculator.subtitle}</p>
            </div>
            <Suspense fallback={<CalculatorSkeleton />}>
              <InteractiveROICalculator />
            </Suspense>
          </div>
        </section> */}

        {/* How It Works */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" data-section="process">
          <div className="mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-6 !text-white" style={{ color: 'white' }}>
                {translations.advisor.client.process.title}
              </h2>
            </div>
            <div className="relative">
              {/* Connection line */}
              <div className="absolute top-8 left-8 right-8 h-0.5 bg-gradient-to-r from-primary via-primary to-primary hidden md:block" />

              <div className="grid gap-8 md:grid-cols-5">
                {translations.advisor.client.process.steps.map((step: any, index: number) => (
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
                {translations.advisor.client.trust.title}
              </h2>
            </div>
            <div className="grid gap-8 md:grid-cols-5">
              {translations.advisor.client.trust.points.map((point: any, index: number) => (
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
                {translations.advisor.client.faq.title}
              </h2>
            </div>
            <div className="space-y-4">
              {translations.advisor.client.faq.items.map((item: any, index: number) => (
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
              {translations.advisor.client.finalCta.title}
            </h2>
            <p className="text-xl text-gray-300 mb-4">
              {translations.advisor.client.finalCta.urgency}
            </p>
            <p className="text-lg text-green-400 mb-8">
              {translations.advisor.client.finalCta.riskReversal}
            </p>

            <FinalCTAButtons />

            {/* Subtle advisor recruitment - positioned after main CTAs */}
            <div className="mt-16 pt-8 border-t border-gray-700/30">
              <p className="text-sm text-gray-400 mb-4">
                Are you a senior engineer who loves helping other developers?
              </p>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
              >
                <Link href="/advisor/join">
                  <Icon name="arrow-right" className="w-4 h-4 me-2" />
                  Join our advisor network
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
