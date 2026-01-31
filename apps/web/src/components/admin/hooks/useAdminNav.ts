'use client'

import { useMemo } from 'react'
import { usePendingApprovals } from './usePendingApprovals'
import { buildVisibleNavSections, type AdminRole } from '../nav/admin-nav-model'
import { getIcon } from '../nav/icon-map'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: number
}

export interface NavSection {
  label: string
  items: NavItem[]
}

interface UseAdminNavProps {
  userRole: AdminRole
  permissions: string[]
}

/**
 * Hook that provides navigation sections with icons and badges.
 * Combines the nav model with pending approvals data.
 * Use this in both desktop and mobile navigation components.
 */
export function useAdminNav({ userRole, permissions }: UseAdminNavProps) {
  const {
    pendingApprovals,
    urgentApprovals,
    refundCount,
    totalNotifications,
    loading: loadingApprovals,
    lastUpdatedAt,
    error: approvalsError,
  } = usePendingApprovals()

  const navSections = useMemo<NavSection[]>(() => {
    const sections = buildVisibleNavSections(userRole, permissions, refundCount)

    return sections.map((section) => ({
      label: section.label,
      items: section.items.map((item) => ({
        label: item.label,
        href: item.href,
        icon: getIcon(item.icon),
        badge: item.badge,
      })),
    }))
  }, [userRole, permissions, refundCount])

  return {
    navSections,
    pendingApprovals,
    urgentApprovals,
    totalNotifications,
    loadingApprovals,
    lastUpdatedAt,
    approvalsError,
  }
}
