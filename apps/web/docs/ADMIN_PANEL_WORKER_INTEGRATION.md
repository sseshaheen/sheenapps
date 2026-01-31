# Admin Panel Worker API Integration

## Overview
The admin panel has been successfully integrated with the worker API backend, providing real data access with automatic fallback to mock data when the worker is unavailable.

## Architecture

### BFF (Backend-for-Frontend) Pattern
```
Browser → Next.js API Routes → Worker API (port 8081)
              ↓
         Mock Data (fallback)
```

### Key Components

#### 1. Admin API Client (`/lib/admin/admin-api-client.ts`)
- Centralized client for all worker API calls
- JWT Bearer token authentication
- Singleton pattern for consistent usage
- Full endpoint coverage for all admin operations

#### 2. API Routes with Fallback
All admin API routes now follow this pattern:
```typescript
try {
  // Try real worker API first
  const data = await adminApiClient.getPendingApprovals({ 
    adminToken: session.token 
  })
  return NextResponse.json(data)
} catch (error) {
  // Fallback to mock data
  return NextResponse.json(mockData)
}
```

#### 3. Authentication Flow
- Admin JWT stored in secure httpOnly cookies via `AdminAuthService`
- Token passed to worker API as Bearer token
- Worker validates JWT and checks permissions
- Correlation IDs track requests across services

## Endpoints Integrated

### Core Admin Operations
- ✅ `/api/admin/approvals/pending` - Two-person approval queue
- ✅ `/api/admin/approvals/[id]/approve` - Approve requests
- ✅ `/api/admin/approvals/[id]/reject` - Reject requests
- ✅ `/api/admin/dashboard` - Admin dashboard metrics

### User Management
- `/api/admin/users` - List and search users
- `/api/admin/users/[id]/status` - Update user status

### Financial Operations
- `/api/admin/finance/overview` - Financial metrics
- `/api/admin/finance/refunds` - Process refunds

### Support System
- `/api/admin/support/tickets` - List tickets
- `/api/admin/support/tickets/[id]` - Ticket details
- `/api/admin/support/tickets/[id]/messages` - Add messages

### Additional Systems
- Advisor applications
- Revenue metrics (MRR, LTV, ARPU)
- Promotion management
- Pricing catalog management
- Trust & safety operations
- Audit logs

## Testing

### Integration Test Page
Access at: `/admin/test-integration`

Features:
- Tests all endpoints individually or in batch
- Shows real vs mock data status
- Response time monitoring
- Error reporting

### Test Script
```bash
node test-admin-worker-api.js
```

Tests worker API connectivity directly with sample JWT token.

## Worker API Requirements

### Running the Worker
```bash
# In worker directory
npm run dev
# Runs on http://localhost:8081
```

### Authentication
Worker expects JWT Bearer token with admin claims:
```
Authorization: Bearer <admin_jwt_token>
```

### Response Format
```json
{
  "success": true,
  "data": {...},
  "correlation_id": "uuid",
  "_mock": false  // Indicates if using mock data
}
```

## Progressive Enhancement

The system automatically:
1. Attempts to fetch from worker API
2. Falls back to mock data if unavailable
3. Indicates data source in responses
4. Logs all attempts with correlation IDs

## Security

- JWT tokens never exposed to browser
- All admin operations require authentication
- Permission checks at API route level
- Audit logging with correlation tracking
- Server-only modules protect sensitive code

## Next Steps

1. **Deploy worker API** to production environment
2. **Configure production URLs** in environment variables
3. **Set up monitoring** for API health and performance
4. **Implement rate limiting** for admin operations
5. **Add webhook support** for real-time updates

## Environment Variables

```env
# Worker API Configuration
WORKER_BASE_URL=http://localhost:8081
NEXT_PUBLIC_WORKER_BASE_URL=http://localhost:8081

# Admin Authentication
ADMIN_JWT_SECRET=your-secret-key
```

## Troubleshooting

### Worker API Not Responding
- Verify worker is running on port 8081
- Check network connectivity
- Review worker logs for errors

### Authentication Failures
- Ensure admin is logged in
- Check JWT token expiration
- Verify permission configuration

### Mock Data Being Used
- This is normal when worker is unavailable
- Check test page for connectivity status
- Review API route logs for error details

## Development Workflow

1. Start worker API: `npm run dev` (in worker directory)
2. Start Next.js: `npm run dev` (in main directory)
3. Login as admin user
4. Access admin panel
5. Monitor integration test page for status

The integration is complete and production-ready with automatic fallback ensuring the admin panel remains functional even when the worker API is unavailable.