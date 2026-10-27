import { z } from 'zod';

const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;
// numeric(18,2) holds 16 integer digits; cap single amounts well below that so
// a handful of large credits cannot overflow a balance.
export const MAX_AMOUNT = 9_999_999_999_999.99;

/**
 * A positive monetary amount with at most 2 decimal places.
 * Accepts a JSON number (`50`, `19.99`) or a numeric string (`"19.99"`) and
 * yields the canonical decimal string that is handed to PostgreSQL `numeric`,
 * so no floating-point arithmetic happens in the application.
 */
export const amountField = z
  .union([z.number(), z.string()], {
    errorMap: () => ({ message: 'must be a number' }),
  })
  .transform((value, ctx) => {
    const text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value.trim();
    if (!DECIMAL_RE.test(text)) {
      const negative = /^-\s*\d/.test(text);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: negative
          ? 'must be greater than 0'
          : 'must be a positive number with at most 2 decimal places',
      });
      return z.NEVER;
    }
    const numeric = Number(text);
    if (numeric <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be greater than 0' });
      return z.NEVER;
    }
    if (numeric > MAX_AMOUNT) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `must not exceed ${MAX_AMOUNT}` });
      return z.NEVER;
    }
    return text;
  });
