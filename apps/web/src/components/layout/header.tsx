'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { m } from '@/components/ui/motion-provider'
import SignInButton from '@/components/ui/sign-in-button'
import UserMenuButton from '@/components/ui/user-menu-button'
import { locales } from '@/i18n/config'
import { ROUTES } from '@/i18n/routes'
import { Link, usePathname } from '@/i18n/routing'
import { useAuthStore } from '@/store'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
interface HeaderProps {
  locale: string
}

export default function Header({ locale }: HeaderProps) {
  const { user, isAuthenticated } = useAuthStore()
  const pathname = usePathname()
  const t = useTranslations('navigation')
  const isRTL = (locale as string).startsWith('ar')

  // Debug: Log user changes in header
  useEffect(() => {
    // eslint-disable-next-line no-restricted-globals
    if (process.env.NODE_ENV === 'development') {
      // console.log('🎯 Header user state changed:', {
      //   email: user?.email,
      //   id: user?.id?.slice(0, 8),
      //   isAuthenticated,
      //   timestamp: new Date().toISOString(),
      //   rawUser: user
      // })
    }
  }, [user, isAuthenticated])

  // Debug: Log on every render (demoted to debug level)
  // eslint-disable-next-line no-restricted-globals
  if (process.env.NODE_ENV === 'development' && process.env.DEBUG_HEADER) {
    console.debug('🎯 Header render:', {
      hasUser: !!user,
      isAuthenticated,
      showingSignIn: !isAuthenticated
    })
  }
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Check if we're on the homepage
  const isHomepage = pathname === '/' || locales.some(loc => pathname === `/${loc}`)

  const navDropdownRef = useRef<HTMLDivElement>(null)
  const moreDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close nav dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navDropdownRef.current && !navDropdownRef.current.contains(event.target as Node)) {
        setIsNavOpen(false)
      }
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false)
      }
    }

    if (isNavOpen || isMoreOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isNavOpen, isMoreOpen])

  return (
    <header
      data-app-header
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-black backdrop-blur-xl border-b border-white/10'
          : 'bg-black/90 backdrop-blur-lg'
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <m.div
            whileHover={{ opacity: 0.9 }}
            className="flex items-center gap-2"
          >
            <Link href="/">
              <Image
                src="https://www.sheenapps.com/sheenapps-logo-trans--min.png"
                alt="SheenApps Logo"
                width={120}
                height={40}
                style={{ height: 'auto' }}
                className="h-5 sm:h-6 md:h-6 lg:h-7 xl:h-8 w-auto max-w-[100px] sm:max-w-[110px] md:max-w-[120px] lg:max-w-[130px] xl:max-w-[140px] object-contain"
                priority
              />
            </Link>
          </m.div>

          {/* Medium Screen Navigation Dropdown - Only show on md screens and homepage */}
          {isHomepage && (
            <div className="hidden md:block lg:hidden relative ms-4" ref={navDropdownRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsNavOpen(!isNavOpen)}
              className="text-gray-300 hover:text-white hover:bg-white/10 border border-gray-700 px-3 py-1.5"
            >
              <Icon name="menu" className="w-4 h-4 me-2" />
              <span className="text-xs">Menu</span>
              <Icon name={isNavOpen ? "x" : "arrow-down"} className="w-3 h-3 ms-1" />
            </Button>

            {/* Dropdown Menu */}
            {isNavOpen && (
              <m.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="absolute top-full mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 start-0">
                {/* Homepage sections - only on homepage */}
                {isHomepage && (
                  <>
                    <a
                      href="#how-it-works"
                      onClick={() => setIsNavOpen(false)}
                      className="block px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors rounded-t-lg"
                    >
                      {t('howItWorks')}
                    </a>
                    <a
                      href="#team"
                      onClick={() => setIsNavOpen(false)}
                      className="block px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                    >
                      {t('yourTeam')}
                    </a>
                    <a
                      href="#features"
                      onClick={() => setIsNavOpen(false)}
                      className="block px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                    >
                      {t('features')}
                    </a>
                    <div className="border-t border-gray-600 my-1"></div>
                  </>
                )}

                {/* Global links */}
                <Link
                  href={ROUTES.PRICING_PAGE}
                  onClick={() => setIsNavOpen(false)}
                  className={`flex items-center px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors ${!isHomepage ? 'rounded-t-lg' : ''}`}
                >
                  <Icon name="credit-card" className="w-4 h-4 me-2" />
                  {t('pricing')}
                </Link>
                <Link
                  href="/blog"
                  onClick={() => setIsNavOpen(false)}
                  className="flex items-center px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors rounded-b-lg"
                >
                  <Icon name="book-open" className="w-4 h-4 me-2" />
                  {t('blog')}
                </Link>
              </m.div>
            )}
          </div>
          )}

          {/* Spacer for medium screens */}
          {isHomepage && <div className="hidden md:flex lg:hidden flex-1"></div>}

          {/* Desktop Navigation - Show homepage sections first, then global links */}
          <nav className="hidden lg:flex items-center gap-4 lg:gap-6 xl:gap-8 lg:ms-10 xl:ms-12">
            {/* Homepage sections - only on homepage */}
            {isHomepage ? (
              <>
                <m.a
                  whileHover={{ opacity: 0.8 }}
                  href="#how-it-works"
                  className="text-gray-300 hover:text-white transition-colors text-xs lg:text-sm whitespace-nowrap"
                >
                  {t('howItWorks')}
                </m.a>
                <m.a
                  whileHover={{ opacity: 0.8 }}
                  href="#team"
                  className="hidden xl:block text-gray-300 hover:text-white transition-colors text-xs lg:text-sm whitespace-nowrap"
                >
                  {t('yourTeam')}
                </m.a>
                <m.a
                  whileHover={{ opacity: 0.8 }}
                  href="#features"
                  className="hidden xl:block text-gray-300 hover:text-white transition-colors text-xs lg:text-sm whitespace-nowrap"
                >
                  {t('features')}
                </m.a>

                {/* More dropdown for lg screens */}
                <div className="hidden lg:block xl:hidden relative" ref={moreDropdownRef}>
                  <button
                    onClick={() => setIsMoreOpen(!isMoreOpen)}
                    className="text-gray-300 hover:text-white transition-colors text-xs lg:text-sm whitespace-nowrap flex items-center gap-1"
                  >
                    {t('more')}
                    <Icon name={isMoreOpen ? "x" : "arrow-down"} className="w-3 h-3" />
                  </button>

                  {isMoreOpen && (
                    <m.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-full mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 end-0"
                    >
                      <a
                        href="#team"
                        onClick={() => setIsMoreOpen(false)}
                        className="block px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors rounded-t-lg"
                      >
                        {t('yourTeam')}
                      </a>
                      <a
                        href="#features"
                        onClick={() => setIsMoreOpen(false)}
                        className="block px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors rounded-b-lg"
                      >
                        {t('features')}
                      </a>
                    </m.div>
                  )}
                </div>

                <div className="hidden xl:block w-px h-4 bg-gray-700"></div>
              </>
            ) : null}

            {/* Global links - always visible, positioned at the end */}
            <m.div className="flex items-center gap-4 lg:gap-6 xl:gap-8">
              <Link
                href={ROUTES.PRICING_PAGE}
                className="text-gray-300 hover:text-white transition-colors text-xs lg:text-sm whitespace-nowrap flex items-center gap-1"
              >
                <Icon name="credit-card" className="w-3 h-3" />
                {t('pricing')}
              </Link>

              <Link
                href="/blog"
                className="text-gray-300 hover:text-white transition-colors text-xs lg:text-sm whitespace-nowrap flex items-center gap-1"
              >
                <Icon name="book-open" className="w-3 h-3" />
                {t('blog')}
              </Link>
            </m.div>
          </nav>

          <div className="hidden md:flex md:items-center md:gap-2 lg:gap-4">
            <LanguageSwitcher variant="header" currentLocale={locale} />
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-300 hover:text-white hover:bg-white/10 border-0 text-xs lg:text-sm px-2 lg:px-4"
              >
                <Icon name="message-circle" className="w-3 h-3 lg:w-4 lg:h-4 me-1 lg:me-2" />
                <span className="hidden lg:inline">{t('talkToAdvisor')}</span>
                <span className="lg:hidden">{t('talkToAdvisor')}</span>
              </Button>
              {/* Subtle "soon" badge - always on right side */}
              <span className={`absolute -top-1 px-1.5 py-0.5 text-[9px] font-medium bg-purple-500/20 text-purple-300 rounded-md border border-purple-400/30 backdrop-blur-sm ${isRTL ? '-start-1' : '-end-1'}`}>
                {t('soon')}
              </span>
            </div>

            {/* Authentication UI */}
            {isAuthenticated && user ? <UserMenuButton user={user} locale={locale} /> : <SignInButton />}
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-white hover:bg-white/10"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <Icon name="x" className="h-5 w-5" /> : <Icon name="menu" className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <m.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden py-4 border-t border-white/10 bg-black/95 backdrop-blur-xl"
          >
            <div className="flex flex-col gap-4">
              {/* Homepage sections - only on homepage */}
              {isHomepage && (
                <>
                  <a href="#how-it-works" className="text-gray-300 hover:text-white transition-colors text-sm">
                    {t('howItWorks')}
                  </a>
                  <a href="#team" className="text-gray-300 hover:text-white transition-colors text-sm">
                    {t('yourTeam')}
                  </a>
                  <a href="#features" className="text-gray-300 hover:text-white transition-colors text-sm">
                    {t('features')}
                  </a>
                  <div className="my-2 border-t border-white/10"></div>
                </>
              )}

              {/* Global links - always visible, positioned at the end */}
              <Link
                href={ROUTES.PRICING_PAGE}
                className="text-gray-300 hover:text-white transition-colors text-sm flex items-center gap-2"
                onClick={() => setIsMenuOpen(false)}
              >
                <Icon name="credit-card" className="w-4 h-4" />
                {t('pricing')}
              </Link>

              <Link
                href="/blog"
                className="text-gray-300 hover:text-white transition-colors text-sm flex items-center gap-2"
                onClick={() => setIsMenuOpen(false)}
              >
                <Icon name="book-open" className="w-4 h-4" />
                {t('blog')}
              </Link>
              <div className="flex flex-col gap-2 pt-2">
                <div className="relative">
                  <Button
                    variant="ghost"
                    className="w-full text-gray-300 hover:text-white hover:bg-white/10 border-0 justify-start"
                  >
                    <Icon name="message-circle" className="w-4 h-4 me-2" />
                    {t('talkToAdvisor')}
                  </Button>
                  {/* Subtle "soon" badge - always on right side */}
                  <span className={`absolute top-1 px-1.5 py-0.5 text-[9px] font-medium bg-purple-500/20 text-purple-300 rounded-md border border-purple-400/30 backdrop-blur-sm ${isRTL ? 'start-2' : 'end-2'}`}>
                    {t('soon')}
                  </span>
                </div>

                {/* Mobile Language Switcher */}
                <div className="border-t border-white/10 pt-4 mt-2">
                  <LanguageSwitcher variant="footer" currentLocale={locale} />
                </div>

                {/* Mobile Authentication UI */}
                <div className="border-t border-white/10 pt-4 mt-2">
                  {isAuthenticated && user ? <UserMenuButton user={user} locale={locale} /> : <SignInButton />}
                </div>
              </div>
            </div>
          </m.nav>
        )}
      </div>
    </header>
  )
}
