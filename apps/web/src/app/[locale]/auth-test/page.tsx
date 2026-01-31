'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useAuthStore } from '@/store'
import { FEATURE_FLAGS } from '@/lib/feature-flags'

export default function AuthTestPage() {
  const [clientInfo, setClientInfo] = useState<any>({})
  const authStore = useAuthStore()
  
  useEffect(() => {
    const checkClient = async () => {
      console.log('🔍 Testing auth system...')
      console.log('ENABLE_SERVER_AUTH:', FEATURE_FLAGS.ENABLE_SERVER_AUTH)
      console.log('ENABLE_SUPABASE:', FEATURE_FLAGS.ENABLE_SUPABASE)
      
      // Try to create client
      const client = createClient()
      console.log('Client created:', client)
      
      // Try to get session
      const { data, error } = await client.auth.getSession()
      console.log('getSession result:', { data, error })
      
      setClientInfo({
        serverAuthEnabled: FEATURE_FLAGS.ENABLE_SERVER_AUTH,
        supabaseEnabled: FEATURE_FLAGS.ENABLE_SUPABASE,
        clientType: client.auth ? 'Has auth methods' : 'No auth',
        sessionData: data,
        sessionError: error?.message || null,
        storeType: authStore.constructor.name || 'Unknown',
        hasInitialize: 'initialize' in authStore,
        hasCheckAuth: 'checkAuth' in authStore
      })
    }
    
    checkClient()
  }, [])
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Auth System Test</h1>
      <pre className="bg-gray-100 p-4 rounded">
        {JSON.stringify(clientInfo, null, 2)}
      </pre>
      <div className="mt-4">
        <p>Check browser console for detailed logs</p>
        <p>Check Network tab - should NOT see requests to dpnvqzrchxudbmxlofii.supabase.co</p>
      </div>
    </div>
  )
}