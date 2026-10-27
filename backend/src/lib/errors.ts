export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'INVALID_REQUEST_BODY'
  | 'INVALID_PAGINATION'
  | 'INVALID_ACCOUNT_ID'
  | 'INVALID_TRANSACTION_ID'
  | 'ACCOUNT_NOT_FOUND'
  | 'TRANSACTION_NOT_FOUND'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'DUPLICATE_TRANSACTION'
  | 'INSUFFICIENT_BALANCE'
  | 'AMOUNT_OUT_OF_RANGE'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR';

/** An error that maps directly onto an HTTP response: `{ error: { code, message, details? } }`. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const accountNotFound = (accountId: string) =>
  new AppError(404, 'ACCOUNT_NOT_FOUND', `Account '${accountId}' was not found`, { account_id: accountId });

export const insufficientBalance = (accountId: string, balance: number, amount: number) =>
  new AppError(
    422,
    'INSUFFICIENT_BALANCE',
    `Insufficient balance: account has ${balance.toFixed(2)}, debit requires ${amount.toFixed(2)}`,
    { account_id: accountId, balance, requested_amount: amount },
  );
