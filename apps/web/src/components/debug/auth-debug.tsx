'use client'

import { useAuthStore } from '@/store'
import { useEffect, useState } from 'react'

export function AuthDebug() {
  const { user, isAuthenticated, isLoading, isInitializing } = useAuthStore()
  const [cookies, setCookies] = useState<string[]>([])
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
    // Get all cookies
    const allCookies = document.cookie.split(';').map(c => c.trim())
    setCookies(allCookies.filter(c => c.startsWith('sb-') || c.startsWith('app-')))
  }, [])
  
  if (!mounted) return null
  
  return (
    <div className="fixed bottom-4 right-4 p-4 bg-gray-900 text-white text-xs max-w-sm rounded shadow-lg z-50">
      <h3 className="font-bold mb-2">Auth Debug</h3>
      <div className="space-y-1">
        <p>Loading: {String(isLoading)}</p>
        <p>Initializing: {String(isInitializing)}</p>
        <p>Authenticated: {String(isAuthenticated)}</p>
        <p>User: {user?.email || 'null'}</p>
        <p>User ID: {user?.id?.slice(0, 8) || 'null'}</p>
        <div className="mt-2">
          <p className="font-semibold">Cookies:</p>
          {cookies.length === 0 ? (
            <p className="text-gray-400">No auth cookies found</p>
          ) : (
            cookies.map((c, i) => (
              <p key={i} className="text-xs truncate">{c.split('=')[0]}={c.split('=')[1]?.slice(0, 10)}...</p>
            ))
          )}
        </div>
        <div className="mt-2">
          <p className="font-semibold">SessionStorage:</p>
          <p className="text-xs">auth_email: {typeof window !== 'undefined' ? sessionStorage.getItem('auth_email') : 'N/A'}</p>
          <p className="text-xs">auth_pending_sync: {typeof window !== 'undefined' ? sessionStorage.getItem('auth_pending_sync') : 'N/A'}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <button 
          onClick={() => window.location.reload()} 
          className="px-2 py-1 bg-blue-600 rounded text-xs"
        >
          Refresh
        </button>
        <button 
          onClick={() => {
            console.log('🔄 Force Auth Sync triggered')
            sessionStorage.setItem('auth_pending_sync', 'true')
            window.location.reload()
          }} 
          className="px-2 py-1 bg-green-600 rounded text-xs"
        >
          Force Sync
        </button>
        <button 
          onClick={() => {
            // Clear all auth data
            document.cookie.split(";").forEach(cookie => {
              const eqPos = cookie.indexOf("=");
              const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
              if (name.startsWith('sb-') || name.startsWith('app-')) {
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;`;
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`;
              }
            });
            sessionStorage.clear();
            localStorage.clear();
            window.location.href = '/';
          }} 
          className="px-2 py-1 bg-red-600 rounded text-xs"
        >
          Clear Auth
        </button>
      </div>
    </div>
  )
}