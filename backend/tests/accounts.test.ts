import { describe, expect, it } from 'vitest';
import { api, createAccount, useCleanDatabase } from './helpers';

useCleanDatabase();

describe('POST /api/accounts', () => {
  it('creates an account with a zero balance and server-generated fields', async () => {
    const res = await api().post('/api/accounts').send({ name: '  Alice  ' }).expect(201);
    expect(res.body.data).toMatchObject({ name: 'Alice', balance: 0 });
    expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(res.body.data.created_at).toString()).not.toBe('Invalid Date');
    expect(res.headers.location).toBe(`/api/accounts/${res.body.data.id}`);
  });

  it('gives every account a unique id', async () => {
    const ids = await Promise.all([createAccount('A'), createAccount('B'), createAccount('C')]);
    expect(new Set(ids).size).toBe(3);
  });

  it.each([
    [{}, 'name: is required'],
    [{ name: '   ' }, 'name: is required'],
    [{ name: 42 }, 'name: must be a string'],
  ])('rejects invalid name %j', async (body, message) => {
    const res = await api().post('/api/accounts').send(body).expect(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message });
  });

  it('does not let the client set the initial balance or id', async () => {
    for (const extra of [{ balance: 500 }, { id: '00000000-0000-0000-0000-000000000000' }]) {
      const res = await api().post('/api/accounts').send({ name: 'Mallory', ...extra }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const list = await api().get('/api/accounts').expect(200);
    expect(list.body.pagination.total_records).toBe(0);
  });

  it('rejects malformed JSON and non-object bodies', async () => {
    const bad = await api()
      .post('/api/accounts')
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');

    const arr = await api().post('/api/accounts').send([{ name: 'x' }]).expect(400);
    expect(arr.body.error.code).toBe('INVALID_REQUEST_BODY');

    const text = await api().post('/api/accounts').set('Content-Type', 'text/plain').send('name=x').expect(400);
    expect(text.body.error.code).toBe('INVALID_REQUEST_BODY');
  });
});

describe('GET /api/accounts/:id and /balance', () => {
  it('returns the account and its balance', async () => {
    const id = await createAccount('Bob');
    const account = await api().get(`/api/accounts/${id}`).expect(200);
    expect(account.body.data).toMatchObject({ id, name: 'Bob', balance: 0 });

    const balance = await api().get(`/api/accounts/${id}/balance`).expect(200);
    expect(balance.body).toEqual({ data: { account_id: id, balance: 0 } });
  });

  it('returns 404 for an unknown account and 400 for a malformed id', async () => {
    const missing = await api().get('/api/accounts/3f8e1c9a-0000-4000-8000-000000000000/balance').expect(404);
    expect(missing.body.error.code).toBe('ACCOUNT_NOT_FOUND');

    const malformed = await api().get('/api/accounts/123/balance').expect(400);
    expect(malformed.body.error.code).toBe('INVALID_ACCOUNT_ID');
  });
});

describe('GET /api/accounts', () => {
  it('lists accounts newest first with pagination', async () => {
    await createAccount('First');
    await createAccount('Second');
    await createAccount('Third');
    const res = await api().get('/api/accounts?limit=2').expect(200);
    expect(res.body.data.map((a: { name: string }) => a.name)).toEqual(['Third', 'Second']);
    expect(res.body.pagination).toEqual({ page: 1, limit: 2, total_records: 3, total_pages: 2 });
  });
});

describe('GET /api/summary', () => {
  it('reports ledger-wide totals', async () => {
    const empty = await api().get('/api/summary').expect(200);
    expect(empty.body.data).toEqual({ accounts: 0, total_balance: 0, transactions: 0, transfers: 0 });

    const a = await createAccount('Akshat');
    const b = await createAccount('Anshaj');
    await api().post(`/api/accounts/${a}/transactions`).send({ type: 'credit', amount: 100, reference_id: 's1' }).expect(201);
    await api().post('/api/transfers').send({ from_account_id: a, to_account_id: b, amount: 40, reference_id: 't1' }).expect(201);

    const res = await api().get('/api/summary').expect(200);
    expect(res.body.data).toEqual({ accounts: 2, total_balance: 100, transactions: 3, transfers: 1 });
  });
});

describe('unknown routes', () => {
  it('return a consistent 404 error', async () => {
    const res = await api().get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
