'use client'

import { m } from '@/components/ui/motion-provider'
import { Viewport } from '@/hooks/use-responsive'
import { useMobileScrollLock } from '@/hooks/use-mobile-scroll-lock'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { MobileTabBar } from './mobile-tab-bar'
import { MobileWorkspaceLoading } from './mobile-workspace-loading'

export type MobilePanel = 'build' | 'preview' | 'code' | 'chat' | 'settings'

interface MobileNavigationState {
  activePanel: MobilePanel
  panelHistory: MobilePanel[]
  swipeEnabled: boolean
  enabledPanels: MobilePanel[] // Panels that are allowed (not disabled)
}

interface MobileNavigationContextType extends MobileNavigationState {
  setActivePanel: (panel: MobilePanel) => void
  goBack: () => void
  canGoBack: boolean
  setSwipeEnabled: (enabled: boolean) => void
  setEnabledPanels: (panels: MobilePanel[]) => void
}

const MobileNavigationContext = createContext<MobileNavigationContextType | null>(null)

export const useMobileNavigation = () => {
  const context = useContext(MobileNavigationContext)
  if (!context) {
    throw new Error('useMobileNavigation must be used within MobileWorkspaceLayout')
  }
  return context
}

interface MobileWorkspaceContentProps {
  chat: React.ReactNode
  preview: React.ReactNode
  code?: React.ReactNode
}

interface MobileWorkspaceLayoutProps {
  children: React.ReactNode | MobileWorkspaceContentProps
  viewport: Viewport
  isPortrait: boolean
  isLoading?: boolean
  header?: React.ReactNode
}

/**
 * Mobile-optimized workspace layout with single-panel navigation
 * and bottom tab bar. Supports swipe gestures between panels.
 */
export function MobileWorkspaceLayout({
  children,
  viewport,
  isPortrait,
  isLoading = false,
  header
}: MobileWorkspaceLayoutProps) {
  const t = useTranslations('workspace.mobile')
  // Default enabled panels (all panels enabled initially, MobileTabBar will update)
  const allPanels: MobilePanel[] = ['build', 'preview', 'code', 'chat', 'settings']

  const [navigationState, setNavigationState] = useState<MobileNavigationState>({
    activePanel: 'build',
    panelHistory: ['build'],
    swipeEnabled: true,
    enabledPanels: allPanels
  })

  const showPanel = useCallback((panelId: MobilePanel) => {
    setNavigationState(prev => {
      // Guard: don't allow navigation to disabled panels
      if (!prev.enabledPanels.includes(panelId)) {
        return prev
      }
      const filtered = prev.panelHistory.filter(id => id !== panelId)
      return {
        ...prev,
        activePanel: panelId,
        panelHistory: [...filtered, panelId]
      }
    })
  }, [])

  const setEnabledPanels = useCallback((panels: MobilePanel[]) => {
    setNavigationState(prev => ({
      ...prev,
      enabledPanels: panels
    }))
  }, [])

  const goBack = useCallback(() => {
    setNavigationState(prev => {
      if (prev.panelHistory.length > 1) {
        const newHistory = [...prev.panelHistory]
        newHistory.pop()
        // Find last enabled panel in history (guard against disabled panels)
        let previousPanel = newHistory[newHistory.length - 1]
        while (newHistory.length > 0 && !prev.enabledPanels.includes(previousPanel)) {
          newHistory.pop()
          previousPanel = newHistory[newHistory.length - 1] ?? prev.enabledPanels[0] ?? 'build'
        }
        // Fallback to first enabled panel if none found in history
        if (!prev.enabledPanels.includes(previousPanel)) {
          previousPanel = prev.enabledPanels[0] ?? 'build'
        }
        return {
          ...prev,
          activePanel: previousPanel,
          panelHistory: newHistory.length > 0 ? newHistory : [previousPanel]
        }
      }
      return prev
    })
  }, [])

  const setSwipeEnabled = useCallback((enabled: boolean) => {
    setNavigationState(prev => ({
      ...prev,
      swipeEnabled: enabled
    }))
  }, [])

  // Normalize activePanel when enabledPanels changes (e.g., user logs out, plan changes)
  useEffect(() => {
    setNavigationState(prev => {
      if (prev.enabledPanels.includes(prev.activePanel)) {
        return prev // Already valid
      }
      // Navigate to first enabled panel
      const nextPanel = prev.enabledPanels[0] ?? 'build'
      return {
        ...prev,
        activePanel: nextPanel,
        panelHistory: [nextPanel]
      }
    })
  }, [navigationState.enabledPanels])

  // Lock background scroll when build panel (chat) is active
  useMobileScrollLock(navigationState.activePanel === 'build')

  // EXPERT SOLUTION: measure actual header height (includes safe-area)
  const rootRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const hdr = headerRef.current
    if (!root || !hdr) return

    const update = () => {
      const h = Math.round(hdr.getBoundingClientRect().height)
      root.style.setProperty('--header-height', `${h}px`)
    }

    const ro = new ResizeObserver(update)
    ro.observe(hdr)
    update() // Initial measurement

    return () => ro.disconnect()
  }, [])

  const navigationContext: MobileNavigationContextType = {
    ...navigationState,
    setActivePanel: showPanel,
    goBack,
    canGoBack: navigationState.panelHistory.length > 1,
    setSwipeEnabled,
    setEnabledPanels
  }

  // Show loading skeleton during initial load
  if (isLoading) {
    return <MobileWorkspaceLoading isInitialLoad />
  }

  return (
    <MobileNavigationContext.Provider value={navigationContext}>
      <div
        ref={rootRef}
        className={cn(
          "mobile-workspace flex flex-col bg-gray-900 text-white overflow-hidden",
          viewport === 'mobile' && "mobile-sm",
          isPortrait && "portrait-mode"
        )}
        style={{
          // MODERN 2024 SOLUTION: Use 100dvh (dynamic viewport height)
          height: '100dvh',
          // CSS custom property for header height (measured by ResizeObserver)
          '--header-height': '56px', // Default, updated by ResizeObserver
        } as React.CSSProperties}
      >
        {/* Header: let it size itself naturally (EXPERT ADVICE) */}
        {header && (
          <div ref={headerRef} className="flex-shrink-0">
            {header}
          </div>
        )}

        {/* Main content: flex-1 fills remaining space after header (no extra padding needed) */}
        <div className="main-content flex-1 min-h-0 relative overflow-hidden">
          <MobilePanelContainer>
            <MobilePanelContent>
              {children}
            </MobilePanelContent>
          </MobilePanelContainer>
        </div>

        {/* Bottom tabs: natural height with safe area */}
        <div className="flex-shrink-0" style={{
          // MODERN 2024: Safe area support for devices with home indicators
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}>
          <MobileTabBar translations={{
            mobile: {
              tabs: {
                build: t('tabs.build'),
                preview: t('tabs.preview'),
                code: t('tabs.code'),
                humanHelp: t('tabs.humanHelp'),
                more: t('tabs.more')
              },
              disabled: {
                signInRequired: t('disabled.signInRequired'),
                upgradeRequired: t('disabled.upgradeRequired')
              }
            }
          }} />
        </div>
      </div>
    </MobileNavigationContext.Provider>
  )
}

