# AI Tier System Integration Guide

## Quick Start

### 1. Enable Tier Routing (Development)
```bash
# Set environment variables
export AI_TIER_ROUTING_ENABLED=true
export AI_TIER_CONFIG_PATH=./src/config/ai-tiers.json
export AI_MONITORING_ENABLED=true

# Start development server
npm run dev
```

### 2. Test Basic Integration
```bash
# Test content generation with tier routing
curl -X POST http://localhost:3000/api/ai/content \
  -H "Content-Type: application/json" \
  -d '{
    "type": "copy",
    "section": "hero",
    "tone": "professional",
    "businessContext": {
      "type": "salon",
      "name": "Test Salon"
    }
  }'
```

## Step-by-Step Integration

### Step 1: Create Service Factory
```typescript
// src/services/ai/service-factory.ts
import { OpenAIService } from './openai-service'
import { AnthropicService } from './anthropic-service'
import { MockAIService } from './mock-ai-service'
import { AIService, AIProvider } from './types'

export class AIServiceFactory {
  private static instances: Map<string, AIService> = new Map()

  static create(provider: AIProvider): AIService {
    // Check cache
    if (this.instances.has(provider)) {
      return this.instances.get(provider)!
    }

    // Create new instance
    let service: AIService
    
    switch (provider) {
      case 'openai-gpt4o':
        service = new OpenAIService({ model: 'gpt-4o' })
        break
      case 'openai-gpt4o-mini':
        service = new OpenAIService({ model: 'gpt-4o-mini' })
        break
      case 'openai-gpt3.5':
        service = new OpenAIService({ model: 'gpt-3.5-turbo' })
        break
      case 'claude-opus':
        service = new AnthropicService({ model: 'claude-3-opus' })
        break
      case 'claude-sonnet':
        service = new AnthropicService({ model: 'claude-3-sonnet' })
        break
      case 'claude-haiku':
        service = new AnthropicService({ model: 'claude-3-haiku' })
        break
      case 'mock':
      case 'mock-fast':
        service = new MockAIService()
        break
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }

    // Cache instance
    this.instances.set(provider, service)
    return service
  }

  static reset(): void {
    this.instances.clear()
  }
}
```

### Step 2: Create Unified Service
```typescript
// src/services/ai/unified-ai-service.ts
import { AIRequest, AIResponse } from './types'
import { FallbackOrchestrator } from './fallback-orchestrator'
import { AIServiceFactory } from './service-factory'
import { RealAIService } from './real-ai-service'

export interface UnifiedAIOptions {
  useTierRouting?: boolean
  forceProvider?: string
  maxCost?: number
  timeout?: number
}

export class UnifiedAIService {
  private realAIService: RealAIService

  constructor() {
    this.realAIService = new RealAIService()
  }

  async processRequest(
    request: AIRequest,
    options: UnifiedAIOptions = {}
  ): Promise<AIResponse> {
    // Check if tier routing is enabled
    const tierRoutingEnabled = 
      options.useTierRouting ?? 
      process.env.AI_TIER_ROUTING_ENABLED === 'true'

    if (!tierRoutingEnabled) {
      // Use existing service
      return this.realAIService.processRequest(request)
    }

    // Use tier routing
    const result = await FallbackOrchestrator.executeWithFallback(
      {
        ...request,
        maxCost: options.maxCost,
        timeout: options.timeout
      },
      async (provider, req) => {
        const service = AIServiceFactory.create(provider)
        return service.processRequest(req)
      }
    )

    return result.response!
  }

  // Stream support
  async *processRequestStream(
    request: AIRequest,
    options: UnifiedAIOptions = {}
  ): AsyncGenerator<any> {
    const tierRoutingEnabled = 
      options.useTierRouting ?? 
      process.env.AI_TIER_ROUTING_ENABLED === 'true'

    if (!tierRoutingEnabled) {
      yield* this.realAIService.processRequestStream(request)
      return
    }

    // Tier routing for streams
    const routingDecision = await AITierRouter.routeRequest(request)
    const service = AIServiceFactory.create(routingDecision.selectedProvider)
    yield* service.processRequestStream(request)
  }
}
```

