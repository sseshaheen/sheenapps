import fetch from 'node-fetch';

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '9a81e730a78395926ac4a371c6028a4d';
const CF_KV_NAMESPACE_ID = process.env.CF_KV_NAMESPACE_ID || ''; // To be created
const CF_API_TOKEN = process.env.CF_API_TOKEN_WORKERS || 'T01Go052Hdljsgm_BaVa9g8Ypmxr_QNTMcUWZ_nR';

const KV_BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces`;

export interface LatestVersionData {
  latestVersionId: string;
  previewUrl: string;
  timestamp: number;
}

// KV key format: {userId}:{projectId}
export function getKVKey(userId: string, projectId: string): string {
  return `${userId}:${projectId}`;
}

// Get latest version from KV
export async function getLatestVersion(
  userId: string,
  projectId: string
): Promise<LatestVersionData | null> {
  if (!CF_KV_NAMESPACE_ID) {
    console.warn('CF_KV_NAMESPACE_ID not configured, skipping KV lookup');
    return null;
  }

  const key = getKVKey(userId, projectId);
  
  try {
    const response = await fetch(
      `${KV_BASE_URL}/${CF_KV_NAMESPACE_ID}/values/${key}`,
      {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`KV fetch failed: ${response.statusText}`);
    }

    const data = await response.json() as LatestVersionData;
    return data;
  } catch (error) {
    console.error('Error fetching from KV:', error);
    return null;
  }
}

// Set latest version in KV with TTL
export async function setLatestVersion(
  userId: string,
  projectId: string,
  data: LatestVersionData,
  ttlSeconds: number = 90 * 24 * 60 * 60 // 90 days default
): Promise<boolean> {
  if (!CF_KV_NAMESPACE_ID) {
    console.warn('CF_KV_NAMESPACE_ID not configured, skipping KV write');
    return false;
  }

  const key = getKVKey(userId, projectId);
  
  try {
    const response = await fetch(
      `${KV_BASE_URL}/${CF_KV_NAMESPACE_ID}/values/${key}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          value: JSON.stringify(data),
          metadata: {
            userId,
            projectId,
            updatedAt: new Date().toISOString(),
          },
          expiration_ttl: ttlSeconds,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`KV write failed: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Error writing to KV:', error);
    return false;
  }
}

// Delete version from KV (for cleanup)
export async function deleteLatestVersion(
  userId: string,
  projectId: string
): Promise<boolean> {
  if (!CF_KV_NAMESPACE_ID) {
    console.warn('CF_KV_NAMESPACE_ID not configured, skipping KV delete');
    return false;
  }

  const key = getKVKey(userId, projectId);
  
  try {
    const response = await fetch(
      `${KV_BASE_URL}/${CF_KV_NAMESPACE_ID}/values/${key}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`KV delete failed: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting from KV:', error);
    return false;
  }
}

// Initialize KV namespace (run once during setup)
export async function createKVNamespace(name: string = 'claude-builder-versions'): Promise<string | null> {
  try {
    const response = await fetch(KV_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: name }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create KV namespace: ${response.statusText}`);
    }

    const data = await response.json() as { result: { id: string } };
    console.log(`Created KV namespace: ${data.result.id}`);
    return data.result.id;
  } catch (error) {
    console.error('Error creating KV namespace:', error);
    return null;
  }
}