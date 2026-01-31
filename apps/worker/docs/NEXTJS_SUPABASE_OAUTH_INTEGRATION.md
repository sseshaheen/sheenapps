# Supabase OAuth Integration - Next.js Implementation Guide

## Overview

The Worker backend now provides complete Supabase OAuth integration APIs. This document outlines what Next.js team needs to implement on the frontend.

---

## 📋 **Next.js Team Questions & Answers**

### 🤔 **Technical Questions**

**Q1: State Storage - Should we store PKCE verifiers in database, Redis, or encrypt in cookies?**
- **Recommendation**: **Encrypted cookies** for simplicity and stateless design
- **Alternative**: Redis with 10-minute TTL if you prefer server-side storage
- **Avoid**: Database storage (overkill for temporary 5-10 minute data)

```javascript
// Option 1: Encrypted Cookie (Recommended)
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export async function storeCodeVerifier(nonce, codeVerifier) {
  const jwt = await new SignJWT({ codeVerifier })
    .setExpirationTime('10m')
    .setSubject(nonce)
    .sign(secret);
  
  cookies().set('oauth_verifier', jwt, { 
    httpOnly: true, 
    secure: true, 
    maxAge: 600, // 10 minutes
    sameSite: 'lax' 
  });
}

export async function getStoredCodeVerifier(nonce) {
  const jwt = cookies().get('oauth_verifier')?.value;
  if (!jwt) return null;
  
  try {
    const { payload } = await jwtVerify(jwt, secret);
    return payload.sub === nonce ? payload.codeVerifier : null;
  } catch {
    return null;
  }
}
```

**Q2: OAuth Client Configuration - Do we need to register redirect URIs?**
- **Answer**: **Yes**, redirect URIs must be registered with Supabase OAuth app
- **Contact**: Worker team to add your domains to client `2b8d26f7-71a7-4cd3-b39f-98211062065c`
- **Required URIs**: 
  - `https://yourdomain.com/api/auth/supabase/callback` (production)
  - `http://localhost:3000/api/auth/supabase/callback` (development)

**Q3: Environment Parity - Should OAUTH_STATE_SECRET match WORKER_SHARED_SECRET?**
- **Answer**: **Separate keys** for security isolation
- **OAUTH_STATE_SECRET**: 256-bit key for state parameter signing (Next.js only)
- **WORKER_SHARED_SECRET**: For HMAC API authentication (shared with worker)

```bash
# .env.local
OAUTH_STATE_SECRET=your-256-bit-base64-key-for-state-signing
WORKER_SHARED_SECRET=your-hmac-key-shared-with-worker
```

**Q4: Rate Limiting - Are OAuth endpoints rate limited?**
- **Answer**: **Yes**, same rate limits as other worker APIs
- **Limits**: Standard API limits per user/IP
- **Mitigation**: Implement client-side debouncing for OAuth flows

**Q5: Webhook Integration - Will connection status changes trigger webhooks?**
- **Answer**: **No webhooks currently**, but API provides status polling
- **Recommendation**: Poll status every 30-60 seconds on active project pages
- **Future**: Webhooks may be added in v2 for real-time updates

### 🔒 **Security Concerns**

**Q1: State Parameter Security - Should we encrypt the state parameter?**
- **Answer**: **Current Base64 + HMAC is sufficient** for OAuth security
- **Rationale**: State is already signed with HMAC-SHA256 and expires in 10 minutes
- **Enhancement**: If extra paranoid, you can encrypt before Base64 encoding

**Q2: PKCE Storage - Most secure place for code verifiers?**
- **Answer**: **Encrypted JWT cookies** (recommended approach above)
- **Lifetime**: 5-10 minutes (OAuth flow duration)
- **Security**: HttpOnly, Secure, SameSite=Lax cookies

