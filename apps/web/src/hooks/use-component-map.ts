import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase-client'
import { useComponentMappingsWithAB } from '@/services/analytics/ab-testing'

interface ComponentMapping {
  id: string
  ai_component_name: string
  builder_section_type: 'hero' | 'features' | 'pricing' | 'testimonials' | 'cta' | 'footer'
  industry: string | null
  priority: number
  is_active: boolean
}

interface ComponentMapCache {
  [key: string]: string // componentName -> sectionType
}

export function useComponentMap(industry?: string) {
  const supabase = createClient()
  
  // Get A/B tested component mappings
  const { data: abMappings, isLoading: abLoading } = useComponentMappingsWithAB(industry)

  const { data: mappings, isLoading, error } = useQuery<ComponentMapping[]>({
    queryKey: ['component-map', industry],
    queryFn: async () => {
      // Build query with industry filter
      let query = supabase
        .from('component_map')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false })

      // Add industry filter if specified
      if (industry) {
        query = query.or(`industry.eq.${industry},industry.is.null`)
      }

      const { data, error } = await query

      if (error) {
        console.error('Failed to fetch component mappings:', error)
        throw error
      }

      return data as ComponentMapping[]
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours (React Query v5 uses gcTime instead of cacheTime)
    retry: 3,
  })

  // Transform mappings into a lookup object
  const mappingCache: ComponentMapCache = {}
  
  if (mappings) {
    // Group by component name and take highest priority mapping
    const grouped = mappings.reduce((acc, mapping) => {
      const existing = acc[mapping.ai_component_name]
      if (!existing || mapping.priority > existing.priority) {
        acc[mapping.ai_component_name] = mapping
      }
      return acc
    }, {} as Record<string, ComponentMapping>)

    // Create simple lookup
    Object.entries(grouped).forEach(([componentName, mapping]) => {
      mappingCache[componentName] = mapping.builder_section_type
    })
  }

  // Apply A/B test overrides if available
  if (abMappings && abMappings.length > 0) {
    abMappings.forEach(override => {
      mappingCache[override.ai_component_name] = override.builder_section_type
    })
  }

  // Helper function to get section type with fallback
  const getSectionType = (componentName: string, fallback: string = 'features'): string => {
    return mappingCache[componentName] || fallback
  }

  // Helper function to get all mappings for a section type
  const getComponentsForSection = (sectionType: string): string[] => {
    return Object.entries(mappingCache)
      .filter(([_, type]) => type === sectionType)
      .map(([name, _]) => name)
  }

  return {
    mappings: mappingCache,
    getSectionType,
    getComponentsForSection,
    isLoading: isLoading || abLoading,
    error,
    // Expose raw data for admin UI
    rawMappings: mappings || [],
    // Expose A/B testing info
    abMappings: abMappings || [],
    hasABOverrides: (abMappings && abMappings.length > 0) || false
  }
}

// Fallback mappings if database is unavailable
export const FALLBACK_MAPPINGS: ComponentMapCache = {
  // Universal
  'Hero': 'hero',
  'HeroSection': 'hero',
  'ContactSection': 'footer',
  'ContactForm': 'footer',
  'Footer': 'footer',
  
  // Salon
  'ServicesMenu': 'features',
  'ServiceList': 'features',
  'BookingCalendar': 'cta',
  'AppointmentBooking': 'cta',
  'StaffProfiles': 'testimonials',
  'TeamSection': 'testimonials',
  'PricingSection': 'pricing',
  'PriceList': 'pricing',
  'Gallery': 'features',
  'Testimonials': 'testimonials',
  
  // Restaurant
  'MenuSection': 'features',
  'ReservationForm': 'cta',
  'ChefProfiles': 'testimonials',
  'DailySpecials': 'pricing',
  
  // E-commerce
  'ProductGrid': 'features',
  'ShoppingCart': 'cta',
  'CustomerReviews': 'testimonials',
  'PricingTiers': 'pricing'
}