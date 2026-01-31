'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { UserMenu } from '@/components/ui/user-menu'
import { ROUTES } from '@/i18n/routes'
import { Link, useRouter } from '@/i18n/routing'
import { useAuthStore } from '@/store'
import { useTranslations } from 'next-intl'

interface RunHeaderProps {
  projectId: string
  projectName: string
}

export function RunHeader({ projectId, projectName }: RunHeaderProps) {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const t = useTranslations('run.header')

  const handleLogout = async () => {
    await logout()
    router.refresh()
  }

  const handleOpenBuilder = () => {
    router.push(`/builder/workspace/${projectId}`)
  }

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between w-full bg-background border-b px-4 md:px-6 h-14">
      {/* LEFT - Logo + Project Name + Mode Indicator */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href={ROUTES.DASHBOARD}
          className="shrink-0 hover:opacity-80 transition-opacity"
          title={t('backToDashboard')}
        >
          <img
            src="https://www.sheenapps.com/sheenapps-logo-trans--min.png"
            alt="SheenApps"
            className="h-6 shrink-0"
          />
        </Link>

        <span className="text-muted-foreground shrink-0">/</span>

        <h1 className="text-lg font-semibold truncate min-w-0">{projectName}</h1>

        {/* Mode Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {t('runMode')}
          </span>
        </div>
      </div>

      {/* RIGHT - Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Edit / Go to Builder */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenBuilder}
          className="inline-flex items-center gap-2 min-h-[44px] sm:min-h-[32px]"
          title={t('editProject')}
        >
          <Icon name="pencil" className="w-4 h-4" />
          <span className="hidden sm:inline">{t('edit')}</span>
        </Button>

        {/* User Menu */}
        {user && (
          <div className="ms-2 ps-2 border-s">
            <UserMenu user={user} onLogout={handleLogout} variant="compact" showPlan />
          </div>
        )}
      </div>
    </header>
  )
}
