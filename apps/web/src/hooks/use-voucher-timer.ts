/**
 * Voucher Timer Hook with Server Time Synchronization
 * Prevents countdown issues due to client clock drift
 * Based on MULTI_PROVIDER_FRONTEND_INTEGRATION_PLAN.md
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { logger } from '@/utils/logger'

interface VoucherTimerResult {
  remaining: number           // Milliseconds remaining (with grace period)
  actualRemaining: number     // Actual milliseconds remaining
  isExpired: boolean         // True when timer reaches zero
  isNearExpiry: boolean      // True when less than 5 minutes remaining
  formattedTime: string      // Human-readable time string (e.g., "24m 30s")
}

/**
 * Hook for managing voucher countdown timers with server time synchronization
 * Includes visual grace period for stability after expiry
 */
export function useVoucherTimer(
  expiresAt: string,
  serverNow: string,
  options: {
    gracePeriodMs?: number    // Grace period after expiry (default: 3000ms)
    updateInterval?: number   // Timer update interval (default: 1000ms)
    nearExpiryThresholdMs?: number // Threshold for "near expiry" warning (default: 5 minutes)
  } = {}
): VoucherTimerResult {
  
  const {
    gracePeriodMs = 3000,      // 3 seconds grace period
    updateInterval = 1000,     // Update every second
    nearExpiryThresholdMs = 5 * 60 * 1000  // 5 minutes
  } = options

  // Expert recommendation: Calculate time offset for client drift protection
  const timeOffset = useMemo(() => {
    const serverTime = new Date(serverNow).getTime()
    const clientTime = Date.now()
    const offset = serverTime - clientTime
    
    logger.debug('general', 'Voucher timer initialized', {
      server_time: serverNow,
      client_time: new Date(clientTime).toISOString(),
      offset_ms: offset,
      expires_at: expiresAt
    })
    
    return offset
  }, [serverNow, expiresAt])

  // Calculate initial remaining time with server sync
  const [remainingMs, setRemainingMs] = useState(() => {
    const expiryTime = new Date(expiresAt).getTime()
    const syncedNow = Date.now() + timeOffset
    return Math.max(0, expiryTime - syncedNow)
  })

  // Update timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      const expiryTime = new Date(expiresAt).getTime()
      const syncedNow = Date.now() + timeOffset
      const newRemaining = Math.max(0, expiryTime - syncedNow)
      
      setRemainingMs(newRemaining)
      
      // Debug log every 30 seconds to avoid spam
      if (newRemaining % 30000 < 1000) {
        logger.debug('general', 'Voucher timer update', {
          remaining_seconds: Math.floor(newRemaining / 1000),
          expires_at: expiresAt
        })
      }
    }, updateInterval)

    return () => clearInterval(interval)
  }, [expiresAt, timeOffset, updateInterval])

  // Expert recommendation: Visual grace period for stability
  const displayRemaining = remainingMs > 0 ? remainingMs : Math.max(0, remainingMs + gracePeriodMs)
  const actualRemaining = remainingMs
  const isExpired = remainingMs <= 0
  const isNearExpiry = remainingMs > 0 && remainingMs <= nearExpiryThresholdMs

  // Format time as human-readable string
  const formattedTime = useMemo(() => {
    return formatDuration(displayRemaining)
  }, [displayRemaining])

  // Log expiry events
  useEffect(() => {
    if (isExpired && remainingMs === 0) {
      logger.info('Voucher timer expired', {
        expires_at: expiresAt,
        grace_period_ms: gracePeriodMs
      }, 'general')
    }
  }, [isExpired, remainingMs, expiresAt, gracePeriodMs])

  return {
    remaining: displayRemaining,
    actualRemaining,
    isExpired,
    isNearExpiry,
    formattedTime
  }
}

/**
 * Format duration in milliseconds to human-readable string
 * Examples: "24m 30s", "2h 15m", "45s"
 */
function formatDuration(ms: number): string {
  if (ms <= 0) return '0s'
  
  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  
  return `${seconds}s`
}

/**
 * Utility hook for formatting any duration
 */
export function useFormattedDuration(ms: number): string {
  return useMemo(() => formatDuration(ms), [ms])
}

/**
 * Utility function to get relative time until expiry
 * Used for accessibility announcements
 */
export function getTimeUntilExpiry(expiresAt: string, serverNow: string): {
  remaining: number
  isExpired: boolean
  accessibilityText: string
} {
  const expiryTime = new Date(expiresAt).getTime()
  const serverTime = new Date(serverNow).getTime()
  const remaining = Math.max(0, expiryTime - serverTime)
  const isExpired = remaining <= 0
  
  const accessibilityText = isExpired 
    ? 'Payment voucher expired' 
    : `Payment expires in ${formatDuration(remaining)}`
  
  return { remaining, isExpired, accessibilityText }
}