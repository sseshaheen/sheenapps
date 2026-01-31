/**
 * Currency-Aware Pricing Catalog Hooks (Week 2 Implementation)
 * Expert-enhanced pricing system with currency fallback support
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, useEffect } from 'react';
import type { CurrencyAwareCatalog } from '@/types/billing';
import { logger } from '@/utils/logger';

// Supported currencies (synchronized with backend API)
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

/**
 * Fetch pricing catalog with ETag caching support (Expert recommendation)
 */
async function fetchPricingCatalog(
  currency: SupportedCurrency,
  lastETag?: string
): Promise<CurrencyAwareCatalog | null> {
  const params = new URLSearchParams({
    currency,
    _t: Date.now().toString() // Cache-busting for browser disk cache
  });

  const headers: Record<string, string> = {
    'Cache-Control': 'no-cache'
  };

  // Add ETag header for conditional requests (Expert pattern)
  if (lastETag) {
    headers['If-None-Match'] = lastETag;
  }

  const response = await fetch(`/api/v1/billing/catalog?${params}`, {
    headers,
    cache: 'no-store'
  });

  // Handle 304 Not Modified - use cached version
  if (response.status === 304) {
    logger.info('📦 Pricing catalog: Using cached version (ETag match)', { currency });
    return null; // React Query will use cached data
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch pricing catalog: ${response.status}`);
  }

  const catalog: CurrencyAwareCatalog = await response.json();
  
  // Log currency fallback for user notification (Expert enhancement)
  if (catalog.currency_fallback_from && catalog.currency_fallback_from !== currency) {
    logger.warn(`💱 Currency fallback: ${catalog.currency_fallback_from} → ${currency}`, {
      requested: catalog.currency_fallback_from,
      provided: currency
    });
  }

  return catalog;
}

/**
 * Currency-Aware Pricing Catalog Hook (Expert recommendation)
 * Implements ETag caching with currency isolation and intelligent fallback handling
 */
export function usePricingCatalog(currency: SupportedCurrency = 'USD') {
  return useQuery({
    queryKey: ['pricing-catalog', currency],
    queryFn: () => fetchPricingCatalog(currency),
    staleTime: 0,                 // Consider stale immediately for currency switching
    refetchInterval: false,       // Only refetch on demand
    refetchOnWindowFocus: false,  // ETag handles updates
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

// Create a global currency state that all components can subscribe to
let globalCurrency: SupportedCurrency = 'USD';
const currencyListeners = new Set<(currency: SupportedCurrency) => void>();

// Initialize global currency from localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('preferred-currency');
  if (stored && SUPPORTED_CURRENCIES.includes(stored as SupportedCurrency)) {
    globalCurrency = stored as SupportedCurrency;
  } else {
    globalCurrency = detectCurrencyFromLocale();
  }
}

function updateGlobalCurrency(newCurrency: SupportedCurrency) {
  console.log('🌍 Global currency updating from', globalCurrency, 'to', newCurrency);
  globalCurrency = newCurrency;
  localStorage.setItem('preferred-currency', newCurrency);
  
  // Notify all subscribers
  currencyListeners.forEach(listener => {
    try {
      listener(newCurrency);
    } catch (error) {
      console.error('Currency listener error:', error);
    }
  });
}

/**
 * Currency Preference Management Hook (Expert enhancement)
 * Persists user's preferred currency for stable catalog queries with reactive updates
 */
export function useCurrencyPreference() {
  const [currency, setCurrency] = useState<SupportedCurrency>(globalCurrency);

  // Subscribe to global currency changes
  useEffect(() => {
    const listener = (newCurrency: SupportedCurrency) => {
      console.log('🔔 Component received currency update:', newCurrency);
      setCurrency(newCurrency);
    };
    
    currencyListeners.add(listener);
    
    return () => {
      currencyListeners.delete(listener);
    };
  }, []);

  const setCurrencyPreference = useCallback(async (newCurrency: SupportedCurrency) => {
    // Update global state which will notify all subscribers
    updateGlobalCurrency(newCurrency);
  }, []);

  const getCurrencyPreference = useCallback((): SupportedCurrency => {
    return currency;
  }, [currency]);

  return {
    setCurrencyPreference,
    getCurrencyPreference,
    currency, // Direct access to reactive currency state
    supportedCurrencies: SUPPORTED_CURRENCIES
  };
}

/**
 * Detect currency from browser locale (Expert pattern)
 */
function detectCurrencyFromLocale(): SupportedCurrency {
  if (typeof window === 'undefined') return 'USD';
  
  const locale = navigator.language || 'en-US';
  
  // Map common locales to supported currencies (backend-synchronized)
  const localeCurrencyMap: Record<string, SupportedCurrency> = {
    'ar-EG': 'EGP',
    'ar-SA': 'SAR',  
    'ar-AE': 'AED',
    'en-GB': 'GBP',
    'fr-FR': 'EUR',
    'de-DE': 'EUR',
    'es-ES': 'EUR',
  };
  
  return localeCurrencyMap[locale] || 'USD';
}

/**
 * Currency Fallback Notification Component Data Hook (Expert enhancement)
 */
export function useCurrencyFallbackNotification(catalog?: CurrencyAwareCatalog) {
  if (!catalog?.currency_fallback_from) {
    return null;
  }

  // Only show notification if there's actually a fallback (requested != provided)
  const requestedCurrency = catalog.currency_fallback_from;
  const providedCurrency = catalog.currency || 'USD';
  
  if (requestedCurrency === providedCurrency) {
    // Not a real fallback, just API metadata - don't show notification
    return null;
  }

  return {
    show: true,
    message: `Prices shown in ${providedCurrency}`,
    detail: `${requestedCurrency} pricing not available`,
    requestedCurrency,
    providedCurrency
  };
}

/**
 * Multi-Currency Purchase Flow Hook (Expert enhancement)
 * Handles currency selection and fallback notifications in purchase flows
 */
export function useCurrencyAwarePurchase() {
  const { getCurrencyPreference } = useCurrencyPreference();
  const preferredCurrency = getCurrencyPreference();
  
  const { data: catalog, isLoading, error } = usePricingCatalog(preferredCurrency);
  
  const fallbackNotification = useCurrencyFallbackNotification(catalog);

  return {
    catalog,
    isLoading,
    error,
    fallbackNotification,
    preferredCurrency,
    hasValidPricing: !!(catalog && !error)
  };
}

/**
 * Currency Display Utilities (Expert enhancement)
 */
export function formatCurrencyAmount(
  amount: number,
  currency: SupportedCurrency,
  options: Intl.NumberFormatOptions = {}
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options
  }).format(amount);
}

/**
 * Locale-aware currency formatting with Arabic currency names
 */
export function formatCurrencyAmountLocalized(
  amount: number,
  currency: SupportedCurrency,
  locale?: string,
  translations?: any,
  options: Intl.NumberFormatOptions = {}
): string {
  // For Arabic locales, use custom formatting with translated currency names
  if (locale?.startsWith('ar') && translations?.currencies?.[currency]) {
    const symbol = getCurrencySymbol(currency);
    const formattedNumber = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      ...options
    }).format(amount);

    const currencyName = translations.currencies[currency];
    return `${formattedNumber} ${currencyName}`;
  }

  // Fallback to standard formatting
  return formatCurrencyAmount(amount, currency, options);
}

export function getCurrencySymbol(currency: SupportedCurrency): string {
  const symbols: Record<SupportedCurrency, string> = {
    'USD': '$',
    'EUR': '€', 
    'GBP': '£',
    'EGP': 'ج.م',
    'SAR': '﷼',
    'AED': 'د.إ'
  };
  
  return symbols[currency] || '$';
}