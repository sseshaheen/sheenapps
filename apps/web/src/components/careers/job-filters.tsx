'use client'

import { useRouter } from '@/i18n/routing'
import { useSearchParams } from 'next/navigation'

interface JobFiltersProps {
  departments: Array<{ department: string; job_count: number }>
  locale: string
  translations: any
  currentFilters: any
}

export function JobFilters({
  departments,
  locale,
  translations,
  currentFilters,
}: JobFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleFilterChange = (filterType: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    
    if (value) {
      params.set(filterType, value)
    } else {
      params.delete(filterType)
    }
    
    // Reset to page 1 when filters change
    params.delete('page')
    
    router.push(`/careers?${params.toString()}`)
  }

  const clearFilters = () => {
    router.push('/careers')
  }

  const hasActiveFilters = 
    currentFilters.department ||
    currentFilters.location ||
    currentFilters.employment_type ||
    currentFilters.experience_level ||
    currentFilters.is_remote

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{translations.filters.title}</h3>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-primary hover:underline"
          >
            {translations.filters.clear}
          </button>
        )}
      </div>

      {/* Department Filter */}
      <div>
        <label className="block text-sm font-medium mb-2">
          {translations.labels.department}
        </label>
        <select
          value={currentFilters.department || ''}
          onChange={(e) => handleFilterChange('department', e.target.value)}
          className="w-full px-3 py-2 border rounded-lg bg-background"
        >
          <option value="">{translations.filters.all_departments}</option>
          {departments.map((dept) => (
            <option key={dept.department} value={dept.department}>
              {dept.department} ({dept.job_count})
            </option>
          ))}
        </select>
      </div>

      {/* Employment Type Filter */}
      <div>
        <label className="block text-sm font-medium mb-2">
          {translations.labels.type}
        </label>
        <select
          value={currentFilters.employment_type || ''}
          onChange={(e) => handleFilterChange('employment_type', e.target.value)}
          className="w-full px-3 py-2 border rounded-lg bg-background"
        >
          <option value="">{translations.filters.all_types}</option>
          <option value="full_time">{translations.employment_types.full_time}</option>
          <option value="part_time">{translations.employment_types.part_time}</option>
          <option value="contract">{translations.employment_types.contract}</option>
          <option value="internship">{translations.employment_types.internship}</option>
        </select>
      </div>

      {/* Experience Level Filter */}
      <div>
        <label className="block text-sm font-medium mb-2">
          {translations.labels.experience}
        </label>
        <select
          value={currentFilters.experience_level || ''}
          onChange={(e) => handleFilterChange('experience_level', e.target.value)}
          className="w-full px-3 py-2 border rounded-lg bg-background"
        >
          <option value="">{translations.filters.all_levels}</option>
          <option value="entry">{translations.experience_levels.entry}</option>
          <option value="mid">{translations.experience_levels.mid}</option>
          <option value="senior">{translations.experience_levels.senior}</option>
          <option value="executive">{translations.experience_levels.executive}</option>
        </select>
      </div>

      {/* Remote Only Checkbox */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id="remote-only"
          checked={currentFilters.is_remote === 'true'}
          onChange={(e) => handleFilterChange('is_remote', e.target.checked ? 'true' : '')}
          className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
        />
        <label htmlFor="remote-only" className="ms-2 text-sm font-medium">
          {translations.filters.remote_only}
        </label>
      </div>
    </div>
  )
}