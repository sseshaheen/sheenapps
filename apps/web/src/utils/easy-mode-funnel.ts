/**
 * Easy Mode Funnel Event Helper
 *
 * Lightweight fire-and-forget helper to emit funnel events
 * from the frontend. These are sent to the business_events table
 * via the proxy → worker pipeline.
 *
 * All calls are non-blocking and swallow errors silently —
 * analytics should never break user flows.
 */

const emittedOnce = new Set<string>()

/**
 * Emit a funnel event for an Easy Mode project.
 * Fire-and-forget — never throws, never blocks UI.
 */
export function emitFunnelEvent(
  projectId: string,
  eventType: string,
  payload?: Record<string, unknown>,
) {
  // Don't block the caller
  void fetch(`/api/inhouse/projects/${projectId}/business-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventType, payload }),
  }).catch(() => {
    // Silently ignore — analytics must never break UX
  })
}

/**
 * Emit a funnel event only once per session.
 * Useful for "first_site_open", "runhub_first_open", etc.
 */
export function emitFunnelEventOnce(
  projectId: string,
  eventType: string,
  payload?: Record<string, unknown>,
) {
  const key = `${projectId}:${eventType}`
  if (emittedOnce.has(key)) return
  emittedOnce.add(key)
  emitFunnelEvent(projectId, eventType, payload)
}
