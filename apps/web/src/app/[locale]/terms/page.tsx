import { notFound } from 'next/navigation'
import { TermsContent } from './terms-content'
import { locales, type Locale } from '@/i18n/config'

export default async function TermsPage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  return <TermsContent />
}

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  
  return {
    title: 'Terms of Service - SheenApps',
    description: 'Terms and conditions for using SheenApps platform. Clear, fair terms that protect both you and us.',
  }
}