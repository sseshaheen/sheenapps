'use client'

import React from 'react'
import type { ComponentProps } from 'react'
import { useRouter } from '@/i18n/routing'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { useInfrastructureStatus } from '@/hooks/useInfrastructureStatus'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { ApiKeysCard } from './ApiKeysCard'
import { DatabaseStatusCard } from './DatabaseStatusCard'
import { DeployButton } from './DeployButton'
import { EasyModeSiteBadge } from './EasyModeSiteBadge'
import { HostingStatusCard } from './HostingStatusCard'
import { QuotasCard } from './QuotasCard'
import { CmsStatusCard } from './cms/CmsStatusCard'
import { AuthStatusCard } from './auth/AuthStatusCard'
import { Phase3PlaceholdersCard } from './phase3/Phase3PlaceholdersCard'
import { Phase3ToolsPanel } from './phase3/Phase3ToolsPanel'
import { DomainCard } from './DomainCard'
import { EmailHostingCard } from './EmailHostingCard'
import { ExportEjectCard } from './ExportEjectCard'
import { OnboardingChecklist } from './OnboardingChecklist'
import { GuidedFirstEditDialog, type GuidedFirstEditDialogTranslations } from './GuidedFirstEditDialog'
import { TeamCard } from './TeamCard'
import { useCmsContentTypes } from '@/hooks/useCmsAdmin'

