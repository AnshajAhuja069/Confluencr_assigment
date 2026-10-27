import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatCompact, type Account, type Summary } from '../api';
import { AUTHOR, Avatar, COMPANY } from '../components';

const REQUIREMENTS: Array<{ title: string; how: string; bonus?: boolean }> = [
  {
    title: '1 · Create account',
    how: 'POST /api/accounts — UUID id, trimmed required name, server-set created_at. Balance always starts at 0; sending `balance` is rejected with 400.',
  },
  {
    title: '2 · Credit & debit transactions',
    how: 'POST /api/accounts/:id/transactions — credits add, debits subtract, overdrafts return 422 and leave the balance untouched.',
  },
  {
    title: '2 · Duplicate reference_id',
    how: 'Unique per account (DB constraint + check under a row lock). Re-submits return 409 with the original transaction; the same reference works on other accounts.',
  },
  {
    title: '3 · Get balance',
    how: 'GET /api/accounts/:id/balance → { account_id, balance }. Unknown ids → 404, malformed ids → 400.',
  },
  {
    title: '4 · History: filter, paginate, sort',
    how: 'GET /api/accounts/:id/transactions?type=&page=&limit= — latest first by created_at, with page, limit, total_records and total_pages.',
  },
  {
    title: '5 · Immutability',
    how: 'No update/delete routes (405), and PostgreSQL triggers reject UPDATE/DELETE on ledger rows, even from raw SQL.',
  },
  {
    title: '5 · Balance consistency & atomicity',
    how: 'The ledger row and the balance change commit in one DB transaction. A test checks balance = Σ credits − Σ debits.',
  },
  {
    title: '7 · Validation',
    how: 'Strict Zod schemas: type ∈ {credit, debit}, amount > 0 with ≤ 2 decimals, required reference_id, no unknown fields.',
  },
  {
    title: '8 · Error handling',
    how: 'One shape everywhere — { error: { code, message, details } } — with 400 / 404 / 405 / 409 / 422 / 500.',
  },
  {
    title: '9 · Bonus: money transfer',
    how: 'POST /api/transfers locks both accounts in id order (no deadlocks) and writes the transfer and both legs together, so a transfer is never partial.',
    bonus: true,
  },
];

const DECISIONS: Array<[string, string, string]> = [
  ['🔒', 'Row-level locking', 'SELECT … FOR UPDATE serialises writes per account, so 10 parallel debits on ₹100 can never overdraw it. This is covered by tests.'],
  ['🔁', 'Idempotent writes', 'reference_id acts as an idempotency key. Retries are safe: a duplicate returns the original transaction instead of charging twice.'],
  ['🧾', 'Append-only ledger', 'Transactions are never edited or deleted. Transfers are two ordinary ledger entries linked by transfer_id.'],
  ['💯', 'Exact money', 'Amounts travel as decimal strings into numeric(18,2). No floating-point maths in JS, so 0.1 + 0.2 = 0.30.'],
  ['🛡️', 'Constraints as a safety net', 'CHECK balance ≥ 0, UNIQUE (account_id, reference_id), FKs and triggers enforce the rules even if app code regresses.'],
  ['🧪', '68 automated tests', 'Vitest + Supertest against real PostgreSQL: validation, pagination, idempotency, rollback and concurrency.'],
];

