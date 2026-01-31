/**
 * Server-Timing Header Utilities for Fastify
 *
 * Provides helpers for adding Server-Timing headers to API responses.
 * These headers are visible in browser DevTools and can be collected by observability tools.
 *
 * Usage:
 * ```typescript
 * const timing = createServerTiming()
 *
 * timing.start('auth')
 * await authenticate()
 * timing.end('auth')
 *
 * timing.start('db')
 * const data = await queryDatabase()
 * timing.end('db')
 *
 * reply.header('Server-Timing', timing.getHeaderValue()).send(data)
 * ```
 *
 * Browser DevTools will show:
 * Server-Timing: auth;dur=45, db;dur=123, total;dur=180
 */

interface TimingEntry {
  name: string
  startTime: number
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  endTime?: number | undefined
  description?: string | undefined
}

/**
 * ServerTiming class for tracking and formatting timing data.
 */
export class ServerTiming {
  private entries: Map<string, TimingEntry> = new Map()
  private overallStart: number

  constructor() {
    this.overallStart = performance.now()
  }

  /**
   * Start timing a named operation.
   */
  start(name: string, description?: string): void {
    this.entries.set(name, {
      name,
      startTime: performance.now(),
      description
    })
  }

  /**
   * End timing a named operation. Returns duration in ms.
   */
  end(name: string): number {
    const entry = this.entries.get(name)
    if (!entry) {
      console.warn(`ServerTiming: No start time for '${name}'`)
      return 0
    }
    entry.endTime = performance.now()
    return entry.endTime - entry.startTime
  }

  /**
   * Add a completed timing with known duration.
   */
  add(name: string, durationMs: number, description?: string): void {
    this.entries.set(name, {
      name,
      startTime: 0,
      endTime: durationMs,
      description
    })
  }

  /**
   * Get the Server-Timing header value.
   */
  getHeaderValue(): string {
    const parts: string[] = []

    // Add individual timings
    for (const entry of this.entries.values()) {
      if (entry.endTime !== undefined) {
        const duration = entry.startTime === 0
          ? entry.endTime // Already a duration
          : Math.round(entry.endTime - entry.startTime)

        let part = `${entry.name};dur=${duration}`
        if (entry.description) {
          part += `;desc="${entry.description}"`
        }
        parts.push(part)
      }
    }

    // Add total time
    const total = Math.round(performance.now() - this.overallStart)
    parts.push(`total;dur=${total}`)

    return parts.join(', ')
  }

  /**
   * Wrap an async function and automatically track its timing.
   */
  async track<T>(name: string, fn: () => Promise<T>, description?: string): Promise<T> {
    this.start(name, description)
    try {
      return await fn()
    } finally {
      this.end(name)
    }
  }

  /**
   * Get total elapsed time since creation.
   */
  getTotal(): number {
    return Math.round(performance.now() - this.overallStart)
  }
}

/**
 * Create a new ServerTiming instance.
 */
export function createServerTiming(): ServerTiming {
  return new ServerTiming()
}

/**
 * Parse an upstream Server-Timing header and merge with local timings.
 * Prefixes upstream metrics with 'upstream-'.
 */
export function mergeServerTiming(
  localTiming: ServerTiming,
  upstreamHeader: string | null
): string {
  const local = localTiming.getHeaderValue()

  if (upstreamHeader) {
    // Prefix upstream timings with 'upstream-'
    const prefixedUpstream = upstreamHeader
      .split(',')
      .map(part => {
        const trimmed = part.trim()
        const [name, ...rest] = trimmed.split(';')
        return `upstream-${name};${rest.join(';')}`
      })
      .join(', ')

    return `${local}, ${prefixedUpstream}`
  }

  return local
}
