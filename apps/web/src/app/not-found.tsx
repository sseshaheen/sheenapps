// ROOT not-found.tsx - INTL-FREE fallback for non-localized routes
// This handles requests like /this/does/not/exist (no locale prefix)
// EXPERT FIX: No next-intl imports allowed here to prevent context errors

import Link from 'next/link'

export default function RootNotFound() {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-gray-100 dark:bg-gray-900">
        <div className="flex min-h-screen flex-col items-center justify-center px-4">
          <div className="mx-auto max-w-md text-center">
            <h1 className="mb-4 text-6xl font-bold text-gray-900 dark:text-gray-100">404</h1>
            <h2 className="mb-4 text-2xl font-semibold text-gray-700 dark:text-gray-300">
              Page Not Found
            </h2>
            <p className="mb-8 text-gray-600 dark:text-gray-400">
              Sorry, we couldn't find the page you're looking for.
            </p>
            <Link
              href="/en"
              className="inline-block rounded-md bg-purple-600 px-6 py-3 text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
            >
              Go back home
            </Link>
          </div>
        </div>
      </body>
    </html>
  )
}