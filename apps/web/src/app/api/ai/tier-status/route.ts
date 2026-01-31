import { NextRequest, NextResponse } from 'next/server'
import AITierConfigManager from '../../../../services/ai/tier-config'
import { ServiceSelector, UsageTracker } from '../../../../services/ai/service-registry'
import AITierRouter from '../../../../services/ai/tier-router'
import { FallbackOrchestrator } from '../../../../services/ai/fallback-orchestrator'
import { logger } from '@/utils/logger';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const action = url.searchParams.get('action') || 'status'

    // Initialize systems if needed
    await AITierConfigManager.initialize()
    await AITierRouter.initialize()

    switch (action) {
      case 'status':
        return NextResponse.json({
          success: true,
          data: {
            systemStatus: 'operational',
            environment: process.env.NODE_ENV || 'development',
            config: {
              version: AITierConfigManager.getConfig().version,
              environment: AITierConfigManager.getConfig().environment,
              enabledTiers: AITierConfigManager.getEnabledTiers(),
              defaultTier: AITierConfigManager.getRoutingConfig().defaultTier
            },
            features: AITierConfigManager.getFeatureConfig(),
            monitoring: AITierConfigManager.getMonitoringConfig(),
            providers: {
              available: Object.keys(ServiceSelector.getAvailableServices()),
              byTier: ServiceSelector.getServicesByTier()
            },
            usage: {
              totalRequests: UsageTracker.getTotalRequests(),
              totalCost: UsageTracker.getTotalCost(),
              budgetUtilization: UsageTracker.getBudgetUtilization(),
              requestsToday: UsageTracker.getRequestsInTimeframe(
                new Date(new Date().setHours(0, 0, 0, 0)),
                new Date()
              )
            }
          },
          timestamp: new Date().toISOString()
        })

      case 'health':
        return NextResponse.json({
          success: true,
          data: {
            status: 'healthy',
            checks: {
              configLoaded: !!AITierConfigManager.getConfig(),
              routerInitialized: true,
              serviceRegistry: ServiceSelector.getAvailableServices() !== null,
              usageTracker: true,
              fallbackOrchestrator: true
            }
          },
          timestamp: new Date().toISOString()
        })

      case 'config':
        return NextResponse.json({
          success: true,
          data: {
            config: AITierConfigManager.getConfig(),
            tiers: Object.fromEntries(
              AITierConfigManager.getEnabledTiers().map(tier => [
                tier,
                AITierConfigManager.getTierConfig(tier)
              ])
            )
          },
          timestamp: new Date().toISOString()
        })

      case 'metrics':
        return NextResponse.json({
          success: true,
          data: {
            usage: {
              totalRequests: UsageTracker.getTotalRequests(),
              totalCost: UsageTracker.getTotalCost(),
              averageCostPerRequest: UsageTracker.getAverageCostPerRequest(),
              budgetUtilization: UsageTracker.getBudgetUtilization(),
              requestsByTier: UsageTracker.getRequestsByTier(),
              costByTier: UsageTracker.getCostByTier(),
              recentRequests: UsageTracker.getRecentRequests(10)
            },
            performance: {
              averageResponseTime: UsageTracker.getAverageResponseTime(),
              successRate: UsageTracker.getSuccessRate(),
              fallbackRate: FallbackOrchestrator.getFallbackRate()
            }
          },
          timestamp: new Date().toISOString()
        })

      case 'test':
        // Test the tier routing system
        const testRequest = {
          type: 'test',
          content: 'Test request to verify tier routing',
          domain: 'test'
        }
        
        const routingDecision = await AITierRouter.routeRequest(testRequest)
        
        return NextResponse.json({
          success: true,
          data: {
            testRequest,
            routingDecision,
            analysis: {
              complexity: AITierRouter.assessRequestComplexity(testRequest.content),
              domain: AITierRouter.classifyRequestDomain(testRequest.content),
              risk: AITierRouter.assessRequestRisk(testRequest.content)
            }
          },
          timestamp: new Date().toISOString()
        })

      default:
        return NextResponse.json({
          success: false,
          error: {
            code: 'INVALID_ACTION',
            message: `Unknown action: ${action}. Available actions: status, health, config, metrics, test`
          }
        }, { status: 400 })
    }

  } catch (error) {
    logger.error('❌ Tier status API error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    await AITierConfigManager.initialize()

    switch (action) {
      case 'update_tier':
        const { tier, updates } = body
        if (!tier || !updates) {
          return NextResponse.json({
            success: false,
            error: { code: 'MISSING_PARAMS', message: 'tier and updates are required' }
          }, { status: 400 })
        }

        AITierConfigManager.updateTierConfig(tier, updates)
        
        return NextResponse.json({
          success: true,
          data: {
            message: `Tier ${tier} updated successfully`,
            updatedConfig: AITierConfigManager.getTierConfig(tier)
          }
        })

      case 'enable_tier':
        const { tier: enableTier } = body
        if (!enableTier) {
          return NextResponse.json({
            success: false,
            error: { code: 'MISSING_PARAMS', message: 'tier is required' }
          }, { status: 400 })
        }

        AITierConfigManager.enableTier(enableTier)
        
        return NextResponse.json({
          success: true,
          data: { message: `Tier ${enableTier} enabled successfully` }
        })

      case 'disable_tier':
        const { tier: disableTier } = body
        if (!disableTier) {
          return NextResponse.json({
            success: false,
            error: { code: 'MISSING_PARAMS', message: 'tier is required' }
          }, { status: 400 })
        }

        AITierConfigManager.disableTier(disableTier)
        
        return NextResponse.json({
          success: true,
          data: { message: `Tier ${disableTier} disabled successfully` }
        })

      case 'add_routing_rule':
        const { domain, tier: ruleTier } = body
        if (!domain || !ruleTier) {
          return NextResponse.json({
            success: false,
            error: { code: 'MISSING_PARAMS', message: 'domain and tier are required' }
          }, { status: 400 })
        }

        AITierConfigManager.updateRoutingRule(domain, ruleTier)
        
        return NextResponse.json({
          success: true,
          data: { message: `Routing rule added: ${domain} -> ${ruleTier}` }
        })

      case 'clear_metrics':
        UsageTracker.clear()
        return NextResponse.json({
          success: true,
          data: { message: 'Usage metrics cleared successfully' }
        })

      default:
        return NextResponse.json({
          success: false,
          error: {
            code: 'INVALID_ACTION',
            message: `Unknown action: ${action}. Available actions: update_tier, enable_tier, disable_tier, add_routing_rule, clear_metrics`
          }
        }, { status: 400 })
    }

  } catch (error) {
    logger.error('❌ Tier status POST error:', error);
    
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }
    }, { status: 500 })
  }
}