import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  validateProviderCompatibility,
  validatePromotionRequest,
  testPromotionScenario,
  normalizeCurrency,
  normalizeRegion,
  normalizeProvider,
  getRegionalDefaults,
  PromotionRequest,
  TestScenario,
  PaymentProviderKey
} from '../promotionValidationService';

describe('PromotionValidationService', () => {
  
  describe('Normalization Functions', () => {
    describe('normalizeCurrency', () => {
      it('should uppercase currency codes', () => {
        expect(normalizeCurrency('usd')).toBe('USD');
        expect(normalizeCurrency('eur')).toBe('EUR');
        expect(normalizeCurrency('egp')).toBe('EGP');
      });
      
      it('should trim whitespace', () => {
        expect(normalizeCurrency(' USD ')).toBe('USD');
      });
      
      it('should return undefined for undefined input', () => {
        expect(normalizeCurrency(undefined)).toBeUndefined();
      });
      
      it('should throw error for invalid currency', () => {
        expect(() => normalizeCurrency('XYZ')).toThrow('Invalid currency: XYZ');
      });
    });
    
    describe('normalizeRegion', () => {
      it('should lowercase region codes', () => {
        expect(normalizeRegion('US')).toBe('us');
        expect(normalizeRegion('EG')).toBe('eg');
        expect(normalizeRegion('SA')).toBe('sa');
      });
      
      it('should trim whitespace', () => {
        expect(normalizeRegion(' US ')).toBe('us');
      });
      
      it('should throw error for invalid region', () => {
        expect(() => normalizeRegion('XX')).toThrow('Invalid region: XX');
      });
    });
    
    describe('normalizeProvider', () => {
      it('should lowercase provider names', () => {
        expect(normalizeProvider('STRIPE')).toBe('stripe');
        expect(normalizeProvider('Fawry')).toBe('fawry');
        expect(normalizeProvider('PayMob')).toBe('paymob');
      });
      
      it('should throw error for invalid provider', () => {
        expect(() => normalizeProvider('invalid')).toThrow('Invalid provider: invalid');
      });
    });
  });
  
  describe('Provider Compatibility Validation', () => {
    it('should reject incompatible currency-provider pairs', () => {
      const result = validateProviderCompatibility(
        ['stripe'] as PaymentProviderKey[],
        'EGP' // Stripe doesn't support EGP
      );
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No selected provider supports EGP');
    });
    
    it('should accept compatible currency-provider pairs', () => {
      const result = validateProviderCompatibility(
        ['fawry', 'paymob'] as PaymentProviderKey[],
        'EGP'
      );
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should validate checkout type support', () => {
      const result = validateProviderCompatibility(
        ['stripe'] as PaymentProviderKey[],
        'USD',
        ['voucher'] // Stripe doesn't support voucher
      );
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No selected provider supports voucher checkout');
    });
    
    it('should warn about single provider configuration', () => {
      const result = validateProviderCompatibility(
        ['stripe'] as PaymentProviderKey[],
        'USD'
      );
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Only one provider selected - consider adding more for redundancy');
    });
    
    it('should error if no providers selected', () => {
      const result = validateProviderCompatibility([], 'USD');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one payment provider must be selected');
    });
    
    it('should warn about mixed checkout types', () => {
      const result = validateProviderCompatibility(
        ['fawry', 'paymob'] as PaymentProviderKey[], // One voucher, one redirect
        'EGP'
      );
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'Mixed checkout types available - consider setting checkout_type_restrictions for consistency'
      );
    });
  });
  
  describe('Promotion Request Validation', () => {
    let validRequest: PromotionRequest;
    
    beforeEach(() => {
      validRequest = {
        name: 'Test Promotion',
        discount_type: 'percentage',
        discount_value: 20,
        codes: ['TEST20'],
        supported_providers: ['stripe'] as PaymentProviderKey[]
      };
    });
    
    it('should accept valid percentage promotion', () => {
      const result = validatePromotionRequest(validRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should reject percentage discount with currency', () => {
      const request = {
        ...validRequest,
        currency: 'USD'
      };
      
      const result = validatePromotionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Percentage discounts cannot have a currency');
    });
    
    it('should reject fixed amount discount without currency', () => {
      const request = {
        ...validRequest,
        discount_type: 'fixed_amount' as const,
        discount_value: 500,
        currency: undefined
      };
      
      const result = validatePromotionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Fixed amount discounts require a currency');
    });
    
    it('should reject invalid percentage values', () => {
      const request = {
        ...validRequest,
        discount_value: 150
      };
      
      const result = validatePromotionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Percentage discount must be between 0 and 100');
    });
    
    it('should reject empty promotion name', () => {
      const request = {
        ...validRequest,
        name: ''
      };
      
      const result = validatePromotionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Promotion name is required');
    });
    
    it('should reject empty codes array', () => {
      const request = {
        ...validRequest,
        codes: []
      };
      
      const result = validatePromotionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one promotion code is required');
    });
    
    it('should reject invalid date ranges', () => {
      const request = {
        ...validRequest,
        valid_from: '2025-01-01',
        valid_until: '2024-12-31'
      };
      
      const result = validatePromotionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('End date must be after start date');
    });
    
    it('should reject mismatched minimum order configuration', () => {
      const request = {
        ...validRequest,
        minimum_order_amount: 1000,
        minimum_order_currency: undefined
      };
      
      const result = validatePromotionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Both minimum order amount and currency must be provided together');
    });
    
    it('should reject empty checkout type restrictions array', () => {
      const request = {
        ...validRequest,
        checkout_type_restrictions: []
      };
      
      const result = validatePromotionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Checkout type restrictions cannot be an empty array. Use null/undefined for no restrictions'
      );
    });
    
    it('should warn about high discount percentage', () => {
      const request = {
        ...validRequest,
        discount_value: 90
      };
      
      const result = validatePromotionRequest(request);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('High discount percentage: 90%');
    });
    
    it('should warn about no usage limits', () => {
      const result = validatePromotionRequest(validRequest);
      expect(result.warnings).toContain('No usage limits set - promotion can be used unlimited times');
    });
    
    it('should validate regional config providers', () => {
      const request = {
        ...validRequest,
        supported_providers: ['stripe'] as PaymentProviderKey[],
        regional_configs: [{
          region_code: 'eg' as const,
          preferred_providers: ['fawry'] as PaymentProviderKey[] // Not in supported list
        }]
      };
      
      const result = validatePromotionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Regional config for eg includes unsupported provider fawry');
    });
    
    it('should reject duplicate regional configs', () => {
      const request = {
        ...validRequest,
        regional_configs: [
          { region_code: 'eg' as const },
          { region_code: 'eg' as const }
        ]
      };
      
      const result = validatePromotionRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duplicate regional configuration for eg');
    });
  });
  
  describe('Promotion Scenario Testing', () => {
    let promotion: PromotionRequest;
    
    beforeEach(() => {
      promotion = {
        name: 'Test Promotion',
        discount_type: 'percentage',
        discount_value: 20,
        codes: ['TEST20'],
        supported_providers: ['stripe', 'fawry'] as PaymentProviderKey[],
        valid_from: '2024-01-01',
        valid_until: '2026-12-31'
      };
    });
    
    it('should calculate percentage discount correctly', () => {
      const scenario: TestScenario = {
        region: 'us',
        currency: 'USD',
        order_amount: 10000 // $100 in cents
      };
      
      const result = testPromotionScenario(promotion, scenario);
      
      expect(result.eligible).toBe(true);
      expect(result.discount_amount).toBe(2000); // 20% of $100
      expect(result.final_amount).toBe(8000);
      expect(result.selected_provider).toBe('stripe');
    });
    
    it('should calculate fixed amount discount correctly', () => {
      const fixedPromotion: PromotionRequest = {
        ...promotion,
        discount_type: 'fixed_amount',
        discount_value: 500, // $5 discount
        currency: 'USD'
      };
      
      const scenario: TestScenario = {
        region: 'us',
        currency: 'USD',
        order_amount: 10000
      };
      
      const result = testPromotionScenario(fixedPromotion, scenario);
      
      expect(result.eligible).toBe(true);
      expect(result.discount_amount).toBe(500);
      expect(result.final_amount).toBe(9500);
    });
    
    it('should reject expired promotions', () => {
      const expiredPromotion: PromotionRequest = {
        ...promotion,
        valid_until: '2020-01-01'
      };
      
      const scenario: TestScenario = {
        region: 'us',
        currency: 'USD',
        order_amount: 10000
      };
      
      const result = testPromotionScenario(expiredPromotion, scenario);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Promotion expired');
    });
    
    it('should reject orders below minimum', () => {
      const minOrderPromotion: PromotionRequest = {
        ...promotion,
        minimum_order_amount: 5000,
        minimum_order_currency: 'USD'
      };
      
      const scenario: TestScenario = {
        region: 'us',
        currency: 'USD',
        order_amount: 2000 // Below minimum
      };
      
      const result = testPromotionScenario(minOrderPromotion, scenario);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Order amount below minimum');
    });
    
    it('should reject currency mismatch for fixed amount', () => {
      const fixedPromotion: PromotionRequest = {
        ...promotion,
        discount_type: 'fixed_amount',
        discount_value: 500,
        currency: 'USD'
      };
      
      const scenario: TestScenario = {
        region: 'eg',
        currency: 'EGP',
        order_amount: 10000
      };
      
      const result = testPromotionScenario(fixedPromotion, scenario);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Currency mismatch: promotion is in USD');
    });
    
    it('should select appropriate provider for currency', () => {
      const scenario: TestScenario = {
        region: 'eg',
        currency: 'EGP',
        order_amount: 10000
      };
      
      const result = testPromotionScenario(promotion, scenario);
      
      expect(result.eligible).toBe(true);
      expect(result.selected_provider).toBe('fawry'); // Only Fawry supports EGP
    });
    
    it('should respect checkout type restrictions', () => {
      const restrictedPromotion: PromotionRequest = {
        ...promotion,
        checkout_type_restrictions: ['redirect']
      };
      
      const scenario: TestScenario = {
        region: 'us',
        currency: 'USD',
        order_amount: 10000,
        checkout_type: 'voucher'
      };
      
      const result = testPromotionScenario(restrictedPromotion, scenario);
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Checkout type voucher not supported');
    });
    
    it('should cap discount at provider maximum', () => {
      const highDiscountPromotion: PromotionRequest = {
        ...promotion,
        discount_value: 80, // 80% discount
        supported_providers: ['fawry'] as PaymentProviderKey[] // Max 50%
      };
      
      const scenario: TestScenario = {
        region: 'eg',
        currency: 'EGP',
        order_amount: 10000
      };
      
      const result = testPromotionScenario(highDiscountPromotion, scenario);
      
      expect(result.eligible).toBe(true);
      expect(result.discount_amount).toBe(5000); // Capped at 50%
      expect(result.reason).toContain('Discount capped at provider maximum: 50%');
    });
  });
  
  describe('Regional Defaults', () => {
    it('should return Egypt defaults for eg region', () => {
      const defaults = getRegionalDefaults('eg');
      
      expect(defaults.providers).toContain('fawry');
      expect(defaults.providers).toContain('paymob');
      expect(defaults.currency).toBe('EGP');
      expect(defaults.checkoutTypes).toContain('voucher');
    });
    
    it('should return Saudi defaults for sa region', () => {
      const defaults = getRegionalDefaults('sa');
      
      expect(defaults.providers).toContain('stcpay');
      expect(defaults.providers).toContain('paytabs');
      expect(defaults.currency).toBe('SAR');
      expect(defaults.checkoutTypes).toContain('redirect');
    });
    
    it('should return US defaults for undefined region', () => {
      const defaults = getRegionalDefaults(undefined);
      
      expect(defaults.providers).toContain('stripe');
      expect(defaults.currency).toBe('USD');
      expect(defaults.checkoutTypes).toContain('redirect');
    });
    
    it('should return EUR for EU region', () => {
      const defaults = getRegionalDefaults('eu');
      
      expect(defaults.providers).toContain('stripe');
      expect(defaults.currency).toBe('EUR');
    });
  });
});