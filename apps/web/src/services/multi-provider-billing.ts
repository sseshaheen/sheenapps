/**
 * Multi-Provider Billing Service
 * Handles checkout creation, status polling, and error management
 * Based on MULTI_PROVIDER_FRONTEND_INTEGRATION_PLAN.md
 */

'use client'

import type { 
  MultiProviderPurchaseRequest,
  MultiProviderCheckoutResult,
  VoucherStatusResponse,
  MultiProviderError,
  SupportedCurrency,
  RegionCode,
  LocaleCode
} from '@/types/billing'
import { 
  generateIdempotencyKey, 
  isMultiProviderError,
  getRegionForCurrency 
} from '@/types/billing'
import { getRegionalDefaults } from '@/utils/regional-config'
import { logger } from '@/utils/logger'

/**
 * Multi-provider billing service class
 */
export class MultiProviderBillingService {
  private static instance: MultiProviderBillingService
  
  public static getInstance(): MultiProviderBillingService {
    if (!MultiProviderBillingService.instance) {
      MultiProviderBillingService.instance = new MultiProviderBillingService()
    }
    return MultiProviderBillingService.instance
  }

  /**
   * Create a multi-provider checkout session
   */
  async createCheckout(request: {
    packageKey: string
    currency: SupportedCurrency
    userId: string
    region?: RegionCode
    locale?: LocaleCode
    phone?: string
    resumeToken?: string
  }): Promise<MultiProviderCheckoutResult> {
    
    const startTime = Date.now()
    
    // Expert: Generate client-side idempotency key for multi-tab protection
    const idempotencyKey = generateIdempotencyKey('checkout', request.userId, request.packageKey)
    
    // Apply regional defaults
    const region = request.region || getRegionForCurrency(request.currency)
    const locale = request.locale || this.detectUserLocale()
    
    // Get collected phone from sessionStorage if available
    const phone = request.phone || this.getCollectedPhone(region)
    
    logger.info('Multi-provider checkout initiated', {
      package_key: request.packageKey,
      currency: request.currency,
      region,
      locale,
      has_phone: !!phone,
      has_resume_token: !!request.resumeToken,
      idempotency_key: idempotencyKey
    }, 'billing')

    try {
      // Prepare API request
      const apiRequest: MultiProviderPurchaseRequest = {
        package_key: request.packageKey,
        currency: request.currency,
        region,
        // locale removed from body - now using x-sheen-locale header
        idempotencyKey,
        phone,
        resumeToken: request.resumeToken
      }

      // Call our multi-provider API endpoint
      const response = await fetch('/api/billing/purchase-package', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sheen-locale': locale,
          // Expert: Client cache busting
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(apiRequest)
      })

      if (!response.ok) {
        const errorData = await response.json()
        
        // Handle multi-provider specific errors
        if (response.status === 400 && isMultiProviderError(errorData)) {
          logger.warn('Multi-provider checkout blocked', {
            error_code: errorData.error,
            provider: errorData.provider,
            region: errorData.region,
            currency: errorData.currency
          }, 'billing')
          throw errorData
        }
        
        // Handle insufficient funds
        if (response.status === 402) {
          logger.info('Insufficient funds for checkout', {
            package_key: request.packageKey,
            currency: request.currency
          }, 'billing')
          throw errorData
        }
        
        throw new Error(`HTTP ${response.status}: ${errorData.message || 'Checkout failed'}`)
      }

      const result = await response.json() as MultiProviderCheckoutResult
      
      logger.info('Multi-provider checkout created', {
        order_id: result.order_id,
        checkout_type: result.checkout_type,
        payment_provider: result.payment_provider,
        currency: result.currency,
        duration_ms: Date.now() - startTime
      }, 'billing')

      return result

    } catch (error) {
      logger.error('Multi-provider checkout failed', {
        package_key: request.packageKey,
        currency: request.currency,
        region,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime
      }, 'billing')
      
      throw error
    }
  }

  /**
   * Check voucher payment status
   */
  async checkVoucherStatus(orderId: string): Promise<VoucherStatusResponse> {
    logger.debug('billing', `Checking voucher status: ${orderId}`)

    try {
      const response = await fetch(`/api/billing/invoices/${orderId}/status`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Order not found: ${orderId}`)
        }
        if (response.status === 410) {
          // Expired - still return the data
          const data = await response.json()
          return data as VoucherStatusResponse
        }
        if (response.status === 409) {
          // Voided - still return the data
          const data = await response.json()
          return data as VoucherStatusResponse
        }
        throw new Error(`HTTP ${response.status}: Failed to check status`)
      }

      const data = await response.json() as VoucherStatusResponse
      
      logger.debug('billing', 'Voucher status checked', {
        order_id: orderId,
        status: data.status,
        provider: data.payment_provider
      })

      return data

    } catch (error) {
      logger.error('Voucher status check failed', {
        order_id: orderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'billing')
      throw error
    }
  }

  /**
   * Store phone number for session (MVP approach)
   */
  storePhoneForSession(phone: string, region: RegionCode): void {
    sessionStorage.setItem('collected-phone', phone)
    sessionStorage.setItem('collected-phone-region', region)
    sessionStorage.setItem('collected-phone-timestamp', Date.now().toString())
    
    logger.debug('billing', 'Phone stored for session', {
      region,
      phone_masked: phone.replace(/(\d{4})\d+(\d{2})/, '$1****$2')
    })
  }

  /**
   * Get collected phone number from session storage
   */
  private getCollectedPhone(region: RegionCode): string | undefined {
    const storedPhone = sessionStorage.getItem('collected-phone')
    const storedRegion = sessionStorage.getItem('collected-phone-region')
    const storedTimestamp = sessionStorage.getItem('collected-phone-timestamp')
    
    // Check if phone is for the same region and not too old (30 minutes)
    if (storedPhone && storedRegion === region && storedTimestamp) {
      const age = Date.now() - parseInt(storedTimestamp)
      if (age < 30 * 60 * 1000) { // 30 minutes
        return storedPhone
      }
    }
    
    return undefined
  }

  /**
   * Clear stored phone data
   */
  clearStoredPhone(): void {
    sessionStorage.removeItem('collected-phone')
    sessionStorage.removeItem('collected-phone-region')
    sessionStorage.removeItem('collected-phone-timestamp')
    
    logger.debug('billing', 'Stored phone cleared')
  }

  /**
   * Detect user locale from browser/system
   */
  private detectUserLocale(): LocaleCode {
    if (typeof window === 'undefined') return 'en'
    
    const browserLocale = navigator.language.toLowerCase()
    return browserLocale.includes('ar') ? 'ar' : 'en'
  }

  /**
   * Get user's regional configuration
   */
  getUserRegionalConfig() {
    return getRegionalDefaults()
  }

  /**
   * Validate if a package purchase is supported in current region
   */
  async validatePackageSupport(
    packageKey: string, 
    currency: SupportedCurrency, 
    region: RegionCode
  ): Promise<{ supported: boolean; alternatives?: string[] }> {
    
    // This could be enhanced to call a backend validation endpoint
    // For now, basic validation based on our regional config
    
    const regionalConfig = getRegionalDefaults()
    const supportedCurrencies = regionalConfig.supported_currencies
    
    if (!supportedCurrencies.includes(currency)) {
      return {
        supported: false,
        alternatives: supportedCurrencies
      }
    }
    
    return { supported: true }
  }
}

// Export singleton instance
export const multiProviderBilling = MultiProviderBillingService.getInstance()