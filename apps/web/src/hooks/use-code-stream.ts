/**
 * @deprecated DEAD CODE - No API route exists for this endpoint
 *
 * This hook connects to `/api/v1/builds/${buildId}/stream` but no such route exists in the codebase.
 *
 * Evidence:
 * - Hook never imported anywhere (grep confirmed)
 * - No API route at `/api/v1/builds/${buildId}/stream` exists
 * - Code streaming is handled by different mechanism (StreamController + chat-plan-client)
 *
 * Commented out 2026-01-13 during connection thrashing cleanup.
 * Safe to fully delete this file in next cleanup cycle.
 *
 * If code streaming is needed in the future, refer to:
 * - `src/lib/stream-controller.ts` - Current streaming implementation
 * - `src/services/chat-plan-client.ts` - Chat streaming pattern
 * - `src/hooks/use-stream-controller.ts` - Hook wrapper for streaming
 */

'use client'

// import { useEffect, useCallback, useRef, useState } from 'react'
// import {
//   useCodeViewerStore,
//   normalizeContent,
//   type ConnectionState,
// } from '@/store/code-viewer-store'
// import { createStreamingBuffer, type StreamingBuffer } from '@/lib/streaming-buffer'

// // ============================================================================
// // Types
// // ============================================================================

// interface UseCodeStreamOptions {
//   buildId: string
//   authToken?: string
//   enabled?: boolean
//   onComplete?: () => void
//   onError?: (error: Error) => void
//   onFileStart?: (file: string) => void
//   onFileEnd?: (file: string) => void
// }

// interface CodeStreamEvent {
//   type: 'file_start' | 'content' | 'file_end' | 'complete' | 'error'
//   data: {
//     file?: string
//     content?: string
//     language?: string
//     cursor?: { line: number; column: number }
//     error?: string
//   }
// }

// // ============================================================================
// // Hook
// // ============================================================================

// export function useCodeStream({
//   buildId,
//   authToken,
//   enabled = true,
//   onComplete,
//   onError,
//   onFileStart,
//   onFileEnd,
// }: UseCodeStreamOptions) {
//   const eventSourceRef = useRef<EventSource | null>(null)
//   const streamingBufferRef = useRef<StreamingBuffer | null>(null)
//   const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')

//   // Store actions
//   const appendStreamingContent = useCodeViewerStore(
//     (state) => state.appendStreamingContent
//   )
//   const startStreaming = useCodeViewerStore((state) => state.startStreaming)
//   const endStreaming = useCodeViewerStore((state) => state.endStreaming)
//   const setFileStatus = useCodeViewerStore((state) => state.setFileStatus)
//   const storeSetConnectionState = useCodeViewerStore(
//     (state) => state.setConnectionState
//   )

//   // Initialize streaming buffer (RAF-based batching)
//   useEffect(() => {
//     streamingBufferRef.current = createStreamingBuffer((path, content, cursor) => {
//       appendStreamingContent(path, content, cursor)
//     })
//     return () => {
//       streamingBufferRef.current?.clear()
//     }
//   }, [appendStreamingContent])

//   // Sync connection state to store
//   useEffect(() => {
//     storeSetConnectionState(connectionState)
//   }, [connectionState, storeSetConnectionState])

//   const connect = useCallback(() => {
//     if (!enabled || !buildId) return

//     // Close existing connection
//     if (eventSourceRef.current) {
//       eventSourceRef.current.close()
//     }

//     setConnectionState('connecting')

//     // Build URL with auth token (if not using cookies)
//     const params = new URLSearchParams()
//     if (authToken) params.set('token', authToken)

//     const url = `/api/v1/builds/${buildId}/stream?${params}`
//     const eventSource = new EventSource(url)
//     eventSourceRef.current = eventSource

//     // Connection opened
//     eventSource.onopen = () => {
//       setConnectionState('connected')
//     }

//     // File start event
//     eventSource.addEventListener('file_start', (e: MessageEvent) => {
//       try {
//         const data = JSON.parse(e.data)
//         // Validate file path is a string (not undefined/null)
//         if (typeof data.file === 'string') {
//           startStreaming(data.file)
//           onFileStart?.(data.file)
//         }
//       } catch (err) {
//         console.error('Failed to parse file_start event:', err)
//       }
//     })

//     // Content chunk event - buffered with RAF for performance
//     eventSource.addEventListener('content', (e: MessageEvent) => {
//       try {
//         const data = JSON.parse(e.data)
//         // Use typeof checks to allow empty string "" as valid content
//         if (typeof data.file === 'string' && typeof data.content === 'string' && streamingBufferRef.current) {
//           // Normalize line endings before buffering
//           const normalizedContent = normalizeContent(data.content)
//           // Buffer chunks and flush on RAF (max ~60 updates/sec)
//           streamingBufferRef.current.append(
//             data.file,
//             normalizedContent,
//             data.cursor || { line: 0, column: 0 }
//           )
//         }
//       } catch (err) {
//         console.error('Failed to parse content event:', err)
//       }
//     })

