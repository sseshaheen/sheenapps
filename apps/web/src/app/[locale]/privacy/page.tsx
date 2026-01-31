import { notFound } from 'next/navigation'
import { PrivacyContent } from './privacy-content'
import { locales, type Locale } from '@/i18n/config'

export default async function PrivacyPage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  return <PrivacyContent />
}

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  
  return {
    title: 'Privacy Policy - SheenApps',
    description: 'Learn how SheenApps protects your privacy and handles your data. We are committed to transparency and security.',
  }
}