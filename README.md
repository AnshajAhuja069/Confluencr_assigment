# Transaction Ledger

> **Full Stack Developer Assessment for [Confluencr](https://confluencr.com)** · built by **Anshaj**
>
> **Live demo:** https://confluencr-ledger.vercel.app · **API docs:** https://confluencr-ledger.vercel.app/docs/

Hi! 👋 This is my submission for Confluencr's *Transaction Ledger API* assignment. People can open
accounts, record credits and debits, check their balance, browse a filterable, paginated history and send
money to each other (the bonus transfer feature).

I focused on **correctness under real-world conditions**. Every balance equals the sum of its ledger.
Retries with the same `reference_id` never charge twice. Requests that arrive at the same time can't
overdraw an account. A transfer can never be half-applied. All of this is enforced by the database as well
as the application code, and covered by automated tests.

There's also a React UI themed in Confluencr's colours with a frosted-glass look. Its **Overview** page
walks through the brief, maps every requirement to its implementation, and suggests a 60-second demo.
The database is seeded with realistic accounts (Akshat, Anshaj, Priya, Rohan, Neha, Vikram, Ishita) and
about two months of salaries, rent, food orders, bills and transfers between friends.

| Layer    | Tech |
|----------|------|
| API      | Node.js 20+, Express 5, TypeScript, Zod validation |
| Database | PostgreSQL 17 (raw SQL via `pg`, SQL migrations) |
| UI       | React 19 + Vite + TypeScript, glassmorphism theme in Confluencr's brand colours |
| Tests    | Vitest + Supertest against a real PostgreSQL test database (68 tests) |
| Docs     | OpenAPI 3 spec ([`backend/openapi.yaml`](backend/openapi.yaml)), Swagger UI at `/docs` |

```
.
├── docker-compose.yml        PostgreSQL for local dev (creates `ledger` + `ledger_test`)
├── backend/
│   ├── openapi.yaml          API documentation (served at http://localhost:4000/docs)
│   ├── scripts/embedded-db.mts   Docker-free PostgreSQL (see "Option B")
│   ├── src/
│   │   ├── app.ts / server.ts
│   │   ├── db/               pool, migration runner, withTransaction(), demo seed
│   │   ├── migrations/       001_init.sql — schema, constraints, immutability triggers
│   │   ├── lib/              errors, validation, money, pagination helpers
│   │   ├── middleware/       error handler, 404, 405
│   │   └── modules/          accounts / transactions / transfers (routes + service)
│   └── tests/                API + integrity + concurrency tests
└── frontend/                 React UI (overview, accounts dashboard, account detail & history, transfers)
```

---

## Running locally

**Prerequisites:** Node.js 20 or newer, plus **either** Docker **or** nothing else
(the backend can run a real embedded PostgreSQL from npm).

### 1. Start PostgreSQL

**Option A — Docker**

```bash
docker compose up -d
```

**Option B — no Docker** (downloads PostgreSQL 17 binaries via npm, keeps data in `backend/.pgdata`; leave it running in its own terminal)

```bash
cd backend
npm install
npm run db:embedded
```

Both options listen on `localhost:5432` with user/password `ledger`/`ledger` and
create the `ledger` and `ledger_test` databases.

### 2. Start the API (port 4000)

```bash
cd backend
npm install
cp .env.example .env      # optional — the defaults already match step 1
npm run migrate
npm run seed              # optional demo data: Akshat, Anshaj, Priya, Rohan, …
npm run dev
```

`npm run seed` only runs on an empty database. Use `npm run seed -- --reset` to wipe and reseed.
The seed writes about two months of history in one DB transaction, skips any debit that would overdraw,
and recomputes balances from the ledger. The demo data follows the same rules as data created through
the API.

- API: http://localhost:4000/api
- Swagger UI: http://localhost:4000/docs
- Health: http://localhost:4000/health

### 3. Start the UI (port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to `localhost:4000`.

**UI tour**
- **Overview** — the brief, a requirement checklist mapping each point to its implementation, the request
  flow, key design decisions, live stats and the demo accounts.
- **Accounts** — dashboard totals, open an account, and a list of everyone's balance.
- **Account** — balance, a credit/debit form (it generates a fresh `reference_id`; reuse an old one to
  see the 409), and history with credit/debit filters and pagination.
- **Transfer** — move money between two accounts, e.g. Akshat → Anshaj.

The Confluencr logo is linked from confluencr.com; if you're offline, the header shows a text wordmark instead.

### Tests

With PostgreSQL running (step 1):

```bash
cd backend
npm test
```

The suite migrates `ledger_test` automatically and truncates it before each test.

### Production build

```bash
cd backend && npm run build && npm start
cd frontend && npm run build      # static files in frontend/dist
```

### Deployment (Vercel + Neon)

The live demo runs on Vercel with a Neon Postgres database:

- [`vercel.json`](vercel.json) builds the React app into static files (`frontend/dist`) and serves the
  Express app as one serverless function ([`api/index.ts`](api/index.ts)). `/api/*`, `/docs`,
  `/openapi.json` and `/health` are routed to the function; every other path falls back to the SPA.
- Each build runs `npm run vercel-build` in `backend`: it applies migrations over Neon's direct
  connection (`DATABASE_URL_UNPOOLED`) and seeds the demo data only if the database is empty.
- At runtime the API uses the pooled `DATABASE_URL` with a small connection pool per instance.
- `DATABASE_URL` / `DATABASE_URL_UNPOOLED` are provided by the Neon integration in Vercel.

---

## API documentation

Full reference: **[`backend/openapi.yaml`](backend/openapi.yaml)**, browsable at
http://localhost:4000/docs. Summary:

| Method | Path | Description | Success |
|---|---|---|---|
| `POST` | `/api/accounts` | Create account — body `{ "name" }` | `201` |
| `GET`  | `/api/accounts?page=&limit=` | List accounts (newest first) | `200` |
| `GET`  | `/api/accounts/:id` | Get account | `200` |
| `GET`  | `/api/accounts/:id/balance` | Current balance `{ account_id, balance }` | `200` |
| `POST` | `/api/accounts/:id/transactions` | Add credit/debit — body `{ type, amount, description?, reference_id }` | `201` |
| `GET`  | `/api/accounts/:id/transactions?type=&page=&limit=` | History, latest first, optional `type` filter | `200` |
| `GET`  | `/api/transactions/:id` | Get one transaction (read-only) | `200` |
| `GET`  | `/api/summary` | Totals for the dashboard (accounts, total balance, transactions, transfers) | `200` |
| `POST` | `/api/transfers` | **Bonus:** transfer — body `{ from_account_id, to_account_id, amount, description?, reference_id }` | `201` |

### Response format

Success: `{ "data": ... }`; lists add `pagination`:

```json
{
  "data": [ { "id": "…", "account_id": "…", "type": "credit", "amount": 50,
              "description": "Refund", "reference_id": "r-2", "transfer_id": null,
              "created_at": "2026-10-27T09:25:21.472Z" } ],
  "pagination": { "page": 1, "limit": 10, "total_records": 23, "total_pages": 3 }
}
```

Every error has the same shape:

```json
{ "error": { "code": "INSUFFICIENT_BALANCE",
             "message": "Insufficient balance: account has 100.00, debit requires 150.00",
             "details": { "account_id": "…", "balance": 100, "requested_amount": 150 } } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing/invalid fields: empty name, bad `type`, amount ≤ 0 or > 2 decimals, missing `reference_id`, unknown fields (e.g. `balance`), invalid `type` filter, same-account transfer. `details` lists each field. |
| 400 | `INVALID_JSON` / `INVALID_REQUEST_BODY` | Body isn't valid JSON / isn't a JSON object |
| 400 | `INVALID_PAGINATION` | `page`/`limit` not positive integers, or `limit` > 100 |
| 400 | `INVALID_ACCOUNT_ID` / `INVALID_TRANSACTION_ID` | Path id is not a UUID |
| 404 | `ACCOUNT_NOT_FOUND` / `TRANSACTION_NOT_FOUND` / `NOT_FOUND` | Unknown account, transaction or route |
| 405 | `METHOD_NOT_ALLOWED` | e.g. `PUT`/`PATCH`/`DELETE` on a transaction |
| 409 | `DUPLICATE_TRANSACTION` | `reference_id` already used on this account; `details.transaction` is the original |
| 422 | `INSUFFICIENT_BALANCE` | Debit/transfer larger than the balance |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 100 kB |
| 500 | `INTERNAL_ERROR` | Unexpected failure (details are logged, not leaked) |

### Example session

```bash
API=http://localhost:4000/api
ACC=$(curl -s -X POST $API/accounts -H 'Content-Type: application/json' -d '{"name":"Alice"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')

curl -s -X POST $API/accounts/$ACC/transactions -H 'Content-Type: application/json' \
  -d '{"type":"credit","amount":100,"description":"Salary","reference_id":"salary-oct"}'
curl -s -X POST $API/accounts/$ACC/transactions -H 'Content-Type: application/json' \
  -d '{"type":"debit","amount":30,"description":"Groceries","reference_id":"pos-1"}'

curl -s $API/accounts/$ACC/balance                                   # {"data":{"account_id":"…","balance":70}}
curl -s "$API/accounts/$ACC/transactions?type=debit&page=1&limit=5"
```

---

## How data integrity is guaranteed

**Atomicity.** Every write runs inside `withTransaction()` (`BEGIN … COMMIT`, `ROLLBACK` on any error).
Inserting the transaction row and updating the balance happen in the same DB transaction,
so neither is persisted without the other. A transfer writes the transfer record, the debit
leg, the credit leg and both balance updates in one DB transaction — a partial transfer cannot exist.

**Concurrency.** Before any balance-changing write the account row is locked with
`SELECT … FOR UPDATE`. Concurrent requests on the same account are therefore serialised, so
the duplicate check, the sufficient-funds check and the write all see the latest state.
Transfers lock both accounts in id order, which prevents deadlocks between opposing transfers.
Tests fire 10 parallel debits of 20 at a balance of 100 (exactly 5 succeed, balance ends at 0)
and 10 parallel requests with the same `reference_id` (exactly 1 is created).

**Database constraints as a safety net** (in [`001_init.sql`](backend/src/migrations/001_init.sql)):
- `CHECK (balance >= 0)` on accounts, `CHECK (amount > 0)` and `CHECK (type IN ('credit','debit'))` on transactions
- `UNIQUE (account_id, reference_id)` on transactions, `UNIQUE (from_account_id, reference_id)` on transfers
- foreign keys from transactions/transfers to accounts; `CHECK (from_account_id <> to_account_id)`
- **immutability triggers** that reject any `UPDATE` or `DELETE` on `transactions` and `transfers`,
  even from direct SQL

If application logic ever let a bad write through, these constraints would abort the DB
transaction, and the error handler maps them to the same API errors (409 / 422).

**Immutability.** The API has no update or delete routes for transactions (they return `405`),
and the database triggers enforce the same rule underneath.

**Balance consistency.** The balance column changes only in the same DB transaction as the
ledger row that justifies it, so it always equals the sum of that account's credits minus
its debits. A test checks this invariant directly in SQL.

**Exact money.** Amounts go to PostgreSQL as decimal strings and are stored as `numeric(18,2)`;
all balance arithmetic happens in SQL, never in JavaScript floating point (`0.1 + 0.2` gives `0.30`).

---

## Assumptions

1. **Ids** are server-generated UUIDs. A path id that isn't a UUID gets `400 INVALID_ACCOUNT_ID`;
   a well-formed id that doesn't exist gets `404 ACCOUNT_NOT_FOUND`.
2. **Amounts** must be greater than 0, have at most 2 decimal places, and be at most
   9,999,999,999,999.99. They can be sent as a JSON number (`50`, `19.99`) or a numeric
   string (`"19.99"`) and are returned as JSON numbers. There is a single implicit currency.
3. **Initial balance** is always 0. Any field other than `name` on account creation
   (including `balance` and `id`) is rejected with `400`, rather than silently ignored, so
   clients find out straight away. The same strictness applies to transaction and transfer bodies.
4. **Duplicate `reference_id`** returns `409 DUPLICATE_TRANSACTION` with the original
   transaction in `error.details.transaction`, so a retrying client can recover the original
   result. The duplicate check happens before the funds check, so retrying a successful debit
   reports "duplicate" even if the balance has since dropped. A reference counts as a duplicate
   even if the new payload differs. A *rejected* request (validation error, insufficient
   balance) does **not** use up its `reference_id`.
5. **Insufficient balance** returns `422 Unprocessable Entity` (the request is well-formed but
   breaks a business rule). Debiting the exact full balance is allowed. Balances can never go negative.
6. **`description`** is optional (defaults to `""`, max 500 characters). `reference_id` is
   trimmed, required, and at most 100 characters. `name` is trimmed, required, and at most 255 characters.
7. **`type`** is case-sensitive: only `credit` and `debit` are accepted.
8. **Pagination:** `page` defaults to 1 and `limit` to 10 (max 100). A page past the end
   returns an empty `data` array with correct metadata, not an error. `total_pages` is 0 when
   there are no records.
9. **Ordering:** history is sorted by `created_at DESC`. A monotonic `seq` column breaks ties
   between rows with the same timestamp (for example, both legs of a transfer).
10. **Transfers** (bonus) are stored as a `transfers` record plus two ordinary ledger entries
    (a debit on the source and a credit on the destination), both carrying the `transfer_id`.
    So transfers show up in each account's history and balances stay equal to the ledger.
    The client's `reference_id` must be unique per **source** account. The legs use the
    internal reference `transfer:<transfer id>`, so they can never clash with client references.
    If no description is given, the legs default to "Transfer to/from <name>".
11. **No authentication or authorisation** is in scope; any client can act on any account.
    Accounts cannot be renamed or deleted (not required by the brief).
12. The UI is a thin client over the public API; all rules are enforced on the server.
13. The API is currency-agnostic. The UI shows amounts in Indian rupees (₹, en-IN digit grouping) to
    match the demo data.

---

<p align="center">Built with care by <b>Anshaj</b> for the <b>Confluencr</b> Full Stack Developer Assessment · 2026</p>
