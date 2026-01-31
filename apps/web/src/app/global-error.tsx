'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to Sentry
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
          <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h1 className="mb-4 text-2xl font-bold text-gray-900">
              Something went wrong!
            </h1>
            <p className="mb-6 text-gray-600">
              An unexpected error has occurred. Our team has been notified and is working to fix the issue.
            </p>
            {error.digest && (
              <p className="mb-4 text-sm text-gray-500">
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}