import 'dotenv/config';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://ledger:ledger@localhost:5432/ledger_test';
