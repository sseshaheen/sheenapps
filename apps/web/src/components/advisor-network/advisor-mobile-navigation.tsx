'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { usePathname, useRouter } from '@/i18n/routing'

export type AdvisorMobilePanel = 'dashboard' | 'profile' | 'consultations' | 'availability' | 'earnings' | 'analytics' | 'settings'

interface AdvisorMobileNavigationProps {
  translations: {
    navigation: {
      dashboard: string
      profile: string
      consultations: string
      availability: string
      earnings: string
      analytics: string
      settings: string
      more: string
    }
    common: {
      close: string
    }
  }
  locale: string
}

const primaryNavigationItems = [
  { key: 'dashboard' as const, href: '/advisor/dashboard', icon: 'activity' },
  { key: 'consultations' as const, href: '/advisor/dashboard/consultations', icon: 'calendar' },
  { key: 'availability' as const, href: '/advisor/dashboard/availability', icon: 'clock' },
  { key: 'earnings' as const, href: '/advisor/dashboard/earnings', icon: 'dollar-sign' }
] as const

const secondaryNavigationItems = [
  { key: 'profile' as const, href: '/advisor/dashboard/profile', icon: 'user' },
  { key: 'analytics' as const, href: '/advisor/dashboard/analytics', icon: 'bar-chart-3' },
  { key: 'settings' as const, href: '/advisor/dashboard/settings', icon: 'settings' }
] as const

export function AdvisorMobileNavigation({ translations, locale }: AdvisorMobileNavigationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)

  // Check if current path matches any secondary navigation item
  const isSecondaryItemActive = secondaryNavigationItems.some(item => 
    pathname === item.href || pathname.startsWith(item.href + '/')
  )

  const handleMoreClick = () => {
    setIsMoreMenuOpen(true)
  }

  const handleSecondaryItemClick = (item: typeof secondaryNavigationItems[number]) => {
    router.push(item.href)
    setIsMoreMenuOpen(false)
  }

  const handleCloseMoreMenu = () => {
    setIsMoreMenuOpen(false)
  }

  return (
    <>
      {/* Main Bottom Navigation */}
      <div 
        className="fixed bottom-0 inset-x-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          height: 'calc(60px + env(safe-area-inset-bottom))'
        }}
      >
        <nav className="flex items-center justify-around h-15 px-1 rtl:flex-row-reverse">
          {/* Primary Navigation Items */}
          {primaryNavigationItems.map((item) => {
            const isActive = pathname === item.href || 
                            (item.key === 'dashboard' && pathname === '/advisor/dashboard')
            const label = translations.navigation[item.key]
            
            return (
              <button
                key={item.key}
                onClick={() => router.push(item.href)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-colors min-w-0 flex-1",
                  "min-h-11 text-xs font-medium", // 44px touch target (11 * 4 = 44px)
                  isActive 
                    ? "text-primary bg-primary/10" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                aria-label={label}
              >
                <Icon 
                  name={item.icon as any} 
                  className={cn(
                    "h-5 w-5 flex-shrink-0",
                    isActive ? "text-primary" : "text-current"
                  )} 
                />
                <span className="truncate text-[10px] leading-tight">
                  {label}
                </span>
              </button>
            )
          })}
          
          {/* More Button */}
          <button
            onClick={handleMoreClick}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-colors min-w-0 flex-1",
              "min-h-11 text-xs font-medium", // 44px touch target
              isSecondaryItemActive 
                ? "text-primary bg-primary/10" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            aria-label={translations.navigation.more}
            aria-expanded={isMoreMenuOpen}
            aria-haspopup="menu"
          >
            <Icon 
              name="menu" 
              className={cn(
                "h-5 w-5 flex-shrink-0",
                isSecondaryItemActive ? "text-primary" : "text-current"
              )} 
            />
            <span className="truncate text-[10px] leading-tight">
              {translations.navigation.more}
            </span>
          </button>
        </nav>
      </div>

      {/* More Menu Modal */}
      {isMoreMenuOpen && (
        <div 
          className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm"
          onClick={handleCloseMoreMenu}
        >
          <div 
            className="fixed bottom-0 inset-x-0 bg-background border-t border-border rounded-t-xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold">{translations.navigation.more}</h2>
              <button
                onClick={handleCloseMoreMenu}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label={translations.common.close}
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            
            {/* Secondary Navigation Items */}
            <div className="p-4 space-y-2">
              {secondaryNavigationItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                const label = translations.navigation[item.key]
                
                return (
                  <button
                    key={item.key}
                    onClick={() => handleSecondaryItemClick(item)}
                    className={cn(
                      "w-full flex items-center gap-4 p-3 rounded-lg transition-colors text-start",
                      "min-h-11", // 44px touch target
                      isActive 
                        ? "text-primary bg-primary/10" 
                        : "text-foreground hover:bg-muted"
                    )}
                    aria-label={label}
                  >
                    <Icon 
                      name={item.icon as any} 
                      className={cn(
                        "h-6 w-6 flex-shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )} 
                    />
                    <span className="text-base font-medium">{label}</span>
                  </button>
                )
              })}
            </div>
            
            {/* Safe area spacing */}
            <div style={{ height: 'env(safe-area-inset-bottom)' }} />
          </div>
        </div>
      )}
    </>
  )
}