interface InfrastructurePanelProps {
  projectId: string
  buildId?: string | null
  /** Simple Mode shows fewer cards to reduce cognitive load */
  isSimpleMode?: boolean
  /** Wizard Mode shows only the targeted panel with simplified UI */
  isWizardMode?: boolean
  /** Callback to toggle between simple and standard mode */
  onModeToggle?: () => void
  /** Panel to scroll to on mount (e.g., 'database', 'hosting', 'payments') */
  initialPanel?: string | null
  translations: {
    panel: {
      title: string
      simpleTitle?: string
      easyModeLabel: string
      loading: string
      description?: string
      advancedSettings?: string
      advancedSettingsHint?: string
      showAdvanced?: string
      showSimple?: string
    }
    database: {
      title: string
      schema: string
      tables: string
      storage: string
      status: {
        active: string
        provisioning: string
        error: string
      }
      actions: {
        viewSchema: string
        createTable: string
        queryConsole: string
      }
      dialogs: {
        schema: {
          title: string
          description: string
          tables: string
          columns: string
          type: string
          nullable: string
          primaryKey: string
          loading: string
          error: string
          noTables: string
          createFirst: string
          createTable: string
          rows: string
        }
        createTable: {
          title: string
          description: string
          tableName: string
          tableNamePlaceholder: string
          columns: string
          addColumn: string
          columnName: string
          columnType: string
          isNullable: string
          isPrimaryKey: string
          defaultValue: string
          create: string
          cancel: string
          remove: string
          nullable: string
          primaryKey: string
          creating: string
          success: string
          error: string
          validation: {
            tableNameRequired: string
            columnNameRequired: string
            atLeastOneColumn: string
          }
        }
        query: {
          title: string
          description: string
          queryPlaceholder: string
          run: string
          running: string
          clear: string
          results: string
          noResults: string
          executionTime: string
          rowCount: string
          error: string
          selectOnlyWarning: string
        }
      }
    }
    hosting: {
      title: string
      url: string
      subdomain: string
      lastDeploy: string
      currentBuild: string
      noDeploymentsYet: string
      status: {
        live: string
        deploying: string
        none: string
        error: string
      }
      actions: {
        openSite: string
      }
    }
    quotas: {
      title: string
      requests: string
      bandwidth: string
      resetsAt: string
      unlimited: string
    }
    cms: {
      title: string
      simpleTitle?: string
      subtitle: string
      typesLabel: string
      entriesLabel: string
      mediaLabel: string
      manage: string
      dialog: ComponentProps<typeof CmsStatusCard>['translations']['dialog']
    }
    apiKeys: {
      title: string
      publicKey: string
      serverKey: string
      hidden: string
      serverKeyShownOnce: string
      noServerKey: string
      status: {
        active: string
        notCreated: string
        expiring: string
      }
      actions: {
        copy: string
        copied: string
        copySuccess: string
        copyError: string
        copyDescription: string
        copyErrorDescription: string
        regenerate: string
        regenerating: string
      }
      hints: {
        public: string
        server: string
      }
      sdk: {
        title: string
        description: string
        copy: string
        note: string
      }
      regenerate: {
        confirmTitle: string
        confirmDescription: string
        warning: string
        cancel: string
        confirm: string
        success: string
        successDescription: string
        error: string
        newKeyLabel: string
        oldKeyExpires: string
      }
    }
    auth: {
      title: string
      subtitle: string
      cta: string
      dialog: ComponentProps<typeof AuthStatusCard>['translations']['dialog']
    }
    phase3: {
      title: string
      subtitle: string
      domains: string
      eject: string
      advancedDb: string
      comingSoon: string
    }
    phase3Tools: React.ComponentProps<typeof Phase3ToolsPanel>['translations']
    domains?: {
      title: string
      subdomain: string
      customDomain: string
      addDomain: string
      buyDomain: string
      connected: string
      pending: string
      registered: string
      expiresAt: string
      noDomains: string
    }
    emailHosting?: {
      title: string
      mailboxes: string
      sentThisMonth: string
      domains: string
      noMailboxes: string
      manage: string
      verified: string
      pending: string
    }
    exportEject?: {
      title: string
      export: {
        title: string
        description: string
        action: string
        exporting: string
        success: string
        error: string
      }
      eject: {
        title: string
        description: string
        action: string
        confirmTitle: string
        confirmDescription: string
        confirmWarning: string
        cancel: string
        confirm: string
        submitting: string
        success: string
        error: string
      }
    }
    team?: {
      title: string
      invite: string
      inviting: string
      emailPlaceholder: string
      roles: {
        owner: string
        admin: string
        editor: string
        viewer: string
      }
      status: {
        pending: string
        accepted: string
      }
      actions: {
        changeRole: string
        remove: string
      }
      empty: string
      you: string
      errors: {
        inviteFailed: string
        updateFailed: string
        removeFailed: string
      }
      success: {
        invited: string
        updated: string
        removed: string
      }
    }
    deploy: {
      button: string
      deploying: string
      dialogTitle: string
      buildLabel: string
      createdLabel: string
      deployTo: string
      includes: string
      staticFiles: string
      ssrBundle: string
      envVars: string
      warning: string
      previousBuild: string
      actions: {
        cancel: string
        deployNow: string
      }
      progress: {
        uploadingAssets: string
        deployingBundle: string
        updatingRouting: string
        complete: string
      }
      success: string
      error: string
    }
    errors: {
      loadFailed: string
    }
    siteBadge?: {
      siteIsLive: string
      publishingChanges: string
      notPublishedYet: string
      publishFailed: string
      openSite: string
      retry: string
    }
    onboarding?: {
      title: string
      dismiss: string
      progress: string
      steps: {
        createProject: string
        viewSite: string
        viewSiteAction: string
        addContent: string
        addContentAction: string
        shareSite: string
        shareSiteAction: string
      }
      dismissed: string
      reopen: string
      completed: string
      copiedToast: string
    }
    guidedFirstEdit?: GuidedFirstEditDialogTranslations
    wizardMode?: {
      tracking: {
        title: string
        subtitle: string
      }
      payments: {
        title: string
        subtitle: string
      }
      forms: {
        title: string
        subtitle: string
      }
      doneButton: string
      returnToSetup: string
    }
  }
  /** Project name for guided first edit */
  projectName?: string
  /** Project creation timestamp for first edit dialog timing */
  projectCreatedAt?: string | null
  /** Callback to update project name */
  onUpdateProjectName?: (newName: string) => Promise<void>
}

/**
 * Infrastructure Panel for Easy Mode Projects
 *
 * Shows real-time status of:
 * - Database (schema, tables, storage)
 * - Hosting (URL, deploy status)
 * - Quotas (requests, bandwidth)
 * - API Keys (public, server)
 *
 * Uses adaptive polling: 2s when deploying, 30s when stable
 */
