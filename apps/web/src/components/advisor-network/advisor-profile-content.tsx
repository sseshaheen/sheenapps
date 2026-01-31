'use client'

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import type { Advisor, LocalizedPricing } from '@/types/advisor-network';
import { getLocalizedBio, getLocalizedDisplayName, getLocalizedSpecialties, getSpecialtyDisplayName } from '@/utils/advisor-localization';
import { useTranslations } from 'next-intl';
import { AdvisorCard } from './advisor-card';

interface AdvisorProfileContentProps {
  advisor: Advisor;
  pricing: LocalizedPricing | null;
  translations: {
    advisor: {
      profile: {
        title: string;
        about: string;
        skills: string;
        specialties: string;
        languages: string;
        experience: string;
        reviews: string;
        portfolio: string;
        availability: string;
      };
    };
    consultations: {
      book: {
        title: string;
        pricing: {
          clientPays: string;
          advisorEarns: string;
        };
      };
    };
    advisors: {
      cards: {
        rating: string;
        reviews: string;
        review: string;
        bookNow: string;
        viewProfile: string;
        available: string;
        busy: string;
      };
    };
    placeholders: {
      noReviewsYet: string;
      reviewSummary: string;
    };
    pricing: {
      title: string;
    };
    navigation: {
      browseAllAdvisors: string;
      advisors: string;
    };
    labels: {
      free: string;
      minutes: string;
    };
    common: {
      loading: string;
      error: string;
      retry: string;
    };
  };
  locale: string;
}

