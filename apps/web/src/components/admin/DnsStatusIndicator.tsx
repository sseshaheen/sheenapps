'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface DnsCheck {
  verified: boolean
  actual?: string
  expected?: string
  error?: string
}

interface DnsStatusIndicatorProps {
  dnsStatus: {
    spf?: DnsCheck
    dkim?: DnsCheck
    dmarc?: DnsCheck
    mx?: DnsCheck
    returnPath?: DnsCheck
  }
  compact?: boolean
}

const DNS_LABELS: Record<string, string> = {
  spf: 'SPF',
  dkim: 'DKIM',
  dmarc: 'DMARC',
  mx: 'MX',
  returnPath: 'Return-Path',
}

function DotIndicator({ check, label }: { check: DnsCheck | undefined; label: string }) {
  if (!check) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full bg-muted" />
        {label}
      </span>
    )
  }

  const color = check.verified
    ? 'bg-green-500'
    : check.error
      ? 'bg-red-500'
      : 'bg-muted-foreground/40'

  const tooltipText = check.verified
    ? `${label}: Verified`
    : check.error
      ? `${label}: ${check.error}`
      : `${label}: Pending`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-xs cursor-default">
          <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[300px]">
        <p>{tooltipText}</p>
        {check.expected && !check.verified && (
          <p className="mt-1 text-xs text-muted-foreground">
            Expected: {check.expected}
          </p>
        )}
        {check.actual && !check.verified && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Actual: {check.actual}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export function DnsStatusIndicator({ dnsStatus, compact }: DnsStatusIndicatorProps) {
  const entries = Object.entries(DNS_LABELS)

  if (compact) {
    const present = entries.filter(([key]) => dnsStatus[key as keyof typeof dnsStatus])
    if (present.length === 0) {
      return <span className="text-xs text-muted-foreground">—</span>
    }
    const verified = present.filter(([key]) => dnsStatus[key as keyof typeof dnsStatus]?.verified).length

    return (
      <span className="text-xs text-muted-foreground">
        {verified}/{present.length} verified
      </span>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap gap-2">
        {entries.map(([key, label]) => (
          <DotIndicator
            key={key}
            check={dnsStatus[key as keyof typeof dnsStatus]}
            label={label}
          />
        ))}
      </div>
    </TooltipProvider>
  )
}
