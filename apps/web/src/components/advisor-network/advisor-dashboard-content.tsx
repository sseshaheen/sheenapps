'use client'

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { getMyAdvisorProfileAction, updateAdvisorAvailabilityAction } from '@/lib/actions/advisor-actions';
import { useAdvisorOverviewQuery, useAdvisorConsultationsQuery } from '@/hooks/use-advisor-dashboard-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { Advisor } from '@/types/advisor-network';
import { logger } from '@/utils/logger';

interface AdvisorDashboardContentProps {
  translations: {
    advisor: {
      dashboard: {
        title: string;
        welcome: string;
        earnings: {
          title: string;
          thisMonth: string;
          lastMonth: string;
          lifetime: string;
          pendingPayout: string;
          nextPayout: string;
          consultations: string;
        };
        availability: {
          title: string;
          accepting: string;
          paused: string;
          toggle: string;
        };
        onboarding: {
          title: string;
          stripe: string;
          calcom: string;
          profile: string;
        };
        consultations: {
          title: string;
          empty: string;
          viewAll: string;
          free: string;
          paid: string;
        };
      };
    };
    common: {
      loading: string;
      error: string;
      retry: string;
    };
  };
  locale: string;
}

interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  completed: boolean;
  action?: string;
  href?: string;
}

interface EarningsData {
  thisMonth: number;
  lastMonth: number;
  lifetime: number;
  pendingPayout: number;
  nextPayoutDate: string;
  consultationsThisMonth: number;
}

