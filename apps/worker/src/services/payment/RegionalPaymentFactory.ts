/**
 * Regional Payment Factory
 * 
 * Expert-validated provider selection and routing logic.
 * Incorporates deterministic fallback routing with health checks.
 * 
 * Key Features:
 * - Product-type aware routing (subscription vs package)
 * - Region-based provider selection with fallbacks
 * - Capability validation at API boundary
 * - SLO-based health monitoring
 * - Circuit breaker patterns for graceful degradation
 */

import { 
  PaymentProvider, 
  PaymentProviderKey, 
  ProviderSelectionInput,
  ProviderCapabilities,
  PROVIDER_CAPABILITIES,
  PROVIDER_ROUTING_POLICIES,
  PaymentError,
  validatePhoneForProvider,
  validateLocaleForProvider
} from './enhancedTypes';

// =====================================================
// Provider Health Monitoring
// =====================================================

interface ProviderHealthStatus {
  provider: PaymentProviderKey;
  isHealthy: boolean;
  successRate: number;
  lastHealthCheck: Date;
  failureCount: number;
  lastFailure?: Date;
}

class ProviderHealthMonitor {
  private healthStatus = new Map<PaymentProviderKey, ProviderHealthStatus>();
  private readonly MAX_FAILURES = 5;
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute

  constructor() {
    // Initialize all providers as healthy
    Object.keys(PROVIDER_CAPABILITIES).forEach(provider => {
      this.healthStatus.set(provider as PaymentProviderKey, {
        provider: provider as PaymentProviderKey,
        isHealthy: true,
        successRate: 1.0,
        lastHealthCheck: new Date(),
        failureCount: 0
      });
    });
  }

  recordSuccess(provider: PaymentProviderKey): void {
    const status = this.healthStatus.get(provider);
    if (status) {
      status.failureCount = Math.max(0, status.failureCount - 1);
      status.isHealthy = true;
      status.lastHealthCheck = new Date();
      this.updateSuccessRate(provider, true);
    }
  }

  recordFailure(provider: PaymentProviderKey): void {
    const status = this.healthStatus.get(provider);
    if (status) {
      status.failureCount += 1;
      status.lastFailure = new Date();
      status.lastHealthCheck = new Date();
      
      // Circuit breaker logic
      if (status.failureCount >= this.MAX_FAILURES) {
        status.isHealthy = false;
        console.warn(`🚨 Circuit breaker tripped for ${provider}: ${status.failureCount} failures`);
      }
      
      this.updateSuccessRate(provider, false);
    }
  }

  isProviderHealthy(provider: PaymentProviderKey): boolean {
    const status = this.healthStatus.get(provider);
    if (!status) return false;

    // Auto-recovery after 5 minutes
    const capabilities = PROVIDER_CAPABILITIES[provider];
    if (!status.isHealthy && capabilities) {
      const timeSinceFailure = Date.now() - (status.lastFailure?.getTime() || 0);
      if (timeSinceFailure > 300000) { // 5 minutes
        console.log(`🔄 Auto-recovering provider ${provider} after 5 minutes`);
        status.isHealthy = true;
        status.failureCount = 0;
      }
    }

    return status.isHealthy && status.successRate >= capabilities.slos.successRateThreshold;
  }

  getHealthStatus(): ProviderHealthStatus[] {
    return Array.from(this.healthStatus.values());
  }

  private updateSuccessRate(provider: PaymentProviderKey, success: boolean): void {
    // Simple exponential moving average for success rate
    const status = this.healthStatus.get(provider);
    if (status) {
      const alpha = 0.1; // Smoothing factor
      status.successRate = alpha * (success ? 1 : 0) + (1 - alpha) * status.successRate;
    }
  }
}

// =====================================================
// Regional Payment Factory
// =====================================================

export class RegionalPaymentFactory {
  private static instance: RegionalPaymentFactory;
  private healthMonitor: ProviderHealthMonitor;
  private providerInstances = new Map<PaymentProviderKey, PaymentProvider>();

  private constructor() {
    this.healthMonitor = new ProviderHealthMonitor();
  }

  static getInstance(): RegionalPaymentFactory {
    if (!RegionalPaymentFactory.instance) {
      RegionalPaymentFactory.instance = new RegionalPaymentFactory();
    }
    return RegionalPaymentFactory.instance;
  }

