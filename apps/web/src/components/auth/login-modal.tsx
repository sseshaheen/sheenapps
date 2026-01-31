'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, usePathname, Link } from '@/i18n/routing'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store'
import { signInWithPassword, signInWithOAuth, signInWithMagicLink } from '@/lib/actions/auth-actions'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import Icon from '@/components/ui/icon'
import { logger } from '@/utils/logger'
import { LOCALE_RE, normalizeLocale, stripLeadingLocale } from '@/lib/redirect-utils'

function getLocaleNow(fallback = 'en') {
  // 1) try <html lang>
  if (typeof document !== 'undefined' && document.documentElement?.lang) {
    return normalizeLocale(document.documentElement.lang, fallback)
  }
  // 2) try URL prefix
  if (typeof window !== 'undefined') {
    const m = window.location.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?=\/|$)/i)
    if (m?.[1]) return normalizeLocale(m[1], fallback)
  }
  return fallback
}

export function LoginModal() {
  const t = useTranslations('auth')
  const { showLoginModal, closeLoginModal, upgradeContext } = useAuthStore()
  const setAuthState = useAuthStore.setState
  const store = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  // ✅ Expert Hotfix: Remove useLocale() dependency - resolve locale inside functions
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showMagicLinkSent, setShowMagicLinkSent] = useState(false)

  // ✅ EXPERT SOLUTION: Prevent double-prefixing with proper normalization
  const getSecureRedirectPath = (): string => {
    const locale = getLocaleNow('en') // ✅ Expert Hotfix: Safe locale getter never throws
    const windowPath = typeof window !== 'undefined' ? window.location.pathname : null
    
    // ✅ EXPERT FIX: Prefix-based allowlist (supports dynamic children)
    const knownSafePrefixes = [
      `/${locale}`,
      `/${locale}/dashboard`,
      `/${locale}/builder`,        // ✅ Now allows /builder/workspace/uuid
      `/${locale}/builder/new`,
      `/${locale}/builder/workspace`,
      `/${locale}/profile`,
      `/${locale}/settings`
    ]
    
    // 🔍 DIAGNOSTIC LOGGING
    console.log('🔍 CLIENT REDIRECT DIAGNOSTIC (Expert Solution):', {
      currentUrl: typeof window !== 'undefined' ? window.location.href : 'SSR',
      windowPath,
      usePathnameResult: pathname,
      locale,
      knownSafePrefixes,
      startsWithCheck: windowPath ? knownSafePrefixes.some(p => windowPath.startsWith(p)) : 'N/A'
    })
    
    let currentPath: string
    
    if (windowPath && knownSafePrefixes.some(prefix => windowPath.startsWith(prefix))) {
      // ✅ EXPERT: windowPath already localized, use as-is
      currentPath = windowPath
      console.log('✅ CLIENT (Expert): Using validated window path:', windowPath)
    } else {
      // ✅ EXPERT FIX: Normalize pathname first to prevent double-prefixing
      const localPath = pathname || '/'
      const prefixlessPath = stripLeadingLocale(localPath)  // Remove any existing locale
      currentPath = `/${locale}${prefixlessPath}`          // Add locale exactly once
      
      console.log('⚠️ CLIENT (Expert): Using normalized pathname:', { 
        originalPathname: localPath,
        prefixlessPath, 
        finalPath: currentPath 
      })
    }
    
    // SECURITY: Last-mile validation
    if (currentPath.includes('..') || currentPath.includes('<') || currentPath.startsWith('javascript:')) {
      console.log('🚨 CLIENT SECURITY: Suspicious path detected, using safe default:', { suspiciousPath: currentPath })
      currentPath = `/${locale}/dashboard`
    }
    
    console.log('🎯 CLIENT (Expert): Final redirect path:', currentPath)
    return currentPath
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    // EXPERT FIX: Use real form submission for proper cookie handling
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/api/auth/sign-in'

    // 🛡️ SECURITY: Get secure redirect path using centralized validation
    const currentPath = getSecureRedirectPath()
    const locale = getLocaleNow('en') // ✅ Expert Hotfix: Safe locale getter
    
    const fields: Record<string, string> = {
      email,
      password,
      locale,
      returnTo: currentPath,
    }

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.appendChild(input)
    })

    closeLoginModal()
    document.body.appendChild(form)
    form.submit()
  }

  const handleSocialLogin = async (provider: 'github' | 'google') => {
    setIsLoading(true)
    setError('')

    try {
      // EXPERT SOLUTION: Direct redirect to OAuth route handler for proper SSR cookie handling
      const locale = getLocaleNow('en') // ✅ Expert Hotfix: Safe locale getter
      const oauthUrl = new URL('/api/auth/oauth/start', window.location.origin)
      oauthUrl.searchParams.set('provider', provider)
      oauthUrl.searchParams.set('locale', locale)
      
      // 🛡️ SECURITY: Get secure redirect path using centralized validation
      const currentPath = getSecureRedirectPath()
      oauthUrl.searchParams.set('returnTo', currentPath)
      
      closeLoginModal()
      window.location.href = oauthUrl.toString()
    } catch (err) {
      logger.error('Social login error:', err)
      setError('Social login failed. Please try again.')
      setIsLoading(false)
    }
  }

  const handleMagicLink = async () => {
    if (!email) {
      setError('Please enter your email address first')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // For now, keep using server action since magic link doesn't set auth cookies immediately
      // 🛡️ SECURITY: Get secure redirect path using centralized validation  
      const locale = getLocaleNow('en') // ✅ Expert Hotfix: Safe locale getter
      const currentPath = getSecureRedirectPath()
      const result = await signInWithMagicLink(email, locale, currentPath)

      if (!result.success) {
        setError(result.error || 'Failed to send magic link. Please try again.')
        setIsLoading(false)
        return
      }

      setShowMagicLinkSent(true)
      setIsLoading(false)

    } catch (err) {
      logger.error('Magic link error:', err)
      setError('Failed to send magic link. Please try again.')
      setIsLoading(false)
    }
  }

  if (showMagicLinkSent) {
    return (
      <Dialog open={showLoginModal} onOpenChange={closeLoginModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2 rtl:flex-row-reverse">
              <Icon name="mail" className="w-5 h-5 text-purple-600" />
              <span>{t('magicLink.success.title')}</span>
            </DialogTitle>
            <DialogDescription className="text-center">
              {t('magicLink.success.message')} <strong>{email}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <div className="flex items-center gap-2 rtl:flex-row-reverse">
                <Icon name="sparkles" className="w-4 h-4 text-purple-600" />
                <p className="text-sm text-purple-700 dark:text-purple-300">
                  {t('magicLink.success.instructions')}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowMagicLinkSent(false)}
            >
              <Icon name="arrow-left" className="w-4 h-4 me-2 rtl:rotate-180" />
              {t('magicLink.backToSignIn')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={showLoginModal} onOpenChange={closeLoginModal}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            {upgradeContext ? t('login.signInToContinue') : t('login.title')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {upgradeContext ? upgradeContext.message : t('login.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Social Login */}
          <div className="space-y-3">
            <Button
              onClick={() => handleSocialLogin('github')}
              variant="outline"
              className="w-full"
              disabled={isLoading}
            >
              <Icon name="github" className="w-4 h-4 me-2" />
              {t('login.continueWithGithub')}
            </Button>

            <Button
              onClick={() => handleSocialLogin('google')}
              variant="outline"
              className="w-full"
              disabled={isLoading}
            >
              <Icon name="mail" className="w-4 h-4 me-2" />
              {t('login.continueWithGoogle')}
            </Button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-300 dark:border-slate-600" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-slate-800 px-2 text-slate-500 dark:text-slate-300">
                {t('login.orContinueWithEmail')}
              </span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('login.emailLabel')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login.emailPlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('login.passwordLabel')}</Label>
                <Link
                  href={`/auth/reset${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                  className="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                  onClick={closeLoginModal}
                >
                  {t('login.forgotPassword')}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPlaceholder')}
                required
              />
            </div>

            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Icon name="loader-2" className="w-4 h-4 me-2 animate-spin" />
                  {t('login.signingIn')}
                </>
              ) : (
                t('login.signInButton')
              )}
            </Button>
          </form>

          {/* Magic Link Option */}
          <div className="text-center">
            <Button
              variant="link"
              className="text-sm font-medium text-purple-600 hover:text-purple-500 dark:text-purple-400 dark:hover:text-purple-300 p-0 h-auto"
              onClick={handleMagicLink}
              disabled={isLoading}
            >
              <Icon name="sparkles" className="w-4 h-4 me-1" />
              {t('login.magicLinkButton')}
            </Button>
          </div>
        </div>

        <div className="text-center pt-4 border-t border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t('login.noAccount')}{' '}
            <Button
              variant="link"
              className="p-0 h-auto font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              onClick={() => {
                closeLoginModal()
                router.push('/auth/signup')
              }}
            >
              {t('login.createAccount')}
            </Button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}