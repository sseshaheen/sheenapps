# AI Tier System Integration Plan

## Executive Summary
This document outlines a phased approach to integrate the AI tier system into the existing SheenApps codebase. The integration will be gradual, risk-controlled, and transparent to end users while optimizing costs by 60-80%.

## Current State Analysis

### Service Architecture
- **Primary Services**: `RealAIService` handles production AI calls
- **Mock Service**: `MockAIService` provides development responses
- **API Routes**: 7 AI endpoints handling various generation tasks
- **Client Integration**: Direct service instantiation in API routes

### AI Usage Patterns
1. **Business Analysis** - Complex reasoning tasks
2. **Content Generation** - Marketing copy, descriptions
3. **Component Generation** - UI/UX code generation
4. **Responsive Design** - CSS and layout generation
5. **Name/Tagline Generation** - Creative content
6. **Feature Recommendations** - Strategic planning
7. **Pricing Strategy** - Business logic

## Service to Tier Mapping

### Tier Assignments
```typescript
// Basic Tier ($0.005/request)
- Simple content generation (short copy, CTAs)
- Basic name suggestions
- Simple tagline generation
- Mock responses for development

// Intermediate Tier ($0.02/request)
- Standard content generation
- Marketing copy
- Feature lists
- Basic responsive CSS

// Advanced Tier ($0.05/request)
- Component generation
- Complex responsive layouts
- Detailed content analysis
- Business feature recommendations

// Premium Tier ($0.15/request)
- Business analysis
- Strategic planning
- Financial/legal content
- Complex component orchestration

// Specialized Tier ($0.20/request)
- Domain-specific expertise
- Healthcare content
- Legal document generation
- Financial analysis
```

## Integration Phases

### Phase 1: Foundation (Week 1)
**Goal**: Set up tier system infrastructure without affecting current functionality

1. **Service Registry Integration**
   - Wrap existing services with tier-aware adapters
   - Add tier metadata to service configurations
   - Implement usage tracking hooks

2. **Configuration Setup**
   - Deploy `ai-tiers.json` configuration
   - Set conservative tier mappings initially
   - Enable configuration hot-reloading

3. **Monitoring Infrastructure**
   - Add tier-specific metrics collection
   - Create cost tracking dashboard
   - Set up alerting for budget thresholds

**Files to Modify**:
- `src/services/ai/real-ai-service.ts` - Add tier routing
- `src/services/ai/service-factory.ts` - Create unified factory
- `src/app/api/ai/*/route.ts` - Update all API routes

### Phase 2: Gradual Rollout (Week 2-3)
**Goal**: Enable tier routing for low-risk endpoints

1. **Start with Development/Staging**
   ```typescript
   // Example: Update content generation endpoint
   export async function POST(request: NextRequest) {
     const body = await request.json()
     
     // NEW: Use tier-aware service
     const result = await FallbackOrchestrator.executeWithFallback(
       {
         type: 'content',
         content: body.prompt,
         domain: detectDomain(body),
         maxCost: body.maxCost || 0.05
       },
       async (provider, request) => {
         const service = ServiceFactory.create(provider)
         return await service.generateContent(request)
       }
     )
     
     return NextResponse.json(result)
   }
   ```

2. **Rollout Order**:
   - Day 1-3: Content generation endpoints
   - Day 4-6: Name/tagline generation
   - Day 7-9: Component generation
   - Day 10-12: Business analysis (monitor closely)

3. **Feature Flags**
   ```typescript
   const USE_TIER_ROUTING = {
     content: process.env.TIER_ROUTING_CONTENT === 'true',
     components: process.env.TIER_ROUTING_COMPONENTS === 'true',
     analysis: process.env.TIER_ROUTING_ANALYSIS === 'true'
   }
   ```

### Phase 3: Optimization (Week 4)
**Goal**: Fine-tune tier assignments based on real usage data

1. **Analyze Metrics**
   - Cost per endpoint
   - Quality scores by tier
   - User satisfaction metrics
   - Performance benchmarks

2. **Adjust Configurations**
   - Update tier mappings
   - Optimize fallback chains
   - Tune budget limits

3. **A/B Testing**
   - Compare tier routing vs direct service calls
   - Measure cost savings
   - Monitor quality metrics

### Phase 4: Full Production (Week 5)
**Goal**: Complete migration with all safety measures

1. **Enable All Endpoints**
   - Remove feature flags
   - Activate tier routing globally
   - Enable automatic fallbacks

2. **Documentation**
   - Update API documentation
   - Create runbooks
   - Document rollback procedures

## Implementation Details

