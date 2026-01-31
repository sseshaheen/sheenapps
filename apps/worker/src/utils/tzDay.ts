/**
 * Timezone-safe day bucketing utilities
 *
 * Problem: occurred_at::date converts to DB timezone (usually UTC), but digest
 * dates are in project timezone. This causes "wrong day" for non-UTC projects.
 *
 * Solution: Convert project timezone's calendar day to UTC range, then query
 * by occurred_at >= startUtc AND occurred_at < endUtc.
 */

/**
 * Get UTC timestamp range for a calendar day in a specific timezone.
 *
 * @param dateYYYYMMDD - Date string in YYYY-MM-DD format (in project timezone)
 * @param timeZone - IANA timezone (e.g., 'America/New_York', 'Asia/Dubai')
 * @returns Start and end UTC timestamps for that local calendar day
 *
 * @example
 * // For "2026-01-29" in America/New_York (UTC-5):
 * // Returns { startUtc: 2026-01-29T05:00:00Z, endUtc: 2026-01-30T05:00:00Z }
 */
export function getUtcRangeForLocalDay(
  dateYYYYMMDD: string,
  timeZone: string
): { startUtc: Date; endUtc: Date } {
  const parts = dateYYYYMMDD.split('-')
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateYYYYMMDD}. Expected YYYY-MM-DD.`)
  }

  const year = parseInt(parts[0]!, 10)
  const month = parseInt(parts[1]!, 10)
  const day = parseInt(parts[2]!, 10)

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid date format: ${dateYYYYMMDD}. Expected YYYY-MM-DD with numeric values.`)
  }

  // Create date object representing midnight in the target timezone
  // We'll use Intl.DateTimeFormat to find the correct UTC offset
  const midnight = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)) // Start at noon to avoid DST edge cases

  // Get the UTC time that corresponds to 00:00:00 in the target timezone
  const startUtc = getUtcTimeForLocalTime(year, month, day, 0, timeZone)
  const endUtc = getUtcTimeForLocalTime(year, month, day + 1, 0, timeZone)

  return { startUtc, endUtc }
}

/**
 * Find the UTC timestamp that corresponds to a specific local time.
 * Handles DST transitions correctly.
 */
function getUtcTimeForLocalTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string
): Date {
  // Start with a guess (assume standard offset)
  let utcGuess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0))

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  // Iteratively adjust until we hit the target local time
  // Usually converges in 1-2 iterations, even across DST boundaries
  for (let i = 0; i < 5; i++) {
    const parts = formatter.formatToParts(utcGuess)
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '0'

    const localYear = parseInt(getPart('year'), 10)
    const localMonth = parseInt(getPart('month'), 10)
    const localDay = parseInt(getPart('day'), 10)
    const localHour = parseInt(getPart('hour'), 10)
    const localMinute = parseInt(getPart('minute'), 10)
    const localSecond = parseInt(getPart('second'), 10)

    // Check if we've reached the target local time
    if (
      localYear === year &&
      localMonth === month &&
      localDay === day &&
      localHour === hour &&
      localMinute === 0 &&
      localSecond === 0
    ) {
      return utcGuess
    }

    // Calculate offset and adjust
    const targetMs = Date.UTC(year, month - 1, day, hour, 0, 0)
    const currentLocalMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, localSecond)
    const offsetMs = targetMs - currentLocalMs

    utcGuess = new Date(utcGuess.getTime() + offsetMs)
  }

  return utcGuess
}

/**
 * Get "yesterday" in a specific timezone as YYYY-MM-DD.
 *
 * @param timeZone - IANA timezone
 * @returns Yesterday's date in YYYY-MM-DD format
 */
export function getYesterdayInTimezone(timeZone: string): string {
  const now = new Date()

  // Get today in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const todayStr = formatter.format(now) // YYYY-MM-DD
  const parts = todayStr.split('-')
  if (parts.length !== 3) {
    throw new Error(`Invalid date format from formatter: ${todayStr}`)
  }

  const year = parseInt(parts[0]!, 10)
  const month = parseInt(parts[1]!, 10)
  const day = parseInt(parts[2]!, 10)

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid date format from formatter: ${todayStr}`)
  }

  // Subtract one day (use noon to avoid DST issues)
  const yesterdayApprox = new Date(Date.UTC(year, month - 1, day - 1, 12, 0, 0))

  return formatter.format(yesterdayApprox)
}
