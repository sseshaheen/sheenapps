/**
 * Integration Command Center
 *
 * Enhanced project settings with unified integration management.
 * Phase 3 implementation: Overview | Setup | Health | Analytics tabs
 *
 * Features:
 * - Tabbed navigation for different integration views
 * - Real-time status monitoring with health metrics
 * - Batch operations and connection management
 * - Usage analytics and integration dependency mapping
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useFeatureFlags } from '@/config/feature-flags'
import {
  useIntegrationStatus,
  useIntegrationActions,
  useIntegrationStatusSSE
} from '@/hooks/use-integration-status'
import { useAuthStore } from '@/store'
import { useRouter } from '@/i18n/routing'
import { useParams } from 'next/navigation'
import { useInboxConfig } from '@/hooks/use-inbox-config'
import { useEmailDomains } from '@/hooks/use-email-domains'
import type { IntegrationKey, IntegrationStatusItem } from '@/types/integrationStatus'

// Legacy integration components
import { ConnectSupabase } from '@/components/integrations/connect-supabase'
import { ConnectVercel } from '@/components/integrations/connect-vercel'
import { ConnectSanity } from '@/components/integrations/connect-sanity'

interface IntegrationCommandCenterProps {
  projectId: string
  projectName: string
  className?: string
}

// Integration configuration for command center
const INTEGRATION_CONFIG = {
  supabase: {
    name: 'Supabase',
    description: 'PostgreSQL database with real-time features',
    icon: 'database',
    color: 'bg-green-500',
    category: 'Database'
  },
  github: {
    name: 'GitHub',
    description: 'Version control and collaborative development',
    icon: 'git-branch',
    color: 'bg-gray-500',
    category: 'Development'
  },
  vercel: {
    name: 'Vercel',
    description: 'Serverless deployment platform',
    icon: 'zap',
    color: 'bg-blue-500',
    category: 'Deployment'
  },
  sanity: {
    name: 'Sanity',
    description: 'Headless CMS for structured content',
    icon: 'file-text',
    color: 'bg-orange-500',
    category: 'Content'
  }
} as const

function IntegrationCard({
  integration,
  config,
  onAction,
  isExecuting
}: {
  integration: IntegrationStatusItem
  config: typeof INTEGRATION_CONFIG[IntegrationKey]
  onAction: (action: string) => void
  isExecuting: boolean
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-500'
      case 'warning': return 'bg-amber-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected': return 'Connected'
      case 'warning': return 'Warning'
      case 'error': return 'Error'
      case 'disconnected': return 'Not Connected'
      default: return 'Unknown'
    }
  }

  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', config.color)}>
              <Icon name={config.icon as any} className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{config.name}</CardTitle>
              <CardDescription className="text-sm">{config.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn('w-2 h-2 rounded-full', getStatusColor(integration.status))} />
            <Badge variant={integration.status === 'connected' ? 'default' : 'secondary'}>
              {getStatusText(integration.status)}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Summary */}
        {integration.summary && (
          <div className="text-sm text-muted-foreground">
            {integration.summary}
          </div>
        )}

        {/* Problem Details */}
        {integration.problem && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
            <Icon name="alert-circle" className="w-4 h-4 text-red-500" />
            <div className="text-sm">
              <div className="font-medium text-red-700 dark:text-red-400">
                {integration.problem.hint || 'Issue detected'}
              </div>
              <div className="text-red-600 dark:text-red-500 text-xs mt-1">
                Code: {integration.problem.code}
              </div>
            </div>
          </div>
        )}

        {/* Vercel Environments */}
        {integration.key === 'vercel' && integration.environments && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Environments</div>
            {integration.environments.map((env) => (
              <div key={env.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={cn('w-1.5 h-1.5 rounded-full', getStatusColor(env.status))} />
                  <span className="capitalize">{env.name}</span>
                </div>
                <div className="text-muted-foreground">
                  {env.url ? (
                    <a href={env.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {env.summary || 'Live'}
                    </a>
                  ) : (
                    env.summary || 'Not deployed'
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Available Actions */}
        {integration.actions && integration.actions.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Quick Actions</div>
            <div className="flex flex-wrap gap-2">
              {integration.actions.map((action) => (
                <Button
                  key={action.id}
                  variant="outline"
                  size="sm"
                  disabled={!action.can || isExecuting}
                  onClick={() => onAction(action.id)}
                  className="text-xs"
                >
                  {isExecuting ? (
                    <Icon name="loader-2" className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Icon name={getActionIcon(action.id)} className="w-3 h-3 mr-1" />
                  )}
                  {action.label}
                </Button>
              ))}
            </div>
            {integration.actions.some(action => !action.can) && (
              <div className="text-xs text-muted-foreground">
                Some actions unavailable: {integration.actions
                  .filter(action => !action.can)
                  .map(action => action.reason)
                  .filter(Boolean)
                  .join(', ')}
              </div>
            )}
          </div>
        )}

        {/* Last Updated */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Last updated: {new Date(integration.updatedAt).toLocaleString()}
          {integration.stale && (
            <span className="text-amber-500 ml-2">(May be outdated)</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function getActionIcon(actionId: string): any {
  switch (actionId) {
    case 'connect': return 'link'
    case 'deploy': return 'rocket'
    case 'push': return 'upload'
    case 'pull': return 'download'
    case 'sync': return 'refresh-cw'
    case 'open-studio': return 'external-link'
    case 'test-connection': return 'activity'
    case 'reconnect': return 'link-2'
    default: return 'play'
  }
}

function OverviewTab({
  projectId,
  statusData,
  onAction,
  isExecuting
}: {
  projectId: string
  statusData: any
  onAction: (key: IntegrationKey, action: string) => void
  isExecuting: boolean
}) {
  if (!statusData) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-lg" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-3/4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const integrationOrder: IntegrationKey[] = ['supabase', 'github', 'vercel', 'sanity']
  const integrationMap = new Map(statusData.items.map((item: any) => [item.key, item]))

  return (
    <div className="space-y-6">
      {/* Overall Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="activity" className="w-5 h-5" />
            Integration Health Overview
          </CardTitle>
          <CardDescription>
            Real-time status of all project integrations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-3 h-3 rounded-full',
                statusData.overall === 'connected' ? 'bg-green-500' :
                statusData.overall === 'warning' ? 'bg-amber-500' :
                statusData.overall === 'error' ? 'bg-red-500' : 'bg-gray-400'
              )} />
              <span className="font-medium capitalize">{statusData.overall}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {statusData.items.filter((item: any) => item.status === 'connected').length} of {statusData.items.length} integrations active
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integration Cards */}
      <div className="space-y-4">
        {integrationOrder.map(key => {
          const integration = integrationMap.get(key)
          const config = INTEGRATION_CONFIG[key]

          // Show disconnected state if not in response
          if (!integration) {
            return (
              <IntegrationCard
                key={key}
                integration={{
                  key,
                  configured: false,
                  visible: true,
                  status: 'disconnected',
                  updatedAt: new Date().toISOString()
                }}
                config={config}
                onAction={(action) => onAction(key, action)}
                isExecuting={isExecuting}
              />
            )
          }

          // Ensure integration has all required fields
          const integrationData = integration as Partial<IntegrationStatusItem>
          const fullIntegration: IntegrationStatusItem = {
            key: integrationData.key || key,
            configured: integrationData.configured || false,
            visible: integrationData.visible !== false,
            status: integrationData.status || 'disconnected',
            updatedAt: integrationData.updatedAt || new Date().toISOString()
          }

          return (
            <IntegrationCard
              key={key}
              integration={fullIntegration}
              config={config}
              onAction={(action) => onAction(key, action)}
              isExecuting={isExecuting}
            />
          )
        })}
      </div>

      {/* Email Section */}
      <EmailIntegrationCard projectId={projectId} />
    </div>
  )
}

function EmailIntegrationCard({ projectId }: { projectId: string }) {
  const router = useRouter()
  const params = useParams()
  const { data: config } = useInboxConfig(projectId)
  const { data: domainsData } = useEmailDomains(projectId)

  const inboxAddress = config?.inboxAddress
  const domainCount = domainsData?.domains?.length ?? 0
  const verifiedCount = domainsData?.domains?.filter(d => d.sendingReady)?.length ?? 0

  const hasActivity = !!inboxAddress
  const statusColor = !hasActivity ? 'bg-gray-400' : verifiedCount > 0 ? 'bg-green-500' : domainCount > 0 ? 'bg-amber-500' : 'bg-blue-500'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', 'bg-violet-500')}>
            <Icon name="mail" className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Email</CardTitle>
              <div className={cn('w-2.5 h-2.5 rounded-full', statusColor)} />
            </div>
            <CardDescription>
              {inboxAddress
                ? `${inboxAddress}${domainCount > 0 ? ` · ${domainCount} domain${domainCount !== 1 ? 's' : ''}` : ''}`
                : 'Inbox, custom domains & mailboxes'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          {verifiedCount > 0 && (
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              {verifiedCount} sending ready
            </Badge>
          )}
          {domainCount > 0 && verifiedCount < domainCount && (
            <Badge variant="outline">
              {domainCount - verifiedCount} pending
            </Badge>
          )}
        </div>
        <div className="mt-3">
          <Button
            variant="outline" size="sm"
            onClick={() => router.push(`/project/${projectId}/email`)}
          >
            <Icon name="mail" className="w-4 h-4 mr-1.5" />
            Manage Email
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LegacySetupTab({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground mb-4">
        Individual integration setup (legacy interface)
      </div>

      {/* Sanity CMS Integration Section */}
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Icon name="file-text" className="w-5 h-5" />
          Content Management
        </h3>
        <ConnectSanity projectId={projectId} />
      </div>

      <Separator />

      {/* Supabase Integration Section */}
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Icon name="database" className="w-5 h-5" />
          Database Integration
        </h3>
        <ConnectSupabase projectId={projectId} />
      </div>

      <Separator />

      {/* Vercel Integration Section */}
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Icon name="zap" className="w-5 h-5" />
          Deployment Integration
        </h3>
        <ConnectVercel projectId={projectId} />
      </div>
    </div>
  )
}

function HealthTab({ projectId }: { projectId: string }) {
  const { user } = useAuthStore()
  const { events, connectionState } = useIntegrationStatusSSE(
    projectId,
    user?.id || '',
    true
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="heart" className="w-5 h-5" />
            Real-time Monitoring
          </CardTitle>
          <CardDescription>
            Live integration events and health metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <div className={cn(
              'w-2 h-2 rounded-full',
              connectionState === 'connected' ? 'bg-green-500' :
              connectionState === 'connecting' ? 'bg-amber-500' : 'bg-red-500'
            )} />
            <span className="text-sm font-medium">
              Event Stream: {connectionState}
            </span>
          </div>

          {events.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {events.slice(-10).map((event, index) => (
                <div key={index} className="flex items-start gap-3 p-2 bg-muted/50 rounded-lg text-sm">
                  <Icon name="activity" className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">{event.type}</div>
                    <div className="text-muted-foreground">
                      {event.provider && `${event.provider} • `}
                      {new Date(event.ts).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <Icon name="clock" className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <div>No recent events</div>
              <div className="text-xs mt-1">Events will appear here as integrations are used</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coming Soon: Advanced Health Metrics */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Icon name="trending-up" className="w-5 h-5" />
            Advanced Health Metrics
            <Badge variant="secondary">Coming Soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-2">
            <div>• Response time monitoring</div>
            <div>• Error rate tracking</div>
            <div>• Usage analytics</div>
            <div>• Performance insights</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AnalyticsTab({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-6">
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Icon name="bar-chart-3" className="w-5 h-5" />
            Usage Analytics
            <Badge variant="secondary">Coming Soon</Badge>
          </CardTitle>
          <CardDescription>
            Integration usage patterns and insights
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-2">
            <div>• Integration usage frequency</div>
            <div>• Action execution trends</div>
            <div>• Performance metrics</div>
            <div>• Cost optimization insights</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function IntegrationCommandCenter({
  projectId,
  projectName,
  className
}: IntegrationCommandCenterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const { user } = useAuthStore()
  const featureFlags = useFeatureFlags()

  const { data: statusData, isLoading } = useIntegrationStatus(
    projectId,
    user?.id || '',
  )

  const { executeAction, isExecuting } = useIntegrationActions(
    projectId,
    user?.id || ''
  )

  const handleAction = (key: IntegrationKey, action: string) => {
    executeAction(key, action)
  }

  // Use enhanced version if feature flag enabled, otherwise legacy
  const showEnhanced = featureFlags.ENABLE_INTEGRATION_STATUS_BAR

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className={className}>
          <Icon name="settings" className="h-4 w-4" />
          <span className="sr-only">Integration Settings</span>
        </Button>
      </SheetTrigger>

      <SheetContent className="w-[500px] sm:w-[600px] max-w-[90vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Icon name="grid-3x3" className="h-5 w-5" />
            {showEnhanced ? 'Integration Command Center' : 'Project Settings'}
          </SheetTitle>
          <SheetDescription>
            {showEnhanced
              ? `Manage all integrations for ${projectName}`
              : `Configure integrations and settings for ${projectName}`
            }
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {showEnhanced ? (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="setup">Setup</TabsTrigger>
                <TabsTrigger value="health">Health</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </TabsList>

              <div className="mt-6">
                <TabsContent value="overview">
                  <OverviewTab
                    projectId={projectId}
                    statusData={statusData}
                    onAction={handleAction}
                    isExecuting={isExecuting}
                  />
                </TabsContent>

                <TabsContent value="setup">
                  <LegacySetupTab projectId={projectId} />
                </TabsContent>

                <TabsContent value="health">
                  <HealthTab projectId={projectId} />
                </TabsContent>

                <TabsContent value="analytics">
                  <AnalyticsTab projectId={projectId} />
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <LegacySetupTab projectId={projectId} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}