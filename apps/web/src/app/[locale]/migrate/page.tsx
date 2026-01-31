/**
 * Website Migration Start Page
 * Main entry point for the AI-powered website migration system
 */

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { MigrationStartForm } from '@/components/migration/migration-start-form'
import { getNamespacedMessages } from '@/i18n/request'

// Force dynamic rendering - component uses useRouter which requires client context
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Website Migration | SheenApps',
  description: 'Migrate and modernize your existing website with AI-powered transformation.',
}

interface MigratePageProps {
  params: Promise<{
    locale: string
  }>
}

export default async function MigratePage({ params }: MigratePageProps) {
  const { locale } = await params

  // Check if migration system is enabled
  if (!FEATURE_FLAGS.ENABLE_MIGRATION_SYSTEM) {
    notFound()
  }

  // Load translations following the platform pattern
  const messages = await getNamespacedMessages(locale, [
    'migration',
    'common'
  ])

  const translations = {
    page: {
      title: messages.migration?.page?.title || 'Website Migration',
      description: messages.migration?.page?.description || 'Transform your existing website into a modern, high-performance Next.js application powered by AI.',
      features: {
        aiAnalysis: {
          title: messages.migration?.page?.features?.aiAnalysis?.title || 'AI-Powered Analysis',
          description: messages.migration?.page?.features?.aiAnalysis?.description || 'Our AI analyzes your website\'s structure, content, and design.'
        },
        modernTech: {
          title: messages.migration?.page?.features?.modernTech?.title || 'Modern Technologies',
          description: messages.migration?.page?.features?.modernTech?.description || 'Upgrade to Next.js 14, Tailwind CSS, and modern web standards.'
        },
        seamlessIntegration: {
          title: messages.migration?.page?.features?.seamlessIntegration?.title || 'Seamless Integration',
          description: messages.migration?.page?.features?.seamlessIntegration?.description || 'Migrated projects appear instantly in your workspace.'
        }
      },
      startForm: {
        title: messages.migration?.page?.startForm?.title || 'Start Your Migration',
        urlLabel: messages.migration?.page?.startForm?.urlLabel || 'Website URL',
        urlPlaceholder: messages.migration?.page?.startForm?.urlPlaceholder || 'https://example.com',
        urlDescription: messages.migration?.page?.startForm?.urlDescription || 'Enter the URL of the website you want to migrate.',
        migrationStyleLabel: messages.migration?.page?.startForm?.migrationStyleLabel || 'Migration Style',
        customInstructions: messages.migration?.page?.startForm?.customInstructions || 'Custom Instructions',
        customInstructionsOptional: messages.migration?.page?.startForm?.customInstructionsOptional || '(optional)',
        customInstructionsPlaceholder: messages.migration?.page?.startForm?.customInstructionsPlaceholder || 'Describe any specific requirements...',
        customInstructionsDescription: messages.migration?.page?.startForm?.customInstructionsDescription || 'Provide specific instructions to customize the migration process.',
        estimatedTimeLabel: messages.migration?.page?.startForm?.estimatedTimeLabel || 'Estimated Time',
        estimatedTimeActual: messages.migration?.page?.startForm?.estimatedTimeActual || 'Actual time may vary based on website complexity and size.',
        submitButton: messages.migration?.page?.startForm?.submitButton || 'Start Migration',
        submittingButton: messages.migration?.page?.startForm?.submittingButton || 'Starting Migration...',
        pasteButton: messages.migration?.page?.startForm?.pasteButton || 'Paste',
        urlDetectedToast: messages.migration?.page?.startForm?.urlDetectedToast || 'URL detected from clipboard!',
        urlPastedToast: messages.migration?.page?.startForm?.urlPastedToast || 'URL pasted from clipboard!',
        urlRequiredError: messages.migration?.page?.startForm?.urlRequiredError || 'Please enter a website URL',
        urlInvalidError: messages.migration?.page?.startForm?.urlInvalidError || 'Please enter a valid URL',
        rateLimitError: messages.migration?.page?.startForm?.rateLimitError || 'Rate limit exceeded. Please try again in {seconds} seconds.',
        migrationStartedToast: messages.migration?.page?.startForm?.migrationStartedToast || 'Migration started!',
        migrationFailedToast: messages.migration?.page?.startForm?.migrationFailedToast || 'Failed to start migration',
        disclaimers: {
          usesAiTime: messages.migration?.page?.startForm?.disclaimers?.usesAiTime || 'Migration uses AI time from your current plan',
          publicAccess: messages.migration?.page?.startForm?.disclaimers?.publicAccess || 'The website must be publicly accessible',
          manualAdjustment: messages.migration?.page?.startForm?.disclaimers?.manualAdjustment || 'Complex functionality may require manual adjustment'
        },
        presets: {
          exactCopy: {
            name: messages.migration?.page?.startForm?.presets?.exactCopy?.name || 'Exact Copy',
            description: messages.migration?.page?.startForm?.presets?.exactCopy?.description || 'Preserve everything as-is'
          },
          modernRefresh: {
            name: messages.migration?.page?.startForm?.presets?.modernRefresh?.name || 'Modern Refresh',
            description: messages.migration?.page?.startForm?.presets?.modernRefresh?.description || 'Keep design, improve UX'
          },
          completeOverhaul: {
            name: messages.migration?.page?.startForm?.presets?.completeOverhaul?.name || 'Complete Overhaul',
            description: messages.migration?.page?.startForm?.presets?.completeOverhaul?.description || 'Reimagine with modern design'
          }
        }
      },
      whatGetsMigrated: {
        title: messages.migration?.page?.whatGetsMigrated?.title || 'What Gets Migrated?',
        items: {
          content: messages.migration?.page?.whatGetsMigrated?.items?.content || 'Content and text from all pages',
          images: messages.migration?.page?.whatGetsMigrated?.items?.images || 'Images and media assets',
          navigation: messages.migration?.page?.whatGetsMigrated?.items?.navigation || 'Navigation structure and menus',
          seo: messages.migration?.page?.whatGetsMigrated?.items?.seo || 'SEO metadata and schema',
          forms: messages.migration?.page?.whatGetsMigrated?.items?.forms || 'Contact forms and basic functionality'
        }
      },
      pricingTime: {
        title: messages.migration?.page?.pricingTime?.title || 'Pricing & Time',
        typicalMigration: messages.migration?.page?.pricingTime?.typicalMigration || 'Typical Migration',
        typicalTime: messages.migration?.page?.pricingTime?.typicalTime || '9-19 minutes',
        usesAiTime: messages.migration?.page?.pricingTime?.usesAiTime || 'Uses AI time from your current plan.',
        phases: {
          analysis: messages.migration?.page?.pricingTime?.phases?.analysis || 'Analysis Phase:',
          planning: messages.migration?.page?.pricingTime?.phases?.planning || 'Planning Phase:',
          transformation: messages.migration?.page?.pricingTime?.phases?.transformation || 'Transformation:',
          deployment: messages.migration?.page?.pricingTime?.phases?.deployment || 'Deployment:'
        },
        times: {
          analysis: messages.migration?.page?.pricingTime?.times?.analysis || '~1 minute',
          planning: messages.migration?.page?.pricingTime?.times?.planning || '~2 minutes',
          transformation: messages.migration?.page?.pricingTime?.times?.transformation || '5-15 minutes',
          deployment: messages.migration?.page?.pricingTime?.times?.deployment || '~1 minute'
        }
      }
    },
    common: {
      minutes: messages.migration?.common?.minutes || messages.common?.minutes || 'minutes',
      minute: messages.migration?.common?.minute || messages.common?.minute || 'minute',
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'An error occurred'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header spacer - semantic approach */}
      <div className="header-spacer" aria-hidden="true" />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            {translations.page.title}
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {translations.page.description}
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-card p-6 rounded-lg border">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold mb-2">{translations.page.features.aiAnalysis.title}</h3>
            <p className="text-sm text-muted-foreground">
              {translations.page.features.aiAnalysis.description}
            </p>
          </div>

          <div className="bg-card p-6 rounded-lg border">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h4l-4-4M5 5v12" />
              </svg>
            </div>
            <h3 className="font-semibold mb-2">{translations.page.features.modernTech.title}</h3>
            <p className="text-sm text-muted-foreground">
              {translations.page.features.modernTech.description}
            </p>
          </div>

          <div className="bg-card p-6 rounded-lg border">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold mb-2">{translations.page.features.seamlessIntegration.title}</h3>
            <p className="text-sm text-muted-foreground">
              {translations.page.features.seamlessIntegration.description}
            </p>
          </div>
        </div>

        {/* Migration Form */}
        <div className="bg-card p-8 rounded-lg border">
          <h2 className="text-2xl font-semibold mb-6">{translations.page.startForm.title}</h2>
          <MigrationStartForm translations={translations} />
        </div>

        {/* Information Section */}
        <div className="mt-12 grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-4">{translations.page.whatGetsMigrated.title}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {translations.page.whatGetsMigrated.items.content}
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {translations.page.whatGetsMigrated.items.images}
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {translations.page.whatGetsMigrated.items.navigation}
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {translations.page.whatGetsMigrated.items.seo}
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {translations.page.whatGetsMigrated.items.forms}
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">{translations.page.pricingTime.title}</h3>
            <div className="space-y-4 text-sm">
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">{translations.page.pricingTime.typicalMigration}</span>
                  <span className="text-primary font-semibold">{translations.page.pricingTime.typicalTime}</span>
                </div>
                <p className="text-muted-foreground">
                  {translations.page.pricingTime.usesAiTime}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{translations.page.pricingTime.phases.analysis}</span>
                  <span>{translations.page.pricingTime.times.analysis}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{translations.page.pricingTime.phases.planning}</span>
                  <span>{translations.page.pricingTime.times.planning}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{translations.page.pricingTime.phases.transformation}</span>
                  <span>{translations.page.pricingTime.times.transformation}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{translations.page.pricingTime.phases.deployment}</span>
                  <span>{translations.page.pricingTime.times.deployment}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
