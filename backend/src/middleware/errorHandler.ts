import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors';

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

/** Translates database constraint violations that slipped past service checks into API errors. */
function fromDatabaseError(err: PgError): AppError | undefined {
  switch (err.code) {
    case '23505': // unique_violation
      if (err.constraint === 'transactions_account_reference_unique' || err.constraint === 'transfers_from_reference_unique') {
        return new AppError(409, 'DUPLICATE_TRANSACTION', 'A transaction with this reference_id already exists for this account');
      }
      return undefined;
    case '23514': // check_violation
      if (err.constraint === 'accounts_balance_check') {
        return new AppError(422, 'INSUFFICIENT_BALANCE', 'Insufficient balance for this debit');
      }
      return undefined;
    case '22003': // numeric_value_out_of_range
      return new AppError(422, 'AMOUNT_OUT_OF_RANGE', 'Resulting balance exceeds the supported maximum');
    default:
      return undefined;
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let appError: AppError | undefined;

  if (err instanceof AppError) {
    appError = err;
  } else if (err?.type === 'entity.parse.failed') {
    appError = new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  } else if (err?.type === 'entity.too.large') {
    appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else if (err && typeof err === 'object') {
    appError = fromDatabaseError(err as PgError);
  }

  if (!appError) {
    console.error(err);
    appError = new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }

  const body: { code: string; message: string; details?: unknown } = {
    code: appError.code,
    message: appError.message,
  };
  if (appError.details !== undefined) body.details = appError.details;
  res.status(appError.status).json({ error: body });
};

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} does not exist`));
};

/** Terminal handler for a route: any method not explicitly registered gets a 405. */
export const methodNotAllowed =
  (allowed: string[]): RequestHandler =>
  (req, res, next) => {
    res.setHeader('Allow', allowed.join(', '));
    next(new AppError(405, 'METHOD_NOT_ALLOWED', `${req.method} is not allowed on this resource. Allowed: ${allowed.join(', ')}`));
  };
