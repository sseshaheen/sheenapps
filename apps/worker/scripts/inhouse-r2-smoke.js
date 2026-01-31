/*
 * R2 Smoke Test (In-House Mode)
 *
 * Usage:
 *   node scripts/inhouse-r2-smoke.js
 *
 * Required env:
 *   CF_ACCOUNT_ID
 *   CF_API_TOKEN_R2 (or CF_API_TOKEN_WORKERS)
 *   CF_R2_BUCKET_BUILDS (or CF_R2_BUCKET_MEDIA or R2_BUCKET_NAME)
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

function getEnv(name) {
  return process.env[name] || ''
}

function requireEnv(name) {
  const value = getEnv(name)
  if (!value) {
    throw new Error(`Missing env: ${name}`)
  }
  return value
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function request(url, options) {
  const response = await fetch(url, options)
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${text}`)
  }
  return data
}

async function run() {
  const accountId = requireEnv('CF_ACCOUNT_ID')
  const apiToken = getEnv('CF_API_TOKEN_R2') || requireEnv('CF_API_TOKEN_WORKERS')
  const bucketName = getEnv('CF_R2_BUCKET_BUILDS') || getEnv('CF_R2_BUCKET_MEDIA') || requireEnv('R2_BUCKET_NAME')

  const key = `smoke-test/${Date.now()}-ok.txt`
  const objectUrl = `${CF_API_BASE}/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/objects/${encodePath(key)}`

  console.log(`[R2 Smoke] Uploading ${key}`)
  await request(objectUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'text/plain'
    },
    body: 'ok'
  })

  console.log('[R2 Smoke] Listing objects')
  const listUrl = `${CF_API_BASE}/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/objects?prefix=smoke-test/`
  await request(listUrl, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiToken}` }
  })

  console.log('[R2 Smoke] Fetching object')
  await request(objectUrl, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiToken}` }
  })

  console.log('[R2 Smoke] Deleting object')
  await request(objectUrl, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiToken}` }
  })

  console.log('[R2 Smoke] Success')
}

run().catch((error) => {
  console.error('[R2 Smoke] Failed:', error.message)
  process.exit(1)
})
