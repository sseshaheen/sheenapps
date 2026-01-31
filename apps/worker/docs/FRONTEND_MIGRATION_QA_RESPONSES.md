# Frontend Integration Q&A - Website Migration Tool

## 🏗️ Integration & Architecture

### 1. Project Creation Flow
**Question**: When migration completes with targetProjectId, how does this integrate with our existing project system?

**Answer**: **Currently NOT integrated** - this needs to be implemented. Here's the recommended approach:

```typescript
// In migration completion logic (needs implementation)
async function completeMigration(migrationId: string) {
  // 1. Generate Next.js project files
  const projectFiles = await generateProjectFiles(migrationResult);

  // 2. Create entry in existing projects table
  const project = await pool.query(`
    INSERT INTO projects (owner_id, name, subdomain, config)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [
    userId,
    `Migrated ${sourceDomain}`,
    generateUniqueSubdomain(sourceDomain),
    {
      source: 'migration',
      migrationId,
      originalUrl: sourceUrl
    }
  ]);

  // 3. Update migration record with project ID
  await pool.query(`
    UPDATE migration_projects
    SET target_project_id = $1, status = 'completed'
    WHERE id = $2
  `, [project.rows[0].id, migrationId]);

  return project.rows[0].id;
}
```

**Billing Integration**: Yes, migration projects should count against user limits and require entitlement checks:
```typescript
// Check before starting migration
const projectCount = await getUserProjectCount(userId);
const userPlan = await getUserPlan(userId);

if (projectCount >= userPlan.maxProjects) {
  throw new Error('Project limit reached');
}
```

### 2. Builder Integration
**Question**: How does the migration result format align with our builder's project structure?

**Answer**: The migration generates **standard Next.js 14 App Router structure** that should be compatible:

```
generated-project/
├── app/
│   ├── page.tsx              # Converted homepage
│   ├── about/page.tsx        # Converted pages
│   ├── contact/page.tsx
│   └── layout.tsx            # Root layout
├── components/
│   ├── Header.tsx            # Extracted components
│   ├── Footer.tsx
│   └── LegacyBlock.tsx       # Fallback for complex content
├── public/
│   └── assets/               # Optimized images/assets
├── styles/
│   └── globals.css           # Tailwind + custom styles
├── next.config.js
├── package.json
└── tailwind.config.js
```

**Builder Compatibility**:
- ✅ Standard React components (your builder can edit)
- ✅ Tailwind classes (compatible with visual editing)
- ⚠️ LegacyBlock components (may need special handling)
- ✅ Standard Next.js routing (compatible with your structure)

### 3. User Limits
**Question**: How does migration count against user project limits?

**Answer**: **Should count as regular projects** with these considerations:

```typescript
interface UserLimits {
  maxProjects: number;        // Migration projects count toward this
  maxMigrationsPerMonth: number; // Separate migration limit
  migrationTokenBudget: number;  // AI cost limits
}

// Recommended approach
const limits = {
  free: { maxProjects: 3, maxMigrationsPerMonth: 1 },
  pro: { maxProjects: 10, maxMigrationsPerMonth: 5 },
  enterprise: { maxProjects: -1, maxMigrationsPerMonth: -1 }
};
```

## 🔄 User Experience Flow

### 4. Entry Points
**Question**: Where should users access migration?

**Answer**: **Multiple entry points** for different user contexts:

```typescript
// Recommended entry points:
const entryPoints = {
  primary: '/migrate',           // Dedicated migration page
  dashboard: '/dashboard?tab=migrate', // Dashboard tab
  projectCreate: '/projects/new?source=migrate', // In project creation
  marketing: '/features/migration'  // Marketing/onboarding
};
```

**UX Flow Recommendations**:
1. **Primary**: Dedicated "Migrate Website" in main nav
2. **Secondary**: "Import existing site" option in project creation
3. **Dashboard**: Migration history/status in user dashboard
4. **Marketing**: Feature explanation page for new users

### 5. Progress Integration
**Question**: Should migration progress integrate with existing build events system?

**Answer**: **Recommend separate but compatible** system:

```typescript
// Migration has different phases than builds
interface MigrationEvent {
  migrationId: string;
  phase: 'analyzing' | 'planning' | 'transforming' | 'validating' | 'deploying';
  progress: number; // 0-100
  message: string;
  timestamp: Date;
}

