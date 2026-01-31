/**
 * Version Badge Component
 *
 * Displays version information with proper loading and fallback states
 * Based on worker team integration specifications
 */

import { cn } from '@/lib/utils'
import { CheckCircle, Loader } from 'lucide-react'

interface VersionBadgeProps {
  versionId?: string | null
  versionName?: string | null
  isProcessing?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function VersionBadge({
  versionId,
  versionName,
  isProcessing = false,
  size = 'md',
  className
}: VersionBadgeProps) {
  // No version data available (old projects before version system)
  if (!versionId) {
    return null
  }

  // Size variants
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base'
  }

  const iconSizes = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  }

  // Version ID available but name still processing (AI classification in progress)
  if (!versionName && isProcessing) {
    return (
      <div className={cn(
        "flex items-center gap-1 bg-blue-50 rounded font-medium",
        sizeClasses[size],
        className
      )}>
        <Loader className={cn("animate-spin", iconSizes[size])} />
        <span className="text-blue-700">Processing...</span>
      </div>
    )
  }

  // Version ID available but no name (classification failed after 2min timeout)
  if (!versionName) {
    return (
      <div className={cn(
        "bg-gray-100 rounded font-mono",
        sizeClasses[size],
        "text-gray-600",
        className
      )}>
        {versionId.slice(0, 8)} {/* ✅ First 8 chars of ULID as per worker team */}
      </div>
    )
  }

  // Full version info available
  return (
    <div className={cn(
      "flex items-center gap-1 bg-green-50 rounded font-medium",
      sizeClasses[size],
      className
    )}>
      <CheckCircle className={cn("text-green-600", iconSizes[size])} />
      <span className="text-green-700">{versionName.startsWith('v') ? versionName : `v${versionName}`}</span> {/* ✅ Add "v" prefix only if not present */}
    </div>
  )
}

// Helper function to determine if version is processing
export function isVersionProcessing(versionId?: string | null, versionName?: string | null): boolean {
  return !!versionId && !versionName
}

// Helper function to get version display text
export function getVersionDisplayText(versionId?: string | null, versionName?: string | null): string {
  if (!versionId) return 'No version'
  if (versionName) return versionName.startsWith('v') ? versionName : `v${versionName}`
  return versionId.slice(0, 8) // Fallback to ULID prefix
}

// Helper function for version sorting (ULID-based chronological order)
export function sortVersionsByDate<T extends { versionId: string }>(versions: T[]): T[] {
  return [...versions].sort((a, b) => b.versionId.localeCompare(a.versionId))
}
