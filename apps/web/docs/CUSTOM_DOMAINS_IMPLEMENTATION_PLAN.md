# Custom Domains Implementation Plan

## 🌐 **Overview**

This document outlines the implementation plan for Custom Domains functionality in SheenApps. The feature will allow users to use their own domain names (e.g., `app.example.com`) instead of the default `*.sheenapps.com` subdomains.

**Status**: 🚧 **Planned** - API ready, UI implementation deferred

---

## ✅ **Current Implementation Status**

### **Backend/API Layer - COMPLETE**
- ✅ **Worker API v2.4** fully supports custom domains
- ✅ **VersionManagementService** has complete domain management methods:
  - `addDomain(projectId, domain, type, userId, idempotencyKey)`
  - `getProjectDomains(projectId)`
  - HMAC authentication support
  - Idempotency protection
- ✅ **Domain verification states** supported: `pending_verification`, `active`, `failed`
- ✅ **DNS setup guidance** available in API responses
- ✅ **Multi-domain publishing** automatically updates all configured domains

### **Frontend Layer - NOT IMPLEMENTED**
- ❌ No dedicated custom domains UI components
- ❌ No domain management React hooks
- ❌ No domain verification flow
- 🔄 **Temporary**: Custom Domains button hidden from UI (see Implementation Notes)

---

## 📋 **Detailed Implementation Plan**

### **Phase 1: Core Domain Management UI** (High Priority)

#### 1.1 Create `CustomDomainsModal` Component
**File**: `src/components/builder/custom-domains-modal.tsx`

**Features**:
- List current domains with status badges
- Add new custom domain form with validation
- Remove domain functionality
- Domain type indicators (sheenapps vs custom)
- Real-time status updates

**UI Mockup**:
```
┌─────────────────────────────────────┐
│ Custom Domains                    ✕ │
├─────────────────────────────────────┤
│ Current Domains:                    │
│                                     │
│ 🟢 myapp.sheenapps.com             │
│    Default SheenApps domain         │
│                                     │
│ 🟡 app.example.com        [Remove]  │
│    ⚠️ DNS verification pending      │
│    See setup instructions below     │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Add Custom Domain               │ │
│ │ domain.com          [Add]       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [DNS Setup Instructions]            │
└─────────────────────────────────────┘
```

#### 1.2 Create `useCustomDomains` Hook
**File**: `src/hooks/use-custom-domains.ts`

**Features**:
- React Query integration for domain fetching
- Add domain mutation with loading states
- Remove domain mutation
- Automatic refetching on domain status changes
- Error handling and retry logic

**Interface**:
```typescript
export function useCustomDomains(projectId: string) {
  return {
    domains: Domain[],
    isLoading: boolean,
    error: Error | null,
    addDomain: (domain: string, type: 'custom' | 'sheenapps') => Promise<void>,
    removeDomain: (domainId: string) => Promise<void>,
    refetch: () => void,
    isAddingDomain: boolean,
    isRemovingDomain: boolean
  }
}
```

#### 1.3 Domain Status Components
**File**: `src/components/builder/domain-status-badge.tsx`

**Status Indicators**:
- 🟢 **Active**: Domain verified and working
- 🟡 **Pending Verification**: DNS setup required
- 🔴 **Failed**: Verification failed, needs attention
- 🔵 **SheenApps Default**: Built-in subdomain

### **Phase 2: Domain Verification Flow** (Medium Priority)

#### 2.1 DNS Setup Instructions Component
**File**: `src/components/builder/dns-setup-instructions.tsx`

**Features**:
- Copy-to-clipboard DNS records
- Step-by-step setup guide
- Provider-specific instructions (Cloudflare, Namecheap, etc.)
- Verification status checking

**Example Instructions**:
```
To verify your domain, add these DNS records:

┌──────────────────────────────────────┐
│ Type: CNAME                          │
│ Name: app                            │
│ Value: abc123.pages.dev              │
│                              [Copy]  │
└──────────────────────────────────────┘

[Check DNS Status] [Retry Verification]
```

#### 2.2 Domain Verification Polling
**File**: `src/hooks/use-domain-verification.ts`

**Features**:
- Automatic polling for pending domains
- Smart polling intervals (30s → 2min → 5min)
- Success/failure notifications
- Verification retry mechanism

#### 2.3 Domain Management Integration
**Integration Points**:
- Version Status Badge → Custom Domains button
- Project Settings → Domains tab
- Publication flow → Domain selection

### **Phase 3: Advanced Features** (Lower Priority)

