import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { withTransaction } from '../../db/withTransaction';
import { AppError, insufficientBalance } from '../../lib/errors';
import { pageMeta, type PageRequest } from '../../lib/pagination';
import { applyBalanceChange, getAccount, lockAccount } from '../accounts/accounts.service';

export type TransactionType = 'credit' | 'debit';

export interface Transaction {
  id: string;
  account_id: string;
  type: TransactionType;
  amount: number;
  description: string;
  reference_id: string;
  transfer_id: string | null;
  created_at: Date;
}

export interface NewTransaction {
  type: TransactionType;
  amount: string; // canonical decimal string, see lib/money.ts
  description: string;
  reference_id: string;
}

export const TRANSACTION_COLUMNS =
  'id, account_id, type, amount, description, reference_id, transfer_id, created_at';

export async function findByReference(
  client: PoolClient,
  accountId: string,
  referenceId: string,
): Promise<Transaction | undefined> {
  const { rows } = await client.query<Transaction>(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE account_id = $1 AND reference_id = $2`,
    [accountId, referenceId],
  );
  return rows[0];
}

export async function insertTransaction(
  client: PoolClient,
  accountId: string,
  tx: NewTransaction & { transfer_id?: string },
): Promise<Transaction> {
  const { rows } = await client.query<Transaction>(
    `INSERT INTO transactions (account_id, type, amount, description, reference_id, transfer_id)
     VALUES ($1, $2, $3::numeric, $4, $5, $6)
     RETURNING ${TRANSACTION_COLUMNS}`,
    [accountId, tx.type, tx.amount, tx.description, tx.reference_id, tx.transfer_id ?? null],
  );
  return rows[0];
}

/**
 * Records a credit or debit and applies it to the account balance atomically.
 * The account row is locked first, so the duplicate check, the funds check and
 * the write all see a consistent, un-raced view of that account.
 */
export async function createTransaction(accountId: string, input: NewTransaction) {
  return withTransaction(async (client) => {
    const account = await lockAccount(client, accountId);

    const existing = await findByReference(client, accountId, input.reference_id);
    if (existing) {
      throw new AppError(
        409,
        'DUPLICATE_TRANSACTION',
        `A transaction with reference_id '${input.reference_id}' already exists for this account`,
        { transaction: existing },
      );
    }

    const amount = Number(input.amount);
    if (input.type === 'debit' && account.balance < amount) {
      throw insufficientBalance(accountId, account.balance, amount);
    }

    const transaction = await insertTransaction(client, accountId, input);
    const balance = await applyBalanceChange(client, accountId, input.type, input.amount);
    return { transaction, balance };
  });
}

export async function listTransactions(
  accountId: string,
  filter: { type?: TransactionType },
  pageRequest: PageRequest,
) {
  await getAccount(accountId); // 404 for unknown accounts rather than an empty list

  const params: unknown[] = [accountId];
  let where = 'account_id = $1';
  if (filter.type) {
    params.push(filter.type);
    where += ` AND type = $${params.length}`;
  }

  const [{ rows }, count] = await Promise.all([
    pool.query<Transaction>(
      `SELECT ${TRANSACTION_COLUMNS} FROM transactions
       WHERE ${where}
       ORDER BY created_at DESC, seq DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageRequest.limit, pageRequest.offset],
    ),
    pool.query<{ total: number }>(`SELECT count(*) AS total FROM transactions WHERE ${where}`, params),
  ]);

  return { data: rows, pagination: pageMeta(pageRequest, count.rows[0].total) };
}

export async function getTransaction(id: string): Promise<Transaction> {
  const { rows } = await pool.query<Transaction>(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) {
    throw new AppError(404, 'TRANSACTION_NOT_FOUND', `Transaction '${id}' was not found`);
  }
  return rows[0];
}
