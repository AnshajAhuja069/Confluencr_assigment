export type TransactionType = 'credit' | 'debit';

export interface Account {
  id: string;
  name: string;
  balance: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  type: TransactionType;
  amount: number;
  description: string;
  reference_id: string;
  transfer_id: string | null;
  created_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

export interface Page<T> {
  data: T[];
  pagination: Pagination;
}

/** Mirrors the API's `{ error: { code, message, details } }` shape. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the API. Is the backend running on port 4000?');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return body as T;
}

const post = <T>(path: string, payload: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(payload) });

export interface Summary {
  accounts: number;
  total_balance: number;
  transactions: number;
  transfers: number;
}

export const api = {
  summary: () => request<{ data: Summary }>('/summary').then((r) => r.data),
  listAccounts: (page = 1, limit = 10) => request<Page<Account>>(`/accounts?page=${page}&limit=${limit}`),
  getAccount: (id: string) => request<{ data: Account }>(`/accounts/${id}`).then((r) => r.data),
  createAccount: (name: string) => post<{ data: Account }>('/accounts', { name }).then((r) => r.data),

  listTransactions: (accountId: string, opts: { type?: TransactionType; page: number; limit: number }) => {
    const qs = new URLSearchParams({ page: String(opts.page), limit: String(opts.limit) });
    if (opts.type) qs.set('type', opts.type);
    return request<Page<Transaction>>(`/accounts/${accountId}/transactions?${qs}`);
  },
  createTransaction: (
    accountId: string,
    input: { type: TransactionType; amount: string; description: string; reference_id: string },
  ) =>
    post<{ data: { transaction: Transaction; balance: number } }>(`/accounts/${accountId}/transactions`, input).then(
      (r) => r.data,
    ),

  createTransfer: (input: {
    from_account_id: string;
    to_account_id: string;
    amount: string;
    description: string;
    reference_id: string;
  }) =>
    post<{
      data: {
        transfer: { id: string };
        from_account: { account_id: string; balance: number };
        to_account: { account_id: string; balance: number };
      };
    }>('/transfers', input).then((r) => r.data),
};

export const newReference = (prefix = 'ref') =>
  `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8)}`;

// The API is currency-agnostic; the UI presents amounts in rupees with Indian digit grouping.
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactMoney = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 2 });
export const formatAmount = (n: number) => money.format(n);
export const formatCompact = (n: number) => compactMoney.format(n);
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
