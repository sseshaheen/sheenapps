# Admin Promotion System Testing Guide


⏺ 📋 Summary: Admin Promotion Testing Setup

  🔧 What You Need to Do:

  1. Create test admin user with these permissions:
    - promotion:read
    - promotion:write
    - promotion:provider_config
    - promotion:analytics
    - promotion:* (optional wildcard)

  2. Admin Test credentials:
    - Email: admindev@sheenapps.com
    - Password: TestAdminSheenApps481!
    - You'll need to add this user to your Supabase Auth and grant admin permissions

  🚀 Quick Test Sequence:

  1. Get admin JWT via /v1/admin/auth/exchange
  2. Check provider availability
  3. Validate a promotion config
  4. Create a test promotion
  5. Verify with system health check

  ⚠️ Key Points:

  - Admin permissions are stored in user_admin_status table
  - JWT expires in 15 minutes - need to refresh
  - Reason header required for write operations: x-admin-reason
  - All endpoints need Authorization: Bearer <admin_jwt>




------- ------- ------- ------- ------- ------- ------- ------- ------- ------- -------





*Quick setup guide for testing multi-provider discount coupons - September 2, 2025*

## 🔧 Prerequisites Setup

### 1. Database Migrations
Run the promotion system migrations in order:
```bash
# Apply the corrected migrations
psql -f migrations/073_promotion_system_expert_fixes.sql
psql -f migrations/074_promotion_system_final_fixes.sql

# Verify migrations worked
psql -c "SELECT * FROM verify_promotion_system_health();"
```

### 2. Create Test Admin User

Since the system uses Supabase Auth + custom admin permissions, you need to:

**Option A: Create via Supabase Dashboard**
1. Go to your Supabase Dashboard → Authentication → Users
2. Create a new user with email: `admin@test.com` / password: `TestAdmin123!`
3. Note the user UUID (you'll need it)

**Option B: Create via SQL** (if you have direct DB access)
```sql
-- Insert test admin user into Supabase auth.users (if not using dashboard)
-- This varies by Supabase setup, usually done via dashboard

-- Add admin permissions to your user
INSERT INTO user_admin_status (
  user_id,
  is_admin,
  admin_permissions,
  created_at,
  updated_at
) VALUES (
  '12345678-1234-1234-1234-123456789012', -- Replace with actual user UUID
  true,
  ARRAY[
    'promotion:read',
    'promotion:write',
    'promotion:provider_config',
    'promotion:analytics',
    'promotion:*'
  ],
  NOW(),
  NOW()
) ON CONFLICT (user_id) DO UPDATE SET
  admin_permissions = EXCLUDED.admin_permissions,
  updated_at = NOW();
```

### 3. Environment Variables
Ensure these are set in your `.env`:
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
JWT_SECRET=your_jwt_secret
DATABASE_URL=your_postgres_connection_string
```

## 🚀 Testing Steps

### Step 1: Get Admin JWT Token

**API Call:**
```bash
# First, get Supabase access token (via your auth flow)
# Then exchange it for admin JWT:

curl -X POST http://localhost:3000/v1/admin/auth/exchange \
  -H "Content-Type: application/json" \
  -d '{
    "supabase_access_token": "your_supabase_access_token_here"
  }'

# Response will include admin_jwt - save this!
```

**Response:**
```json
{
  "success": true,
  "admin_jwt": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "expires_in": 900,
  "permissions": ["promotion:read", "promotion:write", "promotion:*"]
}
```

### Step 2: Test Provider Availability

```bash
curl -X GET http://localhost:3000/admin/providers/availability \
  -H "Authorization: Bearer YOUR_ADMIN_JWT"
```

**Expected Response:**
```json
{
  "providers": [
    {
      "key": "stripe",
      "name": "Stripe",
      "supported_currencies": ["USD", "EUR", "GBP"],
      "supported_regions": ["us", "ca", "gb", "eu"],
      "checkout_types": ["redirect"],
      "status": "active"
    },
    {
      "key": "fawry",
      "name": "Fawry",
      "supported_currencies": ["EGP"],
      "supported_regions": ["eg"],
      "checkout_types": ["voucher"],
      "status": "active"
    }
  ]
}
```

### Step 3: Test Promotion Validation

```bash
curl -X POST http://localhost:3000/admin/promotions/validate \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "promotion_config": {
      "name": "Egypt Summer Sale",
      "discount_type": "fixed_amount",
      "discount_value": 500,
      "currency": "EGP",
      "supported_providers": ["fawry", "paymob"],
      "codes": ["EGYPT2025"]
    },
    "test_scenarios": [{
      "region": "eg",
      "currency": "EGP",
      "order_amount": 10000,
      "provider": "fawry"
    }]
  }'
