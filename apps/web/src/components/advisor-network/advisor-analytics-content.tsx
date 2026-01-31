'use client'

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store';
import { useAdvisorAnalyticsQuery } from '@/hooks/use-advisor-dashboard-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/dashboard-utils';
import type { AnalyticsFilters } from '@/types/advisor-dashboard';

// Dynamic imports for charts to avoid bundle bloat (expert recommendation)
const BarChart = dynamic(() => import('@/components/ui/charts').then(mod => ({ default: mod.BarChart })), {
  ssr: false,
  loading: () => <div className="h-64 bg-muted animate-pulse rounded" />
});

const LineChart = dynamic(() => import('@/components/ui/charts').then(mod => ({ default: mod.LineChart })), {
  ssr: false,
  loading: () => <div className="h-64 bg-muted animate-pulse rounded" />
});

const PieChart = dynamic(() => import('@/components/ui/charts').then(mod => ({ default: mod.PieChart })), {
  ssr: false,
  loading: () => <div className="h-64 bg-muted animate-pulse rounded" />
});

interface AdvisorAnalyticsContentProps {
  translations: {
    advisor: {
      dashboard: {
        analytics: {
          title: string;
          overview: string;
          consultations: string;
          earnings: string;
          performance: string;
          trends: string;
          period: {
            '30d': string;
            '90d': string;
            '1y': string;
          };
          metrics: {
            totalConsultations: string;
            totalEarnings: string;
            averageRating: string;
            profileViews: string;
            conversionRate: string;
            freeConsultations: string;
            paidConsultations: string;
            consultationGrowth: string;
            earningsGrowth: string;
          };
          charts: {
            consultationsByDuration: string;
            consultationsByType: string;
            earningsOverTime: string;
            ratingsTrend: string;
          };
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
      noData: string;
    };
  };
  locale: string;
}

type PeriodFilter = '30d' | '90d' | '1y';

export function AdvisorAnalyticsContent({ translations, locale }: AdvisorAnalyticsContentProps) {
  const { user, isAuthenticated } = useAuthStore();
  const [period, setPeriod] = useState<PeriodFilter>('30d');

  // Analytics query with period filtering
  const {
    data: analytics,
    isLoading,
    error,
    refetch
  } = useAdvisorAnalyticsQuery(
    user?.id,
    { period },
    locale
  );

  // Helper functions with locale support
  const formatCurrencyLocale = (amountCents: number) => {
    return formatCurrency(amountCents, locale);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat(locale).format(num);
  };

  const formatPercentage = (num: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(num / 100);
  };

  // Transform data for charts
  const chartData = useMemo(() => {
    if (!analytics || typeof analytics !== 'object') return null;
    
    const analyticsData = analytics as any; // Type assertion for analytics data
    if (!analyticsData.consultations || !analyticsData.consultations.by_duration) return null;

    return {
      consultationsByDuration: Object.entries(analyticsData.consultations.by_duration).map(([duration, count]) => ({
        duration: `${duration} min`,
        count,
        label: `${duration} minutes`
      })),
      consultationsByType: [
        { name: 'Free', value: analyticsData.consultations?.by_type?.free || 0, color: '#10b981' },
        { name: 'Paid', value: analyticsData.consultations?.by_type?.paid || 0, color: '#3b82f6' }
      ],
      earningsOverTime: (analyticsData.earnings?.by_month || []).map((month: any) => ({
        month: formatDate(month.month + '-01', locale, { month: 'short', year: 'numeric' }),
        earnings: month.earnings_cents / 100,
        formattedEarnings: formatCurrencyLocale(month.earnings_cents)
      }))
    };
  }, [analytics, locale]);

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
            <h2 className="text-xl font-semibold mb-2">Unable to load analytics</h2>
            <p className="text-muted-foreground mb-6 text-center">{error.toString()}</p>
            <Button onClick={() => refetch()}>
              {translations.common.retry}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon name="bar-chart-3" className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No analytics data</h2>
            <p className="text-muted-foreground">{translations.common.noData}</p>
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
          <span className="text-foreground">{translations.advisor.dashboard.navigation.analytics}</span>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {translations.advisor.dashboard.analytics.title}
            </h1>
            <p className="text-muted-foreground">
              {translations.advisor.dashboard.analytics.overview} ({formatDate(analytics.period.start, locale)} - {formatDate(analytics.period.end, locale)})
            </p>
          </div>
          
          {/* Period Filter */}
          <Select value={period} onValueChange={(value: PeriodFilter) => setPeriod(value)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">{translations.advisor.dashboard.analytics.period['30d']}</SelectItem>
              <SelectItem value="90d">{translations.advisor.dashboard.analytics.period['90d']}</SelectItem>
              <SelectItem value="1y">{translations.advisor.dashboard.analytics.period['1y']}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Consultations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.advisor.dashboard.analytics.metrics.totalConsultations}
            </CardTitle>
            <Icon name="calendar" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(analytics.consultations.total)}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.trends.consultation_growth}
            </p>
          </CardContent>
        </Card>

        {/* Total Earnings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.advisor.dashboard.analytics.metrics.totalEarnings}
            </CardTitle>
            <Icon name="dollar-sign" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrencyLocale(analytics.earnings.total_cents)}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.trends.earnings_growth}
            </p>
          </CardContent>
        </Card>

        {/* Average Rating */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.advisor.dashboard.analytics.metrics.averageRating}
            </CardTitle>
            <Icon name="star" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-1">
              {analytics.performance.reviews.average.toFixed(1)}
              <Icon name="star" className="h-4 w-4 text-yellow-500 fill-current" />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(analytics.performance.reviews.count)} reviews
            </p>
          </CardContent>
        </Card>

        {/* Profile Views */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {translations.advisor.dashboard.analytics.metrics.profileViews}
            </CardTitle>
            <Icon name="eye" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(analytics.performance.profile_views)}</div>
            <p className="text-xs text-muted-foreground">
              {translations.advisor.dashboard.analytics.period[period].toLowerCase()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Consultations by Duration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="clock" className="h-5 w-5" />
              {translations.advisor.dashboard.analytics.charts.consultationsByDuration}
            </CardTitle>
            <CardDescription>
              Distribution of consultation lengths
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData?.consultationsByDuration && chartData.consultationsByDuration.length > 0 ? (
              <BarChart
                data={chartData.consultationsByDuration}
                xKey="duration"
                yKey="count"
                className="h-64"
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                {translations.common.noData}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Consultations by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="bar-chart-3" className="h-5 w-5" />
              {translations.advisor.dashboard.analytics.charts.consultationsByType}
            </CardTitle>
            <CardDescription>
              Free vs paid consultation ratio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="text-sm">
                    {translations.advisor.dashboard.analytics.metrics.freeConsultations}: {analytics.consultations.by_type.free}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full" />
                  <span className="text-sm">
                    {translations.advisor.dashboard.analytics.metrics.paidConsultations}: {analytics.consultations.by_type.paid}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {formatPercentage(analytics.consultations.conversion_rate)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {translations.advisor.dashboard.analytics.metrics.conversionRate}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Earnings Over Time */}
        {chartData?.earningsOverTime && chartData.earningsOverTime.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="trending-up" className="h-5 w-5" />
                {translations.advisor.dashboard.analytics.charts.earningsOverTime}
              </CardTitle>
              <CardDescription>
                Monthly earnings progression
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LineChart
                data={chartData.earningsOverTime}
                xKey="month"
                yKey="earnings"
                className="h-64"
                formatValue={(value) => formatCurrencyLocale(value * 100)}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}