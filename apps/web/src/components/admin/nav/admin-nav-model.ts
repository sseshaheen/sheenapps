/**
 * Shared admin navigation model
 * Defines nav structure used by both desktop and mobile navigation
 */

export type AdminRole = 'admin' | 'super_admin'

export type NavItemDef = {
  label: string
  href: string
  icon: string // Icon name from lucide-react
  permission?: string
  alwaysVisible?: boolean
}

export type NavSectionDef = {
  label: string
  items: NavItemDef[]
  /** If true, adds refund count badge to Finance item */
  hasRefundBadge?: boolean
}

/**
 * Central navigation section definitions
 * Icons are string keys that components map to actual Lucide components
 */
export const NAV_SECTIONS: NavSectionDef[] = [
  {
    label: 'Core Operations',
    hasRefundBadge: true,
    items: [
      { label: 'Dashboard', href: '/admin', icon: 'Shield', alwaysVisible: true },
      { label: 'Users', href: '/admin/users-management', icon: 'Users', permission: 'users.read' },
      { label: 'Finance', href: '/admin/finance', icon: 'DollarSign', permission: 'finance.read' },
    ],
  },
  {
    label: 'Management',
    items: [
      { label: 'Advisors', href: '/admin/advisors', icon: 'UserCheck', permission: 'advisors.read' },
      { label: 'Support', href: '/admin/support', icon: 'Headphones', permission: 'support.read' },
    ],
  },
  {
    label: 'Business Intelligence',
    items: [
      { label: 'Promotions', href: '/admin/promotions', icon: 'Tags', permission: 'promotions.read' },
      { label: 'Pricing', href: '/admin/pricing', icon: 'Package', permission: 'pricing.read' },
      { label: 'Voice Analytics', href: '/admin/voice-analytics', icon: 'Mic', permission: 'voice_analytics.read' },
    ],
  },
  {
    label: 'In-House',
    items: [
      { label: 'Projects', href: '/admin/inhouse/projects', icon: 'FolderOpen', permission: 'inhouse.read' },
      { label: 'Activity', href: '/admin/inhouse/activity', icon: 'Activity', permission: 'inhouse.read' },
      { label: 'AI Usage', href: '/admin/inhouse/ai', icon: 'Sparkles', permission: 'inhouse.read' },
      { label: 'Realtime', href: '/admin/inhouse/realtime', icon: 'Radio', permission: 'inhouse.read' },
      { label: 'Notifications', href: '/admin/inhouse/notifications', icon: 'Bell', permission: 'inhouse.read' },
      { label: 'Backups', href: '/admin/inhouse/backups', icon: 'Database', permission: 'inhouse.read' },
      { label: 'Jobs', href: '/admin/inhouse/jobs', icon: 'Clock', permission: 'inhouse.read' },
      { label: 'Workflows', href: '/admin/inhouse/workflows', icon: 'Workflow', permission: 'inhouse.read' },
      { label: 'Emails', href: '/admin/inhouse/emails', icon: 'Mail', permission: 'inhouse.read' },
      { label: 'Inbox', href: '/admin/inhouse/inbox', icon: 'Inbox', permission: 'inhouse.read' },
      { label: 'Domains', href: '/admin/inhouse/domains', icon: 'Globe', permission: 'inhouse.read' },
      { label: 'Storage', href: '/admin/inhouse/storage', icon: 'HardDrive', permission: 'inhouse.read' },
      { label: 'Payments', href: '/admin/inhouse/payments', icon: 'DollarSign', permission: 'inhouse.read' },
      { label: 'Revenue', href: '/admin/inhouse/revenue', icon: 'TrendingUp', permission: 'inhouse.read' },
      { label: 'Monitoring', href: '/admin/inhouse/monitoring', icon: 'Gauge', permission: 'inhouse.read' },
      { label: 'KPI Health', href: '/admin/inhouse/kpi-health', icon: 'HeartPulse', permission: 'inhouse.read' },
      { label: 'Alerts', href: '/admin/inhouse/alerts', icon: 'AlertTriangle', permission: 'inhouse.read' },
      { label: 'Usage', href: '/admin/inhouse/usage', icon: 'BarChart3', permission: 'inhouse.read' },
      { label: 'Quotas', href: '/admin/inhouse/quotas', icon: 'Gauge', permission: 'inhouse.read' },
      { label: 'Analytics', href: '/admin/inhouse/analytics', icon: 'LineChart', permission: 'inhouse.read' },
      { label: 'Business Events', href: '/admin/inhouse/business-events', icon: 'Zap', permission: 'inhouse.read' },
      { label: 'Auth', href: '/admin/inhouse/auth', icon: 'KeyRound', permission: 'inhouse.read' },
      { label: 'Secrets', href: '/admin/inhouse/secrets', icon: 'Lock', permission: 'inhouse.read' },
      { label: 'Feature Flags', href: '/admin/inhouse/flags', icon: 'Flag', permission: 'inhouse.read' },
      { label: 'Connectors', href: '/admin/inhouse/connectors', icon: 'Plug', permission: 'inhouse.read' },
      { label: 'Edge Functions', href: '/admin/inhouse/edge-functions', icon: 'Zap', permission: 'inhouse.read' },
      { label: 'AI Assistant', href: '/admin/inhouse/ai-assistant', icon: 'Bot', permission: 'inhouse.read' },
    ],
  },
  {
    label: 'Security & Compliance',
    items: [
      { label: 'Trust & Safety', href: '/admin/trust-safety', icon: 'Shield', permission: 'violations.enforce' },
      { label: 'Audit Logs', href: '/admin/audit', icon: 'FileText', permission: 'audit.read' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'In-House Pulse', href: '/admin/inhouse-pulse', icon: 'Activity', permission: 'admin.read' },
      { label: 'Performance', href: '/admin/performance', icon: 'Gauge', permission: 'analytics.read' },
      { label: 'Build Logs', href: '/admin/build-logs', icon: 'Terminal', permission: 'logs.read' },
      { label: 'Unified Logs', href: '/admin/unified-logs', icon: 'Server', permission: 'logs.read' },
      { label: 'Admin Users', href: '/admin/admin-users', icon: 'Settings', permission: 'super_admin_only' },
      { label: 'API Test', href: '/admin/test-integration', icon: 'TestTube', alwaysVisible: true },
    ],
  },
]

/**
 * Check if user has permission for an item
 */
export function canSeeItem(
  item: NavItemDef,
  userRole: AdminRole,
  permissions: string[]
): boolean {
  if (item.alwaysVisible) return true
  if (userRole === 'super_admin') return true
  if (item.permission === 'super_admin_only') return false
  if (!item.permission) return true
  return permissions.includes(item.permission)
}

/**
 * Build filtered nav sections based on user permissions
 */
export function buildVisibleNavSections(
  userRole: AdminRole,
  permissions: string[],
  refundCount: number
): Array<{
  label: string
  items: Array<NavItemDef & { badge?: number }>
}> {
  return NAV_SECTIONS.map((section) => {
    const visibleItems = section.items
      .filter((item) => canSeeItem(item, userRole, permissions))
      .map((item) => ({
        ...item,
        badge: section.hasRefundBadge && item.href === '/admin/finance' && refundCount > 0
          ? refundCount
          : undefined,
      }))

    return {
      label: section.label,
      items: visibleItems,
    }
  }).filter((section) => section.items.length > 0)
}
