/**
 * Server-Timing Header Utilities
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
 * return NextResponse.json(data, {
 *   headers: timing.getHeaders()
 * })
 * ```
 *
 * Browser DevTools will show:
 * Server-Timing: auth;dur=45, db;dur=123, total;dur=180
 */

import 'server-only'

interface TimingEntry {
  name: string
  startTime: number
  endTime?: number
  description?: string
}

/**
 * ServerTiming class for tracking and formatting timing data.
 */
class ServerTiming {
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
   * End timing a named operation.
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
   * Get headers object for NextResponse.
   */
  getHeaders(): Record<string, string> {
    return {
      'Server-Timing': this.getHeaderValue()
    }
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
}

/**
 * Create a new ServerTiming instance.
 */
export function createServerTiming(): ServerTiming {
  return new ServerTiming()
}

/**
 * Higher-order function to wrap an API handler with timing.
 * Automatically adds Server-Timing headers to the response.
 */
export function withServerTiming<T extends (...args: unknown[]) => Promise<Response>>(
  handler: (timing: ServerTiming, ...args: Parameters<T>) => ReturnType<T>
): T {
  return (async (...args: Parameters<T>) => {
    const timing = createServerTiming()
    const response = await handler(timing, ...args)

    // Clone response and add timing headers
    const headers = new Headers(response.headers)
    headers.set('Server-Timing', timing.getHeaderValue())

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  }) as T
}

/**
 * Merge Server-Timing headers from an upstream response.
 * Useful when proxying to a worker.
 */
export function mergeServerTiming(
  localTiming: ServerTiming,
  upstreamHeaders: Headers
): string {
  const upstream = upstreamHeaders.get('Server-Timing')
  const local = localTiming.getHeaderValue()

  if (upstream) {
    // Prefix upstream timings with 'upstream-'
    const prefixedUpstream = upstream
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
