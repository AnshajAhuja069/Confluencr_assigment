import { Router } from 'express';
import { z } from 'zod';
import { amountField } from '../../lib/money';
import { descriptionField, parse, referenceIdField, requireJsonObject, uuidField } from '../../lib/validation';
import { methodNotAllowed } from '../../middleware/errorHandler';
import { createTransfer } from './transfers.service';

const createTransferSchema = z
  .object({
    from_account_id: uuidField('from_account_id'),
    to_account_id: uuidField('to_account_id'),
    amount: amountField,
    description: descriptionField,
    reference_id: referenceIdField,
  })
  .strict()
  .refine((t) => t.from_account_id !== t.to_account_id, {
    message: 'must be different from from_account_id',
    path: ['to_account_id'],
  });

export const transfersRouter = Router();

transfersRouter
  .route('/')
  .post(async (req, res) => {
    const input = parse(createTransferSchema, requireJsonObject(req.body));
    res.status(201).json({ data: await createTransfer(input) });
  })
  .all(methodNotAllowed(['POST']));
