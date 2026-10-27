import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { accountNotFound } from '../../lib/errors';
import { pageMeta, type PageRequest } from '../../lib/pagination';

export interface Account {
  id: string;
  name: string;
  balance: number;
  created_at: Date;
}

const ACCOUNT_COLUMNS = 'id, name, balance, created_at';

export async function createAccount(name: string): Promise<Account> {
  // balance is intentionally omitted: it always starts at the column default of 0.
  const { rows } = await pool.query<Account>(
    `INSERT INTO accounts (name) VALUES ($1) RETURNING ${ACCOUNT_COLUMNS}`,
    [name],
  );
  return rows[0];
}

export async function getAccount(id: string): Promise<Account> {
  const { rows } = await pool.query<Account>(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = $1`, [id]);
  if (rows.length === 0) throw accountNotFound(id);
  return rows[0];
}

export async function listAccounts(pageRequest: PageRequest) {
  const [{ rows }, count] = await Promise.all([
    pool.query<Account>(
      `SELECT ${ACCOUNT_COLUMNS} FROM accounts ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
      [pageRequest.limit, pageRequest.offset],
    ),
    pool.query<{ total: number }>('SELECT count(*) AS total FROM accounts'),
  ]);
  return { data: rows, pagination: pageMeta(pageRequest, count.rows[0].total) };
}

/** Ledger-wide totals for the dashboard. */
export async function getSummary() {
  const { rows } = await pool.query<{
    accounts: number;
    total_balance: number;
    transactions: number;
    transfers: number;
  }>(`
    SELECT (SELECT count(*) FROM accounts)                    AS accounts,
           (SELECT COALESCE(SUM(balance), 0) FROM accounts)   AS total_balance,
           (SELECT count(*) FROM transactions)                AS transactions,
           (SELECT count(*) FROM transfers)                   AS transfers`);
  return rows[0];
}

/**
 * Loads an account and takes a row lock on it for the rest of the surrounding DB
 * transaction. Every balance-changing operation goes through here, so writes to
 * the same account are serialised and balance checks cannot race.
 */
export async function lockAccount(client: PoolClient, id: string): Promise<Account> {
  const { rows } = await client.query<Account>(
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (rows.length === 0) throw accountNotFound(id);
  return rows[0];
}

/** Locks several accounts in a deterministic (id) order so concurrent transfers cannot deadlock. */
export async function lockAccounts(client: PoolClient, ids: string[]): Promise<Map<string, Account>> {
  const { rows } = await client.query<Account>(
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [ids],
  );
  const byId = new Map(rows.map((a) => [a.id, a]));
  for (const id of ids) if (!byId.has(id)) throw accountNotFound(id);
  return byId;
}

export async function applyBalanceChange(
  client: PoolClient,
  accountId: string,
  type: 'credit' | 'debit',
  amount: string,
): Promise<number> {
  const operator = type === 'credit' ? '+' : '-';
  const { rows } = await client.query<{ balance: number }>(
    `UPDATE accounts SET balance = balance ${operator} $2::numeric WHERE id = $1 RETURNING balance`,
    [accountId, amount],
  );
  return rows[0].balance;
}
