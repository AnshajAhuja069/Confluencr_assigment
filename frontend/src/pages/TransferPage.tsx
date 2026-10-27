import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, formatAmount, newReference, type Account } from '../api';
import { Alert, ErrorAlert } from '../components';

export default function TransferPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState(() => newReference('trf'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ from: number; to: number } | null>(null);

  const loadAccounts = () =>
    api.listAccounts(1, 100).then((r) => setAccounts(r.data), setLoadError);

  useEffect(() => {
    loadAccounts();
  }, []);

  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.createTransfer({
        from_account_id: fromId,
        to_account_id: toId,
        amount,
        description,
        reference_id: reference,
      });
      setResult({ from: r.from_account.balance, to: r.to_account.balance });
      setAmount('');
      setDescription('');
      setReference(newReference('trf'));
      loadAccounts();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const option = (a: Account) => (
    <option key={a.id} value={a.id}>
      {a.name} — {formatAmount(a.balance)}
    </option>
  );

  return (
    <section className="glass card">
      <span className="eyebrow">Bonus feature</span>
      <h1 style={{ marginTop: 6 }}>Transfer money</h1>
      <p className="text-2">
        Send money between two accounts, e.g. Akshat paying Anshaj back for dinner. The debit from the source and
        the credit to the destination happen in <b>one database transaction</b>: either both apply or neither does,
        so a partial transfer is impossible. Both accounts are locked in a fixed order, so opposing transfers can't
        deadlock.
      </p>
      <ErrorAlert error={loadError} />
      {accounts.length < 2 && !loadError ? (
        <p className="muted">
          You need at least two accounts. <Link to="/accounts">Create accounts</Link>
        </p>
      ) : (
        <form className="grid-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="label">From</span>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">Select source account</option>
              {accounts.map(option)}
            </select>
          </label>
          <label className="field">
            <span className="label">To</span>
            <select value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Select destination account</option>
              {accounts.map(option)}
            </select>
          </label>
          <label className="field">
            <span className="label">Amount (₹)</span>
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Description</span>
            <input placeholder="e.g. Split – dinner at Toit" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </label>
          <label className="field">
            <span className="label">Reference ID</span>
            <div className="row tight">
              <input className="mono" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
              <button type="button" className="btn ghost icon" title="Generate a new reference" onClick={() => setReference(newReference('trf'))}>
                ↻
              </button>
            </div>
          </label>
          <div className="actions">
            <button className="btn primary" disabled={busy}>
              {busy ? 'Transferring…' : 'Send transfer ⇄'}
            </button>
          </div>
        </form>
      )}
      <ErrorAlert error={error} />
      {result && (
        <Alert kind="success">
          Transfer complete. {nameOf(fromId)}: {formatAmount(result.from)} · {nameOf(toId)}: {formatAmount(result.to)}
        </Alert>
      )}
    </section>
  );
}
