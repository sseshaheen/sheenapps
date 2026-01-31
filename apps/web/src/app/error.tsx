// ROOT error.tsx - INTL-FREE fallback for non-localized route errors
// EXPERT FIX: No next-intl imports allowed here to prevent context errors

'use client'

import Link from 'next/link'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="mx-auto max-w-md rounded-lg bg-white dark:bg-gray-800 p-6 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
          Something went wrong
        </h1>
        <p className="mb-6 text-gray-600 dark:text-gray-400">
          An unexpected error has occurred.
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
            Try again
          </button>
          <Link
            href="/en"
            className="block w-full text-center rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}