  /**
   * Select optimal provider based on region, currency, and product type
   * Incorporates expert-validated routing logic with fallbacks
   */
  selectProvider(input: ProviderSelectionInput): PaymentProviderKey {
    const { region, currency, productType } = input;
    
    // Get routing policy for region
    const regionKey = region.toLowerCase();
    const routingPolicy = PROVIDER_ROUTING_POLICIES[regionKey as keyof typeof PROVIDER_ROUTING_POLICIES];
    
    if (!routingPolicy) {
      console.warn(`No routing policy for region ${region}, defaulting to stripe`);
      return 'stripe';
    }

    // Get provider list based on product type
    const candidateProviders = productType === 'subscription' 
      ? routingPolicy.subscription 
      : routingPolicy.package;

    // Find first healthy provider that supports the currency
    for (const providerKey of candidateProviders) {
      const provider = providerKey as PaymentProviderKey;
      
      if (!this.healthMonitor.isProviderHealthy(provider)) {
        console.warn(`Skipping unhealthy provider ${provider}`);
        continue;
      }

      const capabilities = PROVIDER_CAPABILITIES[provider];
      if (!capabilities.supports.currencies.includes(currency.toUpperCase())) {
        console.warn(`Provider ${provider} does not support currency ${currency}`);
        continue;
      }

      // Check product type support
      if (productType === 'subscription' && !capabilities.supports.subscription) {
        console.warn(`Provider ${provider} does not support subscriptions`);
        continue;
      }

      if (productType === 'package' && !capabilities.supports.oneTime) {
        console.warn(`Provider ${provider} does not support one-time payments`);
        continue;
      }

      console.log(`✅ Selected provider ${provider} for ${region}/${currency}/${productType}`);
      return provider;
    }

    // No suitable provider found - this should trigger admin alerts
    console.error(`🚨 No suitable provider for ${region}/${currency}/${productType}`);
    throw new PaymentError('NOT_SUPPORTED', 
      `No payment provider available for region: ${region}, currency: ${currency}, productType: ${productType}`,
      { region, currency, productType },
      'This combination is not currently supported. Please contact support.'
    );
  }

  /**
   * Get provider capabilities for validation
   */
  getProviderCapabilities(providerKey: PaymentProviderKey): ProviderCapabilities {
    return PROVIDER_CAPABILITIES[providerKey];
  }

  /**
   * Validate request parameters against provider requirements
   * Implements expert-recommended validation with actionable errors
   */
  validateProviderRequirements(
    providerKey: PaymentProviderKey, 
    locale: string | null, 
    phone: string | null
  ): void {
    // E.164 phone validation
    validatePhoneForProvider(phone, providerKey);
    
    // Arabic locale validation  
    validateLocaleForProvider(locale, providerKey);
  }

  /**
   * Check if provider supports specific capability
   */
  supportsCapability(
    providerKey: PaymentProviderKey, 
    capability: keyof ProviderCapabilities['supports']
  ): boolean {
    const capabilities = PROVIDER_CAPABILITIES[providerKey];
    return capabilities.supports[capability] as boolean;
  }

  /**
   * Get healthy providers for a region/currency combination
   * Used for admin dashboard and monitoring
   */
  getHealthyProvidersForRegion(region: string, currency: string): PaymentProviderKey[] {
    const regionKey = region.toLowerCase();
    const routingPolicy = PROVIDER_ROUTING_POLICIES[regionKey as keyof typeof PROVIDER_ROUTING_POLICIES];
    
    if (!routingPolicy) return [];

    const allProviders = [...routingPolicy.subscription, ...routingPolicy.package];
    const uniqueProviders = [...new Set(allProviders)] as PaymentProviderKey[];

    return uniqueProviders.filter(provider => {
      if (!this.healthMonitor.isProviderHealthy(provider)) return false;
      
      const capabilities = PROVIDER_CAPABILITIES[provider];
      return capabilities.supports.currencies.includes(currency.toUpperCase());
    });
  }

  /**
   * Record payment outcome for health monitoring
   */
  recordPaymentOutcome(providerKey: PaymentProviderKey, success: boolean): void {
    if (success) {
      this.healthMonitor.recordSuccess(providerKey);
    } else {
      this.healthMonitor.recordFailure(providerKey);
    }
  }

  /**
   * Get provider health status for admin dashboard
   */
  getProviderHealthStatus(): ProviderHealthStatus[] {
    return this.healthMonitor.getHealthStatus();
  }

  /**
   * Force circuit breaker recovery (admin action)
   */
  forceProviderRecovery(providerKey: PaymentProviderKey): void {
    console.log(`🔧 Admin forcing recovery for provider ${providerKey}`);
    this.healthMonitor.recordSuccess(providerKey);
  }

