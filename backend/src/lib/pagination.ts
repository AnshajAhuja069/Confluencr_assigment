import { z } from 'zod';
import { parse } from './validation';

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

const positiveIntParam = (name: string, fallback: number, max?: number) =>
  z
    .unknown()
    .transform((value, ctx) => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${name} must be a positive integer` });
        return z.NEVER;
      }
      const n = Number(value);
      if (n < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${name} must be at least 1` });
        return z.NEVER;
      }
      if (max !== undefined && n > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${name} must be at most ${max}` });
        return z.NEVER;
      }
      return n;
    });

const paginationSchema = z.object({
  page: positiveIntParam('page', 1),
  limit: positiveIntParam('limit', DEFAULT_LIMIT, MAX_LIMIT),
});

export interface PageRequest {
  page: number;
  limit: number;
  offset: number;
}

export interface PageMeta {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

export function parsePagination(query: Record<string, unknown>): PageRequest {
  const { page, limit } = parse(paginationSchema, { page: query.page, limit: query.limit }, 'INVALID_PAGINATION');
  return { page, limit, offset: (page - 1) * limit };
}

export function pageMeta({ page, limit }: PageRequest, totalRecords: number): PageMeta {
  return {
    page,
    limit,
    total_records: totalRecords,
    total_pages: Math.ceil(totalRecords / limit),
  };
}
