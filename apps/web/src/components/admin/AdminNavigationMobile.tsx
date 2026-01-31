/**
 * Mobile-Responsive Admin Navigation Component
 * Implements server-driven navigation with permission-based visibility
 * Includes hamburger menu, mobile drawer, and responsive notification bell
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, Menu, X, LogOut } from 'lucide-react'
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

interface AdminNavigationMobileProps {
  userEmail: string
  userRole: 'admin' | 'super_admin'
  permissions: string[]
}

export function AdminNavigationMobile({ userEmail, userRole, permissions }: AdminNavigationMobileProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

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
    setIsMobileMenuOpen(false)
    const href = approval.action.includes('refund')
      ? `/admin/finance/approvals/${approval.id}`
      : `/admin/approvals/${approval.id}`
    router.push(href)
  }

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isMobileMenuOpen])

  // Close mobile menu on Escape key
  useEffect(() => {
    if (!isMobileMenuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMobileMenuOpen])

  return (
    <>
      {/* Main Navigation Bar */}
      <nav className="bg-white shadow-sm border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Left side - Mobile menu and Logo */}
            <div className="flex items-center">
              {/* Mobile/Tablet menu button - hidden on desktop (lg) */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 lg:hidden"
                aria-label="Toggle menu"
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? (
                  <X className="block h-6 w-6" />
                ) : (
                  <Menu className="block h-6 w-6" />
                )}
              </button>

              {/* Logo */}
              <div className="flex-shrink-0 flex items-center ml-2 sm:ml-0">
                <Link
                  href="/admin"
                  className="font-bold text-lg sm:text-xl text-gray-900"
                >
                  Admin Panel
                </Link>
              </div>

              {/* Desktop navigation - shown on large screens only */}
              <div className="hidden lg:ml-6 lg:flex lg:space-x-8">
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
            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* Notification bell */}
              <ApprovalBell
                totalNotifications={totalNotifications}
                urgentCount={urgentApprovals.length}
                loading={loadingApprovals}
                approvals={pendingApprovals}
                lastUpdatedAt={lastUpdatedAt}
                error={approvalsError}
                onApprovalClick={handleApprovalClick}
              />

              {/* User info - Hidden on mobile and tablet */}
              <div className="hidden lg:flex items-center space-x-2">
                <span className="text-sm text-gray-500">{userEmail}</span>
                <Badge variant={userRole === 'super_admin' ? 'default' : 'secondary'}>
                  {userRole === 'super_admin' ? 'Super Admin' : 'Admin'}
                </Badge>
              </div>

              {/* Sign out button - Hidden on mobile and tablet */}
              <form action="/api/admin/auth/logout" method="POST" className="hidden lg:inline">
                <Button type="submit" variant="outline" size="sm">
                  Sign Out
                </Button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile menu slide-out drawer */}
      {isMobileMenuOpen && (
        <>
          {/* Overlay - visible on mobile and tablet */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer - optimized width for tablets */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="fixed inset-y-0 left-0 w-64 md:w-80 bg-white shadow-xl z-50 overflow-y-auto lg:hidden"
          >
            <div className="px-4 py-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Navigation</h2>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Mobile navigation items */}
              <div className="space-y-1">
                {navSections.map((section) => {
                  if (section.items.length === 0) return null

                  return (
                    <div key={section.label} className="mb-6">
                      <h3 className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        {section.label}
                      </h3>
                      <div className="space-y-1">
                        {section.items.map((item) => {
                          const Icon = item.icon
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className={cn(
                                'flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors',
                                isActive(item.href)
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                              )}
                            >
                              <div className="flex items-center">
                                <Icon className="h-4 w-4" />
                                <span className="ml-3">{item.label}</span>
                              </div>
                              {item.badge && (
                                <Badge variant="destructive" className="ml-2">
                                  {item.badge}
                                </Badge>
                              )}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* User info */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="px-3">
                  <p className="text-sm font-medium text-gray-900 truncate">{userEmail}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Role: {userRole === 'super_admin' ? 'Super Admin' : 'Admin'}
                  </p>
                </div>
                <form action="/api/admin/auth/logout" method="POST" className="mt-4">
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
