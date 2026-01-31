/**
 * Admin Referral Management Component
 * Complete admin interface for managing the SheenApps Friends referral program
 */

'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { 
  ReferralService, 
  AdminOverviewResponse,
  AdminPartnersResponse, 
  AdminPendingCommissionsResponse,
  FraudAlertsResponse,
  PayoutBatchesResponse,
  FraudAlert
} from '@/services/referral-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/ui/loading'
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Eye,
  Download,
  Search,
  Filter,
  RefreshCw
} from 'lucide-react'

export function ReferralManagement() {
  const t = useTranslations()
  const [activeTab, setActiveTab] = useState('overview')
  
  // Overview data
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  
  // Partners data
  const [partners, setPartners] = useState<AdminPartnersResponse | null>(null)
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [partnersFilter, setPartnersFilter] = useState({
    status: '',
    tier: '',
    search: '',
    sort: 'created_desc' as const
  })
  
  // Commissions data
  const [pendingCommissions, setPendingCommissions] = useState<AdminPendingCommissionsResponse | null>(null)
  const [commissionsLoading, setCommissionsLoading] = useState(false)
  const [selectedCommissions, setSelectedCommissions] = useState<string[]>([])
  
  // Fraud alerts data
  const [fraudAlerts, setFraudAlerts] = useState<FraudAlertsResponse | null>(null)
  const [fraudLoading, setFraudLoading] = useState(false)
  
  // Payout batches data
  const [payoutBatches, setPayoutBatches] = useState<PayoutBatchesResponse | null>(null)
  const [payoutsLoading, setPayoutsLoading] = useState(false)

  // Load overview data
  const loadOverview = async () => {
    try {
      setOverviewLoading(true)
      const data = await ReferralService.getAdminOverview(30)
      setOverview(data)
    } catch (error: any) {
      console.error('Failed to load overview:', error)
      toast.error('Failed to load referral overview')
    } finally {
      setOverviewLoading(false)
    }
  }

  // Load partners data
  const loadPartners = async () => {
    try {
      setPartnersLoading(true)
      const data = await ReferralService.getAdminPartners({
        ...partnersFilter,
        status: (partnersFilter.status || undefined) as "paused" | "active" | "suspended" | undefined,
        tier: (partnersFilter.tier || undefined) as "gold" | "silver" | "bronze" | undefined,
        search: partnersFilter.search || undefined
      })
      setPartners(data)
    } catch (error: any) {
      console.error('Failed to load partners:', error)
      toast.error('Failed to load partners')
    } finally {
      setPartnersLoading(false)
    }
  }

  // Load pending commissions
  const loadPendingCommissions = async () => {
    try {
      setCommissionsLoading(true)
      const data = await ReferralService.getPendingCommissions({ days: 30, limit: 100 })
      setPendingCommissions(data)
    } catch (error: any) {
      console.error('Failed to load commissions:', error)
      toast.error('Failed to load pending commissions')
    } finally {
      setCommissionsLoading(false)
    }
  }

  // Load fraud alerts
  const loadFraudAlerts = async () => {
    try {
      setFraudLoading(true)
      const data = await ReferralService.getFraudAlerts(7)
      setFraudAlerts(data)
    } catch (error: any) {
      console.error('Failed to load fraud alerts:', error)
      toast.error('Failed to load fraud alerts')
    } finally {
      setFraudLoading(false)
    }
  }

  // Load payout batches
  const loadPayoutBatches = async () => {
    try {
      setPayoutsLoading(true)
      const data = await ReferralService.getPayoutBatches({ limit: 50 })
      setPayoutBatches(data)
    } catch (error: any) {
      console.error('Failed to load payout batches:', error)
      toast.error('Failed to load payout batches')
    } finally {
      setPayoutsLoading(false)
    }
  }

  // Approve selected commissions
  const approveCommissions = async () => {
    if (selectedCommissions.length === 0) {
      toast.error('No commissions selected')
      return
    }

    try {
      const result = await ReferralService.approveCommissions({
        commission_ids: selectedCommissions
      })
      
      if (result.success) {
        toast.success(`Approved ${result.approved_count} commissions for $${(result.total_amount_cents / 100).toFixed(2)}`)
        setSelectedCommissions([])
        await loadPendingCommissions()
        await loadOverview()
      }
    } catch (error: any) {
      console.error('Failed to approve commissions:', error)
      toast.error('Failed to approve commissions')
    }
  }

  // Create payout batch
  const createPayoutBatch = async () => {
    try {
      const result = await ReferralService.createPayoutBatch({
        payout_method: 'stripe',
        minimum_amount_cents: 5000, // $50 minimum
        description: `Monthly payout batch - ${new Date().toLocaleDateString()}`
      })
      
      if (result.success) {
        toast.success(`Created payout batch for ${result.batch.partner_count} partners ($${(result.batch.total_amount_cents / 100).toFixed(2)})`)
        await loadPayoutBatches()
        await loadOverview()
      }
    } catch (error: any) {
      console.error('Failed to create payout batch:', error)
      toast.error('Failed to create payout batch')
    }
  }

  // Update partner status
  const updatePartnerStatus = async (partnerId: string, status: 'active' | 'paused' | 'suspended', reason?: string) => {
    try {
      await ReferralService.updatePartnerStatus(partnerId, { status, reason })
      toast.success(`Partner status updated to ${status}`)
      await loadPartners()
      await loadOverview()
    } catch (error: any) {
      console.error('Failed to update partner status:', error)
      toast.error('Failed to update partner status')
    }
  }

  // Format currency
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`

  // Get status badge variant
  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'active': case 'approved': case 'paid': case 'completed': return 'default'
      case 'pending': case 'processing': case 'created': return 'secondary'
      case 'suspended': case 'failed': case 'reversed': return 'destructive'
      default: return 'outline'
    }
  }

  // Get fraud severity color
  const getFraudSeverityColor = (severity: FraudAlert['severity']) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-100'
      case 'medium': return 'text-yellow-600 bg-yellow-100'
      case 'low': return 'text-blue-600 bg-blue-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  // Load data on mount and tab change
  useEffect(() => {
    loadOverview()
  }, [])

  useEffect(() => {
    if (activeTab === 'partners') loadPartners()
    else if (activeTab === 'commissions') loadPendingCommissions()
    else if (activeTab === 'fraud') loadFraudAlerts()
    else if (activeTab === 'payouts') loadPayoutBatches()
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'partners') {
      const timer = setTimeout(loadPartners, 500) // Debounce filter changes
      return () => clearTimeout(timer)
    }
  }, [partnersFilter, activeTab])

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Referral Program Management</h1>
        <Button onClick={loadOverview} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="fraud">Fraud Alerts</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          {overviewLoading ? (
            <div className="flex justify-center p-8">
              <LoadingSpinner />
            </div>
          ) : overview ? (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Partners</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overview.total_partners}</div>
                    <p className="text-xs text-muted-foreground">{overview.active_partners} active</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overview.total_referrals}</div>
                    <p className="text-xs text-muted-foreground">
                      {overview.conversion_rate.toFixed(1)}% conversion rate
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(overview.total_paid_cents)}</div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(overview.pending_payout_cents)} pending
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Fraud Alerts</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overview.fraud_alerts_count}</div>
                    <p className="text-xs text-muted-foreground">Require attention</p>
                  </CardContent>
                </Card>
              </div>

              {/* Top Performers */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Partners</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {overview.top_performers.map((performer, index) => (
                      <div key={performer.partner_code} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium">
                            #{index + 1}
                          </div>
                          <div>
                            <div className="font-medium">{performer.company_name || performer.partner_code}</div>
                            <div className="text-sm text-muted-foreground">
                              {performer.referrals_count} referrals
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatCurrency(performer.commissions_cents)}</div>
                          <div className="text-sm text-muted-foreground">earned</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>

        {/* Partners Tab */}
        <TabsContent value="partners">
          <div className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="search">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="search"
                        placeholder="Partner code, company..."
                        className="pl-9"
                        value={partnersFilter.search}
                        onChange={(e) => setPartnersFilter({ ...partnersFilter, search: e.target.value })}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label>Status</Label>
                    <Select value={partnersFilter.status} onValueChange={(value) => 
                      setPartnersFilter({ ...partnersFilter, status: value })
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All statuses</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Tier</Label>
                    <Select value={partnersFilter.tier} onValueChange={(value) => 
                      setPartnersFilter({ ...partnersFilter, tier: value })
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="All tiers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All tiers</SelectItem>
                        <SelectItem value="bronze">Bronze</SelectItem>
                        <SelectItem value="silver">Silver</SelectItem>
                        <SelectItem value="gold">Gold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Sort by</Label>
                    <Select value={partnersFilter.sort} onValueChange={(value: any) => 
                      setPartnersFilter({ ...partnersFilter, sort: value })
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created_desc">Newest first</SelectItem>
                        <SelectItem value="created_asc">Oldest first</SelectItem>
                        <SelectItem value="earnings_desc">Highest earnings</SelectItem>
                        <SelectItem value="referrals_desc">Most referrals</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Partners List */}
            {partnersLoading ? (
              <div className="flex justify-center p-8">
                <LoadingSpinner />
              </div>
            ) : partners ? (
              <Card>
                <CardHeader>
                  <CardTitle>Partners ({partners.pagination.total})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {partners.partners.map((partner) => (
                      <div key={partner.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="font-semibold">{partner.company_name || 'No company name'}</h3>
                              <Badge variant={getStatusVariant(partner.status)}>{partner.status}</Badge>
                              <Badge variant="outline">{partner.tier}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {partner.partner_code} • {partner.user_email}
                            </p>
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updatePartnerStatus(partner.id, 
                                partner.status === 'active' ? 'paused' : 'active'
                              )}
                            >
                              {partner.status === 'active' ? 'Pause' : 'Activate'}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updatePartnerStatus(partner.id, 'suspended', 'Admin action')}
                            >
                              Suspend
                            </Button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Referrals:</span>
                            <div className="font-medium">{partner.successful_referrals}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Total Earnings:</span>
                            <div className="font-medium">{formatCurrency(partner.total_earnings_cents)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Pending:</span>
                            <div className="font-medium">{formatCurrency(partner.pending_commissions_cents)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Commission Rate:</span>
                            <div className="font-medium">{partner.commission_rate}%</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        {/* Commissions Tab */}
        <TabsContent value="commissions">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Pending Commissions</h2>
              <div className="flex space-x-2">
                <Button onClick={approveCommissions} disabled={selectedCommissions.length === 0}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Selected ({selectedCommissions.length})
                </Button>
              </div>
            </div>

            {commissionsLoading ? (
              <div className="flex justify-center p-8">
                <LoadingSpinner />
              </div>
            ) : pendingCommissions ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    Pending Commissions ({pendingCommissions.summary.total_commissions})
                  </CardTitle>
                  <div className="text-sm text-muted-foreground">
                    Total pending: {formatCurrency(pendingCommissions.summary.total_pending_cents)} 
                    • {pendingCommissions.summary.unique_partners} partners
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingCommissions.commissions.map((commission) => (
                      <div key={commission.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex items-start space-x-3">
                            <input
                              type="checkbox"
                              checked={selectedCommissions.includes(commission.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCommissions([...selectedCommissions, commission.id])
                                } else {
                                  setSelectedCommissions(selectedCommissions.filter(id => id !== commission.id))
                                }
                              }}
                              className="mt-1"
                            />
                            <div>
                              <div className="font-semibold">{formatCurrency(commission.commission_amount_cents)}</div>
                              <div className="text-sm text-muted-foreground">
                                {commission.partner_code} • {commission.user_email}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {commission.commission_rate}% of {formatCurrency(commission.payment_amount_cents)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right text-sm text-muted-foreground">
                            {new Date(commission.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        {/* Fraud Alerts Tab */}
        <TabsContent value="fraud">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Fraud Detection Alerts</h2>
            </div>

            {fraudLoading ? (
              <div className="flex justify-center p-8">
                <LoadingSpinner />
              </div>
            ) : fraudAlerts ? (
              <>
                {/* Fraud Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{fraudAlerts.summary.total_alerts}</div>
                      <p className="text-sm text-muted-foreground">Total alerts</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-red-600">{fraudAlerts.summary.high_severity}</div>
                      <p className="text-sm text-muted-foreground">High severity</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-yellow-600">{fraudAlerts.summary.medium_severity}</div>
                      <p className="text-sm text-muted-foreground">Medium severity</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{fraudAlerts.summary.open_alerts}</div>
                      <p className="text-sm text-muted-foreground">Open alerts</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Fraud Alerts List */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Fraud Alerts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {fraudAlerts.alerts.map((alert) => (
                        <div key={alert.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center space-x-2 mb-2">
                                <Badge className={getFraudSeverityColor(alert.severity)}>
                                  {alert.severity} severity
                                </Badge>
                                <Badge variant="outline">{alert.partner_code}</Badge>
                                <Badge variant={getStatusVariant(alert.status)}>{alert.status}</Badge>
                              </div>
                              <h3 className="font-semibold">{alert.type.replace('_', ' ')}</h3>
                              <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                              <div className="text-xs text-muted-foreground mt-2">
                                {alert.affected_referrals} affected referrals
                                {alert.ip_address && ` • IP: ${alert.ip_address}`}
                              </div>
                            </div>
                            <div className="text-right text-sm text-muted-foreground">
                              {new Date(alert.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : null}
          </div>
        </TabsContent>

        {/* Payouts Tab */}
        <TabsContent value="payouts">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Payout Management</h2>
              <Button onClick={createPayoutBatch}>
                <DollarSign className="h-4 w-4 mr-2" />
                Create Payout Batch
              </Button>
            </div>

            {payoutsLoading ? (
              <div className="flex justify-center p-8">
                <LoadingSpinner />
              </div>
            ) : payoutBatches ? (
              <Card>
                <CardHeader>
                  <CardTitle>Payout Batches ({payoutBatches.pagination.total})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {payoutBatches.batches.map((batch) => (
                      <div key={batch.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center space-x-2 mb-2">
                              <h3 className="font-semibold">{formatCurrency(batch.total_amount_cents)}</h3>
                              <Badge variant={getStatusVariant(batch.status)}>{batch.status}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {batch.partner_count} partners • {batch.commission_count} commissions
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {batch.payout_method} • {batch.description}
                            </p>
                          </div>
                          <div className="text-right text-sm text-muted-foreground">
                            <div>Created: {new Date(batch.created_at).toLocaleDateString()}</div>
                            {batch.processed_at && (
                              <div>Processed: {new Date(batch.processed_at).toLocaleDateString()}</div>
                            )}
                          </div>
                        </div>
                        {batch.error_message && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                            {batch.error_message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}