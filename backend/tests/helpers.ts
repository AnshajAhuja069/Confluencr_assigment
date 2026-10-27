import request from 'supertest';
import { afterAll, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';

export const app = createApp();
export const api = () => request(app);

/** Registers hooks that give every test an empty database. */
export function useCleanDatabase() {
  beforeEach(async () => {
    await pool.query('TRUNCATE transactions, transfers, accounts RESTART IDENTITY CASCADE');
  });
  afterAll(async () => {
    await pool.end();
  });
}

export async function createAccount(name = 'Alice'): Promise<string> {
  const res = await api().post('/api/accounts').send({ name }).expect(201);
  return res.body.data.id;
}

export function postTransaction(
  accountId: string,
  body: Record<string, unknown>,
) {
  return api().post(`/api/accounts/${accountId}/transactions`).send(body);
}

let refCounter = 0;
export const ref = () => `ref-${++refCounter}`;

export async function credit(accountId: string, amount: number) {
  return postTransaction(accountId, { type: 'credit', amount, reference_id: ref() }).expect(201);
}

export async function balanceOf(accountId: string): Promise<number> {
  const res = await api().get(`/api/accounts/${accountId}/balance`).expect(200);
  return res.body.data.balance;
}