**Q3: Connection Expiry - Auto-refresh or require re-authentication?**
- **Answer**: **Worker handles auto-refresh transparently**
- **Your responsibility**: Handle `401 TOKEN_EXPIRED` responses gracefully
- **UX Flow**: Show "Reconnect Supabase" button when tokens expire

```javascript
// Handle expired connections in your API calls
async function callSupabaseAPI() {
  try {
    const response = await fetch('/api/supabase/credentials');
    const data = await response.json();
    
    if (response.status === 401 && data.code === 'TOKEN_EXPIRED') {
      // Show reconnection UI
      showReconnectModal();
      return;
    }
    
    return data;
  } catch (error) {
    console.error('Supabase API failed:', error);
  }
}
```

**Q4: Scope Limitations - What Supabase permissions does OAuth request?**
- **Scopes**: `projects:read`, `projects:write`, `api-keys:read`
- **Access**: Read project metadata, read API keys, basic project management
- **Restrictions**: Cannot delete projects, modify billing, or access sensitive settings

### 🎨 **UX/Integration Questions**

**Q1: Fallback Behavior - When to show manual vs OAuth?**
- **Recommendation**: **OAuth-first with manual fallback**
- **Show Manual When**:
  - OAuth connection failed
  - User explicitly chooses "Use manual keys"
  - Enterprise users with custom Supabase instances

```javascript
// Recommended UX flow
const SupabaseSetup = () => {
  const [mode, setMode] = useState('oauth'); // 'oauth' | 'manual'
  
  return (
    <div>
      {mode === 'oauth' ? (
        <div>
          <OAuthConnectButton />
          <button onClick={() => setMode('manual')}>
            Use manual configuration instead
          </button>
        </div>
      ) : (
        <div>
          <ManualKeyInputs />
          <button onClick={() => setMode('oauth')}>
            Try automatic connection instead
          </button>
        </div>
      )}
    </div>
  );
};
```

**Q2: Multi-Project Support - Can one OAuth connection be used for multiple projects?**
- **Answer**: **No, one connection per SheenApps project**
- **Rationale**: Each SheenApps project may use different Supabase projects
- **UX**: Show "Connect Supabase" button for each SheenApps project separately

**Q3: Connection Status - Poll status or real-time updates?**
- **Answer**: **Polling recommended** for MVP (webhooks planned for v2)
- **Frequency**: Poll every 30-60 seconds on active project pages
- **Optimization**: Only poll when user is viewing project settings

**Q4: Error Recovery - UX flow when connections fail during builds?**
- **Recommendation**: **Graceful degradation with clear recovery paths**

```javascript
// Build-time error handling
const BuildErrorHandler = ({ error }) => {
  if (error.code === 'SUPABASE_CONNECTION_EXPIRED') {
    return (
      <div className="build-error">
        <h3>Supabase Connection Expired</h3>
        <p>Your Supabase connection needs to be renewed.</p>
        <button onClick={reconnectSupabase}>
          Reconnect Supabase
        </button>
        <button onClick={useManualConfig}>
          Use Manual Configuration
        </button>
      </div>
    );
  }
  
  // Handle other error types...
};
```

### 🚀 **Implementation Priorities**

**Q1: MVP Scope - Connect/disconnect only or full discovery?**
- **Recommendation**: **Start with full flow** - it's already built and tested
- **MVP Features**:
  - ✅ OAuth connect/disconnect
  - ✅ Project discovery (already implemented)
  - ✅ Automatic credential injection
  - ⏸️ Multi-project management (can add later)

**Q2: Testing Environment - Supabase sandbox for OAuth testing?**
- **Answer**: **Use Supabase staging/development projects**
- **Setup**: Worker team will provide test OAuth client credentials
- **Testing**: Create throwaway Supabase projects for integration testing

**Q3: Rollout Strategy - Feature flag initially?**
- **Recommendation**: **Yes, behind feature flag**
- **Flag**: `ENABLE_SUPABASE_OAUTH=true`
- **Rollout**: Start with internal users, then gradual rollout

