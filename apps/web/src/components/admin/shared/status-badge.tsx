import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

/**
 * Map status strings to consistent badge variants across admin pages.
 * Use this for Jobs, Emails, Backups, Alerts, etc.
 */
export function getStatusBadgeVariant(status: string): BadgeVariant {
  const normalized = status.toLowerCase()

  // Error/failure states
  if (
    normalized === 'failed' ||
    normalized === 'critical' ||
    normalized === 'bounced' ||
    normalized === 'error' ||
    normalized === 'rejected' ||
    normalized === 'expired'
  ) {
    return 'destructive'
  }

  // Pending/in-progress states
  if (
    normalized === 'pending' ||
    normalized === 'queued' ||
    normalized === 'in_progress' ||
    normalized === 'processing' ||
    normalized === 'warning' ||
    normalized === 'running'
  ) {
    return 'secondary'
  }

  // Success states
  if (
    normalized === 'completed' ||
    normalized === 'delivered' ||
    normalized === 'sent' ||
    normalized === 'success' ||
    normalized === 'active' ||
    normalized === 'resolved'
  ) {
    return 'default'
  }

  // Default for unknown
  return 'outline'
}

interface StatusBadgeProps {
  status: string
  className?: string
}

/**
 * Consistent status badge component for admin pages.
 *
 * @example
 * <StatusBadge status={job.status} />
 * <StatusBadge status={email.status} />
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge variant={getStatusBadgeVariant(status)} className={cn(className)}>
      {status}
    </Badge>
  )
}
