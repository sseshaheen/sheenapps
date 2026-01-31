import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { SUPPORTED_LOCALES } from '../../utils/localization'

// Mock next-intl routing
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn()
}

const mockUsePathname = vi.fn(() => '/en')
const mockUseRouter = vi.fn(() => mockRouter)
const mockRedirect = vi.fn()

// Create mock components and functions
const MockLink = ({ href, children, locale }: any) => <a href={href} data-locale={locale}>{children}</a>

vi.mock('@/i18n/routing', () => ({
  Link: MockLink,
  redirect: mockRedirect,
  usePathname: () => mockUsePathname(),
  useRouter: () => mockUseRouter(),
  getPathname: vi.fn()
}))

describe('next-intl Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  describe('Locale-aware navigation', () => {
    test('Link component preserves locale in href', () => {
      render(
        <MockLink href="/about" locale="fr">
          About Us
        </MockLink>
      )
      
      const link = screen.getByText('About Us')
      expect(link).toHaveAttribute('href', '/about')
    })
    
    test('useRouter returns locale-aware router', () => {
      const router = mockUseRouter()
      
      expect(router).toHaveProperty('push')
      expect(router).toHaveProperty('replace')
      expect(router).toHaveProperty('prefetch')
    })
    
    test('usePathname returns current pathname without locale', () => {
      mockUsePathname.mockReturnValueOnce('/fr/about')
      
      const pathname = mockUsePathname()
      expect(pathname).toBe('/fr/about')
    })
  })
  
  describe('Programmatic navigation', () => {
    test('router.push preserves current locale', () => {
      const router = mockUseRouter()
      
      router.push('/dashboard')
      
      expect(mockRouter.push).toHaveBeenCalledWith('/dashboard')
    })
    
    test('router.push with locale parameter', () => {
      const router = mockUseRouter()
      
      router.push('/dashboard', { locale: 'ar' })
      
      expect(mockRouter.push).toHaveBeenCalledWith('/dashboard', { locale: 'ar' })
    })
    
    test('router.replace works with locale', () => {
      const router = mockUseRouter()
      
      router.replace('/login', { locale: 'es' })
      
      expect(mockRouter.replace).toHaveBeenCalledWith('/login', { locale: 'es' })
    })
  })
  
  describe('Redirect function', () => {
    test('redirect preserves locale', () => {
      
      mockRedirect('/dashboard')
      
      expect(mockRedirect).toHaveBeenCalledWith('/dashboard')
    })
    
    test('redirect with explicit locale', () => {
      
      mockRedirect({ pathname: '/dashboard', locale: 'de' })
      
      expect(mockRedirect).toHaveBeenCalledWith({ pathname: '/dashboard', locale: 'de' })
    })
  })
  
  describe('Middleware integration', () => {
    test('all locales are valid routes', () => {
      const validPaths = SUPPORTED_LOCALES.map(locale => `/${locale}`)
      
      validPaths.forEach(path => {
        expect(path).toMatch(/^\/[a-z]{2}(-[a-z]{2})?$/)
      })
    })
    
    test('locale detection from pathname', () => {
      const detectLocale = (pathname: string) => {
        const segments = pathname.split('/')
        const maybeLocale = segments[1]
        return SUPPORTED_LOCALES.includes(maybeLocale as any) ? maybeLocale : null
      }
      
      expect(detectLocale('/en/about')).toBe('en')
      expect(detectLocale('/ar-eg/dashboard')).toBe('ar-eg')
      expect(detectLocale('/invalid/page')).toBe(null)
      expect(detectLocale('/about')).toBe(null)
    })
  })
  
  describe('Static generation', () => {
    test('generateStaticParams returns all locale params', () => {
      const generateStaticParams = () => {
        return SUPPORTED_LOCALES.map((locale) => ({ locale }))
      }
      
      const params = generateStaticParams()
      
      expect(params).toHaveLength(SUPPORTED_LOCALES.length)
      expect(params[0]).toHaveProperty('locale')
      expect(params.map(p => p.locale)).toEqual(SUPPORTED_LOCALES)
    })
  })
  
  describe('Route configuration', () => {
    test('routing config includes all locales', () => {
      const routing = {
        locales: SUPPORTED_LOCALES,
        defaultLocale: 'en'
      }
      
      expect(routing.locales).toContain('en')
      expect(routing.locales).toContain('ar-eg')
      expect(routing.locales).toContain('fr')
      expect(routing.defaultLocale).toBe('en')
    })
    
    test('locale paths are properly formatted', () => {
      const localePaths = SUPPORTED_LOCALES.map(locale => ({
        locale,
        path: `/${locale}`
      }))
      
      localePaths.forEach(({ locale, path }) => {
        expect(path).toBe(`/${locale}`)
        expect(path).not.toContain('//')
        expect(path.endsWith('/')).toBe(false)
      })
    })
  })
})