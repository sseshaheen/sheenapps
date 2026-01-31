/**
 * Database Timeout Utility
 *
 * Provides safe statement timeout handling for PostgreSQL queries.
 * Uses SET LOCAL inside a transaction to prevent timeout settings
 * from leaking to other connections in the pool.
 */

import { Pool, PoolClient } from 'pg'

/**
 * Execute a function with a statement timeout, properly scoped to a transaction.
 *
 * IMPORTANT: Using SET statement_timeout without a transaction can leak
 * the setting to other connections in the pool. This helper ensures the
 * timeout is scoped using SET LOCAL inside a transaction.
 *
 * @param pool - The database pool
 * @param timeout - Timeout value (e.g., '5s', '10s', '30s')
 * @param fn - Function to execute with the scoped timeout
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const result = await withStatementTimeout(pool, '5s', async (client) => {
 *   const countResult = await client.query('SELECT COUNT(*) FROM large_table')
 *   const dataResult = await client.query('SELECT * FROM large_table LIMIT 100')
 *   return { count: countResult.rows[0].count, data: dataResult.rows }
 * })
 * ```
 */
export async function withStatementTimeout<T>(
  pool: Pool,
  timeout: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL statement_timeout = $1`, [timeout])
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ignore rollback errors
    }
    throw error
  } finally {
    client.release()
  }
}