export function InfrastructurePanel({
  projectId,
  buildId,
  isSimpleMode = false,
  isWizardMode = false,
  onModeToggle,
  initialPanel,
  translations,
  projectName,
  projectCreatedAt,
  onUpdateProjectName
}: InfrastructurePanelProps) {
  const router = useRouter()

  // Lift CMS dialog state so onboarding/first-edit can open it directly
  const [cmsDialogOpen, setCmsDialogOpen] = React.useState(false)

  // EXPERT FIX ROUND 2: Removed userId from hook (API uses session)
  const { status, isLoading, error, isValidating, mutate } = useInfrastructureStatus({
    projectId,
    enabled: true
  })

  // Query CMS content types for onboarding checklist (only when in simple mode)
  const cmsTypesQuery = useCmsContentTypes(projectId, isSimpleMode && !isWizardMode)

  // Wizard mode: map panel to wizard step type
  const getWizardStepType = (panel: string | null): 'tracking' | 'payments' | 'forms' | null => {
    if (!panel) return null
    if (panel === 'api-keys') return 'tracking'
    if (panel === 'phase3') return 'payments'
    if (panel === 'cms') return 'forms'
    return null
  }

  const wizardStepType = getWizardStepType(initialPanel)
  const wizardTitle = wizardStepType && translations.wizardMode
    ? translations.wizardMode[wizardStepType]?.title
    : null
  const wizardSubtitle = wizardStepType && translations.wizardMode
    ? translations.wizardMode[wizardStepType]?.subtitle
    : null

  // Return to Run Hub setup
  const handleReturnToSetup = () => {
    router.push(`/project/${projectId}/run`)
  }
  const hasContentTypes = (cmsTypesQuery.data?.length ?? 0) > 0
  const siteUrl = status?.hosting.url || (status?.hosting.subdomain ? `https://${status.hosting.subdomain}.sheenapps.com` : null)

  // State for "More Settings" expandable section in Simple Mode
  // Auto-expand if initialPanel targets a panel inside advanced settings
  const advancedPanels = ['database', 'auth', 'api-keys']
  const [showAdvancedSettings, setShowAdvancedSettings] = React.useState(
    isSimpleMode && initialPanel ? advancedPanels.includes(initialPanel) : false
  )

  // Scroll to requested panel on mount
  React.useEffect(() => {
    if (initialPanel && status) {
      // Small delay to ensure DOM is ready after conditional renders
      const timer = setTimeout(() => {
        const el = document.querySelector(`[data-panel="${initialPanel}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [initialPanel, status])

  // Wizard Mode: Simplified view showing only the targeted panel
  if (isWizardMode && initialPanel) {
    return (
      <div className="space-y-6">
        {/* Wizard Header */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon
                  name={wizardStepType === 'tracking' ? 'activity' : wizardStepType === 'payments' ? 'credit-card' : 'file-text'}
                  className="w-5 h-5 text-primary"
                />
              </div>
              <div>
                <CardTitle className="text-lg">{wizardTitle || translations.panel.title}</CardTitle>
                {wizardSubtitle && (
                  <CardDescription className="mt-1">{wizardSubtitle}</CardDescription>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Loading State */}
        {isLoading && !status && (
          <Card>
            <CardContent className="py-8">
              <div className="flex items-center justify-center gap-2">
                <Icon name="loader-2" className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">{translations.panel.loading}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && !status && (
          <Alert variant="destructive">
            <Icon name="alert-circle" className="h-4 w-4" />
            <AlertDescription>
              {translations.errors.loadFailed}: {error.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Single Panel Based on Step Type */}
        {status && (
          <div className="space-y-4">
            {/* Tracking → API Keys Card */}
            {initialPanel === 'api-keys' && (
              <div data-panel="api-keys">
                <ApiKeysCard
                  projectId={projectId}
                  keys={status.apiKeys}
                  translations={translations.apiKeys}
                  onKeyRegenerated={() => mutate()}
                />
              </div>
            )}

            {/* Payments → Phase 3 Tools (Stripe) */}
            {initialPanel === 'phase3' && (
              <div data-panel="phase3">
                <Phase3ToolsPanel projectId={projectId} translations={translations.phase3Tools} />
              </div>
            )}

            {/* Forms → CMS Card */}
            {initialPanel === 'cms' && (
              <div data-panel="cms">
                <CmsStatusCard
                  projectId={projectId}
                  siteUrl={siteUrl}
                  isSimpleMode={true}
                  dialogOpen={cmsDialogOpen}
                  onDialogOpenChange={setCmsDialogOpen}
                  translations={translations.cms}
                />
              </div>
            )}
          </div>
        )}

        {/* Done Button */}
        <div className="flex justify-center pt-4">
          <Button
            onClick={handleReturnToSetup}
            size="lg"
            className="min-h-[48px] w-full sm:w-auto"
          >
            <Icon name="check-circle" className="w-5 h-5 me-2" />
            {translations.wizardMode?.doneButton || 'Done'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Icon name={isSimpleMode ? "settings" : "server"} className="w-5 h-5" />
              {isSimpleMode && translations.panel.simpleTitle
                ? translations.panel.simpleTitle
                : translations.panel.title}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full">
                {translations.panel.easyModeLabel}
              </span>
              {onModeToggle && !isWizardMode && (
                <button
                  onClick={onModeToggle}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  {isSimpleMode
                    ? (translations.panel.showAdvanced ?? 'Show Advanced')
                    : (translations.panel.showSimple ?? 'Simple View')}
                </button>
              )}
              {isValidating && (
                <Icon name="loader-2" className="w-4 h-4 text-muted-foreground animate-spin" />
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Easy Mode: Site status badge (no manual deploy — auto-deploys on build) */}
      {status && isSimpleMode && translations.siteBadge && (
        <EasyModeSiteBadge
          projectId={projectId}
          hosting={status.hosting}
          translations={translations.siteBadge}
        />
      )}

      {/* Onboarding Checklist - Simple Mode only */}
      {isSimpleMode && translations.onboarding && (
        <OnboardingChecklist
          projectId={projectId}
          siteUrl={siteUrl}
          hasContentTypes={hasContentTypes}
          translations={translations.onboarding}
          onOpenCms={() => {
            // Open CMS dialog directly instead of just scrolling
            setCmsDialogOpen(true)
          }}
        />
      )}

      {/* Guided First Edit Dialog - Simple Mode only, for new projects */}
      {isSimpleMode && translations.guidedFirstEdit && projectName && (
        <GuidedFirstEditDialog
          projectId={projectId}
          projectName={projectName}
          isEasyMode={isSimpleMode}
          projectCreatedAt={projectCreatedAt}
          translations={translations.guidedFirstEdit}
          onUpdateProjectName={onUpdateProjectName}
          onOpenCms={() => {
            // Open CMS dialog directly instead of just scrolling
            setCmsDialogOpen(true)
          }}
        />
      )}

      {/* Advanced Mode: Manual Deploy button */}
      {status && !isSimpleMode && FEATURE_FLAGS.ENABLE_EASY_DEPLOY && (
        <div className="flex justify-end">
          <DeployButton
            projectId={projectId}
            buildId={buildId || status.hosting.currentBuildId}
            subdomain={status.hosting.subdomain}
            isDeploying={status.hosting.status === 'deploying'}
            translations={translations.deploy}
          />
        </div>
      )}

      {/* Loading State - Milestone C: Enhanced Skeleton Loaders */}
      {isLoading && !status && (
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          aria-busy="true"
          aria-label="Loading infrastructure status"
        >
          {/* Database Card Skeleton */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
              <div className="flex gap-2 mt-4">
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-28" />
              </div>
            </CardContent>
          </Card>

          {/* Hosting Card Skeleton */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-48" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-32" />
              </div>
              <div className="flex gap-2 mt-4">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </CardContent>
          </Card>

          {/* Quotas Card Skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>

          {/* API Keys Card Skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 w-8" />
                </div>
                <Skeleton className="h-3 w-full max-w-xs" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 w-8" />
                </div>
                <Skeleton className="h-3 w-full max-w-xs" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error State */}
      {error && !status && (
        <Alert variant="destructive">
          <Icon name="alert-circle" className="h-4 w-4" />
          <AlertDescription>
            {translations.errors.loadFailed}: {error.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Status Cards Grid - Simplified in Simple Mode */}
      {status && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CMS/Content - Always visible (primary user task) */}
          <div data-panel="cms">
            <CmsStatusCard
              projectId={projectId}
              siteUrl={siteUrl}
              isSimpleMode={isSimpleMode}
              dialogOpen={cmsDialogOpen}
              onDialogOpenChange={setCmsDialogOpen}
              translations={translations.cms}
            />
          </div>

          {/* Hosting/Publishing - Always visible (primary user task) */}
          <div data-panel="hosting">
            <HostingStatusCard
              projectId={projectId}
              status={status.hosting}
              translations={translations.hosting}
            />
          </div>

          {/* Domain Management - Simple Mode (P2-1) */}
          {isSimpleMode && translations.domains && (
            <div data-panel="domains">
              <DomainCard
                projectId={projectId}
                subdomain={status.hosting.subdomain}
                translations={translations.domains}
              />
            </div>
          )}

          {/* Email Hosting - Simple Mode (P2-2) */}
          {isSimpleMode && translations.emailHosting && (
            <div data-panel="email">
              <EmailHostingCard
                projectId={projectId}
                translations={translations.emailHosting}
              />
            </div>
          )}

          {/* Export & Eject - Simple Mode (P2-6) */}
          {isSimpleMode && translations.exportEject && (
            <div data-panel="export-eject">
              <ExportEjectCard
                projectId={projectId}
                translations={translations.exportEject}
              />
            </div>
          )}

          {/* Team / Collaboration - Simple Mode (P3-2) */}
          {isSimpleMode && translations.team && (
            <div data-panel="team">
              <TeamCard
                projectId={projectId}
                translations={translations.team}
              />
            </div>
          )}

          {/* Simple Mode: Show expandable "More Settings" card */}
          {isSimpleMode && (
            <Card className="md:col-span-2">
              <CardHeader
                className="cursor-pointer"
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              >
                <CardTitle className="text-base font-semibold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="settings" className="w-4 h-4" />
                    <span>{translations.panel.advancedSettings ?? 'Advanced Settings'}</span>
                  </div>
                  <Icon
                    name={showAdvancedSettings ? 'chevron-up' : 'chevron-down'}
                    className="w-4 h-4 text-muted-foreground"
                  />
                </CardTitle>
              </CardHeader>
              {showAdvancedSettings && (
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-0">
                  {/* Database */}
                  <div data-panel="database">
                    <DatabaseStatusCard
                      projectId={projectId}
                      status={status.database}
                      translations={translations.database}
                    />
                  </div>

                  {/* Auth */}
                  <div data-panel="auth">
                    <AuthStatusCard
                      publicKey={status.apiKeys.publicKey}
                      translations={translations.auth}
                    />
                  </div>

                  {/* API Keys */}
                  <div data-panel="api-keys">
                    <ApiKeysCard
                      projectId={projectId}
                      keys={status.apiKeys}
                      translations={translations.apiKeys}
                      onKeyRegenerated={() => mutate()}
                    />
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Standard/Advanced Mode: Show all cards */}
          {!isSimpleMode && (
            <>
              {/* Database Status */}
              <div data-panel="database">
                <DatabaseStatusCard
                  projectId={projectId}
                  status={status.database}
                  translations={translations.database}
                />
              </div>

              <div data-panel="auth">
                <AuthStatusCard
                  publicKey={status.apiKeys.publicKey}
                  translations={translations.auth}
                />
              </div>

              <div data-panel="phase3">
                <Phase3PlaceholdersCard translations={translations.phase3} />
              </div>

              <div data-panel="phase3-tools">
                <Phase3ToolsPanel projectId={projectId} translations={translations.phase3Tools} />
              </div>

              {/* Quotas */}
              <div data-panel="quotas">
                <QuotasCard
                  status={status.quotas}
                  translations={translations.quotas}
                />
              </div>

              {/* API Keys */}
              <div data-panel="api-keys">
                <ApiKeysCard
                  projectId={projectId}
                  keys={status.apiKeys}
                  translations={translations.apiKeys}
                  onKeyRegenerated={() => mutate()}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
