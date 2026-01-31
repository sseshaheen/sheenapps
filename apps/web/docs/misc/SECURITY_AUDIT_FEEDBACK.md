# Security Audit Feedback & Implementation Plan

## Expert Review - Key Security Concerns

### 🔴 **Critical Issues (Immediate)**

#### 1. Service-Role Key Leakage
**Issue**: Never use the service-role key in edge/API paths; rely on the requester's JWT and RLS.
- **Risk**: High - Exposes admin privileges
- **Status**: 🔄 IMMEDIATE FIX NEEDED
- **Solution**: Remove service-role usage from API routes, use user JWTs only

#### 2. Rate-Limit Durability  
**Issue**: In-memory limiter breaks in multi-region; swap to Upstash Redis or Postgres counter before GA.
- **Risk**: Medium - DoS vulnerability in production
- **Status**: 🟡 PLAN FOR SCALING
- **Solution**: Implement Redis-based rate limiting

#### 3. Cookie Writing in Middleware
**Issue**: Don't mutate request.cookies; set cookies only on NextResponse to stay edge-safe.
- **Risk**: Medium - Edge deployment issues
- **Status**: 🔄 NEEDS AUDIT
- **Solution**: Review middleware cookie handling

### 🟠 **Scaling Issues (Before Production)**

#### 4. Collaborator Scaling
**Issue**: JSON array won't scale; plan a project_collaborators (project_id, user_id, role) table.
- **Risk**: Medium - Performance at scale
- **Status**: 🟡 ARCHITECTURAL CHANGE
- **Solution**: Add proper junction table

#### 5. OAuth Redirect Robustness
**Issue**: Craft callback URL on the server using x-forwarded-host to survive mobile in-app browsers.
- **Risk**: Medium - Mobile OAuth failures
- **Status**: 🟡 ENHANCEMENT NEEDED
- **Solution**: Server-side callback URL generation

#### 6. Edge Cold-Start Performance
**Issue**: Pre-extract builds > 3MB or replace JSZip with Deno.readZip.
- **Risk**: Low - Performance issue
- **Status**: 🟡 OPTIMIZATION
- **Solution**: Optimize edge function performance

### 🟢 **Security Hardening (Production-Ready)**

#### 7. Content Security Policy (CSP)
**Issue**: Add enforced CSP; Use nonce/hash-based Content-Security-Policy; block 'unsafe-inline'.
- **Risk**: Medium - XSS vulnerability
- **Status**: 🟡 SECURITY HARDENING
- **Solution**: Implement strict CSP

#### 8. Audit Trail System
**Issue**: Wire audit triggers now; Create audit table + AFTER INSERT/UPDATE/DELETE triggers on commits, branches, assets.
- **Risk**: Medium - Compliance/debugging
- **Status**: 🟡 COMPLIANCE FEATURE
- **Solution**: Add comprehensive audit logging

#### 9. Session Revocation
**Issue**: After password/email change call supabase.auth.signOut({ scope: 'global' }).
- **Risk**: Medium - Session security
- **Status**: 🟡 AUTH ENHANCEMENT
- **Solution**: Implement global session invalidation

#### 10. Server-Side Password Rules
**Issue**: Enforce in auth:user_signed_up webhook or Supabase password policy.
- **Risk**: Low - Password strength
- **Status**: 🟡 AUTH POLICY
- **Solution**: Server-side password validation

---

## Implementation Priority

### **Phase 1: Critical Security (Week 1)**
1. ✅ Remove service-role key from client-accessible code
2. ✅ Audit middleware cookie handling
3. ✅ Review API route authentication patterns

### **Phase 2: Production Scaling (Week 2-3)**
1. 🔄 Implement project_collaborators table migration
2. 🔄 Add Redis-based rate limiting (Upstash)
3. 🔄 Fix OAuth callback URL generation
4. 🔄 Add CSP headers

### **Phase 3: Compliance & Monitoring (Week 4)**
1. 🔄 Implement audit trail system
2. 🔄 Add global session revocation
3. 🔄 Server-side password policies
4. 🔄 Edge function performance optimization

---

## Technical Assessment

### **Complexity Level**: 🟡 **MODERATE**
- Most issues are architectural improvements, not ground-up rewrites
- Service-role removal is straightforward
- Rate limiting requires external service integration
- Audit system needs database design

### **Effort Estimate**
- **Critical fixes**: 2-3 days
- **Scaling improvements**: 1-2 weeks  
- **Complete implementation**: 3-4 weeks

### **Risk vs. Reward**
- **High impact, low effort**: Service-role removal, CSP headers
- **High impact, medium effort**: Rate limiting, audit system
- **Medium impact, medium effort**: Collaborator table, OAuth improvements

---

## Quick Wins (Can implement immediately)

1. **Remove service-role from .env** (except keep for migrations)
2. **Add CSP headers** to next.config.js
3. **Fix middleware cookies** pattern
4. **Add password policy** to Supabase dashboard
5. **Plan audit table schema** for next migration

---

**Verdict**: ✅ **DOABLE** - Well-structured feedback with clear solutions. Most are standard production hardening practices, not complex architectural changes.