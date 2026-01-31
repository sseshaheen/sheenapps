'use client'

import { useState, useEffect } from 'react'
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
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  CreditCard, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Download,
  Filter,
  BarChart3,
  PieChart,
  Activity,
  Target,
  Zap
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

interface RevenueMetrics {
  mrr: number
  mrr_change: number
  arr: number
  arr_change: number
  total_revenue: number
  total_customers: number
  arpu: number
  ltv: number
  cac: number
  churn_rate: number
  growth_rate: number
  quick_ratio: number
}

interface RevenueBreakdown {
  source: string
  amount: number
  percentage: number
  trend: 'up' | 'down' | 'stable'
  change: number
}

interface CustomerSegment {
  segment: string
  count: number
  revenue: number
  avg_revenue: number
  churn_rate: number
  ltv: number
}

interface Forecast {
  month: string
  projected_mrr: number
  best_case: number
  worst_case: number
  confidence: number
}


export function RevenueAnalyticsDashboard({
  adminId,
  adminEmail,
  adminRole,
  permissions
}: Props) {
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null)
  const [breakdown, setBreakdown] = useState<RevenueBreakdown[]>([])
  const [segments, setSegments] = useState<CustomerSegment[]>([])
  const [forecast, setForecast] = useState<Forecast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState('30d')
  const [comparisonPeriod, setComparisonPeriod] = useState('previous_period')

  // Fetch metrics on mount
  useEffect(() => {
    fetchMetrics()
  }, [dateRange])

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch revenue metrics from API
      const [metricsRes, mrrRes, ltvRes, arpuRes, growthRes] = await Promise.all([
        fetch(`/api/admin/revenue-metrics?range=${dateRange}`, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }),
        fetch('/api/admin/mrr', {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }),
        fetch('/api/admin/ltv', {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }),
        fetch('/api/admin/arpu', {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }),
        fetch('/api/admin/growth-metrics', {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        })
      ])

      // Check if all requests succeeded
      if (!metricsRes.ok || !mrrRes.ok || !ltvRes.ok || !arpuRes.ok || !growthRes.ok) {
        throw new Error('Failed to fetch revenue data')
      }

      const [metricsData, mrrData, ltvData, arpuData, growthData] = await Promise.all([
        metricsRes.json(),
        mrrRes.json(),
        ltvRes.json(),
        arpuRes.json(),
        growthRes.json()
      ])

      // Combine data into metrics object
      const combinedMetrics: RevenueMetrics = {
        mrr: mrrData.current || 0,
        mrr_change: mrrData.change_percentage || 0,
        arr: (mrrData.current || 0) * 12,
        arr_change: mrrData.change_percentage || 0,
        total_revenue: metricsData.total_revenue || 0,
        total_customers: metricsData.total_customers || 0,
        arpu: arpuData.current || 0,
        ltv: ltvData.current || 0,
        cac: metricsData.cac || 0,
        churn_rate: growthData.churn_rate || 0,
        growth_rate: growthData.growth_rate || 0,
        quick_ratio: growthData.quick_ratio || 0
      }

      setMetrics(combinedMetrics)

      // Set breakdown and segments to empty for now (can be enhanced later)
      setBreakdown([])
      setSegments([])
      setForecast([])

    } catch (error) {
      console.error('Failed to fetch revenue metrics:', error)
      setError(error instanceof Error ? error.message : 'Failed to connect to admin service')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600'
    if (change < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getChangeIcon = (change: number) => {
    if (change > 0) return <ArrowUpRight className="h-4 w-4" />
    if (change < 0) return <ArrowDownRight className="h-4 w-4" />
    return null
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading revenue analytics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No revenue data available
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Revenue Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Comprehensive financial metrics and growth analysis
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="365d">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              MRR
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(metrics.mrr)}</p>
            <div className={`flex items-center gap-1 text-sm ${getChangeColor(metrics.mrr_change)}`}>
              {getChangeIcon(metrics.mrr_change)}
              <span>{Math.abs(metrics.mrr_change)}%</span>
              <span className="text-muted-foreground">vs last month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              ARR
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(metrics.arr)}</p>
            <div className={`flex items-center gap-1 text-sm ${getChangeColor(metrics.arr_change)}`}>
              {getChangeIcon(metrics.arr_change)}
              <span>{Math.abs(metrics.arr_change)}%</span>
              <span className="text-muted-foreground">YoY</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              ARPU
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(metrics.arpu)}</p>
            <p className="text-sm text-muted-foreground">
              per customer/month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Quick Ratio
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{metrics.quick_ratio.toFixed(1)}</p>
            <p className="text-sm text-muted-foreground">
              Growth efficiency
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Growth Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Customer Growth</span>
                    <span className="text-sm font-medium">{metrics.growth_rate}%</span>
                  </div>
                  <Progress value={metrics.growth_rate * 2} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Churn Rate</span>
                    <span className="text-sm font-medium">{metrics.churn_rate}%</span>
                  </div>
                  <Progress value={metrics.churn_rate * 10} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">LTV:CAC Ratio</span>
                    <span className="text-sm font-medium">{(metrics.ltv / metrics.cac).toFixed(1)}:1</span>
                  </div>
                  <Progress value={(metrics.ltv / metrics.cac) * 20} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Key Performance Indicators</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Customers</span>
                    <span className="font-medium">{metrics.total_customers.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Customer LTV</span>
                    <span className="font-medium">{formatCurrency(metrics.ltv)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">CAC</span>
                    <span className="font-medium">{formatCurrency(metrics.cac)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Revenue</span>
                    <span className="font-medium">{formatCurrency(metrics.total_revenue)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue Health Score */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue Health Score</CardTitle>
              <CardDescription>
                Overall assessment of revenue metrics and growth trajectory
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-muted-foreground">
                    {metrics.growth_rate > 0 && metrics.churn_rate < 5 ? 
                      Math.round(75 + (metrics.growth_rate * 2) - (metrics.churn_rate * 3)) : 
                      Math.round(50 + (metrics.growth_rate * 1.5))
                    }/100
                  </span>
                  <Badge variant={
                    metrics.growth_rate > 10 && metrics.churn_rate < 5 ? 'default' :
                    metrics.growth_rate > 5 ? 'secondary' : 'outline'
                  } className="text-lg px-3 py-1">
                    {metrics.growth_rate > 10 && metrics.churn_rate < 5 ? 'Healthy' :
                     metrics.growth_rate > 5 ? 'Fair' : 'Needs Attention'}
                  </Badge>
                </div>
                <Progress value={
                  metrics.growth_rate > 0 && metrics.churn_rate < 5 ? 
                    75 + (metrics.growth_rate * 2) - (metrics.churn_rate * 3) : 
                    50 + (metrics.growth_rate * 1.5)
                } className="h-3" />
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <p className={`font-medium ${
                      metrics.growth_rate > 10 ? 'text-green-600' :
                      metrics.growth_rate > 5 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {metrics.growth_rate > 10 ? 'Strong' :
                       metrics.growth_rate > 5 ? 'Fair' : 'Weak'}
                    </p>
                    <p className="text-muted-foreground">Growth Rate</p>
                  </div>
                  <div className="text-center">
                    <p className={`font-medium ${
                      metrics.churn_rate < 3 ? 'text-green-600' :
                      metrics.churn_rate < 6 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {metrics.churn_rate < 3 ? 'Excellent' :
                       metrics.churn_rate < 6 ? 'Monitor' : 'Action Needed'}
                    </p>
                    <p className="text-muted-foreground">Churn Rate</p>
                  </div>
                  <div className="text-center">
                    <p className={`font-medium ${
                      (metrics.ltv / metrics.cac) > 3 ? 'text-green-600' :
                      (metrics.ltv / metrics.cac) > 2 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {(metrics.ltv / metrics.cac) > 3 ? 'Excellent' :
                       (metrics.ltv / metrics.cac) > 2 ? 'Good' : 'Poor'}
                    </p>
                    <p className="text-muted-foreground">LTV:CAC</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Sources</CardTitle>
              <CardDescription>
                Breakdown of revenue by source and product type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>% of Total</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead>Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown.map((item) => (
                    <TableRow key={item.source}>
                      <TableCell className="font-medium">{item.source}</TableCell>
                      <TableCell>{formatCurrency(item.amount)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={item.percentage} className="w-20 h-2" />
                          <span className="text-sm">{item.percentage}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          item.trend === 'up' ? 'default' :
                          item.trend === 'down' ? 'destructive' : 'secondary'
                        }>
                          {item.trend}
                        </Badge>
                      </TableCell>
                      <TableCell className={getChangeColor(item.change)}>
                        <div className="flex items-center gap-1">
                          {getChangeIcon(item.change)}
                          <span>{Math.abs(item.change)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="segments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer Segments</CardTitle>
              <CardDescription>
                Revenue and metrics by customer segment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Segment</TableHead>
                    <TableHead>Customers</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Avg Revenue</TableHead>
                    <TableHead>Churn Rate</TableHead>
                    <TableHead>LTV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {segments.map((segment) => (
                    <TableRow key={segment.segment}>
                      <TableCell className="font-medium">
                        <Badge variant={
                          segment.segment === 'Enterprise' ? 'default' :
                          segment.segment === 'Pro' ? 'secondary' : 'outline'
                        }>
                          {segment.segment}
                        </Badge>
                      </TableCell>
                      <TableCell>{segment.count.toLocaleString()}</TableCell>
                      <TableCell>{formatCurrency(segment.revenue)}</TableCell>
                      <TableCell>{formatCurrency(segment.avg_revenue)}</TableCell>
                      <TableCell>
                        <span className={segment.churn_rate > 5 ? 'text-red-600' : ''}>
                          {segment.churn_rate}%
                        </span>
                      </TableCell>
                      <TableCell>{formatCurrency(segment.ltv)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {segments.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-3">Segment Insights</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {segments.some(s => s.segment.toLowerCase().includes('enterprise')) && (
                      <Alert>
                        <Target className="h-4 w-4" />
                        <AlertDescription>
                          Enterprise segment shows strong revenue metrics.
                          Consider focusing on enterprise acquisition for growth.
                        </AlertDescription>
                      </Alert>
                    )}
                    {segments.some(s => s.churn_rate > 10) && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Some segments show high churn rates. Consider improving onboarding
                          and activation to retain more users.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecast" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Forecast</CardTitle>
              <CardDescription>
                Projected MRR for the next 4 months based on current trends
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {forecast.map((item) => (
                  <div key={item.month} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-medium">{item.month}</p>
                        <p className="text-2xl font-bold mt-1">
                          {formatCurrency(item.projected_mrr)}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {item.confidence}% confidence
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Best case</span>
                        <span className="text-green-600">{formatCurrency(item.best_case)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Worst case</span>
                        <span className="text-red-600">{formatCurrency(item.worst_case)}</span>
                      </div>
                      <Progress value={item.confidence} className="h-2 mt-2" />
                    </div>
                  </div>
                ))}
              </div>

              {forecast.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Revenue forecasting is not available yet. This feature will be enhanced
                    with historical data and predictive analytics.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <Activity className="h-4 w-4" />
                  <AlertDescription>
                    Forecast assumes current growth rate of {metrics.growth_rate}% and 
                    churn rate of {metrics.churn_rate}%. Confidence decreases over time 
                    due to market uncertainty.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cohorts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cohort Analysis</CardTitle>
              <CardDescription>
                Revenue retention by customer cohort
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Cohort analysis is not available yet. This advanced feature requires
                  historical customer data and will be implemented to track revenue
                  retention patterns across different customer acquisition periods.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}