/**
 * Hook for persisting filter state in URL search params
 * Makes admin filters shareable and supports back/forward navigation
 */

'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'

/**
 * Persist a single value in URL search params
 *
 * @example
 * const [projectId, setProjectId] = useQueryState('projectId')
 * const [status, setStatus] = useQueryState('status', 'all')
 *
 * // Value persists in URL: ?projectId=abc&status=pending
 * // Shareable links, back/forward navigation work
 */
export function useQueryState(key: string, defaultValue = '') {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const value = useMemo(
    () => params.get(key) ?? defaultValue,
    [params, key, defaultValue]
  )

  const setValue = useCallback(
    (next: string) => {
      const p = new URLSearchParams(params.toString())
      if (!next || next === defaultValue) {
        p.delete(key)
      } else {
        p.set(key, next)
      }
      const query = p.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname, params, key, defaultValue]
  )

  return [value, setValue] as const
}

/**
 * Persist multiple values in URL search params
 *
 * @example
 * const { values, setValue, setValues, reset } = useQueryStates({
 *   projectId: '',
 *   status: 'all',
 *   page: '1',
 * })
 *
 * setValue('projectId', 'abc')
 * setValues({ projectId: 'abc', status: 'pending' })
 */
export function useQueryStates<T extends Record<string, string>>(defaults: T) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const values = useMemo(() => {
    const result = { ...defaults }
    for (const key of Object.keys(defaults)) {
      const param = params.get(key)
      if (param !== null) {
        result[key as keyof T] = param as T[keyof T]
      }
    }
    return result
  }, [params, defaults])

  const setValue = useCallback(
    (key: keyof T, value: string) => {
      const p = new URLSearchParams(params.toString())
      if (!value || value === defaults[key]) {
        p.delete(key as string)
      } else {
        p.set(key as string, value)
      }
      const query = p.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname, params, defaults]
  )

  const setValues = useCallback(
    (updates: Partial<T>) => {
      const p = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (!value || value === defaults[key as keyof T]) {
          p.delete(key)
        } else {
          p.set(key, value as string)
        }
      }
      const query = p.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname, params, defaults]
  )

  const reset = useCallback(() => {
    router.replace(pathname, { scroll: false })
  }, [router, pathname])

  return { values, setValue, setValues, reset }
}
