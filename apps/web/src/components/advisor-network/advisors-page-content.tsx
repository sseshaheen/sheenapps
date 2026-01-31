'use client'

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from '@/i18n/routing';
import { searchAdvisorsAction, getConsultationPricingAction } from '@/lib/actions/advisor-actions';
import { AdvisorCard } from './advisor-card';
import { AdvisorSearch } from './advisor-search';
import { AdvisorFilters } from './advisor-filters';
import { LoadingSpinner } from './loading-spinner';
import { EmptyState } from './empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import type { Advisor, AdvisorSearchRequest, LocalizedPricing } from '@/types/advisor-network';
import { logger } from '@/utils/logger';

interface AdvisorsPageContentProps {
  translations: {
    advisors: {
      title: string;
      subtitle: string;
      search: {
        placeholder: string;
        filters: {
          skills: string;
          specialties: string;
          languages: string;
          rating: string;
          availability: string;
        };
      };
      cards: {
        rating: string;
        reviews: string;
        bookNow: string;
        viewProfile: string;
        available: string;
        busy: string;
      };
      empty: {
        title: string;
        description: string;
      };
    };
    pricing: {
      from: string;
      consultation: string;
    };
  };
  initialFilters: {
    skills?: string[];
    specialties?: string[];
    languages?: string[];
    ratingMin?: number;
    availableOnly?: boolean;
  };
  locale: string;
}

const ITEMS_PER_PAGE = 12;