/**
 * Mobile panel container with swipe support and smooth transitions
 */
function MobilePanelContainer({ children }: { children: React.ReactNode }) {
  const { activePanel, setActivePanel, swipeEnabled, enabledPanels } = useMobileNavigation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [startX, setStartX] = useState(0)
  const [startY, setStartY] = useState(0)
  const [currentX, setCurrentX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [swipeDirection, setSwipeDirection] = useState<'horizontal' | 'vertical' | null>(null)

  // Use enabled panels for swipe navigation (respects disabled tabs)
  const currentIndex = enabledPanels.indexOf(activePanel)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!swipeEnabled) return
    setStartX(e.touches[0].clientX)
    setStartY(e.touches[0].clientY)
    setCurrentX(e.touches[0].clientX)
    setSwipeDirection(null)
    // Don't set isDragging immediately - wait to determine direction
  }, [swipeEnabled])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!swipeEnabled) return

    const deltaX = Math.abs(e.touches[0].clientX - startX)
    const deltaY = Math.abs(e.touches[0].clientY - startY)
    const minSwipeDistance = 10 // Minimum distance to determine direction

    // Determine swipe direction only after sufficient movement
    if (!swipeDirection && (deltaX > minSwipeDistance || deltaY > minSwipeDistance)) {
      if (deltaX > deltaY) {
        setSwipeDirection('horizontal')
        setIsDragging(true)
      } else {
        setSwipeDirection('vertical')
        // Allow normal scrolling for vertical gestures
        return
      }
    }

    // Only handle horizontal swipes
    if (swipeDirection === 'horizontal' && isDragging) {
      setCurrentX(e.touches[0].clientX)
      // Prevent default to stop scrolling when we're confident it's horizontal
      e.preventDefault()
    }
  }, [swipeEnabled, startX, startY, swipeDirection, isDragging])

  const handleTouchEnd = useCallback(() => {
    if (!isDragging || !swipeEnabled || swipeDirection !== 'horizontal') {
      // Reset state and allow normal behavior
      setIsDragging(false)
      setSwipeDirection(null)
      setStartX(0)
      setStartY(0)
      setCurrentX(0)
      return
    }

    const diff = startX - currentX
    const threshold = 80 // Increased threshold for intentional swipes
    const velocity = Math.abs(diff) / 300

    // Only trigger panel switch for clear horizontal swipes
    // Use enabledPanels to ensure we only swipe to allowed panels
    if (Math.abs(diff) > threshold || velocity > 0.8) {
      if (diff > 0 && currentIndex < enabledPanels.length - 1) {
        // Swipe left - next enabled panel
        setActivePanel(enabledPanels[currentIndex + 1])
      } else if (diff < 0 && currentIndex > 0) {
        // Swipe right - previous enabled panel
        setActivePanel(enabledPanels[currentIndex - 1])
      }
    }

    // Reset state
    setIsDragging(false)
    setSwipeDirection(null)
    setStartX(0)
    setStartY(0)
    setCurrentX(0)
  }, [isDragging, swipeEnabled, swipeDirection, startX, currentX, currentIndex, setActivePanel, enabledPanels])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('touchstart', handleTouchStart, { passive: false })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  const translateX = (isDragging && swipeDirection === 'horizontal') ? currentX - startX : 0

  return (
    <div
      ref={containerRef}
      className="relative h-full"
      style={{
        transform: `translateX(${translateX}px)`,
        transition: (isDragging && swipeDirection === 'horizontal') ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      {children}
    </div>
  )
}

/**
 * Individual mobile panel wrapper
 */
interface MobilePanelProps {
  id: MobilePanel
  children: React.ReactNode
  className?: string
}

export function MobilePanel({ id, children, className }: MobilePanelProps) {
  const { activePanel } = useMobileNavigation()
  const isActive = activePanel === id

  return (
    <m.div
      key={id}
      initial={{ opacity: 0, x: 20 }}
      animate={{
        opacity: isActive ? 1 : 0,
        x: isActive ? 0 : 20
      }}
      transition={{
        duration: 0.2,
        ease: [0.4, 0, 0.2, 1]
      }}
      className={cn(
        "absolute inset-0 bg-gray-900 overflow-hidden flex flex-col",
        isActive ? 'pointer-events-auto z-10' : 'pointer-events-none z-0',
        className
      )}
      style={{
        visibility: isActive ? 'visible' : 'hidden'
      }}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </m.div>
  )
}

/**
 * Mobile panel content switcher that properly handles different panels
 */
function MobilePanelContent({ children }: { children: React.ReactNode | MobileWorkspaceContentProps }) {
  const { activePanel } = useMobileNavigation()
  const t = useTranslations('workspace.mobile.panels')

  // Check if children is the new structured format
  const isStructuredContent = children && typeof children === 'object' &&
    'chat' in children && 'preview' in children

  const content = isStructuredContent
    ? children as MobileWorkspaceContentProps
    : { chat: children as React.ReactNode, preview: null as React.ReactNode, code: null as React.ReactNode }

  return (
    // EXPERT FIX: fill parent; no inline height calc
    <div className="h-full">
      {activePanel === 'build'   && <div className="h-full">{content.chat}</div>}
      {activePanel === 'code' && <div className="h-full">{content.code ?? (
        <div className="h-full flex items-center justify-center p-4 bg-background">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </div>
            <h3 className="text-white font-medium mb-2">{t('codeTitle')}</h3>
            <p className="text-gray-400 text-sm">{t('codeDescription')}</p>
          </div>
        </div>
      )}</div>}
      {activePanel === 'preview' && <div className="h-full">{content.preview ?? (
        <div className="h-full flex items-center justify-center p-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
              </svg>
            </div>
            <h3 className="text-white font-medium mb-2">{t('previewTitle')}</h3>
            <p className="text-gray-400 text-sm">{t('previewDescription')}</p>
          </div>
        </div>
      )}</div>}

      {/* Chat Panel (premium feature) */}
      {activePanel === 'chat' && (
        <div className="h-full flex items-center justify-center p-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-white font-medium mb-2">{t('aiHelpTitle')}</h3>
            <p className="text-gray-400 text-sm">{t('aiHelpDescription')}</p>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {activePanel === 'settings' && (
        <div className="h-full flex items-center justify-center p-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-white font-medium mb-2">{t('settingsTitle')}</h3>
            <p className="text-gray-400 text-sm">{t('settingsDescription')}</p>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Desktop workspace layout (placeholder for backward compatibility)
 * EXPERT FIX: Use flex-1 min-h-0 instead of h-screen to avoid header conflicts
 */
export function DesktopWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-900 text-white">
      {children}
    </div>
  )
}
