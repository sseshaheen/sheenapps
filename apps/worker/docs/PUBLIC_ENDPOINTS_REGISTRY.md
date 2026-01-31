# Public Endpoints Registry

## 📋 Complete Documentation of Intentionally Public API Endpoints

This registry documents all endpoints that are intentionally public (no authentication required) with detailed justifications for each.

## 🌐 Public Endpoints

### 1. Health & Monitoring Endpoints

#### `GET /health`
- **File**: `src/routes/health.ts`
- **Purpose**: Load balancer health checks
- **Justification**: Required by infrastructure for uptime monitoring and load balancing decisions. Must be publicly accessible to allow load balancers to determine service health without authentication overhead.
- **Data Exposed**: Minimal service status (online/offline)
- **Security**: No sensitive data exposed

#### `GET /claude-health`  
- **File**: `src/routes/claudeHealth.ts`
- **Purpose**: Claude service-specific health monitoring
- **Justification**: Operational monitoring for Claude integration status. DevOps teams need quick health assessment without authentication barriers during incident response.
- **Data Exposed**: Claude service status, no user data
- **Security**: Minimal operational data only

#### `GET /api/system-health`
- **File**: `src/routes/systemHealth.ts` 
- **Purpose**: System-wide health status
- **Justification**: Monitoring infrastructure requires unauthenticated health checks for alerting and automated recovery systems.
- **Data Exposed**: System status indicators
- **Security**: No sensitive business data

### 2. Advisor Marketplace Endpoints

#### `GET /api/v1/advisors/search`
- **File**: `src/routes/advisorNetwork.ts` (line 242)
- **Purpose**: Public advisor discovery and search
- **Justification**: Public marketplace functionality - enables potential clients to browse available advisors without creating accounts first. Essential for marketplace conversion funnel and SEO visibility.
- **Data Exposed**: Public advisor profiles (names, bios, skills, ratings)
- **Security**: Only approved advisors, no private contact info
- **Rate Limiting**: Built-in pagination limits exposure

#### `GET /api/v1/advisors/:userId`
- **File**: `src/routes/advisorNetwork.ts` (line 411)
- **Purpose**: Individual advisor profile viewing
- **Justification**: Public advisor profiles enable direct linking and sharing of advisor pages. Supports marketing efforts and allows advisors to share their profiles externally.
- **Data Exposed**: Individual approved advisor profile data
- **Security**: Only approved advisors visible, no sensitive data
- **Access Control**: User must be approved advisor

### 3. Career & Recruitment Endpoints

#### `GET /api/careers/*`
- **File**: `src/routes/careers.ts`
- **Purpose**: Job postings and career portal
- **Justification**: Public career portal enables job seekers to view opportunities without barriers. Standard practice for company career pages to be publicly accessible for SEO and candidate acquisition.
- **Data Exposed**: Job descriptions, requirements, company info
- **Security**: Public recruitment data only

### 4. Authentication Flow Endpoints

#### `GET /auth/callback/*`
- **File**: `src/routes/supabaseOAuthCallback.ts`
- **Purpose**: OAuth authentication callback handling
- **Justification**: OAuth specification requires public callback endpoints. Third-party authentication providers (Google, GitHub, etc.) must be able to redirect to these endpoints without authentication.
- **Data Exposed**: Temporary OAuth codes (short-lived)
- **Security**: OAuth state validation, no persistent data

## 🔒 Security Considerations

### Data Minimization
All public endpoints follow data minimization principles:
- ✅ Only essential data exposed
- ✅ No authentication tokens or secrets
- ✅ No private user information
- ✅ No internal system details

### Rate Limiting
Public endpoints implement appropriate protections:
- ✅ Built-in pagination for search results
- ✅ Database query limits
- ✅ Reasonable response size limits

### Monitoring
Public endpoints have enhanced monitoring:
- ✅ Access pattern tracking
- ✅ Abuse detection capabilities
- ✅ Performance monitoring

## 📊 Risk Assessment

### Low Risk Endpoints ✅
- **Health checks**: No business data exposed
- **OAuth callbacks**: Temporary tokens only, standard practice

### Medium Risk Endpoints ⚠️  
- **Advisor search**: Profiles are intended to be public, approved content only
- **Career postings**: Standard public recruitment practice

### Mitigation Strategies
1. **Content approval**: All advisor profiles require admin approval
2. **Data filtering**: Only approved, safe-for-public data exposed
3. **Regular audits**: Monthly review of public data exposure
4. **Access monitoring**: Track usage patterns for abuse detection

## 🔄 Maintenance

### Regular Review Process
- **Monthly**: Review public endpoint usage and data exposure
- **Quarterly**: Audit justifications for continued public status
- **Release**: Validate no new sensitive data exposed

### Change Management
- Any new public endpoint requires security team approval
- Existing public endpoints changing data exposure require re-review
- Documentation must be updated before deployment

## 🎯 Compliance

### Privacy Requirements
All public endpoints comply with:
- ✅ GDPR data minimization requirements
- ✅ No personal data exposure without consent
- ✅ Right to be forgotten (advisor profiles removable)

### Security Standards
- ✅ No authentication bypass vulnerabilities
- ✅ Input validation on all parameters
- ✅ Output encoding for XSS prevention
- ✅ CORS properly configured

This registry ensures all public endpoints are intentional, documented, and regularly reviewed for security compliance.