export default function OverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [people, setPeople] = useState<Account[]>([]);

  useEffect(() => {
    api.summary().then(setSummary, () => undefined);
    api.listAccounts(1, 8).then((r) => setPeople(r.data), () => undefined);
  }, []);

  return (
    <>
      <section className="glass intro">
        <span className="eyebrow">★ Full Stack Developer Assessment · {COMPANY}</span>
        <h1 style={{ marginTop: 10 }}>
          <span className="gradient-text">Transaction Ledger</span>
        </h1>
        <p className="lead">
          Hi, I'm <b>{AUTHOR}</b> 👋 — this is my submission for {COMPANY}'s Full Stack Developer assessment. It's a
          ledger where people can open accounts, record credits and debits, look through their history and send
          money to each other. Correctness was the priority: every rupee is accounted for, even when requests arrive
          at the same time.
        </p>
        <div className="meta">
          <span className="chip">Candidate <b>{AUTHOR}</b></span>
          <span className="chip">Prepared for <b>{COMPANY}</b></span>
          <span className="chip">Brief <b>Transaction Ledger API</b></span>
          <span className="chip">Stack <b>Express · PostgreSQL · React</b></span>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Link to="/accounts" className="btn primary">Explore the accounts →</Link>
          <Link to="/transfer" className="btn ghost">Try a transfer</Link>
          <a href="http://localhost:4000/docs" target="_blank" rel="noreferrer" className="btn ghost">Open API docs ↗</a>
        </div>
      </section>

      {summary && (
        <section className="stats">
          <div className="glass stat">
            <span className="label">Accounts</span>
            <strong>{summary.accounts}</strong>
          </div>
          <div className="glass stat">
            <span className="label">Money held</span>
            <strong>{formatCompact(summary.total_balance)}</strong>
          </div>
          <div className="glass stat">
            <span className="label">Transactions</span>
            <strong>{summary.transactions.toLocaleString('en-IN')}</strong>
          </div>
          <div className="glass stat">
            <span className="label">Transfers</span>
            <strong>{summary.transfers}</strong>
          </div>
        </section>
      )}

      <div className="two-col">
        <section className="glass card sticky">
          <h2>The brief</h2>
          <p className="text-2">
            Build a backend API for a simple transaction ledger: create accounts, post credit and debit transactions,
            and fetch balances and transaction history.
          </p>
          <p className="text-2">
            The interesting part is <b>data integrity</b>. Balances must always equal the sum of valid transactions.
            Rejected or duplicate requests must not change anything. A transaction and its balance update must succeed
            or fail together. Transactions can never be edited.
          </p>
          <p className="text-2" style={{ marginBottom: 18 }}>
            I also built the bonus <b>money transfer</b> and this UI, so the behaviour can be explored without curl.
          </p>

          <h3>Try it in 60 seconds</h3>
          <ol className="steps" style={{ marginTop: 10 }}>
            <li><span>Open <b>Akshat</b>'s account and record a credit.</span></li>
            <li><span>Submit again with the <b>same reference ID</b> → it's rejected as a duplicate (409) and the balance doesn't change.</span></li>
            <li><span>Try a <b>debit larger than the balance</b> → 422, nothing changes.</span></li>
            <li><span>Go to <b>Transfer</b> and send money from Akshat to <b>Anshaj</b>. Both sides update together.</span></li>
            <li><span>Filter the history by credit/debit and page through it.</span></li>
          </ol>
        </section>

        <section className="glass card">
          <div className="section-head">
            <h2>Requirement checklist</h2>
            <span className="pill credit">All covered</span>
          </div>
          <ul className="checklist">
            {REQUIREMENTS.map((r) => (
              <li key={r.title}>
                <span className={`tick ${r.bonus ? 'bonus' : ''}`}>{r.bonus ? '★' : '✓'}</span>
                <div>
                  <strong>{r.title}</strong>
                  <span className="how">{r.how}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="glass card">
        <h2>How a transaction flows through the system</h2>
        <p className="muted">Every balance-changing request takes the same path, inside one database transaction.</p>
        <div className="flow">
          <div className="node"><b>React UI</b><span>Form → JSON request with a generated reference_id</span></div>
          <span className="arrow">→</span>
          <div className="node"><b>Express + Zod</b><span>Strict validation; 400 with per-field details</span></div>
          <span className="arrow">→</span>
          <div className="node"><b>BEGIN · FOR UPDATE</b><span>Lock the account, check duplicate, check funds</span></div>
          <span className="arrow">→</span>
          <div className="node"><b>INSERT + UPDATE</b><span>Ledger row and balance change together</span></div>
          <span className="arrow">→</span>
          <div className="node"><b>COMMIT</b><span>or ROLLBACK, so nothing half-done is ever saved</span></div>
        </div>
      </section>

      <section className="grid-3">
        {DECISIONS.map(([icon, title, text]) => (
          <div key={title} className="glass feature">
            <div className="icon">{icon}</div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>

      {people.length > 0 && (
        <section className="glass card">
          <div className="section-head">
            <div>
              <h2>Meet the demo accounts</h2>
              <p className="muted small">Seeded with about two months of salaries, rent, food orders, bills and transfers between friends.</p>
            </div>
            <Link to="/accounts" className="btn ghost">View all</Link>
          </div>
          <div className="grid-2">
            {people.map((p) => (
              <Link key={p.id} to={`/accounts/${p.id}`} className="who" style={{ color: 'inherit' }}>
                <Avatar name={p.name} size={38} />
                <div className="who-text">
                  <strong>{p.name}</strong>
                  <span className="muted small">{formatCompact(p.balance)} balance</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