### Step 3: Update API Routes
```typescript
// src/app/api/ai/content/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { UnifiedAIService } from '@/services/ai/unified-ai-service'
import { withMonitoring } from '@/services/ai/monitoring/middleware'

const unifiedAI = new UnifiedAIService()

export const POST = withMonitoring(async (request: NextRequest) => {
  try {
    const body = await request.json()
    
    // Transform to unified request format
    const aiRequest = {
      type: 'content',
      content: body.prompt || '',
      domain: detectDomain(body),
      businessContext: body.businessContext,
      metadata: {
        section: body.section,
        tone: body.tone,
        length: body.length
      }
    }
    
    // Process with tier routing
    const response = await unifiedAI.processRequest(aiRequest, {
      useTierRouting: true,
      maxCost: 0.05 // Default max cost for content
    })
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('Content generation error:', error)
    return NextResponse.json(
      { error: 'Generation failed' },
      { status: 500 }
    )
  }
})

// Helper to detect domain from request
function detectDomain(body: any): string {
  const businessType = body.businessContext?.type
  const content = body.prompt || ''
  
  // Domain detection logic
  if (businessType === 'finance' || content.includes('financial')) {
    return 'finance'
  }
  if (businessType === 'healthcare' || content.includes('medical')) {
    return 'healthcare'
  }
  if (body.section === 'marketing' || body.tone === 'promotional') {
    return 'marketing'
  }
  
  return 'general'
}
```

### Step 4: Add Monitoring Middleware
```typescript
// src/services/ai/monitoring/middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { MetricsCollector } from './metrics-collector'

export function withMonitoring(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    const metrics = new MetricsCollector({
      endpoint: request.url,
      method: request.method
    })
    
    metrics.start()
    
    try {
      const response = await handler(request)
      
      // Extract metrics from response headers
      const tier = response.headers.get('X-AI-Tier')
      const provider = response.headers.get('X-AI-Provider')
      const cost = response.headers.get('X-AI-Cost')
      
      metrics.recordSuccess({
        tier,
        provider,
        cost: parseFloat(cost || '0')
      })
      
      return response
      
    } catch (error) {
      metrics.recordError(error)
      throw error
      
    } finally {
      await metrics.submit()
    }
  }
}
```

## Rollback Procedures

### Emergency Rollback (< 5 minutes)

#### 1. Disable Tier Routing Globally
```bash
# Set environment variable
export AI_TIER_ROUTING_ENABLED=false

# Restart application
npm run restart

# Or use feature flag service
curl -X POST https://api.features.com/flags/ai-tier-routing/disable \
  -H "Authorization: Bearer $API_KEY"
```

#### 2. Revert to Direct Service Calls
```typescript
// Quick fix in unified-ai-service.ts
export class UnifiedAIService {
  async processRequest(request: AIRequest): Promise<AIResponse> {
    // EMERGENCY: Force disable tier routing
    return this.realAIService.processRequest(request)
  }
}
```

### Gradual Rollback (< 30 minutes)

#### 1. Disable Specific Endpoints
```typescript
// config/rollback.json
{
  "disabledEndpoints": [
    "/api/ai/analyze",
    "/api/ai/components"
  ],
  "reason": "High error rate detected",
  "timestamp": "2024-12-21T10:00:00Z"
}
```

#### 2. Route Specific Tiers to Fallback
```bash
# Update tier configuration
curl -X PATCH https://api.config.com/ai-tiers \
  -d '{
    "tiers": {
      "premium": {
        "enabled": false,
        "fallbackTier": "mock"
      }
    }
  }'
```

### Full Rollback (< 1 hour)

#### 1. Revert Code Changes
```bash
# Create rollback branch
git checkout -b rollback/ai-tier-system

# Revert tier system commits
git revert abc123..def456

# Deploy rollback
npm run build
npm run deploy
```

