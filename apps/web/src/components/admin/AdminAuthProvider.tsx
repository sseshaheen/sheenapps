'use client'

import { useEffect } from 'react'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter, usePathname } from 'next/navigation'

interface AdminAuthProviderProps {
  children: React.ReactNode
}

export function AdminAuthProvider({ children }: AdminAuthProviderProps) {
  const { isAuthenticated, loading, refreshSession } = useAdminAuth()
  const router = useRouter()
  const pathname = usePathname()
  
  // Check authentication status and redirect if needed
  useEffect(() => {
    if (!loading && !isAuthenticated && pathname.startsWith('/admin')) {
      router.push('/admin-login')
    }
  }, [isAuthenticated, loading, pathname, router])
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }
  
  return <>{children}</>
}