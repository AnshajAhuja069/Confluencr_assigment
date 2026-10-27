import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  api,
  formatAmount,
  formatDate,
  newReference,
  type Account,
  type Page,
  type Transaction,
  type TransactionType,
} from '../api';
import { Alert, Avatar, ErrorAlert, Pager } from '../components';

type Filter = 'all' | TransactionType;

export default function AccountPage() {
  const { id = '' } = useParams();
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState<unknown>(null);

  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [history, setHistory] = useState<Page<Transaction> | null>(null);
  const [historyError, setHistoryError] = useState<unknown>(null);

  const loadAccount = useCallback(() => {
    api.getAccount(id).then(setAccount, setAccountError);
  }, [id]);

  const loadHistory = useCallback(() => {
    api
      .listTransactions(id, { type: filter === 'all' ? undefined : filter, page, limit })
      .then((r) => {
        setHistory(r);
        setHistoryError(null);
      }, setHistoryError);
  }, [id, filter, page, limit]);

  useEffect(loadAccount, [loadAccount]);
  useEffect(loadHistory, [loadHistory]);

  if (accountError) {
    return (
      <section className="glass card">
        <ErrorAlert error={accountError} />
        <p style={{ marginTop: 12 }}><Link to="/accounts">← Back to accounts</Link></p>
      </section>
    );
  }
  if (!account) return <p className="glass skeleton">Loading account…</p>;

  const refresh = () => {
    loadAccount();
    loadHistory();
  };

  return (
    <>
      <Link to="/accounts" className="back">← All accounts</Link>
      <section className="glass card hero">
        <div className="who">
          <Avatar name={account.name} size={64} />
          <div className="who-text">
            <h1 style={{ margin: 0 }}>{account.name}</h1>
            <span className="mono muted small">{account.id}</span>
            <span className="muted small">Account opened {formatDate(account.created_at)}</span>
          </div>
        </div>
        <div className="balance-block">
          <span className="label">Current balance</span>
          <div className="amount gradient-text">{formatAmount(account.balance)}</div>
        </div>
      </section>

      <TransactionForm accountId={account.id} onCreated={refresh} />

      <section className="glass card">
        <div className="section-head">
          <h2>Transaction history</h2>
          <div className="segmented" role="tablist" aria-label="Filter by type">
            {(['all', 'credit', 'debit'] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                className={filter === f ? 'active' : ''}
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
              >
                {f === 'all' ? 'All' : f === 'credit' ? 'Credits' : 'Debits'}
              </button>
            ))}
          </div>
        </div>
        <ErrorAlert error={historyError} />
        {history && history.data.length === 0 && <p className="muted">No transactions to show.</p>}
        {history && history.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Reference</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((t) => (
                  <tr key={t.id}>
                    <td className="muted nowrap">{formatDate(t.created_at)}</td>
                    <td className="nowrap">
                      <span className={`pill ${t.type}`}>{t.type === 'credit' ? '↓' : '↑'} {t.type}</span>
                      {t.transfer_id && <span className="pill neutral">⇄ transfer</span>}
                    </td>
                    <td>{t.description || <span className="muted">—</span>}</td>
                    <td className="mono small">{t.reference_id}</td>
                    <td className={`num ${t.type}`}>
                      {t.type === 'credit' ? '+' : '−'}
                      {formatAmount(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {history && (
          <Pager
            pagination={history.pagination}
            onPage={setPage}
            onLimit={(l) => {
              setLimit(l);
              setPage(1);
            }}
          />
        )}
      </section>
    </>
  );
}

function TransactionForm({ accountId, onCreated }: { accountId: string; onCreated: () => void }) {
  const [type, setType] = useState<TransactionType>('credit');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState(() => newReference());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.createTransaction(accountId, { type, amount, description, reference_id: reference });
      setSuccess(
        `${type === 'credit' ? 'Credited' : 'Debited'} ${formatAmount(result.transaction.amount)}. New balance: ${formatAmount(result.balance)}.`,
      );
      setAmount('');
      setDescription('');
      setReference(newReference());
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass card">
      <div className="section-head">
        <div>
          <h2>New transaction</h2>
          <p className="muted small">Saved atomically: the ledger entry and the balance change commit together.</p>
        </div>
      </div>
      <form className="grid-form" onSubmit={onSubmit}>
        <div className="field">
          <span className="label">Type</span>
          <div className="segmented">
            {(['credit', 'debit'] as const).map((t) => (
              <button type="button" key={t} className={type === t ? `active ${t}` : ''} onClick={() => setType(t)}>
                {t === 'credit' ? '↓ Credit (+)' : '↑ Debit (−)'}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="label">Amount (₹)</span>
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Description</span>
          <input placeholder={type === 'credit' ? 'e.g. Salary credit' : 'e.g. Swiggy – dinner order'} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </label>
        <label className="field">
          <span className="label">Reference ID</span>
          <div className="row tight">
            <input className="mono" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
            <button type="button" className="btn ghost icon" title="Generate a new reference" onClick={() => setReference(newReference())}>
              ↻
            </button>
          </div>
          <span className="hint">Unique per account. Re-submitting a used reference is rejected as a duplicate.</span>
        </label>
        <div className="actions">
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : `Record ${type}`}
          </button>
        </div>
      </form>
      <ErrorAlert error={error} />
      {success && <Alert kind="success">{success}</Alert>}
    </section>
  );
}
