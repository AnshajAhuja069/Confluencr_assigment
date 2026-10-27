import { describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool';
import { api, balanceOf, createAccount, credit, postTransaction, useCleanDatabase } from './helpers';

useCleanDatabase();

describe('transaction immutability', () => {
  it('exposes no way to edit or delete a transaction through the API', async () => {
    const id = await createAccount();
    const txId = (await credit(id, 10)).body.data.transaction.id;

    for (const method of ['put', 'patch', 'delete'] as const) {
      const res = await api()[method](`/api/transactions/${txId}`).send({ amount: 999 }).expect(405);
      expect(res.body.error.code).toBe('METHOD_NOT_ALLOWED');
      expect(res.headers.allow).toBe('GET');
    }
    await api().delete(`/api/accounts/${id}/transactions`).expect(405);

    const tx = await api().get(`/api/transactions/${txId}`).expect(200);
    expect(tx.body.data.amount).toBe(10);
    expect(await balanceOf(id)).toBe(10);
  });

  it('is enforced by the database even for direct SQL', async () => {
    const id = await createAccount();
    const txId = (await credit(id, 10)).body.data.transaction.id;
    await expect(pool.query('UPDATE transactions SET amount = 999 WHERE id = $1', [txId])).rejects.toThrow(/immutable/);
    await expect(pool.query('DELETE FROM transactions WHERE id = $1', [txId])).rejects.toThrow(/immutable/);
  });
});

describe('database constraints', () => {
  it('never allows a negative balance', async () => {
    const id = await createAccount();
    await expect(pool.query('UPDATE accounts SET balance = -1 WHERE id = $1', [id])).rejects.toThrow(/accounts_balance_check/);
  });

  it('enforces reference_id uniqueness per account', async () => {
    const id = await createAccount();
    await credit(id, 1);
    const insert = () =>
      pool.query(`INSERT INTO transactions (account_id, type, amount, reference_id) VALUES ($1, 'credit', 1, 'same')`, [id]);
    await insert();
    await expect(insert()).rejects.toThrow(/transactions_account_reference_unique/);
  });
});

describe('balance consistency', () => {
  it('balance always equals the sum of the account ledger', async () => {
    const id = await createAccount();
    await credit(id, 100);
    await postTransaction(id, { type: 'debit', amount: 30, reference_id: 'd1' }).expect(201);
    await postTransaction(id, { type: 'debit', amount: 500, reference_id: 'd2' }).expect(422);
    await credit(id, 12.34);

    const { rows } = await pool.query(
      `SELECT a.balance,
              COALESCE(SUM(CASE t.type WHEN 'credit' THEN t.amount ELSE -t.amount END), 0) AS ledger
         FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
        WHERE a.id = $1 GROUP BY a.balance`,
      [id],
    );
    expect(rows[0].balance).toBe(82.34);
    expect(rows[0].ledger).toBe(82.34);
  });
});

describe('concurrency', () => {
  it('concurrent debits can never overdraw the account', async () => {
    const id = await createAccount();
    await credit(id, 100);

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => postTransaction(id, { type: 'debit', amount: 20, reference_id: `c${i}` })),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 422)).toHaveLength(5);
    expect(await balanceOf(id)).toBe(0);
  });

  it('concurrent requests with the same reference_id create exactly one transaction', async () => {
    const id = await createAccount();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => postTransaction(id, { type: 'credit', amount: 25, reference_id: 'same' })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect(await balanceOf(id)).toBe(25);
  });

  it('concurrent credits are all applied', async () => {
    const id = await createAccount();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => postTransaction(id, { type: 'credit', amount: 1.5, reference_id: `p${i}` }).expect(201)),
    );
    expect(await balanceOf(id)).toBe(30);
  });
});
