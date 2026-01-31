/**
 * HTTP Request Logger for Worker Team Debugging
 * Logs ALL HTTP requests to help identify duplicate API calls
 */

const originalFetch = globalThis.fetch;

// Track worker-related requests
const WORKER_HOSTS = [
  'localhost:8081',
  'worker.sheenapps.com', 
  'sheenapps-claude-worker.up.railway.app',
  'claude-worker.railway.app'
];

function isWorkerRequest(url: string): boolean {
  try {
    const urlObj = new URL(url, 'http://localhost');
    return WORKER_HOSTS.some(host => urlObj.hostname === host.split(':')[0] || url.includes(host));
  } catch {
    return false;
  }
}

function logWorkerRequest(url: string, options: RequestInit = {}) {
  const method = options.method || 'GET';
  const correlationId = (options.headers as any)?.['x-correlation-id'] || 'NO_CORRELATION_ID';
  const timestamp = new Date().toISOString();
  
  console.log(`🌐 [NextJS] HTTP Request to Worker:`, {
    method,
    url,
    correlationId,
    timestamp,
    hasBody: !!options.body,
    bodyLength: options.body ? String(options.body).length : 0,
    headers: options.headers
  });
  
  // Special warning for untracked requests
  if (correlationId === 'NO_CORRELATION_ID') {
    console.warn(`⚠️ [NextJS] UNTRACKED WORKER REQUEST DETECTED:`, {
      method,
      url,
      timestamp,
      warning: 'This request has no correlation ID - potential duplicate source!'
    });
  }
}

// Monkey-patch fetch to log worker requests
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  
  // Log worker-related requests
  if (isWorkerRequest(url)) {
    logWorkerRequest(url, init);
  }
  
  try {
    const response = await originalFetch(input, init);
    
    // Log worker response
    if (isWorkerRequest(url)) {
      const correlationId = (init?.headers as any)?.['x-correlation-id'] || 'NO_CORRELATION_ID';
      console.log(`🌐 [NextJS] HTTP Response from Worker:`, {
        url,
        correlationId,
        status: response.status,
        statusText: response.statusText,
        timestamp: new Date().toISOString()
      });
    }
    
    return response;
  } catch (error) {
    // Log worker errors
    if (isWorkerRequest(url)) {
      const correlationId = (init?.headers as any)?.['x-correlation-id'] || 'NO_CORRELATION_ID';
      console.error(`🌐 [NextJS] HTTP Error from Worker:`, {
        url,
        correlationId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }
    
    throw error;
  }
};

console.log('🔍 [NextJS] HTTP Request Logger initialized - all worker requests will be tracked');

export {};