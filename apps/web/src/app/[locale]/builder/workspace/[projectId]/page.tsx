import { EnhancedWorkspacePage } from '@/components/builder/enhanced-workspace-page'
import { locales, type Locale } from '@/i18n/config'
import { notFound } from 'next/navigation'
import { redirect } from '@/i18n/routing' // Use server-side i18n redirect
import { getAllMessagesForLocale } from '@/i18n/request'
import { logger } from '@/utils/logger'
import { getServerAuthState } from '@/lib/auth-server'

// EXPERT FIX: Prevent cached pages from showing private UI
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function BuilderWorkspacePage({ 
  params,
  searchParams
}: { 
  params: Promise<{ locale: string; projectId: string }>
  searchParams: Promise<{ idea?: string; template?: string }>
}) {
  const { locale, projectId } = await params
  const { idea, template } = await searchParams
  
  logger.debug('general', 'Workspace page initialized', { locale, projectId, idea, template })
  
  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  // EXPERT FIX: Strict server-side authentication gate
  const authState = await getServerAuthState()
  
  if (!authState.isAuthenticated) {
    logger.debug('general', 'Workspace page: User not authenticated, redirecting to login', {
      projectId,
      hasUser: !!authState.user,
      locale
    })
    // EXPERT FIX: Include locale in returnTo URL for proper routing after login
    const returnTo = `/${locale}/builder/workspace/${projectId}`
    redirect({
      href: `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
      locale: locale as Locale
    })
  }

  // EXPERT FIX: Removed email (PII) from logs
  logger.debug('general', 'Workspace page: User authenticated', {
    userId: authState.user?.id?.slice(0, 8),
    hasEmail: !!authState.user?.email
  })

  // Load messages for workspace interface
  const messages = await getAllMessagesForLocale(locale)

  // Map loaded translations to component structure
  const workspaceMessages = messages.workspace || {}
  const builderMessages = messages.builder || {}
  const commonMessages = messages.common || {}
  const infrastructureMessages = messages.infrastructure || {}

  const translations = {
    workspace: {
      viewTabs: {
        preview: workspaceMessages.viewTabs?.preview || 'Preview',
        code: workspaceMessages.viewTabs?.code || 'Code'
      },
      header: {
        back: workspaceMessages.header?.back || 'Back',
        unsavedChanges: workspaceMessages.header?.unsavedChanges || 'Unsaved changes',
        justNow: workspaceMessages.header?.justNow || 'Just now',
        minutesAgo: workspaceMessages.header?.minutesAgo || '{minutes}m ago',
        share: workspaceMessages.header?.share || 'Share',
        export: workspaceMessages.header?.export || 'Export',
        settings: workspaceMessages.header?.settings || 'Settings'
      },
      saveStatus: {
        saving: workspaceMessages.saveStatus?.saving || 'Saving...',
        saved: workspaceMessages.saveStatus?.saved || 'Saved'
      },
      sidebar: {
        design: 'Design',
        preview: 'Preview',
        export: 'Export',
        settings: 'Settings',
        projects: 'Projects'
      },
      aiChat: {
        title: builderMessages.interface?.chat?.title || 'AI Assistant',
        placeholder: builderMessages.interface?.chat?.placeholder || 'Ask me anything about your business...',
        thinking: builderMessages.interface?.chat?.thinking || 'AI is thinking...',
        examples: [
          'Add a contact form',
          'Change the color scheme',
          'Add payment processing',
          'Improve the mobile layout'
        ]
      },
      preview: {
        title: builderMessages.interface?.preview?.title || 'Preview',
        desktop: 'Desktop',
        tablet: 'Tablet',
        mobile: 'Mobile',
        refresh: 'Refresh',
        fullscreen: 'Fullscreen'
      },
      buildLog: {
        title: builderMessages.interface?.buildLog?.title || 'Build Progress',
        analyzing: 'Analyzing business idea...',
        generating: 'Generating structure...',
        styling: 'Applying design...',
        finalizing: 'Finalizing build...'
      }
    },
    advisorMatching: {
      match: {
        matchedTitle: workspaceMessages.advisorMatching?.match?.matchedTitle || 'Advisor Matched!',
        matchedDescription: workspaceMessages.advisorMatching?.match?.matchedDescription || 'We found a great match for your project',
        advisorDetails: workspaceMessages.advisorMatching?.match?.advisorDetails || 'Specialized in your project technologies',
        matchScore: workspaceMessages.advisorMatching?.match?.matchScore || 'Match Score',
        yearsExperience: workspaceMessages.advisorMatching?.match?.yearsExperience || 'Years Experience',
        rating: workspaceMessages.advisorMatching?.match?.rating || 'Rating',
        reviews: workspaceMessages.advisorMatching?.match?.reviews || 'Reviews',
        skills: workspaceMessages.advisorMatching?.match?.skills || 'Skills',
        approve: workspaceMessages.advisorMatching?.match?.approve || 'Approve Match',
        decline: workspaceMessages.advisorMatching?.match?.decline || 'Decline',
        dismiss: workspaceMessages.advisorMatching?.match?.dismiss || 'Dismiss'
      },
      decline: {
        title: workspaceMessages.advisorMatching?.decline?.title || 'Match Declined',
        description: workspaceMessages.advisorMatching?.decline?.description || 'Would you like to:',
        retryLabel: workspaceMessages.advisorMatching?.decline?.retryLabel || 'Find a different advisor',
        retryDescription: workspaceMessages.advisorMatching?.decline?.retryDescription || "We'll search for another expert",
        browseLabel: workspaceMessages.advisorMatching?.decline?.browseLabel || 'Browse all advisors',
        browseDescription: workspaceMessages.advisorMatching?.decline?.browseDescription || 'Choose from our full expert directory',
        laterLabel: workspaceMessages.advisorMatching?.decline?.laterLabel || 'Maybe later',
        laterDescription: workspaceMessages.advisorMatching?.decline?.laterDescription || 'You can request an advisor anytime'
      },
      banner: {
        advisorJoined: workspaceMessages.advisorMatching?.banner?.advisorJoined || 'Your advisor has joined the workspace and is ready to help!',
        dismiss: workspaceMessages.advisorMatching?.banner?.dismiss || 'Dismiss'
      }
    },
    common: {
      loading: commonMessages.loading || 'Loading...',
      error: commonMessages.error || 'Something went wrong',
      retry: commonMessages.retry || 'Try again',
      save: commonMessages.save || 'Save',
      cancel: commonMessages.cancel || 'Cancel'
    },
    infrastructure: infrastructureMessages
  }

  return (
    <EnhancedWorkspacePage 
      translations={translations}
      locale={locale}
      projectId={projectId}
      initialAuthState={authState}
    />
  )
}