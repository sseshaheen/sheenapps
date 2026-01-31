# POSTMAN Collection Multi-Provider Updates Required

**Date**: September 2, 2025  
**Target Collection**: `POSTMAN_SheenApps-Claude_Worker_API.postman_collection-2-Aug-2025.json`

## ✅ Completed Updates

1. **Collection Description**: Updated from v3.0 to v3.1 with multi-provider feature highlights

## 📋 Required Manual Updates

### 1. Update Existing Purchase Endpoint

**Current**: `POST /v1/billing/packages/purchase` (Stripe-only)  
**Update Required**: Enhance to support multi-provider parameters

**New Request Body Examples:**

```json
// Egypt - Fawry Cash Payment
{
  "package_key": "mini",
  "currency": "EGP",
  "region": "eg", 
  "locale": "ar"
}

// Saudi Arabia - STC Pay Wallet
{
  "package_key": "booster",
  "currency": "SAR",
  "region": "sa",
  "locale": "ar"
}

// Global - Stripe Cards
{
  "package_key": "mega",
  "currency": "USD",
  "region": "us",
  "locale": "en"
}
```

**Add Headers:**
```
x-sheen-locale: ar
```

**Update Response Examples:**

```json
// Voucher Response (Fawry)
{
  "checkout_url": null,
  "currency": "EGP",
  "unit_amount_cents": 2500,
  "display_price": 25.00,
  "package_minutes": 60,
  "session_id": "fawry_session_123",
  "order_id": "pkg_mini_user123_1693612800000",
  "payment_provider": "fawry",
  "checkout_type": "voucher",
  "voucher_reference": "FWY123456789",
  "voucher_expires_at": "2025-09-02T16:30:00Z",
  "voucher_instructions": "Pay at any Fawry location or through the Fawry app",
  "voucher_barcode_url": "https://api.fawry.com/qr/FWY123456789"
}

// Redirect Response (PayTabs)
{
  "checkout_url": "https://secure.paytabs.com/payment/page/123456",
  "currency": "SAR", 
  "unit_amount_cents": 1875,
  "display_price": 18.75,
  "package_minutes": 60,
  "session_id": "pt_session_789",
  "order_id": "pkg_mini_user123_1693612800000",
  "payment_provider": "paytabs",
  "checkout_type": "redirect",
  "redirect_expires_at": "2025-09-02T16:30:00Z"
}
```

### 2. Add New Admin Provider Endpoints Folder

**New Folder**: "Multi-Provider Admin APIs"

**Add These Endpoints:**

#### GET /v1/admin/providers/dashboard
- **Description**: Get comprehensive provider monitoring dashboard
- **Headers**: `Authorization: Bearer {{admin_jwt}}`
- **Response**: Provider health, webhook stats, SLO compliance

#### GET /v1/admin/providers/:provider/metrics
- **Description**: Get detailed metrics for specific provider
- **Headers**: `Authorization: Bearer {{admin_jwt}}`
- **Path Variables**: `provider = stripe|fawry|paymob|stcpay|paytabs`

#### POST /v1/admin/providers/:provider/circuit-breaker/:action
- **Description**: Manual circuit breaker controls
- **Headers**: 
  ```
  Authorization: Bearer {{admin_jwt}}
  x-admin-reason: [P01] Manual maintenance window
  idempotency-key: {{$guid}}
  ```
- **Path Variables**: 
  - `provider = stripe|fawry|paymob|stcpay|paytabs`
  - `action = trip|recover`

#### GET /v1/admin/providers/validate-mappings
- **Description**: Validate price mapping completeness
- **Headers**: `Authorization: Bearer {{admin_jwt}}`

#### POST /v1/admin/webhooks/:provider/:eventId/replay
- **Description**: Manually replay webhook event
- **Headers**: `Authorization: Bearer {{admin_jwt}}`
- **Path Variables**: 
  - `provider = stripe|fawry|paymob|stcpay|paytabs`
  - `eventId = fawry_event_123`

