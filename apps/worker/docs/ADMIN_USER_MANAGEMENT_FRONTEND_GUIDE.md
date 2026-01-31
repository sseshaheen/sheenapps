# Admin User Management - Frontend Integration Guide

## Overview
This guide covers the implementation of admin user management features in your frontend application, including authentication, user creation, and privilege management.

## Table of Contents
1. [Authentication Flow](#authentication-flow)
2. [Admin User Management APIs](#admin-user-management-apis)
3. [Security Requirements](#security-requirements)
4. [Implementation Examples](#implementation-examples)
5. [Error Handling](#error-handling)
6. [Best Practices](#best-practices)

---

## Authentication Flow

### 1. Admin Login
Admin users authenticate directly with email/password (bypassing Supabase client SDK due to schema drift issues).

```typescript
// Login endpoint
POST /v1/admin/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "SecurePassword123"
}

// Response
{
  "success": true,
  "admin_jwt": "eyJhbGci...",
  "expires_at": "2025-09-03T14:02:48.000Z",
  "expires_in": 720, // seconds
  "session_id": "admin_1756907448849_l2hl0zha9",
  "permissions": ["admin:*"],
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "role": "admin" // or "super_admin"
  }
}
```

### 2. JWT Storage & Refresh
- Store the JWT securely (httpOnly cookie or secure localStorage)
- JWT expires in 12 minutes - implement auto-refresh before expiry
- Include JWT in all admin API requests

### 3. Authorization Header
```typescript
Authorization: Bearer <admin_jwt>
```

---

## Admin User Management APIs

### 1. Create Admin User (Super Admin Only)

**Endpoint:** `POST /v1/admin/management/users/create`

**Required Role:** `super_admin`

**Headers:**
```typescript
{
  "Authorization": "Bearer <admin_jwt>",
  "Content-Type": "application/json",
  "x-admin-reason": "Creating new support admin" // REQUIRED
}
```

**Request Body:**
```typescript
{
  "email": "newadmin@example.com",
  "password": "TempPassword123", // Minimum 8 characters
  "role": "admin", // "admin" or "super_admin"
  "permissions": ["admin:users", "admin:support"], // Optional, defaults to ["admin:*"]
  "display_name": "John Doe" // Optional
}
```

**Success Response:**
```typescript
{
  "success": true,
  "message": "Admin user created successfully",
  "user": {
    "id": "uuid",
    "email": "newadmin@example.com",
    "role": "admin",
    "permissions": ["admin:users", "admin:support"],
    "temporary_password": "TempPassword123",
    "created_by": "creator@example.com",
    "created_at": "2025-09-03T14:10:00.150Z"
  },
  "instructions": "User should change password on first login"
}
```

### 2. List Admin Users

**Endpoint:** `GET /v1/admin/management/users`

**Required Role:** `admin` or `super_admin`

**Headers:**
```typescript
{
  "Authorization": "Bearer <admin_jwt>",
  "x-admin-reason": "Viewing admin user list" // REQUIRED
}
```

**Response:**
```typescript
{
  "success": true,
  "admins": [
    {
      "id": "uuid",
      "email": "admin@example.com",
      "role": "super_admin",
      "permissions": ["admin:*"],
      "created_at": "2025-01-01T00:00:00Z",
      "created_by": "system"
    }
  ],
  "total": 5
}
```

### 3. Revoke Admin Privileges (Super Admin Only)

**Endpoint:** `DELETE /v1/admin/management/users/:userId`

**Required Role:** `super_admin`

**Headers:**
```typescript
{
  "Authorization": "Bearer <admin_jwt>",
  "x-admin-reason": "Security violation - revoking access" // REQUIRED
}
```

**Response:**
```typescript
{
  "success": true,
  "message": "Admin privileges revoked successfully"
}
```

---

## Security Requirements

### 1. Role-Based Access Control

```typescript
enum AdminRole {
  ADMIN = 'admin',        // Can access admin panel, manage users/content
  SUPER_ADMIN = 'super_admin'  // Can create/revoke admin users
}
```

### 2. Required Headers

All sensitive operations require the `x-admin-reason` header:
```typescript
interface AdminHeaders {
  'Authorization': `Bearer ${jwt}`;
  'x-admin-reason': string; // Human-readable reason for audit log
  'Content-Type'?: 'application/json';
}
```

### 3. Permission Checks

Frontend should check permissions before showing UI elements:
```typescript
function canCreateAdmins(user: AdminUser): boolean {
  return user.role === 'super_admin';
}

function canRevokeAdmins(user: AdminUser): boolean {
  return user.role === 'super_admin';
}

function canViewAdminList(user: AdminUser): boolean {
  return ['admin', 'super_admin'].includes(user.role);
}
```

---

## Implementation Examples

### React/Next.js Example

```typescript
// hooks/useAdminAuth.ts
import { useState, useEffect } from 'react';

interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'super_admin';
  permissions: string[];
}

export function useAdminAuth() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  
  const login = async (email: string, password: string) => {
    const response = await fetch('/v1/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      throw new Error('Invalid credentials');
    }
    
    const data = await response.json();
    setJwt(data.admin_jwt);
    setUser(data.user);
    
    // Store in secure cookie or localStorage
    localStorage.setItem('admin_jwt', data.admin_jwt);
    
    // Set up auto-refresh
    scheduleTokenRefresh(data.expires_in);
    
    return data;
  };
  
  const createAdmin = async (
    adminData: CreateAdminRequest,
    reason: string
  ) => {
    if (user?.role !== 'super_admin') {
      throw new Error('Insufficient privileges');
    }
    
    const response = await fetch('/v1/admin/management/users/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'x-admin-reason': reason
      },
      body: JSON.stringify(adminData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create admin');
    }
    
    return response.json();
  };
  
  return { user, login, createAdmin };
}
```

### Admin Creation Form Component

```tsx
// components/CreateAdminForm.tsx
import { useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';

export function CreateAdminForm() {
  const { user, createAdmin } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Only show for super_admin
  if (user?.role !== 'super_admin') {
    return <div>You don't have permission to create admin users.</div>;
  }
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    
    try {
      const result = await createAdmin({
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        role: formData.get('role') as 'admin' | 'super_admin',
        permissions: (formData.get('permissions') as string)?.split(','),
        display_name: formData.get('display_name') as string
      }, formData.get('reason') as string);
      
      alert(`Admin user created: ${result.user.email}`);
      e.currentTarget.reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <h2>Create New Admin User</h2>
      
      {error && <div className="error">{error}</div>}
      
      <input
        name="email"
        type="email"
        placeholder="Email"
        required
      />
      
      <input
        name="password"
        type="password"
        placeholder="Temporary Password (min 8 chars)"
        minLength={8}
        required
      />
      
      <select name="role" required>
        <option value="admin">Admin</option>
        <option value="super_admin">Super Admin</option>
      </select>
      
      <input
        name="permissions"
        placeholder="Permissions (comma-separated)"
        defaultValue="admin:*"
      />
      
      <input
        name="display_name"
        placeholder="Display Name (optional)"
      />
      
      <textarea
        name="reason"
        placeholder="Reason for creating this admin (required)"
        required
      />
      
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Admin User'}
      </button>
    </form>
  );
}
```

---

## Error Handling

### Common Error Responses

```typescript
// 401 - Invalid JWT
{
  "error": "Authentication failed",
  "code": "AUTH_ERROR",
  "message": "Invalid admin JWT: jwt expired"
}

// 403 - Insufficient Privileges
{
  "error": "Only super admins can create admin users",
  "code": "INSUFFICIENT_PRIVILEGES",
  "required_role": "super_admin",
  "current_role": "admin"
}

// 400 - Missing Required Header
{
  "error": "Admin reason required",
  "code": "MISSING_ADMIN_REASON",
  "message": "Sensitive operations require a reason in x-admin-reason header"
}

// 409 - User Already Admin
{
  "error": "User is already an admin",
  "code": "USER_ALREADY_ADMIN",
  "user": {
    "id": "uuid",
    "email": "existing@admin.com",
    "role": "admin"
  }
}
```

### Error Handling Best Practices

```typescript
async function handleAdminAction(action: () => Promise<any>) {
  try {
    const result = await action();
    return { success: true, data: result };
  } catch (error) {
    if (error.status === 401) {
      // Token expired - refresh and retry
      await refreshToken();
      return handleAdminAction(action);
    }
    
    if (error.status === 403) {
      // Insufficient privileges - show error
      showError('You don\'t have permission to perform this action');
    }
    
    if (error.code === 'MISSING_ADMIN_REASON') {
      // Prompt for reason
      const reason = await promptForReason();
      if (reason) {
        // Retry with reason
        return handleAdminAction(action);
      }
    }
    
    return { success: false, error };
  }
}
```

---

## Best Practices

### 1. Security
- **Never expose super_admin creation to non-super_admins** - Check role client-side AND server validates
- **Always provide audit reasons** - Every sensitive operation needs `x-admin-reason`
- **Implement JWT refresh** - Tokens expire in 12 minutes
- **Use HTTPS only** - Never send admin credentials over HTTP

### 2. User Experience
- **Show role-appropriate UI** - Hide features users can't access
- **Provide clear error messages** - Help users understand why actions failed
- **Implement loading states** - Admin operations can take 5-10 seconds
- **Confirm dangerous actions** - Especially for revoking admin privileges

### 3. Password Management
- **Enforce strong passwords** - Minimum 8 characters
- **Prompt password change** - Show notice for temporary passwords
- **Don't show passwords after creation** - Only show once, then never again

### 4. Audit Trail
Always include meaningful reasons:
```typescript
// Good reasons
"Creating support admin for APAC timezone coverage"
"Revoking access - employee termination"
"Elevating to super_admin for system maintenance"

// Bad reasons
"test"
"admin creation"
"n/a"
```

### 5. Testing Checklist
- [ ] Super admin can create regular admins
- [ ] Super admin can create other super admins
- [ ] Regular admin cannot create any admin users
- [ ] Regular admin can view admin list
- [ ] Super admin can revoke admin privileges
- [ ] Cannot revoke own admin privileges
- [ ] JWT refresh works before expiry
- [ ] Proper error messages for all failure cases
- [ ] Audit reasons are required and logged

---

## Migration Notes

### Existing Admin Users
1. Dashboard-created users work immediately
2. API-created users need the "golden path" process (implemented in our endpoint)
3. All new admins can authenticate successfully

### Known Issues
- Supabase schema drift prevents direct `signInWithPassword` 
- Must use our `/v1/admin/auth/login` endpoint
- Admin panel is separate from regular user authentication

---

## Support

For issues or questions:
1. Check error response codes and messages
2. Verify JWT hasn't expired (12-minute TTL)
3. Ensure proper role (super_admin for creation/revocation)
4. Confirm x-admin-reason header is included