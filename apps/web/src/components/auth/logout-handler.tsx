'use client'

/**
 * 🚪 Logout Handler Component
 * Handles the actual logout process and redirects user
 */

import { useEffect } from 'react'
import { useRouter } from '@/i18n/routing'

export function LogoutHandler() {
  const router = useRouter()

  useEffect(() => {
    const performLogout = async () => {
      try {
        // Call the logout API
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        // Always redirect to home, even if logout fails
        // The API is designed to always return success to ensure user gets logged out
        setTimeout(() => {
          router.push('/')
        }, 1000) // Small delay for better UX
      } catch (error) {
        console.error('Logout error:', error)
        // Still redirect to home even on error
        setTimeout(() => {
          router.push('/')
        }, 1000)
      }
    }

    performLogout()
  }, [router])

  return null
}