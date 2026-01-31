import { redirect } from 'next/navigation';
import { loadNamespace } from '@/i18n/message-loader';

interface AdvisorsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AdvisorsPage(props: AdvisorsPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { locale } = params;
  
  // Redirect to new advisor browse route
  const searchParamsString = new URLSearchParams();
  
  // Preserve search parameters in redirect
  if (searchParams.skills && typeof searchParams.skills === 'string') {
    searchParamsString.set('skills', searchParams.skills);
  }
  if (searchParams.specialties && typeof searchParams.specialties === 'string') {
    searchParamsString.set('specialties', searchParams.specialties);
  }
  if (searchParams.languages && typeof searchParams.languages === 'string') {
    searchParamsString.set('languages', searchParams.languages);
  }
  if (searchParams.rating_min && typeof searchParams.rating_min === 'string') {
    searchParamsString.set('rating_min', searchParams.rating_min);
  }
  if (searchParams.available_only === 'true') {
    searchParamsString.set('available_only', 'true');
  }

  const queryString = searchParamsString.toString();
  const redirectPath = `/${locale}/advisor/browse${queryString ? `?${queryString}` : ''}`;
  
  redirect(redirectPath);
}

export async function generateMetadata(props: AdvisorsPageProps) {
  const params = await props.params;
  const { locale } = params;
  
  const messages = await loadNamespace(locale, 'advisors');

  return {
    title: messages.advisors?.meta?.title || 'Expert Advisors - SheenApps',
    description: messages.advisors?.meta?.description || 'Connect with experienced software engineers for personalized AI-assisted guidance and consultations.'
  };
}