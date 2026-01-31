'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/routing';
import { searchAdvisorsAction } from '@/lib/actions/advisor-actions';
import type { Advisor } from '@/types/advisor-network';
import { logger } from '@/utils/logger';
import { useTranslations } from 'next-intl';


interface AdvisorShowcaseProps {
  limit?: number;
}

export function AdvisorShowcase({ limit = 6 }: AdvisorShowcaseProps) {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Get translations for advisor cards
  const t = useTranslations('advisor');
  const tCards = useTranslations('advisor.advisors.cards');
  const tAvailability = useTranslations('advisor.availability');
  const tLabels = useTranslations('advisor.labels');
  const tPlaceholders = useTranslations('advisor.placeholders');

  // Prepare translation props for cards
  const translations = {
    rating: tCards('rating'),
    reviews: tCards('reviews'),
    bookNow: tCards('bookNow'),
    viewProfile: tCards('viewProfile'),
    available: tAvailability('available'),
    busy: tAvailability('unavailable'),
    // Pass translation functions instead of pre-translated strings for parameterized messages
    getExpert: (specialty: string) => tLabels('expert', { specialty }),
    softwareEngineer: tLabels('softwareEngineer'),
    getYearsExperience: (years: number) => tLabels('yearsExperience', { years }),
    usually1Day: tAvailability('usually1Day'),
    notAcceptingBookings: tAvailability('notAcceptingBookings'),
    getNoSpecificReviews: (skill: string) => tPlaceholders('noSpecificReviews', { skill })
  };

  useEffect(() => {
    const fetchAdvisors = async () => {
      try {
        setLoading(true);
        const result = await searchAdvisorsAction({
          available_only: true,
          rating_min: 4.0,
          limit: limit
        });
        
        if (result.success && result.data) {
          setAdvisors(result.data.advisors);
        } else {
          setError(result.error || 'Failed to load advisors');
        }
      } catch (err) {
        logger.error('Failed to fetch advisors for showcase:', err);
        setError('Failed to load advisors');
      } finally {
        setLoading(false);
      }
    };

    fetchAdvisors();
  }, [limit]);

  if (loading) {
    return <AdvisorShowcaseSkeleton count={limit} />;
  }

  if (error) {
    return <AdvisorShowcaseError error={error} translations={translations} />;
  }

  if (advisors.length === 0) {
    return <AdvisorShowcaseFallback translations={translations} />;
  }

  return (
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {advisors.map((advisor) => (
        <AdvisorShowcaseCard 
          key={advisor.id} 
          advisor={advisor} 
          translations={translations}
        />
      ))}
    </div>
  );
}

interface AdvisorShowcaseCardTranslations {
  rating: string;
  reviews: string;
  bookNow: string;
  viewProfile: string;
  available: string;
  busy: string;
  getExpert: (specialty: string) => string;
  softwareEngineer: string;
  getYearsExperience: (years: number) => string;
  usually1Day: string;
  notAcceptingBookings: string;
  getNoSpecificReviews: (skill: string) => string;
}

