import { withTransaction } from '../../db/withTransaction';
import { AppError, insufficientBalance } from '../../lib/errors';
import { applyBalanceChange, lockAccounts } from '../accounts/accounts.service';
import { insertTransaction } from '../transactions/transactions.service';

export interface NewTransfer {
  from_account_id: string;
  to_account_id: string;
  amount: string; // canonical decimal string, see lib/money.ts
  description: string;
  reference_id: string;
}

export interface Transfer {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  description: string;
  reference_id: string;
  created_at: Date;
}

const TRANSFER_COLUMNS = 'id, from_account_id, to_account_id, amount, description, reference_id, created_at';

/**
 * Moves money between two accounts in a single DB transaction: the transfer
 * record, the debit leg, the credit leg and both balance updates commit
 * together or not at all — a partial transfer cannot be persisted.
 */
export async function createTransfer(input: NewTransfer) {
  return withTransaction(async (client) => {
    const accounts = await lockAccounts(client, [input.from_account_id, input.to_account_id]);
    const from = accounts.get(input.from_account_id)!;
    const to = accounts.get(input.to_account_id)!;

    const { rows: existing } = await client.query<Transfer>(
      `SELECT ${TRANSFER_COLUMNS} FROM transfers WHERE from_account_id = $1 AND reference_id = $2`,
      [from.id, input.reference_id],
    );
    if (existing.length > 0) {
      throw new AppError(
        409,
        'DUPLICATE_TRANSACTION',
        `A transfer with reference_id '${input.reference_id}' already exists for the source account`,
        { transfer: existing[0] },
      );
    }

    const amount = Number(input.amount);
    if (from.balance < amount) throw insufficientBalance(from.id, from.balance, amount);

    const { rows } = await client.query<Transfer>(
      `INSERT INTO transfers (from_account_id, to_account_id, amount, description, reference_id)
       VALUES ($1, $2, $3::numeric, $4, $5)
       RETURNING ${TRANSFER_COLUMNS}`,
      [from.id, to.id, input.amount, input.description, input.reference_id],
    );
    const transfer = rows[0];

    // Each leg is an ordinary ledger entry on its account, so balances stay the
    // sum of that account's transactions. The leg reference embeds the transfer
    // id, which is unique, so it can never collide with a client reference.
    const legReference = `transfer:${transfer.id}`;
    const debit = await insertTransaction(client, from.id, {
      type: 'debit',
      amount: input.amount,
      description: input.description || `Transfer to ${to.name}`,
      reference_id: legReference,
      transfer_id: transfer.id,
    });
    const credit = await insertTransaction(client, to.id, {
      type: 'credit',
      amount: input.amount,
      description: input.description || `Transfer from ${from.name}`,
      reference_id: legReference,
      transfer_id: transfer.id,
    });

    const fromBalance = await applyBalanceChange(client, from.id, 'debit', input.amount);
    const toBalance = await applyBalanceChange(client, to.id, 'credit', input.amount);

    return {
      transfer,
      debit_transaction: debit,
      credit_transaction: credit,
      from_account: { account_id: from.id, balance: fromBalance },
      to_account: { account_id: to.id, balance: toBalance },
    };
  });
}
