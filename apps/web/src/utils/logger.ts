// Smart Logging System - Configurable and Modular
// Usage: logger.info('message'), logger.warn('message'), logger.debug('component', 'message')

import { sanitizeForLogs, isProduction } from './data-sanitizer'

type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'
type LogCategory = 'layout' | 'history' | 'preview' | 'components' | 'ai' | 'performance' | 'general' | 'questions' | 'auth' | 'api' | 'store' | 'workspace'

interface LogConfig {
  level: LogLevel
  categories: LogCategory[]
  enableEmojis: boolean
  enableColors: boolean
  maxDebugLogs: number // Prevent flooding
}

class Logger {
  private config: LogConfig = {
    level: process.env.NODE_ENV === 'development' ? 'WARN' : 'ERROR', // Less verbose in dev
    categories: ['layout', 'history', 'preview', 'components', 'ai', 'performance', 'general', 'questions', 'auth', 'api', 'store', 'workspace'],
    enableEmojis: true,
    enableColors: true,
    maxDebugLogs: 5 // Very limited debug logs
  }

  private debugLogCount = 0
  private rateLimiters: Map<string, { lastLog: number; count: number }> = new Map()
  private isDevelopment = process.env.NODE_ENV === 'development'
  private enableProductionLogs = typeof window !== 'undefined' && (window as any).__ENABLE_LOGS__ === true
  private logLevels: Record<LogLevel, number> = {
    'ERROR': 0,
    'WARN': 1, 
    'INFO': 2,
    'DEBUG': 3
  }

  private categoryEmojis: Record<LogCategory, string> = {
    layout: '🔄',
    history: '📚', 
    preview: '👁️',
    components: '🧩',
    ai: '🤖',
    performance: '⚡',
    general: '📝',
    questions: '❓',
    auth: '🔐',
    api: '🌐',
    store: '💾',
    workspace: '🏗️'
  }

  private levelStyles: Record<LogLevel, string> = {
    ERROR: 'color: #ff4444; font-weight: bold;',
    WARN: 'color: #ff8800; font-weight: bold;', 
    INFO: 'color: #0088ff;',
    DEBUG: 'color: #888888;'
  }

  // Configure logging (call this in development)
  configure(config: Partial<LogConfig>) {
    this.config = { ...this.config, ...config }
  }

  // Quick presets for different scenarios
  setDebugMode() {
    this.config.level = 'DEBUG'
    this.config.maxDebugLogs = 200
  }

  setProductionMode() {
    this.config.level = 'WARN' 
    this.config.maxDebugLogs = 10
  }

  setFocusMode(categories: LogCategory[]) {
    this.config.categories = categories
    this.config.level = 'DEBUG'
  }

  private shouldLog(level: LogLevel, category?: LogCategory, rateKey?: string): boolean {
    // In production, completely disable all logging unless explicitly enabled via window.__ENABLE_LOGS__
    if (!this.isDevelopment && !this.enableProductionLogs) {
      return false
    }

    // Check log level
    if (this.logLevels[level] > this.logLevels[this.config.level]) {
      return false
    }

    // Check category filter
    if (category && !this.config.categories.includes(category)) {
      return false
    }

    // Rate limiting for repetitive logs
    if (rateKey) {
      const now = Date.now()
      const limiter = this.rateLimiters.get(rateKey) || { lastLog: 0, count: 0 }
      
      if (now - limiter.lastLog < 1000) { // Within 1 second
        limiter.count++
        if (limiter.count > 5) { // Max 5 logs per second
          return false
        }
      } else {
        limiter.count = 1
        limiter.lastLog = now
      }
      
      this.rateLimiters.set(rateKey, limiter)
    }

    // Limit debug logs to prevent flooding
    if (level === 'DEBUG') {
      if (this.debugLogCount >= this.config.maxDebugLogs) {
        return false
      }
      this.debugLogCount++
    }

    return true
  }

