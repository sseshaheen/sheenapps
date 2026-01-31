import { TierConfig, AITier, TierRule } from './types'
import tiersConfig from '../../config/ai-tiers.json'
import devTiersConfig from '../../config/ai-tiers.development.json'
import { logger } from '@/utils/logger';

// Configuration interfaces
export interface AITierConfig {
  version: string
  environment: 'development' | 'staging' | 'production'
  lastUpdated: string
  tiers: Record<AITier, TierConfig>
  routing: RoutingConfig
  monitoring: MonitoringConfig
  features: FeatureConfig
}

export interface RoutingConfig {
  defaultTier: AITier
  budgetThresholds: BudgetThreshold[]
  complexityMapping: Record<string, AITier>
  domainSpecificRules: Record<string, AITier>
  riskLevelMapping: Record<string, AITier>
}

export interface MonitoringConfig {
  enabled: boolean
  alertThresholds: AlertThreshold[]
  reportingInterval: string
  costTrackingEnabled: boolean
  usageAnalyticsEnabled: boolean
  performanceMonitoringEnabled: boolean
}

export interface FeatureConfig {
  smartCaching: {
    enabled: boolean
    ttlMinutes: number
    maxCacheSize: number
  }
  requestBatching: {
    enabled: boolean
    maxBatchSize: number
    maxWaitTimeMs: number
  }
  fallbackRetries: {
    enabled: boolean
    maxRetries: number
    retryDelayMs: number
  }
  loadBalancing: {
    enabled: boolean
    strategy: 'round_robin' | 'least_cost' | 'least_latency'
  }
}

export interface BudgetThreshold {
  percentage: number
  action: 'notify' | 'tier_downgrade' | 'emergency_stop'
  severity: 'info' | 'warning' | 'critical'
}

export interface AlertThreshold {
  type: 'budget' | 'error_rate' | 'response_time'
  percentage?: number
  threshold?: number
  severity: 'info' | 'warning' | 'critical'
  actions: string[]
  recipients: string[]
}

// Configuration watcher interface
export interface ConfigWatcher {
  onConfigChange: (config: AITierConfig) => void
  id: string
}

// Configuration Manager
export class AITierConfigManager {
  private static config: AITierConfig
  private static watchers: ConfigWatcher[] = []
  private static isInitialized = false

  static async initialize(): Promise<void> {
    if (this.isInitialized) return

    await this.loadConfig()
    this.isInitialized = true
    logger.info('🔧 AI Tier Configuration initialized');
  }

  static async loadConfig(source: 'file' | 'database' | 'remote' = 'file'): Promise<void> {
    try {
      switch (source) {
        case 'file':
          // Load environment-specific configuration
          const isDevelopment = process.env.NODE_ENV === 'development' || 
                               process.env.NODE_ENV === 'test' ||
                               !process.env.NODE_ENV
          
          if (isDevelopment) {
            this.config = devTiersConfig as AITierConfig
            logger.info('🔧 Loaded development tier configuration');
          } else {
            this.config = tiersConfig as AITierConfig
            logger.info('🏭 Loaded production tier configuration');
          }
          break
        case 'database':
          // TODO: Load from database
          throw new Error('Database configuration loading not implemented')
        case 'remote':
          // TODO: Load from remote API
          throw new Error('Remote configuration loading not implemented')
        default:
          throw new Error(`Unknown configuration source: ${source}`)
      }

      this.validateConfig(this.config)
      this.notifyWatchers()
      
      logger.info(`✅ Configuration loaded from ${source} (${this.config.environment});`)
    } catch (error) {
      logger.error('❌ Failed to load AI tier configuration:', error);
      
      // Fallback to default configuration
      this.config = this.getDefaultConfig()
      logger.info('🔄 Using default configuration as fallback');
    }
  }

  static getConfig(): AITierConfig {
    if (!this.config) {
      logger.warn('⚠️ Configuration not loaded, using default');
      this.config = this.getDefaultConfig()
    }
    return this.config
  }

  static getTierConfig(tier: AITier): TierConfig | null {
    const config = this.getConfig()
    return config.tiers[tier] || null
  }

