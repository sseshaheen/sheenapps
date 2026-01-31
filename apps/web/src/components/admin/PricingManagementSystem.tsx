'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { 
  Package, 
  Calendar, 
  TrendingUp, 
  Users, 
  Copy, 
  Shield, 
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  Target,
  GitBranch,
  Zap,
  DollarSign,
  FileText
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { PricingTestManagement } from './PricingTestManagement'

interface Props {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
  canManagePricing: boolean
}

interface PricingCatalog {
  id: string
  version_tag?: string
  version?: string
  name?: string
  status?: 'draft' | 'testing' | 'active' | 'archived'
  is_active?: boolean
  created_at: string
  effective_at?: string
  activated_at?: string
  deactivated_at?: string
  created_by: string | null
  plans?: PricingPlan[]
  item_count?: string
  active_item_count?: string
  rollover_days?: number
  activation_schedule?: {
    scheduled_at: string
    auto_activate: boolean
  }
  rollback_version?: string
  usage_metrics?: CatalogMetrics
}

interface PricingPlan {
  id: string
  name: string
  type?: 'free' | 'starter' | 'pro' | 'enterprise'
  price_monthly?: number
  price_annual?: number
  features?: string[]
  limits?: {
    projects?: number
    team_members?: number
    api_calls?: number
    storage_gb?: number
  }
  is_popular?: boolean
  is_new?: boolean
}

interface CatalogMetrics {
  total_subscriptions: number
  conversion_rate: number
  avg_revenue_per_user: number
  churn_rate: number
  growth_rate: number
  plan_distribution: {
    plan_type: string
    count: number
    percentage: number
  }[]
}

interface CompetitorAnalysis {
  competitor: string
  pricing_model: string
  base_price: number
  key_differentiator: string
  market_position: 'below' | 'at' | 'above'
}


