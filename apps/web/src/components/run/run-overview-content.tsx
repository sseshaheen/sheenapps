"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter, usePathname } from '@/i18n/routing'
import { useSearchParams } from 'next/navigation'
import { LoadingSpinner } from '@/components/ui/loading'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon, { type IconName } from '@/components/ui/icon'
import { useTranslations, useLocale } from 'next-intl'
import { formatDistanceToNow, format, subDays, differenceInHours } from 'date-fns'
import { toast } from '@/components/ui/toast'
import { emitFunnelEventOnce } from '@/utils/easy-mode-funnel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getVerticalPack,
  getIndustryOptions,
  type IndustryTag,
  type KpiCardConfig,
  type ActionConfig,
  ALERT_ICONS,
} from '@/config/vertical-packs'
import {
  ACTION_HANDLERS,
  hasClientHandler,
  type ActionHandler,
} from '@/lib/run/action-handlers'
import { type AlertResult } from '@/lib/run/alert-rules'
import { SendPromoModal, PostUpdateModal, RecoverAbandonedModal } from './actions'
import { WorkflowHistoryDrawer } from './workflow-history-drawer'

// Get industry options from config
const INDUSTRY_OPTIONS = getIndustryOptions()

// Date helper
const getDateString = (date: Date) => format(date, 'yyyy-MM-dd')
const today = () => getDateString(new Date())
const yesterday = () => getDateString(subDays(new Date(), 1))

/**
 * Error classification helper - converts raw errors to translation keys
 * P0 Trust Fix: Never show raw English errors to Arabic users
 */
function getLocalizedErrorKey(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    // Network/connection errors
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('connection')) {
      return 'errors.network'
    }
    // Timeout errors
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'errors.timeout'
    }
    // Log raw error for debugging (dev console only)
    if (process.env.NODE_ENV === 'development') {
      console.error('[Run Overview Error]', err)
    }
  }
  return 'errors.generic'
}

interface RunOverviewContentProps {
  projectId: string
  onRefresh?: () => void
}

interface DailyKpi {
  projectId: string
  date: string
  currencyCode: string
  sessions: number
  leads: number
  signups: number
  payments: number
  refunds: number
  revenueCents: number
  refundsCents: number
}

interface RunAlert {
  type: 'payment_failed' | 'build_failed' | 'abandoned_checkout'
  title: string
  description?: string | null
  occurredAt: string
}

interface RunSettings {
  industry_tag?: string
  default_packs?: string[]
  template_snapshot?: {
    id: string
    category: string
    tags?: string[]
  }
}

interface NextAction {
  id: string
  icon: IconName
  label: string
  description: string
}

// Workflow outcome type (from backend)
interface WorkflowOutcome {
  model: string
  windowHours: number
  conversions: number
  revenueCents: number
  currency: string
  confidence: 'high' | 'medium' | 'low'
  matchedBy: string
}

// Last workflow run for action cards
interface LastWorkflowRun {
  actionId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  completedAt?: string
  result?: {
    totalRecipients: number
    successful: number
    failed: number
  }
  outcome?: WorkflowOutcome
}

// Use alert icons from vertical pack config, with fallback for unknown types
const getAlertConfig = (type: string) => {
  const config = ALERT_ICONS[type as keyof typeof ALERT_ICONS]
  return config || { icon: 'alert-circle' as IconName, colorClass: 'text-muted-foreground' }
}

/**
 * Data Freshness Indicator - Shows when tracking last received data
 * Part of Run Hub Phase 1: Quick Wins
 *
 * Displays:
 * - Green dot + time if data is fresh (events in last 24h)
 * - Yellow warning if data is stale (no events in >24h)
 */
function DataFreshnessIndicator({
  lastEventAt,
  lastUpdated,
  refreshing,
  t
}: {
  lastEventAt: string | null | undefined
  lastUpdated: Date | null
  refreshing: boolean
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  // If we have lastEventAt, check staleness
  const hoursSinceLastEvent = lastEventAt
    ? differenceInHours(new Date(), new Date(lastEventAt))
    : null

  const isStale = hoursSinceLastEvent !== null && hoursSinceLastEvent > 24

  // Show refreshing state
  if (refreshing) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon name="loader-2" className="w-3 h-3 animate-spin" />
        {t('overview.updating')}
      </span>
    )
  }

  // No events ever received
  if (hoursSinceLastEvent === null && lastUpdated) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        <span>{t('overview.noTracking')}</span>
      </span>
    )
  }

  // Show stale warning (>24h since last event)
  if (isStale) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
        <Icon name="alert-triangle" className="w-3.5 h-3.5" />
        <span>
          {t('overview.staleData', { hours: hoursSinceLastEvent })}
        </span>
      </span>
    )
  }

  // Show normal last updated time (fresh events)
  if (lastUpdated) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>
          {t('overview.lastUpdated', { time: formatDistanceToNow(lastUpdated, { addSuffix: false }) })}
        </span>
      </span>
    )
  }

  return null
}

