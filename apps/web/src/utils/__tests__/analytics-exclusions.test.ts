import { shouldExcludeAnalytics, isAdminRoute, getAnalyticsContext } from '../analytics-exclusions'

describe('Analytics Exclusions', () => {
  describe('shouldExcludeAnalytics', () => {
    it('should exclude admin routes', () => {
      expect(shouldExcludeAnalytics('/admin')).toBe(true)
      expect(shouldExcludeAnalytics('/admin/users')).toBe(true)
      expect(shouldExcludeAnalytics('/admin/analytics')).toBe(true)
      expect(shouldExcludeAnalytics('/admin/build-logs/123')).toBe(true)
    })

    it('should exclude admin login', () => {
      expect(shouldExcludeAnalytics('/admin-login')).toBe(true)
    })

    it('should exclude admin API routes', () => {
      expect(shouldExcludeAnalytics('/api/admin/auth/login')).toBe(true)
      expect(shouldExcludeAnalytics('/api/admin/users')).toBe(true)
    })

    it('should exclude builder routes (heavy DOM churn causes Clarity 64KB overflow)', () => {
      expect(shouldExcludeAnalytics('/builder')).toBe(true)
      expect(shouldExcludeAnalytics('/builder/123')).toBe(true)
      expect(shouldExcludeAnalytics('/builder/project/456')).toBe(true)
    })

    it('should allow regular routes', () => {
      expect(shouldExcludeAnalytics('/dashboard')).toBe(false)
      expect(shouldExcludeAnalytics('/workspace/123')).toBe(false)
      expect(shouldExcludeAnalytics('/billing')).toBe(false)
      expect(shouldExcludeAnalytics('/api/projects/123')).toBe(false)
      expect(shouldExcludeAnalytics('/admin-like-but-not-admin')).toBe(false)
    })
  })

  describe('isAdminRoute', () => {
    it('should identify admin routes', () => {
      expect(isAdminRoute('/admin')).toBe(true)
      expect(isAdminRoute('/admin/users')).toBe(true)
      expect(isAdminRoute('/admin-login')).toBe(true)
    })

    it('should not identify regular routes as admin', () => {
      expect(isAdminRoute('/dashboard')).toBe(false)
      expect(isAdminRoute('/workspace')).toBe(false)
    })
  })

  describe('getAnalyticsContext', () => {
    it('should return correct context for admin routes', () => {
      const context = getAnalyticsContext('/admin/users')
      expect(context).toEqual({
        shouldTrack: false,
        isAdmin: true,
        routeType: 'admin'
      })
    })

    it('should return correct context for public routes', () => {
      const context = getAnalyticsContext('/dashboard')
      expect(context).toEqual({
        shouldTrack: true,
        isAdmin: false,
        routeType: 'public'
      })
    })

    it('should return correct context for API routes', () => {
      const context = getAnalyticsContext('/api/projects/123')
      expect(context).toEqual({
        shouldTrack: true,
        isAdmin: false,
        routeType: 'api'
      })
    })
  })
})