  /**
   * Get fallback provider for a given provider
   * Used when primary provider fails mid-transaction
   */
  getFallbackProvider(
    currentProvider: PaymentProviderKey,
    region: string,
    productType: 'subscription' | 'package'
  ): PaymentProviderKey | null {
    const regionKey = region.toLowerCase();
    const routingPolicy = PROVIDER_ROUTING_POLICIES[regionKey as keyof typeof PROVIDER_ROUTING_POLICIES];
    
    if (!routingPolicy) return null;

    const candidateProviders = productType === 'subscription' 
      ? routingPolicy.subscription 
      : routingPolicy.package;

    // Find next provider after current one
    const currentIndex = candidateProviders.indexOf(currentProvider);
    if (currentIndex === -1 || currentIndex === candidateProviders.length - 1) {
      return null; // No fallback available
    }

    const fallbackProvider = candidateProviders[currentIndex + 1] as PaymentProviderKey;
    
    if (this.healthMonitor.isProviderHealthy(fallbackProvider)) {
      return fallbackProvider;
    }

    return null;
  }

  /**
   * Check if region/currency/productType combination is supported
   * Used for feature flags and capability advertising
   */
  isSupported(region: string, currency: string, productType: 'subscription' | 'package'): boolean {
    try {
      this.selectProvider({ region, currency, productType });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get recommended currencies for a region
   * Used for frontend currency selector
   */
  getRecommendedCurrencies(region: string): string[] {
    const regionKey = region.toLowerCase();
    
    // Regional currency recommendations
    const regionCurrencies: Record<string, string[]> = {
      'eg': ['EGP', 'USD'],
      'sa': ['SAR', 'USD'], 
      'us': ['USD'],
      'ca': ['USD', 'CAD'],
      'gb': ['GBP', 'USD'],
      'eu': ['EUR', 'USD']
    };

    return regionCurrencies[regionKey] || ['USD'];
  }
}

// =====================================================
// Provider Registry Service
// =====================================================

export class PaymentProviderRegistry {
  private static instance: PaymentProviderRegistry;
  private factory: RegionalPaymentFactory;
  private cache = new Map<string, PaymentProvider>();
  
  private constructor() {
    this.factory = RegionalPaymentFactory.getInstance();
  }
  
  static getInstance(): PaymentProviderRegistry {
    if (!PaymentProviderRegistry.instance) {
      PaymentProviderRegistry.instance = new PaymentProviderRegistry();
    }
    return PaymentProviderRegistry.instance;
  }
  
  /**
   * Get provider instance for user's region and preferences
   */
  async getProvider(
    userId: string, 
    region?: string, 
    currency?: string,
    productType: 'subscription' | 'package' = 'package'
  ): Promise<PaymentProvider> {
    // Auto-detect region/currency from user profile if not provided
    const userRegion = region || await this.detectUserRegion(userId);
    const userCurrency = currency || await this.detectUserCurrency(userId);
    
    // Select optimal provider
    const providerKey = this.factory.selectProvider({
      region: userRegion,
      currency: userCurrency,
      productType,
      userId
    });
    
    return await this.getProviderInstance(providerKey);
  }

  /**
   * Get specific provider instance by key
   */
  async getProviderInstance(providerKey: PaymentProviderKey): Promise<PaymentProvider> {
    if (!this.cache.has(providerKey)) {
      const instance = await this.createProviderInstance(providerKey);
      this.cache.set(providerKey, instance);
    }
    
    return this.cache.get(providerKey)!;
  }

  private async createProviderInstance(providerKey: PaymentProviderKey): Promise<PaymentProvider> {
    // Dynamic import to avoid loading all providers upfront
    switch (providerKey) {
      case 'stripe':
        const { EnhancedStripeProvider } = await import('./providers/EnhancedStripeProvider');
        return new EnhancedStripeProvider();
        
      case 'fawry':
        const { FawryProvider } = await import('./providers/FawryProvider');
        return new FawryProvider();
        
      case 'paymob':
        const { PaymobProvider } = await import('./providers/PaymobProvider');
        return new PaymobProvider();
        
      case 'stcpay':
        const { STCPayProvider } = await import('./providers/STCPayProvider');
        return new STCPayProvider();
        
      case 'paytabs':
        const { PayTabsProvider } = await import('./providers/PayTabsProvider');
        return new PayTabsProvider();
        
      default:
        throw new PaymentError('CONFIGURATION_ERROR', `Unknown provider: ${providerKey}`);
    }
  }
  
  private async detectUserRegion(userId: string): Promise<string> {
    // Implementation: Query user profile, IP geolocation, etc.
    // For now, return default
    return 'US';
  }

  private async detectUserCurrency(userId: string): Promise<string> {
    // Implementation: Query user preferences, region defaults, etc.
    // For now, return default
    return 'USD';
  }

  /**
   * Health check endpoint for monitoring
   */
  getHealthStatus() {
    return this.factory.getProviderHealthStatus();
  }

  /**
   * Force provider recovery (admin action)
   */
  forceProviderRecovery(providerKey: PaymentProviderKey) {
    this.factory.forceProviderRecovery(providerKey);
  }
}

// Export singleton instances
export const paymentProviderRegistry = PaymentProviderRegistry.getInstance();
export const regionalPaymentFactory = RegionalPaymentFactory.getInstance();