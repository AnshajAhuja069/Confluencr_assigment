import { Router } from 'express';
import { z } from 'zod';
import { amountField } from '../../lib/money';
import { parsePagination } from '../../lib/pagination';
import {
  descriptionField,
  parse,
  parseUuid,
  referenceIdField,
  requireJsonObject,
  transactionTypeField,
} from '../../lib/validation';
import { methodNotAllowed } from '../../middleware/errorHandler';
import { createTransaction, getTransaction, listTransactions } from './transactions.service';

const createTransactionSchema = z
  .object({
    type: transactionTypeField,
    amount: amountField,
    description: descriptionField,
    reference_id: referenceIdField,
  })
  .strict();

const historyFilterSchema = z.object({
  type: transactionTypeField.optional(),
});

/** Mounted at /api/accounts/:accountId/transactions */
export const accountTransactionsRouter = Router({ mergeParams: true });

accountTransactionsRouter
  .route('/')
  .post(async (req, res) => {
    const accountId = parseUuid((req.params as { accountId: string }).accountId, 'INVALID_ACCOUNT_ID');
    const input = parse(createTransactionSchema, requireJsonObject(req.body));
    const result = await createTransaction(accountId, input);
    res
      .status(201)
      .location(`/api/transactions/${result.transaction.id}`)
      .json({ data: result });
  })
  .get(async (req, res) => {
    const accountId = parseUuid((req.params as { accountId: string }).accountId, 'INVALID_ACCOUNT_ID');
    const filter = parse(historyFilterSchema, { type: req.query.type });
    const pageRequest = parsePagination(req.query);
    res.json(await listTransactions(accountId, filter, pageRequest));
  })
  .all(methodNotAllowed(['GET', 'POST']));

/** Mounted at /api/transactions — read-only: transactions are immutable once created. */
export const transactionsRouter = Router();

transactionsRouter
  .route('/:transactionId')
  .get(async (req, res) => {
    const transaction = await getTransaction(parseUuid(req.params.transactionId, 'INVALID_TRANSACTION_ID'));
    res.json({ data: transaction });
  })
  .all(methodNotAllowed(['GET']));
