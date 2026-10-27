/**
 * Runs a real PostgreSQL 17 server from npm-provided binaries — for machines
 * without Docker or a local Postgres install. Listens on the same port and
 * credentials as docker-compose.yml, so DATABASE_URL works unchanged.
 * Data persists in backend/.pgdata. Stop with Ctrl+C.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(here, '..', '.pgdata');
const port = Number(process.env.PGPORT ?? 5432);

const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: 'ledger',
  password: 'ledger',
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => undefined,
});

if (!fs.existsSync(path.join(databaseDir, 'PG_VERSION'))) {
  console.log(`initialising cluster in ${databaseDir}`);
  await pg.initialise();
}
await pg.start();

const client = pg.getPgClient('postgres');
await client.connect();
for (const name of ['ledger', 'ledger_test']) {
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (!rowCount) {
    await client.query(`CREATE DATABASE ${name}`);
    console.log(`created database ${name}`);
  }
}
await client.end();

console.log(`PostgreSQL running on localhost:${port} (user ledger / password ledger). Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => undefined, 1 << 30); // keep the process alive
