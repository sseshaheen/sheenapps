'use client'

import { InfrastructurePanel } from '@/components/builder/infrastructure/InfrastructurePanel'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { useResponsive } from '@/hooks/use-responsive'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
// useState removed - open is derived directly from URL

interface InfrastructureDrawerProps {
  projectId: string
  buildId?: string | null
  /** Simple Mode shows fewer cards to reduce cognitive load */
  isSimpleMode?: boolean
  /** Callback to toggle between simple and standard mode */
  onModeToggle?: () => void
  translations: {
    panel: {
      title: string
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
      dialog: {
        title: string
        description: string
        tabs: {
          types: string
          entries: string
          media: string
        }
        types: {
          header: string
          name: string
          slug: string
          schema: string
          schemaHelp: string
          schemaHint: string
          create: string
          creating: string
          empty: string
          error: string
          validation: {
            invalidSchema: string
            missingFields: string
          }
        }
        entries: {
          header: string
          contentType: string
          contentTypePlaceholder: string
          fieldPlaceholder: string
          requiredLabel: string
          slug: string
          status: string
          locale: string
          data: string
          dataHelp: string
          quickFill: string
          editorTabs: {
            form: string
            json: string
          }
          noSchema: string
          create: string
          creating: string
          empty: string
          error: string
          validation: {
            required: string
            invalidJson: string
            minLength: string
            maxLength: string
            min: string
            max: string
            pattern: string
          }
          hints: {
            format: string
            pattern: string
            description: string
            range: string
            currency: string
            percent: string
          }
          statuses: {
            draft: string
            published: string
            archived: string
          }
        }
        media: {
          header: string
          filename: string
          altText: string
          upload: string
          uploading: string
          empty: string
          error: string
          sizeNote: string
        }
        errors: {
          invalidJson: string
          missingType: string
          missingFile: string
        }
        preview?: {
          entryCreated: string
          viewOnSite: string
          previewOnSite: string
        }
      }
    }
    auth: {
      title: string
      subtitle: string
      cta: string
      dialog: {
        title: string
        description: string
        tabs: {
          signUp: string
          signIn: string
          magicLink: string
        }
        actions: {
          copy: string
          copied: string
        }
        notes: {
          apiKey: string
          session: string
          magicLink: string
        }
        preview: {
          title: string
          description: string
          emailLabel: string
          passwordLabel: string
          submitSignUp: string
          submitSignIn: string
          submitMagicLink: string
          sessionTokenLabel: string
          submitSessionCheck: string
          responseLabel: string
          warning: string
          copyResponse: string
          clearResponse: string
        }
      }
    }
    phase3: {
      title: string
      subtitle: string
      domains: string
      eject: string
      advancedDb: string
      comingSoon: string
    }
    phase3Tools: {
      title: string
      subtitle: string
      domains: {
        title: string
        placeholder: string
        add: string
        note: string
      }
      eject: {
        title: string
        description: string
        action: string
      }
      export: {
        title: string
        description: string
        action: string
      }
      table: {
        title: string
        description: string
        action: string
      }
    }
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
  }
}

/**
 * Infrastructure Drawer Component
 *
 * Right-side drawer (desktop) or bottom sheet (mobile) that displays
 * Easy Mode infrastructure status and controls.
 *
 * Features:
 * - URL state management (?infra=open)
 * - Mobile-responsive (full-screen on mobile, 600px drawer on desktop)
 * - Auto-close on navigation
 * - Deep-linkable from chat and other components
 */
export function InfrastructureDrawer({
  projectId,
  buildId,
  isSimpleMode = false,
  onModeToggle,
  translations
}: InfrastructureDrawerProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { isMobile } = useResponsive()

  // Read drawer state from URL - URL is single source of truth (no useState drift)
  // Supports both ?infra=open (generic) and ?infra=payments (panel-specific)
  const infraParam = searchParams.get('infra')
  const wizardParam = searchParams.get('wizard')

  // Derive open directly from URL (no useState needed - prevents drift on back/forward nav)
  const open = !!infraParam && infraParam !== 'closed'

  // Wizard mode: when user comes from setup wizard, show simplified view
  const isWizardMode = wizardParam === 'true'

  // Panel-specific deep linking (e.g., ?infra=database opens drawer scrolled to database)
  const initialPanel = infraParam && infraParam !== 'open' && infraParam !== 'closed' ? infraParam : null

  // Update URL when drawer opens/closes (URL is the single source of truth)
  const handleOpenChange = (newOpen: boolean) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()))

    if (newOpen) {
      // Preserve existing panel-specific value (e.g., 'database'), only set 'open' if none exists
      const existingInfra = current.get('infra')
      if (!existingInfra || existingInfra === 'closed') {
        current.set('infra', 'open')
      }
    } else {
      current.delete('infra')
      // Clear wizard param on close so it doesn't "stick" on next open
      current.delete('wizard')
    }

    const search = current.toString()
    const query = search ? `?${search}` : ''
    router.replace(`${pathname}${query}`, { scroll: false })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'h-[90vh] w-full'
            : 'w-[90vw] sm:w-[600px] md:w-[650px] lg:w-[700px] max-w-[700px]'
        }
      >
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Icon name="server" className="w-5 h-5" />
            <SheetTitle>{translations.panel.title}</SheetTitle>
            <Badge variant="default" className="text-xs">
              {translations.panel.easyModeLabel}
            </Badge>
          </div>
          <SheetDescription>
            {translations.panel.description ?? ''}
          </SheetDescription>
        </SheetHeader>

        {/* Infrastructure Panel Content */}
        {/* Use consistent height calc based on container (90vh on mobile, 100vh on desktop) */}
        <div className={`mt-6 overflow-y-auto pb-[env(safe-area-inset-bottom,12px)] ${
          isMobile ? 'max-h-[calc(90vh-140px)]' : 'max-h-[calc(100vh-140px)]'
        }`}>
          <InfrastructurePanel
            projectId={projectId}
            buildId={buildId}
            isSimpleMode={isSimpleMode}
            isWizardMode={isWizardMode}
            onModeToggle={onModeToggle}
            initialPanel={initialPanel}
            translations={translations}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
