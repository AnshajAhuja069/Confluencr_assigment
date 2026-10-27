import { describe, expect, it } from 'vitest';
import { api, balanceOf, createAccount, credit, postTransaction, ref, useCleanDatabase } from './helpers';

useCleanDatabase();

describe('POST /api/accounts/:id/transactions', () => {
  it('credits increase and debits decrease the balance', async () => {
    const id = await createAccount();
    const c = await postTransaction(id, {
      type: 'credit',
      amount: 100,
      description: 'Salary',
      reference_id: 'salary-1',
    }).expect(201);
    expect(c.body.data.balance).toBe(100);
    expect(c.body.data.transaction).toMatchObject({
      account_id: id,
      type: 'credit',
      amount: 100,
      description: 'Salary',
      reference_id: 'salary-1',
      transfer_id: null,
    });
    expect(c.headers.location).toBe(`/api/transactions/${c.body.data.transaction.id}`);

    const d = await postTransaction(id, { type: 'debit', amount: 30, reference_id: 'pos-1' }).expect(201);
    expect(d.body.data.balance).toBe(70);
    expect(await balanceOf(id)).toBe(70);
  });

  it('matches the balance-consistency example from the spec (0 +100 +50 -30 -20 = 100)', async () => {
    const id = await createAccount();
    for (const [type, amount] of [['credit', 100], ['credit', 50], ['debit', 30], ['debit', 20]] as const) {
      await postTransaction(id, { type, amount, reference_id: ref() }).expect(201);
    }
    expect(await balanceOf(id)).toBe(100);
  });

  it('rejects a debit larger than the balance and leaves the balance unchanged', async () => {
    const id = await createAccount();
    await credit(id, 100);
    const res = await postTransaction(id, { type: 'debit', amount: 150, reference_id: 'big' }).expect(422);
    expect(res.body.error).toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      details: { balance: 100, requested_amount: 150 },
    });
    expect(await balanceOf(id)).toBe(100);

    const history = await api().get(`/api/accounts/${id}/transactions`).expect(200);
    expect(history.body.pagination.total_records).toBe(1);
  });

  it('allows a debit of exactly the full balance', async () => {
    const id = await createAccount();
    await credit(id, 42.5);
    await postTransaction(id, { type: 'debit', amount: '42.50', reference_id: 'all' }).expect(201);
    expect(await balanceOf(id)).toBe(0);
  });

  it('handles decimal amounts exactly', async () => {
    const id = await createAccount();
    await credit(id, 0.1);
    await credit(id, 0.2);
    expect(await balanceOf(id)).toBe(0.3);
  });

  describe('duplicate reference_id', () => {
    it('does not create a second transaction or change the balance', async () => {
      const id = await createAccount();
      const first = await postTransaction(id, { type: 'credit', amount: 100, reference_id: 'dup' }).expect(201);
      const again = await postTransaction(id, { type: 'credit', amount: 100, reference_id: 'dup' }).expect(409);
      expect(again.body.error.code).toBe('DUPLICATE_TRANSACTION');
      expect(again.body.error.details.transaction.id).toBe(first.body.data.transaction.id);

      // A different payload with the same reference is still a duplicate.
      await postTransaction(id, { type: 'debit', amount: 5, reference_id: 'dup' }).expect(409);

      expect(await balanceOf(id)).toBe(100);
      const history = await api().get(`/api/accounts/${id}/transactions`).expect(200);
      expect(history.body.pagination.total_records).toBe(1);
    });

    it('treats a reference as a duplicate even if the original was a debit that later could not be repeated', async () => {
      const id = await createAccount();
      await credit(id, 50);
      await postTransaction(id, { type: 'debit', amount: 50, reference_id: 'once' }).expect(201);
      // Balance is now 0; the retry must report "duplicate", not "insufficient balance".
      const retry = await postTransaction(id, { type: 'debit', amount: 50, reference_id: 'once' }).expect(409);
      expect(retry.body.error.code).toBe('DUPLICATE_TRANSACTION');
    });

    it('allows the same reference_id on different accounts', async () => {
      const a = await createAccount('A');
      const b = await createAccount('B');
      await postTransaction(a, { type: 'credit', amount: 10, reference_id: 'shared' }).expect(201);
      await postTransaction(b, { type: 'credit', amount: 20, reference_id: 'shared' }).expect(201);
      expect(await balanceOf(a)).toBe(10);
      expect(await balanceOf(b)).toBe(20);
    });

    it('does not consume the reference when the transaction was rejected', async () => {
      const id = await createAccount();
      await postTransaction(id, { type: 'debit', amount: 10, reference_id: 'retry-me' }).expect(422);
      await credit(id, 10);
      await postTransaction(id, { type: 'debit', amount: 10, reference_id: 'retry-me' }).expect(201);
    });
  });

  describe('validation', () => {
    it('returns 404 for an unknown account and 400 for a malformed account id', async () => {
      const body = { type: 'credit', amount: 1, reference_id: 'x' };
      const missing = await postTransaction('3f8e1c9a-0000-4000-8000-000000000000', body).expect(404);
      expect(missing.body.error.code).toBe('ACCOUNT_NOT_FOUND');
      const malformed = await postTransaction('abc', body).expect(400);
      expect(malformed.body.error.code).toBe('INVALID_ACCOUNT_ID');
    });

    it.each([
      [{ type: 'transfer', amount: 1, reference_id: 'r' }, 'type', "must be either 'credit' or 'debit'"],
      [{ type: 'CREDIT', amount: 1, reference_id: 'r' }, 'type', "must be either 'credit' or 'debit'"],
      [{ amount: 1, reference_id: 'r' }, 'type', "must be either 'credit' or 'debit'"],
      [{ type: 'credit', amount: 0, reference_id: 'r' }, 'amount', 'must be greater than 0'],
      [{ type: 'credit', amount: -5, reference_id: 'r' }, 'amount', 'must be greater than 0'],
      [{ type: 'credit', amount: '-5', reference_id: 'r' }, 'amount', 'must be greater than 0'],
      [{ type: 'credit', amount: 1.234, reference_id: 'r' }, 'amount', 'must be a positive number with at most 2 decimal places'],
      [{ type: 'credit', amount: 'abc', reference_id: 'r' }, 'amount', 'must be a positive number with at most 2 decimal places'],
      [{ type: 'credit', amount: null, reference_id: 'r' }, 'amount', 'must be a number'],
      [{ type: 'credit', amount: 1e21, reference_id: 'r' }, 'amount', 'must be a positive number with at most 2 decimal places'],
      [{ type: 'credit', amount: 99999999999999, reference_id: 'r' }, 'amount', 'must not exceed 9999999999999.99'],
      [{ type: 'credit', amount: 1 }, 'reference_id', 'is required'],
      [{ type: 'credit', amount: 1, reference_id: '   ' }, 'reference_id', 'is required'],
      [{ type: 'credit', amount: 1, reference_id: 7 }, 'reference_id', 'must be a string'],
      [{ type: 'credit', amount: 1, reference_id: 'r', description: 5 }, 'description', 'must be a string'],
    ])('rejects %j (%s)', async (body, field, message) => {
      const id = await createAccount();
      const res = await postTransaction(id, body).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toContainEqual({ field, message });
      expect(await balanceOf(id)).toBe(0);
    });

    it('rejects client-supplied server fields', async () => {
      const id = await createAccount();
      const res = await postTransaction(id, {
        type: 'credit',
        amount: 1,
        reference_id: 'r',
        created_at: '2000-01-01T00:00:00Z',
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

describe('GET /api/transactions/:id', () => {
  it('returns a single transaction', async () => {
    const id = await createAccount();
    const created = await credit(id, 5);
    const txId = created.body.data.transaction.id;
    const res = await api().get(`/api/transactions/${txId}`).expect(200);
    expect(res.body.data).toMatchObject({ id: txId, amount: 5, type: 'credit' });
  });

  it('returns 404 / 400 for unknown or malformed ids', async () => {
    await api().get('/api/transactions/3f8e1c9a-0000-4000-8000-000000000000').expect(404);
    const res = await api().get('/api/transactions/zzz').expect(400);
    expect(res.body.error.code).toBe('INVALID_TRANSACTION_ID');
  });
});
