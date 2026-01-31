'use client'

import { PublishButton } from '@/components/builder/publish-button'
import { VersionStatusBadge } from '@/components/builder/version-status-badge'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { UserMenu } from '@/components/ui/user-menu'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { logger } from '@/utils/logger'
import { useTranslations } from 'next-intl'
import { useSearchParams, usePathname } from 'next/navigation'
import { useState } from 'react'

interface MobileWorkspaceHeaderProps {
  projectId?: string
  projectName?: string
  onShare?: () => void
  onExport?: () => void
  translations?: {
    share?: string
    export?: string
    settings?: string
  }
  canShare?: boolean
  canExport?: boolean
  /** Simple Mode hides database integration button (reduces cognitive load) */
  isSimpleMode?: boolean
}

/**
 * Mobile-optimized workspace header with collapsible actions
 * Provides essential navigation and project controls in minimal space
 */
export function MobileWorkspaceHeader({
  projectId,
  projectName = 'Untitled Project',
  onShare = () => logger.info('Share'),
  onExport = () => logger.info('Export'),
  translations = {
    share: 'Share',
    export: 'Export',
    settings: 'Settings'
  },
  canShare = true,
  canExport = true,
  isSimpleMode = false
}: MobileWorkspaceHeaderProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('workspace.mobile.header')
  const shareEnabled = Boolean(canShare)
  const exportEnabled = Boolean(canExport)

  // Suppress unused variable warning - kept for potential future use
  void isSimpleMode

  // Phase 3: Settings gear opens Infrastructure Drawer
  // Replaces SupabaseDatabaseButton with single unified entry point
  // See: WORKSPACE_SIMPLIFICATION_PLAN.md Phase 3
  const handleOpenSettings = () => {
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.set('infra', 'open')
    const search = current.toString()
    window.history.pushState(null, '', `${pathname}?${search}`)
    router.push(`${pathname}?${search}`, { scroll: false })
    setIsExpanded(false) // Close mobile menu when opening settings
  }

  const handleLogout = async () => {
    await logout()
    router.refresh() // Re-render server components with unauthenticated state
  }


  const handleBack = () => {
    router.back()

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(10)
    }
  }

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded)

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(10)
    }
  }

  return (
    <header className="bg-gray-800 border-b border-gray-700 relative z-50" style={{
      // MODERN 2024 SOLUTION: Ensure header has background color (common oversight)
      backgroundColor: 'rgb(31, 41, 55)', // gray-800 fallback for any transparency issues
    }}>
      {/* Main Header Bar */}
      <div className="px-4 py-3 flex items-center justify-between h-14">
        {/* Left Section */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="text-gray-400 hover:text-white hover:bg-gray-700 p-2 shrink-0"
            aria-label="Go back"
          >
            <Icon name="arrow-left" className="w-4 h-4"  />
          </Button>

          <div className="flex items-center gap-2 min-w-0">
            <img
              src="https://www.sheenapps.com/sheenapps-logo-trans--min.png"
              alt="SheenApps"
              className="h-5 flex-shrink-0"
            />
            <h1 className="text-sm font-semibold truncate text-white">
              {projectName}
            </h1>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Settings - Opens Infrastructure Drawer (Phase 3: replaces integration dots) */}
          {projectId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenSettings}
              className="text-gray-400 hover:text-white hover:bg-gray-700 p-2"
              aria-label={t('openSettings') ?? 'Open project settings'}
              data-testid="mobile-settings-button"
            >
              <Icon name="settings" className="w-4 h-4" />
            </Button>
          )}

          {/* Phase 4: Publish CTA - Primary action button */}
          {/* See: WORKSPACE_SIMPLIFICATION_PLAN.md Phase 4 */}
          {projectId && (
            <PublishButton projectId={projectId} variant="mobile" />
          )}

          {/* Version Status - Compact mobile variant (for version history access) */}
          {projectId && (
            <VersionStatusBadge projectId={projectId} variant="mobile" />
          )}

          {/* Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleExpanded}
            className={cn(
              "text-gray-400 hover:text-white hover:bg-gray-700 p-2 transition-transform duration-200",
              isExpanded && "rotate-90"
            )}
            aria-label="Menu"
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <Icon name="x" className="w-4 h-4"  />
            ) : (
              <Icon name="menu" className="w-4 h-4"  />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Actions Panel */}
      <AnimatePresence>
        {isExpanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1]
            }}
            className="border-t border-gray-700 overflow-hidden bg-gray-800"
          >
            <div className="p-4 space-y-4">
              {/* Action Buttons Grid */}
              <m.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="grid grid-cols-2 gap-3"
              >
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onShare()
                      setIsExpanded(false)
                    }}
                    disabled={!shareEnabled}
                    className={cn(
                      "justify-start h-12",
                      !shareEnabled && "opacity-70 cursor-not-allowed border-dashed"
                    )}
                    title={shareEnabled ? translations.share : t('comingSoon')}
                  >
                    <Icon name="share-2" className="w-4 h-4 mr-3"  />
                    <span className="flex-1 text-left">
                      {translations.share}
                      {!shareEnabled && (
                        <span className="text-xs text-gray-500 block">{t('comingSoon')}</span>
                      )}
                    </span>
                  </Button>
                </div>

                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onExport()
                      setIsExpanded(false)
                    }}
                    disabled={!exportEnabled}
                    className={cn(
                      "justify-start h-12",
                      !exportEnabled && "opacity-70 cursor-not-allowed border-dashed"
                    )}
                    title={exportEnabled ? translations.export : t('comingSoon')}
                  >
                    <Icon name="download" className="w-4 h-4 mr-3"  />
                    <span className="flex-1 text-left">
                      {translations.export}
                      {!exportEnabled && (
                        <span className="text-xs text-gray-500 block">{t('comingSoon')}</span>
                      )}
                    </span>
                  </Button>
                </div>
              </m.div>

              {/* User Section */}
              {user && (
                <m.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="pt-3 border-t border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <UserMenu
                      user={user}
                      onLogout={() => {
                        handleLogout()
                        setIsExpanded(false)
                      }}
                      variant="mobile"
                      showPlan={true}
                      className="flex-1"
                    />

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleOpenSettings}
                        className="text-gray-400 hover:text-white hover:bg-gray-700 p-2 ml-2"
                        aria-label={t('openSettings') ?? 'Open project settings'}
                      >
                        <Icon name="settings" className="w-4 h-4" />
                      </Button>
                  </div>

                  {/* Plan upgrade CTA for free users */}
                  {user.plan === 'free' && (
                    <m.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                      className="mt-3 p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-white">
                            {t('unlockPremium')}
                          </div>
                          <div className="text-xs text-gray-400">
                            {t('premiumDescription')}
                          </div>
                        </div>
                        <Button size="sm" className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white">
                          {t('upgrade')}
                        </Button>
                      </div>
                    </m.div>
                  )}
                </m.div>
              )}

              {/* Guest user prompt */}
              {!user && (
                <m.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="pt-3 border-t border-gray-700"
                >
                  <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-white">
                        {t('signInToSave')}
                      </div>
                      <div className="text-xs text-gray-400">
                        {t('signInDescription')}
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      {t('signIn')}
                    </Button>
                  </div>
                </m.div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>

    </header>
  )
}