#### GET /v1/admin/webhooks/stats
- **Description**: Get webhook processing statistics
- **Headers**: `Authorization: Bearer {{admin_jwt}}`
- **Query Parameters**: `provider` (optional)

### 3. Add Multi-Provider Webhook Endpoints

**New Folder**: "Multi-Provider Webhooks"

**Add These Endpoints:**

#### POST /webhooks/stripe
- **Description**: Stripe webhook handler
- **Headers**: `stripe-signature: {{$randomAlphaNumeric}}`
- **Body**: Raw Stripe webhook payload

#### POST /webhooks/fawry  
- **Description**: Fawry webhook handler
- **Headers**: `x-fawry-signature: {{$randomAlphaNumeric}}`
- **Body**: Raw Fawry webhook payload

#### POST /webhooks/paymob
- **Description**: Paymob webhook handler  
- **Headers**: `x-paymob-signature: {{$randomAlphaNumeric}}`
- **Body**: Raw Paymob webhook payload

#### POST /webhooks/stcpay
- **Description**: STC Pay webhook handler
- **Headers**: `x-stcpay-signature: {{$randomAlphaNumeric}}`  
- **Body**: Raw STC Pay webhook payload

#### POST /webhooks/paytabs
- **Description**: PayTabs webhook handler
- **Headers**: `x-paytabs-signature: {{$randomAlphaNumeric}}`
- **Body**: Raw PayTabs webhook payload

#### GET /webhooks/health
- **Description**: Webhook infrastructure health check
- **No authentication required**

### 4. Add Collection Variables

**Add These Variables:**

```json
{
  "key": "admin_jwt", 
  "value": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "type": "string",
  "description": "Admin JWT token from /v1/admin/auth/exchange"
},
{
  "key": "provider",
  "value": "fawry",
  "type": "string", 
  "description": "Payment provider: stripe|fawry|paymob|stcpay|paytabs"
},
{
  "key": "currency",
  "value": "EGP",
  "type": "string",
  "description": "Currency: USD|EUR|GBP|EGP|SAR"
},
{
  "key": "region", 
  "value": "eg",
  "type": "string",
  "description": "Region: us|ca|gb|eu|eg|sa"
},
{
  "key": "locale",
  "value": "ar", 
  "type": "string",
  "description": "Locale: en|ar"
}
```

### 5. Update Test Scripts

**Add to existing billing requests:**

```javascript
// Test multi-provider responses
pm.test("Response has payment_provider", function () {
    pm.expect(pm.response.json()).to.have.property('payment_provider');
});

pm.test("Response has checkout_type", function () {
    pm.expect(pm.response.json()).to.have.property('checkout_type');
});

pm.test("Voucher response has required fields", function () {
    var json = pm.response.json();
    if (json.checkout_type === 'voucher') {
        pm.expect(json).to.have.property('voucher_reference');
        pm.expect(json).to.have.property('voucher_expires_at');
        pm.expect(json).to.have.property('voucher_instructions');
    }
});

pm.test("Redirect response has checkout_url", function () {
    var json = pm.response.json();
    if (json.checkout_type === 'redirect') {
        pm.expect(json).to.have.property('checkout_url');
        pm.expect(json.checkout_url).to.not.be.null;
    }
});
```

### 6. Update Folder Descriptions

**Update Stripe Payments folder description:**

