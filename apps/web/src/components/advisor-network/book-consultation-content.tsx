'use client'

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useRouter, Link } from '@/i18n/routing';
import { bookConsultationAction } from '@/lib/actions/advisor-actions';
import { cn } from '@/lib/utils';
import type {
  Advisor,
  BookConsultationRequest,
  ConsultationDuration,
  LocalizedPricing
} from '@/types/advisor-network';
import { useState } from 'react';
import { AdvisorCard } from './advisor-card';
import { CalComEmbed } from './calcom-embed';
import { PaymentForm } from './payment-form';

interface BookConsultationContentProps {
  advisor: Advisor;
  pricing: LocalizedPricing | null;
  projectId?: string;
  translations: {
    consultations: {
      book: {
        title: string;
        selectDuration: string;
        selectTime: string;
        pricing: {
          '15min': string;
          '30min': string;
          '60min': string;
          clientPays: string;
          advisorEarns: string;
          descriptions: {
            '15min': string;
            '30min': string;
            '60min': string;
          };
        };
        policies: {
          title: string;
          cancellation: string;
          ownership: string;
          refund: string;
        };
        form: {
          notes: {
            label: string;
            placeholder: string;
            help: string;
          };
          project: {
            label: string;
            help: string;
          };
        };
        payment: {
          title: string;
          secure: string;
          processing: string;
          success: string;
        };
        confirmation: {
          title: string;
          details: string;
          advisor: string;
          duration: string;
          dateTime: string;
          price: string;
          videoLink: string;
          calendar: string;
          email: string;
        };
      };
    };
    labels: {
      free: string;
      minutes: string;
    };
    durations: {
      '15': string;
      '30': string;
      '60': string;
    };
    common: {
      loading: string;
      error: string;
      retry: string;
      cancel: string;
      continue: string;
      back: string;
    };
    navigation: {
      advisors: string;
    };
  };
  locale: string;
}

type BookingStep = 'duration' | 'details' | 'calendar' | 'payment' | 'confirmation';

