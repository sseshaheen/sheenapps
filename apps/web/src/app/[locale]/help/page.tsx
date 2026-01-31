import { notFound } from 'next/navigation'
import { HelpContent } from './help-content'
import { locales, type Locale } from '@/i18n/config'

export default async function HelpPage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  return <HelpContent />
}

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  
  return {
    title: 'Help Center - SheenApps',
    description: 'Get help with SheenApps. Browse our documentation, tutorials, and FAQs to find answers quickly.',
  }
}