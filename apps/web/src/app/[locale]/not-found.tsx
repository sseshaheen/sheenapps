// LOCALIZED not-found.tsx - Uses next-intl inside [locale] tree
// This handles requests like /en/this/does/not/exist (with locale prefix)
// EXPERT FIX: Can safely use next-intl here because it's inside provider scope

import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'

export default async function LocalizedNotFound() {
  const t = await getTranslations('errors')
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-4 text-6xl font-bold text-gray-900 dark:text-gray-100">404</h1>
        <h2 className="mb-4 text-2xl font-semibold text-gray-700 dark:text-gray-300">
          {t('404.title')}
        </h2>
        <p className="mb-8 text-gray-600 dark:text-gray-400">
          {t('404.description')}
        </p>
        <Link
          href="/"
          className="inline-block rounded-md bg-purple-600 px-6 py-3 text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
        >
          {t('404.goHome')}
        </Link>
      </div>
    </div>
  )
}