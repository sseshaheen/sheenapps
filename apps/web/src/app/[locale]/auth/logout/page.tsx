/**
 * 🚪 Logout Page
 * Handles user logout and redirects to home
 */

import { LogoutHandler } from '@/components/auth/logout-handler'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Signing Out - SheenApps',
  description: 'Signing you out of your SheenApps account.',
}

export default function LogoutPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center space-y-4">
        <h1 className="text-2xl font-semibold">Signing Out...</h1>
        <p className="text-muted-foreground">Please wait while we sign you out.</p>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-muted-foreground text-sm">Redirecting to homepage...</p>
        <LogoutHandler />
      </div>
    </div>
  )
}