  static getRoutingConfig(): RoutingConfig {
    return this.getConfig().routing
  }

  static getMonitoringConfig(): MonitoringConfig {
    return this.getConfig().monitoring
  }

  static getFeatureConfig(): FeatureConfig {
    return this.getConfig().features
  }

  // Configuration updates
  static updateTierConfig(tierName: AITier, updates: Partial<TierConfig>): void {
    if (!this.config.tiers[tierName]) {
      throw new Error(`Tier ${tierName} not found`)
    }
    
    this.config.tiers[tierName] = { 
      ...this.config.tiers[tierName], 
      ...updates 
    }
    
    this.validateTierConfig(this.config.tiers[tierName])
    this.persistConfig()
    this.notifyWatchers()
    
    logger.info(`✅ Updated configuration for tier: ${tierName}`);
  }

  static updateRoutingRule(domain: string, tier: AITier): void {
    this.config.routing.domainSpecificRules[domain] = tier
    this.persistConfig()
    this.notifyWatchers()
    
    logger.info(`✅ Updated routing rule: ${domain} -> ${tier}`);
  }

  static addBudgetThreshold(threshold: BudgetThreshold): void {
    this.config.routing.budgetThresholds.push(threshold)
    this.config.routing.budgetThresholds.sort((a, b) => a.percentage - b.percentage)
    this.persistConfig()
    this.notifyWatchers()
    
    logger.info(`✅ Added budget threshold: ${threshold.percentage}% -> ${threshold.action}`);
  }

  static enableTier(tier: AITier): void {
    if (this.config.tiers[tier]) {
      this.config.tiers[tier].enabled = true
      this.persistConfig()
      this.notifyWatchers()
      logger.info(`✅ Enabled tier: ${tier}`);
    }
  }

  static disableTier(tier: AITier): void {
    if (this.config.tiers[tier]) {
      this.config.tiers[tier].enabled = false
      this.persistConfig()
      this.notifyWatchers()
      logger.info(`⚠️ Disabled tier: ${tier}`);
    }
  }

  // Configuration watching
  static addWatcher(watcher: ConfigWatcher): void {
    this.watchers.push(watcher)
    logger.info(`📡 Added configuration watcher: ${watcher.id}`);
  }

  static removeWatcher(watcherId: string): void {
    this.watchers = this.watchers.filter(w => w.id !== watcherId)
    logger.info(`📡 Removed configuration watcher: ${watcherId}`);
  }

  private static notifyWatchers(): void {
    this.watchers.forEach(watcher => {
      try {
        watcher.onConfigChange(this.config)
      } catch (error) {
        logger.error(`❌ Error notifying watcher ${watcher.id}:`, error);
      }
    })
  }

  // Configuration validation
  private static validateConfig(config: AITierConfig): void {
    if (!config.version) {
      throw new Error('Configuration must have a version')
    }

    if (!config.tiers || Object.keys(config.tiers).length === 0) {
      throw new Error('Configuration must have at least one tier')
    }

    Object.entries(config.tiers).forEach(([tierName, tierConfig]) => {
      this.validateTierConfig(tierConfig, tierName as AITier)
    })

    if (!config.routing?.defaultTier) {
      throw new Error('Configuration must specify a default tier')
    }

    if (!config.tiers[config.routing.defaultTier]) {
      throw new Error(`Default tier ${config.routing.defaultTier} does not exist`)
    }
  }

  private static validateTierConfig(tierConfig: TierConfig, tierName?: AITier): void {
    if (!tierConfig.name) {
      throw new Error(`Tier ${tierName || 'unknown'} must have a name`)
    }

    if (tierConfig.maxCostPerRequest < 0) {
      throw new Error(`Tier ${tierName || 'unknown'} maxCostPerRequest must be non-negative`)
    }

    if (tierConfig.maxMonthlyBudget < 0) {
      throw new Error(`Tier ${tierName || 'unknown'} maxMonthlyBudget must be non-negative`)
    }

    if (!Array.isArray(tierConfig.providers) || tierConfig.providers.length === 0) {
      throw new Error(`Tier ${tierName || 'unknown'} must have at least one provider`)
    }

    if (!Array.isArray(tierConfig.rules)) {
      throw new Error(`Tier ${tierName || 'unknown'} must have rules array`)
    }
  }

