/**
 * System Health Dashboard Component
 * Displays overall platform status, SLO compliance, service status grid, and degradation analysis
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Server,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
  Database,
  Cloud,
  CreditCard,
  Boxes,
  FileCode,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'

// Types
interface ServiceStatus {
  service_name: string
  display_name: string
  status: 'operational' | 'degraded' | 'outage' | 'unknown'
  last_check_at: string
  last_healthy_at?: string
  error_message?: string
  metrics?: Record<string, number>
}

interface SLOResult {
  name: string
  description?: string
  target: number
  current: number | null
  operator: string
  compliant: boolean
  window_hours: number
}

interface OverallStatus {
  status: 'operational' | 'degraded' | 'outage'
  message: string
}

interface SystemHealthData {
  overall: OverallStatus
  services: ServiceStatus[]
  slos: SLOResult[]
}

interface DegradationAnalysis {
  service: string
  topContributors: Array<{
    route: string
    errorCount: number
    percentage: number
  }>
  spikeStarted?: string
  sampleError?: string
}

interface SparklinePoint {
  hour: string
  value: number
}

interface SystemHealthDashboardProps {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
}

// Service icon mapping
const serviceIcons: Record<string, React.ReactNode> = {
  api: <Server className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  build_runner: <Boxes className="h-4 w-4" />,
  stripe: <CreditCard className="h-4 w-4" />,
  supabase: <Cloud className="h-4 w-4" />,
  sanity: <FileCode className="h-4 w-4" />,
}

// Status colors and icons
const statusConfig = {
  operational: { color: 'bg-green-500', icon: CheckCircle2, label: 'Operational' },
  degraded: { color: 'bg-yellow-500', icon: AlertTriangle, label: 'Degraded' },
  outage: { color: 'bg-red-500', icon: XCircle, label: 'Outage' },
  unknown: { color: 'bg-gray-500', icon: Clock, label: 'Unknown' },
}

// Simple sparkline component
function Sparkline({ data, height = 40 }: { data: SparklinePoint[]; height?: number }) {
  if (data.length < 2) return null

  const values = data.map((d) => d.value)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = height - ((d.value - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full h-10" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-primary"
      />
    </svg>
  )
}

export function SystemHealthDashboard({
  adminId,
  adminEmail,
  adminRole,
  permissions,
}: SystemHealthDashboardProps) {
  const [healthData, setHealthData] = useState<SystemHealthData | null>(null)
  const [sparklines, setSparklines] = useState<Record<string, SparklinePoint[]>>({})
  const [degradationAnalysis, setDegradationAnalysis] = useState<DegradationAnalysis | null>(null)
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Fetch all system health data in a single call
  const fetchAllHealthData = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/system-health/comprehensive', {
        cache: 'no-store',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch health data')
      }

      const result = await response.json()
      if (result.overall || result.services) {
        setHealthData({
          overall: result.overall,
          services: result.services,
          slos: result.slos,
        })
        if (result.sparklines) {
          setSparklines(result.sparklines)
        }
      }
    } catch (error) {
      console.error('Error fetching health data:', error)
      toast.error('Failed to load system health data')
    }
  }, [])

  // Fetch degradation analysis for a service
  const fetchDegradationAnalysis = useCallback(async (serviceName: string) => {
    try {
      const response = await fetch(`/api/admin/system-health/degradation/${serviceName}`, {
        cache: 'no-store',
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        setDegradationAnalysis(data.data)
      }
    } catch (error) {
      console.error('Error fetching degradation analysis:', error)
    }
  }, [])

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await fetchAllHealthData()
      setIsLoading(false)
      setLastRefresh(new Date())
    }
    loadData()
  }, [fetchAllHealthData])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchAllHealthData()
      setLastRefresh(new Date())
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, fetchAllHealthData])

  // Fetch degradation analysis when service is selected
  useEffect(() => {
    if (selectedService) {
      fetchDegradationAnalysis(selectedService)
    }
  }, [selectedService, fetchDegradationAnalysis])

  const handleRefresh = async () => {
    setIsLoading(true)
    await fetchAllHealthData()
    setIsLoading(false)
    setLastRefresh(new Date())
    toast.success('Data refreshed')
  }

  if (!healthData && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const overallStatusConfig = healthData ? statusConfig[healthData.overall.status] : statusConfig.unknown

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header with refresh controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Last updated: {formatDistanceToNow(lastRefresh, { addSuffix: true })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Auto-refresh</span>
            <Button
              variant={autoRefresh ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? 'On' : 'Off'}
            </Button>
          </div>
        </div>

        {/* Overall Status Banner */}
        {healthData && (
          <Alert
            variant={healthData.overall.status === 'operational' ? 'default' : 'destructive'}
            className={healthData.overall.status === 'operational' ? 'border-green-500 bg-green-50 dark:bg-green-950' : ''}
          >
            <overallStatusConfig.icon className="h-5 w-5" />
            <AlertTitle className="text-lg">{overallStatusConfig.label}</AlertTitle>
            <AlertDescription>{healthData.overall.message}</AlertDescription>
          </Alert>
        )}

        {/* SLO Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {healthData?.slos.map((slo) => (
            <Card key={slo.name} className={!slo.compliant ? 'border-yellow-500' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{slo.name}</CardTitle>
                  {slo.compliant ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {slo.current !== null ? `${slo.current.toFixed(2)}%` : 'N/A'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Target: {slo.operator} {slo.target}% ({slo.window_hours / 24}d window)
                </div>
                <Progress
                  value={slo.current || 0}
                  className={`mt-2 ${slo.compliant ? '' : '[&>div]:bg-yellow-500'}`}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Service Status Grid */}
        <Card>
          <CardHeader>
            <CardTitle>Service Status</CardTitle>
            <CardDescription>Current status of all platform services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {healthData?.services.map((service) => {
                const config = statusConfig[service.status]
                const Icon = config.icon
                const ServiceIcon = serviceIcons[service.service_name] || <Server className="h-4 w-4" />

                return (
                  <div
                    key={service.service_name}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedService === service.service_name
                        ? 'border-primary bg-muted'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() =>
                      setSelectedService(
                        selectedService === service.service_name
                          ? null
                          : service.service_name
                      )
                    }
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {ServiceIcon}
                        <span className="font-medium">{service.display_name}</span>
                      </div>
                      <Badge variant={service.status === 'operational' ? 'default' : 'destructive'}>
                        <Icon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                    </div>
                    {service.metrics && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        {service.metrics.p95 && (
                          <div>p95: {service.metrics.p95.toFixed(0)}ms</div>
                        )}
                        {service.metrics.error_rate !== undefined && (
                          <div>Error rate: {(service.metrics.error_rate * 100).toFixed(2)}%</div>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-2">
                      Last check: {formatDistanceToNow(new Date(service.last_check_at), { addSuffix: true })}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* "Why is it Red?" Panel */}
        {selectedService && degradationAnalysis && (
          <Card className="border-yellow-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                Why is {selectedService} {healthData?.services.find(s => s.service_name === selectedService)?.status}?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {degradationAnalysis.spikeStarted && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Spike started:</span>{' '}
                    {format(new Date(degradationAnalysis.spikeStarted), 'PPpp')}
                  </div>
                )}

                {degradationAnalysis.topContributors.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Top Contributing Routes</h4>
                    <div className="space-y-2">
                      {degradationAnalysis.topContributors.map((contributor, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                            {contributor.route}
                          </code>
                          <div className="flex items-center gap-4">
                            <span>{contributor.errorCount} errors</span>
                            <Badge variant="outline">{contributor.percentage}%</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {degradationAnalysis.topContributors.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No specific contributors identified in the last hour
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 24-Hour Trends */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Request Volume (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <Sparkline data={sparklines.api_requests_total || []} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Build Activity (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <Sparkline data={sparklines.builds_total || []} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Latency (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <Sparkline data={sparklines.api_request_duration_ms || []} />
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  )
}
