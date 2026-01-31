/**
 * Singleton manager for admin token refresh
 * Prevents multiple simultaneous refresh attempts
 */

class AdminRefreshManager {
  private static instance: AdminRefreshManager
  private refreshPromise: Promise<any> | null = null
  private refreshTimer: NodeJS.Timeout | null = null
  private lastRefreshTime: number = 0
  
  private constructor() {}
  
  static getInstance(): AdminRefreshManager {
    if (!AdminRefreshManager.instance) {
      AdminRefreshManager.instance = new AdminRefreshManager()
    }
    return AdminRefreshManager.instance
  }
  
  /**
   * Ensures only one refresh happens at a time
   * Multiple callers will receive the same promise
   */
  async refreshToken(): Promise<{ success: boolean; session?: any }> {
    const now = Date.now()
    
    // If we refreshed successfully in the last 30 seconds, skip
    if (this.lastRefreshTime && (now - this.lastRefreshTime) < 30000) {
      return { success: true }
    }
    
    // If a refresh is already in progress, return that promise
    if (this.refreshPromise) {
      return this.refreshPromise
    }
    
    // Start a new refresh
    this.refreshPromise = this.performRefresh()
    
    try {
      const result = await this.refreshPromise
      if (result.success) {
        this.lastRefreshTime = Date.now()
      }
      return result
    } finally {
      this.refreshPromise = null
    }
  }
  
  private async performRefresh(): Promise<{ success: boolean; session?: any }> {
    try {
      const response = await fetch('/api/admin/auth/refresh', {
        method: 'POST',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        return { success: true, session: data.session }
      } else {
        return { success: false }
      }
    } catch (error) {
      return { success: false }
    }
  }
  
  /**
   * Schedule a refresh for later
   */
  scheduleRefresh(delayMs: number, callback: () => void) {
    this.cancelScheduledRefresh()
    
    this.refreshTimer = setTimeout(() => {
      callback()
    }, delayMs)
  }
  
  /**
   * Cancel any scheduled refresh
   */
  cancelScheduledRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }
  
  /**
   * Reset the manager state
   */
  reset() {
    this.cancelScheduledRefresh()
    this.refreshPromise = null
    this.lastRefreshTime = 0
  }
}

export const adminRefreshManager = AdminRefreshManager.getInstance()