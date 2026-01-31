# Admin Audit System

This document describes the comprehensive admin audit and compliance system implemented for admin operations.

## Overview

The admin audit system provides:
- **Action Logging**: Complete audit trail for all admin actions
- **Idempotency**: Prevents duplicate operations with UUID-based keys
- **Two-Person Approval**: Queue system for sensitive operations requiring dual approval
- **Correlation Tracking**: End-to-end request tracing
- **Reason Enforcement**: Mandatory justification for sensitive actions

## Database Schema

### Tables Created

1. **`admin_action_log_app`**: Audit trail for all admin actions
2. **`idempotency_keys`**: Prevents duplicate operations 
3. **`admin_two_person_queue`**: Queue for operations requiring dual approval

### Security & Access

- All tables have **Row Level Security (RLS)** enabled
- Access restricted to admin users only via `is_admin()` function
- **SECURITY DEFINER** RPCs for atomic operations

## Configuration

### 1. Database Settings (Required)

Set admin email allowlist as a PostgreSQL database setting:

```sql
-- Production
ALTER DATABASE postgres SET app.admin_emails = 'admin1@company.com,admin2@company.com';

-- Development  
ALTER DATABASE postgres SET app.admin_emails = 'dev@company.com';

-- Verify setting
SHOW app.admin_emails;
```

### 2. Environment Variables (Optional)

```bash
# MFA requirement for admin access
REQUIRE_MFA=true

# Admin JWT secret (already configured)
ADMIN_JWT_SECRET=your-secret-here

# Supabase configuration (already configured)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
```

## API Usage

### Authentication Flow

1. **Frontend**: Calls `POST /v1/admin/auth/exchange` with Supabase access token
2. **Backend**: Verifies token, checks admin permissions, mints short-lived JWT (12 minutes)
3. **Subsequent requests**: Use `Authorization: Bearer <admin_jwt>` header

### Correlation IDs

All admin requests support correlation tracking:

```typescript
// Request headers
headers: {
  'Authorization': 'Bearer <admin_jwt>',
  'X-Correlation-Id': '<uuid>' // Optional - auto-generated if missing
}

// Response always includes
{
  "correlation_id": "<uuid>",
  // ... rest of response
}
```

### Action Logging

Log admin actions using the RPC:

```sql
SELECT rpc_log_admin_action(
  admin_user_id := '<admin-uuid>',
  action := 'refund.issue',
  resource_type := 'invoice', 
  resource_id := '<invoice-id>',
  reason := '[F02] Chargeback risk mitigation',
  correlation_id := '<correlation-uuid>',
  extra := '{"stripe_refund_id": "re_xxx", "amount": 500}'::jsonb
);
```

### Idempotency

Prevent duplicate operations:

```sql
-- Returns true if operation can proceed, false if duplicate
SELECT claim_idempotency(
  p_key := '<same-uuid-as-api-header>',
  p_admin_user_id := '<admin-uuid>',
  p_action := 'refund.issue',
  p_resource_type := 'invoice',
  p_resource_id := '<invoice-id>',
  p_request_hash := '<hmac-sha256-hash>'
);
```

### Two-Person Approval

For sensitive operations requiring dual approval:

```sql
-- Approve pending request (different admin required)
SELECT approve_two_person(
  p_id := '<queue-item-uuid>',
  p_approver := '<approver-uuid>',
  p_reason := 'Verified with customer via phone call'
);
```

## Reason Enforcement

### Required Actions

The following actions require mandatory reasons (≥10 characters):

- `refund.issue`
- `ban.permanent`
- `user.suspend.temporary` 
- `advisor.reject`
- `payment.void`
- `account.close`

### Implementation

```typescript
// Server-side enforcement
import { enforceReason } from '../middleware/reasonEnforcement';

fastify.post('/v1/admin/refund', {
  preHandler: [requireAdminAuth(), enforceReason]
}, async (request, reply) => {
  // Handler implementation
});
```

## Stripe Integration

### UUID Pairing

Always use the same UUID for:
1. API request `Idempotency-Key` header
2. Database `idempotency_keys.key` field  
3. Stripe API `Idempotency-Key` header

### Webhook Closure

In Stripe webhooks, log the `stripe_refund_id` back to audit log:

```typescript
// In webhook handler
await pool.query(`
  UPDATE admin_action_log_app 
  SET extra = extra || $1::jsonb
  WHERE correlation_id = $2
`, [
  { stripe_refund_id: event.data.object.id },
  correlationId
]);
```

## Data Retention

### Automatic Cleanup

Run the cleanup function daily:

```sql
-- Manual execution
SELECT gc_admin_tables();

-- Via pg_cron (if available)
SELECT cron.schedule('admin-cleanup', '0 2 * * *', 'SELECT gc_admin_tables();');
```

### Retention Periods

- **Idempotency Keys**: 180 days (auto-deleted)
- **Admin Action Log**: 2 years (configurable in cleanup function)
- **Two-Person Queue**: Permanent (audit purposes)

## Security Features

### Admin Verification

The `is_admin(uuid)` function checks:

1. **Primary**: JWT claims (`is_admin`, `role`, `admin_permissions`)
2. **Fallback**: Email allowlist (`app.admin_emails`) 
3. **Hard stop**: Not banned/suspended in `user_admin_status`

### RLS Policies

All tables enforce admin-only access:

```sql
-- Example policy
CREATE POLICY admin_only ON admin_action_log_app
  FOR ALL USING (public.is_admin(auth.uid()));
```

## Error Handling

### Standardized Format

All admin API responses follow this format:

```typescript
// Success
{
  "success": true,
  "correlation_id": "<uuid>",
  // ... data
}

// Error  
{
  "success": false,
  "error": "PERMISSION_DENIED",
  "correlation_id": "<uuid>",
  "details": "Optional error details"
}
```

## Migration

The system is created by migration `068_admin_audit_foundation.sql` which includes:

- All table schemas with indexes
- RLS policies and constraints
- Helper functions and RPCs
- Idempotent DDL (safe to re-run)

## Observability

### Correlation ID Logging

All admin operations are logged with correlation IDs for end-to-end tracing:

```typescript
// Server logs include correlation ID
logger.info('Admin action completed', {
  correlation_id: request.correlationId,
  admin_user_id: claims.userId,
  action: 'refund.issue'
});
```

### Future Enhancements (Phase B/C)

- Slack/email notifications for two-person approvals
- Real-time admin activity dashboard
- Automated risk scoring for admin actions
- Integration with external audit systems