'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { useAuthStore } from '@/store'
import { useTranslations } from 'next-intl'

export default function SignInButton() {
  const openLoginModal = useAuthStore(s => s.openLoginModal)
  const t = useTranslations('auth.login')
  
  return (
    <>
      {/* Desktop Sign In */}
      <div className="hidden md:flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={openLoginModal}
          className="text-gray-300 hover:text-white hover:bg-white/10 border-0 text-xs lg:text-sm px-2 lg:px-4"
        >
          <Icon name="user" className="w-3 h-3 lg:w-4 lg:h-4 mr-1 lg:mr-2" />
          <span className="hidden lg:inline">{t('signInButton')}</span>
          <span className="lg:hidden">{t('signInButton')}</span>
        </Button>
      </div>
      
      {/* Mobile Sign In */}
      <div className="md:hidden">
        <Button
          variant="ghost"
          onClick={openLoginModal}
          className="w-full text-gray-300 hover:text-white hover:bg-white/10 border-0 justify-start mb-2"
        >
          <Icon name="user" className="w-4 h-4 mr-2" />
          {t('signInButton')}
        </Button>
      </div>
    </>
  )
}