**Q4: Monitoring - What metrics to track?**
- **Key Metrics**:
  - OAuth connection success rate
  - Token refresh success rate
  - Manual vs OAuth adoption rate
  - Connection failure reasons

```javascript
// Example analytics tracking
const trackSupabaseEvent = (event, properties) => {
  analytics.track('Supabase Integration', {
    event,
    ...properties,
    timestamp: new Date().toISOString()
  });
};

// Usage examples:
trackSupabaseEvent('oauth_started', { userId, projectId });
trackSupabaseEvent('oauth_success', { userId, projectId, projectCount });
trackSupabaseEvent('oauth_failed', { userId, projectId, error: errorCode });
trackSupabaseEvent('manual_fallback', { userId, projectId, reason });
```

---

## What the Worker Provides

### ✅ **Ready APIs (Worker Backend)**

**OAuth Token Exchange:**
```javascript
POST /v1/internal/supabase/oauth/exchange
Headers: { x-sheen-signature, x-sheen-sig-v2, x-sheen-timestamp, x-sheen-nonce }
Body: { code, codeVerifier, userId, projectId, idempotencyKey? }
Response: { connectionId, needsProjectCreation, availableProjects, readyProjects }
```

**Project Discovery:**
```javascript
GET /v1/internal/supabase/discovery?connectionId={id}
Response: { 
  projects: [{ id, ref, name, organization, status, canConnect, url }],
  needsProjectCreation, canCreateProjects, readyProjects 
}
```

**Credentials for UI:**
```javascript
GET /v1/internal/supabase/credentials?ref={ref}&userId={userId}&projectId={projectId}
Response: { url, publishableKey } // Never includes service keys
```

**Connection Status:**
```javascript
GET /v1/internal/supabase/status?userId={userId}&projectId={projectId}
Response: { connected, status, connectionId?, expiresAt?, isExpired }
```

**Disconnect:**
```javascript
DELETE /v1/internal/supabase/connection
Body: { userId, projectId }
Response: { disconnected: true, message }
```

## What Next.js Needs to Implement

### 🔧 **1. OAuth Callback Route**

**File:** `/pages/connect/supabase/callback.js` or `/app/connect/supabase/callback/page.js`

```javascript
// /connect/supabase/callback
export default async function SupabaseCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).json({ error: 'OAuth authorization failed', details: error });
  }

  try {
    // 1. Decode and validate signed state
    const { data: stateData, signature } = JSON.parse(Buffer.from(state, 'base64').toString());
    
    // 2. Verify state signature
    const expectedSignature = crypto.createHmac('sha256', process.env.OAUTH_STATE_SECRET)
      .update(JSON.stringify(stateData))
      .digest('hex');
    
    if (signature !== expectedSignature) {
      throw new Error('Invalid state signature');
    }
    
    // 3. Check state expiry
    if (Date.now() > stateData.expiresAt) {
      throw new Error('State has expired');
    }

    const { userId, projectId, nextUrl, nonce } = stateData;

    // 4. Get stored PKCE code verifier
    const codeVerifier = await getStoredCodeVerifier(nonce); // You need to implement this
    
    // 5. Forward to Worker API using HMAC authentication
    const response = await callWorkerAPI('/v1/internal/supabase/oauth/exchange', 'POST', {
      code,
      codeVerifier,
      userId,
      projectId,
      idempotencyKey: `oauth-${nonce}` // Prevent duplicates
    });

    if (!response.ok) {
      throw new Error('Token exchange failed');
    }

    const { connectionId } = await response.json();

    // 6. Redirect to project settings with success
    res.redirect(`${nextUrl}?supabase=connected&connectionId=${connectionId}`);

  } catch (error) {
    console.error('Supabase OAuth callback error:', error);
    res.redirect(`/projects/${stateData?.projectId || 'unknown'}/settings?supabase=error&message=${encodeURIComponent(error.message)}`);
  }
}
```