#### 3.1 Domain Analytics
- Traffic breakdown by domain
- Performance metrics per domain
- Geographic distribution

#### 3.2 SSL Certificate Management
- Certificate status monitoring
- Automatic renewal notifications
- Custom certificate upload

#### 3.3 Domain Performance Optimization
- CDN configuration per domain
- Cache settings management
- Regional optimization

---

## 🏗️ **Technical Architecture**

### **Data Flow**
```
User Action → useCustomDomains Hook → VersionManagementService → Worker API
                     ↓
React Query Cache ← Domain Status Updates ← WebSocket/Polling
                     ↓
UI Components → Status Badges → User Feedback
```

### **State Management**
- **React Query**: Domain data caching and synchronization
- **Local State**: Form inputs and UI interactions
- **Error Boundaries**: Graceful error handling
- **Loading States**: Skeleton loaders and progress indicators

### **API Integration**
```typescript
// Domain operations use existing service methods
const { addDomain, getProjectDomains } = versionService

// Example usage
await addDomain(projectId, 'app.example.com', 'custom', userId, idempotencyKey)
const domains = await getProjectDomains(projectId)
```

---

## 🎨 **UX/UI Design Principles**

### **Progressive Disclosure**
1. **Level 1**: Show domain count in version badge
2. **Level 2**: Quick domain overview in advanced options
3. **Level 3**: Full domain management modal

### **Human-Friendly Copy**
- ✅ "Add your own domain" vs "Configure CNAME records"
- ✅ "DNS verification pending" vs "Unverified domain"
- ✅ "Your site is live at" vs "Domain status: active"

### **Error Prevention**
- Domain format validation
- Duplicate domain detection
- Clear DNS setup instructions
- Retry mechanisms for failed verifications

---

## 🚀 **Implementation Timeline**

### **Week 1: Core Infrastructure**
- [ ] `CustomDomainsModal` component
- [ ] `useCustomDomains` hook
- [ ] Basic add/remove functionality
- [ ] Integration with version badge

### **Week 2: Verification Flow**
- [ ] DNS setup instructions
- [ ] Domain verification polling
- [ ] Status badges and notifications
- [ ] Error handling improvements

### **Week 3: Polish & Testing**
- [ ] UI/UX refinements
- [ ] Error boundary implementation
- [ ] Comprehensive testing
- [ ] Documentation updates

### **Future: Advanced Features**
- [ ] Domain analytics
- [ ] SSL management
- [ ] Performance optimization

---

## 🔧 **Implementation Notes**

### **Current Temporary State**
The Custom Domains button in the version management UI is currently **hidden** to avoid user confusion while the feature is being developed. 

**To re-enable when ready**:
```typescript
// In src/components/builder/version-status-badge.tsx
// Remove the conditional hiding and implement the modal integration
```

### **Integration Points**
- **Version Status Badge**: Advanced options → Custom Domains
- **Project Settings**: Dedicated domains section
- **Publication Flow**: Show domain update status

### **Testing Strategy**
- **Unit Tests**: Domain validation, API integration
- **Integration Tests**: Full domain verification flow
- **E2E Tests**: User journey from add to verification
- **Manual Testing**: DNS propagation across providers

---

## 📚 **Related Documentation**

- **API Reference**: `docs/API_VERSION_PUBLICATION_AND_MONITORING-2_AUGUST_2025.md`
- **Version Management**: `docs/SIMPLIFIED_VERSION_UX_PLAN.md`
- **Service Layer**: `src/services/version-management.ts`
- **Worker API**: Domain endpoints documentation

---

## 🎯 **Success Metrics**

### **Technical Metrics**
- Domain verification success rate > 95%
- Average verification time < 5 minutes
- DNS propagation detection accuracy
- Zero domain-related deployment failures

### **User Experience Metrics**
- Domain setup completion rate
- User support tickets related to domains
- Time to first successful custom domain
- User satisfaction with DNS guidance

---

## 🔮 **Future Considerations**

### **Scalability**
- Bulk domain operations
- Domain template system
- Automated DNS management

### **Enterprise Features**
- Domain approval workflows
- Team domain management
- Custom SSL certificates
- Advanced DNS configurations

### **Integration Opportunities**
- Domain registrar partnerships
- DNS provider integrations
- CDN provider connections
- Analytics platform data sharing

---

**Last Updated**: August 3, 2025  
**Status**: Ready for implementation when prioritized  
**Dependencies**: None (all infrastructure complete)