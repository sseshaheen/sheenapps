'use client'

import Icon, { IconName } from '@/components/ui/icon'
import { m } from '@/components/ui/motion-provider'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'

import { logger } from '@/utils/logger'
import React from 'react'
import { useMobileNavigation, type MobilePanel } from './mobile-workspace-layout'

interface MobileTab {
  id: MobilePanel
  icon: IconName
  label: string
  badge?: number
  disabled?: boolean
  disabledReason?: string
}

interface MobileTabBarProps {
  translations: {
    mobile: {
      tabs: {
        build: string
        preview: string
        code: string
        humanHelp: string
        more: string
      }
      disabled: {
        signInRequired: string
        upgradeRequired: string
      }
    }
  }
}

/**
 * Bottom tab navigation for mobile workspace
 * Provides primary navigation between main builder sections
 */
export function MobileTabBar({ translations }: MobileTabBarProps) {
  const { activePanel, setActivePanel, setEnabledPanels } = useMobileNavigation()
  const { user } = useAuthStore()

  // Determine chat availability based on user plan
  const canUseChat = user?.plan === 'growth' || user?.plan === 'scale'
  const chatDisabledReason = !user
    ? translations.mobile.disabled.signInRequired
    : user.plan === 'free'
      ? translations.mobile.disabled.upgradeRequired
      : undefined

  // Memoize tabs to prevent re-render loops (tabs -> enabledTabs -> enabledPanelIds -> setEnabledPanels -> re-render)
  const tabs: MobileTab[] = React.useMemo(() => [
    {
      id: 'build',
      icon: 'target',
      label: translations.mobile.tabs.build,
    },
    {
      id: 'preview',
      icon: 'eye',
      label: translations.mobile.tabs.preview
    },
    {
      id: 'code',
      icon: 'code',
      label: translations.mobile.tabs.code
    },
    {
      id: 'chat',
      icon: 'message-circle',
      label: translations.mobile.tabs.humanHelp,
      disabled: !canUseChat,
      disabledReason: chatDisabledReason
    },
    {
      id: 'settings',
      icon: 'settings',
      label: translations.mobile.tabs.more
    }
  ], [translations.mobile.tabs, canUseChat, chatDisabledReason])

  // Enabled tabs = tabs that are not disabled (used for normalization + swipe)
  const enabledTabs = React.useMemo(
    () => tabs.filter(t => !t.disabled),
    [tabs]
  )

  // Sync enabled panels to context (for swipe navigation)
  const enabledPanelIds = React.useMemo(
    () => enabledTabs.map(t => t.id),
    [enabledTabs]
  )

  React.useEffect(() => {
    setEnabledPanels(enabledPanelIds)
  }, [enabledPanelIds, setEnabledPanels])

  // Compute raw index first (can be -1 if activePanel is disabled)
  const rawIndex = enabledTabs.findIndex(t => t.id === activePanel)
  const selectedIndex = Math.max(0, rawIndex)

  // Normalize activePanel when it's on a disabled tab (e.g., via swipe or deep link)
  React.useEffect(() => {
    if (rawIndex === -1 && enabledTabs[0]) {
      logger.info('🔧 Normalizing activePanel to first enabled tab:', enabledTabs[0].id)
      setActivePanel(enabledTabs[0].id)
    }
  }, [rawIndex, enabledTabs, setActivePanel])

  // EXPERT FIX: SSR/hydration guard - render indicator after mount to avoid jump
  const [isMounted, setIsMounted] = React.useState(false)
  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  // EXPERT FIX: Hide indicator if selectedIndex is -1 (invalid state)
  const shouldShowIndicator = isMounted && selectedIndex !== -1


  // EXPERT FIX: handleTabPress for enabledTabs only (never receives disabled tabs)
  const handleTabPress = (tab: MobileTab) => {
    // Since we only render enabledTabs, this should never receive disabled tabs
    // But add defensive check with logging to catch any inconsistencies
    if (tab.disabled) {
      logger.error('🚨 CONSISTENCY BUG: Received disabled tab in handleTabPress:', tab.id)
      return
    }

    setActivePanel(tab.id)

    // Haptic feedback on supported devices
    if (navigator.vibrate) {
      navigator.vibrate(10)
    }
  }

  // EXPERT FIX: Handle disabled tab interactions separately
  const handleDisabledTabPress = (tabId: string, reason?: string) => {
    logger.info('🔒 Disabled tab pressed:', tabId, reason)

    if (!user) {
      // Trigger sign in modal
      logger.info('Show sign in modal for:', tabId)
    } else if (user.plan === 'free') {
      // Trigger upgrade modal
      logger.info('Show upgrade modal for:', tabId)
    }
  }

  return (
    <div
      className="mobile-tab-bar relative bg-gray-800 border-t border-gray-700"
      style={{
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        minHeight: 'calc(64px + env(safe-area-inset-bottom))'
      }}
    >
      {/* EXPERT FIX: Layout-driven indicator using layoutId - bulletproof approach */}
      <div
        className="relative flex h-16"
        key={`${enabledTabs.map(t => t.id).join(',')}-${tabs.map(t => t.disabled).join(',')}`} // Force re-evaluation when tab set or disabled state changes
      >
        {tabs.map((tab) => {
          const isActive = activePanel === tab.id && !tab.disabled
          const isVisibleTab = enabledTabs.some(vt => vt.id === tab.id)

          return (
            <button
              key={tab.id}
              onClick={() => tab.disabled ? handleDisabledTabPress(tab.id, tab.disabledReason) : handleTabPress(tab)}
              className={cn(
                "relative flex-1 flex flex-col items-center justify-center gap-1",
                "min-h-[44px] px-2 py-2", // Touch target optimization
                "transition-all duration-200 ease-out",
                "group",
                isActive
                  ? "text-purple-400"
                  : tab.disabled
                    ? "text-gray-600"
                    : "text-gray-400 hover:text-gray-300 active:text-white",
                tab.disabled && "cursor-not-allowed"
              )}
              // Use aria-disabled instead of disabled to allow click events for upgrade/sign-in prompts
              aria-disabled={tab.disabled}
              tabIndex={tab.disabled ? -1 : 0}
              aria-label={tab.disabled ? `${tab.label} - ${tab.disabledReason}` : tab.label}
            >
              {/* EXPERT FIX: layoutId indicator - only shows on enabled active tabs */}
              {activePanel === tab.id && shouldShowIndicator && !tab.disabled && (
                <m.div
                  layoutId="mobileTabIndicator"
                  className="absolute top-0 left-0 right-0 h-0.5 bg-purple-500 pointer-events-none z-10"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 40
                  }}
                />
              )}
              {/* Icon with badge */}
              <div className="relative">
                <m.div
                  initial={false}
                  animate={{
                    scale: isActive ? 1.1 : 1,
                    y: isActive ? -1 : 0
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <Icon name={tab.icon} className="w-5 h-5 transition-colors duration-200" />
                </m.div>

                {/* Badge for question count */}
                {tab.badge && tab.badge > 0 && (
                  <m.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2 bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium"
                  >
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </m.span>
                )}

                {/* Lock icon for disabled features */}
                {tab.disabled && (
                  <div className="absolute -top-1 -right-1 bg-gray-700 rounded-full p-0.5">
                    <Icon name="lock" className="w-2.5 h-2.5 text-gray-500"  />
                  </div>
                )}

                {/* Premium indicator for chat - only show for enabled chat */}
                {tab.id === 'chat' && !tab.disabled && (
                  <div className="absolute -top-1 -right-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full p-0.5">
                    <Icon name="zap" className="w-2.5 h-2.5 text-white"  />
                  </div>
                )}
              </div>

              {/* Label */}
              <m.span
                initial={false}
                animate={{
                  fontSize: isActive ? '0.75rem' : '0.7rem',
                  fontWeight: isActive ? 600 : 500
                }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "text-center leading-tight",
                  tab.disabled && "opacity-50"
                )}
              >
                {tab.label}
              </m.span>

              {/* Active state background */}
              {isActive && (
                <m.div
                  layoutId="activeTabBackground"
                  className="absolute inset-0 bg-gray-700/30 rounded-lg -z-10"
                  initial={false}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 30
                  }}
                />
              )}

              {/* Hover state for non-disabled tabs */}
              {!tab.disabled && !isActive && (
                <div className="absolute inset-0 bg-gray-700/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 -z-10" />
              )}

              {/* Disabled tooltip indicator */}
              {tab.disabled && tab.disabledReason && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-700 text-xs text-white rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-10">
                  {tab.disabledReason}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-2 border-transparent border-t-gray-700" />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Tab badge component for showing counts
 */
interface TabBadgeProps {
  count: number
  max?: number
  className?: string
}

export function TabBadge({ count, max = 99, className }: TabBadgeProps) {
  if (count <= 0) return null

  return (
    <m.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
      className={cn(
        "absolute -top-2 -right-2 bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium",
        className
      )}
    >
      {count > max ? `${max}+` : count}
    </m.span>
  )
}
