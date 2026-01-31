import { redirectWithLocale } from '@/utils/navigation';

export const dynamic = 'force-dynamic'

export default async function DebugDBPage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  
  // Debug page not needed in production - redirect to dashboard
  redirectWithLocale('/dashboard', locale)
}