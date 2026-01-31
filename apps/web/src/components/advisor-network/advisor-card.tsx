'use client'

import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import type { Advisor, LocalizedPricing } from '@/types/advisor-network';
import { cn } from '@/lib/utils';
import { getLocalizedDisplayName, getLocalizedBio, getLocalizedSpecialties, getSpecialtyDisplayName } from '@/utils/advisor-localization';

interface AdvisorCardProps {
  advisor: Advisor;
  onBook?: () => void;
  onViewProfile?: () => void;
  showBookingButton?: boolean;
  showFullBio?: boolean;
  className?: string;
  translations: {
    rating: string;
    reviews: string;
    bookNow: string;
    viewProfile: string;
    available: string;
    busy: string;
  };
  pricing?: LocalizedPricing | null;
}

export function AdvisorCard({
  advisor,
  onBook,
  onViewProfile,
  showBookingButton = true,
  showFullBio = false,
  className,
  translations,
  pricing
}: AdvisorCardProps) {
  const [imageError, setImageError] = useState(false);

  // Get booking status info
  const getBookingStatusInfo = () => {
    switch (advisor.booking_status) {
      case 'available':
        return {
          isBookable: true,
          buttonText: translations.bookNow,
          statusText: translations.available,
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
          buttonText: translations.busy,
          statusText: translations.busy,
          statusColor: 'text-muted-foreground',
          indicatorColor: 'bg-gray-400'
        };
      default:
        return {
          isBookable: false,
          buttonText: translations.busy,
          statusText: translations.busy,
          statusColor: 'text-muted-foreground',
          indicatorColor: 'bg-gray-400'
        };
    }
  };

  const bookingStatus = getBookingStatusInfo();

  // Truncate bio for card view with localized content
  const localizedBio = getLocalizedBio(advisor);
  const displayBio = showFullBio || !localizedBio 
    ? localizedBio 
    : (localizedBio?.length || 0) > 120 
      ? `${localizedBio.slice(0, 120)}...`
      : localizedBio;

  // Get minimum price for display
  const minPrice = pricing?.prices?.duration_15?.display || null;

  // Generate avatar fallback from name with robust null safety
  const displayName = getLocalizedDisplayName(advisor);
  const avatarFallback = displayName
    .split(' ')
    .map(name => name?.[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AN';

  return (
    <Card className={cn(
      "group relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 border-2",
      className
    )}>
      <CardContent className="p-6">
        {/* Header with Avatar and Status */}
        <div className="flex items-start gap-3 mb-4">
          <div className="relative">
            <Avatar className="h-12 w-12">
              {advisor.avatar_url && !imageError ? (
                <img
                  src={advisor.avatar_url}
                  alt={displayName}
                  className="h-full w-full object-cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white font-semibold">
                  {avatarFallback}
                </div>
              )}
            </Avatar>
            
            {/* Availability Indicator */}
            <div className={cn(
              "absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-background",
              bookingStatus.indicatorColor
            )} />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg leading-tight mb-1 truncate">
              {displayName}
            </h3>
            
            {/* Rating and Reviews */}
            {(Number(advisor.rating) || 0) > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Icon name="star" className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium">{(Number(advisor.rating) || 0).toFixed(1)}</span>
                </div>
                <span>•</span>
                <span>{Number(advisor.review_count) || 0} {translations.reviews}</span>
              </div>
            )}
          </div>
          
          {/* Pricing Badge */}
          {minPrice && showBookingButton && (
            <Badge variant="secondary" className="text-xs">
              {minPrice}
            </Badge>
          )}
        </div>

        {/* Bio */}
        {displayBio && (
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            {displayBio}
          </p>
        )}

        {/* Skills */}
        {(advisor.skills?.length ?? 0) > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-1">
              {(advisor.skills ?? []).slice(0, 3).map((skill) => (
                <Badge key={skill} variant="outline" className="text-xs">
                  {skill}
                </Badge>
              ))}
              {(advisor.skills?.length ?? 0) > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{(advisor.skills?.length ?? 0) - 3}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Specialties */}
        {getLocalizedSpecialties(advisor).length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-1">
              {getLocalizedSpecialties(advisor).map((specialty, index) => {
                const key = specialty.specialty_key || specialty.key || `specialty-${index}`;
                const displayName = getSpecialtyDisplayName(specialty);
                return (
                  <Badge key={key} variant="secondary" className="text-xs capitalize">
                    {displayName}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Languages */}
        {(advisor.languages?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Icon name="globe" className="h-3 w-3" />
            <span>{(advisor.languages ?? []).join(', ')}</span>
          </div>
        )}

        {/* Availability Status */}
        <div className="flex items-center gap-2 text-xs">
          <div className={cn(
            "h-2 w-2 rounded-full",
            bookingStatus.indicatorColor
          )} />
          <span className={cn(
            "font-medium",
            bookingStatus.statusColor
          )}>
            {bookingStatus.statusText}
          </span>
        </div>
      </CardContent>

      {/* Actions */}
      {(showBookingButton || onViewProfile) && (
        <CardFooter className="p-6 pt-0 flex gap-2">
          {onViewProfile && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewProfile}
              className="flex-1"
            >
              {translations.viewProfile}
            </Button>
          )}
          
          {showBookingButton && onBook && (
            <Button
              size="sm"
              onClick={onBook}
              disabled={!bookingStatus.isBookable}
              className="flex-1"
            >
              {bookingStatus.buttonText}
            </Button>
          )}
        </CardFooter>
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/0 to-background/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </Card>
  );
}