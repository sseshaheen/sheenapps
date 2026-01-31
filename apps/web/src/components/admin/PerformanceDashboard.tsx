'use client'

/**
 * Performance Dashboard Component
 *
 * Displays Core Web Vitals metrics from real user monitoring (RUM) data.
 * Uses data from web_vitals_hourly aggregates for fast rendering.
 *
 * See: docs/PERFORMANCE_ANALYSIS.md - Section 12
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Activity,
  AlertCircle,
  Clock,
  Gauge,
  LineChart,
  MousePointer2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Props {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
}

interface MetricData {
  p50: number
  p75: number
  p95: number
  samples: number
  rating: 'good' | 'needs-improvement' | 'poor'
  goodPercent: number
  needsImprovementPercent: number
  poorPercent: number
}

interface TrendPoint {
  hour: string
  p75: number
}

interface RouteData {
  route: string
  samples: number
  inp: number | null
  lcp: number | null
  cls: number | null
}

interface WebVitalsResponse {
  metrics: Record<string, MetricData>
  trends: Record<string, TrendPoint[]>
  topRoutes: RouteData[]
  timeRange: string
  thresholds: Record<string, { good: number; poor: number }>
  totalSamples: number
  _notice?: string // Configuration notice (e.g., missing env vars)
}

const METRIC_INFO: Record<string, { name: string; unit: string; description: string; icon: React.ReactNode }> = {
  INP: {
    name: 'Interaction to Next Paint',
    unit: 'ms',
    description: 'Measures responsiveness to user input',
    icon: <MousePointer2 className="h-4 w-4" />,
  },
  LCP: {
    name: 'Largest Contentful Paint',
    unit: 'ms',
    description: 'Time until main content is visible',
    icon: <Gauge className="h-4 w-4" />,
  },
  CLS: {
    name: 'Cumulative Layout Shift',
    unit: '',
    description: 'Visual stability score',
    icon: <Activity className="h-4 w-4" />,
  },
  TTFB: {
    name: 'Time to First Byte',
    unit: 'ms',
    description: 'Server response time',
    icon: <Clock className="h-4 w-4" />,
  },
  FCP: {
    name: 'First Contentful Paint',
    unit: 'ms',
    description: 'Time until first content appears',
    icon: <Zap className="h-4 w-4" />,
  },
}

export function PerformanceDashboard({ adminId, adminEmail, adminRole, permissions }: Props) {
  const [data, setData] = useState<WebVitalsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState('24h')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // FIX: Memoize fetchMetrics with useCallback to avoid recreation on every render
  // FIX: Don't set loading=true on refresh to avoid "blink" (keep showing stale data during refresh)
  const fetchMetrics = useCallback(async (isRefresh = false) => {
    try {
      // Only show loading skeleton on initial load, not refresh
      if (!isRefresh) {
        setLoading(true)
      }
      setError(null)

      const res = await fetch(`/api/admin/performance/web-vitals?range=${timeRange}`, {
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        throw new Error('Failed to fetch performance metrics')
      }

      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [timeRange])

  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchMetrics(true) // Pass true to indicate refresh (don't show loading skeleton)
  }

  const formatValue = (value: number, metric: string) => {
    if (metric === 'CLS') {
      return value.toFixed(3)
    }
    return Math.round(value).toLocaleString()
  }

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'good':
        return 'text-green-600'
      case 'needs-improvement':
        return 'text-yellow-600'
      case 'poor':
        return 'text-red-600'
      default:
        return 'text-muted-foreground'
    }
  }

  const getRatingBadge = (rating: string) => {
    switch (rating) {
      case 'good':
        return <Badge className="bg-green-100 text-green-800">Good</Badge>
      case 'needs-improvement':
        return <Badge className="bg-yellow-100 text-yellow-800">Needs Work</Badge>
      case 'poor':
        return <Badge className="bg-red-100 text-red-800">Poor</Badge>
      default:
        return <Badge variant="outline">No Data</Badge>
    }
  }

  if (loading && !isRefreshing) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading performance metrics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={handleRefresh}>Retry</Button>
      </div>
    )
  }

  const hasData = data && data.totalSamples > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Core Web Vitals</h3>
          <p className="text-sm text-muted-foreground">
            Real user performance data ({data?.totalSamples.toLocaleString() || 0} samples)
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Configuration notice (e.g., missing service role key) */}
      {data?._notice && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            {data._notice}
          </AlertDescription>
        </Alert>
      )}

      {!hasData ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {data?._notice
              ? 'Configure the service role key to see real performance data.'
              : 'No performance data available for the selected time range. Web Vitals are collected from real user sessions at a 10% sample rate. Check back later once more users visit your site.'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {['INP', 'LCP', 'CLS', 'TTFB', 'FCP'].map((metric) => {
              const metricData = data.metrics[metric]
              const info = METRIC_INFO[metric]

              return (
                <Card key={metric}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {info.icon}
                        {metric}
                      </span>
                      {getRatingBadge(metricData.rating)}
                    </CardTitle>
                    <CardDescription className="text-xs">{info.name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${getRatingColor(metricData.rating)}`}>
                      {formatValue(metricData.p75, metric)}
                      <span className="text-sm font-normal text-muted-foreground ml-1">
                        {info.unit}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      p75 ({metricData.samples.toLocaleString()} samples)
                    </p>
                    {/* Mini trend indicator */}
                    <div className="mt-2 flex items-center gap-2">
                      <Progress
                        value={metricData.goodPercent}
                        className="h-1.5 flex-1"
                      />
                      <span className="text-xs text-muted-foreground">
                        {metricData.goodPercent}% good
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="routes">By Route</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Performance Score */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Performance Score</CardTitle>
                    <CardDescription>
                      Based on Core Web Vitals passing rates
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const metrics = data.metrics
                      const scores = ['INP', 'LCP', 'CLS'].map(
                        (m) => (metrics[m]?.goodPercent || 0) / 100
                      )
                      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
                      const scorePercent = Math.round(avgScore * 100)

                      return (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-4xl font-bold">{scorePercent}</span>
                            <Badge
                              variant={
                                scorePercent >= 90
                                  ? 'default'
                                  : scorePercent >= 50
                                    ? 'secondary'
                                    : 'destructive'
                              }
                            >
                              {scorePercent >= 90
                                ? 'Excellent'
                                : scorePercent >= 50
                                  ? 'Fair'
                                  : 'Needs Work'}
                            </Badge>
                          </div>
                          <Progress value={scorePercent} className="h-3" />
                          <p className="text-sm text-muted-foreground">
                            {scorePercent >= 90
                              ? 'Your site passes Core Web Vitals for most users.'
                              : scorePercent >= 50
                                ? 'Some users are experiencing performance issues.'
                                : 'Many users are experiencing poor performance.'}
                          </p>
                        </div>
                      )
                    })()}
                  </CardContent>
                </Card>

                {/* Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rating Distribution</CardTitle>
                    <CardDescription>Percentage of experiences by rating</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {['INP', 'LCP', 'CLS'].map((metric) => {
                      const m = data.metrics[metric]
                      return (
                        <div key={metric}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium">{metric}</span>
                            <span className="text-muted-foreground">
                              {m.goodPercent}% / {m.needsImprovementPercent}% /{' '}
                              {m.poorPercent}%
                            </span>
                          </div>
                          <div className="flex h-2 gap-0.5 rounded overflow-hidden">
                            <div
                              className="bg-green-500"
                              style={{ width: `${m.goodPercent}%` }}
                            />
                            <div
                              className="bg-yellow-500"
                              style={{ width: `${m.needsImprovementPercent}%` }}
                            />
                            <div
                              className="bg-red-500"
                              style={{ width: `${m.poorPercent}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                    <div className="flex justify-center gap-4 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-500 rounded" /> Good
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-yellow-500 rounded" /> Needs Work
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-red-500 rounded" /> Poor
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Thresholds Reference */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Core Web Vitals Thresholds</CardTitle>
                  <CardDescription>
                    Google&apos;s recommended p75 thresholds for good user experience
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Metric</TableHead>
                        <TableHead>Your p75</TableHead>
                        <TableHead>Good</TableHead>
                        <TableHead>Poor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {['INP', 'LCP', 'CLS', 'TTFB', 'FCP'].map((metric) => {
                        const m = data.metrics[metric]
                        const t = data.thresholds[metric]
                        const info = METRIC_INFO[metric]
                        return (
                          <TableRow key={metric}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {info.icon}
                                <div>
                                  <p className="font-medium">{metric}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {info.name}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className={`font-mono ${getRatingColor(m.rating)}`}>
                              {formatValue(m.p75, metric)} {info.unit}
                            </TableCell>
                            <TableCell className="text-green-600 font-mono">
                              &le; {t.good} {info.unit}
                            </TableCell>
                            <TableCell className="text-red-600 font-mono">
                              &gt; {t.poor} {info.unit}
                            </TableCell>
                            <TableCell>{getRatingBadge(m.rating)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="routes" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Performance by Route</CardTitle>
                  <CardDescription>
                    Top routes by sample count with their Core Web Vitals
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.topRoutes.length === 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No route-level data available yet. Route breakdown requires more samples.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Route</TableHead>
                          <TableHead>Samples</TableHead>
                          <TableHead>INP (ms)</TableHead>
                          <TableHead>LCP (ms)</TableHead>
                          <TableHead>CLS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.topRoutes.map((route) => (
                          <TableRow key={route.route}>
                            <TableCell className="font-mono text-sm">{route.route}</TableCell>
                            <TableCell>{route.samples.toLocaleString()}</TableCell>
                            <TableCell
                              className={
                                route.inp
                                  ? route.inp <= 200
                                    ? 'text-green-600'
                                    : route.inp > 500
                                      ? 'text-red-600'
                                      : 'text-yellow-600'
                                  : 'text-muted-foreground'
                              }
                            >
                              {route.inp ? Math.round(route.inp) : '-'}
                            </TableCell>
                            <TableCell
                              className={
                                route.lcp
                                  ? route.lcp <= 2500
                                    ? 'text-green-600'
                                    : route.lcp > 4000
                                      ? 'text-red-600'
                                      : 'text-yellow-600'
                                  : 'text-muted-foreground'
                              }
                            >
                              {route.lcp ? Math.round(route.lcp) : '-'}
                            </TableCell>
                            <TableCell
                              className={
                                route.cls != null
                                  ? route.cls <= 0.1
                                    ? 'text-green-600'
                                    : route.cls > 0.25
                                      ? 'text-red-600'
                                      : 'text-yellow-600'
                                  : 'text-muted-foreground'
                              }
                            >
                              {route.cls != null ? route.cls.toFixed(3) : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="details" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['INP', 'LCP', 'CLS', 'TTFB', 'FCP'].map((metric) => {
                  const m = data.metrics[metric]
                  const info = METRIC_INFO[metric]
                  const t = data.thresholds[metric]

                  return (
                    <Card key={metric}>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          {info.icon}
                          {metric} - {info.name}
                        </CardTitle>
                        <CardDescription>{info.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-xs text-muted-foreground">p50 (median)</p>
                            <p className="text-lg font-semibold">
                              {formatValue(m.p50, metric)} {info.unit}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">p75</p>
                            <p className={`text-lg font-semibold ${getRatingColor(m.rating)}`}>
                              {formatValue(m.p75, metric)} {info.unit}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">p95</p>
                            <p className="text-lg font-semibold text-muted-foreground">
                              {formatValue(m.p95, metric)} {info.unit}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Good (&le; {t.good}{info.unit})</span>
                            <span className="text-green-600">{m.goodPercent}%</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Needs Improvement</span>
                            <span className="text-yellow-600">{m.needsImprovementPercent}%</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Poor (&gt; {t.poor}{info.unit})</span>
                            <span className="text-red-600">{m.poorPercent}%</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground">
                            {m.samples.toLocaleString()} samples collected
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
