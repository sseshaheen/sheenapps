
'use client'

import { PublishButton } from '@/components/builder/publish-button'
import { WorkspaceUndoToolbar } from '@/components/builder/ui/workspace-undo-toolbar'
import { VersionStatusBadge } from '@/components/builder/version-status-badge'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { UserMenu } from '@/components/ui/user-menu'
import { useTranslations, useLocale } from 'next-intl'

// EXPERT FIX: RTL locales for proper header direction
const RTL_LOCALES = new Set(['ar', 'ar-eg', 'ar-sa', 'ar-ae'])






import { ROUTES } from '@/i18n/routes'
import { Link, useRouter } from '@/i18n/routing'
import { useAuthStore } from '@/store'
import { useSearchParams, usePathname } from 'next/navigation'

interface WorkspaceHeaderProps {
  projectId: string
  projectName: string
  onShare: () => void
  onExport: () => void
  translations: {
    header: {
      back: string
      share: string
      export: string
      settings: string
      undo?: string
      redo?: string
      undoTooltip?: string
      redoTooltip?: string
      nothingToUndo?: string
      nothingToRedo?: string
      undoShortcut?: string
      redoShortcut?: string
    }
  }
  canShare: boolean
  canExport: boolean
  /** Simple Mode hides integration status bar (reduces cognitive load) */
  isSimpleMode?: boolean
}

export function WorkspaceHeader({
  projectId,
  projectName,
  onShare,
  onExport,
  translations,
  canShare,
  canExport,
  isSimpleMode = false
}: WorkspaceHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, logout } = useAuthStore()
  const t = useTranslations('builder.workspace.header')
  const locale = useLocale()

  // EXPERT FIX: Determine direction from locale instead of forcing LTR globally
  const isRTL = RTL_LOCALES.has(locale)
  const headerDir = isRTL ? 'rtl' : 'ltr'

  // Suppress unused variable warning - kept for potential future use
  void isSimpleMode

  const handleLogout = async () => {
    await logout()
    router.refresh()
  }

  // Phase 3: Settings gear opens Infrastructure Drawer
  // Replaces 4 integration dots with single unified entry point
  // See: WORKSPACE_SIMPLIFICATION_PLAN.md Phase 3
  const handleOpenSettings = () => {
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.set('infra', 'open')
    const search = current.toString()
    // Use router.push with scroll: false for soft navigation
    router.push(`${pathname}?${search}`, { scroll: false })
  }

return (
  // EXPERT FIX: Use locale-aware direction instead of forcing LTR globally
  // This massively improves "Arabic-first" feel for RTL users
  <header
    dir={headerDir}
    style={{ direction: headerDir }}
    className="relative z-50 flex items-center w-full bg-gray-800 border-b border-gray-700 px-4 h-14"
  >
    {/* LEFT */}
    <div className="relative z-10 flex items-center gap-3 min-w-0">
      <Link href={ROUTES.DASHBOARD} className="shrink-0 hover:opacity-80 transition-opacity">
        <img
          src="https://www.sheenapps.com/sheenapps-logo-trans--min.png"
          alt={t('logoAlt')}
          className="h-6 shrink-0"
        />
      </Link>
      <span className="text-gray-400 shrink-0">•</span>
      <h1 className="text-lg font-semibold truncate min-w-0">{projectName}</h1>
    </div>

    {/* SPACER - pushes RIGHT to the right edge */}
    <div className="flex-1 min-w-4" />

    {/* RIGHT - z-50 ensures it's above everything including badge dropdowns */}
    <div
      data-cq="workspace"
      className="relative z-50 flex items-center gap-2 flex-nowrap shrink-0"
    >


      {translations.header.undo && (
        <div className="shrink-0 border-e border-gray-700 pe-3 me-1">
          <WorkspaceUndoToolbar
            translations={{
              undo: translations.header.undo || 'Undo',
              redo: translations.header.redo || 'Redo',
              undoTooltip: translations.header.undoTooltip || 'Undo last change',
              redoTooltip: translations.header.redoTooltip || 'Redo last change',
              nothingToUndo: translations.header.nothingToUndo || 'Nothing to undo',
              nothingToRedo: translations.header.nothingToRedo || 'Nothing to redo',
              undoShortcut: translations.header.undoShortcut || 'Ctrl+Z',
              redoShortcut: translations.header.redoShortcut || 'Ctrl+Shift+Z'
            }}
            showLabels={false}
          />
        </div>
      )}

      {/* Share */}
      <div className="relative shrink-0">
        <Button
          variant="workspace"
          size="sm"
          onClick={onShare}
          disabled
          className="opacity-60 cursor-not-allowed inline-flex items-center gap-2"
          title={t('comingSoonShare')}
        >
          <Icon name="share-2" className="w-4 h-4 shrink-0" />
          <span className="hidden xl:inline whitespace-nowrap">{translations.header.share}</span>
        </Button>
        <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 bg-gray-600 text-gray-200 text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-none z-10 pointer-events-none">
          {t('soon')}
        </span>
      </div>

      {/* Export */}
      <div className="relative shrink-0">
        <Button
          variant="workspace"
          size="sm"
          onClick={onExport}
          disabled={!canExport}
          className="inline-flex items-center gap-2"
          title={canExport ? t('exportTitle') : t('exportNotAvailable')}
          data-testid="export-button"
        >
          <Icon name="download" className="w-4 h-4 shrink-0" />
          <span className="hidden xl:inline whitespace-nowrap">{translations.header.export}</span>
        </Button>
        {canExport && (
          <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-none z-10 pointer-events-none">
            {t('new')}
          </span>
        )}
      </div>

      {/* Run - Business dashboard for live projects */}
      <div className="shrink-0">
        <Link
          href={`/project/${projectId}/run`}
          className="inline-flex items-center gap-2 h-8 px-3 text-sm font-medium rounded-md bg-transparent hover:bg-gray-700 text-gray-200 transition-colors"
          title={t('openRun') ?? 'View business dashboard'}
          data-testid="run-button"
        >
          <Icon name="bar-chart" className="w-4 h-4 shrink-0" />
          <span className="hidden xl:inline whitespace-nowrap">{t('run') ?? 'Run'}</span>
        </Link>
      </div>

      {/* Settings - Opens Infrastructure Drawer (Phase 3: replaces integration dots) */}
      <div className="shrink-0">
        <Button
          variant="workspace"
          size="sm"
          onClick={handleOpenSettings}
          className="inline-flex items-center gap-2"
          title={t('openSettings') ?? 'Open project settings'}
          data-testid="settings-button"
        >
          <Icon name="settings" className="w-4 h-4 shrink-0" />
          <span className="hidden xl:inline whitespace-nowrap">{translations.header.settings}</span>
        </Button>
      </div>

      {/* Phase 4: Publish CTA - Primary action button */}
      {/* See: WORKSPACE_SIMPLIFICATION_PLAN.md Phase 4 */}
      <div className="shrink-0">
        <PublishButton projectId={projectId} variant="desktop" />
      </div>

      {/* Version badge for version history access (simplified from main CTA) */}
      <div className="shrink-0">
        <VersionStatusBadge projectId={projectId} variant="desktop" />
      </div>

      {/* User Menu */}
      {user && (
        <div className="shrink-0 min-w-fit ms-3 ps-3 border-s border-gray-700">
          <UserMenu user={user} onLogout={handleLogout} variant="compact" showPlan />
        </div>
      )}
    </div>
  </header>
)
}
