/**
 * Partner Dashboard Component
 * Full dashboard for SheenApps Friends partners
 */

'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ReferralService, PartnerDashboardResponse } from '@/services/referral-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { 
  RefreshCw, 
  Copy, 
  Users, 
  MousePointer, 
  TrendingUp, 
  DollarSign,
  Calendar,
  Star,
  Award,
  ExternalLink
} from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading'
import { cn } from '@/lib/utils'

interface PartnerDashboardProps {
  userId: string
  className?: string
}

export function PartnerDashboard({ userId, className }: PartnerDashboardProps) {
  const t = useTranslations('referral')
  const [data, setData] = useState<PartnerDashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    
    setError(null)

    try {
      const dashboardData = await ReferralService.getPartnerDashboard(userId)
      setData(dashboardData)
    } catch (error: any) {
      console.error('Dashboard fetch error:', error)
      setError(error.message || t('dashboard.loadError'))
      if (!isRefresh) {
        toast.error(error.message || t('dashboard.networkError'))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDashboard()

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => fetchDashboard(true), 30000)
    return () => clearInterval(interval)
  }, [userId])

  const copyReferralLink = async () => {
    if (!data?.partner.partner_code) return
    
    const link = ReferralService.generateReferralLink(
      data.partner.partner_code, 
      window.location.origin
    )
    
    try {
      await navigator.clipboard.writeText(link)
      toast.success(t('dashboard.linkCopied'))
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = link
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      toast.success(t('dashboard.linkCopied'))
    }
  }

  if (loading && !data) {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="flex justify-center py-12">
          <LoadingSpinner className="h-8 w-8" />
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={cn("text-center py-12", className)}>
        <div className="text-muted-foreground mb-4">{error}</div>
        <Button onClick={() => fetchDashboard()} variant="outline">
          {t('dashboard.retry')}
        </Button>
      </div>
    )
  }

  if (!data) return null

  const { partner, stats, recent_referrals, recent_commissions } = data

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">
            {t('dashboard.partnerCode')}: <strong>{partner.partner_code}</strong> • 
            {t('dashboard.tier')}: <Badge variant="secondary" className="ml-1 capitalize">
              {partner.tier}
            </Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => fetchDashboard(true)} 
            disabled={refreshing}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")} />
            {refreshing ? t('dashboard.refreshing') : t('dashboard.refresh')}
          </Button>
          <Button onClick={copyReferralLink} size="sm">
            <Copy className="h-4 w-4 mr-1" />
            {t('dashboard.copyLink')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title={t('dashboard.stats.clicks')}
          value={stats.total_clicks}
          subtitle={t('dashboard.stats.linkVisits')}
          icon={<MousePointer className="h-4 w-4" />}
          trend="neutral"
        />
        <StatsCard
          title={t('dashboard.stats.signups')}
          value={stats.total_signups}
          subtitle={t('dashboard.stats.conversion', { rate: stats.conversion_rate.toFixed(1) })}
          icon={<Users className="h-4 w-4" />}
          trend={stats.conversion_rate > 5 ? 'positive' : 'neutral'}
        />
        <StatsCard
          title={t('dashboard.stats.pending')}
          value={ReferralService.formatCommission(stats.pending_commissions_cents)}
          subtitle={t('dashboard.stats.awaitingApproval')}
          icon={<Calendar className="h-4 w-4" />}
          trend="neutral"
        />
        <StatsCard
          title={t('dashboard.stats.estimated')}
          value={ReferralService.formatCommission(stats.estimated_monthly_payout_cents)}
          subtitle={t('dashboard.stats.thisMonth')}
          icon={<TrendingUp className="h-4 w-4" />}
          highlight={true}
        />
      </div>

      {/* Tier Progress */}
      <TierProgressCard partner={partner} />

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Referrals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t('dashboard.recentReferrals')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recent_referrals.length > 0 ? (
                recent_referrals.map(referral => (
                  <div key={referral.id} className="flex justify-between items-center p-3 bg-muted/50 rounded">
                    <div>
                      <span className="font-medium">{t('dashboard.userSignup')}</span>
                      <Badge 
                        variant={
                          referral.status === 'confirmed' ? 'default' : 
                          referral.status === 'pending' ? 'secondary' : 
                          'destructive'
                        }
                        className="ml-2"
                      >
                        {t(`dashboard.status.${referral.status}`)}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(referral.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{t('dashboard.noReferrals')}</p>
                  <p className="text-sm mt-1">{t('dashboard.noReferralsDesc')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Commissions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              {t('dashboard.recentCommissions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recent_commissions.length > 0 ? (
                recent_commissions.map(commission => (
                  <div key={commission.id} className="flex justify-between items-center p-3 bg-muted/50 rounded">
                    <div>
                      <span className="font-medium">
                        {ReferralService.formatCommission(commission.commission_amount_cents)}
                      </span>
                      {commission.is_activation_bonus && (
                        <Badge variant="outline" className="ml-2">
                          {t('dashboard.bonus')}
                        </Badge>
                      )}
                      <Badge 
                        variant={
                          commission.status === 'paid' ? 'default' : 
                          commission.status === 'approved' ? 'secondary' : 
                          commission.status === 'pending' ? 'outline' :
                          'destructive'
                        }
                        className="ml-2"
                      >
                        {t(`dashboard.status.${commission.status}`)}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(commission.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{t('dashboard.noCommissions')}</p>
                  <p className="text-sm mt-1">{t('dashboard.noCommissionsDesc')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Help & Resources */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.resources')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Button variant="outline" asChild className="justify-start h-auto p-4">
              <a href="/legal/referral-terms" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                <div className="text-left">
                  <div className="font-medium">{t('dashboard.viewTerms')}</div>
                  <div className="text-xs text-muted-foreground">{t('dashboard.viewTermsDesc')}</div>
                </div>
              </a>
            </Button>
            
            <Button variant="outline" asChild className="justify-start h-auto p-4">
              <a href="/help/referrals" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                <div className="text-left">
                  <div className="font-medium">{t('dashboard.help')}</div>
                  <div className="text-xs text-muted-foreground">{t('dashboard.helpDesc')}</div>
                </div>
              </a>
            </Button>

            <Button variant="outline" asChild className="justify-start h-auto p-4">
              <a href="mailto:partners@sheenapps.com">
                <ExternalLink className="h-4 w-4 mr-2" />
                <div className="text-left">
                  <div className="font-medium">{t('dashboard.contact')}</div>
                  <div className="text-xs text-muted-foreground">{t('dashboard.contactDesc')}</div>
                </div>
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Stats Card Component
interface StatsCardProps {
  title: string
  value: string | number
  subtitle: string
  icon: React.ReactNode
  trend?: 'positive' | 'negative' | 'neutral'
  highlight?: boolean
}

function StatsCard({ title, value, subtitle, icon, trend = 'neutral', highlight = false }: StatsCardProps) {
  return (
    <Card className={cn(highlight && "ring-2 ring-primary/20 bg-primary/5")}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground">{icon}</div>
          <div className={cn(
            "text-xs px-2 py-1 rounded",
            trend === 'positive' && "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/20",
            trend === 'negative' && "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/20",
            trend === 'neutral' && "text-muted-foreground"
          )}>
            {trend === 'positive' ? '↗' : trend === 'negative' ? '↘' : '─'}
          </div>
        </div>
        <div className="mt-2">
          <div className={cn("text-2xl font-bold", highlight && "text-primary")}>
            {value}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {subtitle}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Tier Progress Card Component  
function TierProgressCard({ partner }: { partner: any }) {
  const t = useTranslations('referral')
  
  const tierThresholds = { bronze: 9, silver: 24, gold: Infinity }
  const nextThreshold = partner.tier === 'bronze' ? 10 : partner.tier === 'silver' ? 25 : null
  const progress = nextThreshold ? Math.min((partner.successful_referrals / nextThreshold) * 100, 100) : 100
  
  const commissionRate = ReferralService.getCommissionRate(partner.tier)

  return (
    <Card className="overflow-hidden bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white">
      <CardContent className="p-6 relative">
        {/* Background decoration */}
        <div className="absolute -top-4 -right-4 w-32 h-32 rounded-full border-2 border-white/10"></div>
        
        <div className="relative">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Award className="h-5 w-5" />
                <h3 className="font-semibold">
                  {t('dashboard.tier')}: {partner.tier.toUpperCase()}
                </h3>
              </div>
              <p className="text-white/90 text-sm">
                {t('dashboard.tierDesc', { 
                  referrals: partner.successful_referrals,
                  rate: (commissionRate * 100).toFixed(0)
                })}
              </p>
            </div>
            {nextThreshold && (
              <div className="text-right">
                <p className="text-white/75 text-sm">{t('dashboard.nextTier')}</p>
                <p className="font-semibold">
                  {t('dashboard.referralsNeeded', { count: nextThreshold - partner.successful_referrals })}
                </p>
              </div>
            )}
          </div>
          
          {nextThreshold && (
            <div>
              <div className="bg-white/20 rounded-full h-2 mb-2">
                <div 
                  className="bg-white rounded-full h-2 transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-white/75 text-xs text-center">
                {progress.toFixed(0)}% {t('dashboard.complete')}
              </p>
            </div>
          )}
          
          {!nextThreshold && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <Star className="h-4 w-4" />
              <span className="text-sm">{t('dashboard.maxTier')}</span>
              <Star className="h-4 w-4" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}