### 1. Service Factory Pattern
```typescript
// src/services/ai/service-factory.ts
export class AIServiceFactory {
  static create(provider: string): AIService {
    switch (provider) {
      case 'openai-gpt4o':
        return new OpenAIService({ model: 'gpt-4o' })
      case 'claude-opus':
        return new AnthropicService({ model: 'claude-3-opus' })
      case 'mock':
        return new MockAIService()
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  }
}
```

### 2. Unified Request Interface
```typescript
// src/services/ai/unified-service.ts
export class UnifiedAIService {
  async processRequest(
    request: AIRequest,
    options: { useTierRouting?: boolean } = {}
  ): Promise<AIResponse> {
    if (options.useTierRouting) {
      return await FallbackOrchestrator.executeWithFallback(
        request,
        async (provider, req) => {
          const service = AIServiceFactory.create(provider)
          return await service.process(req)
        }
      )
    }
    
    // Fallback to current behavior
    const service = new RealAIService()
    return await service.process(request)
  }
}
```

### 3. API Route Migration Example
```typescript
// Before
const aiService = new RealAIService()
const result = await aiService.generateContent(analysis)

// After
const result = await UnifiedAIService.processRequest({
  type: 'content',
  content: analysis,
  domain: 'business',
  complexity: 'moderate'
}, { useTierRouting: true })
```

## Monitoring & Analytics

### Key Metrics
1. **Cost Metrics**
   - Cost per request by tier
   - Total monthly spend by endpoint
   - Cost savings vs baseline

2. **Performance Metrics**
   - Response time by tier
   - Fallback frequency
   - Error rates by provider

3. **Quality Metrics**
   - User satisfaction scores
   - Content quality ratings
   - Completion rates

### Dashboard Requirements
```typescript
// src/services/ai/analytics/dashboard.ts
export interface TierDashboard {
  // Real-time metrics
  currentMonthSpend: number
  requestsToday: number
  activeProviders: string[]
  
  // Historical data
  costTrend: TimeSeriesData
  tierDistribution: PieChartData
  providerReliability: BarChartData
  
  // Alerts
  budgetAlerts: Alert[]
  performanceAlerts: Alert[]
}
```

## Risk Mitigation

### Rollback Strategy
1. **Feature Flags**: Instant disable per endpoint
2. **Configuration Rollback**: Revert tier mappings
3. **Circuit Breakers**: Auto-disable on high error rates
4. **Fallback to Direct**: Always maintain direct service access

### Testing Strategy
1. **Unit Tests**: All tier routing logic
2. **Integration Tests**: End-to-end flows
3. **Load Tests**: Performance under scale
4. **Chaos Tests**: Provider failure scenarios

### Monitoring Alerts
```typescript
// Critical alerts
- Budget exceeded (>90% of limit)
- High fallback rate (>20%)
- Provider error rate (>5%)
- Response time degradation (>2x baseline)
```

## Success Criteria

### Week 1
- ✅ Tier infrastructure deployed
- ✅ Configuration system active
- ✅ Basic monitoring enabled

### Week 2-3
- ✅ 50% endpoints using tier routing
- ✅ Cost reduction visible (>30%)
- ✅ No quality degradation

### Week 4
- ✅ Optimized tier mappings
- ✅ 60%+ cost savings achieved
- ✅ A/B test results positive

### Week 5
- ✅ 100% endpoints migrated
- ✅ Full monitoring dashboard
- ✅ Documentation complete

## Next Steps

1. **Immediate Actions**
   - Review and approve integration plan
   - Set up development environment
   - Create feature flag configuration

2. **Team Assignments**
   - Backend: Service integration
   - DevOps: Monitoring setup
   - QA: Test plan execution

3. **Communication**
   - Stakeholder updates weekly
   - Team sync daily during rollout
   - User communication if needed

## Appendix

### A. Configuration Example
```json
{
  "routing": {
    "endpoints": {
      "/api/ai/content": {
        "enabled": true,
        "defaultTier": "intermediate",
        "maxCost": 0.05
      },
      "/api/ai/analyze": {
        "enabled": false,
        "defaultTier": "premium",
        "maxCost": 0.20
      }
    }
  }
}
```

### B. Migration Checklist
- [ ] Backup current configuration
- [ ] Deploy tier system code
- [ ] Configure feature flags
- [ ] Set up monitoring
- [ ] Train team on new system
- [ ] Prepare rollback procedures
- [ ] Document API changes
- [ ] Update client libraries

### C. Emergency Contacts
- On-call engineer: [TBD]
- AI service escalation: [TBD]
- Budget approval: [TBD]

This integration plan ensures a smooth, risk-controlled migration to the AI tier system while maintaining service quality and achieving significant cost savings.