export function AdvisorsPageContent({ translations, initialFilters, locale }: AdvisorsPageContentProps) {
  const router = useRouter();
  
  // State management
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [pricing, setPricing] = useState<LocalizedPricing | null>(null);

  // Build search request from current state
  const searchRequest = useMemo((): AdvisorSearchRequest => {
    const request: AdvisorSearchRequest = {
      limit: ITEMS_PER_PAGE,
      offset: 0 // Reset to 0 for new searches
    };

    if (filters.skills?.length) request.skills = filters.skills;
    if (filters.specialties?.length) request.specialties = filters.specialties;
    if (filters.languages?.length) request.languages = filters.languages;
    if (filters.ratingMin) request.rating_min = filters.ratingMin;
    if (filters.availableOnly) request.available_only = filters.availableOnly;

    return request;
  }, [filters]);

  // Load pricing information
  useEffect(() => {
    async function loadPricing() {
      try {
        const result = await getConsultationPricingAction(locale);
        if (result.success && result.data) {
          setPricing(result.data);
          logger.info('✅ Pricing loaded for advisors page', { 
            locale, 
            currency: result.data.currency 
          });
        } else {
          logger.error('Failed to load pricing:', result.error);
        }
      } catch (error) {
        logger.error('Error loading pricing:', error);
      }
    }

    loadPricing();
  }, [locale]);

  // Search advisors
  const searchAdvisors = useCallback(async (request: AdvisorSearchRequest, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      logger.info('🔍 Searching advisors', { request, append });
      
      const result = await searchAdvisorsAction(request);
      
      if (result.success && result.data) {
        const newAdvisors = result.data.advisors;
        
        if (append) {
          setAdvisors(prev => [...prev, ...newAdvisors]);
        } else {
          setAdvisors(newAdvisors);
        }
        
        setHasMore(result.data.hasMore);
        setTotal(result.data.total);
        
        logger.info('✅ Advisors loaded', { 
          count: newAdvisors.length, 
          total: result.data.total,
          hasMore: result.data.hasMore,
          append
        });
      } else {
        throw new Error(result.error || 'Failed to search advisors');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to search advisors';
      setError(errorMessage);
      logger.error('❌ Advisor search failed:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load and filter changes
  useEffect(() => {
    searchAdvisors(searchRequest);
  }, [searchAdvisors, searchRequest]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    
    if (filters.skills?.length) params.set('skills', filters.skills.join(','));
    if (filters.specialties?.length) params.set('specialties', filters.specialties.join(','));
    if (filters.languages?.length) params.set('languages', filters.languages.join(','));
    if (filters.ratingMin) params.set('rating_min', filters.ratingMin.toString());
    if (filters.availableOnly) params.set('available_only', 'true');
    
    const query = params.toString();
    const newUrl = query ? `?${query}` : '';
    
    // Update URL without triggering navigation
    if (newUrl !== window.location.search) {
      router.push(`/advisors${newUrl}`, { scroll: false });
    }
  }, [filters, router]);

  // Load more advisors
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    
    const loadMoreRequest = {
      ...searchRequest,
      offset: advisors.length
    };
    
    await searchAdvisors(loadMoreRequest, true);
  }, [hasMore, loadingMore, searchRequest, advisors.length, searchAdvisors]);

  // Handle advisor booking
  const handleBookAdvisor = useCallback((advisorId: string) => {
    router.push(`/advisors/${advisorId}/book`);
  }, [router]);

  // Handle view advisor profile
  const handleViewProfile = useCallback((advisorId: string) => {
    router.push(`/advisors/${advisorId}`);
  }, [router]);

  // Filter advisors by search query (client-side for instant feedback)
  const filteredAdvisors = useMemo(() => {
    if (!searchQuery.trim()) return advisors;
    
    const query = searchQuery.toLowerCase();
    return advisors.filter(advisor => 
      advisor.display_name.toLowerCase().includes(query) ||
      advisor.bio?.toLowerCase().includes(query) ||
      advisor.skills.some(skill => skill.toLowerCase().includes(query)) ||
      advisor.specialties?.some(specialty => specialty.label.toLowerCase().includes(query))
    );
  }, [advisors, searchQuery]);

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Icon name="alert-circle" className="h-12 w-12 text-destructive mb-4" />
              <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
              <p className="text-muted-foreground mb-6 text-center">{error}</p>
              <Button onClick={() => searchAdvisors(searchRequest)}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header Section */}
      <div className="bg-gradient-to-b from-muted/50 to-background border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl font-bold mb-4">{translations.advisors.title}</h1>
            <p className="text-xl text-muted-foreground mb-8">
              {translations.advisors.subtitle}
            </p>
            
            {/* Pricing Info */}
            {pricing && (
              <div className="inline-flex items-center gap-2 bg-background border rounded-lg px-4 py-2 text-sm">
                <Icon name="clock" className="h-4 w-4 text-green-600" />
                <span>
                  {translations.pricing.from} {pricing.prices.duration_15.display} / {translations.pricing.consultation}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search and Filters Section */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Bar */}
            <div className="flex-1">
              <AdvisorSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={translations.advisors.search.placeholder}
                className="w-full"
              />
            </div>
            
            {/* Filters */}
            <AdvisorFilters
              filters={filters}
              onFiltersChange={setFilters}
              translations={translations.advisors.search.filters}
              className="lg:w-auto"
            />
          </div>
          
          {/* Results Count */}
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <div>
              {loading ? 'Searching...' : `${total} advisor${total !== 1 ? 's' : ''} found`}
            </div>
            {filteredAdvisors.length < advisors.length && (
              <div>
                Showing {filteredAdvisors.length} of {advisors.length} filtered results
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <LoadingSpinner />
        ) : filteredAdvisors.length === 0 ? (
          <EmptyState
            title={translations.advisors.empty.title}
            description={translations.advisors.empty.description}
            action={
              <Button 
                onClick={() => {
                  setFilters({});
                  setSearchQuery('');
                }} 
                variant="outline"
              >
                Clear Filters
              </Button>
            }
          />
        ) : (
          <>
            {/* Advisors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 mb-8" data-testid="advisors-grid">
              {filteredAdvisors.map((advisor) => (
                <AdvisorCard
                  key={advisor.id}
                  advisor={advisor}
                  onBook={() => handleBookAdvisor(advisor.user_id)}
                  onViewProfile={() => handleViewProfile(advisor.user_id)}
                  translations={translations.advisors.cards}
                  pricing={pricing}
                  showBookingButton
                />
              ))}
            </div>

            {/* Load More Button */}
            {hasMore && !searchQuery && (
              <div className="flex justify-center">
                <Button
                  onClick={loadMore}
                  disabled={loadingMore}
                  variant="outline"
                  size="lg"
                >
                  {loadingMore ? (
                    <>
                      <Icon name="loader-2" className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Load More Advisors'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}