#### 2. Restore Database State
```sql
-- Disable tier tracking
UPDATE feature_flags 
SET enabled = false 
WHERE flag_name = 'ai_tier_routing';

-- Clear tier metrics
TRUNCATE TABLE ai_tier_metrics;

-- Restore service configuration
UPDATE ai_services 
SET tier = null, 
    tier_config = null;
```

## Monitoring During Rollout

### Key Metrics to Watch

#### 1. Error Rates
```bash
# Check error rates by endpoint
curl https://metrics.api/ai/errors?period=5m

# Alert threshold: > 5% error rate
```

#### 2. Response Times
```bash
# Monitor P95 latency
curl https://metrics.api/ai/latency?percentile=95

# Alert threshold: > 3 seconds
```

#### 3. Cost Tracking
```bash
# Real-time cost monitoring
curl https://metrics.api/ai/costs?real-time=true

# Alert threshold: > 20% increase
```

### Health Checks

#### Service Health
```typescript
// GET /api/ai/health
{
  "status": "healthy",
  "tierRouting": {
    "enabled": true,
    "activeProviders": ["openai-gpt4o", "claude-haiku"],
    "failedProviders": [],
    "lastConfigUpdate": "2024-12-21T10:00:00Z"
  },
  "monitoring": {
    "metricsCollected": 15234,
    "lastSubmission": "2024-12-21T10:05:00Z"
  }
}
```

#### Provider Health
```typescript
// GET /api/ai/providers/health
{
  "providers": {
    "openai-gpt4o": {
      "status": "healthy",
      "latency": 850,
      "errorRate": 0.001,
      "lastCheck": "2024-12-21T10:05:00Z"
    },
    "claude-opus": {
      "status": "degraded",
      "latency": 2500,
      "errorRate": 0.05,
      "lastCheck": "2024-12-21T10:05:00Z"
    }
  }
}
```

## Troubleshooting

### Common Issues

#### 1. "Provider Not Found" Error
```typescript
// Check provider registration
console.log('Available providers:', AI_SERVICES.getAllProviders())

// Fix: Update service-registry.ts
AI_SERVICES.registerProvider('missing-provider', {
  // ... provider config
})
```

#### 2. Budget Exceeded Alerts
```typescript
// Check current usage
const usage = await UsageTracker.getCurrentMonthUsage()
console.log('Current spend:', usage.totalCost)
console.log('Budget remaining:', usage.budgetRemaining)

// Temporary fix: Increase budget
await AITierConfigManager.updateConfig({
  tiers: {
    [tier]: {
      maxMonthlyBudget: newBudget
    }
  }
})
```

#### 3. High Fallback Rate
```typescript
// Check fallback analytics
const stats = await FallbackOrchestrator.getStatistics()
console.log('Fallback rate:', stats.fallbackRate)
console.log('Primary success rate:', stats.primarySuccessRate)

// Fix: Adjust provider health thresholds
```

## Best Practices

### 1. Gradual Rollout
- Start with 10% traffic
- Monitor for 24 hours
- Increase to 50%, then 100%

### 2. Feature Flags
```typescript
const ROLLOUT_PERCENTAGE = {
  content: 100,    // Fully rolled out
  analyze: 50,     // 50% of traffic
  components: 10   // Testing phase
}
```

### 3. Canary Deployments
- Deploy to staging first
- Test with synthetic traffic
- Monitor key metrics
- Deploy to production

### 4. Communication
- Notify team before rollout
- Document any issues
- Update status page
- Post-mortem if needed

## Support

### Escalation Path
1. **On-call Engineer**: Check runbook
2. **AI Team Lead**: Architecture decisions
3. **Platform Team**: Infrastructure issues
4. **Vendor Support**: Provider-specific issues

### Resources
- [Tier System Documentation](./AI_TIER_SYSTEM_SUMMARY.md)
- [Monitoring Dashboard](https://dashboard.company.com/ai)
- [Runbook](https://wiki.company.com/ai-tier-runbook)
- [Vendor Status Pages](https://status.openai.com)

This guide ensures smooth integration of the AI tier system with comprehensive rollback procedures and monitoring capabilities.