export function PricingManagementSystem({
  adminId,
  adminEmail,
  adminRole,
  permissions,
  canManagePricing
}: Props) {
  const [catalogs, setCatalogs] = useState<PricingCatalog[]>([])
  const [selectedCatalog, setSelectedCatalog] = useState<PricingCatalog | null>(null)
  const [isCreatingCatalog, setIsCreatingCatalog] = useState(false)
  const [isTestingMode, setIsTestingMode] = useState(false)
  const [abTestConfig, setAbTestConfig] = useState({ enabled: false, percentage: 10 })
  const [competitors, setCompetitors] = useState<CompetitorAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pricingAnalytics, setPricingAnalytics] = useState<any>(null)

  // Fetch catalogs on mount
  useEffect(() => {
    fetchCatalogs()
    fetchAnalytics()
  }, [])

  const fetchCatalogs = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/admin/pricing/catalogs', {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch pricing catalogs: ${response.status}`)
      }

      const data = await response.json()
      if (data.success && data.catalogs) {
        setCatalogs(data.catalogs)
      } else if (data.success && Array.isArray(data)) {
        setCatalogs(data)
      }

    } catch (apiError) {
      console.error('Failed to fetch pricing catalogs:', apiError)
      setError(apiError instanceof Error ? apiError.message : 'Failed to connect to admin service')
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/admin/pricing/analytics', {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setPricingAnalytics(data)
        }
      }
    } catch (error) {
      console.error('Failed to fetch pricing analytics:', error)
    }
  }

  const fetchCatalogDetails = async (catalogId: string) => {
    try {
      const response = await fetch(`/api/admin/pricing/catalogs/${catalogId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          // Transform API items to expected plan format
          const transformedPlans = (data.items || []).map((item: any) => ({
            id: item.id,
            name: item.display_name,
            type: item.item_type === 'subscription' ? 'subscription' : 'package',
            price_monthly: Math.round(item.unit_amount_cents / 100), // Convert cents to dollars
            price_annual: Math.round(item.unit_amount_cents / 100) * 12, // Estimate annual
            features: [
              `${Math.round(item.seconds / 3600)} hours included`,
              ...(item.bonus_daily_seconds > 0 ? [`${Math.round(item.bonus_daily_seconds / 60)} daily bonus minutes`] : []),
              ...(item.rollover_cap_seconds > 0 ? [`Rollover up to ${Math.round(item.rollover_cap_seconds / 3600)} hours`] : []),
              ...(item.advisor_eligible ? ['Advisor network access'] : []),
              `${item.expires_days} day validity`
            ],
            limits: {
              api_calls: item.seconds,
              projects: undefined,
              team_members: undefined,
              storage_gb: undefined
            },
            is_popular: item.item_key === 'pro', // Assume Pro is popular
            is_new: false
          }))

          // Update the catalog with detailed items/plans
          const updatedCatalog = {
            ...catalogs.find(c => c.id === catalogId),
            ...data.catalog,
            plans: transformedPlans
          }
          setSelectedCatalog(updatedCatalog)
        }
      }
    } catch (error) {
      console.error('Failed to fetch catalog details:', error)
      // Still set the basic catalog even if details fetch fails
      setSelectedCatalog(catalogs.find(c => c.id === catalogId) || null)
    }
  }

  const handleCreateVersion = async () => {
    if (!selectedCatalog || !canManagePricing) return

    const newVersion = {
      ...selectedCatalog,
      id: `cat${Date.now()}`,
      version: incrementVersion(selectedCatalog.version),
      name: `${selectedCatalog.name} (Copy)`,
      status: 'draft' as const,
      created_at: new Date().toISOString(),
      activated_at: undefined,
      created_by: adminEmail
    }

    setCatalogs([newVersion, ...catalogs])
    setSelectedCatalog(newVersion)
  }

  const handleActivateCatalog = async (catalogId: string, schedule?: Date) => {
    if (!canManagePricing) return

    const catalog = catalogs.find(c => c.id === catalogId)
    if (!catalog) return

    try {
      const response = await fetch(`/api/admin/pricing/catalogs/${catalogId}/activate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-reason': `[PR02] ${schedule ? 'Scheduled activation' : 'Immediate activation'} of pricing catalog ${catalog.version_tag || catalog.version || catalogId.slice(0, 8)}`
        },
        body: JSON.stringify({
          reason: schedule 
            ? `Scheduled activation at ${schedule.toISOString()}`
            : `Immediate activation by admin`
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to activate catalog')
      }

      // Update local state to reflect the change
      const updatedCatalogs = catalogs.map(c => {
        if (c.id === catalogId) {
          return {
            ...c,
            is_active: true,
            status: schedule ? 'testing' as const : 'active' as const,
            activated_at: schedule ? schedule.toISOString() : new Date().toISOString(),
            activation_schedule: schedule ? {
              scheduled_at: schedule.toISOString(),
              auto_activate: true
            } : undefined
          }
        } else if ((c.is_active || c.status === 'active') && !schedule) {
          // Deactivate previous active catalog
          return {
            ...c,
            is_active: false,
            status: 'archived' as const,
            deactivated_at: new Date().toISOString()
          }
        }
        return c
      })

      setCatalogs(updatedCatalogs)
      
      toast.success('Catalog activated successfully', {
        description: schedule 
          ? `Catalog will be activated at ${schedule.toLocaleString()}`
          : 'Pricing changes are now live'
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to activate catalog'
      toast.error('Failed to activate catalog', {
        description: errorMessage
      })
    }
  }

  const handleRollback = async (catalogId: string) => {
    if (!canManagePricing || adminRole !== 'super_admin') return

    // Find the most recently archived catalog (previous active version)
    const previousActive = catalogs
      .filter(c => c.status === 'archived' && c.deactivated_at)
      .sort((a, b) => new Date(b.deactivated_at!).getTime() - new Date(a.deactivated_at!).getTime())[0]

    if (!previousActive) {
      toast.error('No previous version found', {
        description: 'Unable to rollback - no previously active catalog found'
      })
      return
    }

    const currentCatalog = catalogs.find(c => c.id === catalogId)
    const currentVersion = currentCatalog?.version_tag || currentCatalog?.version || 'current'
    const previousVersion = previousActive.version_tag || previousActive.version || 'previous'

    try {
      // Show confirmation dialog
      const confirmed = window.confirm(
        `Are you sure you want to rollback from ${currentVersion} to ${previousVersion}?\n\nThis will make the previous pricing catalog active immediately.`
      )

      if (!confirmed) return

      // Activate the previous catalog
      await handleActivateCatalog(previousActive.id)
      
      toast.success('Rollback completed successfully', {
        description: `Rolled back to version ${previousVersion}`
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Rollback failed'
      toast.error('Rollback failed', {
        description: errorMessage
      })
    }
  }

  const incrementVersion = (version: string): string => {
    const parts = version.split('.')
    const patch = parseInt(parts[2]) + 1
    return `${parts[0]}.${parts[1]}.${patch}`
  }

  const calculatePriceImpact = (oldCatalog: PricingCatalog, newCatalog: PricingCatalog) => {
    // Simplified impact calculation
    const oldAvg = oldCatalog.plans.reduce((sum, p) => sum + p.price_monthly, 0) / oldCatalog.plans.length
    const newAvg = newCatalog.plans.reduce((sum, p) => sum + p.price_monthly, 0) / newCatalog.plans.length
    return ((newAvg - oldAvg) / oldAvg * 100).toFixed(1)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading pricing management...</p>
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

  return (
    <div className="space-y-6">
      <Tabs defaultValue="catalogs" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="catalogs">
            <Package className="h-4 w-4 mr-2" />
            Catalogs
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="testing">
            <Shield className="h-4 w-4 mr-2" />
            Testing
          </TabsTrigger>
          <TabsTrigger value="competitors">
            <Target className="h-4 w-4 mr-2" />
            Market Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogs" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Pricing Catalogs</h3>
              <p className="text-sm text-muted-foreground">
                Manage versions and activate pricing changes safely
              </p>
            </div>
            {canManagePricing && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => selectedCatalog && handleCreateVersion()}
                  disabled={!selectedCatalog}
                  variant="outline"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate Version
                </Button>
                <Dialog open={isCreatingCatalog} onOpenChange={setIsCreatingCatalog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Package className="h-4 w-4 mr-2" />
                      Create Catalog
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Create New Pricing Catalog</DialogTitle>
                      <DialogDescription>
                        Define a new pricing structure with plans and features
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Catalog Name</Label>
                          <Input placeholder="e.g., Holiday 2024 Pricing" />
                        </div>
                        <div>
                          <Label>Version</Label>
                          <Input placeholder="3.0.0" />
                        </div>
                      </div>
                      <div>
                        <Label>Base Template</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="current">Current Active</SelectItem>
                            <SelectItem value="blank">Blank Template</SelectItem>
                            <SelectItem value="competitor">Competitor-based</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreatingCatalog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => setIsCreatingCatalog(false)}>
                        Create Catalog
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>

          {catalogs.length > 0 ? (
            <div className="grid gap-4">
              {catalogs.map((catalog) => (
              <Card 
                key={catalog.id} 
                className={`cursor-pointer ${selectedCatalog?.id === catalog.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => fetchCatalogDetails(catalog.id)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {catalog.name || `Version ${catalog.version_tag || catalog.version}` || `Catalog ${catalog.id?.slice(0, 8)}`}
                        <Badge variant={
                          catalog.is_active || catalog.status === 'active' ? 'default' :
                          catalog.status === 'testing' ? 'secondary' :
                          catalog.status === 'draft' ? 'outline' : 'secondary'
                        }>
                          {catalog.is_active || catalog.status === 'active' ? 'Active' : catalog.status || 'Draft'}
                        </Badge>
                        {catalog.activation_schedule && (
                          <Badge variant="outline" className="gap-1">
                            <Clock className="h-3 w-3" />
                            Scheduled
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        Version {catalog.version_tag || catalog.version} • Created by {catalog.created_by || 'System'}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {!catalog.is_active && catalog.status === 'draft' && canManagePricing && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            setIsTestingMode(true)
                          }}
                        >
                          <Shield className="h-4 w-4 mr-1" />
                          Test
                        </Button>
                      )}
                      {catalog.status === 'testing' && canManagePricing && (
                        <Button 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleActivateCatalog(catalog.id)
                          }}
                        >
                          <Zap className="h-4 w-4 mr-1" />
                          Activate
                        </Button>
                      )}
                      {(catalog.is_active || catalog.status === 'active') && adminRole === 'super_admin' && (
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRollback(catalog.id)
                          }}
                        >
                          Rollback
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Plans</p>
                      <p className="font-medium">{catalog.item_count || catalog.plans?.length || 0} plans</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Price Range</p>
                      <p className="font-medium">
                        {catalog.plans && catalog.plans.length > 0 ? (
                          `$${Math.min(...catalog.plans.map(p => p.price_monthly || 0))} - $${Math.max(...catalog.plans.map(p => p.price_monthly || 0))}/mo`
                        ) : (
                          'N/A'
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <p className="font-medium">
                        {catalog.effective_at || catalog.activated_at ? 
                          `Active since ${new Date(catalog.effective_at || catalog.activated_at!).toLocaleDateString()}` : 
                          'Not activated'}
                      </p>
                    </div>
                  </div>

                  {catalog.usage_metrics && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Subscriptions</p>
                          <p className="font-medium">{catalog.usage_metrics.total_subscriptions}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Conversion</p>
                          <p className="font-medium">{catalog.usage_metrics.conversion_rate}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">ARPU</p>
                          <p className="font-medium">${catalog.usage_metrics.avg_revenue_per_user}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Churn</p>
                          <p className="font-medium">{catalog.usage_metrics.churn_rate}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Growth</p>
                          <p className="font-medium text-green-600">
                            +{catalog.usage_metrics.growth_rate}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              ))}
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No pricing catalogs found. Create your first catalog to manage pricing plans.
              </AlertDescription>
            </Alert>
          )}

          {selectedCatalog && (
            <Card>
              <CardHeader>
                <CardTitle>Catalog Details - {selectedCatalog.name || `Version ${selectedCatalog.version_tag || selectedCatalog.version}` || 'Pricing Items'}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>Monthly</TableHead>
                      <TableHead>Annual</TableHead>
                      <TableHead>Features</TableHead>
                      <TableHead>Limits</TableHead>
                      <TableHead>Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCatalog.plans ? selectedCatalog.plans.map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">{plan.name || 'Unnamed Plan'}</TableCell>
                        <TableCell>${plan.price_monthly || 0}</TableCell>
                        <TableCell>${plan.price_annual || 0}</TableCell>
                        <TableCell>
                          <ul className="text-xs space-y-1">
                            {plan.features && plan.features.length > 0 ? (
                              <>
                                {plan.features.slice(0, 2).map((f, i) => (
                                  <li key={i}>• {f}</li>
                                ))}
                                {plan.features.length > 2 && (
                                  <li className="text-muted-foreground">
                                    +{plan.features.length - 2} more
                                  </li>
                                )}
                              </>
                            ) : (
                              <li className="text-muted-foreground">No features listed</li>
                            )}
                          </ul>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-1">
                            {plan.limits?.projects && <div>Projects: {plan.limits.projects}</div>}
                            {plan.limits?.api_calls && <div>API: {plan.limits.api_calls}</div>}
                            {(!plan.limits || (!plan.limits.projects && !plan.limits.api_calls)) && (
                              <div className="text-muted-foreground">No limits specified</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {plan.is_popular && <Badge variant="secondary">Popular</Badge>}
                            {plan.is_new && <Badge variant="outline">New</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                          <p>No pricing plans available</p>
                          <p className="text-sm mt-1">This catalog has {selectedCatalog.plans?.length || 0} items</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pricing Performance Analytics</CardTitle>
              <CardDescription>
                Track conversion, revenue, and customer behavior patterns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {pricingAnalytics && catalogs.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Plan Distribution</h4>
                    <div className="space-y-2">
                      {catalogs[0]?.usage_metrics?.plan_distribution ? (
                        catalogs[0].usage_metrics.plan_distribution.map((dist) => (
                          <div key={dist.plan_type}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="capitalize">{dist.plan_type}</span>
                              <span>{dist.percentage}%</span>
                            </div>
                            <Progress value={dist.percentage} />
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No plan distribution data available</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-4">Key Metrics</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">MRR</span>
                        <span className="font-medium">{pricingAnalytics.mrr || '$0'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">ARR</span>
                        <span className="font-medium">{pricingAnalytics.arr || '$0'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">LTV</span>
                        <span className="font-medium">{pricingAnalytics.ltv || '$0'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">CAC</span>
                        <span className="font-medium">{pricingAnalytics.cac || '$0'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Pricing analytics are not available yet. Analytics will be shown once catalogs have usage data.
                  </AlertDescription>
                </Alert>
              )}

              {pricingAnalytics?.conversion_funnel ? (
                <div>
                  <h4 className="text-sm font-medium mb-2">Conversion Funnel</h4>
                  <div className="space-y-2">
                    {pricingAnalytics.conversion_funnel.map((stage: any, index: number) => (
                      <div key={index}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{stage.stage}</span>
                          <span>{stage.percentage}%</span>
                        </div>
                        <Progress value={stage.percentage * 10} className="h-2" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <PricingTestManagement
            adminId={adminId}
            adminEmail={adminEmail}
            adminRole={adminRole}
            permissions={permissions}
            canManagePricing={canManagePricing}
            selectedCatalog={selectedCatalog}
          />
        </TabsContent>

        <TabsContent value="competitors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Competitor Pricing Analysis</CardTitle>
              <CardDescription>
                Monitor market positioning and competitive pricing strategies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competitor</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Base Price</TableHead>
                    <TableHead>Key Differentiator</TableHead>
                    <TableHead>Our Position</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {competitors.length > 0 ? (
                    competitors.map((comp) => (
                      <TableRow key={comp.competitor}>
                        <TableCell className="font-medium">{comp.competitor}</TableCell>
                        <TableCell>{comp.pricing_model}</TableCell>
                        <TableCell>${comp.base_price}</TableCell>
                        <TableCell>{comp.key_differentiator}</TableCell>
                        <TableCell>
                          <Badge variant={
                            comp.market_position === 'below' ? 'secondary' :
                            comp.market_position === 'at' ? 'default' : 'outline'
                          }>
                            {comp.market_position === 'below' ? 'Lower' :
                             comp.market_position === 'at' ? 'Matched' : 'Premium'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No competitor data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="mt-6">
                <h4 className="text-sm font-medium mb-3">Market Positioning Strategy</h4>
                <div className="space-y-2">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-primary" />
                      <span className="font-medium">Current Position</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Mid-market positioning with competitive starter pricing and premium enterprise features.
                      Average 15% below enterprise competitors, 20% above entry-level solutions.
                    </p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="font-medium">Opportunities</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Consider value-added bundling for mid-tier plans. 
                      Usage-based pricing model showing strong market adoption.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}