/**
 * React Query hooks for Advisor Dashboard
 * Follows existing patterns from use-projects-query.ts
 * Uses stable query keys and dashboard utilities
 */

'use client';

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { advisorKeys, dashboardQueryDefaults, handleQueryError } from '@/lib/dashboard-utils';
import type {
  AdvisorOverview,
  AdvisorConsultationsResponse,
  AdvisorAvailability,
  AdvisorAnalytics,
  AdvisorPricingSettings,
  ConsultationFilters,
  AnalyticsFilters
} from '@/types/advisor-dashboard';
import { logger } from '@/utils/logger';

// ==========================================
// Server Actions (will be created)
// ==========================================

// These will be server actions that call the AdvisorAPIClient
async function fetchAdvisorOverview(userId: string, locale?: string): Promise<AdvisorOverview> {
  const { getAdvisorOverview } = await import('@/lib/actions/advisor-dashboard-actions');
  return getAdvisorOverview(userId, locale);
}

async function fetchAdvisorConsultations(
  userId: string, 
  filters: ConsultationFilters, 
  locale?: string
): Promise<AdvisorConsultationsResponse> {
  const { getAdvisorConsultations } = await import('@/lib/actions/advisor-dashboard-actions');
  return getAdvisorConsultations(userId, filters, locale);
}

async function fetchAdvisorAnalytics(
  userId: string, 
  filters: AnalyticsFilters, 
  locale?: string
): Promise<AdvisorAnalytics> {
  const { getAdvisorAnalytics } = await import('@/lib/actions/advisor-dashboard-actions');
  return getAdvisorAnalytics(userId, filters, locale);
}

async function fetchAdvisorAvailability(userId: string, locale?: string): Promise<AdvisorAvailability> {
  const { getAdvisorAvailability } = await import('@/lib/actions/advisor-dashboard-actions');
  return getAdvisorAvailability(userId, locale);
}

async function updateAdvisorAvailability(
  availability: AdvisorAvailability,
  userId: string, 
  locale?: string
): Promise<AdvisorAvailability> {
  const { updateAdvisorAvailability } = await import('@/lib/actions/advisor-dashboard-actions');
  return updateAdvisorAvailability(availability, userId, locale);
}

async function fetchAdvisorPricingSettings(userId: string, locale?: string): Promise<AdvisorPricingSettings> {
  const { getAdvisorPricingSettings } = await import('@/lib/actions/advisor-dashboard-actions');
  return getAdvisorPricingSettings(userId, locale);
}

async function updateAdvisorPricingSettings(
  settings: AdvisorPricingSettings,
  userId: string, 
  locale?: string
): Promise<AdvisorPricingSettings> {
  const { updateAdvisorPricingSettings } = await import('@/lib/actions/advisor-dashboard-actions');
  return updateAdvisorPricingSettings(settings, userId, locale);
}

// ==========================================
// Query Hooks
// ==========================================

/**
 * Get advisor dashboard overview
 */
export function useAdvisorOverviewQuery(userId?: string, locale?: string) {
  const { isAuthenticated, user } = useAuthStore();
  
  return useQuery({
    queryKey: advisorKeys.overview(userId || '', locale || 'en'),
    queryFn: () => fetchAdvisorOverview(userId!, locale),
    enabled: isAuthenticated && Boolean(userId),
    ...dashboardQueryDefaults
  });
}

/**
 * Get advisor consultations with cursor-based pagination
 */
export function useAdvisorConsultationsQuery(
  userId?: string, 
  filters: ConsultationFilters = {},
  locale?: string
) {
  const { isAuthenticated } = useAuthStore();
  
  return useQuery({
    queryKey: advisorKeys.consultations(userId || '', locale || 'en', filters),
    queryFn: () => fetchAdvisorConsultations(userId!, filters, locale),
    enabled: isAuthenticated && Boolean(userId),
    ...dashboardQueryDefaults
  });
}

/**
 * Infinite query for advisor consultations (for pagination)
 */
