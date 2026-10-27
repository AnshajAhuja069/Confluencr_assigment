/**
 * Loads realistic demo data: a handful of named accounts with ~2 months of
 * salary, rent, food, travel and UPI activity, plus transfers between friends.
 *
 *   npm run seed            # only if the database is empty
 *   npm run seed -- --reset # wipe accounts/transactions/transfers first
 *   npm run seed -- --if-empty # seed only if empty, otherwise exit quietly (used by deploys)
 *
 * Everything is written in one DB transaction. Debits that would overdraw are
 * skipped, and balances are recomputed from the ledger at the end, so the
 * seeded data obeys the same invariants as data created through the API.
 */
import { pool } from './pool';
import { withTransaction } from './withTransaction';

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 60;

interface Profile {
  name: string;
  salary: number;
  salaryDay: number;
  rent: number;
  spendLevel: number; // multiplier for everyday spending
  extras: Array<[string, number]>; // occasional credits
}

const PROFILES: Profile[] = [
  { name: 'Akshat', salary: 145000, salaryDay: 1, rent: 32000, spendLevel: 1.2, extras: [['Freelance – landing page for a D2C brand', 18000]] },
  { name: 'Anshaj', salary: 132000, salaryDay: 1, rent: 28000, spendLevel: 1.0, extras: [['Hackathon prize – 2nd place', 25000]] },
  { name: 'Priya', salary: 98000, salaryDay: 5, rent: 22000, spendLevel: 0.9, extras: [['Brand collab payout – Instagram reel', 15000]] },
  { name: 'Rohan', salary: 86000, salaryDay: 7, rent: 18000, spendLevel: 1.1, extras: [['Sold old camera on OLX', 9500]] },
  { name: 'Neha', salary: 112000, salaryDay: 1, rent: 26000, spendLevel: 0.8, extras: [['Tax refund', 7400]] },
  { name: 'Vikram', salary: 74000, salaryDay: 10, rent: 15000, spendLevel: 1.0, extras: [['Weekend photography gig', 6000]] },
  { name: 'Ishita', salary: 0, salaryDay: 1, rent: 0, spendLevel: 0.5, extras: [['Scholarship stipend', 20000], ['Content creator payout – YouTube', 12500]] },
];

const EVERYDAY: Array<[string, number, number]> = [
  // description, min, max
  ['Swiggy – dinner order', 280, 900],
  ['Zomato – lunch', 220, 650],
  ['Blinkit – groceries', 450, 2400],
  ['Uber – ride to office', 180, 520],
  ['Rapido – bike taxi', 60, 180],
  ['Starbucks – coffee', 290, 640],
  ['Amazon – order', 499, 4999],
  ['Myntra – clothing', 899, 3499],
  ['BookMyShow – movie tickets', 380, 1200],
  ['Metro card recharge', 300, 1000],
  ['Pharmacy – Apollo', 150, 1100],
  ['Petrol – HP pump', 800, 2500],
];

const MONTHLY: Array<[string, number]> = [
  ['Electricity bill – BESCOM', 1850],
  ['Jio Fiber – broadband', 999],
  ['Netflix subscription', 649],
  ['Spotify Premium', 119],
  ['Gym membership – Cult.fit', 1999],
];

const TRANSFERS: Array<[string, string, number, string]> = [
  ['Akshat', 'Anshaj', 2450, 'Split – dinner at Toit'],
  ['Anshaj', 'Akshat', 8000, 'Goa trip – hotel share'],
  ['Priya', 'Neha', 1200, 'Concert tickets'],
  ['Akshat', 'Rohan', 5000, 'Paying back for the PS5 games'],
  ['Neha', 'Ishita', 3000, 'Birthday gift contribution'],
  ['Vikram', 'Anshaj', 1500, 'Cab share – airport'],
  ['Anshaj', 'Priya', 650, 'Coffee + snacks'],
  ['Rohan', 'Vikram', 2200, 'Cricket kit share'],
  ['Akshat', 'Ishita', 4000, 'Laptop repair – helping out'],
];

/** Small deterministic PRNG so every seed run produces the same data. */
function prng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const rand = prng(20261027);
const between = (min: number, max: number) => Math.round(min + rand() * (max - min));

interface Event {
  account: string;
  at: Date;
  type: 'credit' | 'debit';
  paise: number; // integer minor units — no float drift while simulating
  description: string;
  reference: string;
}

