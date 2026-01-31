# Frontend Multi-Provider Promotions Integration Guide

*Quick start guide for frontend team - September 2, 2025*

## Overview

The backend now supports 5 payment providers (Stripe, Fawry, Paymob, STC Pay, PayTabs) with full validation and regional preferences. All endpoints are production-ready.

## Key API Endpoints

### 1. Validate Promotion Configuration
**POST /admin/promotions/validate**

Real-time validation with scenario testing:

```typescript
const response = await fetch('/admin/promotions/validate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    promotion_config: {
      name: "Egypt Summer Sale",
      discount_type: "fixed_amount",
      discount_value: 500,
      currency: "EGP", // Will be normalized to uppercase
      supported_providers: ["fawry", "paymob"],
      codes: ["SUMMER2025"]
    },
    test_scenarios: [{
      region: "eg",
      currency: "EGP", 
      order_amount: 10000,
      provider: "fawry"
    }]
  })
});

// Response
{
  "valid": true,
  "warnings": ["Only two providers selected"],
  "scenario_results": [{
    "eligible": true,
    "discount_amount": 500,
    "final_amount": 9500,
    "selected_provider": "fawry"
  }]
}
```

### 2. Get Provider Capabilities
**GET /admin/providers/availability**

```typescript
const providers = await fetch('/admin/providers/availability', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Use for UI constraints
providers.forEach(p => {
  if (p.key === 'fawry') {
    console.log(p.supported_currencies); // ["EGP"]
    console.log(p.features.max_discount_percentage); // 50
  }
});
```

### 3. Get Regional Defaults
**GET /admin/promotions/regional-defaults?region=eg**

```typescript
const defaults = await fetch('/admin/promotions/regional-defaults?region=eg');
// Response: { providers: ["fawry", "paymob"], currency: "EGP" }

// Use to pre-populate form based on admin's region
```

### 4. Create Multi-Provider Promotion
**POST /admin/promotions/multi-provider**

```typescript
const result = await fetch('/admin/promotions/multi-provider', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-admin-reason': 'Creating regional campaign for Egypt market'
  },
  body: JSON.stringify(promotionConfig)
});
```

## TypeScript Types

Copy these types for your frontend:

```typescript
// Core types
type PaymentProvider = 'stripe' | 'fawry' | 'paymob' | 'stcpay' | 'paytabs';
type Currency = 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR';
type Region = 'us' | 'ca' | 'gb' | 'eu' | 'eg' | 'sa';
type CheckoutType = 'redirect' | 'voucher';

// Promotion request
interface PromotionRequest {
  name: string;
  description?: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  currency?: Currency; // Required for fixed_amount
  codes: string[];
  
  // Multi-provider fields
  supported_providers?: PaymentProvider[];
  checkout_type_restrictions?: CheckoutType[];
  minimum_order_amount?: number;
  minimum_order_currency?: Currency;
  
  // Regional config
  regional_configs?: {
    region_code: Region;
    preferred_providers?: PaymentProvider[];
    localized_name?: { [locale: string]: string };
  }[];
}
```

## Validation Rules

### ✅ Valid Configurations
```typescript
// Percentage discount (no currency)
{ discount_type: 'percentage', discount_value: 20, currency: undefined }

// Fixed amount (requires currency)  
{ discount_type: 'fixed_amount', discount_value: 500, currency: 'EGP' }

// Provider-currency compatibility
{ supported_providers: ['fawry', 'paymob'], currency: 'EGP' } // ✓ Both support EGP
```

### ❌ Invalid Configurations
```typescript
// These will be rejected by validation:
{ discount_type: 'percentage', currency: 'USD' } // ❌ Percentage can't have currency
{ discount_type: 'fixed_amount', currency: null } // ❌ Fixed needs currency  
{ supported_providers: ['stripe'], currency: 'EGP' } // ❌ Stripe doesn't support EGP
{ checkout_type_restrictions: [] } // ❌ Empty array not allowed (use null/undefined)
```

## Regional Smart Defaults

```typescript
const REGIONAL_DEFAULTS = {
  'eg': { providers: ['fawry', 'paymob'], currency: 'EGP' },
  'sa': { providers: ['stcpay', 'paytabs'], currency: 'SAR' },
  'us': { providers: ['stripe'], currency: 'USD' },
  'eu': { providers: ['stripe'], currency: 'EUR' }
};

// Auto-populate based on detected region
function getDefaults(region: Region) {
  return REGIONAL_DEFAULTS[region] || REGIONAL_DEFAULTS.us;
}
```

## UI Implementation Tips

### 1. Progressive Disclosure
```tsx
// Show basic fields first, advanced in collapsible section
<BasicFields />
<Collapsible title="Multi-Provider Configuration">
  <ProviderSelector />
  <CurrencyConfig />
  <RegionalSettings />
</Collapsible>
```

### 2. Real-time Validation
```tsx
// Validate on form change with debouncing
const { data: validation } = useQuery({
  queryKey: ['validate-promotion', formData],
  queryFn: () => validatePromotion(formData),
  enabled: !!formData.name,
  staleTime: 5000
});

// Show errors/warnings immediately
{validation?.errors?.map(error => <Alert type="error">{error}</Alert>)}
```

### 3. Provider Selection UI
```tsx
// Group providers by region
const ProviderSelector = () => (
  <div>
    <ProviderGroup title="Global">
      <ProviderCard provider="stripe" />
    </ProviderGroup>
    <ProviderGroup title="Egypt">
      <ProviderCard provider="fawry" />
      <ProviderCard provider="paymob" />
    </ProviderGroup>
  </div>
);
```

## Error Handling

```typescript
// API responses include correlation IDs for debugging
if (!response.ok) {
  const error = await response.json();
  console.error('Promotion error:', {
    message: error.error,
    correlationId: error.correlation_id,
    details: error.details
  });
}
```

## Feature Flags

```typescript
// Check if multi-provider feature is enabled
const isMultiProviderEnabled = featureFlags.ENABLE_MULTI_PROVIDER_PROMOTIONS;

// Show legacy form vs new multi-provider form
{isMultiProviderEnabled ? <MultiProviderForm /> : <LegacyForm />}
```

## Rate Limits

- Validation endpoint: 60 requests/minute
- Creation endpoint: 10 requests/hour  
- Provider availability: Cached for 5 minutes

## Required Headers

- `Authorization: Bearer <jwt_token>`
- `x-admin-reason: "Description of change"` (for write operations)
- `Content-Type: application/json`

## Next Steps

1. Implement provider selection component
2. Add currency validation based on selected providers
3. Create scenario testing UI
4. Add regional configuration interface
5. Enable feature flag and test with staging data

All backend APIs are ready - no waiting required! 🚀