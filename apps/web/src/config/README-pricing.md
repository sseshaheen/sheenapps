# Centralized Pricing Configuration

This directory contains the single source of truth for all pricing-related data in the SheenApps application.

## Overview

The pricing configuration is centralized in `/src/config/pricing-plans.ts` to ensure consistency between:
- Homepage pricing section
- Billing dashboard
- API endpoints
- Usage tracking

## Structure

### 1. **Plan Metadata** (`PLAN_METADATA`)
- Display names
- Descriptions
- Icons and colors
- Popular badges

### 2. **Plan Limits** (`PLAN_LIMITS`)
- Project limits
- AI generation limits
- Export limits
- Storage limits
- Feature flags

### 3. **Plan Features** (`PLAN_FEATURES`)
- Display features for pricing cards
- Human-readable feature lists

### 4. **Pricing Amounts** (`/src/i18n/pricing.ts`)
- Localized pricing per region
- Currency symbols and formatting
- Monthly/yearly pricing

## Usage

### In Components

```typescript
import { 
  PLAN_FEATURES, 
  PLAN_METADATA,
  getPlanLimits,
  type PlanName 
} from '@/config/pricing-plans'
import { getPricingForLocale } from '@/i18n/pricing'

// Get plan metadata
const metadata = PLAN_METADATA['growth']

// Get plan features for display
const features = PLAN_FEATURES['growth']

// Get plan limits for enforcement
const limits = getPlanLimits('growth')

// Get localized pricing
const pricing = getPricingForLocale('en')
```

### Adding a New Plan

1. Add the plan name to `PlanName` type
2. Add metadata to `PLAN_METADATA`
3. Add limits to `PLAN_LIMITS`
4. Add display features to `PLAN_FEATURES`
5. Add pricing to `/src/i18n/pricing.ts` for each locale

### Modifying Features

1. Update the feature in `PLAN_LIMITS[plan].features`
2. Update display text in `PLAN_FEATURES[plan]`
3. Update any UI components that reference the feature

## Best Practices

1. **Never hardcode pricing data** - Always use the centralized config
2. **Use type safety** - Import and use the `PlanName` type
3. **Consider localization** - Features and descriptions should come from translation files
4. **Test limits** - Ensure usage tracking aligns with plan limits

## Related Files

- `/src/i18n/pricing.ts` - Localized pricing amounts
- `/src/types/billing.ts` - Database types for billing
- `/src/hooks/use-billing.ts` - Billing data fetching
- `/src/components/sections/pricing-client.tsx` - Homepage pricing
- `/src/components/dashboard/billing-content.tsx` - Billing dashboard