export function AdvisorDashboardContent({ translations, locale }: AdvisorDashboardContentProps) {
  const { user, isAuthenticated } = useAuthStore();
  
  const [advisor, setAdvisor] = useState<Advisor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availabilityToggling, setAvailabilityToggling] = useState(false);

  // Real API data using React Query hooks
  const {
    data: dashboardOverview,
    isLoading: overviewLoading,
    error: overviewError
  } = useAdvisorOverviewQuery(user?.id, locale);

  const {
    data: consultationsData,
    isLoading: consultationsLoading,
    error: consultationsError
  } = useAdvisorConsultationsQuery(user?.id, { status: 'upcoming', limit: 5 }, locale);

  // Load advisor profile
  useEffect(() => {
    async function loadAdvisorProfile() {
      if (!isAuthenticated || !user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        logger.info('📊 Loading advisor profile for dashboard', { userId: user.id.slice(0, 8) });
        
        const result = await getMyAdvisorProfileAction();
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to load advisor profile');
        }

        if (!result.data) {
          throw new Error('No advisor data received');
        }

        setAdvisor(result.data);
        logger.info('✅ Advisor profile loaded for dashboard', { 
          name: result.data.display_name,
          status: result.data.approval_status,
          accepting: result.data.is_accepting_bookings
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load advisor profile';
        setError(errorMessage);
        logger.error('❌ Failed to load advisor profile for dashboard:', error);
      } finally {
        setLoading(false);
      }
    }

    loadAdvisorProfile();
  }, [isAuthenticated, user]);

  // Handle availability toggle
  const handleAvailabilityToggle = async (accepting: boolean) => {
    if (!advisor) return;

    setAvailabilityToggling(true);
    
    try {
      logger.info('🔄 Toggling advisor availability', { accepting });
      
      const result = await updateAdvisorAvailabilityAction(accepting);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update availability');
      }

      // Update local state
      setAdvisor(prev => prev ? { ...prev, is_accepting_bookings: accepting } : null);
      
      logger.info('✅ Advisor availability updated', { accepting });

    } catch (error) {
      logger.error('❌ Failed to update advisor availability:', error);
      // Show error to user - in a real app you'd use a toast or notification
      alert('Failed to update availability. Please try again.');
    } finally {
      setAvailabilityToggling(false);
    }
  };

  // Calculate onboarding progress
  const getOnboardingSteps = (): OnboardingStep[] => {
    if (!advisor) return [];

    return [
      {
        key: 'stripe',
        label: translations.advisor.dashboard.onboarding.stripe,
        description: 'Connect your Stripe account to receive payments',
        completed: !!advisor.stripe_account_id,
        action: 'Connect Stripe',
        href: '/advisor/settings/payments'
      },
      {
        key: 'calcom',
        label: translations.advisor.dashboard.onboarding.calcom,
        description: 'Set up your Cal.com integration for booking management',
        completed: !!advisor.cal_com_event_type_url,
        action: 'Setup Calendar',
        href: '/advisor/settings/calendar'
      },
      {
        key: 'profile',
        label: translations.advisor.dashboard.onboarding.profile,
        description: 'Complete your profile with bio, skills, and pricing',
        completed: !!(advisor.bio && advisor.skills.length > 0 && advisor.hourly_rate),
        action: 'Complete Profile',
        href: '/advisor/profile'
      }
    ];
  };

  const onboardingSteps = getOnboardingSteps();
  const completedSteps = onboardingSteps.filter(step => step.completed).length;
  const onboardingProgress = onboardingSteps.length > 0 ? (completedSteps / onboardingSteps.length) * 100 : 0;

  // Show loading state for critical data
  if (loading || overviewLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="flex flex-col items-center gap-4">
            <Icon name="loader-2" className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{translations.common.loading}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state for critical failures
  const criticalError = error || overviewError;
  if (criticalError || !advisor) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon name="alert-circle" className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Unable to load dashboard</h2>
            <p className="text-muted-foreground mb-6 text-center">
              {criticalError?.toString() || error || 'Dashboard data unavailable'}
            </p>
            <Button onClick={() => window.location.reload()}>
              {translations.common.retry}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Helper functions with locale support
  const formatCurrency = (amountCents: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amountCents / 100);
  };
  
  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(new Date(dateString));
  };

  // Use real API data or fallback to existing patterns
  const earningsData = dashboardOverview ? {
    thisMonth: dashboardOverview.current_month.earnings_cents,
    consultationsThisMonth: dashboardOverview.current_month.total_consultations,
    freeConsultations: dashboardOverview.current_month.free_consultations,
    upcomingConsultations: dashboardOverview.current_month.upcoming_consultations,
    lifetimeEarnings: dashboardOverview.quick_stats.lifetime_earnings_cents,
    lifetimeConsultations: dashboardOverview.quick_stats.total_lifetime_consultations,
    profileViews: dashboardOverview.quick_stats.profile_views_this_month
  } : null;

  const upcomingConsultations = consultationsData?.consultations || [];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{translations.advisor.dashboard.title}</h1>
        <p className="text-muted-foreground">
          {translations.advisor.dashboard.welcome}, {advisor.display_name}!
        </p>
      </div>

      {/* Approval Status Banner */}
      {advisor.approval_status !== 'approved' && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/50">
          <CardContent className="flex items-center gap-4 py-4">
            <Icon name="clock" className="h-5 w-5 text-orange-600" />
            <div className="flex-1">
              <p className="font-medium text-orange-900 dark:text-orange-100">
                Application Under Review
              </p>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Your advisor application is being reviewed. You'll be notified once approved.
              </p>
            </div>
            <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
              {advisor.approval_status}
            </Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Availability Toggle */}
        <Card className={cn(
          "transition-colors",
          advisor.is_accepting_bookings ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/50" : ""
        )}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.advisor.dashboard.availability.title}
            </CardTitle>
            <Icon 
              name={advisor.is_accepting_bookings ? "check-circle" : "pause-circle"} 
              className={cn(
                "h-4 w-4",
                advisor.is_accepting_bookings ? "text-green-600" : "text-gray-400"
              )}
            />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Switch
                checked={advisor.is_accepting_bookings}
                onCheckedChange={handleAvailabilityToggle}
                disabled={availabilityToggling || advisor.approval_status !== 'approved'}
              />
              <label className="text-sm font-medium">
                {advisor.is_accepting_bookings 
                  ? translations.advisor.dashboard.availability.accepting
                  : translations.advisor.dashboard.availability.paused
                }
              </label>
            </div>
            {advisor.approval_status !== 'approved' && (
              <p className="text-xs text-muted-foreground mt-2">
                Available after approval
              </p>
            )}
          </CardContent>
        </Card>

        {/* This Month Earnings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.advisor.dashboard.earnings.thisMonth}
            </CardTitle>
            <Icon name="dollar-sign" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {earningsData ? (
              <>
                <div className="text-2xl font-bold">{formatCurrency(earningsData.thisMonth)}</div>
                <p className="text-xs text-muted-foreground">
                  {earningsData.consultationsThisMonth} {translations.advisor.dashboard.earnings.consultations}
                  {earningsData.freeConsultations > 0 && (
                    <span className="text-green-600 ms-2">
                      ({earningsData.freeConsultations} free)
                    </span>
                  )}
                </p>
              </>
            ) : overviewLoading ? (
              <div className="flex items-center">
                <Icon name="loader-2" className="h-4 w-4 animate-spin me-2" />
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <div className="text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>

        {/* Lifetime Earnings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.advisor.dashboard.earnings.lifetime}
            </CardTitle>
            <Icon name="trending-up" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {earningsData ? (
              <>
                <div className="text-2xl font-bold">{formatCurrency(earningsData.lifetimeEarnings)}</div>
                <p className="text-xs text-muted-foreground">
                  {earningsData.lifetimeConsultations} total consultations
                </p>
              </>
            ) : overviewLoading ? (
              <div className="flex items-center">
                <Icon name="loader-2" className="h-4 w-4 animate-spin me-2" />
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <div className="text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>

        {/* Profile Views */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Profile Views
            </CardTitle>
            <Icon name="eye" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {earningsData ? (
              <>
                <div className="text-2xl font-bold">{earningsData.profileViews.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  This month
                </p>
              </>
            ) : overviewLoading ? (
              <div className="flex items-center">
                <Icon name="loader-2" className="h-4 w-4 animate-spin me-2" />
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <div className="text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Onboarding Progress */}
        {onboardingProgress < 100 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="list-checks" className="h-5 w-5" />
                {translations.advisor.dashboard.onboarding.title}
              </CardTitle>
              <CardDescription>
                Complete your setup to start accepting consultations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {completedSteps} of {onboardingSteps.length} completed
                </span>
                <span className="text-sm text-muted-foreground">
                  {Math.round(onboardingProgress)}%
                </span>
              </div>
              <Progress value={onboardingProgress} className="w-full" />
              
              <div className="space-y-3">
                {onboardingSteps.map((step) => (
                  <div key={step.key} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      {step.completed ? (
                        <Icon name="check-circle" className="h-5 w-5 text-green-600" />
                      ) : (
                        <Icon name="circle" className="h-5 w-5 text-gray-400" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{step.label}</p>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                    {!step.completed && step.action && step.href && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={step.href}>{step.action}</a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Consultations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="calendar" className="h-5 w-5" />
              {translations.advisor.dashboard.consultations.title}
            </CardTitle>
            <CardDescription>
              Your next scheduled consultations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {consultationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Icon name="loader-2" className="h-6 w-6 animate-spin me-2" />
                <span className="text-muted-foreground">Loading consultations...</span>
              </div>
            ) : consultationsError ? (
              <div className="text-center py-6">
                <Icon name="alert-circle" className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">
                  Failed to load consultations
                </p>
              </div>
            ) : upcomingConsultations.length > 0 ? (
              <div className="space-y-4">
                {upcomingConsultations.map((consultation, index) => (
                  <div key={consultation.id}>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{consultation.client_name}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Icon name="clock" className="h-3 w-3" />
                            {new Date(consultation.start_time).toLocaleString(locale, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Icon name="timer" className="h-3 w-3" />
                            {consultation.duration_minutes}min
                          </span>
                          <span className="flex items-center gap-1">
                            <Icon name="circle" className={cn(
                              "h-2 w-2 fill-current",
                              consultation.status === 'scheduled' ? "text-blue-500" :
                              consultation.status === 'completed' ? "text-green-500" :
                              "text-gray-500"
                            )} />
                            {consultation.status}
                          </span>
                        </div>
                        {consultation.advisor_notes && (
                          <p className="text-xs text-muted-foreground italic">
                            {consultation.advisor_notes}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={consultation.is_free_consultation ? "secondary" : "default"}>
                          {consultation.is_free_consultation ? translations.advisor.dashboard.consultations.free : translations.advisor.dashboard.consultations.paid}
                        </Badge>
                        {consultation.cal_booking_url && (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" asChild>
                            <a href={consultation.cal_booking_url} target="_blank" rel="noopener noreferrer">
                              <Icon name="external-link" className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                    {index < upcomingConsultations.length - 1 && <Separator className="mt-4" />}
                  </div>
                ))}
                <div className="pt-2">
                  <Button variant="outline" className="w-full" size="sm" asChild>
                    <a href={`/${locale}/advisor/consultations`}>
                      {translations.advisor.dashboard.consultations.viewAll}
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <Icon name="calendar-off" className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">
                  {translations.advisor.dashboard.consultations.empty}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      {advisor.approval_status === 'approved' && (
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Manage your advisor profile and settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" asChild>
                <a href={`/${locale}/advisor/profile`}>
                  <Icon name="user" className="h-4 w-4 me-2" />
                  Edit Profile
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/${locale}/advisor/dashboard/consultations`}>
                  <Icon name="calendar" className="h-4 w-4 me-2" />
                  View Consultations
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/${locale}/advisor/dashboard/analytics`}>
                  <Icon name="bar-chart-3" className="h-4 w-4 me-2" />
                  Analytics
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/${locale}/advisor/dashboard/availability`}>
                  <Icon name="clock" className="h-4 w-4 me-2" />
                  Availability
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/${locale}/advisor/dashboard/settings`}>
                  <Icon name="settings" className="h-4 w-4 me-2" />
                  Settings
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}