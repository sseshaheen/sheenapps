/**
 * Streaming Buffer
 *
 * Batches incoming content chunks and flushes them on requestAnimationFrame.
 * This reduces the number of store updates and React re-renders during
 * high-frequency streaming (e.g., code generation).
 *
 * Key features:
 * - RAF-based flush: Updates happen at most once per frame (~16ms)
 * - Per-file buffering: Each file has its own buffer
 * - Automatic cursor tracking: Uses the last cursor position
 */

// ============================================================================
// Types
// ============================================================================

interface BufferedChunk {
  content: string
  cursor: { line: number; column: number }
}

interface FileBuffer {
  chunks: string[]
  lastCursor: { line: number; column: number }
}

type FlushCallback = (
  path: string,
  content: string,
  cursor: { line: number; column: number }
) => void

// ============================================================================
// StreamingBuffer Class
// ============================================================================

export class StreamingBuffer {
  private buffers: Map<string, FileBuffer> = new Map()
  private flushScheduled = false
  private flushCallback: FlushCallback
  private rafId: number | null = null

  constructor(flushCallback: FlushCallback) {
    this.flushCallback = flushCallback
  }

  /**
   * Add a chunk to the buffer for a specific file.
   * The buffer will be flushed on the next animation frame.
   */
  append(path: string, chunk: string, cursor: { line: number; column: number }) {
    let buffer = this.buffers.get(path)
    if (!buffer) {
      buffer = { chunks: [], lastCursor: cursor }
      this.buffers.set(path, buffer)
    }

    buffer.chunks.push(chunk)
    buffer.lastCursor = cursor

    this.scheduleFlush()
  }

  /**
   * Schedule a flush on the next animation frame.
   * Multiple calls within the same frame will be coalesced.
   */
  private scheduleFlush() {
    if (this.flushScheduled) return

    this.flushScheduled = true
    this.rafId = requestAnimationFrame(() => {
      this.flush()
      this.flushScheduled = false
      this.rafId = null
    })
  }

  /**
   * Immediately flush all buffered content to the store.
   */
  flush() {
    for (const [path, buffer] of this.buffers) {
      if (buffer.chunks.length > 0) {
        // Concatenate all chunks into a single string
        const content = buffer.chunks.join('')
        buffer.chunks = []

        // Call the flush callback with concatenated content
        this.flushCallback(path, content, buffer.lastCursor)
      }
    }
  }

  /**
   * Force immediate flush and cancel any pending RAF.
   * Call this when streaming ends to ensure all content is delivered.
   */
  flushImmediate() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.flushScheduled = false
    this.flush()
  }

  /**
   * Clear all buffers and cancel any pending flush.
   */
  clear() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.flushScheduled = false
    this.buffers.clear()
  }

  /**
   * Get the buffer for a specific file (for debugging/testing).
   */
  getBuffer(path: string): FileBuffer | undefined {
    return this.buffers.get(path)
  }
}

// ============================================================================
// Hook Factory
// ============================================================================

/**
 * Create a streaming buffer instance.
 *
 * Usage:
 * ```tsx
 * const buffer = createStreamingBuffer((path, content, cursor) => {
 *   store.appendStreamingContent(path, content, cursor)
 * })
 *
 * // On each SSE event:
 * buffer.append(path, chunk, cursor)
 *
 * // On stream end:
 * buffer.flushImmediate()
 * buffer.clear()
 * ```
 */
export function createStreamingBuffer(flushCallback: FlushCallback): StreamingBuffer {
  return new StreamingBuffer(flushCallback)
}
