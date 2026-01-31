/**
 * Enhanced Admin Navigation Component
 * Implements server-driven navigation with permission-based visibility
 * Includes two-person approval notification bell
 */

'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useAdminNav } from './hooks/useAdminNav'
import { ApprovalBell } from './nav/ApprovalBell'
import type { PendingApproval } from './hooks/usePendingApprovals'

interface AdminNavigationProps {
  userEmail: string
  userRole: 'admin' | 'super_admin'
  permissions: string[]
}

export function AdminNavigation({ userEmail, userRole, permissions }: AdminNavigationProps) {
  const pathname = usePathname()
  const router = useRouter()

  const {
    navSections,
    pendingApprovals,
    urgentApprovals,
    totalNotifications,
    loadingApprovals,
    lastUpdatedAt,
    approvalsError,
  } = useAdminNav({ userRole, permissions })

  // Helper to check if path is active (handles subpages)
  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const handleApprovalClick = (approval: PendingApproval) => {
    // Navigate to the appropriate approval page based on action type
    const href = approval.action.includes('refund')
      ? `/admin/finance/approvals/${approval.id}`
      : `/admin/approvals/${approval.id}`
    router.push(href)
  }

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left side - Logo and main navigation */}
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/admin" className="font-bold text-xl text-gray-900">
                Admin Panel
              </Link>
            </div>

            {/* Desktop navigation */}
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navSections.map((section) => {
                if (section.items.length === 0) return null

                return (
                  <DropdownMenu key={section.label}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className={cn(
                          'inline-flex items-center px-1 pt-1 text-sm font-medium',
                          section.items.some(item => isActive(item.href))
                            ? 'border-b-2 border-blue-500 text-gray-900'
                            : 'text-gray-500 hover:text-gray-700'
                        )}
                      >
                        {section.label}
                        <ChevronDown className="ml-1 h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {section.items.map((item) => {
                        const Icon = item.icon
                        return (
                          <DropdownMenuItem key={item.href} asChild>
                            <Link
                              href={item.href}
                              className="flex items-center justify-between w-full"
                            >
                              <div className="flex items-center">
                                <Icon className="h-4 w-4" />
                                <span className="ml-2">{item.label}</span>
                              </div>
                              {item.badge && (
                                <Badge variant="destructive" className="ml-2">
                                  {item.badge}
                                </Badge>
                              )}
                            </Link>
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              })}
            </div>
          </div>

          {/* Right side - Notifications and user menu */}
          <div className="flex items-center space-x-4">
            {/* Two-Person Approval Notification Bell */}
            <ApprovalBell
              totalNotifications={totalNotifications}
              urgentCount={urgentApprovals.length}
              loading={loadingApprovals}
              approvals={pendingApprovals}
              lastUpdatedAt={lastUpdatedAt}
              error={approvalsError}
              onApprovalClick={handleApprovalClick}
            />

            {/* User info and sign out */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">{userEmail}</span>
              <Badge variant={userRole === 'super_admin' ? 'default' : 'secondary'}>
                {userRole === 'super_admin' ? 'Super Admin' : 'Admin'}
              </Badge>
            </div>

            <form action="/api/admin/auth/logout" method="POST" className="inline">
              <Button type="submit" variant="outline" size="sm">
                Sign Out
              </Button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  )
}
