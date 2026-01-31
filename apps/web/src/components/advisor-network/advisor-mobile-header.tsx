'use client'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useRouter } from '@/i18n/routing'
import type { AdvisorProfile } from '@/services/advisor-api'

interface AdvisorMobileHeaderProps {
  advisor: AdvisorProfile | null
  translations: {
    layout: {
      backToDashboard: string
      viewPublicProfile: string
      available: string
      unavailable: string
    }
  }
  locale: string
  pageTitle?: string
}

export function AdvisorMobileHeader({ 
  advisor, 
  translations, 
  locale, 
  pageTitle 
}: AdvisorMobileHeaderProps) {
  const router = useRouter()

  // Get advisor's avatar fallback
  const avatarFallback = advisor?.display_name
    .split(' ')
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AD'

  return (
    <div 
      className="fixed top-0 inset-x-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        height: 'calc(56px + env(safe-area-inset-top))'
      }}
    >
      <div className="flex items-center justify-between h-14 px-4">
        {/* Start: Back button */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button 
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors p-1 -m-1"
          >
            <Icon name="arrow-left" className="h-4 w-4 ltr:block rtl:hidden" />
            <Icon name="arrow-right" className="h-4 w-4 rtl:block ltr:hidden" />
            <span className="text-sm hidden xs:inline">{translations.layout.backToDashboard}</span>
          </button>
        </div>

        {/* Center: Page title or advisor info */}
        <div className="flex items-center gap-3 min-w-0 flex-1 justify-center">
          {pageTitle ? (
            <h1 className="font-semibold text-sm truncate">{pageTitle}</h1>
          ) : advisor ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={advisor.avatar_url} alt={advisor.display_name} />
                <AvatarFallback className="text-xs">{avatarFallback}</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <div className="font-medium text-sm truncate max-w-24">{advisor.display_name}</div>
              </div>
            </div>
          ) : null}
        </div>

        {/* End: Status and actions */}
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
          {advisor && (
            <>
              {/* Status indicator */}
              <div className="flex items-center gap-1">
                <div className={`h-2 w-2 rounded-full ${
                  advisor.is_accepting_bookings ? 'bg-green-500' : 'bg-gray-400'
                }`} />
                <span className="text-xs text-muted-foreground hidden xs:inline">
                  {advisor.is_accepting_bookings ? translations.layout.available : translations.layout.unavailable}
                </span>
              </div>

              {/* Public profile link - only if approved */}
              {advisor.approval_status === 'approved' && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-8 w-8 p-0"
                >
                  <a 
                    href={`/${locale}/advisors/${advisor.user_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="external-link" className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}