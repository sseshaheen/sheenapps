//src/app/[locale]/builder/new/page.tsx
import { NewProjectPage } from '@/components/builder/new-project-page'
import { locales, type Locale } from '@/i18n/config'
import { getAllMessagesForLocale } from '@/i18n/request'
import { notFound } from 'next/navigation'

export async function generateStaticParams() {
  return locales.map((locale) => ({
    locale,
  }))
}

export default async function BuilderNewPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  // Load messages for builder interface
  const messages = await getAllMessagesForLocale(locale)

  // Map loaded translations to component structure
  const builderMessages = messages.builder || {}
  const ideaCapture = builderMessages.ideaCapture || {}
  const templates = builderMessages.templates || {}
  const form = builderMessages.form || {}
  const planStatus = builderMessages.planStatus || {}
  const commonMessages = messages.common || {}
  const navigationMessages = messages.navigation || {}
  const authMessages = messages.auth || {}
  const infrastructureMessages = messages.infrastructure || {}
  const pricingMessages = messages.pricing || {}

  const translations = {
    navigation: {
      builder: navigationMessages.builder || 'Builder'
    },
    auth: {
      signInButton: authMessages.login?.signInButton || 'Sign In'
    },
    builder: {
      newProject: {
        title: ideaCapture.title || 'Start Building Your Business',
        subtitle: ideaCapture.description || 'Describe your business idea and watch it come to life with AI + human expertise',
        placeholder: ideaCapture.placeholder || "What's your business idea? (e.g., 'A booking system for my salon')",
        signInPlaceholder: ideaCapture.signInPlaceholder || 'Please sign in to start building your project',
        signInRequired: ideaCapture.signInRequired || 'Sign In Required',
        signInMessage: ideaCapture.signInMessage || 'Please sign in to create and manage your projects',
        signInToStartBuilding: ideaCapture.signInToStartBuilding || 'Sign In to Start Building',
        examples: ideaCapture.examples || [
          'I want to sell homemade cookies online',
          'I need a booking app for my salon',
          'Create an e-commerce store for handmade jewelry',
          'Build a food delivery app for my restaurant'
        ],
        startBuilding: ideaCapture.submitButton || 'Start Building',
        useVoice: ideaCapture.voiceButton || 'Use voice input',
        uploadFiles: ideaCapture.attachButton || 'Upload files'
      },
      templates: {
        title: templates.title || 'Or choose a template',
        subtitle: templates.subtitle || 'Get started faster with industry-specific templates',
        viewAll: templates.viewAll || 'View all templates',
        allCategories: templates.allCategories || 'All',
        preview: templates.preview || 'Preview',
        useTemplate: templates.useTemplate || 'Use Template',
        proRequired: templates.proRequired || 'Pro Required',
        features: templates.features || 'Features',
        categories: templates.categories || {
          retail: 'Retail',
          services: 'Services',
          technology: 'Technology',
          platform: 'Platform',
          food: 'Food',
          creative: 'Creative',
          education: 'Education',
          corporate: 'Corporate',
          health: 'Health',
          publishing: 'Publishing',
          events: 'Events',
          'real-estate': 'Real Estate'
        },
        items: templates.items || {
          ecommerce: {
            name: 'E-commerce Store',
            description: 'Sell products online with payments & inventory'
          },
          booking: {
            name: 'Booking System',
            description: 'Appointment scheduling for service businesses'
          },
          saas: {
            name: 'SaaS Platform',
            description: 'Subscription software with user management'
          },
          marketplace: {
            name: 'Marketplace',
            description: 'Connect buyers and sellers with commissions'
          },
          restaurant: {
            name: 'Restaurant',
            description: 'Menu and ordering for restaurants'
          },
          portfolio: {
            name: 'Portfolio',
            description: 'Showcase your work and skills'
          },
          'course-platform': {
            name: 'Course Platform',
            description: 'Online courses and learning'
          },
          'business-landing': {
            name: 'Business Landing',
            description: 'Professional business website'
          },
          'gym-fitness': {
            name: 'Gym & Fitness',
            description: 'Gym memberships and class booking'
          },
          blog: {
            name: 'Blog',
            description: 'Content publishing platform'
          },
          'real-estate': {
            name: 'Real Estate',
            description: 'Property listings and inquiries'
          },
          'events-ticketing': {
            name: 'Events & Ticketing',
            description: 'Event management and ticket sales'
          }
        }
      },
      form: {
        businessIdea: form.businessIdea || 'Business Idea',
        tryExamples: form.tryExamples || 'Try these examples:'
      },
      planStatus: {
        plan: planStatus.plan || 'Plan',
        unlimitedGenerations: planStatus.unlimitedGenerations || 'Unlimited generations',
        generationsRemaining: planStatus.generationsRemaining || '{count} generations remaining',
        upgrade: planStatus.upgrade || 'Upgrade'
      }
    },
    pricing: {
      plans: pricingMessages.plans || {
        free: { name: 'Free', description: 'Free plan' },
        starter: { name: 'Starter', description: 'Starter plan' },
        growth: { name: 'Growth', description: 'Growth plan' },
        scale: { name: 'Scale', description: 'Scale plan' }
      }
    },
    infrastructure: infrastructureMessages.modeSelection ? {
      modeSelection: infrastructureMessages.modeSelection
    } : undefined,
    common: {
      loading: commonMessages.loading || 'Loading...',
      error: commonMessages.error || 'Something went wrong',
      retry: commonMessages.retry || 'Try again'
    }
  }

  return <NewProjectPage translations={translations} locale={locale} />
}
