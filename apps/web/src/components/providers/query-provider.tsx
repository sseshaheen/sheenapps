'use client'

/* eslint-disable no-restricted-globals */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

interface QueryProviderProps {
  children: React.ReactNode
}

export function QueryProvider({ children }: QueryProviderProps) {
  // Create a new QueryClient instance for each page load
  // This prevents sharing state between different user sessions in SSR
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Development: shorter times for immediate feedback
        // Production: longer times for performance
        staleTime: process.env.NODE_ENV === 'development' ? 10_000 : 60_000, // 10s dev, 1m prod
        gcTime: process.env.NODE_ENV === 'development' ? 2 * 60_000 : 5 * 60_000, // 2m dev, 5m prod
        
        // Development: fail fast to catch errors
        // Production: retry for reliability
        retry: process.env.NODE_ENV === 'development' ? false : 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        
        // Development: aggressive refetching for testing
        // Production: balanced for performance
        refetchOnWindowFocus: process.env.NODE_ENV === 'development' ? 'always' : true,
        refetchOnMount: process.env.NODE_ENV === 'development' ? true : false,
        refetchInterval: false,
      },
      mutations: {
        // No retries in dev, 1 retry in prod
        retry: process.env.NODE_ENV === 'development' ? 0 : 1,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Load DevTools only in development/preview (not production) */}
      {process.env.NEXT_PUBLIC_APP_ENV !== 'production' && (
        <ReactQueryDevtools 
          initialIsOpen={false}
          buttonPosition="bottom-right"
        />
      )}
    </QueryClientProvider>
  )
}
