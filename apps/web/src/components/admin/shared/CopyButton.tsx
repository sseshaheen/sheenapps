'use client'

import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  value: string
  className?: string
  size?: 'sm' | 'icon'
  showToast?: boolean
}

/**
 * One-click copy button for admin tables.
 * Commonly used for copying project IDs, user IDs, etc.
 *
 * @example
 * <TableCell>
 *   <div className="flex items-center gap-2">
 *     <span className="truncate">{row.project_id}</span>
 *     <CopyButton value={row.project_id} />
 *   </div>
 * </TableCell>
 */
export function CopyButton({
  value,
  className,
  size = 'sm',
  showToast = true,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (showToast) {
        toast.success('Copied to clipboard')
      }
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      onClick={handleCopy}
      className={cn(
        size === 'sm' ? 'h-7 px-2' : 'h-8 w-8',
        className
      )}
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {size === 'sm' && <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>}
    </Button>
  )
}
