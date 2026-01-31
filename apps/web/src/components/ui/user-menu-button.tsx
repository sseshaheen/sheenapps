'use client'

import React, { useMemo } from 'react'
import { useRouter, Link } from '@/i18n/routing'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/ui/user-menu'
import Icon from '@/components/ui/icon'
import { useAuthStore } from '@/store'
import { getInitialsAvatar } from '@/lib/user-utils'
import { ROUTES } from '@/i18n/routes'
import { useTranslations } from 'next-intl'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import type { User } from '@/types/auth'

interface UserMenuButtonProps {
  user: Pick<User, 'id' | 'email' | 'name' | 'avatar' | 'plan'>
  locale: string
}

export default function UserMenuButton({ user, locale }: UserMenuButtonProps) {
  const router = useRouter()
  const logout = useAuthStore(s => s.logout)
  const t = useTranslations('navigation')
  const tUser = useTranslations('userMenu')
  const tCommon = useTranslations('common')
  
  const handleLogout = async () => {
    await logout()
    router.refresh() // Re-render server component with unauthenticated state
  }
  
  // ✅ EXPERT FIX: Memoize translations object to prevent infinite re-renders
  const translations = useMemo(() => ({
    profile: tUser('profile'),
    settings: tUser('settings'),
    billing: tUser('billing'),
    upgrade: tUser('upgrade'),
    logout: tUser('logout'),
    clickToLogout: tUser('clickToLogout'),
    plan: tUser('plan'),
    planCapitalized: tUser('planCapitalized'),
    comingSoon: tCommon('comingSoon')
  }), [tUser, tCommon])
  
  return (
    <>
      {/* Desktop User Menu */}
      <div className="hidden md:flex items-center gap-2 lg:gap-3">
        <Link href={ROUTES.DASHBOARD}>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-300 hover:text-white hover:bg-white/10 border-0 text-xs lg:text-sm px-2 lg:px-4"
          >
            <Icon name="layout-grid" className="w-3 h-3 lg:w-4 lg:h-4 mr-1 lg:mr-2" />
            <span className="hidden lg:inline">{t('dashboard') || 'Dashboard'}</span>
            <span className="lg:hidden">{t('dashboard') || 'Dashboard'}</span>
          </Button>
        </Link>
        {FEATURE_FLAGS.ENABLE_MIGRATION_SYSTEM && (
          <Link href="/migrate">
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-300 hover:text-white hover:bg-white/10 border-0 text-xs lg:text-sm px-2 lg:px-4"
            >
              <Icon name="globe" className="w-3 h-3 lg:w-4 lg:h-4 mr-1 lg:mr-2" />
              <span className="hidden lg:inline">{t('migrate') || 'Migration'}</span>
              <span className="lg:hidden">{t('migrate') || 'Migration'}</span>
            </Button>
          </Link>
        )}
        <Link href={ROUTES.BUILDER_NEW}>
          <button className="inline-flex items-center justify-center gap-1 lg:gap-2 rounded-md h-8 px-2 lg:px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium text-xs lg:text-sm">
            <Icon name="sparkles" className="w-3 h-3 lg:w-4 lg:h-4" />
            <span className="hidden xl:inline">{t('startBuilding')}</span>
            <span className="xl:hidden">{t('build')}</span>
          </button>
        </Link>
        <UserMenu 
          user={user} 
          onLogout={handleLogout} 
          variant="header"
          showPlan={false}
          translations={translations}
        />
      </div>
      
      {/* Mobile User Menu */}
      <div className="md:hidden">
        <div className="flex items-center gap-3 mb-4 px-2">
          <img 
            src={user.avatar || getInitialsAvatar(user.name || user.email || 'User', user.email || '')} 
            alt={user.name || 'User'}
            className="w-8 h-8 rounded-full"
          />
          <div>
            <div className="text-sm font-medium text-white">{user.name || user.email || 'User'}</div>
            <div className="text-xs text-gray-400 capitalize">{user.plan || 'free'} {tUser('plan')}</div>
          </div>
        </div>
        <Link href={ROUTES.BUILDER_NEW} className="w-full">
          <button className="w-full inline-flex items-center justify-start gap-2 rounded-md h-10 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium mb-2">
            <Icon name="sparkles" className="w-4 h-4" />
{t('startBuilding')}
          </button>
        </Link>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full text-red-400 hover:text-red-300 hover:bg-white/10 border-0 justify-start"
        >
          <Icon name="user" className="w-4 h-4 mr-2" />
{t('logout') || 'Logout'}
        </Button>
      </div>
    </>
  )
}