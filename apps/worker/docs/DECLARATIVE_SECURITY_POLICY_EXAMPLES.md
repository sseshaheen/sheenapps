# Declarative Security Policy Examples

## 🎯 New Pattern: Explicit Security Configuration

Based on expert recommendations, all routes must now declare their security requirements explicitly to prevent "forgot auth" bugs.

## 📋 Security Policy Types

### 1. HMAC Authenticated Routes
```typescript
fastify.get('/api/projects/:id', {
  config: {
    security: { 
      scheme: 'hmac', 
      scope: ['project:read'] 
    }
  },
  preHandler: requireHmacSignature(),
  handler: async (request, reply) => { ... }
});
```

### 2. Admin Authenticated Routes  
```typescript
fastify.put('/api/admin/users/:id', {
  config: {
    security: { 
      scheme: 'admin', 
      scope: ['user_management'] 
    }
  },
  preHandler: requireAdminAuth({ permissions: ['user_management'] }),
  handler: async (request, reply) => { ... }
});
```

### 3. Public Routes (Must Include Justification)
```typescript
fastify.get('/api/v1/advisors/search', {
  config: {
    security: { 
      scheme: 'public',
      publicJustification: 'Public advisor discovery for marketplace - enables users to browse available advisors without authentication'
    }
  },
  handler: async (request, reply) => { ... }
});
```

### 4. Webhook Routes
```typescript
fastify.post('/api/webhooks/vercel', {
  config: {
    security: { 
      scheme: 'webhook', 
      scope: ['deploy:vercel'] 
    }
  },
  preHandler: vercelWebhookValidation(),
  handler: async (request, reply) => { ... }
});
```

## 🛡️ Security Enforcer Plugin

The security enforcer plugin automatically validates that:
- ✅ All routes declare a security policy
- ✅ Public routes include detailed justifications (min 10 chars)
- ✅ Security schemes are valid (`hmac`, `admin`, `public`, `webhook`)
- ✅ Scopes are properly formatted arrays

## 🚨 Build-Time Enforcement

Routes missing security policies will cause the server to fail on startup:
```
❌ SECURITY POLICY REQUIRED: Route GET /api/some-endpoint must include config.security
```

## 📊 Current Implementation Status

### Migration Strategy
1. **Phase 1**: Add security enforcer plugin (✅ Done)
2. **Phase 2**: Update critical routes with declarative policies  
3. **Phase 3**: Gradually migrate all remaining routes
4. **Phase 4**: Enable full enforcement (fail on missing policies)

### Example Route Conversions

**Before (Implicit Auth)**:
```typescript
fastify.get('/api/projects/:id', {
  preHandler: requireHmacSignature()
}, handler);
```

**After (Declarative Auth)**:
```typescript
fastify.get('/api/projects/:id', {
  config: {
    security: { scheme: 'hmac', scope: ['project:read'] }
  },
  preHandler: requireHmacSignature()
}, handler);
```

## 🎯 Benefits

1. **Prevents "Forgot Auth" Bugs**: All routes must explicitly declare security
2. **Documentation**: Security requirements are self-documenting
3. **Audit Trail**: Easy to identify all public endpoints and their justifications
4. **Consistency**: Standardized security declaration across the codebase
5. **CI/CD Integration**: Can be extended with linting rules and automation

## 🔄 Next Steps

1. Register the security enforcer plugin in server.ts
2. Update high-traffic routes with declarative policies
3. Create ESLint rules to enforce the pattern
4. Add CI checks for security policy completeness