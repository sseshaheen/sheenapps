/**
 * Admin Advisor Matching Dashboard Page
 *
 * Following CLAUDE.md patterns:
 * - Server-side locale handling with next-intl
 * - Admin role-based authentication
 * - Mobile-first responsive layout
 * - Comprehensive admin matching oversight
 */

import { notFound } from 'next/navigation'
import { loadNamespace } from '@/i18n/message-loader'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { PoolStatusDashboard } from '@/components/admin/advisor-matching/pool-status-dashboard'
import { SystemHealthMonitor } from '@/components/admin/advisor-matching/system-health-monitor'
import { ActiveMatchesTable } from '@/components/admin/advisor-matching/active-matches-table'
import { ManualAssignmentDialog } from '@/components/admin/advisor-matching/manual-assignment-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

interface AdminAdvisorMatchingPageProps {
  params: Promise<{ locale: string }>
}

export default async function AdminAdvisorMatchingPage(props: AdminAdvisorMatchingPageProps) {
  const params = await props.params;

  const {
    locale
  } = params;

  // Load translations
  const messages = await loadNamespace(locale, 'admin')
  if (Object.keys(messages).length === 0) {
    notFound()
  }

  // Verify admin authentication
  const adminSession = await AdminAuthService.getAdminSession()
  if (!adminSession) {
    notFound()
  }

  // Admin has at least basic admin role
  const hasAdminAccess = adminSession.role === 'admin' || adminSession.role === 'super_admin'
  if (!hasAdminAccess) {
    notFound()
  }

  // Extract translations for components
  const translations = {
    pageTitle: messages.advisorMatching.pageTitle || 'Advisor Matching Dashboard',
    description: messages.advisorMatching.description || 'Monitor and manage the intelligent advisor matching system',
    overview: messages.advisorMatching.overview || 'Overview',
    systemHealthTitle: messages.advisorMatching.systemHealth || 'System Health',
    activeMatchesTitle: messages.advisorMatching.activeMatches || 'Active Matches',
    emergencyAssignment: messages.advisorMatching.emergencyAssignment || 'Emergency Assignment',
    quickActions: messages.advisorMatching.quickActions || 'Quick Actions',

    // Pool status translations
    poolStatus: {
      title: messages.advisorMatching.poolStatus?.title || 'Advisor Pool Status',
      totalAdvisors: messages.advisorMatching.poolStatus?.totalAdvisors || 'Total Advisors',
      activeAdvisors: messages.advisorMatching.poolStatus?.activeAdvisors || 'Active Advisors',
      availableAdvisors: messages.advisorMatching.poolStatus?.availableAdvisors || 'Available Advisors',
      atCapacity: messages.advisorMatching.poolStatus?.atCapacity || 'At Capacity',
      onBreak: messages.advisorMatching.poolStatus?.onBreak || 'On Break',
      utilizationRate: messages.advisorMatching.poolStatus?.utilizationRate || 'Utilization Rate',
      averageResponseTime: messages.advisorMatching.poolStatus?.averageResponseTime || 'Avg Response Time',
      refreshData: messages.advisorMatching.poolStatus?.refreshData || 'Refresh Data',
      lastUpdated: messages.advisorMatching.poolStatus?.lastUpdated || 'Last updated',
      advisorDistribution: messages.advisorMatching.poolStatus?.advisorDistribution || 'Advisor Distribution',
      status: {
        healthy: messages.advisorMatching.poolStatus?.status?.healthy || 'Healthy',
        warning: messages.advisorMatching.poolStatus?.status?.warning || 'Warning',
        critical: messages.advisorMatching.poolStatus?.status?.critical || 'Critical'
      },
      metrics: {
        totalProjects: messages.advisorMatching.poolStatus?.metrics?.totalProjects || 'Total Projects',
        avgProjectsPerAdvisor: messages.advisorMatching.poolStatus?.metrics?.avgProjectsPerAdvisor || 'Avg Projects/Advisor',
        peakHours: messages.advisorMatching.poolStatus?.metrics?.peakHours || 'Peak Hours',
        offPeakHours: messages.advisorMatching.poolStatus?.metrics?.offPeakHours || 'Off-Peak Hours'
      }
    },

    // System health translations
    systemHealth: {
      title: messages.advisorMatching.systemHealth?.title || 'System Health Monitor',
      systemStatus: messages.advisorMatching.systemHealth?.systemStatus || 'System Status',
      uptime: messages.advisorMatching.systemHealth?.uptime || 'Uptime',
      queueDepth: messages.advisorMatching.systemHealth?.queueDepth || 'Queue Depth',
      avgResponseTime: messages.advisorMatching.systemHealth?.avgResponseTime || 'Avg Response Time',
      errorRate: messages.advisorMatching.systemHealth?.errorRate || 'Error Rate',
      lastCheck: messages.advisorMatching.systemHealth?.lastCheck || 'Last Check',
      refreshData: messages.advisorMatching.systemHealth?.refreshData || 'Refresh Data',
      criticalAlerts: messages.advisorMatching.systemHealth?.criticalAlerts || 'Critical Alerts',
      warningAlerts: messages.advisorMatching.systemHealth?.warningAlerts || 'Warning Alerts',
      performance: messages.advisorMatching.systemHealth?.performance || 'Performance Metrics',
      metrics: {
        healthy: messages.advisorMatching.systemHealth?.metrics?.healthy || 'Healthy',
        warning: messages.advisorMatching.systemHealth?.metrics?.warning || 'Warning',
        critical: messages.advisorMatching.systemHealth?.metrics?.critical || 'Critical'
      },
      alerts: {
        highQueueDepth: messages.advisorMatching.systemHealth?.alerts?.highQueueDepth || 'High queue depth detected',
        slowResponseTime: messages.advisorMatching.systemHealth?.alerts?.slowResponseTime || 'Response times are slower than normal',
        highErrorRate: messages.advisorMatching.systemHealth?.alerts?.highErrorRate || 'Error rate is above normal threshold',
        systemOverload: messages.advisorMatching.systemHealth?.alerts?.systemOverload || 'System is experiencing high load'
      }
    },

    // Active matches translations
    activeMatches: {
      title: messages.advisorMatching.activeMatches?.title || 'Active Matches',
      searchPlaceholder: messages.advisorMatching.activeMatches?.searchPlaceholder || 'Search matches...',
      filterByStatus: messages.advisorMatching.activeMatches?.filterByStatus || 'Filter by Status',
      allStatuses: messages.advisorMatching.activeMatches?.allStatuses || 'All Statuses',
      refresh: messages.advisorMatching.activeMatches?.refresh || 'Refresh',
      noMatches: messages.advisorMatching.activeMatches?.noMatches || 'No active matches found',
      project: messages.advisorMatching.activeMatches?.project || 'Project',
      advisor: messages.advisorMatching.activeMatches?.advisor || 'Advisor',
      client: messages.advisorMatching.activeMatches?.client || 'Client',
      status: messages.advisorMatching.activeMatches?.status || 'Status',
      created: messages.advisorMatching.activeMatches?.created || 'Created',
      expires: messages.advisorMatching.activeMatches?.expires || 'Expires',
      actions: messages.advisorMatching.activeMatches?.actions || 'Actions',
      viewDetails: messages.advisorMatching.activeMatches?.viewDetails || 'View Details',
      columns: {
        matchId: messages.advisorMatching.activeMatches?.columns?.matchId || 'Match ID',
        projectName: messages.advisorMatching.activeMatches?.columns?.projectName || 'Project',
        clientName: messages.advisorMatching.activeMatches?.columns?.clientName || 'Client',
        advisorName: messages.advisorMatching.activeMatches?.columns?.advisorName || 'Advisor',
        status: messages.advisorMatching.activeMatches?.columns?.status || 'Status',
        createdAt: messages.advisorMatching.activeMatches?.columns?.createdAt || 'Created',
        expiresAt: messages.advisorMatching.activeMatches?.columns?.expiresAt || 'Expires'
      },
      statusLabels: {
        pending: messages.advisorMatching.activeMatches?.statusLabels?.pending || 'Pending',
        matched: messages.advisorMatching.activeMatches?.statusLabels?.matched || 'Matched',
        client_approved: messages.advisorMatching.activeMatches?.statusLabels?.client_approved || 'Client Approved',
        client_declined: messages.advisorMatching.activeMatches?.statusLabels?.client_declined || 'Client Declined',
        advisor_accepted: messages.advisorMatching.activeMatches?.statusLabels?.advisor_accepted || 'Advisor Accepted',
        advisor_declined: messages.advisorMatching.activeMatches?.statusLabels?.advisor_declined || 'Advisor Declined',
        finalized: messages.advisorMatching.activeMatches?.statusLabels?.finalized || 'Finalized',
        expired: messages.advisorMatching.activeMatches?.statusLabels?.expired || 'Expired'
      },
      timings: {
        justNow: messages.advisorMatching.activeMatches?.timings?.justNow || 'just now',
        minutesAgo: messages.advisorMatching.activeMatches?.timings?.minutesAgo || 'min ago',
        hoursAgo: messages.advisorMatching.activeMatches?.timings?.hoursAgo || 'h ago',
        daysAgo: messages.advisorMatching.activeMatches?.timings?.daysAgo || 'd ago'
      }
    },

    // Manual assignment translations
    manualAssignment: {
      title: messages.advisorMatching.manualAssignment?.title || 'Emergency Manual Assignment',
      selectProject: messages.advisorMatching.manualAssignment?.selectProject || 'Select Project',
      selectAdvisor: messages.advisorMatching.manualAssignment?.selectAdvisor || 'Select Advisor',
      assignmentReason: messages.advisorMatching.manualAssignment?.assignmentReason || 'Assignment Reason',
      reasonPlaceholder: messages.advisorMatching.manualAssignment?.reasonPlaceholder || 'Explain why this manual assignment is necessary...',
      bypassAvailability: messages.advisorMatching.manualAssignment?.bypassAvailability || 'Bypass Availability Rules',
      bypassDescription: messages.advisorMatching.manualAssignment?.bypassDescription || 'Override advisor availability and capacity restrictions',
      warnings: messages.advisorMatching.manualAssignment?.warnings || 'Warnings',
      violations: messages.advisorMatching.manualAssignment?.violations || 'Rule Violations',
      assign: messages.advisorMatching.manualAssignment?.assign || 'Create Assignment',
      cancel: messages.advisorMatching.manualAssignment?.cancel || 'Cancel',
      assignmentSuccess: messages.advisorMatching.manualAssignment?.assignmentSuccess || 'Assignment created successfully',
      assignmentFailed: messages.advisorMatching.manualAssignment?.assignmentFailed || 'Assignment failed',
      validationErrors: {
        projectRequired: messages.advisorMatching.manualAssignment?.validationErrors?.projectRequired || 'Please select a project',
        advisorRequired: messages.advisorMatching.manualAssignment?.validationErrors?.advisorRequired || 'Please select an advisor',
        reasonTooShort: messages.advisorMatching.manualAssignment?.validationErrors?.reasonTooShort || 'Reason must be at least 20 characters',
        hasViolations: messages.advisorMatching.manualAssignment?.validationErrors?.hasViolations || 'Cannot assign due to rule violations'
      },
      eligibility: {
        available: messages.advisorMatching.manualAssignment?.eligibility?.available || 'Available',
        atCapacity: messages.advisorMatching.manualAssignment?.eligibility?.atCapacity || 'At Capacity',
        unavailable: messages.advisorMatching.manualAssignment?.eligibility?.unavailable || 'Unavailable',
        cooldown: messages.advisorMatching.manualAssignment?.eligibility?.cooldown || 'In Cooldown',
        neverAssign: messages.advisorMatching.manualAssignment?.eligibility?.neverAssign || 'Never Assign',
        preferred: messages.advisorMatching.manualAssignment?.eligibility?.preferred || 'Preferred'
      }
    }
  }

  // Mock data for manual assignment (backend team needs to implement these endpoints)
  const mockProjects = [
    {
      id: 'proj-1',
      name: 'E-commerce Platform',
      description: 'Building a modern e-commerce solution',
      client_name: 'TechCorp Inc.',
      created_at: new Date().toISOString()
    }
  ]

  const mockAdvisors = [
    {
      id: 'advisor-1',
      name: 'Sarah Johnson',
      email: 'sarah@example.com',
      specializations: ['React', 'Node.js', 'E-commerce'],
      is_available: true,
      active_projects: 2,
      max_concurrent_projects: 5,
      admin_preferences: { preferred: true }
    }
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{translations.pageTitle}</h1>
            <p className="text-muted-foreground mt-1">{translations.description}</p>
          </div>

          <div className="flex gap-3">
            <ManualAssignmentDialog
              projects={mockProjects}
              advisors={mockAdvisors}
              translations={translations.manualAssignment}
              trigger={
                <Button className="gap-2">
                  <Icon name="user-plus" className="h-4 w-4" />
                  {translations.emergencyAssignment}
                </Button>
              }
            />
          </div>
        </div>

        {/* Quick Actions Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">{translations.quickActions}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Button variant="outline" className="justify-start gap-2">
                <Icon name="users" className="h-4 w-4" />
                View All Advisors
              </Button>
              <Button variant="outline" className="justify-start gap-2">
                <Icon name="folder" className="h-4 w-4" />
                Manage Projects
              </Button>
              <Button variant="outline" className="justify-start gap-2">
                <Icon name="settings" className="h-4 w-4" />
                Matching Rules
              </Button>
              <Button variant="outline" className="justify-start gap-2">
                <Icon name="bar-chart" className="h-4 w-4" />
                View Analytics
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Dashboard Grid */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left Column */}
          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-4">{translations.overview}</h2>
              <PoolStatusDashboard translations={translations.poolStatus} />
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-4">{translations.systemHealthTitle}</h2>
              <SystemHealthMonitor translations={translations.systemHealth} />
            </section>
          </div>
        </div>

        {/* Full Width Active Matches */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-4">{translations.activeMatchesTitle}</h2>
          <ActiveMatchesTable translations={translations.activeMatches} />
        </section>
      </div>
    </div>
  )
}