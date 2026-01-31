# In-House Mode Frontend Audit Findings

**Date**: 2026-01-14
**Status**: Audit complete, implementation starting

---

## Executive Summary

✅ **Good News**: Existing project creation flow is well-structured and i18n-ready
✅ **TypeScript types defined**: All API response contracts documented
🚧 **Next**: Build 4 API routes, then extend UI with mode selection

---

## Key Findings

### 1. Existing Project Creation Flow

**Location**: `/app/[locale]/builder/new/page.tsx`
**Component**: `<NewProjectPage>`
**Flow**:
```
User Input → POST /api/projects → Worker → Redirect to /builder/workspace/{id}
```

**Current Behavior**:
- User enters business idea OR selects template
- Component calls `POST /api/projects` with `{ businessIdea: "..." }`
- On success, redirects to workspace
- **Defaultsto Pro Mode** (no `infra_mode` parameter sent)

**i18n Status**: ✅ Fully internationalized
- Loads translations from messages files
- Supports all 9 locales
- Already has wizard mode (optional structured input)

---

### 2. Integration Points Identified

**Where to Add Mode Selection**:
```tsx
// Option A: Add step before business idea input
<ModeSelectionStep /> → <BusinessIdeaInput /> → Create

// Option B: Add toggle in business idea screen (simpler)
<BusinessIdeaInput modeToggle={<ModeSelector />} /> → Create
```

**Recommendation**: **Option B** (inline toggle)
- Less friction
- Keeps wizard flow intact
- Easy to default to Easy Mode

---

### 3. API Modification Needed

**Current**:
```typescript
POST /api/projects
Body: { businessIdea: string }
```

**New (Phase 1A)**:
```typescript
POST /api/projects
Body: {
  businessIdea: string,
  infraMode?: 'easy' | 'pro'  // Default: 'easy'
}
```

**Backend Change Required**:
- Worker's project creation endpoint must accept `infra_mode`
- Create inhouse project if `infraMode === 'easy'`
- Store `infra_mode` in projects table

---

### 4. Workspace Integration

**Current Workspace**: `/builder/workspace/[projectId]`

**Phase 1A Addition**:
- Add conditional rendering based on `project.infra_mode`
- Show `<InfrastructurePanel>` for Easy Mode
- Keep existing `<IntegrationStatusBar>` for Pro Mode

```tsx
// In workspace page
{project.infra_mode === 'easy' ? (
  <InfrastructurePanel projectId={project.id} />
) : (
  <IntegrationStatusBar projectId={project.id} />
)}
```

---

### 5. TypeScript Types Status

✅ **Created**: `/src/types/inhouse-api.ts`

**Exported Types**:
- `ApiResponse<T>` - Standard response envelope
- `CreateProjectResponse` - Project creation result
- `InfrastructureStatus` - Full status for panel
- `DeployResponse` - Deployment result
- `InhouseErrorCode` - All error codes

**Helper Functions**:
- `getStatusVariant()` - Badge color logic
- `isLoadingStatus()` - Detect provisioning/deploying states
- `bytesToMB()` - Storage formatting
- `getQuotaPercentage()` - Quota calculations

---

## Phase 1A Implementation Plan

### Step 1: API Routes (Next Task)

Build 4 proxy routes:

1. **POST `/api/inhouse/projects/create`**
   - Accepts: `CreateInhouseProjectRequest`
   - Returns: `ApiResponse<CreateProjectResponse>`
   - Calls: Worker `/v1/inhouse/projects/create`

2. **GET `/api/inhouse/projects/[id]/status`**
   - Returns: `ApiResponse<InfrastructureStatus>`
   - Calls: Worker `/v1/inhouse/projects/:id/status`

3. **POST `/api/inhouse/deploy`**
   - Accepts: `DeployBuildRequest`
   - Returns: `ApiResponse<DeployResponse>`
   - Calls: Worker `/v1/inhouse/deploy`

4. **GET `/api/inhouse/projects/[id]`** (optional)
   - Returns: `ApiResponse<InhouseProjectDetails>`
   - Calls: Worker `/v1/inhouse/projects/:id`

### Step 2: Modify Project Creation

Extend `<NewProjectPage>` component:
```tsx
// Add mode selector state
const [infraMode, setInfraMode] = useState<'easy' | 'pro'>('easy')

// Modify API call
const response = await fetch('/api/projects', {
  method: 'POST',
  body: JSON.stringify({
    businessIdea: idea.trim(),
    infraMode  // NEW
  })
})
```

### Step 3: Build Infrastructure Panel

Create new component:
```
/src/components/workspace/infrastructure/
├── InfrastructurePanel.tsx (main)
├── DatabaseCard.tsx
├── HostingCard.tsx
├── QuotasCard.tsx
└── ApiKeysCard.tsx
```

### Step 4: Deploy UI

Create:
```
/src/components/workspace/deployment/
├── DeployButton.tsx
└── DeployDialog.tsx
```

---

## Translation Keys Needed

### Phase 1A (en + ar)

```json
{
  "infrastructure": {
    "title": "Infrastructure",
    "easyMode": "Easy Mode",
    "proMode": "Pro Mode",
    "database": {
      "title": "Database",
      "status": {
        "active": "Active",
        "provisioning": "Provisioning",
        "error": "Error"
      },
      "schema": "Schema",
      "tables": "Tables",
      "storage": "Storage"
    },
    "hosting": {
      "title": "Hosting",
      "status": {
        "live": "Live",
        "deploying": "Deploying",
        "none": "Not Deployed",
        "error": "Error"
      },
      "url": "URL",
      "lastDeploy": "Last deploy"
    },
    "quotas": {
      "title": "Usage Today",
      "requests": "Requests",
      "bandwidth": "Bandwidth",
      "resetsAt": "Resets at"
    },
    "apiKeys": {
      "title": "API Keys",
      "publicKey": "Public Key",
      "serverKey": "Server Key",
      "copy": "Copy",
      "copied": "Copied!"
    },
    "deploy": {
      "button": "Deploy",
      "title": "Deploy Build",
      "deploying": "Deploying...",
      "success": "Deployed successfully!",
      "error": "Deployment failed"
    }
  }
}
```

---

## Risk Assessment

### Low Risk ✅
- Extending existing project creation flow (additive change)
- TypeScript types prevent API contract mismatches
- Conditional UI rendering (Easy vs Pro) is clean

### Medium Risk ⚠️
- Worker endpoint `/v1/inhouse/projects/create` must be implemented
  - **Mitigation**: Backend Phase 1 already complete (services exist)
- `infra_mode` column might not exist in production
  - **Mitigation**: Defensive fallback to 'pro'

### Dependencies 🔗
- Worker routes must be registered (✅ Done)
- Database migration must be deployed
- Cloudflare dispatch worker must be deployed

---

## Success Metrics

**Definition of Done (Phase 1A)**:
- [ ] User can select Easy Mode during project creation
- [ ] InfrastructurePanel shows database + hosting status
- [ ] User can deploy a build to `{subdomain}.sheenapps.com`
- [ ] Deployed site is accessible and functional
- [ ] All UI text has i18n keys (en + ar translated)

**Not Required**:
- Chat deploy button (Phase 1B)
- Schema browser (Phase 2)
- Admin panel (Phase 3)

---

*Audit completed: 2026-01-14*
*Next: Build API routes*
