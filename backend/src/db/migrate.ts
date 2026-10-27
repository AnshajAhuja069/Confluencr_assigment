import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { config } from '../config';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/** Applies every not-yet-applied `*.sql` file in src/migrations, in filename order. */
export async function migrate(connectionString: string, log = console.log): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text        PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    // Serialise concurrent migrate runs.
    await client.query('SELECT pg_advisory_lock(727274)');

    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrate(config.databaseUrl)
    .then(() => console.log('migrations up to date'))
    .catch((err) => {
      console.error('migration failed:', err.message);
      process.exit(1);
    });
}