### 🔧 **2. HMAC Authentication Helper**

**File:** `/lib/workerAPI.js`

```javascript
import crypto from 'crypto';

const WORKER_SHARED_SECRET = process.env.WORKER_SHARED_SECRET; // Your existing secret
const WORKER_API_BASE = process.env.WORKER_API_BASE || 'http://localhost:8081';

export async function callWorkerAPI(path, method = 'GET', body = null) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyStr = body ? JSON.stringify(body) : '';

  // v1 Signature (REQUIRED - your existing system)
  const v1Signature = crypto.createHmac('sha256', WORKER_SHARED_SECRET)
    .update(timestamp + bodyStr)
    .digest('hex');

  // v2 Signature (RECOMMENDED - new dual signature system)
  const v2Canonical = [method, path, timestamp, nonce, bodyStr].join('\n');
  const v2Signature = crypto.createHmac('sha256', WORKER_SHARED_SECRET)
    .update(v2Canonical)
    .digest('hex');

  return fetch(`${WORKER_API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': v1Signature,      // Your existing v1 header
      'x-sheen-sig-v2': v2Signature,         // New v2 header
      'x-sheen-timestamp': timestamp,        // Your existing timestamp
      'x-sheen-nonce': nonce                 // New nonce header
    },
    body: bodyStr || undefined
  });
}
```

### 🔧 **3. Connect Supabase UI Component**

**File:** `/components/ConnectSupabase.jsx`

```javascript
import { useState, useEffect } from 'react';
import { callWorkerAPI } from '../lib/workerAPI';

