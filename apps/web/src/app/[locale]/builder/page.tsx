import { redirectWithLocale } from '@/utils/navigation';

export const dynamic = 'force-dynamic'

export default async function BuilderIndexPage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  // Redirect to /builder/new for new project creation
  redirectWithLocale('/builder/new', locale);
}