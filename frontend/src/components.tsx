import { useState, type ReactNode } from 'react';
import type { Pagination } from './api';
import { ApiError } from './api';

export const AUTHOR = 'Anshaj';
export const COMPANY = 'Confluencr';
const CONFLUENCR_LOGO = 'https://confluencr.com/wp-content/uploads/2024/06/Logo-IAMAI-ASCI-Certified.svg';

/** Confluencr's official logo (linked from their site), falling back to a wordmark offline. */
export function ConfluencrLogo() {
  const [failed, setFailed] = useState(false);
  return (
    <a className="partner" href="https://confluencr.com" target="_blank" rel="noreferrer" title="Confluencr">
      {failed ? (
        <span className="wordmark">confluencr</span>
      ) : (
        <img src={CONFLUENCR_LOGO} alt="Confluencr" onError={() => setFailed(true)} />
      )}
    </a>
  );
}

const AVATAR_GRADIENTS = [
  ['#046bd2', '#2652e9'],
  ['#ffb800', '#ff7a1a'],
  ['#7c3aed', '#c026d3'],
  ['#0ea5a4', '#22c55e'],
  ['#ef4444', '#f97316'],
  ['#2563eb', '#06b6d4'],
  ['#db2777', '#f43f5e'],
];

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const [a, b] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  return (
    <span
      className="avatar"
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${a}, ${b})` }}
    >
      {initials || '?'}
    </span>
  );
}

export function Alert({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** Renders an API error with its code, so validation details are visible to the user. */
export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError) {
    return (
      <Alert kind="error">
        <strong>{error.code.replace(/_/g, ' ').toLowerCase()}</strong> — {error.message}
      </Alert>
    );
  }
  return <Alert kind="error">{String(error)}</Alert>;
}

export function Pager({
  pagination,
  onPage,
  onLimit,
}: {
  pagination: Pagination;
  onPage: (page: number) => void;
  onLimit?: (limit: number) => void;
}) {
  const { page, limit, total_records, total_pages } = pagination;
  return (
    <div className="pager">
      <span className="muted small">
        Page <b className="text-2">{total_pages === 0 ? 0 : page}</b> of <b className="text-2">{total_pages}</b> ·{' '}
        {total_records} record{total_records === 1 ? '' : 's'}
      </span>
      <div className="pager-controls">
        {onLimit && (
          <label className="inline">
            Per page
            <select value={limit} onChange={(e) => onLimit(Number(e.target.value))}>
              {[5, 10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
        <button className="btn ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Prev
        </button>
        <button className="btn ghost" disabled={page >= total_pages} onClick={() => onPage(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}
