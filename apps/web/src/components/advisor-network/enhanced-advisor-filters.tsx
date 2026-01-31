'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { searchAdvisorsAction } from '@/lib/actions/advisor-actions';
import type { Advisor, AdvisorSearchRequest } from '@/types/advisor-network';

interface AdvisorFilters {
  skills: string[];
  specialties: string[];
  experience: string[];
  availability: string[];
  rating: number;
}

interface EnhancedAdvisorFiltersProps {
  onFiltersChange: (advisors: Advisor[], total: number) => void;
  initialFilters?: Partial<AdvisorFilters>;
  className?: string;
}

// Common skills and specialties for filtering
const POPULAR_SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'Go', 'Rust',
  'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB', 'Redis', 'GraphQL',
  'System Design', 'Microservices', 'DevOps', 'Machine Learning', 'Security'
];

const SPECIALTIES = [
  'Frontend', 'Backend', 'Full-Stack', 'Mobile', 'DevOps', 'Data Engineering',
  'Machine Learning', 'Security', 'Product', 'Architecture', 'Performance',
  'Testing', 'UI/UX', 'Leadership', 'Mentorship'
];

const EXPERIENCE_LEVELS = [
  { label: '1-3 years', value: 'junior', min: 1, max: 3 },
  { label: '4-7 years', value: 'mid', min: 4, max: 7 },
  { label: '8-12 years', value: 'senior', min: 8, max: 12 },
  { label: '13+ years', value: 'staff', min: 13, max: 50 }
];

