/**
 * SSE Testing Helpers
 *
 * Provides utilities for testing Server-Sent Events connections
 * with proper cleanup and timeout handling.
 *
 * This helper opens SSE connections directly from the test (not monkeypatching),
 * making tests deterministic and independent of app wiring.
 */

import { Page } from '@playwright/test';
import { TIMEOUTS } from './timeouts';

export interface SSEEvent {
  type: string;
  data: string;
  timestamp: number;
}

/**
 * Wait for a terminal SSE event from a specific URL
 *
 * Opens an SSE connection directly from the page context, collects events,
 * and closes when a terminal event is received or timeout occurs.
 *
 * @example
 * const { terminal, events } = await waitForSSETerminalEvent(page, {
 *   url: `/api/builds/${buildId}/events`,
 *   terminalEvents: ['build.complete', 'build.failed'],
 *   collectEvents: ['build.progress', 'build.log'],
 *   timeout: TIMEOUTS.buildFast,
 * });
 */
export async function waitForSSETerminalEvent(
  page: Page,
  opts: {
    url: string; // absolute or relative to baseURL
    terminalEvents: string[]; // e.g. ['build.complete','build.failed']
    collectEvents?: string[]; // optional progress events to collect
    timeout?: number;
  }
): Promise<{ events: SSEEvent[]; terminal: SSEEvent }> {
  const {
    url,
    terminalEvents,
    collectEvents = [],
    timeout = TIMEOUTS.buildFast,
  } = opts;

  // Set up SSE listener in page context
  await page.evaluate(
    ({ url, terminalEvents, collectEvents }) => {
      const state = {
        events: [] as SSEEvent[],
        terminal: null as SSEEvent | null,
        error: null as string | null,
        source: null as EventSource | null,
      };
      (window as unknown as Record<string, unknown>).__e2eSSE = state;

      const source = new EventSource(url);
      state.source = source;

      const record = (type: string, data: string) => {
        const ev: SSEEvent = { type, data, timestamp: Date.now() };
        state.events.push(ev);
        if (terminalEvents.includes(type)) {
          state.terminal = ev;
          source.close();
        }
      };

      // Listen for named events
      for (const t of new Set([...terminalEvents, ...collectEvents])) {
        source.addEventListener(t, ((e: MessageEvent) => {
          record(t, e.data);
        }) as EventListener);
      }

      // Fallback for generic messages
      source.onmessage = (e) => record('message', e.data);

      source.onerror = () => {
        state.error = 'SSE connection error';
        source.close();
      };
    },
    { url, terminalEvents, collectEvents }
  );

  // Wait for terminal event or timeout
  try {
    await page.waitForFunction(
      () => {
        const s = (window as unknown as Record<string, { terminal: unknown; error: unknown }>).__e2eSSE;
        return s?.terminal || s?.error;
      },
      { timeout }
    );
  } catch {
    // Timeout - close connection and throw
    await page.evaluate(() => {
      const s = (window as unknown as Record<string, { source?: EventSource }>).__e2eSSE;
      s?.source?.close();
    });
    throw new Error(
      `SSE timeout waiting for terminal events: ${terminalEvents.join(', ')}`
    );
  }

  // Get results and ensure cleanup
  const result = await page.evaluate(() => {
    const s = (window as unknown as Record<string, {
      events: SSEEvent[];
      terminal: SSEEvent | null;
      error: string | null;
      source?: EventSource;
    }>).__e2eSSE;
    s?.source?.close();
    return { events: s.events, terminal: s.terminal, error: s.error };
  });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.terminal) {
    throw new Error(
      `SSE ended without terminal event: ${terminalEvents.join(', ')}`
    );
  }

  return { events: result.events, terminal: result.terminal };
}

/**
 * Wait for build completion via SSE
 *
 * Convenience wrapper for build-specific SSE events.
 *
 * @example
 * const result = await waitForBuildComplete(page, {
 *   buildId: '123',
 *   timeout: TIMEOUTS.buildFast,
 * });
 * if (result.success) {
 *   console.log('Build completed!');
 * } else {
 *   console.log('Build failed:', result.error);
 * }
 */
export async function waitForBuildComplete(
  page: Page,
  options: {
    buildId: string;
    timeout?: number;
  }
): Promise<{ success: boolean; error?: string; events: SSEEvent[] }> {
  const { buildId, timeout = TIMEOUTS.buildFast } = options;

  try {
    const { terminal, events } = await waitForSSETerminalEvent(page, {
      url: `/api/builds/${buildId}/events`,
      terminalEvents: ['build.complete', 'build.failed', 'build_complete', 'build_error'],
      collectEvents: ['build.progress', 'build.log', 'build_progress', 'build_log'],
      timeout,
    });

    if (
      terminal.type === 'build.complete' ||
      terminal.type === 'build_complete'
    ) {
      return { success: true, events };
    }

    // Parse error from terminal event data
    let error = 'Build failed';
    try {
      const data = JSON.parse(terminal.data);
      error = data.error || data.message || error;
    } catch {
      error = terminal.data || error;
    }

    return { success: false, error, events };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
      events: [],
    };
  }
}

/**
 * Clean up any lingering SSE connections
 *
 * Call this in afterEach to ensure connections are closed even if test fails.
 */
export async function cleanupSSE(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      const s = (window as unknown as Record<string, { source?: EventSource }>).__e2eSSE;
      s?.source?.close();
    });
  } catch {
    // Page may already be closed, ignore
  }
}
