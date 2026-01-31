/**
 * In-House Revenue Admin
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface RevenueSummary {
  mrr_cents: number
  arr_cents: number
  customer_count: number
  project_count: number
  avg_revenue_per_project_cents: number
}

interface RevenuePlanRow {
  plan_key: string
  display_name?: string | null
  mrr_cents: number
  customer_count: number
}

interface RevenueProjectRow {
  project_id: string
  project_name: string
  mrr_cents: number
  subscriptions: number
}

interface ChurnStats {
  period: string
  active_count: number
  churned_count: number
  churn_rate: number
}

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`

export function InhouseRevenueAdmin() {
  const [summary, setSummary] = useState<RevenueSummary | null>(null)
  const [plans, setPlans] = useState<RevenuePlanRow[]>([])
  const [projects, setProjects] = useState<RevenueProjectRow[]>([])
  const [churn, setChurn] = useState<ChurnStats | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, planRes, projectRes, churnRes] = await Promise.all([
        fetch('/api/admin/inhouse/revenue/summary'),
        fetch('/api/admin/inhouse/revenue/by-plan'),
        fetch('/api/admin/inhouse/revenue/top-projects'),
        fetch('/api/admin/inhouse/revenue/churn'),
      ])

      if (summaryRes.ok) {
        const data = await summaryRes.json()
        setSummary(data.data || null)
      }
      if (planRes.ok) {
        const data = await planRes.json()
        setPlans(data.data?.plans || [])
      }
      if (projectRes.ok) {
        const data = await projectRes.json()
        setProjects(data.data?.projects || [])
      }
      if (churnRes.ok) {
        const data = await churnRes.json()
        setChurn(data.data || null)
      }
    } catch (error) {
      console.error('Failed to load revenue:', error)
      toast.error('Failed to load revenue data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Revenue Summary</CardTitle>
          <CardDescription>Active subscription totals for In-House Mode owners</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-end">
          <Button variant="outline" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : summary ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">MRR (approx)</div>
                <div className="text-lg font-semibold">{formatCurrency(summary.mrr_cents)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">ARR (approx)</div>
                <div className="text-lg font-semibold">{formatCurrency(summary.arr_cents)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Avg / project</div>
                <div className="text-lg font-semibold">{formatCurrency(summary.avg_revenue_per_project_cents)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Paying customers</div>
                <div className="text-lg font-semibold">{summary.customer_count}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">In-house projects</div>
                <div className="text-lg font-semibold">{summary.project_count}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No revenue data</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revenue by Plan</CardTitle>
          <CardDescription>Active subscriptions grouped by plan</CardDescription>
        </CardHeader>
        <CardContent>
          {plans.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>MRR</TableHead>
                  <TableHead>Customers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.plan_key}>
                    <TableCell>{plan.display_name || plan.plan_key}</TableCell>
                    <TableCell>{formatCurrency(Math.round(Number(plan.mrr_cents || 0)))}</TableCell>
                    <TableCell>{plan.customer_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No plan data</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Projects</CardTitle>
          <CardDescription>Highest MRR in-house projects (owner-based)</CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>MRR</TableHead>
                  <TableHead>Subscriptions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.project_id}>
                    <TableCell>{project.project_name}</TableCell>
                    <TableCell>{formatCurrency(Math.round(Number(project.mrr_cents || 0)))}</TableCell>
                    <TableCell>{project.subscriptions}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No project data</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Churn</CardTitle>
          <CardDescription>Churned customers in the current period</CardDescription>
        </CardHeader>
        <CardContent>
          {churn ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Active</div>
                <div className="text-lg font-semibold">{churn.active_count}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Churned</div>
                <div className="text-lg font-semibold">{churn.churned_count}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Churn rate</div>
                <div className="text-lg font-semibold">{(churn.churn_rate * 100).toFixed(2)}%</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No churn data</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