//     // File end event
//     eventSource.addEventListener('file_end', (e: MessageEvent) => {
//       try {
//         const data = JSON.parse(e.data)
//         // Validate file path is a string (not undefined/null)
//         if (typeof data.file === 'string') {
//           // Flush any remaining buffered content before marking file as complete
//           streamingBufferRef.current?.flushImmediate()
//           // setFileStatus auto-computes correct status (new/modified/idle) when transitioning from streaming
//           setFileStatus(data.file, 'idle')
//           onFileEnd?.(data.file)
//         }
//       } catch (err) {
//         console.error('Failed to parse file_end event:', err)
//       }
//     })

//     // Stream complete event
//     eventSource.addEventListener('complete', () => {
//       // Flush any remaining buffered content
//       streamingBufferRef.current?.flushImmediate()
//       setConnectionState('disconnected')
//       endStreaming()
//       eventSource.close()
//       onComplete?.()
//     })

//     // Error event - handle both transient and terminal errors
//     eventSource.onerror = () => {
//       if (eventSource.readyState === EventSource.CLOSED) {
//         // Terminal: connection failed permanently
//         // Flush any buffered content before reporting error
//         streamingBufferRef.current?.flushImmediate()
//         setConnectionState('error')
//         endStreaming()
//         onError?.(new Error('Stream connection closed'))
//       } else if (eventSource.readyState === EventSource.CONNECTING) {
//         // Transient: browser is auto-reconnecting
//         setConnectionState('connecting')
//       }
//     }

//     return () => {
//       // Flush remaining content before closing
//       streamingBufferRef.current?.flushImmediate()
//       eventSource.close()
//       setConnectionState('disconnected')
//     }
//   }, [
//     buildId,
//     authToken,
//     enabled,
//     appendStreamingContent,
//     startStreaming,
//     endStreaming,
//     setFileStatus,
//     onComplete,
//     onError,
//     onFileStart,
//     onFileEnd,
//   ])

//   // Connect on mount/when enabled
//   useEffect(() => {
//     if (enabled && buildId) {
//       const cleanup = connect()
//       return cleanup
//     }
//   }, [connect, enabled, buildId])

//   // Cleanup on unmount
//   useEffect(() => {
//     return () => {
//       if (eventSourceRef.current) {
//         eventSourceRef.current.close()
//       }
//     }
//   }, [])

//   const disconnect = useCallback(() => {
//     if (eventSourceRef.current) {
//       eventSourceRef.current.close()
//       eventSourceRef.current = null
//     }
//     setConnectionState('disconnected')
//   }, [])

//   const reconnect = useCallback(() => {
//     disconnect()
//     connect()
//   }, [disconnect, connect])

//   return {
//     connectionState,
//     isConnected: connectionState === 'connected',
//     isConnecting: connectionState === 'connecting',
//     hasError: connectionState === 'error',
//     connect,
//     disconnect,
//     reconnect,
//   }
// }

// // ============================================================================
// // Mock Stream Hook (for development/testing)
// // ============================================================================

// /**
//  * Mock stream for testing without a real backend
//  */
// export function useMockCodeStream(options: Omit<UseCodeStreamOptions, 'authToken'>) {
//   const { buildId, enabled = true, onComplete, onFileStart, onFileEnd } = options
//   const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')

//   const appendStreamingContent = useCodeViewerStore(
//     (state) => state.appendStreamingContent
//   )
//   const startStreaming = useCodeViewerStore((state) => state.startStreaming)
//   const endStreaming = useCodeViewerStore((state) => state.endStreaming)

//   const connect = useCallback(() => {
//     if (!enabled || !buildId) return

//     setConnectionState('connected')

//     // Simulate streaming a file
//     const mockContent = `import React from 'react';

// export default function App() {
//   return (
//     <div className="container mx-auto p-4">
//       <h1 className="text-2xl font-bold">Hello, World!</h1>
//       <p>This is a mock generated component.</p>
//     </div>
//   );
// }
// `

//     const file = 'src/App.tsx'
//     startStreaming(file)
//     onFileStart?.(file)

//     // Stream content character by character (simulated)
//     let index = 0
//     const interval = setInterval(() => {
//       if (index < mockContent.length) {
//         // Stream in chunks of ~10 characters
//         const chunk = mockContent.slice(index, index + 10)
//         const line = mockContent.slice(0, index + 10).split('\n').length
//         appendStreamingContent(file, chunk, { line, column: 0 })
//         index += 10
//       } else {
//         clearInterval(interval)
//         endStreaming()
//         onFileEnd?.(file)
//         setConnectionState('disconnected')
//         onComplete?.()
//       }
//     }, 50)

//     return () => {
//       clearInterval(interval)
//       setConnectionState('disconnected')
//     }
//   }, [
//     buildId,
//     enabled,
//     appendStreamingContent,
//     startStreaming,
//     endStreaming,
//     onComplete,
//     onFileStart,
//     onFileEnd,
//   ])

//   useEffect(() => {
//     if (enabled && buildId) {
//       const cleanup = connect()
//       return cleanup
//     }
//   }, [connect, enabled, buildId])

//   return {
//     connectionState,
//     isConnected: connectionState === 'connected',
//     isConnecting: connectionState === 'connecting',
//     hasError: connectionState === 'error',
//     connect,
//     disconnect: () => setConnectionState('disconnected'),
//     reconnect: connect,
//   }
// }
