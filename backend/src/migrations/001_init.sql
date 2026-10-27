-- Transaction ledger schema.
-- Integrity rules live here as constraints so they hold even if application code regresses.

CREATE TABLE accounts (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text          NOT NULL CHECK (length(btrim(name)) > 0 AND length(name) <= 255),
  balance     numeric(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX accounts_created_at_idx ON accounts (created_at DESC);

CREATE TABLE transfers (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id  uuid          NOT NULL REFERENCES accounts(id),
  to_account_id    uuid          NOT NULL REFERENCES accounts(id),
  amount           numeric(18,2) NOT NULL CHECK (amount > 0),
  description      text          NOT NULL DEFAULT '',
  reference_id     text          NOT NULL CHECK (length(btrim(reference_id)) > 0),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT transfers_distinct_accounts CHECK (from_account_id <> to_account_id),
  CONSTRAINT transfers_from_reference_unique UNIQUE (from_account_id, reference_id)
);

CREATE TABLE transactions (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Monotonic insert order; breaks ties between rows sharing a created_at
  -- (e.g. both legs of a transfer are written in the same DB transaction).
  seq           bigserial     NOT NULL UNIQUE,
  account_id    uuid          NOT NULL REFERENCES accounts(id),
  type          text          NOT NULL CHECK (type IN ('credit', 'debit')),
  amount        numeric(18,2) NOT NULL CHECK (amount > 0),
  description   text          NOT NULL DEFAULT '',
  reference_id  text          NOT NULL CHECK (length(btrim(reference_id)) > 0),
  transfer_id   uuid          REFERENCES transfers(id),
  created_at    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT transactions_account_reference_unique UNIQUE (account_id, reference_id)
);

CREATE INDEX transactions_history_idx      ON transactions (account_id, created_at DESC, seq DESC);
CREATE INDEX transactions_type_history_idx ON transactions (account_id, type, created_at DESC, seq DESC);

-- Ledger rows are append-only: reject any UPDATE or DELETE at the database level.
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable; % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_immutable
  BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE TRIGGER transfers_immutable
  BEFORE UPDATE OR DELETE ON transfers
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
