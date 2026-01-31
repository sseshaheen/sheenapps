/**
 * Shared notification bell component for admin navigation
 * Shows pending approvals with urgent indicators
 */

'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
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
import type { PendingApproval } from '../hooks/usePendingApprovals'

interface ApprovalBellProps {
  totalNotifications: number
  urgentCount: number
  loading: boolean
  approvals: PendingApproval[]
  lastUpdatedAt: Date | null
  error: string | null
  onApprovalClick: (approval: PendingApproval) => void
}

export function ApprovalBell({
  totalNotifications,
  urgentCount,
  loading,
  approvals,
  lastUpdatedAt,
  error,
  onApprovalClick,
}: ApprovalBellProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Pending approvals"
        >
          <Bell className="h-5 w-5" />
          {totalNotifications > 0 && (
            <span
              className={cn(
                'absolute -top-1 -right-1 text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center',
                urgentCount > 0
                  ? 'bg-red-500 text-white motion-safe:animate-pulse'
                  : 'bg-orange-500 text-white'
              )}
            >
              {totalNotifications}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex flex-col">
          <div className="flex items-center">
            Pending Approvals
            {urgentCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {urgentCount} urgent
              </Badge>
            )}
          </div>
          {lastUpdatedAt && (
            <span className="text-xs text-muted-foreground font-normal mt-1">
              Updated {lastUpdatedAt.toLocaleTimeString()}
              {error && ` · ${error}`}
            </span>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {loading ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            Loading approvals...
          </div>
        ) : approvals.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No pending approvals
          </div>
        ) : (
          <>
            {approvals.slice(0, 5).map((approval) => (
              <DropdownMenuItem
                key={approval.id}
                onClick={() => onApprovalClick(approval)}
                className="cursor-pointer"
              >
                <div className="flex flex-col space-y-1 w-full">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{approval.action}</span>
                    {approval.age_hours > 6 && (
                      <Badge variant="destructive" className="text-xs">
                        Urgent
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {approval.amount && `$${approval.amount.toLocaleString()} · `}
                      {approval.age_hours.toFixed(1)}h ago
                    </span>
                    <span className="truncate max-w-[120px]">
                      by {approval.requested_by.split('@')[0]}
                    </span>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
            {approvals.length > 5 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href="/admin/approvals"
                    className="text-center text-sm font-medium"
                  >
                    View all {approvals.length} approvals
                  </Link>
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
