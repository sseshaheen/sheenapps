/*
 * Neon Postgres Smoke Test (In-House Mode)
 *
 * Usage:
 *   node scripts/inhouse-neon-smoke.js
 *
 * Required env:
 *   DATABASE_URL
 */

const { Client } = require('pg')

async function run() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not configured')
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  const ping = await client.query('SELECT 1 as ok')
  const current = await client.query('SELECT current_database() as name')

  console.log('[Neon Smoke] Ping:', ping.rows[0])
  console.log('[Neon Smoke] Database:', current.rows[0])

  await client.end()
  console.log('[Neon Smoke] Success')
}

run().catch((error) => {
  console.error('[Neon Smoke] Failed:', error.message)
  process.exit(1)
})
