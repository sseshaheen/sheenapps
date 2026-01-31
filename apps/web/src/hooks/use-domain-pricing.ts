'use client'

import { useQuery } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'

export interface TldPricing {
  tld: string
  registrationPrice: number
  renewalPrice: number
  transferPrice: number
  currency: string
}

async function fetchDomainPricing() {
  const res = await fetch(
    `/api/inhouse/domain-pricing?_t=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Failed to fetch domain pricing: ${res.status}`)
  const data = await res.json()
  if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch domain pricing')
  return data.data as { pricing: TldPricing[] }
}

export function useDomainPricing(enabled = true) {
  return useQuery({
    queryKey: emailKeys.domainPricing(),
    queryFn: fetchDomainPricing,
    enabled,
    staleTime: 300_000, // 5 minutes — pricing doesn't change often
  })
}
