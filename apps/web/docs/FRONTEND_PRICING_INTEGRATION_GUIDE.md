# Frontend Pricing Integration Guide

**Quick Summary**: Backend now calculates yearly prices with professional multi-currency pricing. Remove hardcoded `monthlyPrice * 0.8` and use API responses.

## 🔧 **What Changed**

- ❌ **Remove**: Hardcoded `yearlyPrice = monthlyPrice * 0.8` calculations
- ✅ **Use**: Backend-provided `yearlyPrice` and `displayedDiscount` from API

## 📡 **API Changes**

### Updated Response Format

**Endpoint**: `GET /api/pricing/catalog?currency=USD`

```typescript
interface SubscriptionPlan {
  key: string;
  name: string;
  minutes: number;
  price: number;              // Monthly price (backwards compatibility)
  monthlyPrice: number;       // ✅ NEW: Explicit monthly price
  yearlyPrice: number;        // ✅ NEW: Backend-calculated yearly price
  displayedDiscount?: number; // ✅ NEW: Marketing-safe discount % (0-100)
  yearlyDiscount?: number;    // Database discount % (for reference)
  // ... existing fields
}
```

### Example Response

```json
{
  "subscriptions": [
    {
      "key": "free",
      "name": "Free",
      "monthlyPrice": 0.00,
      "yearlyPrice": 0.00,
      "price": 0.00
    },
    {
      "key": "pro",
      "name": "Pro", 
      "monthlyPrice": 30.00,
      "yearlyPrice": 287.50,
      "displayedDiscount": 20.1,
      "price": 30.00
    }
  ]
}
```

## 🎨 **Frontend Implementation**

### Before (Remove This)

```javascript
// ❌ DELETE: Hardcoded calculation
const yearlyPrice = monthlyPrice * 0.8; // 20% discount
```

### After (Use This)

```javascript
// ✅ CORRECT: Use backend values
const { monthlyPrice, yearlyPrice, displayedDiscount } = subscription;

// Display pricing
<div className="pricing-toggle">
  <div className="monthly">
    ${monthlyPrice}/month
  </div>
  <div className="yearly">
    ${yearlyPrice}/year
    {displayedDiscount > 0 && (
      <span className="discount">
        Save at least {displayedDiscount}%
      </span>
    )}
  </div>
</div>
```

## 💰 **Marketing Copy Guidelines**

### Safe Discount Display

```typescript
function renderDiscount(displayedDiscount: number): string {
  if (!displayedDiscount || displayedDiscount === 0) {
    return ''; // Don't show discount for free tier
  }
  
  // Use "at least" for marketing safety (backend uses floor rounding)
  const formatted = displayedDiscount % 1 === 0 
    ? displayedDiscount.toString() 
    : displayedDiscount.toFixed(1);
    
  return `Save at least ${formatted}%`;
}
```

### ✅ Safe Patterns
- "Save at least 20%" ← Floor-rounded, never overstates
- "Save at least 20.1%" ← Exact percentage with disclaimer

### ❌ Avoid These
- "Save 20%" ← Without "at least", could be inaccurate
- Custom discount calculations ← Backend handles all pricing math

## 🌍 **Multi-Currency Support**

### Currency-Specific Professional Pricing

The backend automatically applies professional pricing rules:

- **USD/EUR/GBP**: Prices end in `.00` or `.50`
- **EGP**: Prices end in multiples of `5.00` 
- **SAR/AED**: Prices end in whole units (`.00`)

**Frontend**: Just display the prices from API - they're already professionally formatted.

### Example Multi-Currency

```typescript
// Backend returns currency-appropriate pricing automatically
const pricingData = await fetch('/api/pricing/catalog?currency=EGP');

// E£250.00/month, E£2395.00/year (professional E£5 increments)
// $30.00/month, $287.50/year (professional $0.50 increments)
```

## 🛒 **Checkout Integration**

**Critical**: Stripe checkout prices will match displayed prices exactly.

```typescript
// ✅ CORRECT: Prices match between display and checkout
const stripeSession = await stripe.checkout.sessions.create({
  line_items: [{
    price: subscription.stripe_price_id, // Backend creates from same beautified prices
    quantity: 1,
  }]
});
```

**No Action Needed**: Backend ensures display-checkout consistency automatically.

## 🧪 **Testing Checklist**

### Required Tests

1. **Price Display**: Verify `yearlyPrice` from API is used (not calculated)
2. **Discount Banner**: Only show when `displayedDiscount > 0`
3. **Free Tier**: No discount banner for `displayedDiscount: 0`
4. **Multi-Currency**: Test all 6 currencies show professional pricing
5. **Checkout Consistency**: Display price matches Stripe checkout

### Test Cases

```typescript
// Test professional pricing display
expect(getDisplayPrice('pro', 'USD')).toBe('$30.00'); // Not $29.99
expect(getYearlyPrice('pro', 'USD')).toBe('$287.50'); // Not calculated
expect(getDiscountText('pro', 'USD')).toBe('Save at least 20.1%');

// Test free tier
expect(getDiscountText('free', 'USD')).toBe(''); // No discount shown
```

## 🚀 **Deployment Steps**

1. **Backend First**: Ensure backend deployment includes new API fields
2. **Update API Calls**: Verify responses include `monthlyPrice`, `yearlyPrice`, `displayedDiscount`
3. **Remove Calculations**: Delete all `monthlyPrice * 0.8` code
4. **Update UI**: Use new fields for pricing display
5. **Test Multi-Currency**: Verify all 6 currencies work correctly
6. **Verify Checkout**: Confirm Stripe prices match display prices

## 📞 **Support**

**Backend API**: Already deployed and ready  
**Pricing Logic**: Fully handled by backend - no frontend calculations needed  
**Professional Pricing**: Automatically applied per currency  
**Customer Trust**: Floor rounding ensures customers never overpay  

**Questions?** The backend team has comprehensive tests (33 passing) covering all edge cases and multi-currency scenarios.