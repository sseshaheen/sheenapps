# Error Recovery System: Project Isolation Security Fix

## 🚨 CRITICAL SECURITY ISSUE IDENTIFIED

**Date**: August 23, 2025
**Severity**: HIGH - Cross-project data exposure
**Status**: IMMEDIATE FIX REQUIRED

## Executive Summary

The Error Recovery System currently uses a **shared Redis queue** that processes errors from ALL projects globally, creating serious privacy, security, and operational issues.

### Evidence of Cross-Project Contamination
The Error Recovery System is using:
  - Project Directory: /Users/sh/projects/chat-plan/project-01K3BDD0DNVCNMTG6RF2DR692H
  - Current User Project: /Users/sh/projects/d78b030e-5714-4458-8f58-e6a772f0ea02/2ffae339-6ed6-411b-9f65-d79cc890eb1f


**Logs from August 23, 2025 deployment test**:
- **Current User Project**: `2ffae339-6ed6-411b-9f65-d79cc890eb1f` (Hello Server World app)
- **Error Recovery Analyzed**: `01K3BDD0DNVCNMTG6RF2DR692H` (completely different project)
- **Working Directory Cross-contamination**: `/Users/sh/projects/chat-plan/project-01K3BDD0DNVCNMTG6RF2DR692H`

## Root Cause Analysis

### Current Flawed Architecture
```
┌─────────────────────────────────────────┐
│          Redis Queue: 'error-recovery'  │
│               (SHARED GLOBALLY)         │
├─────────────────────────────────────────┤
│ Job 1: projectId=A, userId=user1       │
│ Job 2: projectId=B, userId=user2       │  ← PRIVACY BREACH
│ Job 3: projectId=C, userId=user1       │
│ Job 4: projectId=D, userId=user3       │  ← SECURITY RISK
└─────────────────────────────────────────┘
           ↓
    Global Worker processes ANY job
    (No project isolation filtering)
```

### Code Locations
| File | Line | Issue |
|------|------|-------|
| `errorInterceptor.ts` | 90 | `new Queue('error-recovery')` - shared queue |
| `errorRecoveryWorker.ts` | 1019 | Global worker processing all projects |
| `errorRecoveryWorker.ts` | 1026 | No project-based filtering |

### Project Context Available But Ignored
The `ErrorContext` interface DOES include project isolation fields:
```typescript
projectContext?: {
  projectId?: string;    // ✅ Available
  userId?: string;       // ✅ Available
  buildId?: string;      // ✅ Available
  framework?: string;
  dependencies?: Record<string, string>;
  projectPath?: string;  // ✅ Available
}
```

**Problem**: The queue worker ignores this context and processes ALL errors globally.

## Security Impact Assessment

### High Risk Issues
- **Privacy Violation**: Users' error data exposed to other users' recovery processes
- **Data Leakage**: Project-specific information cross-contaminated
- **GDPR/Compliance Risk**: Unauthorized access to user data
- **Trust Erosion**: Users unknowingly sharing project details

### Operational Issues
- **Resource Waste**: Processing irrelevant errors
- **Log Pollution**: Cross-project errors create confusing logs
- **False Positives**: Recovery attempts on wrong projects
- **Performance Impact**: Unnecessary processing overhead

## Recommended Solutions

### Solution 1: Project-Scoped Queues (RECOMMENDED)

**Implementation**: Create separate Redis queues per project

```typescript
// Before (VULNERABLE)
new Queue('error-recovery', { connection })

// After (SECURE)
new Queue(`error-recovery:${projectId}`, { connection })
```

**Benefits**:
- ✅ Complete project isolation
- ✅ Easy to implement
- ✅ Backward compatible
- ✅ Redis-native solution

**Worker Architecture**:
```
┌─────────────────────────────────────────┐
│ Queue: error-recovery:project-A         │
│ ├─ Jobs only from project A             │
│ └─ Worker A processes only project A    │
├─────────────────────────────────────────┤
│ Queue: error-recovery:project-B         │
│ ├─ Jobs only from project B             │
│ └─ Worker B processes only project B    │
└─────────────────────────────────────────┘
```

### Solution 2: User-Scoped Queues (ALTERNATIVE)

Create queues per user instead of per project:
```typescript
new Queue(`error-recovery:user:${userId}`, { connection })
```

**Benefits**:
- ✅ User privacy protection
- ✅ Reduced queue proliferation
- ❓ Still allows cross-project within same user

### Solution 3: Filtered Processing (LESS SECURE)

Keep shared queue but add project filtering in worker:

```typescript
async (job: Job<ErrorRecoveryJobData>) => {
  const { errorContext } = job.data;

  // Only process if project matches current context
  if (errorContext.projectContext?.projectId !== getCurrentProjectId()) {
    console.log(`[Security] Skipping cross-project error: ${errorContext.projectContext?.projectId}`);
    return { status: 'skipped', reason: 'cross_project_protection' };
  }

  const processor = new ErrorRecoveryProcessor();
  return await processor.processRecovery(job);
}
```

**Issues**:
- ❌ Still exposes data to worker process
- ❌ Requires additional context management
- ❌ Error data still stored in shared queue

## Implementation Plan

### Phase 1: Immediate Security Fix (CRITICAL - Do This Week)

1. **Update Error Interceptor**
   ```typescript
   // File: src/services/errorInterceptor.ts:90
   this.errorQueue = new Queue(`error-recovery:${projectId}`, { connection });
   ```

