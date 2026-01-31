import { notFound } from 'next/navigation'
import { IntegrationsContent } from './integrations-content'
import { locales, type Locale } from '@/i18n/config'

export default async function IntegrationsPage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  return <IntegrationsContent />
}

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  
  return {
    title: 'Integrations - SheenApps',
    description: 'Seamlessly connect with the tools you already love. SheenApps integrates with leading platforms to enhance your development workflow.',
  }
}