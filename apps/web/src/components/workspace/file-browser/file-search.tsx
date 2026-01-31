/**
 * File Search Component
 *
 * Search functionality for file browser
 * Part of shared workspace file browser
 */

'use client'

import { Icon } from '@/components/ui/icon'

interface FileSearchProps {
  query: string
  onQueryChange: (query: string) => void
  placeholder?: string
}

export function FileSearch({
  query,
  onQueryChange,
  placeholder = 'Search files...'
}: FileSearchProps) {
  const clearSearch = () => {
    onQueryChange('')
  }

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Icon name="search" className="h-4 w-4 text-muted-foreground"  />
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full pl-10 pr-10 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
      />

      {query && (
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
          <button
            onClick={clearSearch}
            className="text-muted-foreground hover:text-foreground"
            type="button"
          >
            <Icon name="x" className="h-4 w-4"  />
          </button>
        </div>
      )}
    </div>
  )
}