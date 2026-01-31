import { AIResponse, BusinessAnalysis, BusinessName, BusinessTagline, FeatureRecommendation, PricingStrategy } from './types'

// Simple in-memory cache for development (can be replaced with Redis in production)
class CacheService {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>()
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000 // 24 hours

  private generateKey(type: string, input: string, serviceKey: string): string {
    // Create a deterministic key based on content, not just input
    const normalized = input.toLowerCase().trim()
    return `${type}:${serviceKey}:${this.hashString(normalized)}`
  }

  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }

  set<T>(type: string, input: string, serviceKey: string, data: T, ttl?: number): void {
    const key = this.generateKey(type, input, serviceKey)
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL
    })
  }

  get<T>(type: string, input: string, serviceKey: string): T | null {
    const key = this.generateKey(type, input, serviceKey)
    const cached = this.cache.get(key)
    
    if (!cached) return null
    
    // Check if expired
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key)
      return null
    }
    
    return cached.data as T
  }

  has(type: string, input: string, serviceKey: string): boolean {
    return this.get(type, input, serviceKey) !== null
  }

  clear(): void {
    this.cache.clear()
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now()
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > value.ttl) {
        this.cache.delete(key)
      }
    }
  }
}

export const aiCache = new CacheService()

// Run cleanup every hour
if (typeof window === 'undefined') {
  setInterval(() => aiCache.cleanup(), 60 * 60 * 1000)
}