/**
 * Sparkline Component - Minimal SVG chart for KPI trends
 * Part of Run Hub Phase 3: Chart Visualizations
 */
function Sparkline({
  data,
  width = 60,
  height = 20,
  color = 'currentColor',
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((v - min) / range) * (height - 2) - 1 // Leave 1px padding
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      className="inline-block"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * QuotaBar - Compact quota usage indicator for Run Hub
 * Part of P2-8: Quotas Card
 */
function QuotaBar({
  label,
  used,
  limit,
  percent,
  formatValue,
}: {
  label: string
  used: number
  limit: number
  percent: number
  formatValue: (v: number) => string
}) {
  const clampedPercent = Math.min(Math.max(percent, 0), 100)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-xs font-medium">
          {formatValue(used)} / {formatValue(limit)}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all rounded-full ${
            clampedPercent > 90
              ? 'bg-destructive'
              : clampedPercent > 70
              ? 'bg-amber-500'
              : 'bg-primary'
          }`}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground text-end">
        {Math.round(clampedPercent)}%
      </div>
    </div>
  )
}

/**
 * IntegrationStatusBar - Shows which services are connected at a glance
 * Part of Run Hub Phase 4: UX Polish
 */
function IntegrationStatusBar({
  integrations,
  t,
}: {
  integrations?: { tracking: boolean; payments: boolean; forms: boolean } | null
  t: (key: string) => string
}) {
  const items = [
    { key: 'tracking', connected: integrations?.tracking ?? false },
    { key: 'payments', connected: integrations?.payments ?? false },
    { key: 'forms', connected: integrations?.forms ?? false },
  ]

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              item.connected ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          />
          <span>{t(`integrations.${item.key}`)}</span>
        </div>
      ))}
    </div>
  )
}

export function RunOverviewContent({ projectId, onRefresh }: RunOverviewContentProps) {
  const t = useTranslations('run')
  const locale = useLocale()
  const router = useRouter()
  const [data, setData] = useState<{
    kpis: DailyKpi | null
    alerts: RunAlert[]
    computedAlerts?: AlertResult[]
    runSettings?: RunSettings | null
    lastEventAt?: string | null
    previousKpis?: DailyKpi | null
    trends?: {
      dates: string[]
      revenue: number[]
      leads: number[]
      signups: number[]
      payments: number[]
      sessions: number[]
    } | null
    /** Multi-currency KPI breakdown (P1-5) */
    multiCurrencyKpis?: {
      primaryCurrency: string
      currencies: Array<{ code: string; revenueCents: number; refundsCents: number; payments: number; refunds: number }>
    } | null
    multiCurrencyPrevious?: {
      primaryCurrency: string
      currencies: Array<{ code: string; revenueCents: number; refundsCents: number; payments: number; refunds: number }>
    } | null
    /** Quota usage (P2-8) */
    quotas?: {
      tier: string
      database: { used: number; limit: number; percent: number }
      storage: { used: number; limit: number; percent: number }
      requests: { used: number; limit: number; percent: number }
    } | null
    /** Integration status (Phase 4) */
    integrations?: {
      tracking: boolean
      payments: boolean
      forms: boolean
    } | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [updatingIndustry, setUpdatingIndustry] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>(today())
  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const AUTO_REFRESH_INTERVAL = 30000 // 30 seconds
  const isToday = selectedDate === today()

  // Modal state (Run Hub Phase 4)
  const [sendPromoOpen, setSendPromoOpen] = useState(false)
  const [postUpdateOpen, setPostUpdateOpen] = useState(false)
  const [recoverAbandonedOpen, setRecoverAbandonedOpen] = useState(false)
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false)

  // Workflow outcomes state (Run Hub Phase 4 - Outcomes Loop)
  const [lastWorkflowRuns, setLastWorkflowRuns] = useState<Record<string, LastWorkflowRun>>({})

  // Fetch last workflow runs for outcome display
  const fetchLastWorkflowRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/run/workflow-runs?limit=10&_t=${Date.now()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })
      if (!res.ok) return
      const json = await res.json()
      if (!json.ok || !json.data?.runs) return

      // Group by actionId, keeping the most recent for each
      const runsByAction: Record<string, LastWorkflowRun> = {}
      for (const run of json.data.runs) {
        if (!runsByAction[run.actionId]) {
          runsByAction[run.actionId] = {
            actionId: run.actionId,
            status: run.status,
            completedAt: run.completedAt,
            result: run.result,
            outcome: run.outcome,
          }
        }
      }
      setLastWorkflowRuns(runsByAction)
    } catch {
      // Silent failure - outcomes are optional enhancement
    }
  }, [projectId])

  // Fetch workflow runs on mount and after modal closes
  useEffect(() => {
    fetchLastWorkflowRuns()
  }, [fetchLastWorkflowRuns])

  // Refresh workflow runs when any modal closes
  useEffect(() => {
    if (!sendPromoOpen && !postUpdateOpen && !recoverAbandonedOpen) {
      // Delay to allow backend to update
      const timer = setTimeout(fetchLastWorkflowRuns, 1000)
      return () => clearTimeout(timer)
    }
  }, [sendPromoOpen, postUpdateOpen, recoverAbandonedOpen, fetchLastWorkflowRuns])

  const fetchData = useCallback(async (isRefresh = false, date?: string) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    const dateParam = date || selectedDate
    try {
      const res = await fetch(`/api/projects/${projectId}/run/overview?date=${dateParam}&_t=${Date.now()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || 'Failed to load Run overview')
      }
      setData(json.data || null)
      setLastUpdated(new Date())
      onRefresh?.()
    } catch (err) {
      // P0 Trust Fix: Store translation key, not raw error message
      setError(getLocalizedErrorKey(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [projectId, onRefresh, selectedDate])

  useEffect(() => {
    fetchData(false)
    emitFunnelEventOnce(projectId, 'runhub_first_open')
  }, [fetchData, projectId])

  const handleDateChange = useCallback((newDate: string) => {
    setSelectedDate(newDate)
    // fetchData will be called via the useEffect above
  }, [])

  // EXPERT FIX: Auto-refresh only when viewing today's data
  // Refreshing historical dates is pointless - that data won't change
  useEffect(() => {
    if (autoRefresh && isToday) {
      autoRefreshIntervalRef.current = setInterval(() => {
        fetchData(true)
      }, AUTO_REFRESH_INTERVAL)
    } else {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current)
        autoRefreshIntervalRef.current = null
      }
    }

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current)
      }
    }
  }, [autoRefresh, isToday, fetchData])

  const handleRefresh = useCallback(() => {
    fetchData(true)
  }, [fetchData])

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev)
  }, [])

  const handleIndustryChange = useCallback(async (newIndustry: string) => {
    setUpdatingIndustry(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/run/overview`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry_tag: newIndustry })
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || 'Failed to update industry')
      }
      // Update local state
      setData(prev => prev ? {
        ...prev,
        runSettings: { ...prev.runSettings, industry_tag: newIndustry }
      } : null)
      toast.success(t('industry.updated'))
    } catch (err) {
      toast.error(t('industry.updateFailed'))
    } finally {
      setUpdatingIndustry(false)
    }
  }, [projectId, t])

  /**
   * Handle action button click - Run Hub Phase 1 & 4
   *
   * For navigate actions: routes to the appropriate page with filters
   * For modal actions: opens the corresponding modal (Phase 4)
   * For workflow actions: shows "Coming Soon" toast (requires backend)
   */
  const handleAction = useCallback((actionId: string, actionLabel: string) => {
    const handler = ACTION_HANDLERS[actionId]

    // If action not in registry, show coming soon
    if (!handler || !hasClientHandler(actionId)) {
      toast.info(t('comingSoonToast.title'), {
        description: t('comingSoonToast.description', { feature: actionLabel })
      })
      return
    }

    // Handle navigate actions
    if (handler.type === 'navigate') {
      const basePath = handler.to === 'run'
        ? `/project/${projectId}/run`
        : `/project/${projectId}/${handler.to}`

      // Build query string if present
      if (handler.query) {
        const params = new URLSearchParams(handler.query)
        router.push(`${basePath}?${params.toString()}`)
      } else {
        router.push(basePath)
      }
      return
    }

    // Handle modal actions (Run Hub Phase 4)
    if (handler.type === 'modal') {
      switch (handler.modal) {
        case 'send_promo':
          setSendPromoOpen(true)
          return
        case 'post_update':
          setPostUpdateOpen(true)
          return
      }
    }

    // Handle workflow actions (Run Hub Phase 4)
    if (handler.type === 'workflow') {
      // Each workflow action opens its own modal for preview + confirmation
      switch (actionId) {
        case 'recover_abandoned':
          setRecoverAbandonedOpen(true)
          return
        case 'onboard_users':
        case 'send_reminders':
        case 'send_motivation':
          // These workflows are not yet implemented
          toast.info(t('comingSoonToast.title'), {
            description: t('comingSoonToast.description', { feature: actionLabel })
          })
          return
      }
    }

    // Fallback for unhandled actions
    toast.info(t('comingSoonToast.title'), {
      description: t('comingSoonToast.description', { feature: actionLabel })
    })
  }, [projectId, router, t])

  // Extract data values (with null-safe defaults)
  const kpis = data?.kpis
  const previousKpis = data?.previousKpis
  const trends = data?.trends
  const workerAlerts = data?.alerts || []
  const computedAlerts = data?.computedAlerts || []
  const runSettings = data?.runSettings || null
  const industryTag = runSettings?.industry_tag || 'generic'
  const multiCurrencyKpis = data?.multiCurrencyKpis || null

  // Check if this is a first-run state (no data yet)
  const hasNoData = !kpis || (
    kpis.sessions === 0 &&
    kpis.leads === 0 &&
    kpis.signups === 0 &&
    kpis.payments === 0 &&
    kpis.revenueCents === 0
  )
  const hasNoAlerts = workerAlerts.length === 0 && computedAlerts.length === 0

  // Get vertical pack configuration for this industry
  // MUST be called unconditionally before any early returns (rules-of-hooks)
  const verticalPack = useMemo(() => getVerticalPack(industryTag), [industryTag])

  // Format currency value
  const currencyCode = kpis?.currencyCode || 'USD'
  const formatCurrency = (cents: number) => `${currencyCode} ${(cents / 100).toFixed(2)}`

  // Calculate conversion based on vertical pack config
  const getConversion = () => {
    if (!kpis || kpis.sessions === 0) return '—'
    const numeratorField = verticalPack.conversionNumerator
    const numerator = kpis[numeratorField] ?? 0
    return `${((numerator / kpis.sessions) * 100).toFixed(1)}%`
  }

  // Delta type for KPI comparisons (Run Hub Phase 2)
  interface KpiDelta {
    value: number
    percent: number
    direction: 'up' | 'down' | 'flat'
    isPositive: boolean // For coloring - some metrics "down" is good (e.g., refunds)
  }

  // Get KPI value and delta from data based on field
  const getKpiValue = (config: KpiCardConfig): { value: string | number; isEmpty: boolean; delta?: KpiDelta } => {
    if (!kpis) return { value: config.formatAs === 'currency' ? formatCurrency(0) : 0, isEmpty: true }

    // Special handling for conversion
    if (config.id === 'conversion') {
      const conv = getConversion()
      return { value: conv, isEmpty: conv === '—' }
    }

    const rawValue = kpis[config.field as keyof DailyKpi] as number ?? 0
    const previousValue = previousKpis?.[config.field as keyof DailyKpi] as number ?? 0

    // Calculate delta if we have previous data
    let delta: KpiDelta | undefined
    if (previousKpis && previousValue > 0) {
      const change = rawValue - previousValue
      const percentChange = (change / previousValue) * 100
      // Refunds: down is positive. Everything else: up is positive.
      const isNegativeMetric = config.field === 'refunds'
      delta = {
        value: Math.abs(change),
        percent: Math.abs(percentChange),
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
        isPositive: isNegativeMetric ? change <= 0 : change >= 0,
      }
    }

    if (config.formatAs === 'currency') {
      return { value: formatCurrency(rawValue), isEmpty: rawValue === 0, delta }
    }

    // For hideWhenZero fields, show dash instead of 0
    if (config.hideWhenZero && rawValue === 0) {
      return { value: '—', isEmpty: true }
    }

    return { value: rawValue, isEmpty: rawValue === 0, delta }
  }

  // KPI card type with delta and sparkline support
  type KpiCard = {
    id: string
    icon: IconName
    title: string
    value: string | number
    isEmpty: boolean
    delta?: KpiDelta
    sparkline?: number[] // 7-day trend data (Run Hub Phase 3)
    /** Per-currency breakdown for revenue cards (P1-5 Multi-Currency) */
    currencyBreakdown?: Array<{ code: string; revenueCents: number; payments: number }>
  }

  // Map KPI field to trend data key
  const getTrendData = (field: string): number[] | undefined => {
    if (!trends) return undefined
    switch (field) {
      case 'revenueCents': return trends.revenue
      case 'leads': return trends.leads
      case 'signups': return trends.signups
      case 'payments': return trends.payments
      case 'sessions': return trends.sessions
      default: return undefined
    }
  }

  // Build KPI cards from vertical pack config
  const kpiCards = useMemo(() => {
    const cards: KpiCard[] = []

    // Primary KPI (always first)
    const primaryValue = getKpiValue(verticalPack.primaryKpi)
    const primaryTrend = getTrendData(verticalPack.primaryKpi.field)
    // Attach multi-currency breakdown if this is a revenue KPI
    const isCurrencyField = verticalPack.primaryKpi.formatAs === 'currency'
    const breakdown = isCurrencyField && multiCurrencyKpis?.currencies?.length > 1
      ? multiCurrencyKpis.currencies
      : undefined
    cards.push({
      id: verticalPack.primaryKpi.id,
      icon: verticalPack.primaryKpi.icon,
      title: t(`kpis.${verticalPack.primaryKpi.titleKey}`),
      ...primaryValue,
      sparkline: primaryTrend,
      currencyBreakdown: breakdown,
    })

    // Secondary KPIs
    for (const kpiConfig of verticalPack.secondaryKpis) {
      const kpiValue = getKpiValue(kpiConfig)
      // Skip hideWhenZero cards that are empty (unless we want to show them)
      if (kpiConfig.hideWhenZero && kpiValue.isEmpty) continue

      const trendData = getTrendData(kpiConfig.field)
      const isSecCurrency = kpiConfig.formatAs === 'currency'
      const secBreakdown = isSecCurrency && multiCurrencyKpis?.currencies?.length > 1
        ? multiCurrencyKpis.currencies
        : undefined
      cards.push({
        id: kpiConfig.id,
        icon: kpiConfig.icon,
        title: t(`kpis.${kpiConfig.titleKey}`),
        ...kpiValue,
        sparkline: trendData,
        currencyBreakdown: secBreakdown,
      })
    }

    // Conversion (if enabled) - no sparkline for conversion rate
    if (verticalPack.showConversion) {
      const conv = getConversion()
      cards.push({
        id: 'conversion',
        icon: 'trending-up' as IconName,
        title: t('kpis.conversion'),
        value: conv,
        isEmpty: conv === '—',
      })
    }

    return cards
  }, [verticalPack, kpis, previousKpis, trends, t, currencyCode, multiCurrencyKpis])

  // Build next actions from vertical pack config
  // P0 Trust Fix: Only show actions that are actually implemented
  // Hiding unimplemented actions is better UX than showing "Coming Soon" badges
  const nextActions: NextAction[] = useMemo(() => {
    return verticalPack.actions
      .filter((action: ActionConfig) => hasClientHandler(action.id))
      .map((action: ActionConfig) => ({
        id: action.id,
        icon: action.icon,
        label: t(`actions.${action.labelKey}`),
        description: t(`actions.${action.descriptionKey}`),
      }))
  }, [verticalPack, t])

  // Helper to format outcome for display
  const formatOutcome = (run: LastWorkflowRun) => {
    if (!run.completedAt) return null

    const timeAgo = formatDistanceToNow(new Date(run.completedAt), { addSuffix: false })

    // If we have outcome with conversions, show revenue
    if (run.outcome && run.outcome.conversions > 0) {
      const amount = (run.outcome.revenueCents / 100).toFixed(0)
      return {
        text: t('workflows.lastOutcome', { amount: `${run.outcome.currency} ${amount}` }),
        timeAgo,
        hasImpact: true,
        confidence: run.outcome.confidence,
      }
    }

    // If we have result (sent emails), show that
    if (run.result && run.result.successful > 0) {
      return {
        text: t('workflows.sentTo', { count: run.result.successful }),
        timeAgo,
        hasImpact: false,
      }
    }

    return null
  }

  // Early returns MUST come AFTER all hook calls (rules-of-hooks)
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[200px] flex flex-col items-center justify-center gap-4">
        <Icon name="alert-circle" className="w-10 h-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          {t(error)}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null)
            fetchData(false)
          }}
        >
          <Icon name="refresh-cw" className="w-4 h-4 me-2" />
          {t('orders.retry')}
        </Button>
      </div>
    )
  }

  // First-run empty state
  if (hasNoData && hasNoAlerts) {
    const hasFirstEvent = !!data?.lastEventAt
    const hasTracking = data?.integrations?.tracking ?? false
    const hasStripe = data?.integrations?.payments ?? false

    // P0 Trust Fix: Context-aware reason banner
    // Determine the primary reason for no data and show actionable message
    const getEmptyReason = () => {
      if (!hasTracking) {
        return {
          icon: 'activity' as IconName,
          title: t('emptyReasons.noTracking'),
          action: t('emptyReasons.noTrackingAction'),
          href: `/builder/workspace/${projectId}?infra=api-keys`,
          color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
        }
      }
      if (!hasFirstEvent) {
        return {
          icon: 'clock' as IconName,
          title: t('emptyReasons.noEvents'),
          hint: t('emptyReasons.noEventsHint'),
          showCopyUrl: true,
          color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
        }
      }
      if (!hasStripe) {
        return {
          icon: 'credit-card' as IconName,
          title: t('emptyReasons.noPayments'),
          action: t('emptyReasons.noPaymentsAction'),
          href: `/builder/workspace/${projectId}?infra=phase3`,
          color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
        }
      }
      // All integrations ready, just no data yet
      return {
        icon: 'check-circle' as IconName,
        title: t('emptyReasons.ready'),
        hint: t('emptyReasons.readyHint'),
        showCopyUrl: true,
        color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
      }
    }

    const emptyReason = getEmptyReason()

    // Copy site URL handler
    const handleCopySiteUrl = async () => {
      // Get site URL from project data or construct it
      const siteUrl = `https://${projectId}.sheenapps.com` // Adjust based on actual URL pattern
      try {
        await navigator.clipboard.writeText(siteUrl)
        toast.success(t('emptyReasons.copied'))
      } catch {
        // Fallback for older browsers
        toast.error(t('errors.generic'))
      }
    }

    const checklistSteps = [
      { id: 'site_live', label: t('checklist.siteLive'), done: true },
      { id: 'add_tracking', label: t('checklist.addTracking'), done: hasFirstEvent || hasTracking, actionLabel: t('checklist.howTo'), actionHref: `/builder/workspace/${projectId}?infra=api-keys` },
      { id: 'first_event', label: t('checklist.firstEvent'), done: hasFirstEvent, waiting: hasTracking && !hasFirstEvent },
      { id: 'connect_stripe', label: t('checklist.connectStripe'), done: hasStripe, actionLabel: t('checklist.connect'), actionHref: `/builder/workspace/${projectId}?infra=phase3` },
    ]
    const doneCount = checklistSteps.filter(s => s.done).length

    return (
      <div className="space-y-6">
        {/* P0 Trust Fix: Context-aware reason banner */}
        <Card className={`border ${emptyReason.color}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <Icon name={emptyReason.icon} className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg">{emptyReason.title}</h3>
                {'hint' in emptyReason && emptyReason.hint && (
                  <p className="text-sm opacity-80 mt-1">{emptyReason.hint}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  {'action' in emptyReason && emptyReason.action && (
                    <Button
                      size="sm"
                      className="min-h-[36px]"
                      onClick={() => {
                        if ('href' in emptyReason && emptyReason.href) {
                          router.push(emptyReason.href)
                        }
                      }}
                    >
                      {emptyReason.action}
                    </Button>
                  )}
                  {'showCopyUrl' in emptyReason && emptyReason.showCopyUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[36px]"
                      onClick={handleCopySiteUrl}
                    >
                      <Icon name="copy" className="w-4 h-4 me-2" />
                      {t('emptyReasons.copySiteUrl')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Ready Checklist */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Icon name="list-checks" className="w-5 h-5" />
              {t('checklist.title')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('checklist.subtitle')}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs text-muted-foreground mb-1">
              {doneCount}/{checklistSteps.length}
            </div>
            {checklistSteps.map(step => (
              <div key={step.id} className="flex items-center justify-between gap-2 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {step.done ? (
                    <Icon name="check-circle" className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                  )}
                  <span className={`text-sm ${step.done ? 'text-muted-foreground line-through' : ''}`}>
                    {step.label}
                  </span>
                  {'waiting' in step && step.waiting && (
                    <span className="text-xs text-muted-foreground">
                      ({t('checklist.waiting')})
                    </span>
                  )}
                </div>
                {'actionLabel' in step && step.actionLabel && !step.done && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs shrink-0"
                    onClick={() => {
                      if ('actionHref' in step && step.actionHref) {
                        router.push(step.actionHref as string)
                      }
                    }}
                  >
                    {step.actionLabel}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Relaunch Wizard Button */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => {
              localStorage.removeItem(`run_wizard_dismissed:${projectId}`)
              window.location.reload()
            }}
          >
            <Icon name="sparkles" className="w-4 h-4 me-2" />
            {t('wizard.relaunch')}
          </Button>
        </div>

        {/* Integration Status Bar */}
        <IntegrationStatusBar integrations={data?.integrations} t={t} />

        {/* Still show the structure but in empty state */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 opacity-60">
          {kpiCards.map((card) => (
            <Card key={card.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
                  <Icon name={card.icon} className="w-4 h-4" />
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-muted-foreground/50">—</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Next Actions - always show even in empty state */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="zap" className="w-5 h-5" />
              {t('sections.nextActions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {nextActions.map((action) => (
                <Button
                  key={action.id}
                  variant="outline"
                  className="h-auto py-4 px-4 flex flex-col items-start gap-2 opacity-60 hover:opacity-80 cursor-pointer"
                  onClick={() => handleAction(action.id, action.label)}
                >
                  <div className="flex items-center gap-2">
                    <Icon name={action.icon} className="w-4 h-4" />
                    <span className="font-medium">{action.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground text-start">
                    {action.description}
                  </span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Normal state with data
  return (
    <div className="space-y-6">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left controls: Industry + Date */}
        <div className="flex items-center gap-4">
          {/* Industry selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {t('industry.label')}
            </span>
            <Select
              value={industryTag}
              onValueChange={handleIndustryChange}
              disabled={updatingIndustry}
            >
              <SelectTrigger className="w-[140px] min-h-[44px] sm:min-h-[32px] h-auto sm:h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    <div className="flex items-center gap-2">
                      <Icon name={option.icon} className="w-3.5 h-3.5" />
                      <span>{t(`industry.options.${option.value}`)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date selector */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-input">
              <Button
                variant={isToday ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleDateChange(today())}
                className={`min-h-[44px] sm:min-h-[32px] h-auto sm:h-8 px-3 rounded-none rounded-s-md text-xs ${isToday ? '' : 'hover:bg-muted'}`}
              >
                {t('dateFilter.today')}
              </Button>
              <Button
                variant={selectedDate === yesterday() ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleDateChange(yesterday())}
                className={`min-h-[44px] sm:min-h-[32px] h-auto sm:h-8 px-3 rounded-none text-xs border-x border-input ${selectedDate === yesterday() ? '' : 'hover:bg-muted'}`}
              >
                {t('dateFilter.yesterday')}
              </Button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                max={today()}
                className="min-h-[44px] sm:min-h-[32px] h-auto sm:h-8 px-2 text-xs bg-background border-0 rounded-none rounded-e-md focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {/* P2.1: Arabic-formatted date display when not Today/Yesterday */}
            {!isToday && selectedDate !== yesterday() && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {new Intl.DateTimeFormat(locale, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                }).format(new Date(selectedDate + 'T00:00:00'))}
              </span>
            )}
          </div>
        </div>

        {/* Refresh controls */}
        <div className="flex items-center gap-2">
          {/* EXPERT FIX: Show "Live" indicator when auto-refresh is active */}
          {autoRefresh && isToday && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              {t('overview.live')}
            </span>
          )}
          {/* Data Freshness Indicator - Run Hub Phase 1 */}
          <div className="hidden sm:block">
            <DataFreshnessIndicator
              lastEventAt={data?.lastEventAt}
              lastUpdated={lastUpdated}
              refreshing={refreshing}
              t={t}
            />
          </div>
          {/* Auto-refresh toggle - disabled when viewing historical dates */}
          <Button
            variant={autoRefresh && isToday ? 'default' : 'ghost'}
            size="sm"
            onClick={toggleAutoRefresh}
            disabled={!isToday}
            className={`min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] h-auto sm:h-8 px-2 ${autoRefresh && isToday ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : ''}`}
            title={!isToday ? t('overview.autoRefreshHistorical') : (autoRefresh ? t('overview.autoRefreshOn') : t('overview.autoRefreshOff'))}
          >
            <Icon name="clock" className="w-4 h-4" />
            <span className="sr-only">{autoRefresh ? t('overview.autoRefreshOn') : t('overview.autoRefreshOff')}</span>
          </Button>
          {/* Manual refresh */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] h-auto sm:h-8 px-2"
          >
            <Icon
              name="refresh-cw"
              className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
            />
            <span className="sr-only">{t('overview.refresh')}</span>
          </Button>
        </div>
      </div>

      {/* Integration Status Bar */}
      <IntegrationStatusBar integrations={data?.integrations} t={t} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
                <Icon name={card.icon} className="w-4 h-4" />
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between gap-2">
                <div className={`text-2xl font-semibold ${card.isEmpty ? 'text-muted-foreground' : ''}`}>
                  {card.value}
                </div>
                {/* Sparkline chart (Run Hub Phase 3) */}
                {card.sparkline && card.sparkline.length >= 2 && (
                  <Sparkline
                    data={card.sparkline}
                    width={60}
                    height={24}
                    color={card.delta?.isPositive !== false ? '#10b981' : '#ef4444'}
                  />
                )}
              </div>
              {/* KPI Delta indicator (Run Hub Phase 2) */}
              {card.delta && card.delta.direction !== 'flat' && card.delta.percent >= 1 && (
                <div className={`flex items-center gap-1 mt-1 text-xs ${
                  card.delta.isPositive ? 'text-emerald-600' : 'text-red-500'
                }`}>
                  <Icon
                    name={card.delta.direction === 'up' ? 'trending-up' : 'trending-down'}
                    className="w-3 h-3"
                  />
                  <span>
                    {card.delta.direction === 'up' ? '+' : '-'}{Math.round(card.delta.percent)}%
                  </span>
                  <span className="text-muted-foreground">{t('kpis.vsLastWeek')}</span>
                </div>
              )}
              {/* Multi-currency breakdown (P1-5) */}
              {card.currencyBreakdown && card.currencyBreakdown.length > 1 && (
                <div className="mt-2 pt-2 border-t border-border space-y-1">
                  {card.currencyBreakdown.map((cb) => (
                    <div key={cb.code} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{cb.code}</span>
                      <span className="font-medium">{(cb.revenueCents / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Needs Attention */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="alert-circle" className="w-5 h-5" />
            {t('sections.needsAttention')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasNoAlerts ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground py-2">
              <Icon name="check-circle" className="w-5 h-5 text-emerald-500" />
              <span>{t('alerts.noAlerts')}</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Computed alerts with action buttons (Run Hub Phase 2) */}
              {computedAlerts.map((alert, idx) => (
                <div
                  key={`computed-${alert.type}-${idx}`}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <Icon name={alert.icon} className={`w-5 h-5 mt-0.5 ${alert.colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {t(alert.titleKey, alert.titleParams as Record<string, string | number>)}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {alert.action && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            if (alert.action?.actionId) {
                              handleAction(alert.action.actionId, t(alert.action.labelKey))
                            } else if (alert.action?.navigateTo) {
                              router.push(`/project/${projectId}/${alert.action.navigateTo}`)
                            }
                          }}
                        >
                          {t(alert.action.labelKey)}
                        </Button>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {alert.severity === 'high' ? t('alerts.severityHigh') : t('alerts.severityMedium')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {/* Worker-computed alerts (existing) */}
              {workerAlerts.map((alert, idx) => {
                const config = getAlertConfig(alert.type)
                const timeAgo = formatDistanceToNow(new Date(alert.occurredAt), { addSuffix: true })

                return (
                  <div
                    key={`worker-${alert.type}-${idx}`}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <Icon name={config.icon} className={`w-5 h-5 mt-0.5 ${config.colorClass}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{alert.title}</div>
                      {alert.description && (
                        <div className="text-sm text-muted-foreground">{alert.description}</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">{timeAgo}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Actions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Icon name="zap" className="w-5 h-5" />
            {t('sections.nextActions')}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setHistoryDrawerOpen(true)}
          >
            <Icon name="clock" className="w-3.5 h-3.5" />
            {t('workflows.viewHistory')}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {nextActions.map((action) => {
              const lastRun = lastWorkflowRuns[action.id]
              const outcome = lastRun ? formatOutcome(lastRun) : null
              return (
                <Button
                  key={action.id}
                  variant="outline"
                  className="h-auto py-4 px-4 flex flex-col items-start gap-2 hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleAction(action.id, action.label)}
                >
                  <div className="flex items-center gap-2">
                    <Icon name={action.icon} className="w-4 h-4" />
                    <span className="font-medium">{action.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground text-start">
                    {action.description}
                  </span>
                  {/* Workflow outcome indicator (Run Hub Phase 4) */}
                  {outcome && (
                    <div className={`flex items-center gap-1.5 mt-1 text-[10px] ${
                      outcome.hasImpact ? 'text-emerald-600' : 'text-muted-foreground'
                    }`}>
                      {outcome.hasImpact && (
                        <Icon name="trending-up" className="w-3 h-3" />
                      )}
                      <span className="font-medium">{outcome.text}</span>
                      <span className="text-muted-foreground">• {outcome.timeAgo}</span>
                      {outcome.confidence === 'medium' && (
                        <span className="text-muted-foreground/60">({t('workflows.impactEstimated')})</span>
                      )}
                    </div>
                  )}
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quota Usage (P2-8) */}
      {data?.quotas && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Icon name="bar-chart" className="w-4 h-4" />
              {t('quotas.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Database */}
              <QuotaBar
                label={t('quotas.database')}
                used={data.quotas.database.used}
                limit={data.quotas.database.limit}
                percent={data.quotas.database.percent}
                formatValue={(v) => `${(v / (1024 * 1024)).toFixed(1)} MB`}
              />
              {/* Storage */}
              <QuotaBar
                label={t('quotas.storage')}
                used={data.quotas.storage.used}
                limit={data.quotas.storage.limit}
                percent={data.quotas.storage.percent}
                formatValue={(v) => `${(v / (1024 * 1024)).toFixed(1)} MB`}
              />
              {/* Requests */}
              <QuotaBar
                label={t('quotas.requests')}
                used={data.quotas.requests.used}
                limit={data.quotas.requests.limit}
                percent={data.quotas.requests.percent}
                formatValue={(v) => v.toLocaleString()}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Modals (Run Hub Phase 4) */}
      <SendPromoModal
        open={sendPromoOpen}
        onOpenChange={setSendPromoOpen}
        projectId={projectId}
      />
      <PostUpdateModal
        open={postUpdateOpen}
        onOpenChange={setPostUpdateOpen}
        projectId={projectId}
      />
      <RecoverAbandonedModal
        open={recoverAbandonedOpen}
        onOpenChange={setRecoverAbandonedOpen}
        projectId={projectId}
      />
      <WorkflowHistoryDrawer
        open={historyDrawerOpen}
        onOpenChange={setHistoryDrawerOpen}
        projectId={projectId}
        translations={{
          title: t('workflows.historyTitle'),
          empty: t('workflows.historyEmpty'),
          recipients: t('workflows.recipients'),
          sent: t('workflows.sent'),
          failed: t('workflows.historyFailed'),
          conversions: t('workflows.conversions'),
          revenue: t('workflows.revenue'),
          confidence: t('workflows.confidence'),
          loadMore: t('workflows.loadMore'),
          runAgain: t('workflows.runAgain'),
        }}
      />
    </div>
  )
}