2. **Update Worker Creation**
   ```typescript
   // File: src/workers/errorRecoveryWorker.ts:1018-1028
   export function createErrorRecoveryWorker(projectId: string) {
     return new Worker(
       `error-recovery:${projectId}`,
       async (job: Job<ErrorRecoveryJobData>) => {
         const processor = new ErrorRecoveryProcessor(projectId);
         return await processor.processRecovery(job);
       },
       { connection, concurrency: 1 } // Reduce concurrency for isolation
     );
   }
   ```

3. **Update System Initialization**
   ```typescript
   // Start project-specific workers when projects are created
   export async function startProjectErrorRecovery(projectId: string) {
     const worker = createErrorRecoveryWorker(projectId);
     projectWorkers.set(projectId, worker);
   }
   ```

### Phase 2: Worker Lifecycle Management

1. **Worker Pool Management**
   - Start workers when projects are created
   - Stop workers when projects are deleted
   - Implement worker cleanup for inactive projects

2. **Resource Management**
   - Monitor queue sizes per project
   - Implement automatic cleanup of old errors
   - Add project-specific metrics

### Phase 3: Enhanced Security Features

1. **Audit Trail**
   - Log all cross-project access attempts
   - Monitor queue isolation effectiveness
   - Alert on security violations

2. **Configuration**
   - Environment variable for isolation mode
   - Fallback to filtered processing if needed
   - Testing mode for development

## Testing Strategy

### Unit Tests
```typescript
describe('Error Recovery Project Isolation', () => {
  test('should only process errors from same project', async () => {
    const projectA = 'project-a';
    const projectB = 'project-b';

    // Create project-specific workers
    const workerA = createErrorRecoveryWorker(projectA);
    const workerB = createErrorRecoveryWorker(projectB);

    // Add error from project A
    await addErrorToQueue(projectA, mockErrorA);

    // Verify worker A processes it, worker B doesn't
    expect(await getQueueSize(`error-recovery:${projectA}`)).toBe(0);
    expect(await getQueueSize(`error-recovery:${projectB}`)).toBe(0);
  });
});
```

### Integration Tests
- Multi-project deployment scenarios
- Cross-project contamination detection
- Worker lifecycle testing

### Security Tests
- Privacy violation detection
- Data leakage prevention
- Unauthorized access prevention

## Migration Strategy

### Development Environment
1. Deploy fix to development first
2. Test with multiple concurrent projects
3. Verify complete isolation

### Staging Environment
1. Deploy with monitoring enabled
2. Run load tests with cross-project scenarios
3. Validate security improvements

### Production Rollout
1. **Zero-downtime deployment**:
   - Start new project-scoped workers alongside existing
   - Drain existing shared queue
   - Switch new errors to project-scoped queues
   - Stop shared worker after queue is empty

2. **Rollback Plan**:
   - Keep shared queue infrastructure ready
   - Switch back to shared processing if issues occur
   - Maintain dual-mode capability during transition

## Monitoring & Alerts

### Key Metrics
- Cross-project access attempts (should be 0)
- Queue isolation effectiveness
- Worker resource utilization per project
- Error processing latency by project

### Alert Conditions
- Any cross-project error processing detected
- Project queue sizes exceeding thresholds
- Worker failures or resource exhaustion
- Unauthorized data access attempts

## Success Criteria

### Security Goals
- ✅ Zero cross-project error processing
- ✅ Complete user data isolation
- ✅ No privacy violations detected
- ✅ Audit trail for all access

### Performance Goals
- ✅ No degradation in error processing speed
- ✅ Efficient resource utilization
- ✅ Scalable to 1000+ concurrent projects

### Operational Goals
- ✅ Clear, project-specific logs
- ✅ Easy project lifecycle management
- ✅ Simplified debugging and monitoring

## Risk Assessment

### Implementation Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|---------|------------|
| Queue proliferation | High | Medium | Implement cleanup and monitoring |
| Worker resource exhaustion | Medium | High | Limit concurrent workers, add monitoring |
| Migration data loss | Low | High | Comprehensive testing, gradual rollout |
| Performance degradation | Low | Medium | Load testing, optimization |

### Security Risks (Current State)
| Risk | Probability | Impact | Urgency |
|------|------------|---------|----------|
| Data privacy violation | High | Critical | IMMEDIATE |
| Cross-user contamination | High | Critical | IMMEDIATE |
| Compliance violations | Medium | High | THIS WEEK |
| Trust/reputation damage | Medium | High | THIS WEEK |

## Conclusion

**IMMEDIATE ACTION REQUIRED**: The current Error Recovery System has a critical security flaw that exposes user data across projects. This violates privacy expectations and potentially compliance requirements.

**Recommended Approach**: Implement project-scoped Redis queues as the primary fix. This provides complete isolation while maintaining system functionality.

**Timeline**:
- **Week 1**: Implement and test project-scoped queues in development
- **Week 2**: Deploy to staging with comprehensive testing
- **Week 3**: Production rollout with monitoring
- **Week 4**: Cleanup legacy shared queue infrastructure

**Priority**: CRITICAL - This should be treated as a security incident requiring immediate resolution.

---

**Document Owner**: Development Team
**Security Review Required**: Yes
**Compliance Review Required**: Yes
**Next Review Date**: After implementation completion

*This plan addresses a critical security vulnerability and should be prioritized above all non-essential features.*
