/**
 * Helper to extract mock reason from API errors
 */

export function extractMockReason(error: unknown): { mockReason: string; workerStatus: number } {
  const errorMessage = error instanceof Error ? error.message : String(error)
  
  // Default values
  let workerStatus = 500
  let mockReason = 'Worker error'
  
  // Parse error message for status codes and reasons
  if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
    workerStatus = 401
    mockReason = 'Auth invalid'
  } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
    workerStatus = 404
    mockReason = 'Not found'
  } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
    workerStatus = 403
    mockReason = 'Forbidden'
  } else if (errorMessage.includes('500') || errorMessage.includes('Internal')) {
    workerStatus = 500
    mockReason = 'Server error'
  } else if (errorMessage.includes('502') || errorMessage.includes('Bad Gateway')) {
    workerStatus = 502
    mockReason = 'Gateway error'
  } else if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
    workerStatus = 503
    mockReason = 'Service down'
  } else if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
    workerStatus = 0
    mockReason = 'Offline'
  } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
    workerStatus = 408
    mockReason = 'Timeout'
  } else if (errorMessage.includes('Invalid') || errorMessage.includes('jwt')) {
    workerStatus = 401
    mockReason = 'JWT invalid'
  }
  
  return { mockReason, workerStatus }
}