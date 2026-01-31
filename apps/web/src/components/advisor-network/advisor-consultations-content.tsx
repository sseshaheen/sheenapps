'use client'

import { useState } from 'react';
import { useAuthStore } from '@/store';
import { useAdvisorConsultationsInfiniteQuery } from '@/hooks/use-advisor-dashboard-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { dedupePages } from '@/lib/dashboard-utils';
import type { AdvisorConsultation } from '@/types/advisor-dashboard';

interface AdvisorConsultationsContentProps {
  translations: {
    advisor: {
      dashboard: {
        consultations: {
          title: string;
          upcoming: string;
          completed: string;
          all: string;
          empty: string;
          client: string;
          duration: string;
          status: string;
          scheduled: string;
          free: string;
          paid: string;
          viewDetails: string;
          notes: string;
          addNotes: string;
          loadMore: string;
        };
        navigation: {
          overview: string;
          consultations: string;
          analytics: string;
          availability: string;
          settings: string;
        };
      };
    };
    common: {
      loading: string;
      error: string;
      retry: string;
      save: string;
      cancel: string;
    };
  };
  locale: string;
}

type StatusFilter = 'upcoming' | 'completed' | 'all';

export function AdvisorConsultationsContent({ translations, locale }: AdvisorConsultationsContentProps) {
  const { user, isAuthenticated } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('upcoming');

  // Infinite query for consultations with pagination
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useAdvisorConsultationsInfiniteQuery(
    user?.id,
    { status: statusFilter, limit: 10 },
    locale
  );

  // Flatten and dedupe pages
  const allConsultations = data ? dedupePages((data as any).pages.map((page: any) => page.consultations).flat()) : [];

  // Helper functions
  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'scheduled': return 'default';
      case 'completed': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  // Show loading state
  if (isLoading) {
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

  // Show error state
  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon name="alert-circle" className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Unable to load consultations</h2>
            <p className="text-muted-foreground mb-6 text-center">{error.toString()}</p>
            <Button onClick={() => window.location.reload()}>
              {translations.common.retry}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Navigation */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <a href={`/${locale}/advisor/dashboard`} className="hover:text-foreground">
            {translations.advisor.dashboard.navigation.overview}
          </a>
          <Icon name="chevron-right" className="h-4 w-4" />
          <span className="text-foreground">{translations.advisor.dashboard.navigation.consultations}</span>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {translations.advisor.dashboard.consultations.title}
            </h1>
            <p className="text-muted-foreground">
              View and manage your consultation history
            </p>
          </div>
          
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">{translations.advisor.dashboard.consultations.upcoming}</SelectItem>
              <SelectItem value="completed">{translations.advisor.dashboard.consultations.completed}</SelectItem>
              <SelectItem value="all">{translations.advisor.dashboard.consultations.all}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Consultations List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="calendar" className="h-5 w-5" />
            {statusFilter === 'upcoming' ? translations.advisor.dashboard.consultations.upcoming :
             statusFilter === 'completed' ? translations.advisor.dashboard.consultations.completed :
             translations.advisor.dashboard.consultations.all} Consultations
          </CardTitle>
          <CardDescription>
            {allConsultations.length === 0 ? 
              'No consultations found for the selected filter' :
              `${allConsultations.length} consultation${allConsultations.length === 1 ? '' : 's'} found`
            }
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {allConsultations.length > 0 ? (
            <div className="space-y-4">
              {allConsultations.map((consultation: AdvisorConsultation, index: number) => (
                <div key={consultation.id}>
                  <div className="flex items-start justify-between p-4 rounded-lg border">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <p className="font-medium">{consultation.client_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDateTime(consultation.start_time)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={getStatusBadgeVariant(consultation.status)}>
                            {consultation.status}
                          </Badge>
                          <Badge variant={consultation.is_free_consultation ? "secondary" : "default"}>
                            {consultation.is_free_consultation 
                              ? translations.advisor.dashboard.consultations.free 
                              : translations.advisor.dashboard.consultations.paid}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Icon name="timer" className="h-4 w-4" />
                          {consultation.duration_minutes}min
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="user" className="h-4 w-4" />
                          {translations.advisor.dashboard.consultations.client}: {consultation.client_name}
                        </span>
                      </div>

                      {consultation.advisor_notes && (
                        <div className="pt-2">
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium">{translations.advisor.dashboard.consultations.notes}:</span> {consultation.advisor_notes}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 ms-4">
                      {consultation.cal_booking_url && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={consultation.cal_booking_url} target="_blank" rel="noopener noreferrer">
                            <Icon name="external-link" className="h-4 w-4 me-2" />
                            Join Call
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm">
                        <Icon name="more-horizontal" className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {index < allConsultations.length - 1 && <div className="my-2" />}
                </div>
              ))}

              {/* Load More Button */}
              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Icon name="loader-2" className="h-4 w-4 me-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Icon name="chevron-down" className="h-4 w-4 me-2" />
                        {translations.advisor.dashboard.consultations.loadMore}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Icon name="calendar-off" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No consultations found</h3>
              <p className="text-muted-foreground mb-4">
                {statusFilter === 'upcoming' && 'You have no upcoming consultations.'}
                {statusFilter === 'completed' && 'You have no completed consultations yet.'}
                {statusFilter === 'all' && 'You have no consultations yet.'}
              </p>
              {statusFilter === 'upcoming' && (
                <Button variant="outline" asChild>
                  <a href={`/${locale}/advisor/dashboard/availability`}>
                    <Icon name="clock" className="h-4 w-4 me-2" />
                    Set Availability
                  </a>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}