```

**Expected Response:**
```json
{
  "valid": true,
  "warnings": ["Only two providers selected"],
  "scenario_results": [{
    "eligible": true,
    "discount_amount": 500,
    "final_amount": 9500,
    "selected_provider": "fawry",
    "reason": "Eligible for discount"
  }]
}
```

### Step 4: Create Multi-Provider Promotion

```bash
curl -X POST http://localhost:3000/admin/promotions/multi-provider \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -H "x-admin-reason: Testing multi-provider promotion system" \
  -d '{
    "name": "Multi-Provider Test Sale",
    "description": "Test promotion for Egypt and Saudi markets",
    "discount_type": "percentage",
    "discount_value": 20,
    "codes": ["MULTI20"],
    "max_total_uses": 100,
    "max_uses_per_user": 1,
    "valid_from": "2025-09-02T00:00:00Z",
    "valid_until": "2025-12-31T23:59:59Z",
    "regional_configs": [{
      "region_code": "eg",
      "preferred_providers": ["fawry", "paymob"],
      "localized_name": {
        "en": "Egypt Special",
        "ar": "عرض خاص مصر"
      }
    }]
  }'
```

### Step 5: Test Analytics

```bash
# Get promotion analytics
curl -X GET "http://localhost:3000/admin/promotions/PROMOTION_ID/provider-analytics" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT"
```

### Step 6: Verify System Health

```bash
# Check system health
psql -c "SELECT * FROM verify_promotion_system_health();"
```

**Expected Output:**
```
check_name              | check_passed | issue_count | details
-----------------------|--------------|-------------|----------
currency_consistency    | t            | 0           | All promotions have valid currency settings
no_empty_arrays         | t            | 0           | No empty arrays found
region_code_lowercase   | t            | 0           | All region codes are lowercase
no_orphaned_reservations| t            | 0           | No orphaned reservations
```

## 🧪 Test Scenarios to Validate

### ✅ **Valid Test Cases**
1. **Egypt Fixed Amount**: `currency: "EGP"`, `providers: ["fawry", "paymob"]`
2. **Saudi Percentage**: `discount_type: "percentage"`, `providers: ["stcpay"]`
3. **Global USD**: `currency: "USD"`, `providers: ["stripe"]`
4. **Multi-region**: Different regional configs for same promotion

### ❌ **Invalid Test Cases** (should be rejected)
1. **Percentage with currency**: `discount_type: "percentage"`, `currency: "USD"`
2. **Incompatible provider-currency**: `providers: ["stripe"]`, `currency: "EGP"`
3. **Empty checkout restrictions**: `checkout_type_restrictions: []`
4. **Missing required fields**: No `name` or `codes`

## 🔍 Debugging Tips

### Common Issues:
1. **403 Insufficient permissions** → Check admin permissions in database
2. **Invalid currency/provider combo** → Use provider availability endpoint
3. **Migration errors** → Check `verify_promotion_system_health()`
4. **JWT expired** → Re-exchange Supabase token for new admin JWT

### Debug Queries:
```sql
-- Check admin permissions
SELECT user_id, is_admin, admin_permissions
FROM user_admin_status
WHERE user_id = 'YOUR_USER_UUID';

-- Check promotion data
SELECT * FROM promotion_analytics_dashboard LIMIT 5;

-- Check recent audit logs
SELECT * FROM promotion_provider_changes
ORDER BY created_at DESC LIMIT 10;
```

## 🎯 Success Criteria

Your promotion system is working correctly if:
- ✅ All health checks pass
- ✅ Provider availability loads correctly
- ✅ Validation catches invalid configurations
- ✅ Multi-provider promotions create successfully
- ✅ Analytics show provider and currency breakdowns
- ✅ Audit trail captures all changes

## 📞 Support

If you encounter issues:
1. Check the correlation ID in API responses for debugging
2. Review audit logs in `promotion_provider_changes` table
3. Verify admin permissions are correctly set
4. Run system health checks for data integrity

The system is designed to be fail-safe - invalid configurations should be caught by validation rather than causing runtime errors.