export function EnhancedAdvisorFilters({ 
  onFiltersChange, 
  initialFilters = {},
  className = ''
}: EnhancedAdvisorFiltersProps) {
  const [filters, setFilters] = useState<AdvisorFilters>({
    skills: initialFilters.skills || [],
    specialties: initialFilters.specialties || [],
    experience: initialFilters.experience || [],
    availability: initialFilters.availability || ['available'],
    rating: initialFilters.rating || 0
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resultsCount, setResultsCount] = useState<number | null>(null);

  // Debounced search function
  const searchAdvisors = useCallback(async (searchFilters: AdvisorFilters) => {
    setIsLoading(true);
    
    try {
      // Convert filters to API request format
      const searchRequest: AdvisorSearchRequest = {
        skills: searchFilters.skills.length > 0 ? searchFilters.skills : undefined,
        specialties: searchFilters.specialties.length > 0 ? searchFilters.specialties : undefined,
        available_only: searchFilters.availability.includes('available'),
        rating_min: searchFilters.rating > 0 ? searchFilters.rating : undefined,
        limit: 50 // Get more results for filtering
      };

      const result = await searchAdvisorsAction(searchRequest);
      
      if (result.success && result.data) {
        let filteredAdvisors = result.data.advisors;
        
        // Apply client-side experience filtering (since API might not support it)
        if (searchFilters.experience.length > 0) {
          filteredAdvisors = filteredAdvisors.filter(advisor => {
            if (!advisor.years_experience) return false;
            
            return searchFilters.experience.some(exp => {
              const level = EXPERIENCE_LEVELS.find(l => l.value === exp);
              if (!level) return false;
              return advisor.years_experience! >= level.min && advisor.years_experience! <= level.max;
            });
          });
        }
        
        setResultsCount(filteredAdvisors.length);
        onFiltersChange(filteredAdvisors, filteredAdvisors.length);
      } else {
        setResultsCount(0);
        onFiltersChange([], 0);
      }
    } catch (error) {
      console.error('Failed to search advisors:', error);
      setResultsCount(0);
      onFiltersChange([], 0);
    } finally {
      setIsLoading(false);
    }
  }, [onFiltersChange]);

  // Trigger search when filters change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchAdvisors(filters);
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [filters, searchAdvisors]);

  const updateFilter = (key: keyof AdvisorFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleSkill = (skill: string) => {
    updateFilter('skills', 
      filters.skills.includes(skill)
        ? filters.skills.filter(s => s !== skill)
        : [...filters.skills, skill]
    );
  };

  const toggleSpecialty = (specialty: string) => {
    updateFilter('specialties',
      filters.specialties.includes(specialty)
        ? filters.specialties.filter(s => s !== specialty)
        : [...filters.specialties, specialty]
    );
  };

  const toggleExperience = (level: string) => {
    updateFilter('experience',
      filters.experience.includes(level)
        ? filters.experience.filter(e => e !== level)
        : [...filters.experience, level]
    );
  };

  const clearAllFilters = () => {
    setFilters({
      skills: [],
      specialties: [],
      experience: [],
      availability: ['available'],
      rating: 0
    });
  };

  const hasActiveFilters = filters.skills.length > 0 || 
                          filters.specialties.length > 0 || 
                          filters.experience.length > 0 || 
                          filters.rating > 0;

  return (
    <Card className={`!bg-gray-800 !border-gray-700 ${className}`} style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
      <CardContent className="p-6">
        {/* Filter Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Icon name="filter" className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-white">Find Advisors</h3>
            {resultsCount !== null && (
              <Badge variant="secondary" className="ml-2">
                {isLoading ? (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                    <span>Searching...</span>
                  </div>
                ) : (
                  `${resultsCount} results`
                )}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                <Icon name="x" className="w-4 h-4 me-1" />
                Clear
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <Icon name={isExpanded ? "chevron-up" : "chevron-down"} className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Quick Filters - Always Visible */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Popular Skills
            </label>
            <div className="flex flex-wrap gap-2">
              {POPULAR_SKILLS.slice(0, 8).map((skill) => (
                <button
                  key={skill}
                  onClick={() => toggleSkill(skill)}
                  className={`px-3 py-1 text-sm border rounded-full transition-all ${
                    filters.skills.includes(skill)
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-700'
                  }`}
                >
                  {skill}
                </button>
              ))}
              {!isExpanded && POPULAR_SKILLS.length > 8 && (
                <button
                  onClick={() => setIsExpanded(true)}
                  className="px-3 py-1 text-sm border border-gray-600 text-gray-400 rounded-full hover:border-gray-500 hover:text-gray-300"
                >
                  +{POPULAR_SKILLS.length - 8} more
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Minimum Rating
            </label>
            <div className="flex gap-2">
              {[0, 3.5, 4.0, 4.5, 4.8].map((rating) => (
                <button
                  key={rating}
                  onClick={() => updateFilter('rating', rating)}
                  className={`flex items-center gap-1 px-3 py-1 text-sm border rounded-full transition-all ${
                    filters.rating === rating
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-700'
                  }`}
                >
                  <Icon name="star" className="w-3 h-3 fill-current" />
                  {rating === 0 ? 'Any' : `${rating}+`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Expanded Filters */}
        {isExpanded && (
          <div className="space-y-6 border-t border-gray-700 pt-6">
            {/* All Skills */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                All Skills ({filters.skills.length} selected)
              </label>
              <div className="flex flex-wrap gap-2">
                {POPULAR_SKILLS.map((skill) => (
                  <button
                    key={skill}
                    onClick={() => toggleSkill(skill)}
                    className={`px-3 py-1 text-sm border rounded-full transition-all ${
                      filters.skills.includes(skill)
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-700'
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>

            {/* Specialties */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Specialties ({filters.specialties.length} selected)
              </label>
              <div className="flex flex-wrap gap-2">
                {SPECIALTIES.map((specialty) => (
                  <button
                    key={specialty}
                    onClick={() => toggleSpecialty(specialty)}
                    className={`px-3 py-1 text-sm border rounded-full transition-all ${
                      filters.specialties.includes(specialty)
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-700'
                    }`}
                  >
                    {specialty}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience Level */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Experience Level ({filters.experience.length} selected)
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {EXPERIENCE_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => toggleExperience(level.value)}
                    className={`p-3 text-sm border rounded-lg transition-all text-center ${
                      filters.experience.includes(level.value)
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-700'
                    }`}
                  >
                    <div className="font-medium">{level.label}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {level.max === 50 ? `${level.min}+ years` : `${level.min}-${level.max} years`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="border-t border-gray-700 pt-4 mt-6">
            <div className="flex flex-wrap gap-2">
              {filters.skills.map((skill) => (
                <Badge key={skill} variant="secondary" className="flex items-center gap-1">
                  {skill}
                  <button onClick={() => toggleSkill(skill)}>
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {filters.specialties.map((specialty) => (
                <Badge key={specialty} variant="secondary" className="flex items-center gap-1">
                  {specialty}
                  <button onClick={() => toggleSpecialty(specialty)}>
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {filters.experience.map((exp) => (
                <Badge key={exp} variant="secondary" className="flex items-center gap-1">
                  {EXPERIENCE_LEVELS.find(l => l.value === exp)?.label}
                  <button onClick={() => toggleExperience(exp)}>
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {filters.rating > 0 && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {filters.rating}+ ⭐
                  <button onClick={() => updateFilter('rating', 0)}>
                    <Icon name="x" className="w-3 h-3" />
                  </button>
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Quick preset filters for common use cases
export function QuickFilterPresets({ 
  onPresetSelect 
}: { 
  onPresetSelect: (filters: Partial<AdvisorFilters>) => void;
}) {
  const presets = [
    {
      name: 'React Experts',
      icon: 'code',
      filters: { skills: ['React', 'JavaScript', 'TypeScript'], rating: 4.5 }
    },
    {
      name: 'System Design',
      icon: 'building',
      filters: { specialties: ['Architecture'], skills: ['System Design', 'AWS'], rating: 4.0 }
    },
    {
      name: 'Senior Engineers',
      icon: 'shield',
      filters: { experience: ['senior', 'staff'], rating: 4.5 }
    },
    {
      name: 'Full-Stack',
      icon: 'layers',
      filters: { specialties: ['Full-Stack'], skills: ['React', 'Node.js'] }
    }
  ];

  return (
    <div className="mb-6">
      <h4 className="text-sm font-medium text-gray-300 mb-3">Quick Filters</h4>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {presets.map((preset) => (
          <button
            key={preset.name}
            onClick={() => onPresetSelect(preset.filters)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-300 whitespace-nowrap transition-colors"
          >
            <Icon name={preset.icon as any} className="w-4 h-4 text-primary" />
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}