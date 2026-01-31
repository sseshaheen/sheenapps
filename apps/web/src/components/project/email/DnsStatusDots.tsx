'use client'

import { Circle, CheckCircle, AlertCircle } from 'lucide-react'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'

interface DnsStatusDotsProps {
  dnsStatus: Record<string, { status: string; value?: string }>
  compact?: boolean
}

const KNOWN_ORDER = ['SPF', 'DKIM', 'DMARC', 'MX', 'Return-Path']

export function DnsStatusDots({ dnsStatus, compact }: DnsStatusDotsProps) {
  const records = [
    ...KNOWN_ORDER.filter((key) => key in dnsStatus),
    ...Object.keys(dnsStatus).filter((key) => !KNOWN_ORDER.includes(key)).sort(),
  ]
  const verifiedCount = records.filter((key) => dnsStatus[key].status === 'verified').length

  if (compact) {
    return (
      <span className="text-xs text-muted-foreground">
        {verifiedCount}/{records.length}
      </span>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-2 flex-wrap">
        {records.map((key) => {
          const record = dnsStatus[key]
          const isVerified = record.status === 'verified'
          const isError = record.status === 'error'

          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-xs">
                  {key}
                  {isVerified ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : isError ? (
                    <AlertCircle className="h-3 w-3 text-destructive" />
                  ) : (
                    <Circle className="h-3 w-3 text-muted-foreground" />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{key}: {record.status}</p>
                {record.value && <p className="text-xs opacity-75 font-mono">{record.value}</p>}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