function buildEvents(start: Date): Event[] {
  const events: Event[] = [];
  let counter = 0;
  const ref = (prefix: string) => `${prefix}-${(++counter).toString().padStart(5, '0')}`;
  const at = (dayOffset: number) =>
    new Date(start.getTime() + dayOffset * DAY + between(8, 22) * 3600_000 + between(0, 59) * 60_000);

  for (const p of PROFILES) {
    // Opening deposit so nobody starts at zero on day one.
    events.push({ account: p.name, at: at(0), type: 'credit', paise: between(20000, 60000) * 100, description: 'Opening deposit', reference: ref('DEP') });

    for (let day = 1; day < HISTORY_DAYS; day++) {
      const date = new Date(start.getTime() + day * DAY);
      if (p.salary && date.getDate() === p.salaryDay) {
        events.push({ account: p.name, at: at(day), type: 'credit', paise: p.salary * 100, description: 'Salary credit', reference: ref('SAL') });
      }
      if (p.rent && date.getDate() === 3) {
        events.push({ account: p.name, at: at(day), type: 'debit', paise: p.rent * 100, description: 'House rent', reference: ref('RENT') });
      }
      if (date.getDate() === 12) {
        for (const [description, amount] of MONTHLY) {
          if (rand() < 0.75) events.push({ account: p.name, at: at(day), type: 'debit', paise: amount * 100, description, reference: ref('BILL') });
        }
      }
      if (rand() < 0.55 * p.spendLevel) {
        const [description, min, max] = EVERYDAY[Math.floor(rand() * EVERYDAY.length)];
        events.push({ account: p.name, at: at(day), type: 'debit', paise: between(min, max) * 100, description, reference: ref('UPI') });
      }
    }
    for (const [description, amount] of p.extras) {
      events.push({ account: p.name, at: at(between(10, HISTORY_DAYS - 3)), type: 'credit', paise: amount * 100, description, reference: ref('CR') });
    }
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

async function seed(mode: 'default' | 'reset' | 'if-empty') {
  const start = new Date(Date.now() - HISTORY_DAYS * DAY);
  start.setHours(0, 0, 0, 0);

  await withTransaction(async (client) => {
    if (mode === 'reset') {
      await client.query('TRUNCATE transactions, transfers, accounts RESTART IDENTITY CASCADE');
    } else {
      const { rows } = await client.query<{ n: number }>('SELECT count(*) AS n FROM accounts');
      if (rows[0].n > 0) {
        if (mode === 'if-empty') {
          console.log('database already has accounts — skipping seed');
          return;
        }
        throw new Error('database already has accounts — run `npm run seed -- --reset` to wipe and reseed');
      }
    }

    const ids = new Map<string, string>();
    for (const [i, p] of PROFILES.entries()) {
      const { rows } = await client.query<{ id: string }>(
        'INSERT INTO accounts (name, created_at) VALUES ($1, $2) RETURNING id',
        // Earlier profiles get later timestamps so they head the newest-first account list.
        [p.name, new Date(start.getTime() - (i + 1) * 3600_000)],
      );
      ids.set(p.name, rows[0].id);
    }

    const balances = new Map<string, number>(PROFILES.map((p) => [p.name, 0]));
    const insert = (accountId: string, type: string, paise: number, description: string, reference: string, at: Date, transferId: string | null = null) =>
      client.query(
        `INSERT INTO transactions (account_id, type, amount, description, reference_id, transfer_id, created_at)
         VALUES ($1, $2, $3::numeric, $4, $5, $6, $7)`,
        [accountId, type, (paise / 100).toFixed(2), description, reference, transferId, at],
      );

    let written = 0;
    for (const e of buildEvents(start)) {
      const balance = balances.get(e.account)!;
      if (e.type === 'debit' && e.paise > balance) continue; // would be rejected by the API too
      balances.set(e.account, balance + (e.type === 'credit' ? e.paise : -e.paise));
      await insert(ids.get(e.account)!, e.type, e.paise, e.description, e.reference, e.at);
      written++;
    }

    let transfers = 0;
    for (const [i, [from, to, amount, description]] of TRANSFERS.entries()) {
      const paise = amount * 100;
      if (paise > balances.get(from)!) continue;
      const at = new Date(Date.now() - (TRANSFERS.length - i) * 1.5 * DAY);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO transfers (from_account_id, to_account_id, amount, description, reference_id, created_at)
         VALUES ($1, $2, $3::numeric, $4, $5, $6) RETURNING id`,
        [ids.get(from), ids.get(to), (paise / 100).toFixed(2), description, `TRF-${String(i + 1).padStart(4, '0')}`, at],
      );
      const transferId = rows[0].id;
      await insert(ids.get(from)!, 'debit', paise, description, `transfer:${transferId}`, at, transferId);
      await insert(ids.get(to)!, 'credit', paise, description, `transfer:${transferId}`, at, transferId);
      balances.set(from, balances.get(from)! - paise);
      balances.set(to, balances.get(to)! + paise);
      transfers++;
    }

    // Balances are derived from the ledger itself, never from the simulation above.
    await client.query(`
      UPDATE accounts a
         SET balance = COALESCE((
               SELECT SUM(CASE t.type WHEN 'credit' THEN t.amount ELSE -t.amount END)
                 FROM transactions t WHERE t.account_id = a.id), 0)`);

    console.log(`seeded ${PROFILES.length} accounts, ${written} transactions, ${transfers} transfers`);
  });
}

seed(process.argv.includes('--reset') ? 'reset' : process.argv.includes('--if-empty') ? 'if-empty' : 'default')
  .catch((err) => {
    console.error('seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
