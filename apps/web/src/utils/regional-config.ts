/**
 * Regional Configuration System
 * Maps currencies to regions and provides regional defaults
 * Based on MULTI_PROVIDER_FRONTEND_INTEGRATION_PLAN.md
 */

import type { SupportedCurrency, RegionCode, PaymentProvider, RegionalConfig } from '@/types/billing'

// Regional configuration data
const REGIONAL_CONFIGS: Record<RegionCode, RegionalConfig> = {
  us: {
    region: 'us',
    default_currency: 'USD',
    supported_currencies: ['USD', 'CAD'],
    supported_providers: ['stripe']
  },
  ca: {
    region: 'ca', 
    default_currency: 'CAD',
    supported_currencies: ['CAD', 'USD'],
    supported_providers: ['stripe']
  },
  gb: {
    region: 'gb',
    default_currency: 'GBP', 
    supported_currencies: ['GBP', 'EUR', 'USD'],
    supported_providers: ['stripe']
  },
  eu: {
    region: 'eu',
    default_currency: 'EUR',
    supported_currencies: ['EUR', 'GBP', 'USD'], 
    supported_providers: ['stripe']
  },
  eg: {
    region: 'eg',
    default_currency: 'EGP',
    supported_currencies: ['EGP', 'USD'],
    supported_providers: ['fawry', 'paymob', 'stripe']
  },
  sa: {
    region: 'sa',
    default_currency: 'SAR',
    supported_currencies: ['SAR', 'USD'],
    supported_providers: ['stcpay', 'paytabs', 'stripe']
  }
}

/**
 * Get region configuration for a given region code
 */
export function getRegionalConfig(region: RegionCode): RegionalConfig {
  return REGIONAL_CONFIGS[region]
}

/**
 * Get the recommended region for a given currency
 */
export function getRegionForCurrency(currency: SupportedCurrency): RegionCode {
  const currencyToRegionMap: Record<SupportedCurrency, RegionCode> = {
    'USD': 'us',
    'CAD': 'ca',
    'GBP': 'gb', 
    'EUR': 'eu',
    'EGP': 'eg',
    'SAR': 'sa',
    'JPY': 'us',  // Fallback to US
    'AUD': 'us',  // Fallback to US  
    'AED': 'sa',  // Fallback to Saudi Arabia
    'MAD': 'eu'   // Fallback to EU
  }
  
  return currencyToRegionMap[currency] || 'us'
}

/**
 * Get supported currencies for a given region
 */
export function getCurrenciesForRegion(region: RegionCode): SupportedCurrency[] {
  return REGIONAL_CONFIGS[region]?.supported_currencies || ['USD']
}

/**
 * Get supported payment providers for a region
 */
export function getProvidersForRegion(region: RegionCode): PaymentProvider[] {
  return REGIONAL_CONFIGS[region]?.supported_providers || ['stripe']
}

/**
 * Get regional defaults based on user location or browser locale
 * This is a simplified implementation - could be enhanced with IP geolocation
 */
export function getRegionalDefaults(userLocation?: string): RegionalConfig {
  // Simple locale-based detection
  if (typeof window !== 'undefined') {
    const browserLocale = navigator.language.toLowerCase()
    
    if (browserLocale.startsWith('ar-eg') || userLocation === 'EG') {
      return getRegionalConfig('eg')
    }
    if (browserLocale.startsWith('ar-sa') || userLocation === 'SA') {
      return getRegionalConfig('sa')
    }
    if (browserLocale.startsWith('en-gb') || userLocation === 'GB') {
      return getRegionalConfig('gb')
    }
    if (browserLocale.startsWith('en-ca') || userLocation === 'CA') {
      return getRegionalConfig('ca')
    }
    if (browserLocale.startsWith('fr') || browserLocale.startsWith('de') || userLocation === 'EU') {
      return getRegionalConfig('eu')
    }
  }
  
  // Default to US
  return getRegionalConfig('us')
}

/**
 * Check if a currency is supported in a region
 */
export function isCurrencySupportedInRegion(currency: SupportedCurrency, region: RegionCode): boolean {
  return getCurrenciesForRegion(region).includes(currency)
}

/**
 * Check if a payment provider is available in a region
 */
export function isProviderAvailableInRegion(provider: PaymentProvider, region: RegionCode): boolean {
  return getProvidersForRegion(region).includes(provider)
}

/**
 * Get fallback currency if requested currency is not available in region
 */
export function getFallbackCurrency(requestedCurrency: SupportedCurrency, region: RegionCode): SupportedCurrency {
  const supportedCurrencies = getCurrenciesForRegion(region)
  
  if (supportedCurrencies.includes(requestedCurrency)) {
    return requestedCurrency
  }
  
  // Return the default currency for the region
  return getRegionalConfig(region).default_currency
}

/**
 * Detect user's likely region from browser/system information
 * Enhanced version would use IP geolocation service
 */
export function detectUserRegion(): RegionCode {
  if (typeof window === 'undefined') {
    return 'us' // Server-side fallback
  }
  
  const browserLocale = navigator.language.toLowerCase()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  
  // Arabic locales
  if (browserLocale.includes('ar-eg') || timezone.includes('Cairo')) {
    return 'eg'
  }
  if (browserLocale.includes('ar-sa') || timezone.includes('Riyadh')) {
    return 'sa'
  }
  
  // English locales
  if (browserLocale.includes('en-gb') || timezone.includes('London')) {
    return 'gb'
  }
  if (browserLocale.includes('en-ca') || timezone.includes('Toronto') || timezone.includes('Vancouver')) {
    return 'ca'
  }
  
  // European locales
  if (['fr', 'de', 'it', 'es', 'nl'].some(lang => browserLocale.startsWith(lang)) || 
      timezone.includes('Paris') || timezone.includes('Berlin') || timezone.includes('Rome')) {
    return 'eu'
  }
  
  // Default to US
  return 'us'
}