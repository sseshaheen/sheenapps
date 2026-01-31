import { vi } from 'vitest'

// Mock next-intl functions to avoid module resolution issues
vi.mock('@/i18n/routing', () => ({
  getPathname: vi.fn(({ href, locale }) => {
    if (locale && locale !== 'en') {
      return `/${locale}${href}`
    }
    return `/en${href}`
  })
}))

import { ROUTES } from '@/i18n/routes'
import { getBillingPath } from '../navigation'

describe('navigation utilities', () => {
  it('imports route constants correctly', () => {
    expect(ROUTES.BILLING).toBe('/dashboard/billing')
    expect(ROUTES.DASHBOARD).toBe('/dashboard')
    expect(ROUTES.BUILDER_NEW).toBe('/builder/new')
  })

  it('returns locale-aware billing path', () => {
    expect(getBillingPath('fr')).toBe('/fr/dashboard/billing')
    expect(getBillingPath('en')).toBe('/en/dashboard/billing')
    expect(getBillingPath('ar-eg')).toBe('/ar-eg/dashboard/billing')
  })

  it('returns server-safe fallback when no locale provided', () => {
    expect(getBillingPath()).toBe('/dashboard/billing')
  })

  it('handles edge cases', () => {
    expect(getBillingPath('')).toBe('/dashboard/billing')
    expect(getBillingPath(undefined)).toBe('/dashboard/billing')
  })
})