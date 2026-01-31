'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import { useRouter, usePathname } from 'next/navigation'
import { useSearchParams } from 'next/navigation'

interface InfrastructureTriggerProps {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  showBadge?: boolean
  className?: string
  label?: string
}

/**
 * Infrastructure Drawer Trigger Button
 *
 * Opens the infrastructure drawer by setting ?infra=open in URL
 * Can be used in sidebar, header, or anywhere in workspace
 */
export function InfrastructureTrigger({
  variant = 'ghost',
  size = 'sm',
  showBadge = true,
  className = '',
  label = 'Infrastructure'
}: InfrastructureTriggerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleClick = () => {
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.set('infra', 'open')
    const search = current.toString()
    router.push(`${pathname}?${search}`, { scroll: false })
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={`flex items-center gap-2 ${className}`}
    >
      <Icon name="server" className="w-4 h-4" />
      <span>{label}</span>
      {showBadge && (
        <Badge variant="secondary" className="text-xs px-1.5 py-0">
          Easy
        </Badge>
      )}
    </Button>
  )
}
