/**
 * Supabase OAuth Integration Utilities
 * Handles PKCE code verifier storage and OAuth URL generation
 * Following worker team recommendations for encrypted JWT cookies
 */

import * as crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import 'server-only';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET;

if (!JWT_SECRET || !OAUTH_STATE_SECRET) {
  throw new Error('JWT_SECRET and OAUTH_STATE_SECRET environment variables are required');
}

/**
 * Generate PKCE code verifier and challenge
 * Following RFC 7636 specification
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  // Generate 128 bytes of randomness for maximum entropy
  const codeVerifier = crypto.randomBytes(96).toString('base64url');

  // Create SHA256 hash and encode as base64url
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = hash.toString('base64url');

  return { codeVerifier, codeChallenge };
}

/**
 * Store PKCE code verifier in encrypted JWT cookie
 * 10 minute expiry for OAuth flow duration
 */
export async function storeCodeVerifier(nonce: string, codeVerifier: string): Promise<void> {
  const jwt = await new SignJWT({ codeVerifier })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .setSubject(nonce)
    .setIssuedAt()
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set('oauth_verifier', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600, // 10 minutes
    sameSite: 'lax',
    path: '/'
  });
}

/**
 * Retrieve and validate PKCE code verifier from JWT cookie
 * Returns null if cookie is missing, expired, or invalid
 */
export async function getStoredCodeVerifier(nonce: string): Promise<string | null> {
  const cookieStore = await cookies();
  const jwt = cookieStore.get('oauth_verifier')?.value;

  if (!jwt) return null;

  try {
    const { payload } = await jwtVerify(jwt, JWT_SECRET);

    // Verify nonce matches (prevents CSRF)
    if (payload.sub !== nonce) {
      return null;
    }

    return payload.codeVerifier as string;
  } catch (error) {
    // JWT expired, invalid, or tampered
    return null;
  }
}

/**
 * Clear the code verifier cookie after successful exchange
 */
export async function clearCodeVerifier(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('oauth_verifier');
}

/**
 * Create secure signed state parameter for OAuth flow
 * Contains userId, projectId, nextUrl, and nonce with HMAC signature
 */
export function createSecureState(
  userId: string,
  projectId: string,
  nextUrl: string,
  nonce: string
): string {
  const stateData = {
    userId,
    projectId,
    nextUrl,
    nonce,
    expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
  };

  // Create HMAC signature for state integrity
  const signature = crypto
    .createHmac('sha256', OAUTH_STATE_SECRET!)
    .update(JSON.stringify(stateData))
    .digest('hex');

  const signedState = {
    data: stateData,
    signature
  };

  // Base64 encode the signed state
  return Buffer.from(JSON.stringify(signedState)).toString('base64');
}

/**
 * Verify and decode signed state parameter
 * Returns null if state is invalid, expired, or tampered
 */
export function verifySecureState(state: string): {
  userId: string;
  projectId: string;
  nextUrl: string;
  nonce: string;
} | null {
  try {
    // Decode Base64
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
    const { data: stateData, signature } = decoded;

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', OAUTH_STATE_SECRET!)
      .update(JSON.stringify(stateData))
      .digest('hex');

    if (signature !== expectedSignature) {
      return null;
    }

    // Check expiry
    if (Date.now() > stateData.expiresAt) {
      return null;
    }

    return {
      userId: stateData.userId,
      projectId: stateData.projectId,
      nextUrl: stateData.nextUrl,
      nonce: stateData.nonce
    };
  } catch (error) {
    return null;
  }
}

/**
 * Generate complete OAuth authorization URL
 * Handles PKCE, state generation, and nonce storage
 */
export async function generateOAuthURL(
  userId: string,
  projectId: string,
  nextUrl?: string
): Promise<string> {
  const { codeVerifier, codeChallenge } = generatePKCE();
  const nonce = crypto.randomBytes(16).toString('hex');

  // Store code verifier for later retrieval
  await storeCodeVerifier(nonce, codeVerifier);

  // Create secure state parameter
  const state = createSecureState(
    userId,
    projectId,
    nextUrl,
    nonce
  );

  // Build OAuth URL
  const authUrl = new URL('https://api.supabase.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', process.env.NEXT_PUBLIC_SUPABASE_OAUTH_CLIENT_ID!);
  authUrl.searchParams.set('response_type', 'code');

  const redirectUri = process.env.NODE_ENV === 'production'
    ? 'https://www.sheenapps.com/connect/supabase/callback'
    : 'http://localhost:3000/connect/supabase/callback';
  authUrl.searchParams.set('redirect_uri', redirectUri);

  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  // Add scopes for project and API key access
  authUrl.searchParams.set('scope', 'projects:read projects:write api-keys:read');

  return authUrl.toString();
}

/**
 * Validate environment variables for OAuth integration
 */
export function validateOAuthEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_OAUTH_CLIENT_ID) {
    errors.push('NEXT_PUBLIC_SUPABASE_OAUTH_CLIENT_ID is required');
  }

  if (!process.env.OAUTH_STATE_SECRET || process.env.OAUTH_STATE_SECRET.length < 32) {
    errors.push('OAUTH_STATE_SECRET must be at least 32 characters');
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
