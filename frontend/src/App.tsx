import { NavLink, Route, Routes } from 'react-router-dom';
import { AUTHOR, COMPANY, ConfluencrLogo } from './components';
import AccountPage from './pages/AccountPage';
import AccountsPage from './pages/AccountsPage';
import OverviewPage from './pages/OverviewPage';
import TransferPage from './pages/TransferPage';

export default function App() {
  return (
    <>
      <div className="orbs" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="shell">
        <header className="topbar glass">
          <div className="row">
            <NavLink to="/" className="brand">
              <span className="brand-mark" aria-hidden>₹</span>
              <span className="brand-text">
                <strong>Ledger</strong>
                <span>by {AUTHOR}</span>
              </span>
            </NavLink>
            <ConfluencrLogo />
          </div>
          <nav>
            <NavLink to="/" end>Overview</NavLink>
            <NavLink to="/accounts">Accounts</NavLink>
            <NavLink to="/transfer">Transfer</NavLink>
            <a href="http://localhost:4000/docs" target="_blank" rel="noreferrer">API docs ↗</a>
          </nav>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/accounts/:id" element={<AccountPage />} />
            <Route path="/transfer" element={<TransferPage />} />
            <Route path="*" element={<p className="glass card muted">Page not found.</p>} />
          </Routes>
        </main>

        <footer className="footer glass">
          <span>
            Built by <b>{AUTHOR}</b> for the <b>{COMPANY}</b> Full Stack Developer Assessment · 2026
          </span>
          <span className="muted">Express · PostgreSQL · React · TypeScript</span>
        </footer>
      </div>
    </>
  );
}