export function BookConsultationContent({
  advisor,
  pricing,
  projectId,
  translations,
  locale
}: BookConsultationContentProps) {
  const router = useRouter();

  // Booking flow state
  const [currentStep, setCurrentStep] = useState<BookingStep>('duration');
  const [selectedDuration, setSelectedDuration] = useState<ConsultationDuration | null>(null);
  const [selectedDateTime, setSelectedDateTime] = useState<string | null>(null);
  const [calBookingId, setCalBookingId] = useState<string | null>(null);
  const [consultationNotes, setConsultationNotes] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  // Handle duration selection
  const handleDurationSelect = (duration: ConsultationDuration) => {
    setSelectedDuration(duration);
    setCurrentStep('details');
  };

  // Handle consultation details
  const handleDetailsNext = () => {
    setCurrentStep('calendar');
  };

  // Handle calendar selection
  const handleCalendarSelect = (dateTime: string, bookingId?: string) => {
    setSelectedDateTime(dateTime);
    setCalBookingId(bookingId || null);

    // Check if selected consultation is free to skip payment step
    const selectedPricing = selectedDuration ? pricing?.prices[`duration_${selectedDuration}`] : null;
    const isFree = selectedPricing?.is_free || false;

    if (isFree) {
      // For free consultations, book immediately (no payment required)
      handleBookingSubmit();
    } else {
      setCurrentStep('payment');
    }
  };

  // Handle booking submission
  const handleBookingSubmit = async () => {
    if (!advisor || !selectedDuration || !selectedDateTime) {
      setBookingError('Missing required booking information');
      return;
    }

    setBookingLoading(true);
    setBookingError(null);

    try {

      const bookingRequest: BookConsultationRequest = {
        advisor_user_id: advisor.user_id,
        duration_minutes: selectedDuration,
        project_id: projectId,
        cal_booking_id: calBookingId || undefined,
        locale,
        client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notes: consultationNotes || undefined
      };

      const result = await bookConsultationAction(bookingRequest);

      if (!result.success) {
        throw new Error(result.error || 'Failed to book consultation');
      }

      if (!result.data) {
        throw new Error('Invalid booking response');
      }

      setConsultationId(result.data.consultationId);

      if (result.data.requiresPayment && result.data.clientSecret) {
        setClientSecret(result.data.clientSecret);
        // Stay on payment step for Stripe payment
      } else {
        // Free consultation or payment not required, go to confirmation
        setCurrentStep('confirmation');
      }


    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to book consultation';
      setBookingError(errorMessage);
    } finally {
      setBookingLoading(false);
    }
  };

  // Handle payment success
  const handlePaymentSuccess = () => {
    setCurrentStep('confirmation');
  };

  // Handle back navigation
  const handleBackStep = () => {
    switch (currentStep) {
      case 'details':
        setCurrentStep('duration');
        break;
      case 'calendar':
        setCurrentStep('details');
        break;
      case 'payment':
        setCurrentStep('calendar');
        break;
      default:
        router.push(`/advisors/${advisor.user_id}`);
    }
  };

  if (!advisor || !pricing) {
    const getUnavailableMessage = () => {
      if (!advisor) {
        return {
          icon: 'alert-circle',
          iconColor: 'text-destructive',
          title: translations.common.error,
          message: 'Unable to load booking information'
        };
      }

      switch (advisor.booking_status) {
        case 'calendar_setup_required':
          return {
            icon: 'clock',
            iconColor: 'text-blue-500',
            title: 'Available Soon',
            message: 'This advisor will be available for bookings soon. Please check back in a few hours.'
          };
        case 'not_accepting_bookings':
          return {
            icon: 'clock',
            iconColor: 'text-orange-500',
            title: 'Advisor Currently Unavailable',
            message: 'This advisor is currently unavailable for bookings. Please check back later or browse other available advisors.'
          };
        case 'available':
          return {
            icon: 'alert-circle',
            iconColor: 'text-destructive',
            title: translations.common.error,
            message: 'Unable to load pricing information'
          };
        default:
          return {
            icon: 'alert-circle',
            iconColor: 'text-destructive',
            title: translations.common.error,
            message: 'Unable to load booking information'
          };
      }
    };

    const unavailableInfo = getUnavailableMessage();

    return (
      <div className="min-h-screen bg-background pt-fixed-header">
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Icon
                name={unavailableInfo.icon as any}
                className={`h-12 w-12 mb-4 ${unavailableInfo.iconColor}`}
              />
              <h2 className="text-xl font-semibold mb-2">
                {unavailableInfo.title}
              </h2>
              <p className="text-muted-foreground mb-6 text-center">
                {unavailableInfo.message}
              </p>
              <div className="flex gap-4">
                <Button onClick={() => router.push(`/advisors/${advisor?.id}`)} variant="outline">
                  {translations.common.back}
                </Button>
                {advisor && (advisor.booking_status === 'not_accepting_bookings' || !advisor.is_accepting_bookings) ? (
                  <Button onClick={() => router.push('/advisors')}>
                    Browse Other Advisors
                  </Button>
                ) : (
                  <Button onClick={() => window.location.reload()}>
                    {translations.common.retry}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const selectedPricing = selectedDuration ? pricing.prices[`duration_${selectedDuration}`] : null;
  const isFreeConsultation = selectedPricing?.is_free || false;

  // Adjust steps based on whether consultation is free
  const allSteps: BookingStep[] = ['duration', 'details', 'calendar', 'payment', 'confirmation'];
  const visibleSteps = isFreeConsultation
    ? allSteps.filter(step => step !== 'payment')
    : allSteps;

  return (
    <div className="min-h-screen bg-background pt-fixed-header">
      {/* Header */}
      <div className="bg-blue-1200 dark:bg-blue-1200 border-b border-blue-1300 dark:border-blue-700">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <button
              onClick={() => router.push('/advisors')}
              className="hover:text-foreground transition-colors"
            >
              {translations.navigation.advisors}
            </button>
            <Icon name="chevron-right" className="h-4 w-4 ltr:block rtl:hidden" />
            <Icon name="chevron-left" className="h-4 w-4 rtl:block ltr:hidden" />
            <button
              onClick={() => router.push(`/advisors/${advisor.user_id}`)}
              className="hover:text-foreground transition-colors"
            >
              {advisor.display_name}
            </button>
            <Icon name="chevron-right" className="h-4 w-4 ltr:block rtl:hidden" />
            <Icon name="chevron-left" className="h-4 w-4 rtl:block ltr:hidden" />
            <span>{translations.consultations.book.title}</span>
          </div>

          <h1 className="text-3xl font-bold">{translations.consultations.book.title}</h1>

          {/* Progress Indicator */}
          <div className="flex items-center gap-4 mt-6">
            {visibleSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                  currentStep === step
                    ? "bg-primary text-primary-foreground"
                    : index < visibleSteps.indexOf(currentStep)
                      ? "bg-green-500 text-white"
                      : "bg-background text-foreground border-2 border-muted-foreground/30"
                )}>
                  {index < visibleSteps.indexOf(currentStep) ? (
                    <Icon name="check" className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < visibleSteps.length - 1 && (
                  <div className={cn(
                    "h-0.5 w-8 transition-colors",
                    index < visibleSteps.indexOf(currentStep)
                      ? "bg-green-500"
                      : "bg-muted"
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Mobile Advisor Header - Only shows on mobile/tablet, hidden on desktop */}
        <div className="block lg:hidden mb-6">
          <AdvisorCard
            advisor={advisor}
            translations={{
              rating: 'rating',
              reviews: 'reviews',
              bookNow: 'Book Now',
              viewProfile: 'View Profile',
              available: 'Available',
              busy: 'Busy'
            }}
            showBookingButton={false}
            showFullBio={false}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sidebar - appears first in RTL */}
          <div className="lg:order-2 rtl:lg:order-1 space-y-6">
            {/* Advisor Summary - Only shows on desktop, hidden on mobile/tablet */}
            <div className="hidden lg:block">
              <AdvisorCard
                advisor={advisor}
                translations={{
                  rating: 'rating',
                  reviews: 'reviews',
                  bookNow: 'Book Now',
                  viewProfile: 'View Profile',
                  available: 'Available',
                  busy: 'Busy'
                }}
                showBookingButton={false}
                showFullBio={false}
              />
            </div>

            {/* Booking Summary */}
            {selectedDuration && selectedPricing && (
              <Card>
                <CardHeader>
                  <CardTitle>Booking Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span>Duration</span>
                    <span>{selectedDuration} {translations.labels.minutes}</span>
                  </div>
                  {selectedDateTime && (
                    <div className="flex justify-between">
                      <span>Date & Time</span>
                      <span className="text-sm">
                        {new Date(selectedDateTime).toLocaleString(locale)}
                      </span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-medium">
                    <span>Total</span>
                    <span>{selectedPricing.display}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Policies */}
            <Card>
              <CardHeader>
                <CardTitle>{translations.consultations.book.policies.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Icon name="clock" className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>{translations.consultations.book.policies.cancellation}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Icon name="shield-check" className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span>{translations.consultations.book.policies.ownership}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Icon name="credit-card" className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span>{translations.consultations.book.policies.refund}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 lg:order-1 rtl:lg:order-2">
            {currentStep === 'duration' && pricing && (
              <DurationSelectionStep
                pricing={pricing}
                translations={translations}
                onSelect={handleDurationSelect}
              />
            )}

            {currentStep === 'duration' && !pricing && (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-4">
                    <Icon name="loader-2" className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Loading pricing information...</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStep === 'details' && (
              <ConsultationDetailsStep
                consultationNotes={consultationNotes}
                onNotesChange={setConsultationNotes}
                projectId={projectId}
                translations={translations}
                onNext={handleDetailsNext}
                onBack={handleBackStep}
              />
            )}

            {currentStep === 'calendar' && selectedDuration && (
              <CalendarSelectionStep
                advisor={advisor}
                duration={selectedDuration}
                translations={translations}
                onSelect={handleCalendarSelect}
                onBack={handleBackStep}
              />
            )}

            {currentStep === 'payment' && (
              <PaymentStep
                consultationId={consultationId}
                clientSecret={clientSecret}
                pricing={selectedPricing}
                loading={bookingLoading}
                error={bookingError}
                translations={translations}
                onSubmit={handleBookingSubmit}
                onSuccess={handlePaymentSuccess}
                onBack={handleBackStep}
              />
            )}

            {currentStep === 'confirmation' && (
              <ConfirmationStep
                advisor={advisor}
                duration={selectedDuration}
                dateTime={selectedDateTime}
                pricing={selectedPricing}
                consultationId={consultationId}
                translations={translations}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Step Components
function DurationSelectionStep({
  pricing,
  translations,
  onSelect
}: {
  pricing: LocalizedPricing;
  translations: any;
  onSelect: (duration: ConsultationDuration) => void;
}) {
  const durations = [15, 30, 60] as const;

  if (!pricing?.prices) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{translations.consultations.book.selectDuration}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <Icon name="alert-circle" className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">Pricing information unavailable</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const availableDurations = durations.filter(duration =>
    pricing.prices[`duration_${duration}`]
  );

  if (availableDurations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{translations.consultations.book.selectDuration}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <Icon name="clock" className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">No consultation options available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{translations.consultations.book.selectDuration}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {availableDurations.map((duration) => {
          const priceInfo = pricing.prices[`duration_${duration}`];
          const isFree = priceInfo.is_free || false;
          // We already filtered for availability above, so this should exist

          return (
            <button
              key={duration}
              onClick={() => onSelect(duration)}
              className={cn(
                "w-full p-4 border rounded-lg hover:shadow-md transition-all text-left",
                isFree
                  ? "border-green-500 hover:border-green-400 bg-green-500/20 dark:bg-green-500/30 hover:bg-green-500/30 dark:hover:bg-green-500/40"
                  : "hover:border-primary"
              )}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">{translations.durations[duration as keyof typeof translations.durations]}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {translations.consultations.book.pricing.descriptions[`${duration}min` as '15min' | '30min' | '60min']}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    {isFree && (
                      <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 text-xs">
                        {translations.labels.free}
                      </Badge>
                    )}
                    <div className={cn(
                      "text-lg font-semibold",
                      isFree && "text-green-600 dark:text-green-400"
                    )}>
                      {priceInfo.display}
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ConsultationDetailsStep({
  consultationNotes,
  onNotesChange,
  projectId,
  translations,
  onNext,
  onBack
}: {
  consultationNotes: string;
  onNotesChange: (notes: string) => void;
  projectId?: string;
  translations: any;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Consultation Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="notes">{translations.consultations.book.form.notes.label}</Label>
          <Textarea
            id="notes"
            placeholder={translations.consultations.book.form.notes.placeholder}
            data-testid="session-description"
            value={consultationNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={4}
          />
          <p className="text-sm text-muted-foreground">
            {translations.consultations.book.form.notes.help}
          </p>
        </div>

        {projectId && (
          <Alert>
            <Icon name="link" className="h-4 w-4" />
            <AlertDescription>
              This consultation will be linked to your SheenApps project.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-4">
          <Button onClick={onBack} variant="outline">
            {translations.common.back}
          </Button>
          <Button onClick={onNext}>
            {translations.common.continue}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CalendarSelectionStep({
  advisor,
  duration,
  translations,
  onSelect,
  onBack
}: {
  advisor: Advisor;
  duration: ConsultationDuration;
  translations: any;
  onSelect: (dateTime: string, bookingId?: string) => void;
  onBack: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{translations.consultations.book.selectTime}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <CalComEmbed
          advisorId={advisor.user_id}
          duration={duration}
          calComUrl={advisor.cal_com_event_type_url}
          onSelect={onSelect}
        />

        <div className="flex gap-4">
          <Button onClick={onBack} variant="outline">
            {translations.common.back}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentStep({
  consultationId,
  clientSecret,
  pricing,
  loading,
  error,
  translations,
  onSubmit,
  onSuccess,
  onBack
}: {
  consultationId: string | null;
  clientSecret: string | null;
  pricing: any;
  loading: boolean;
  error: string | null;
  translations: any;
  onSubmit: () => void;
  onSuccess: () => void;
  onBack: () => void;
}) {
  if (!consultationId) {
    // First booking submission
    return (
      <Card>
        <CardHeader>
          <CardTitle>Confirm Booking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <Icon name="alert-circle" className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-4">
            <Button onClick={onBack} variant="outline" disabled={loading}>
              {translations.common.back}
            </Button>
            <Button 
              onClick={onSubmit} 
              disabled={loading}
              data-testid="confirm-booking-button"
            >
              {loading ? translations.consultations.book.payment.processing : 'Book Consultation'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (clientSecret) {
    // Payment required
    return (
      <Card>
        <CardHeader>
          <CardTitle>{translations.consultations.book.payment.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentForm
            clientSecret={clientSecret}
            amount={pricing?.amount_cents || 0}
            currency={pricing?.currency || 'USD'}
            onSuccess={onSuccess}
            translations={translations}
          />
        </CardContent>
      </Card>
    );
  }

  // No payment required, auto-proceed to confirmation
  return null;
}

function ConfirmationStep({
  advisor,
  duration,
  dateTime,
  pricing,
  consultationId,
  translations
}: {
  advisor: Advisor | null;
  duration: ConsultationDuration | null;
  dateTime: string | null;
  pricing: any;
  consultationId: string | null;
  translations: any;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-green-600 dark:text-green-400 flex items-center gap-2">
          <Icon name="check-circle" className="h-6 w-6" />
          {translations.consultations.book.confirmation.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h3 className="font-medium">{translations.consultations.book.confirmation.details}</h3>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{translations.consultations.book.confirmation.advisor}:</span>
              <div className="font-medium">{advisor?.display_name}</div>
            </div>

            <div>
              <span className="text-muted-foreground">{translations.consultations.book.confirmation.duration}:</span>
              <div className="font-medium">{duration} {translations.labels.minutes}</div>
            </div>

            {dateTime && (
              <div className="col-span-2">
                <span className="text-muted-foreground">{translations.consultations.book.confirmation.dateTime}:</span>
                <div className="font-medium">{new Date(dateTime).toLocaleString()}</div>
              </div>
            )}

            {pricing && (
              <div>
                <span className="text-muted-foreground">{translations.consultations.book.confirmation.price}:</span>
                <div className="font-medium">{pricing.display}</div>
              </div>
            )}
          </div>
        </div>

        <Alert>
          <Icon name="mail" className="h-4 w-4" />
          <AlertDescription>
            {translations.consultations.book.confirmation.email}
          </AlertDescription>
        </Alert>

        <div className="flex gap-4">
          <Button asChild className="flex-1">
            <Link href="/consultations">View My Consultations</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href="/advisors">Browse More Advisors</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