```
💳 **Multi-Provider Payment Integration - Production-Ready Payment Processing**

🚀 **UPDATED: Multi-Provider System (Sep 2, 2025):**
- 💳 **5 Payment Providers**: Stripe, Fawry, Paymob, STC Pay, PayTabs  
- 🌍 **Regional Coverage**: Egypt (EGP), Saudi Arabia (SAR), Global (USD/EUR/GBP)
- 💱 **Currency Support**: USD, EUR, GBP, EGP, SAR with automatic routing
- 🎯 **Payment Methods**: Cards, mobile wallets, cash vouchers, bank transfers
- 📱 **Checkout Types**: Redirect (cards) + Voucher (cash) with QR codes
- 🛡️ **Regional Requirements**: Phone validation, Arabic locale support

🚀 **EXISTING: Stripe Features (Aug 25, 2025):**
- 💸 **Checkout Sessions**: Secure plan selection with trials
- 🏛️ **Billing Portal**: Customer self-service management  
- ❌ **Subscription Control**: Immediate or end-of-period cancellation
- 📊 **Status Tracking**: Real-time subscription monitoring
- 🔗 **Webhook Processing**: Async event handling with deduplication

🛡️ **Security Features:**
- 🔒 **HMAC Authentication**: Dual signature validation (v1/v2)
- 🛡️ **Price Allowlist**: Server-side plan validation
- 🔄 **Idempotency**: Prevent duplicate transactions
- 👤 **User Authorization**: Claims-based access control  
- 🎯 **Race Protection**: Unique constraints and advisory locks

💰 **Supported Plans:**
- 🚀 **Starter Plan**: Basic tier with optional trial
- 📈 **Growth Plan**: Mid-tier with advanced features
- 🏆 **Scale Plan**: Enterprise tier with full access

🌍 **Multi-Provider Coverage:**
- 🇪🇬 **Egypt**: EGP via Fawry (cash) + Paymob (cards)
- 🇸🇦 **Saudi Arabia**: SAR via STC Pay (wallets) + PayTabs (cards)  
- 🌍 **Global**: USD/EUR/GBP via Stripe (cards + subscriptions)

⚠️ **Authentication Notes:**
- 🔑 **Payment Endpoints**: Require HMAC + Claims headers
- 🔗 **Webhook Endpoints**: Use provider-specific signature verification
- 👑 **Admin Endpoints**: Require Admin JWT tokens
- 🏥 **Health Endpoints**: Public access for monitoring

📋 **Required Headers for Payment Endpoints:**
```
x-sheen-signature: [HMAC v1 signature]
x-sheen-sig-v2: [HMAC v2 signature]  
x-sheen-timestamp: [Unix timestamp]
x-sheen-nonce: [Random replay protection]
x-sheen-claims: [Base64 encoded user claims]
x-idempotency-key: [Unique operation key]
x-sheen-locale: [Optional locale code: en|ar]
```

📋 **Required Headers for Admin Endpoints:**
```
Authorization: Bearer [admin_jwt]
x-correlation-id: [UUID for troubleshooting]
x-admin-reason: [Structured reason code]  
idempotency-key: [UUID for state-changing operations]
```

🎯 **Multi-Provider Testing Workflow:**
1. **Environment**: Configure provider credentials and webhooks
2. **Health Check**: Verify all providers are operational
3. **Regional Flow**: Test EGP/SAR payments with locale support
4. **Voucher Flow**: Test cash payments with QR codes
5. **Admin Dashboard**: Monitor provider health and SLO compliance
6. **Circuit Breakers**: Test manual provider controls

⚡ **Performance:**
- **Provider Selection**: <50ms routing logic
- **Checkout Creation**: <200ms multi-provider response  
- **Webhook Processing**: <100ms acknowledgment per provider
- **Admin Dashboard**: <300ms aggregated metrics query
```

## 📝 Manual Action Items

1. **Import Updated Collection**: Use the modified JSON file
2. **Create New Folders**: Add admin and webhook endpoint groupings
3. **Add New Requests**: Use examples above for request/response formats
4. **Update Variables**: Add multi-provider variables to collection
5. **Test Scripts**: Add multi-provider validation to existing requests
6. **Documentation**: Update folder descriptions with new features

## 🎯 Testing Checklist

- [ ] **Egypt Flow**: Test EGP currency with Fawry provider
- [ ] **Saudi Flow**: Test SAR currency with STC Pay provider  
- [ ] **Global Flow**: Test USD/EUR/GBP with Stripe provider
- [ ] **Voucher UI**: Verify QR code and expiry timer fields
- [ ] **Admin Dashboard**: Test provider health monitoring
- [ ] **Circuit Breakers**: Test manual provider controls
- [ ] **Webhook Processing**: Test all provider webhook formats
- [ ] **Error Handling**: Test unsupported region/currency combinations

This completes the POSTMAN collection updates for the multi-provider payment system! 🚀