  // Configuration persistence
  private static async persistConfig(): Promise<void> {
    try {
      // TODO: Implement persistence to file system, database, or remote store
      logger.info('💾 Configuration persisted (mock implementation);')
    } catch (error) {
      logger.error('❌ Failed to persist configuration:', error);
    }
  }

  // Default configuration factory
  private static getDefaultConfig(): AITierConfig {
    return {
      version: '1.0.0-fallback',
      environment: 'development',
      lastUpdated: new Date().toISOString(),
      tiers: {
        basic: {
          name: 'basic',
          priority: 1,
          maxCostPerRequest: 0.005,
          maxMonthlyBudget: 100,
          providers: ['mock-fast'],
          enabled: true,
          rules: []
        },
        intermediate: {
          name: 'intermediate',
          priority: 2,
          maxCostPerRequest: 0.02,
          maxMonthlyBudget: 500,
          providers: ['mock-premium'],
          enabled: true,
          rules: []
        },
        advanced: {
          name: 'advanced',
          priority: 3,
          maxCostPerRequest: 0.05,
          maxMonthlyBudget: 1000,
          providers: ['mock-premium'],
          enabled: true,
          rules: []
        },
        premium: {
          name: 'premium',
          priority: 4,
          maxCostPerRequest: 0.15,
          maxMonthlyBudget: 2000,
          providers: ['mock-premium'],
          enabled: true,
          rules: []
        },
        specialized: {
          name: 'specialized',
          priority: 5,
          maxCostPerRequest: 0.25,
          maxMonthlyBudget: 1000,
          providers: ['mock-premium'],
          enabled: true,
          rules: []
        }
      },
      routing: {
        defaultTier: 'intermediate',
        budgetThresholds: [],
        complexityMapping: {
          simple: 'basic',
          moderate: 'intermediate',
          complex: 'advanced',
          very_complex: 'premium'
        },
        domainSpecificRules: {},
        riskLevelMapping: {
          low: 'basic',
          medium: 'intermediate',
          high: 'advanced',
          critical: 'premium'
        }
      },
      monitoring: {
        enabled: false,
        alertThresholds: [],
        reportingInterval: 'hourly',
        costTrackingEnabled: true,
        usageAnalyticsEnabled: true,
        performanceMonitoringEnabled: false
      },
      features: {
        smartCaching: {
          enabled: true,
          ttlMinutes: 60,
          maxCacheSize: 100
        },
        requestBatching: {
          enabled: false,
          maxBatchSize: 5,
          maxWaitTimeMs: 1000
        },
        fallbackRetries: {
          enabled: true,
          maxRetries: 2,
          retryDelayMs: 500
        },
        loadBalancing: {
          enabled: false,
          strategy: 'round_robin'
        }
      }
    }
  }

  // Utility methods
  static isValidTier(tier: string): tier is AITier {
    return ['basic', 'intermediate', 'advanced', 'premium', 'specialized'].includes(tier)
  }

  static getTierPriority(tier: AITier): number {
    return this.getTierConfig(tier)?.priority || 999
  }

  static getEnabledTiers(): AITier[] {
    const config = this.getConfig()
    return Object.entries(config.tiers)
      .filter(([_, tierConfig]) => tierConfig.enabled)
      .map(([tierName, _]) => tierName as AITier)
  }

  static getTierByPriority(priority: number): AITier | null {
    const config = this.getConfig()
    const tierEntry = Object.entries(config.tiers)
      .find(([_, tierConfig]) => tierConfig.priority === priority && tierConfig.enabled)
    
    return tierEntry ? tierEntry[0] as AITier : null
  }
}

// Initialize configuration on module load
AITierConfigManager.initialize().catch(error => {
  logger.error('❌ Failed to initialize AI tier configuration:', error);
})

export default AITierConfigManager