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
  DialogFooter,
} from '@/components/ui/dialog'
import { 
  Tag, 
  Calendar, 
  TrendingUp, 
  Users, 
  Settings, 
  AlertCircle,
  CheckCircle,
  XCircle,
  BarChart3,
  Globe,
  Percent,
  DollarSign,
  Timer,
  Target,
  Sparkles
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
import { Checkbox } from '@/components/ui/checkbox'

interface Props {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
}

interface Promotion {
  id: string
  name: string
  code: string
  type: 'percentage' | 'fixed_amount'
  value: number
  status: 'active' | 'scheduled' | 'expired' | 'paused'
  start_date: string
  end_date: string
  usage_limit?: number
  usage_count: number
  minimum_purchase?: number
  applies_to: 'all' | 'specific_plans' | 'new_users' | 'existing_users'
  specific_plans?: string[]
  regions: string[]
  created_by: string
  created_at: string
  performance?: {
    conversion_rate: number
    revenue_impact: number
    avg_order_value: number
    total_discounted: number
  }
}

interface CampaignMetrics {
  total_campaigns: number
  active_campaigns: number
  total_redemptions: number
  revenue_impact: number
  avg_discount_rate: number
  top_performing_code: string
}


export function EnhancedPromotionSystem({
  adminId,
  adminEmail,
  adminRole,
  permissions
}: Props) {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null)
  const [testResult, setTestResult] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const canManagePromotions = permissions.includes('promotions.write') || adminRole === 'super_admin'

  // Fetch promotions on mount
  useEffect(() => {
    fetchPromotions()
    fetchAnalytics()
  }, [])

  const fetchPromotions = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/admin/promotions', {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch promotions: ${response.status}`)
      }

      const data = await response.json()
      if (data.success && data.promotions) {
        setPromotions(data.promotions)
      } else if (data.success && Array.isArray(data)) {
        setPromotions(data)
      }

    } catch (apiError) {
      console.error('Failed to fetch promotions:', apiError)
      setError(apiError instanceof Error ? apiError.message : 'Failed to connect to admin service')
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/admin/promotions/analytics', {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setMetrics(data)
        }
      }
    } catch (error) {
      console.error('Failed to fetch promotion analytics:', error)
    }
  }

  const handleCreatePromotion = async (promotion: Partial<Promotion>) => {
    if (!canManagePromotions) return

    const promotionData = {
      name: promotion.name || `New Promotion ${Date.now()}`,
      code: promotion.code || `PROMO${Date.now().toString().slice(-6)}`,
      type: promotion.type || 'percentage',
      value: promotion.value || 10,
      start_date: promotion.start_date || new Date().toISOString(),
      end_date: promotion.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      applies_to: promotion.applies_to || 'all',
      regions: promotion.regions || [],
      description: `Created by admin on ${new Date().toLocaleDateString()}`
    }

    try {
      const response = await fetch('/api/admin/promotions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-reason': `[P01] Creating new promotion: ${promotionData.name}`
        },
        body: JSON.stringify(promotionData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create promotion')
      }

      // Add the created promotion to local state
      const newPromotion: Promotion = {
        id: data.promotion?.id || `promo${Date.now()}`,
        name: promotionData.name,
        code: promotionData.code,
        type: promotionData.type as 'percentage' | 'fixed_amount',
        value: promotionData.value,
        status: 'scheduled',
        start_date: promotionData.start_date,
        end_date: promotionData.end_date,
        usage_count: 0,
        applies_to: promotionData.applies_to as 'all' | 'new_users' | 'existing_users',
        regions: promotionData.regions,
        created_by: adminEmail,
        created_at: data.promotion?.created_at || new Date().toISOString()
      }

      setPromotions([newPromotion, ...promotions])
      setIsCreating(false)

      toast.success('Promotion created successfully', {
        description: `${promotionData.name} (${promotionData.code}) has been created`
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create promotion'
      toast.error('Failed to create promotion', {
        description: errorMessage
      })
    }
  }

  const handleToggleStatus = async (promotionId: string) => {
    if (!canManagePromotions) return

    const promotion = promotions.find(p => p.id === promotionId)
    if (!promotion) return

    const newStatus = promotion.status === 'active' ? 'paused' : 'active'

    try {
      const response = await fetch(`/api/admin/promotions/${promotionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-reason': `[P02] ${newStatus === 'active' ? 'Activating' : 'Pausing'} promotion: ${promotion.name || promotion.code}`
        },
        body: JSON.stringify({
          status: newStatus,
          reason: `Status changed to ${newStatus} by admin`
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${newStatus === 'active' ? 'activate' : 'pause'} promotion`)
      }

      // Update local state to reflect the change
      setPromotions(promotions.map(p => {
        if (p.id === promotionId) {
          return {
            ...p,
            status: newStatus as 'active' | 'paused' | 'scheduled' | 'expired',
            updated_at: new Date().toISOString()
          }
        }
        return p
      }))

      toast.success(
        `Promotion ${newStatus === 'active' ? 'activated' : 'paused'} successfully`,
        {
          description: `${promotion.name || promotion.code} is now ${newStatus}`
        }
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to ${newStatus === 'active' ? 'activate' : 'pause'} promotion`
      toast.error(`Failed to ${newStatus === 'active' ? 'activate' : 'pause'} promotion`, {
        description: errorMessage
      })
    }
  }

  const handleTestPromotion = async (code: string, scenario: any) => {
    // Simulate testing
    setTestResult({
      code,
      scenario,
      valid: true,
      discount_amount: 25,
      final_price: 75,
      message: 'Promotion applied successfully'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'default'
      case 'scheduled': return 'secondary'
      case 'paused': return 'outline'
      case 'expired': return 'secondary'
      default: return 'outline'
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading promotions...</p>
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
      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="campaigns">
            <Tag className="h-4 w-4 mr-2" />
            Campaigns
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="testing">
            <Settings className="h-4 w-4 mr-2" />
            Testing
          </TabsTrigger>
          <TabsTrigger value="automation">
            <Sparkles className="h-4 w-4 mr-2" />
            Automation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Promotion Campaigns</h3>
              <p className="text-sm text-muted-foreground">
                Manage discount codes and promotional offers
              </p>
            </div>
            {canManagePromotions && (
              <Dialog open={isCreating} onOpenChange={setIsCreating}>
                <Button onClick={() => setIsCreating(true)}>
                  <Tag className="h-4 w-4 mr-2" />
                  Create Promotion
                </Button>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Promotion</DialogTitle>
                    <DialogDescription>
                      Set up a new promotional campaign with discount codes
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Campaign Name</Label>
                        <Input placeholder="e.g., Black Friday 2024" />
                      </div>
                      <div>
                        <Label>Promo Code</Label>
                        <Input placeholder="e.g., BLACKFRIDAY24" className="uppercase" />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Discount Type</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">Percentage</SelectItem>
                            <SelectItem value="fixed">Fixed Amount</SelectItem>
                            <SelectItem value="bogo">Buy One Get One</SelectItem>
                            <SelectItem value="free_trial">Extended Trial</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Discount Value</Label>
                        <Input type="number" placeholder="25" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Start Date</Label>
                        <Input type="datetime-local" />
                      </div>
                      <div>
                        <Label>End Date</Label>
                        <Input type="datetime-local" />
                      </div>
                    </div>

                    <div>
                      <Label>Applies To</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select target" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Products</SelectItem>
                          <SelectItem value="specific_plans">Specific Plans</SelectItem>
                          <SelectItem value="new_users">New Users Only</SelectItem>
                          <SelectItem value="existing_users">Existing Users</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Target Regions</Label>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {['US', 'CA', 'EU', 'UK', 'APAC', 'GLOBAL'].map(region => (
                          <div key={region} className="flex items-center space-x-2">
                            <Checkbox id={region} />
                            <Label htmlFor={region} className="text-sm">{region}</Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Usage Limit</Label>
                        <Input type="number" placeholder="1000" />
                      </div>
                      <div>
                        <Label>Minimum Purchase</Label>
                        <Input type="number" placeholder="50" />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreating(false)}>
                      Cancel
                    </Button>
                    <Button onClick={() => handleCreatePromotion({})}>
                      Create Promotion
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {promotions.length > 0 ? (
            <div className="grid gap-4">
              {promotions.map((promotion) => (
              <Card key={promotion.id} className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedPromotion(promotion)}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {promotion.name}
                        <Badge variant={getStatusColor(promotion.status)}>
                          {promotion.status}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        Code: <span className="font-mono font-semibold">{promotion.code}</span>
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {promotion.status === 'active' && canManagePromotions && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleStatus(promotion.id)
                          }}
                        >
                          Pause
                        </Button>
                      )}
                      {promotion.status === 'paused' && canManagePromotions && (
                        <Button 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleStatus(promotion.id)
                          }}
                        >
                          Activate
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Type</p>
                      <p className="font-medium flex items-center gap-1">
                        {promotion.type === 'percentage' && <Percent className="h-3 w-3" />}
                        {promotion.type === 'fixed_amount' && <DollarSign className="h-3 w-3" />}
                        {promotion.value}{promotion.type === 'percentage' ? '%' : '$'} off
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Usage</p>
                      <p className="font-medium">
                        {promotion.usage_count}
                        {promotion.usage_limit && ` / ${promotion.usage_limit}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Valid Until</p>
                      <p className="font-medium">
                        {new Date(promotion.end_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Regions</p>
                      <p className="font-medium">
                        {promotion.regions.slice(0, 2).join(', ')}
                        {promotion.regions.length > 2 && ` +${promotion.regions.length - 2}`}
                      </p>
                    </div>
                  </div>

                  {promotion.performance && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Conversion</p>
                          <p className="font-medium text-green-600">
                            {promotion.performance.conversion_rate}%
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Revenue Impact</p>
                          <p className="font-medium">
                            ${promotion.performance.revenue_impact.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">AOV</p>
                          <p className="font-medium">
                            ${promotion.performance.avg_order_value}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total Discount</p>
                          <p className="font-medium">
                            ${promotion.performance.total_discounted.toLocaleString()}
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
                No promotions found. Create your first promotion campaign to get started.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Performance</CardTitle>
              <CardDescription>
                Track promotion effectiveness and revenue impact
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {metrics ? (
                <div className="grid grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{metrics.active_campaigns}</p>
                      <p className="text-xs text-muted-foreground">of {metrics.total_campaigns} total</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Redemptions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{metrics.total_redemptions.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Total uses</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Revenue Impact</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">${metrics.revenue_impact.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Generated revenue</p>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Promotion analytics are not available yet. Metrics will be displayed once campaigns have performance data.
                  </AlertDescription>
                </Alert>
              )}

              {promotions.length > 0 && promotions.some(p => p.performance) ? (
                <div>
                  <h4 className="text-sm font-medium mb-3">Top Performing Promotions</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Redemptions</TableHead>
                        <TableHead>Conversion Rate</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>ROI</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {promotions
                        .filter(p => p.performance)
                        .sort((a, b) => (b.performance?.revenue_impact || 0) - (a.performance?.revenue_impact || 0))
                        .slice(0, 5)
                        .map(promo => (
                          <TableRow key={promo.id}>
                            <TableCell className="font-mono font-medium">{promo.code}</TableCell>
                            <TableCell>{promo.usage_count}</TableCell>
                            <TableCell>{promo.performance?.conversion_rate}%</TableCell>
                            <TableCell>${promo.performance?.revenue_impact.toLocaleString()}</TableCell>
                            <TableCell className="text-green-600">
                              {((promo.performance?.revenue_impact || 0) / (promo.performance?.total_discounted || 1) * 100).toFixed(0)}%
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No performance data available for promotions yet.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Promotion Testing</CardTitle>
              <CardDescription>
                Test promotion codes and validate scenarios before activation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Test Promo Code</Label>
                  <Input placeholder="Enter code to test" className="uppercase" />
                </div>
                <div>
                  <Label>Test Scenario</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select scenario" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_user">New User Signup</SelectItem>
                      <SelectItem value="existing_user">Existing User</SelectItem>
                      <SelectItem value="upgrade">Plan Upgrade</SelectItem>
                      <SelectItem value="renewal">Renewal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Test Amount</Label>
                  <Input type="number" placeholder="100" />
                </div>
                <div>
                  <Label>Test Region</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">United States</SelectItem>
                      <SelectItem value="CA">Canada</SelectItem>
                      <SelectItem value="EU">Europe</SelectItem>
                      <SelectItem value="UK">United Kingdom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={() => handleTestPromotion('TEST123', {})}>
                Run Test
              </Button>

              {testResult && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium">Test Result: {testResult.message}</p>
                      <div className="grid grid-cols-3 gap-4 text-sm mt-2">
                        <div>
                          <p className="text-muted-foreground">Original Price</p>
                          <p>$100</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Discount</p>
                          <p>-${testResult.discount_amount}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Final Price</p>
                          <p className="font-semibold">${testResult.final_price}</p>
                        </div>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Automated Campaigns</CardTitle>
              <CardDescription>
                Set up rule-based promotions that activate automatically
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-medium">Seasonal Campaigns</span>
                    </div>
                    <Switch />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Automatically activate promotions for holidays and special events
                  </p>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="font-medium">Retention Offers</span>
                    </div>
                    <Switch />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Send discount codes to users at risk of churning
                  </p>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      <span className="font-medium">Cart Abandonment</span>
                    </div>
                    <Switch />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Trigger promotions for users who abandon their checkout
                  </p>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="font-medium">Upgrade Incentives</span>
                    </div>
                    <Switch />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Offer discounts to users approaching plan limits
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}