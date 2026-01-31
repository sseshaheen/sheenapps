/**
 * Observability Links Component
 *
 * Displays links to external observability tools (PostHog, Grafana, Logs)
 * with context-aware pre-filled filters.
 *
 * Can be used standalone or embedded in other admin views.
 */

'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ExternalLink, BarChart2, Activity, FileText, AlertCircle } from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface ObservabilityLink {
  url: string
  label: string
  tool: 'posthog' | 'grafana' | 'logs'
}

interface ObservabilityLinks {
  posthog?: ObservabilityLink
  grafana?: ObservabilityLink[]
  logs?: ObservabilityLink
}

interface ObservabilityLinksProps {
  projectId?: string
  correlationId?: string
  service?: string
  timeRange?: string
  compact?: boolean
  title?: string
}

// =============================================================================
// ICON MAPPING
// =============================================================================

const TOOL_ICONS: Record<string, ReactNode> = {
  posthog: <BarChart2 className="h-4 w-4" />,
  grafana: <Activity className="h-4 w-4" />,
  logs: <FileText className="h-4 w-4" />,
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ObservabilityLinks({
  projectId,
  correlationId,
  service,
  timeRange,
  compact = false,
  title = 'Deep Dive',
}: ObservabilityLinksProps) {
  const [links, setLinks] = useState<ObservabilityLinks | null>(null)
  const [configured, setConfigured] = useState<boolean>(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLinks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (projectId) params.set('projectId', projectId)
      if (correlationId) params.set('correlationId', correlationId)
      if (service) params.set('service', service)
      if (timeRange) params.set('timeRange', timeRange)

      const response = await fetch(`/api/admin/inhouse/observability/links?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch observability links')
      }
      const result = await response.json()
      setLinks(result.links || null)
      setConfigured(result.configured || false)
    } catch (err) {
      console.error('Failed to fetch observability links:', err)
      setError(err instanceof Error ? err.message : 'Failed to load links')
    } finally {
      setLoading(false)
    }
  }, [projectId, correlationId, service, timeRange])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  // Don't render if no tools are configured
  if (!loading && !configured) {
    return null
  }

  // Compact mode: just buttons
  if (compact) {
    if (loading) {
      return <div className="text-sm text-muted-foreground">Loading...</div>
    }

    if (error || !links) {
      return null
    }

    const allLinks: ObservabilityLink[] = [
      ...(links.posthog ? [links.posthog] : []),
      ...(links.grafana || []),
      ...(links.logs ? [links.logs] : []),
    ]

    if (allLinks.length === 0) return null

    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap gap-2">
          {allLinks.map((link, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    {TOOL_ICONS[link.tool]}
                    <span className="ml-1.5">{link.label}</span>
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Open in {link.tool}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    )
  }

  // Full card mode
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          External observability tools with pre-filled context
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading links...</div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : !links || Object.keys(links).length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No observability tools configured
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="space-y-3">
              {/* PostHog */}
              {links.posthog && (
                <div>
                  <Button variant="outline" asChild className="w-full justify-start">
                    <a href={links.posthog.url} target="_blank" rel="noopener noreferrer">
                      <BarChart2 className="h-4 w-4 mr-2" />
                      {links.posthog.label}
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </a>
                  </Button>
                </div>
              )}

              {/* Grafana Dashboards */}
              {links.grafana && links.grafana.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Grafana Dashboards</div>
                  <div className="flex flex-wrap gap-2">
                    {links.grafana.map((link, index) => (
                      <Button key={index} variant="outline" size="sm" asChild>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          <Activity className="h-4 w-4 mr-1.5" />
                          {link.label.replace('Grafana: ', '')}
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Logs */}
              {links.logs && (
                <div>
                  <Button variant="outline" asChild className="w-full justify-start">
                    <a href={links.logs.url} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-4 w-4 mr-2" />
                      {links.logs.label}
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Simple inline version for embedding in error views
 */
export function ObservabilityInlineLinks({
  projectId,
  correlationId,
  service,
}: Pick<ObservabilityLinksProps, 'projectId' | 'correlationId' | 'service'>) {
  return (
    <ObservabilityLinks
      projectId={projectId}
      correlationId={correlationId}
      service={service}
      compact
    />
  )
}
