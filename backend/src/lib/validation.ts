import { z, type ZodTypeAny } from 'zod';
import { AppError, type ErrorCode } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates `data` against `schema`, throwing a 400 with per-field details on failure. */
export function parse<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
  code: ErrorCode = 'VALIDATION_ERROR',
): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || null,
    message: issue.message,
  }));
  const message = details
    .map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
    .join('; ');
  throw new AppError(400, code, message, details);
}

/** Request bodies must be JSON objects; a missing body or wrong Content-Type lands here. */
export function requireJsonObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(
      400,
      'INVALID_REQUEST_BODY',
      'Request body must be a JSON object (send Content-Type: application/json)',
    );
  }
  return body as Record<string, unknown>;
}

export function parseUuid(value: string, code: 'INVALID_ACCOUNT_ID' | 'INVALID_TRANSACTION_ID'): string {
  if (!UUID_RE.test(value)) {
    const what = code === 'INVALID_ACCOUNT_ID' ? 'account' : 'transaction';
    throw new AppError(400, code, `'${value}' is not a valid ${what} id (expected a UUID)`);
  }
  return value.toLowerCase();
}

export const uuidField = (label: string) =>
  z.string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a string` })
    .regex(UUID_RE, `${label} must be a valid UUID`)
    .transform((v) => v.toLowerCase());

export const transactionTypeField = z.enum(['credit', 'debit'], {
  errorMap: () => ({ message: "must be either 'credit' or 'debit'" }),
});

export const referenceIdField = z
  .string({ required_error: 'is required', invalid_type_error: 'must be a string' })
  .trim()
  .min(1, 'is required')
  .max(100, 'must be at most 100 characters');

export const descriptionField = z
  .string({ invalid_type_error: 'must be a string' })
  .trim()
  .max(500, 'must be at most 500 characters')
  .default('');
