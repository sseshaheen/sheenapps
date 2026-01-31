import 'server-only'

import crypto from 'crypto'

function sortQuery(qs: string) {
  if (!qs) return '';
  const params = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs);
  const pairs = Array.from(params.entries()).sort(([a],[b]) => a.localeCompare(b));
  return pairs.map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

export function generateWorkerSignature({
  method, path, query, body, timestamp, nonce
}: {
  method: string; path: string; query: string;
  body: string; timestamp: string; nonce: string;
}): string {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('WORKER_SHARED_SECRET missing or too short (must be at least 32 characters)');
  }
  const canonical = `${method.toUpperCase()}\n${path}\n${sortQuery(query)}\n${sha256Hex(body || '')}\n${nonce}\n${timestamp}`;
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

export function validateWorkerEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const baseUrl = process.env.WORKER_BASE_URL;
  const sharedSecret = process.env.WORKER_SHARED_SECRET;
  
  if (!baseUrl) {
    errors.push('WORKER_BASE_URL environment variable is required');
  }
  
  if (!sharedSecret) {
    errors.push('WORKER_SHARED_SECRET environment variable is required');
  } else if (sharedSecret.length < 32) {
    errors.push('WORKER_SHARED_SECRET must be at least 32 characters long');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export function getWorkerConfig(): { baseUrl: string; secret: string } {
  const validation = validateWorkerEnvironment();
  if (!validation.valid) {
    throw new Error(`Worker configuration invalid: ${validation.errors.join(', ')}`);
  }
  
  return {
    baseUrl: process.env.WORKER_BASE_URL!,
    secret: process.env.WORKER_SHARED_SECRET!
  };
}