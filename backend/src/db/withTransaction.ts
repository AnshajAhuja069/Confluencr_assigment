import type { PoolClient } from 'pg';
import { pool } from './pool';

/**
 * Runs `work` inside a single database transaction.
 * Commits if it resolves, rolls back if it throws — so a balance update and the
 * transaction row it belongs to are either both persisted or neither is.
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
