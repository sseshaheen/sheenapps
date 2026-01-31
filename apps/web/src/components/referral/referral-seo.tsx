/**
 * Referral SEO Component
 * Handles canonical URLs to prevent duplicate content issues
 */

'use client'

import { useReferralCanonicalUrl } from '@/hooks/use-referral-tracking'
import Head from 'next/head'

export function ReferralSEO() {
  const canonicalUrl = useReferralCanonicalUrl()
  
  if (!canonicalUrl) return null
  
  return (
    <Head>
      <link rel="canonical" href={canonicalUrl} />
    </Head>
  )
}