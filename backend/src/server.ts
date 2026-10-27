import { createApp } from './app';
import { config } from './config';
import { pool } from './db/pool';

const server = createApp().listen(config.port, () => {
  console.log(`Ledger API listening on http://localhost:${config.port}`);
  console.log(`API docs at http://localhost:${config.port}/docs`);
});

function shutdown() {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