// Could optionally integrate with existing events once project is created
interface BuildEvent {
  projectId: string;
  type: 'migration_deploy' | 'build' | 'deploy';
  // ... existing build event structure
}
```

**Benefits of separate system**:
- ✅ Different progress phases than builds
- ✅ Happens before project exists
- ✅ AI-specific events (tool calls, agent decisions)
- ✅ Can later bridge to build system when deploying

### 6. Verification UX
**Question**: DNS/file verification seems complex - UX recommendations?

**Answer**: **Simplified verification flow** with clear instructions:

```jsx
function VerificationFlow({ migrationId, method }) {
  if (method === 'dns') {
    return (
      <div className="verification-steps">
        <h3>Verify you own this website</h3>
        <p>Add this DNS record to prove you own the domain:</p>

        <div className="code-block">
          <strong>Type:</strong> TXT<br/>
          <strong>Name:</strong> _sheenapps-verify<br/>
          <strong>Value:</strong> {token}
        </div>

        <div className="help-links">
          <a href="/help/dns-verification/cloudflare">Cloudflare Instructions</a>
          <a href="/help/dns-verification/godaddy">GoDaddy Instructions</a>
          <a href="/help/dns-verification/namecheap">Namecheap Instructions</a>
        </div>

        <button onClick={checkVerification}>
          I've added the record - Check now
        </button>
      </div>
    );
  }

  // File verification as fallback
  return <FileVerificationFlow token={token} />;
}
```

**UX Improvements**:
- ✅ Auto-detect DNS provider from domain
- ✅ Provider-specific instructions with screenshots
- ✅ File verification as simpler fallback
- ✅ "Skip verification" for development/demos

## 🛠️ Technical Implementation

### 7. Base URL Configuration
**Question**: Should migration APIs use existing worker auth system?

**Answer**: **Use existing patterns** but note the authentication approach:

```typescript
// Migration API follows your explicit userId pattern
const migrationRequest = {
  method: 'POST',
  url: '/api/migration/start',
  headers: {
    'Content-Type': 'application/json',
    // NO Authorization header - uses explicit userId
  },
  body: JSON.stringify({
    userId: session.user.id, // Explicit in body
    sourceUrl,
    userBrief
  })
};

// Same base URL as other worker APIs
const API_BASE = process.env.WORKER_API_URL || 'https://worker.sheenapps.com';
```

**Integration Notes**:
- ✅ Uses same explicit userId pattern as existing APIs
- ✅ Same error response format as other endpoints
- ✅ Same rate limiting system
- ✅ Same server infrastructure

### 8. Real-time Updates
**Question**: WebSocket support for real-time progress?

**Answer**: **Polling for MVP, WebSocket for future**:

```typescript
// Current: Polling approach
const pollMigrationStatus = (migrationId: string) => {
  const poll = async () => {
    const response = await fetch(`/api/migration/${migrationId}/status?userId=${userId}`);
    const status = await response.json();

    updateUI(status);

    if (['analyzing', 'processing'].includes(status.status)) {
      setTimeout(poll, 2000); // Poll every 2 seconds
    }
  };
  poll();
};

// Future: WebSocket integration
const wsUrl = `wss://worker.sheenapps.com/ws/migration/${migrationId}?userId=${userId}`;
const ws = new WebSocket(wsUrl);
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  updateUI(update);
};
```

**Recommendation**:
- ✅ **Start with polling** (simpler, more reliable)
- ✅ **Add WebSocket later** for better UX
- ✅ **Use existing SSE service** if available

### 9. Error Recovery
**Question**: Can users retry with different settings?

**Answer**: **Multiple retry strategies** implemented:

```typescript
// Endpoint: POST /api/migration/:id/retry (needs implementation)
interface RetryOptions {
  newUserBrief?: UserBrief;    // Change settings
  resetFromPhase?: string;     // Restart from specific phase
  increaseBudget?: boolean;    // Increase AI token budget
}

