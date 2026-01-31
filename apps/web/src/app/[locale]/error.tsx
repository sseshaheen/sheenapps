// LOCALIZED error.tsx - Uses next-intl inside [locale] tree
// EXPERT FIX: Can safely use next-intl here because it's inside provider scope

'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'

export default function LocalizedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')
  
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="mx-auto max-w-md rounded-lg bg-white dark:bg-gray-800 p-6 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('generic.title')}
        </h1>
        <p className="mb-6 text-gray-600 dark:text-gray-400">
          {t('generic.description')}
        </p>
        {error.digest && (
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Error ID: {error.digest}
          </p>
        )}
        <div className="space-y-2">
          <button
            onClick={reset}
            className="w-full rounded-md bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
          >
            {t('generic.tryAgain')}
          </button>
          <Link
            href="/"
            className="block w-full text-center rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {t('generic.goHome')}
          </Link>
        </div>
      </div>
    </div>
  )
}