export default function ConnectSupabase({ userId, projectId }) {
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConnectionStatus();
  }, [userId, projectId]);

  const checkConnectionStatus = async () => {
    try {
      const response = await callWorkerAPI(`/v1/internal/supabase/status?userId=${userId}&projectId=${projectId}`);
      const status = await response.json();
      
      setConnectionStatus(status);
      
      if (status.connected && status.connectionId) {
        await loadProjects(status.connectionId);
      }
    } catch (error) {
      console.error('Failed to check connection status:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async (connectionId) => {
    try {
      const response = await callWorkerAPI(`/v1/internal/supabase/discovery?connectionId=${connectionId}`);
      const discovery = await response.json();
      setProjects(discovery.projects || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const initiateOAuth = async () => {
    try {
      // Generate OAuth URL (you'll need to implement this endpoint or generate client-side)
      const authUrl = generateOAuthURL(userId, projectId);
      window.location.href = authUrl;
    } catch (error) {
      console.error('Failed to initiate OAuth:', error);
    }
  };

  const disconnect = async () => {
    try {
      const response = await callWorkerAPI('/v1/internal/supabase/connection', 'DELETE', {
        userId,
        projectId
      });
      
      if (response.ok) {
        setConnectionStatus({ connected: false });
        setProjects([]);
        setSelectedProject('');
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  const getCredentials = async () => {
    if (!selectedProject) return null;
    
    try {
      const response = await callWorkerAPI(
        `/v1/internal/supabase/credentials?ref=${selectedProject}&userId=${userId}&projectId=${projectId}`
      );
      return await response.json();
    } catch (error) {
      console.error('Failed to get credentials:', error);
      return null;
    }
  };

  if (loading) return <div>Checking Supabase connection...</div>;

  return (
    <div className="supabase-integration">
      <h3>Supabase Integration</h3>
      
      {!connectionStatus?.connected ? (
        <div>
          <p>Connect your Supabase account to automatically configure your project.</p>
          <button onClick={initiateOAuth} className="btn-primary">
            Connect Supabase Account
          </button>
        </div>
      ) : (
        <div>
          <div className="connection-status">
            <span className="status-indicator connected">✅ Connected</span>
            <button onClick={disconnect} className="btn-secondary">Disconnect</button>
          </div>
          
          {projects.length > 0 && (
            <div className="project-selection">
              <label>Select Supabase Project:</label>
              <select 
                value={selectedProject} 
                onChange={(e) => setSelectedProject(e.target.value)}
              >
                <option value="">Choose a project...</option>
                {projects.map(project => (
                  <option key={project.ref} value={project.ref}>
                    {project.name} ({project.organization})
                  </option>
                ))}
              </select>
              
              {selectedProject && (
                <div className="project-info">
                  <p>✅ Project configured for deployment</p>
                  <small>Environment variables will be injected automatically</small>
                </div>
              )}
            </div>
          )}
          
          {projects.length === 0 && (
            <div className="no-projects">
              <p>No accessible projects found.</p>
              <a href="https://supabase.com/dashboard" target="_blank">
                Create a project in Supabase Dashboard
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### 🔧 **4. OAuth URL Generation**

**Option A: Client-side generation**
```javascript
function generateOAuthURL(userId, projectId, nextUrl) {
  const authUrl = new URL('https://api.supabase.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', process.env.NEXT_PUBLIC_SUPABASE_OAUTH_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  
  const redirectUri = process.env.NODE_ENV === 'production'
    ? 'https://sheenapps.com/connect/supabase/callback'
    : 'http://localhost:3000/connect/supabase/callback';
  authUrl.searchParams.set('redirect_uri', redirectUri);

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Create and store secure state
  const state = createSecureState(userId, projectId, nextUrl, codeVerifier);
  authUrl.searchParams.set('state', state);

  return authUrl.toString();
}
```

**Option B: Server-side endpoint**
```javascript
// API route: /api/supabase/oauth-url
export default async function handler(req, res) {
  const { userId, projectId, nextUrl } = req.body;
  
  // Call Worker to generate OAuth URL
  const response = await callWorkerAPI('/v1/internal/supabase/oauth-url', 'POST', {
    userId, projectId, nextUrl
  });
  
  const { authUrl } = await response.json();
  res.json({ authUrl });
}
```

## 🔑 **Environment Variables Needed**

Add to your Next.js environment:

```bash
# OAuth Configuration
NEXT_PUBLIC_SUPABASE_OAUTH_CLIENT_ID="2b8d26f7-71a7-4cd3-b39f-98211062065c"
OAUTH_STATE_SECRET="[same_as_worker_256bit_key]"

# Worker API
WORKER_SHARED_SECRET="[your_existing_hmac_secret]"
WORKER_API_BASE="https://worker.sheenapps.com"  # or localhost for dev
```

## 🔄 **Error Handling**

All Worker APIs return structured errors with fallback instructions:

```javascript
{
  "error": "OAuth connection expired",
  "fallbackToManual": true,
  "code": "TOKEN_EXPIRED",
  "instruction": "Reconnect Supabase in project settings"
}
```

Handle these in your UI:
- **TOKEN_EXPIRED** → Show reconnect button
- **CONNECTION_NOT_FOUND** → Show connect button
- **INSUFFICIENT_PERMISSIONS** → Show manual setup option
- **FALLBACK_TO_MANUAL** → Hide OAuth UI, show manual credential inputs

## 🧪 **Testing**

1. **OAuth Flow**: Test complete flow from "Connect" button to project selection
2. **Error Cases**: Test expired tokens, invalid projects, network failures
3. **Disconnect**: Verify clean disconnection and UI state reset
4. **Manual Fallback**: Ensure users can always configure manually

## 📞 **Support**

- **Worker APIs**: All routes documented in `/docs/SUPABASE_OAUTH_INTEGRATION_PLAN.md`
- **HMAC Authentication**: Reference `/docs/HMAC_COMPLETE_REFERENCE.md`
- **Error Codes**: Standard HTTP codes + custom error objects with `fallbackToManual` flags

The Worker backend handles all sensitive operations (token storage, Management API calls, encryption). The Next.js app only needs to handle UI and forward OAuth codes to the Worker APIs.