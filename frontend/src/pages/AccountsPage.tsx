import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatAmount, formatCompact, formatDate, type Account, type Page, type Summary } from '../api';
import { Avatar, ErrorAlert, Pager } from '../components';

export default function AccountsPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);

  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<Account> | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(() => {
    api.listAccounts(page, 10).then(setResult, setLoadError);
    api.summary().then(setSummary, () => undefined);
  }, [page]);
  useEffect(load, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const account = await api.createAccount(name);
      navigate(`/accounts/${account.id}`);
    } catch (err) {
      setCreateError(err);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <section className="glass card">
        <span className="eyebrow">Dashboard</span>
        <h1 style={{ marginTop: 6 }}>Accounts</h1>
        <p className="text-2" style={{ marginBottom: 0 }}>
          Everyone with an account on the ledger. Open one to see their balance and full history, or to add a
          transaction.
        </p>
      </section>

      {summary && (
        <section className="stats">
          <div className="glass stat">
            <span className="label">Accounts</span>
            <strong>{summary.accounts}</strong>
          </div>
          <div className="glass stat">
            <span className="label">Total balance</span>
            <strong>{formatCompact(summary.total_balance)}</strong>
            <span className="muted small">{formatAmount(summary.total_balance)}</span>
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
        <section className="glass card">
          <h2>Open an account</h2>
          <p className="muted small">The server assigns the id and timestamp. Every account starts at ₹0.00.</p>
          <form className="field" onSubmit={onCreate}>
            <input
              aria-label="Account holder name"
              placeholder="e.g. Akshat"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
            />
            <button className="btn primary" disabled={creating}>
              {creating ? 'Creating…' : 'Create account'}
            </button>
          </form>
          <ErrorAlert error={createError} />
        </section>

        <section className="glass card">
          <div className="section-head">
            <h2>All accounts</h2>
            <span className="muted small">Newest first</span>
          </div>
          <ErrorAlert error={loadError} />
          {result && result.data.length === 0 && (
            <p className="muted">
              No accounts yet. Create one, or run <code className="inline">npm run seed</code> in the backend.
            </p>
          )}
          {result && result.data.length > 0 && (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Account holder</th>
                      <th className="hide-sm">Opened</th>
                      <th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((a) => (
                      <tr key={a.id} className="clickable" onClick={() => navigate(`/accounts/${a.id}`)}>
                        <td>
                          <div className="who">
                            <Avatar name={a.name} size={36} />
                            <div className="who-text">
                              <strong>{a.name}</strong>
                              <span className="mono muted small">{a.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="muted small nowrap hide-sm">{formatDate(a.created_at)}</td>
                        <td className="num"><b>{formatAmount(a.balance)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager pagination={result.pagination} onPage={setPage} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
