import { redirectWithLocale } from '@/utils/navigation';

export const dynamic = 'force-dynamic'

export default async function WorkspaceRedirectPage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params
  
  // For now, redirect to builder/new to create a project
  // In the future, this could redirect to the user's most recent project
  // or show a project selection page
  redirectWithLocale('/builder/new', locale);
}