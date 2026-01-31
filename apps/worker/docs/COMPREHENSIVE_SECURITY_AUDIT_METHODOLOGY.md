# Comprehensive Security Audit Methodology

## 🎯 Objective
Systematically identify and classify ALL API endpoints across the codebase to ensure complete authentication coverage.

## 🔍 Root Cause of Previous Audit Gaps

**What Went Wrong:**
- Analyzed files individually for authentication patterns
- Assumed one authentication model per file
- Missed that `advisorNetwork.ts` contains MIXED authentication (HMAC + public endpoints)
- Searched for auth patterns instead of extracting ALL endpoints first

**Missing Endpoints:**
- `/api/v1/advisors/search` (public by design)
- `/api/v1/advisors/:userId` (public by design)

## 📋 Improved Audit Methodology

### Phase 1: Complete Endpoint Discovery
1. **Find ALL route files**
   ```bash
   find src/routes -name "*.ts" -type f | sort
   ```

2. **Extract ALL endpoints from each file**
   - Search for `fastify.get(`, `fastify.post(`, `fastify.put(`, `fastify.delete(`
   - Record route path, HTTP method, and line number
   - Don't filter by authentication yet

3. **Create complete endpoint inventory**
   - File name → List of all endpoints
   - Include line numbers for reference

### Phase 2: Authentication Classification
For each endpoint, determine:
1. **HMAC Protected**: Uses `requireHmacSignature` or similar
2. **JWT Admin**: Uses admin authentication middleware  
3. **Webhook Signature**: Uses provider-specific webhook validation
4. **Public by Design**: Explicitly documented as public
5. **Unprotected**: No visible authentication

### Phase 3: Risk Assessment
Classify unprotected endpoints:
- **High Risk**: Expose sensitive data or operations
- **Medium Risk**: Business logic without authentication
- **Low Risk**: Intentionally public (health checks, public APIs)

### Phase 4: Documentation & Verification
- Document findings with file:line references
- Verify public endpoints are intentionally public
- Get security team review for unclear cases

## 🛠️ Implementation Tools

### Automated Endpoint Discovery Script
```bash
#!/bin/bash
# Extract all API endpoints from route files
echo "# Complete API Endpoint Inventory"
echo "Generated: $(date)"
echo ""

for file in $(find src/routes -name "*.ts" -type f | sort); do
    echo "## $file"
    echo ""
    # Extract fastify route definitions with line numbers
    grep -n "fastify\.\(get\|post\|put\|delete\|patch\)" "$file" | \
    sed -E "s/^([0-9]+):.* '([^']+)'.*/Line \1: \2/" | \
    sort -n
    echo ""
done
```

### Authentication Pattern Detection
```bash
# For each route file, detect auth patterns
check_auth_patterns() {
    local file=$1
    echo "Authentication patterns in $file:"
    
    # HMAC patterns
    grep -n "requireHmacSignature\|verifyHmac\|HMAC" "$file" || echo "  No HMAC found"
    
    # JWT patterns  
    grep -n "requireAdminAuth\|JWT\|jwt" "$file" || echo "  No JWT found"
    
    # Webhook patterns
    grep -n "webhook.*signature\|signature.*webhook" "$file" || echo "  No webhook auth found"
    
    # Public comments
    grep -n -i "public.*endpoint\|intentionally.*public" "$file" || echo "  No public markers found"
}
```

## 🎯 Key Improvements

1. **Completeness First**: Extract ALL endpoints before analyzing authentication
2. **Mixed File Awareness**: Account for files with multiple authentication models
3. **Systematic Coverage**: Use automation to ensure no files are missed
4. **Documentation Standards**: Require explicit "public by design" comments
5. **Regular Audits**: Run methodology quarterly to catch new endpoints

## 📊 Expected Outcome

A complete, accurate inventory showing:
- Total endpoint count
- Authentication method for each endpoint
- Risk classification for unprotected endpoints
- Clear distinction between security gaps and intentional design

This methodology prevents future audit gaps by being systematic rather than pattern-based.