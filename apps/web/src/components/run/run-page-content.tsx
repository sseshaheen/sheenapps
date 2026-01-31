'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useWorkspaceProject } from '@/hooks/use-workspace-project'
import { LoadingSpinner } from '@/components/ui/loading'
import { RunHeader } from './run-header'
import { RunOverviewContent } from './run-overview-content'
import { RunOrdersContent } from './run-orders-content'
import { RunLeadsContent } from './run-leads-content'
import { RunNotificationsContent } from './run-notifications-content'
import { RunExplorerContent } from './run-explorer-content'
import { SetupWizard } from './setup-wizard'
import { useTranslations, useLocale } from 'next-intl'
import Icon from '@/components/ui/icon'
import { Link, useRouter } from '@/i18n/routing'
import { ROUTES } from '@/i18n/routes'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { cn } from '@/lib/utils'

// localStorage key for wizard dismissal
const WIZARD_DISMISSED_KEY = 'run_wizard_dismissed'

type TabType = 'overview' | 'transactions' | 'leads' | 'notifications' | 'explorer'

interface RunPageContentProps {
  projectId: string
}

// Integration status type (Phase 4)
interface Integrations {
  tracking: boolean
  payments: boolean
  forms: boolean
}

export function RunPageContent({ projectId }: RunPageContentProps) {
  const router = useRouter()
  const locale = useLocale()
  const { project, isLoading, error } = useWorkspaceProject(projectId)
  const t = useTranslations('run')
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [integrations, setIntegrations] = useState<Integrations | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [wizardDismissed, setWizardDismissed] = useState<boolean | null>(null)

  // Fetch integrations function (extracted for reuse)
  const fetchIntegrationsData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/run/overview?_t=${Date.now()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      })
      const json = await res.json()
      if (json.ok && json.data?.integrations) {
        setIntegrations(json.data.integrations)
        return json.data.integrations
      }
    } catch {
      // Silent failure - integrations is optional enhancement
    }
    return null
  }, [projectId])

  // Check localStorage for wizard dismissal on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissed = localStorage.getItem(`${WIZARD_DISMISSED_KEY}:${projectId}`)
    setWizardDismissed(dismissed === 'true')
  }, [projectId])

  // Fetch integrations once on mount for context-aware empty states
  useEffect(() => {
    fetchIntegrationsData()
  }, [fetchIntegrationsData])

  // Show wizard if integrations missing and not dismissed
  // Trigger: deployed project + missing tracking OR payments + not dismissed
  useEffect(() => {
    // Wait for dismissal check to complete
    if (wizardDismissed === null) return
    if (wizardDismissed) {
      setShowWizard(false)
      return
    }
    if (!integrations) return

    // Show wizard if at least one core integration is missing
    const needsSetup = !integrations.tracking || !integrations.payments
    setShowWizard(needsSetup)
  }, [integrations, wizardDismissed])

  // Handle wizard dismissal
  const handleWizardDismiss = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`${WIZARD_DISMISSED_KEY}:${projectId}`, 'true')
    }
    setWizardDismissed(true)
    setShowWizard(false)
  }, [projectId])

  // Handle wizard completion
  const handleWizardComplete = useCallback(() => {
    setShowWizard(false)
    // Refresh integrations to reflect any changes
    fetchIntegrationsData()
  }, [fetchIntegrationsData])

  // Deep-link support: apply ?tab= on initial mount only
  const hasAppliedInitialTab = useRef(false)
  const tabParam = searchParams.get('tab')
  useEffect(() => {
    if (hasAppliedInitialTab.current) return
    if (tabParam && (['overview', 'transactions', 'leads', 'notifications', 'explorer'] as const).includes(tabParam as TabType)) {
      setActiveTab(tabParam as TabType)
      hasAppliedInitialTab.current = true
    }
  }, [tabParam])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Icon name="alert-circle" className="w-12 h-12 text-muted-foreground" />
        <p className="text-lg text-muted-foreground">
          {error?.code === 'PROJECT_NOT_FOUND'
            ? 'Project not found'
            : error?.code === 'ACCESS_DENIED'
            ? 'You do not have access to this project'
            : 'Failed to load project'}
        </p>
        <Link
          href={ROUTES.DASHBOARD}
          className="text-sm text-primary hover:underline"
        >
          Return to Dashboard
        </Link>
      </div>
    )
  }

  // Check if project is deployed
  if (project.buildStatus !== 'deployed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Icon name="rocket" className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">{t('notDeployed.title')}</h2>
          <p className="text-muted-foreground max-w-md">
            {t('notDeployed.description')}
          </p>
        </div>
        <Button
          onClick={() => router.push(`/builder/workspace/${projectId}`)}
          className="mt-2 min-h-[44px]"
        >
          <Icon name="pencil" className="w-4 h-4 me-2" />
          {t('notDeployed.goToBuilder')}
        </Button>
      </div>
    )
  }

  const tabs: { id: TabType; label: string; icon: 'layout-grid' | 'credit-card' | 'users' | 'bell' | 'search' }[] = [
    { id: 'overview', label: t('tabs.overview'), icon: 'layout-grid' },
    { id: 'transactions', label: t('tabs.transactions'), icon: 'credit-card' },
    { id: 'leads', label: t('tabs.leads'), icon: 'users' },
    { id: 'notifications', label: t('tabs.notifications'), icon: 'bell' },
    { id: 'explorer', label: t('tabs.explorer'), icon: 'search' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <RunHeader projectId={projectId} projectName={project.name} />

      {/* Setup Wizard Modal (Phase 5) */}
      {showWizard && integrations && (
        <SetupWizard
          projectId={projectId}
          integrations={integrations}
          locale={locale}
          onDismiss={handleWizardDismiss}
          onComplete={handleWizardComplete}
        />
      )}

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6">
          {/* Page Header */}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{t('overview.title')}</h1>
            <p className="text-muted-foreground mt-1 md:mt-2">
              {t('overview.subtitle')}
            </p>
          </div>

          {/* Tab Navigation - P1 RTL Fix: Added scroll affordance */}
          <div className="border-b relative">
            {/* Scroll shadow indicators - visible when content overflows */}
            <div className="absolute start-0 top-0 bottom-0 w-4 bg-gradient-to-e from-background to-transparent pointer-events-none z-10 opacity-0 [.overflow-x-auto:has(:first-child:not(:hover))>&]:opacity-100" aria-hidden="true" />
            <div className="absolute end-0 top-0 bottom-0 w-4 bg-gradient-to-s from-background to-transparent pointer-events-none z-10 rtl:bg-gradient-to-e" aria-hidden="true" />
            <div className="overflow-x-auto">
              <nav className="flex gap-1 min-w-max whitespace-nowrap" aria-label="Tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors min-h-[44px]',
                      activeTab === tab.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                    )}
                    aria-current={activeTab === tab.id ? 'page' : undefined}
                    aria-label={tab.label}
                  >
                    <Icon name={tab.icon} className="w-4 h-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Tab Content */}
          <ErrorBoundary context={`Run${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`}>
            {activeTab === 'overview' && <RunOverviewContent projectId={projectId} />}
            {activeTab === 'transactions' && <RunOrdersContent projectId={projectId} integrations={integrations} />}
            {activeTab === 'leads' && <RunLeadsContent projectId={projectId} integrations={integrations} />}
            {activeTab === 'notifications' && <RunNotificationsContent projectId={projectId} />}
            {activeTab === 'explorer' && <RunExplorerContent projectId={projectId} />}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
