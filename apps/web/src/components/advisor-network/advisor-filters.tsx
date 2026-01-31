'use client'

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface AdvisorFiltersProps {
  filters: {
    skills?: string[];
    specialties?: string[];
    languages?: string[];
    ratingMin?: number;
    availableOnly?: boolean;
  };
  onFiltersChange: (filters: any) => void;
  translations: {
    skills: string;
    specialties: string;
    languages: string;
    rating: string;
    availability: string;
  };
  className?: string;
}

// Predefined options for filters
const SKILL_OPTIONS = [
  'React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js', 'Python',
  'Vue.js', 'Angular', 'Svelte', 'PHP', 'Laravel', 'Django', 'FastAPI',
  'Express', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Docker',
  'AWS', 'Vercel', 'Supabase', 'Firebase', 'GraphQL', 'REST APIs',
  'Tailwind CSS', 'CSS', 'HTML', 'Sass', 'Bootstrap', 'Material-UI'
];

const SPECIALTY_OPTIONS = [
  'frontend', 'backend', 'fullstack', 'mobile', 'devops', 'design',
  'ecommerce', 'saas', 'portfolio', 'landing-page', 'dashboard', 'api'
];

const LANGUAGE_OPTIONS = [
  'English', 'Arabic', 'French', 'Spanish', 'German', 'Portuguese',
  'Italian', 'Dutch', 'Chinese', 'Japanese', 'Korean', 'Russian'
];

const RATING_OPTIONS = [
  { value: 4.5, label: '4.5+ Stars' },
  { value: 4.0, label: '4.0+ Stars' },
  { value: 3.5, label: '3.5+ Stars' },
  { value: 3.0, label: '3.0+ Stars' }
];

export function AdvisorFilters({ 
  filters, 
  onFiltersChange, 
  translations,
  className 
}: AdvisorFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Count active filters
  const activeFilterCount = [
    filters.skills?.length || 0,
    filters.specialties?.length || 0,
    filters.languages?.length || 0,
    filters.ratingMin ? 1 : 0,
    filters.availableOnly ? 1 : 0
  ].reduce((sum, count) => sum + (count > 0 ? 1 : 0), 0);

  const hasActiveFilters = activeFilterCount > 0;

  // Helper functions for updating filters
  const toggleArrayFilter = (key: 'skills' | 'specialties' | 'languages', value: string) => {
    const currentArray = filters[key] || [];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    
    onFiltersChange({
      ...filters,
      [key]: newArray.length > 0 ? newArray : undefined
    });
  };

  const updateRatingFilter = (value: string) => {
    const rating = value === 'all' ? undefined : parseFloat(value);
    onFiltersChange({
      ...filters,
      ratingMin: rating
    });
  };

  const updateAvailabilityFilter = (checked: boolean) => {
    onFiltersChange({
      ...filters,
      availableOnly: checked || undefined
    });
  };

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Skills Filter */}
      <div>
        <Label className="text-sm font-medium mb-2 block">{translations.skills}</Label>
        <div className="flex flex-wrap gap-2">
          {SKILL_OPTIONS.map(skill => (
            <Badge
              key={skill}
              variant={filters.skills?.includes(skill) ? "default" : "outline"}
              className="cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={() => toggleArrayFilter('skills', skill)}
            >
              {skill}
            </Badge>
          ))}
        </div>
      </div>

      {/* Specialties Filter */}
      <div>
        <Label className="text-sm font-medium mb-2 block">{translations.specialties}</Label>
        <div className="flex flex-wrap gap-2">
          {SPECIALTY_OPTIONS.map(specialty => (
            <Badge
              key={specialty}
              variant={filters.specialties?.includes(specialty) ? "default" : "outline"}
              className="cursor-pointer hover:bg-primary/10 transition-colors capitalize"
              onClick={() => toggleArrayFilter('specialties', specialty)}
            >
              {specialty}
            </Badge>
          ))}
        </div>
      </div>

      {/* Languages Filter */}
      <div>
        <Label className="text-sm font-medium mb-2 block">{translations.languages}</Label>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map(language => (
            <Badge
              key={language}
              variant={filters.languages?.includes(language) ? "default" : "outline"}
              className="cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={() => toggleArrayFilter('languages', language)}
            >
              {language}
            </Badge>
          ))}
        </div>
      </div>

      {/* Rating Filter */}
      <div>
        <Label className="text-sm font-medium mb-2 block">{translations.rating}</Label>
        <Select
          value={filters.ratingMin?.toString() || 'all'}
          onValueChange={updateRatingFilter}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Any rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any rating</SelectItem>
            {RATING_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value.toString()}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Availability Filter */}
      <div className="flex items-center justify-between">
        <Label htmlFor="availability" className="text-sm font-medium">
          {translations.availability}
        </Label>
        <Switch
          id="availability"
          checked={filters.availableOnly || false}
          onCheckedChange={updateAvailabilityFilter}
        />
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="outline"
          onClick={clearAllFilters}
          className="w-full"
        >
          <Icon name="x" className="h-4 w-4 me-2" />
          Clear All Filters
        </Button>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Filters */}
      <div className={cn("hidden lg:block", className)}>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Icon name="filter" className="h-4 w-4" />
              <span className="font-medium">Filters</span>
              {hasActiveFilters && (
                <Badge variant="secondary" className="ms-auto">
                  {activeFilterCount}
                </Badge>
              )}
            </div>
            <FilterContent />
          </CardContent>
        </Card>
      </div>

      {/* Mobile Filters */}
      <div className={cn("lg:hidden", className)}>
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full">
              <Icon name="filter" className="h-4 w-4 me-2" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ms-2">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:w-80">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Icon name="filter" className="h-5 w-5" />
                Filter Advisors
                {hasActiveFilters && (
                  <Badge variant="secondary">
                    {activeFilterCount}
                  </Badge>
                )}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 overflow-y-auto max-h-[calc(100vh-8rem)]">
              <FilterContent />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}