function AdvisorShowcaseCard({ 
  advisor, 
  translations 
}: { 
  advisor: Advisor;
  translations: AdvisorShowcaseCardTranslations;
}) {
  // Generate avatar initials from display name with null safety
  const displayName = advisor.display_name ?? 'Anonymous';
  const avatarInitials = displayName
    .split(' ')
    .map(name => name?.[0] || '')
    .join('')
    .toUpperCase()
    .substring(0, 2) || 'AN';

  // Get booking status info
  const getBookingStatusInfo = () => {
    switch (advisor.booking_status) {
      case 'available':
        return {
          isBookable: true,
          statusText: translations.usually1Day
        };
      case 'calendar_setup_required':
        return {
          isBookable: false,
          statusText: 'Available soon'
        };
      case 'not_accepting_bookings':
        return {
          isBookable: false,
          statusText: translations.notAcceptingBookings
        };
      default:
        return {
          isBookable: false,
          statusText: translations.notAcceptingBookings
        };
    }
  };

  const bookingStatus = getBookingStatusInfo();
    
  // Get primary skills (limit to top 3) with null safety
  const primarySkills = advisor.skills?.slice(0, 3) ?? [];
  
  // Get recent review snippet from backend bio if available
  const reviewCount = Number(advisor.review_count) || 0; // Robust against null/undefined/string values
  const advisorBio = (advisor as any).bio; // Backend may provide bio from Worker API
  const recentReview = advisorBio 
    ? advisorBio 
    : translations.getNoSpecificReviews(primarySkills[0] || 'development');

  return (
    <Card className="text-center border-2 hover:border-primary/50 transition-all duration-300 hover:shadow-lg !bg-gray-800 !border-gray-700" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
      <CardHeader>
        <div className="w-16 h-16 bg-gradient-to-r from-primary to-primary/60 rounded-full mx-auto mb-4 flex items-center justify-center">
          {advisor.avatar_url ? (
            <img 
              src={advisor.avatar_url} 
              alt={displayName}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <span className="text-white font-bold text-xl">
              {avatarInitials}
            </span>
          )}
        </div>
        <CardTitle className="text-xl !text-white" style={{ color: 'white' }}>
          {displayName}
        </CardTitle>
        <CardDescription className="text-gray-400">
          {(advisor.specialties?.length ?? 0) > 0 
            ? translations.getExpert(
                typeof advisor.specialties?.[0] === 'string' 
                  ? advisor.specialties[0] 
                  : advisor.specialties?.[0]?.key ?? 'General'
              )
            : translations.softwareEngineer
          }
        </CardDescription>
        {advisor.years_experience && (
          <p className="text-sm text-gray-500 mt-2">
            {translations.getYearsExperience(advisor.years_experience)}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap justify-center gap-2">
          {primarySkills.map((skill, skillIndex) => (
            <Badge key={skillIndex} variant="secondary" className="text-xs">
              {skill}
            </Badge>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 text-sm">
          <div className="flex items-center gap-1">
            <Icon name="star" className="w-4 h-4 text-yellow-500 fill-current" />
            <span className="text-gray-300">{(Number(advisor.rating) || 0).toFixed(1)}</span>
          </div>
          <span className="text-gray-500">({reviewCount} {translations.reviews})</span>
        </div>
        <p className={`text-sm ${bookingStatus.isBookable ? 'text-green-400' : 'text-orange-400'}`}>
          {bookingStatus.statusText}
        </p>
        <div className="bg-gray-900/50 p-3 rounded text-left">
          <p className="text-sm text-gray-400 italic">
            "{recentReview}"
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href={`/advisors/${advisor.user_id}`}>
            {translations.bookNow}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function AdvisorShowcaseSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="text-center !bg-gray-800 !border-gray-700" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
          <CardHeader>
            <div className="w-16 h-16 bg-gray-700 rounded-full mx-auto mb-4 animate-pulse" />
            <div className="h-6 bg-gray-700 rounded animate-pulse mb-2" />
            <div className="h-4 bg-gray-700 rounded animate-pulse w-2/3 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center gap-2">
              <div className="h-6 w-16 bg-gray-700 rounded animate-pulse" />
              <div className="h-6 w-20 bg-gray-700 rounded animate-pulse" />
              <div className="h-6 w-14 bg-gray-700 rounded animate-pulse" />
            </div>
            <div className="h-4 bg-gray-700 rounded animate-pulse w-1/2 mx-auto" />
            <div className="h-4 bg-gray-700 rounded animate-pulse w-3/4 mx-auto" />
            <div className="h-16 bg-gray-700 rounded animate-pulse" />
            <div className="h-10 bg-gray-700 rounded animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AdvisorShowcaseError({ 
  error, 
  translations 
}: { 
  error: string; 
  translations: AdvisorShowcaseCardTranslations; 
}) {
  const tClient = useTranslations('advisor.client');
  
  return (
    <Card className="text-center p-8 !bg-gray-800 !border-gray-700" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
      <CardContent>
        <Icon name="alert-triangle" className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-gray-300 mb-4">{tClient('advisorShowcase.error') || 'Unable to load advisors at the moment.'}</p>
        <p className="text-sm text-gray-500">{error}</p>
        <Button asChild className="mt-4">
          <Link href="/advisors">
            {tClient('advisorShowcase.browseAll') || 'Browse All Advisors'}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function AdvisorShowcaseFallback({ 
  translations 
}: { 
  translations: AdvisorShowcaseCardTranslations; 
}) {
  const tClient = useTranslations('advisor.client');
  
  return (
    <Card className="text-center p-8 !bg-gray-800 !border-gray-700" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
      <CardContent>
        <Icon name="users" className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-300 mb-4">{tClient('advisorShowcase.noAdvisors') || 'No advisors available at the moment.'}</p>
        <p className="text-sm text-gray-500 mb-4">
          {tClient('advisorShowcase.checkBack') || "We're working on bringing you the best experts. Check back soon!"}
        </p>
        <Button asChild>
          <Link href="/advisor/join">
            {tClient('recruitment.cta') || 'Become an Advisor'}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// Analytics tracking for CTA clicks and advisor card interactions
export function trackAdvisorCardView(advisorId: string) {
  // TODO: Implement analytics tracking in Phase 2
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'advisor_card_view', {
      advisor_id: advisorId,
      page_location: window.location.href,
    });
  }
}

export function trackAdvisorCardBook(advisorId: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'advisor_card_book_click', {
      advisor_id: advisorId,
      page_location: window.location.href,
    });
  }
}