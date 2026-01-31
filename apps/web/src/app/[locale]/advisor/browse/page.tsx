import { PublicAdvisorShowcase } from '@/components/advisor-network/public-advisor-showcase';
import { notFound } from 'next/navigation';
import { loadNamespace } from '@/i18n/message-loader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/routing';

// Use proper Next.js 15 PageProps helper type
export default async function AdvisorBrowsePage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Await params as per Next.js 15 best practices
  const params = await props.params;
  const searchParams = await props.searchParams;
  
  // Extract pagination parameters
  const currentPage = Math.max(1, parseInt(searchParams.page as string) || 1);
  const limit = 12;
  
  // Load translations
  const messages = await loadNamespace(params.locale, 'advisor');
  if (Object.keys(messages).length === 0) {
    notFound();
  }

  const advisorTranslations = {
    advisors: {
      title: messages.advisors?.title || 'Expert Advisors',
      subtitle: messages.advisors?.subtitle || 'Get personalized guidance from experienced software engineers',
      meta: messages.advisors?.meta || {}
    },
    landing: {
      hero: {
        cta: messages.landing?.hero?.cta || 'Become an Advisor'
      },
      cta: {
        title: messages.landing?.cta?.title || 'Ready to start earning?',
        description: messages.landing?.cta?.description || 'Join our network of expert advisors and help builders succeed while earning great money',
        quickApplication: messages.landing?.cta?.quickApplication || 'Quick application process'
      }
    }
  };
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header spacer - semantic approach */}
      <div className="header-spacer" aria-hidden="true" />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            {advisorTranslations.advisors.title}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-6">
            {advisorTranslations.advisors.subtitle}
          </p>
          
          {/* Subtle centered button below subtitle */}
          <div className="mt-6">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
              <Link href="/advisor/join">
                <Icon name="plus" className="h-4 w-4 me-2" />
                {advisorTranslations.landing.hero.cta}
              </Link>
            </Button>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto">
          <PublicAdvisorShowcase 
            limit={limit} 
            initialPage={currentPage}
          />
        </div>

        {/* Subtle call-to-action section */}
        <div className="max-w-4xl mx-auto mt-16">
          <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl mb-2">
                {advisorTranslations.landing.cta.title}
              </CardTitle>
              <p className="text-muted-foreground max-w-xl mx-auto">
                {advisorTranslations.landing.cta.description}
              </p>
            </CardHeader>
            <CardContent className="text-center">
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Button asChild size="lg">
                  <Link href="/advisor/join">
                    <Icon name="arrow-right" className="h-4 w-4 me-2" />
                    {advisorTranslations.landing.hero.cta}
                  </Link>
                </Button>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="check-circle" className="h-4 w-4 text-green-600" />
                  <span>{advisorTranslations.landing.cta.quickApplication}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}) {
  const params = await props.params;

  // Load translations for metadata
  let messages = await loadNamespace(params.locale, 'advisor');
  if (Object.keys(messages).length === 0) {
    messages = await loadNamespace('en', 'advisor');
  }

  return {
    title: messages.advisors?.meta?.title || 'Expert Advisors - SheenApps',
    description: messages.advisors?.meta?.description || 'Connect with experienced software engineers for personalized AI-assisted guidance and consultations.'
  };
}