// Frontend retry flow
const retryMigration = async (migrationId: string, options: RetryOptions) => {
  if (options.newUserBrief) {
    // Update user brief first
    await fetch(`/api/migration/${migrationId}/brief`, {
      method: 'PUT',
      body: JSON.stringify({ userId, userBrief: options.newUserBrief })
    });
  }

  // Start retry
  return fetch(`/api/migration/${migrationId}/process`, {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
};
```

**Recovery Options**:
- ✅ **Restart from scratch** with new settings
- ✅ **Resume from last phase** if partial failure
- ✅ **Increase budget** if token limit hit
- ✅ **Change user brief** and retry transformation

## 💰 Business Logic

### 10. Billing Integration
**Question**: How should migration usage be tracked/billed?

**Answer**: **Multi-tier billing approach**:

```typescript
interface MigrationBilling {
  // Consumption-based
  aiTokensUsed: number;        // Track actual AI cost
  toolCallsExecuted: number;   // Track tool usage

  // Outcome-based
  pagesGenerated: number;      // Track output size
  componentsCreated: number;   // Track complexity

  // Time-based
  processingMinutes: number;   // Track duration

  // Simple billing
  migrationsUsed: number;      // Simple count per plan
}

// Recommended billing tiers
const billingTiers = {
  free: {
    migrationsPerMonth: 1,
    maxTokensPerMigration: 1000000,
    maxPages: 10
  },
  pro: {
    migrationsPerMonth: 5,
    maxTokensPerMigration: 5000000,
    maxPages: 50,
    overage: { perToken: 0.000001, perPage: 0.10 }
  },
  enterprise: {
    migrationsPerMonth: -1, // Unlimited
    customBudgets: true,
    dedicatedSupport: true
  }
};
```

**Usage Tracking**:
```typescript
// Track in migration_tool_calls table
interface ToolCallBilling {
  migrationId: string;
  agent: string;
  tool: string;
  costTokens: number;
  createdAt: Date;
}

// Aggregate for billing
const getMigrationCost = async (migrationId: string) => {
  const result = await pool.query(`
    SELECT
      SUM(cost_tokens) as total_tokens,
      COUNT(*) as total_tool_calls,
      EXTRACT(minutes FROM MAX(created_at) - MIN(created_at)) as duration_minutes
    FROM migration_tool_calls
    WHERE migration_project_id = $1
  `, [migrationId]);

  return result.rows[0];
};
```

## 🚧 Implementation Priorities

### Phase 1: MVP Integration
1. **Project Creation**: Auto-create in projects table
2. **Basic Billing**: Count against project limits
3. **Simple UX**: Dedicated migration page with polling
4. **DNS Verification**: Basic instructions with manual check

### Phase 2: Enhanced Integration
1. **Builder Compatibility**: Test/fix component editing
2. **Advanced Billing**: Token tracking and overages
3. **Better UX**: Provider-specific DNS instructions
4. **Error Recovery**: Retry with different settings

### Phase 3: Production Polish
1. **WebSocket Updates**: Real-time progress
2. **Advanced Billing**: Detailed usage analytics
3. **Enterprise Features**: Custom budgets, dedicated support
4. **Full Builder Integration**: Seamless editing experience

## 🔗 Missing Implementation

**Critical**: These features are planned but **not yet implemented**:
- [ ] Project creation integration
- [ ] Billing/entitlement checks
- [ ] WebSocket progress updates
- [ ] Retry/recovery endpoints
- [ ] Builder compatibility testing

**Recommendation**: Start with MVP polling + basic project creation, then iterate based on user feedback.