export function AdvisorProfileContent({ advisor, pricing, translations, locale }: AdvisorProfileContentProps) {
  const tAdvisor = useTranslations('advisor');
  const router = useRouter();

  // Get booking status info
  const getBookingStatusInfo = () => {
    switch (advisor.booking_status) {
      case 'available':
        return {
          isBookable: true,
          buttonText: translations.advisors.cards.bookNow,
          statusText: translations.advisors.cards.available,
          statusColor: 'text-green-600',
          indicatorColor: 'bg-green-500'
        };
      case 'calendar_setup_required':
        return {
          isBookable: false,
          buttonText: 'Coming soon',
          statusText: 'Available soon',
          statusColor: 'text-blue-600',
          indicatorColor: 'bg-blue-500'
        };
      case 'not_accepting_bookings':
        return {
          isBookable: false,
          buttonText: translations.advisors.cards.busy,
          statusText: 'This advisor is currently unavailable for bookings',
          statusColor: 'text-muted-foreground',
          indicatorColor: 'bg-gray-400'
        };
      default:
        return {
          isBookable: false,
          buttonText: translations.advisors.cards.busy,
          statusText: translations.advisors.cards.busy,
          statusColor: 'text-muted-foreground',
          indicatorColor: 'bg-gray-400'
        };
    }
  };

  const bookingStatus = getBookingStatusInfo();

  // Handle booking consultation
  const handleBookConsultation = () => {
    router.push(`/advisors/${advisor.user_id}/book`);
  };

  // Handle back to advisors list
  const handleBackToAdvisors = () => {
    router.push('/advisors');
  };

  return (
    <div 
      className="min-h-screen bg-background pt-fixed-header"
      data-testid="advisor-profile"
    >
      {/* Header with breadcrumb */}
      <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <button
              onClick={handleBackToAdvisors}
              className="hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Icon name="arrow-left" className="h-4 w-4 ltr:block rtl:hidden" />
              <Icon name="arrow-right" className="h-4 w-4 rtl:block ltr:hidden" />
              {translations.navigation.advisors}
            </button>
            <Icon name="chevron-right" className="h-4 w-4 ltr:block rtl:hidden" />
            <Icon name="chevron-left" className="h-4 w-4 rtl:block ltr:hidden" />
            <span>{getLocalizedDisplayName(advisor)}</span>
          </div>

          <h1 className="text-3xl font-bold">{translations.advisor.profile.title}</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Mobile Advisor Header - Show on mobile/tablet only */}
        <div className="lg:hidden mb-6">
          <AdvisorCard
            advisor={advisor}
            onBook={handleBookConsultation}
            translations={translations.advisors.cards}
            pricing={pricing}
            showBookingButton={true}
            showFullBio={false}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* About Section */}
            <Card>
              <CardHeader>
                <CardTitle>{translations.advisor.profile.about}</CardTitle>
              </CardHeader>
              <CardContent>
                {getLocalizedBio(advisor) ? (
                  <p 
                    className="text-muted-foreground leading-relaxed whitespace-pre-wrap"
                    data-testid="advisor-bio"
                  >
                    {getLocalizedBio(advisor)}
                  </p>
                ) : (
                  <p className="text-muted-foreground italic">
                    No bio provided yet.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Skills & Technologies */}
            {(advisor.skills?.length || 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{translations.advisor.profile.skills}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {advisor.skills?.map((skill) => (
                      <Badge key={skill} variant="outline" className="text-sm">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Areas of Expertise */}
            {getLocalizedSpecialties(advisor).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{translations.advisor.profile.specialties}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {getLocalizedSpecialties(advisor).map((specialty, index) => {
                      const key = specialty.specialty_key || specialty.key || `specialty-${index}`;
                      const displayName = getSpecialtyDisplayName(specialty);
                      return (
                        <Badge key={key} variant="secondary" className="text-sm capitalize">
                          {displayName}
                        </Badge>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Languages */}
            {(advisor.languages?.length || 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{translations.advisor.profile.languages}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Icon name="globe" className="h-5 w-5 text-muted-foreground" />
                    <span>{advisor.languages?.join(', ') || 'Not specified'}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reviews Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {translations.advisor.profile.reviews}
                  {(Number(advisor.rating) || 0) > 0 && (
                    <div className="flex items-center gap-1 text-sm">
                      <Icon name="star" className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{(Number(advisor.rating) || 0).toFixed(1)}</span>
                      <span className="text-muted-foreground">
                        {tAdvisor('labels.reviewCount', { count: Number(advisor.review_count) || 0 })}
                      </span>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(Number(advisor.review_count) || 0) === 0 ? (
                  <p className="text-muted-foreground">{tAdvisor('placeholders.noReviewsYet')}</p>
                ) : (
                  <div className="space-y-4">
                    {/* TODO: Add actual reviews list when available */}
                    <p className="text-muted-foreground">
                      {tAdvisor('placeholders.reviewSummary', {
                        count: Number(advisor.review_count) || 0,
                        rating: (Number(advisor.rating) || 0).toFixed(1)
                      })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Hide advisor card on mobile since it's shown at top */}
          <div className="space-y-6">
            {/* Advisor Card - Desktop only */}
            <div className="hidden lg:block">
              <AdvisorCard
                advisor={advisor}
                onBook={handleBookConsultation}
                translations={translations.advisors.cards}
                pricing={pricing}
                showBookingButton={true}
                showFullBio={false}
                  />
            </div>

            {/* Availability Status */}
            <Card>
              <CardHeader>
                <CardTitle>{translations.advisor.profile.availability}</CardTitle>
              </CardHeader>
              <CardContent data-testid="advisor-availability">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${bookingStatus.indicatorColor}`} />
                  <span className={`font-medium ${bookingStatus.statusColor}`}>
                    {bookingStatus.statusText}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Pricing Information */}
            {pricing?.prices && (
              <Card>
                <CardHeader>
                  <CardTitle>{translations.pricing.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3" data-testid="advisor-rate">
                  {Object.entries(pricing.prices).map(([duration, priceInfo]) => {
                    const minutes = duration.replace('duration_', '');
                    const isFree = priceInfo.is_free || false;
                    return (
                      <div key={duration} className="flex justify-between items-center">
                        <span className="text-sm">{minutes} {translations.labels.minutes}</span>
                        <div className="flex items-center gap-2">
                          {isFree && (
                            <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 text-xs">
                              {translations.labels.free}
                            </Badge>
                          )}
                          <span className={cn(
                            "font-medium",
                            isFree && "text-green-600 dark:text-green-400"
                          )}>
                            {priceInfo.display}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <Button
                    onClick={handleBookConsultation}
                    disabled={!bookingStatus.isBookable}
                    className="w-full"
                    size="lg"
                  >
                    {bookingStatus.buttonText}
                  </Button>

                  <Button
                    onClick={handleBackToAdvisors}
                    variant="outline"
                    className="w-full"
                  >
                    <Icon name="arrow-left" className="h-4 w-4 me-2" />
                    {translations.navigation.browseAllAdvisors}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
