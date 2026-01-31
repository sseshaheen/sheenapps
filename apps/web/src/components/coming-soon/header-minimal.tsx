'use client'

/**
 * Minimal Header Component
 * Header without navigation links for coming soon / preview mode
 */

import { m } from '@/components/ui/motion-provider'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import Image from 'next/image'
import { useEffect, useState } from 'react'

interface HeaderMinimalProps {
  locale: string
}

export function HeaderMinimal({ locale }: HeaderMinimalProps) {
  const [scrolled, setScrolled] = useState(false)
  const isRTL = locale.startsWith('ar')

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-black backdrop-blur-xl border-b border-white/10'
          : 'bg-black/90 backdrop-blur-lg'
      }`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <m.div
            whileHover={{ opacity: 0.9 }}
            className="flex items-center gap-2"
          >
            <Image
              src="https://www.sheenapps.com/sheenapps-logo-trans--min.png"
              alt="SheenApps"
              width={140}
              height={32}
              className="h-8 w-auto"
              priority
            />
          </m.div>

          {/* Right side - just language switcher */}
          <div className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
          </div>
        </div>
      </div>
    </header>
  )
}
