import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from '../../lib/pagination';
import { parse, parseUuid, requireJsonObject } from '../../lib/validation';
import { methodNotAllowed } from '../../middleware/errorHandler';
import { createAccount, getAccount, listAccounts } from './accounts.service';

// .strict(): unknown keys such as `balance` or `id` are rejected — the client
// may not choose an account's id or its initial balance.
const createAccountSchema = z
  .object({
    name: z
      .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
      .trim()
      .min(1, 'is required')
      .max(255, 'must be at most 255 characters'),
  })
  .strict();

export const accountsRouter = Router();

accountsRouter
  .route('/')
  .post(async (req, res) => {
    const { name } = parse(createAccountSchema, requireJsonObject(req.body));
    const account = await createAccount(name);
    res.status(201).location(`/api/accounts/${account.id}`).json({ data: account });
  })
  .get(async (req, res) => {
    res.json(await listAccounts(parsePagination(req.query)));
  })
  .all(methodNotAllowed(['GET', 'POST']));

accountsRouter
  .route('/:accountId')
  .get(async (req, res) => {
    const account = await getAccount(parseUuid(req.params.accountId, 'INVALID_ACCOUNT_ID'));
    res.json({ data: account });
  })
  .all(methodNotAllowed(['GET']));

accountsRouter
  .route('/:accountId/balance')
  .get(async (req, res) => {
    const account = await getAccount(parseUuid(req.params.accountId, 'INVALID_ACCOUNT_ID'));
    res.json({ data: { account_id: account.id, balance: account.balance } });
  })
  .all(methodNotAllowed(['GET']));