export function useAdvisorConsultationsInfiniteQuery(
  userId?: string,
  filters: Omit<ConsultationFilters, 'cursor'> = {},
  locale?: string
) {
  const { isAuthenticated } = useAuthStore();
  
  return useInfiniteQuery({
    queryKey: advisorKeys.consultations(userId || '', locale || 'en', filters),
    queryFn: ({ pageParam }) => fetchAdvisorConsultations(
      userId!, 
      { ...filters, cursor: pageParam }, 
      locale
    ),
    enabled: isAuthenticated && Boolean(userId),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.pagination.next_cursor,
    ...dashboardQueryDefaults
  });
}

/**
 * Get advisor analytics for specified period
 */
export function useAdvisorAnalyticsQuery(
  userId?: string,
  filters: AnalyticsFilters = { period: '30d' },
  locale?: string
) {
  const { isAuthenticated } = useAuthStore();
  
  return useQuery({
    queryKey: advisorKeys.analytics(userId || '', locale || 'en', filters.period),
    queryFn: () => fetchAdvisorAnalytics(userId!, filters, locale),
    enabled: isAuthenticated && Boolean(userId),
    ...dashboardQueryDefaults
  });
}

/**
 * Get advisor availability settings
 */
export function useAdvisorAvailabilityQuery(userId?: string, locale?: string) {
  const { isAuthenticated } = useAuthStore();
  
  return useQuery({
    queryKey: advisorKeys.availability(userId || '', locale || 'en'),
    queryFn: () => fetchAdvisorAvailability(userId!, locale),
    enabled: isAuthenticated && Boolean(userId),
    ...dashboardQueryDefaults
  });
}

/**
 * Get advisor pricing settings
 */
export function useAdvisorPricingSettingsQuery(userId?: string, locale?: string) {
  const { isAuthenticated } = useAuthStore();
  
  return useQuery({
    queryKey: advisorKeys.settings(userId || '', locale || 'en'),
    queryFn: () => fetchAdvisorPricingSettings(userId!, locale),
    enabled: isAuthenticated && Boolean(userId),
    ...dashboardQueryDefaults
  });
}

// ==========================================
// Mutation Hooks
// ==========================================

/**
 * Update advisor availability settings
 */
export function useUpdateAdvisorAvailabilityMutation(locale?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  return useMutation({
    mutationFn: (availability: AdvisorAvailability) => 
      updateAdvisorAvailability(availability, user!.id, locale),
    onSuccess: (data) => {
      // Invalidate and refetch availability query
      queryClient.invalidateQueries({
        queryKey: advisorKeys.availability(user!.id, locale || 'en')
      });
      
      // Also invalidate overview since it might show booking status
      queryClient.invalidateQueries({
        queryKey: advisorKeys.overview(user!.id, locale || 'en')
      });
      
      logger.info('✅ Advisor availability updated successfully');
    },
    onError: (error: any) => {
      logger.error('❌ Failed to update advisor availability', error);
    }
  });
}

/**
 * Update advisor pricing settings
 */
export function useUpdateAdvisorPricingSettingsMutation(locale?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  return useMutation({
    mutationFn: (settings: AdvisorPricingSettings) => 
      updateAdvisorPricingSettings(settings, user!.id, locale),
    onSuccess: (data) => {
      // Invalidate and refetch pricing settings query
      queryClient.invalidateQueries({
        queryKey: advisorKeys.settings(user!.id, locale || 'en')
      });
      
      // Also invalidate overview since it might show earning projections
      queryClient.invalidateQueries({
        queryKey: advisorKeys.overview(user!.id, locale || 'en')
      });
      
      logger.info('✅ Advisor pricing settings updated successfully');
    },
    onError: (error: any) => {
      logger.error('❌ Failed to update advisor pricing settings', error);
    }
  });
}

// ==========================================
// Utility Functions
// ==========================================

/**
 * Prefetch advisor overview data
 */
export function prefetchAdvisorOverview(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  locale = 'en'
) {
  return queryClient.prefetchQuery({
    queryKey: advisorKeys.overview(userId, locale),
    queryFn: () => fetchAdvisorOverview(userId, locale),
    ...dashboardQueryDefaults
  });
}

/**
 * Invalidate all advisor dashboard queries for user
 */
export function invalidateAdvisorDashboard(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  locale = 'en'
) {
  // Invalidate all advisor-related queries
  queryClient.invalidateQueries({
    queryKey: advisorKeys.all
  });
  
  logger.info('🔄 Invalidated all advisor dashboard queries', { userId: userId.slice(0, 8) });
}