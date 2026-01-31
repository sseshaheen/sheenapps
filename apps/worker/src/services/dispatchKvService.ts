interface DispatchKvConfig {
  accountId: string;
  apiToken: string;
  kvNamespaceHostname: string;
  kvNamespaceBuilds: string;
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

function getDispatchKvConfig(): DispatchKvConfig {
  const config = {
    accountId: process.env.CF_ACCOUNT_ID || '',
    apiToken: process.env.CF_API_TOKEN_WORKERS || '',
    kvNamespaceHostname: process.env.CF_KV_NAMESPACE_HOSTNAME || '',
    kvNamespaceBuilds: process.env.CF_KV_NAMESPACE_BUILDS || ''
  };

  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing Cloudflare KV config: ${missing.join(', ')}`);
  }

  return config;
}

async function cfFetch(
  config: DispatchKvConfig,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(`${CF_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return response;
}

export async function updateHostnameMapping(
  config: DispatchKvConfig,
  hostname: string,
  projectId: string
): Promise<boolean> {
  try {
    const encodedNamespaceId = encodeURIComponent(config.kvNamespaceHostname);
    const encodedKey = encodeURIComponent(hostname);
    const response = await cfFetch(
      config,
      `/accounts/${config.accountId}/storage/kv/namespaces/${encodedNamespaceId}/values/${encodedKey}`,
      {
        method: 'PUT',
        body: projectId,
        headers: {
          'Content-Type': 'text/plain',
        },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteHostnameMapping(
  config: DispatchKvConfig,
  hostname: string
): Promise<boolean> {
  try {
    const encodedNamespaceId = encodeURIComponent(config.kvNamespaceHostname);
    const encodedKey = encodeURIComponent(hostname);
    const response = await cfFetch(
      config,
      `/accounts/${config.accountId}/storage/kv/namespaces/${encodedNamespaceId}/values/${encodedKey}`,
      {
        method: 'DELETE',
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function updateBuildMapping(
  config: DispatchKvConfig,
  projectId: string,
  buildId: string
): Promise<boolean> {
  try {
    const encodedNamespaceId = encodeURIComponent(config.kvNamespaceBuilds);
    const encodedKey = encodeURIComponent(projectId);
    const response = await cfFetch(
      config,
      `/accounts/${config.accountId}/storage/kv/namespaces/${encodedNamespaceId}/values/${encodedKey}`,
      {
        method: 'PUT',
        body: buildId,
        headers: {
          'Content-Type': 'text/plain',
        },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteBuildMapping(
  config: DispatchKvConfig,
  projectId: string
): Promise<boolean> {
  try {
    const encodedNamespaceId = encodeURIComponent(config.kvNamespaceBuilds);
    const encodedKey = encodeURIComponent(projectId);
    const response = await cfFetch(
      config,
      `/accounts/${config.accountId}/storage/kv/namespaces/${encodedNamespaceId}/values/${encodedKey}`,
      {
        method: 'DELETE',
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function listKvKeys(
  config: DispatchKvConfig,
  namespaceId: string
): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ limit: '1000' });
    if (cursor) params.set('cursor', cursor);
    const response = await cfFetch(
      config,
      `/accounts/${config.accountId}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/keys?${params.toString()}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      break;
    }

    const payload = await response.json();
    if (Array.isArray(payload.result)) {
      keys.push(...payload.result.map((item: { name: string }) => item.name));
    }
    cursor = payload.result_info?.cursor;
  } while (cursor);

  return keys;
}

export async function syncProjectMapping(params: {
  projectId: string;
  hostname: string;
  buildId: string;
  config?: DispatchKvConfig;
}): Promise<{ hostnameOk: boolean; buildOk: boolean }> {
  const config = params.config ?? getDispatchKvConfig();
  const hostnameOk = await updateHostnameMapping(config, params.hostname, params.projectId);
  const buildOk = await updateBuildMapping(config, params.projectId, params.buildId);
  return { hostnameOk, buildOk };
}

export type DispatchSyncOptions = {
  includeCustomDomains?: boolean;
  includePendingCustomDomains?: boolean;
  fullReconcile?: boolean;
  dryRun?: boolean;
};

export async function syncDispatchKvFromDb(options: DispatchSyncOptions = {}) {
  const { getDatabase } = await import('./database');
  const config = getDispatchKvConfig();
  const db = getDatabase();

  const includeCustomDomains = options.includeCustomDomains
    ?? (process.env.DISPATCH_MAP_CUSTOM_DOMAINS !== 'false');
  const includePending = options.includePendingCustomDomains
    ?? (process.env.DISPATCH_MAP_PENDING_CUSTOM_DOMAINS !== 'false');
  const fullReconcile = options.fullReconcile
    ?? (process.env.DISPATCH_KV_FULL_RECONCILE !== 'false');
  const dryRun = options.dryRun
    ?? (process.env.DISPATCH_KV_DRY_RUN === 'true');

  const statusFilter = includePending ? `IN ('pending', 'active')` : `IN ('active')`;

  const result = await db.query(
    `
      SELECT
        p.id as project_id,
        p.inhouse_subdomain,
        p.inhouse_build_id,
        cd.domain as custom_domain,
        cd.status as custom_status
      FROM projects p
      LEFT JOIN inhouse_custom_domains cd
        ON cd.project_id = p.id
        AND cd.status ${statusFilter}
      WHERE p.inhouse_subdomain IS NOT NULL
        AND p.inhouse_subdomain <> ''
        AND p.inhouse_build_id IS NOT NULL
      ORDER BY p.inhouse_deployed_at DESC NULLS LAST
    `
  );

  const desiredHostnames = new Set<string>();
  const desiredBuildKeys = new Set<string>();

  const normalizeDomain = (domain: string) => domain.trim().toLowerCase();

  for (const row of result.rows) {
    const subdomain = normalizeDomain(row.inhouse_subdomain);
    const hostname = subdomain.includes('.')
      ? subdomain
      : `${subdomain}.sheenapps.com`;

    desiredHostnames.add(hostname);
    desiredBuildKeys.add(row.project_id);

    if (includeCustomDomains && row.custom_domain) {
      desiredHostnames.add(normalizeDomain(row.custom_domain));
    }
  }

  // Write mappings
  for (const row of result.rows) {
    const buildId = row.inhouse_build_id;
    const projectId = row.project_id;
    const subdomain = row.inhouse_subdomain?.trim();
    if (!subdomain || !buildId) continue;

    const hostname = subdomain.includes('.')
      ? subdomain.toLowerCase()
      : `${subdomain.toLowerCase()}.sheenapps.com`;

    if (!dryRun) {
      await updateHostnameMapping(config, hostname, projectId);
      await updateBuildMapping(config, projectId, buildId);
    }

    if (includeCustomDomains && row.custom_domain) {
      if (!dryRun) {
        await updateHostnameMapping(config, row.custom_domain.trim().toLowerCase(), projectId);
      }
    }
  }

  if (fullReconcile) {
    const existingHostnames = await listKvKeys(config, config.kvNamespaceHostname);
    for (const hostname of existingHostnames) {
      if (!desiredHostnames.has(hostname)) {
        if (!dryRun) {
          await deleteHostnameMapping(config, hostname);
        }
      }
    }

    const existingBuildKeys = await listKvKeys(config, config.kvNamespaceBuilds);
    for (const projectId of existingBuildKeys) {
      if (!desiredBuildKeys.has(projectId)) {
        if (!dryRun) {
          await deleteBuildMapping(config, projectId);
        }
      }
    }
  }
}

export { getDispatchKvConfig };
