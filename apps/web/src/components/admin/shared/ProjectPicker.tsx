'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface ProjectResult {
  id: string
  name: string
  owner_email?: string
}

interface ProjectPickerProps {
  value: string
  onChange: (projectId: string) => void
  className?: string
}

/**
 * Searchable project picker for admin pages.
 * Queries GET /api/admin/inhouse/projects?search=... (endpoint already exists).
 * Falls back to manual ID paste for admins who prefer copying from logs.
 */
export function ProjectPicker({ value, onChange, className }: ProjectPickerProps) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<ProjectResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync external value changes
  useEffect(() => {
    setQuery(value)
  }, [value])

  const search = useCallback(async (term: string) => {
    if (!term || term.length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({ search: term, limit: '10' })
      const response = await fetch(`/api/admin/inhouse/projects?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) return

      const data = await response.json()
      const items = data.data?.projects || data.items || []
      setResults(items)
      setOpen(items.length > 0)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        setResults([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)

    // Debounce search
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  const handleSelect = (project: ProjectResult) => {
    setQuery(project.id)
    setOpen(false)
    onChange(project.id)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      setOpen(false)
      onChange(query)
    }
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const handleBlur = () => {
    // Delay to allow click on dropdown items
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false)
        if (query !== value) {
          onChange(query)
        }
      }
    }, 150)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Input
        placeholder="Search project or paste ID..."
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={() => results.length > 0 && setOpen(true)}
        className="w-[280px]"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <ul className="max-h-[200px] overflow-auto py-1">
            {results.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(project)}
                >
                  <div className="font-medium">{project.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {project.id}
                    {project.owner_email ? ` · ${project.owner_email}` : ''}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
