import { describe, expect, it } from 'vitest';
import { api, balanceOf, createAccount, credit, useCleanDatabase } from './helpers';

useCleanDatabase();

const MISSING = '3f8e1c9a-0000-4000-8000-000000000000';

async function setupAB() {
  const a = await createAccount('A');
  const b = await createAccount('B');
  await credit(a, 100);
  await credit(b, 50);
  return { a, b };
}

const transfer = (body: Record<string, unknown>) => api().post('/api/transfers').send(body);

describe('POST /api/transfers', () => {
  it('moves money atomically (spec example: A 100, B 50, transfer 30 -> A 70, B 80)', async () => {
    const { a, b } = await setupAB();
    const res = await transfer({ from_account_id: a, to_account_id: b, amount: 30, reference_id: 'tr-1' }).expect(201);

    const { data } = res.body;
    expect(data.from_account).toEqual({ account_id: a, balance: 70 });
    expect(data.to_account).toEqual({ account_id: b, balance: 80 });
    expect(data.transfer).toMatchObject({ from_account_id: a, to_account_id: b, amount: 30, reference_id: 'tr-1' });
    expect(data.debit_transaction).toMatchObject({ account_id: a, type: 'debit', amount: 30, transfer_id: data.transfer.id, description: 'Transfer to B' });
    expect(data.credit_transaction).toMatchObject({ account_id: b, type: 'credit', amount: 30, transfer_id: data.transfer.id, description: 'Transfer from A' });

    expect(await balanceOf(a)).toBe(70);
    expect(await balanceOf(b)).toBe(80);

    const history = await api().get(`/api/accounts/${a}/transactions`).expect(200);
    expect(history.body.data[0].transfer_id).toBe(data.transfer.id);
  });

  it('rejects insufficient balance and changes neither account', async () => {
    const { a, b } = await setupAB();
    const res = await transfer({ from_account_id: a, to_account_id: b, amount: 100.01, reference_id: 'big' }).expect(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await balanceOf(a)).toBe(100);
    expect(await balanceOf(b)).toBe(50);
  });

  it('requires both accounts to exist', async () => {
    const { a } = await setupAB();
    const toMissing = await transfer({ from_account_id: a, to_account_id: MISSING, amount: 1, reference_id: 'x' }).expect(404);
    expect(toMissing.body.error).toMatchObject({ code: 'ACCOUNT_NOT_FOUND', details: { account_id: MISSING } });
    await transfer({ from_account_id: MISSING, to_account_id: a, amount: 1, reference_id: 'x' }).expect(404);
    expect(await balanceOf(a)).toBe(100);
  });

  it('rejects transfers to the same account and invalid input', async () => {
    const { a } = await setupAB();
    const same = await transfer({ from_account_id: a, to_account_id: a, amount: 1, reference_id: 'x' }).expect(400);
    expect(same.body.error.details).toContainEqual({ field: 'to_account_id', message: 'must be different from from_account_id' });

    const bad = await transfer({ from_account_id: 'nope', amount: 0 }).expect(400);
    const fields = bad.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['from_account_id', 'to_account_id', 'amount', 'reference_id']));
  });

  it('is idempotent per source account reference_id', async () => {
    const { a, b } = await setupAB();
    await transfer({ from_account_id: a, to_account_id: b, amount: 10, reference_id: 'once' }).expect(201);
    const again = await transfer({ from_account_id: a, to_account_id: b, amount: 10, reference_id: 'once' }).expect(409);
    expect(again.body.error.code).toBe('DUPLICATE_TRANSACTION');
    expect(await balanceOf(a)).toBe(90);
    expect(await balanceOf(b)).toBe(60);
  });

  it('opposing concurrent transfers neither deadlock nor lose money', async () => {
    const { a, b } = await setupAB();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        i % 2 === 0
          ? transfer({ from_account_id: a, to_account_id: b, amount: 5, reference_id: `ab${i}` })
          : transfer({ from_account_id: b, to_account_id: a, amount: 5, reference_id: `ba${i}` }),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect((await balanceOf(a)) + (await balanceOf(b))).toBe(150);
    expect(await balanceOf(a)).toBe(100);
  });
});
