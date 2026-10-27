import { describe, expect, it } from 'vitest';
import { api, createAccount, postTransaction, useCleanDatabase } from './helpers';

useCleanDatabase();

async function seed(accountId: string) {
  // 6 credits and 4 debits, created in a known order: t1 (oldest) .. t10 (newest)
  const types = ['credit', 'credit', 'debit', 'credit', 'debit', 'credit', 'credit', 'debit', 'credit', 'debit'];
  for (const [i, type] of types.entries()) {
    await postTransaction(accountId, { type, amount: type === 'credit' ? 10 : 1, reference_id: `t${i + 1}` }).expect(201);
  }
}

const refs = (body: { data: { reference_id: string }[] }) => body.data.map((t) => t.reference_id);

describe('GET /api/accounts/:id/transactions', () => {
  it('returns all transactions latest first with default pagination', async () => {
    const id = await createAccount();
    await seed(id);
    const res = await api().get(`/api/accounts/${id}/transactions`).expect(200);
    expect(refs(res.body)).toEqual(['t10', 't9', 't8', 't7', 't6', 't5', 't4', 't3', 't2', 't1']);
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total_records: 10, total_pages: 1 });
  });

  it('filters by type', async () => {
    const id = await createAccount();
    await seed(id);
    const credits = await api().get(`/api/accounts/${id}/transactions?type=credit`).expect(200);
    expect(refs(credits.body)).toEqual(['t9', 't7', 't6', 't4', 't2', 't1']);
    expect(credits.body.pagination.total_records).toBe(6);

    const debits = await api().get(`/api/accounts/${id}/transactions?type=debit`).expect(200);
    expect(refs(debits.body)).toEqual(['t10', 't8', 't5', 't3']);
    expect(debits.body.data.every((t: { type: string }) => t.type === 'debit')).toBe(true);
  });

  it('paginates with page and limit', async () => {
    const id = await createAccount();
    await seed(id);
    const p2 = await api().get(`/api/accounts/${id}/transactions?page=2&limit=3`).expect(200);
    expect(refs(p2.body)).toEqual(['t7', 't6', 't5']);
    expect(p2.body.pagination).toEqual({ page: 2, limit: 3, total_records: 10, total_pages: 4 });

    const last = await api().get(`/api/accounts/${id}/transactions?page=4&limit=3`).expect(200);
    expect(refs(last.body)).toEqual(['t1']);

    const beyond = await api().get(`/api/accounts/${id}/transactions?page=9&limit=3`).expect(200);
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.pagination.total_pages).toBe(4);

    const filtered = await api().get(`/api/accounts/${id}/transactions?type=credit&page=2&limit=4`).expect(200);
    expect(refs(filtered.body)).toEqual(['t2', 't1']);
    expect(filtered.body.pagination).toEqual({ page: 2, limit: 4, total_records: 6, total_pages: 2 });
  });

  it('returns an empty page for an account with no transactions', async () => {
    const id = await createAccount();
    const res = await api().get(`/api/accounts/${id}/transactions`).expect(200);
    expect(res.body).toEqual({ data: [], pagination: { page: 1, limit: 10, total_records: 0, total_pages: 0 } });
  });

  it.each(['page=0', 'page=-1', 'page=abc', 'page=1.5', 'limit=0', 'limit=101', 'limit=x', 'page=1&page=2'])(
    'rejects invalid pagination %s',
    async (query) => {
      const id = await createAccount();
      const res = await api().get(`/api/accounts/${id}/transactions?${query}`).expect(400);
      expect(res.body.error.code).toBe('INVALID_PAGINATION');
    },
  );

  it('rejects an invalid type filter', async () => {
    const id = await createAccount();
    const res = await api().get(`/api/accounts/${id}/transactions?type=refund`).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for an unknown account', async () => {
    const res = await api().get('/api/accounts/3f8e1c9a-0000-4000-8000-000000000000/transactions').expect(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });
});