  private formatMessage(level: LogLevel, category: LogCategory | undefined, message: string, data?: any): [string, any[]] {
    const emoji = category ? this.categoryEmojis[category] : ''
    const prefix = `${emoji} ${level}`
    const fullMessage = `${prefix}: ${message}`
    
    const args = [fullMessage]
    if (data !== undefined) {
      // Sanitize data in production to prevent sensitive data exposure
      const sanitizedData = isProduction() ? sanitizeForLogs(data) : data
      args.push(sanitizedData)
    }

    return [fullMessage, args]
  }

  // Normalize category input to handle both LogCategory and string
  private normalizeCategory(category: LogCategory | string): LogCategory {
    // If it's already a valid LogCategory, return it
    if (['layout', 'history', 'preview', 'components', 'ai', 'performance', 'general', 'questions', 'auth', 'api', 'store', 'workspace'].includes(category as LogCategory)) {
      return category as LogCategory;
    }
    // For any other string, map to 'general' category
    return 'general';
  }

  // Main logging methods
  error(message: string, data?: any, category: LogCategory | string = 'general', rateKey?: string) {
    const normalizedCategory = this.normalizeCategory(category);
    if (!this.shouldLog('ERROR', normalizedCategory, rateKey)) return
    
    const [fullMessage, args] = this.formatMessage('ERROR', normalizedCategory, message, data)
    console.error(...args);
  }

  warn(message: string, data?: any, category: LogCategory | string = 'general', rateKey?: string) {
    const normalizedCategory = this.normalizeCategory(category);
    if (!this.shouldLog('WARN', normalizedCategory, rateKey)) return
    
    const [fullMessage, args] = this.formatMessage('WARN', normalizedCategory, message, data)
    console.warn(...args);
  }

  info(message: string, data?: any, category: LogCategory | string = 'general', rateKey?: string) {
    const normalizedCategory = this.normalizeCategory(category);
    if (!this.shouldLog('INFO', normalizedCategory, rateKey)) return
    
    const [fullMessage, args] = this.formatMessage('INFO', normalizedCategory, message, data)
    console.log(...args);
  }

  debug(category: LogCategory | string, message: string, data?: any, rateKey?: string) {
    const normalizedCategory = this.normalizeCategory(category);
    if (!this.shouldLog('DEBUG', normalizedCategory, rateKey)) return
    
    const [fullMessage, args] = this.formatMessage('DEBUG', normalizedCategory, message, data)
    console.log(...args);
  }

  // Special methods for common patterns
  success(message: string, category: LogCategory | string = 'general') {
    this.info(`✅ ${message}`, undefined, category)
  }

  progress(message: string, category: LogCategory | string = 'general') {
    this.debug(category, `⏳ ${message}`)
  }

  timing(operation: string, startTime: number, category: LogCategory | string = 'performance') {
    const duration = Date.now() - startTime
    this.debug('performance', `${operation} completed in ${duration}ms`)
  }

  // Development helpers
  group(title: string, category: LogCategory | string = 'general') {
    const normalizedCategory = this.normalizeCategory(category);
    if (this.shouldLog('DEBUG', normalizedCategory)) {
      console.group(`${this.categoryEmojis[normalizedCategory]} ${title}`)
    }
  }

  groupEnd() {
    console.groupEnd()
  }

  // Reset debug log count and rate limiters (call periodically)
  resetDebugCount() {
    this.debugLogCount = 0
    this.rateLimiters.clear()
  }

  // Smart console log replacement - automatically rate limited
  rateLimit(key: string, level: LogLevel = 'DEBUG') {
    return {
      log: (message: string, data?: any) => this.debug('general', message, data, key),
      warn: (message: string, data?: any) => this.warn(message, data, 'general', key),
      error: (message: string, data?: any) => this.error(message, data, 'general', key),
      info: (message: string, data?: any) => this.info(message, data, 'general', key)
    }
  }

  // Get current stats
  getStats() {
    return {
      debugLogCount: this.debugLogCount,
      maxDebugLogs: this.config.maxDebugLogs,
      currentLevel: this.config.level,
      activeCategories: this.config.categories
    }
  }
}

// Export singleton instance
export const logger = new Logger()

// Development helper - add to window for easy console access
if (typeof window !== 'undefined') {
  (window as any).logger = logger
}

// Export types for other modules
export type { LogLevel, LogCategory }